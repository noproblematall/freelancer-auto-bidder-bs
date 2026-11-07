const express = require('express');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { runProfilePipeline } = require('../services/bidding/engine');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authMiddleware);

// Every /:id route expects a numeric profile id. Anything else (e.g. a stale
// link to a removed sub-path) is a plain 404, not a Prisma error.
router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).json({ error: 'Profile not found' });
  next();
});

// Helper function to convert comma-separated string to JSON array string
function parseCommaSeparated(str) {
  if (!str || (typeof str === 'string' && !str.trim())) return null;
  const items = str.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
  return items.length > 0 ? JSON.stringify(items) : null;
}

// Serialize an array of country codes (uppercased) to JSON string for DB
function serializeArray(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const items = value.map(s => String(s).trim().toUpperCase()).filter(s => s.length > 0);
    return items.length > 0 ? JSON.stringify(items) : null;
  }
  return parseCommaSeparated(value);
}

// Serialize an array of region keys (case-preserved) to JSON string for DB
function serializeRegions(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const items = value.map(s => String(s).trim()).filter(s => s.length > 0);
    return items.length > 0 ? JSON.stringify(items) : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const items = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
    return items.length > 0 ? JSON.stringify(items) : null;
  }
  return null;
}

// Parse a DB JSON string to an array for the frontend
function parseToArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Legacy comma-separated string
    return value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  }
}

// Parse region keys — always lowercase
function parseToRegions(value) {
  return parseToArray(value).map(s => s.toLowerCase());
}

// Format a raw Prisma profile for API responses (parse JSON array fields)
function formatProfile(p, bidCount = undefined) {
  return {
    ...p,
    ...(bidCount !== undefined ? { bidCount } : {}),
    countries: parseToArray(p.countries),
    excludedCountries: parseToArray(p.excludedCountries),
    excludedRegions: parseToRegions(p.excludedRegions),
    countryExceptions: parseToArray(p.countryExceptions),
    excludedCurrencies: parseToArray(p.excludedCurrencies),
  };
}

// GET /api/profiles — List user's bidding profiles
router.get('/', async (req, res, next) => {
  try {
    const profiles = await prisma.biddingProfile.findMany({
      where: { userId: req.userId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });

    // Per-profile performance in ONE query (replaces the old per-profile count
    // loop): bids grouped by profile and status → placed/converted/etc counts
    // and a conversion rate, so profiles can be compared and tuned.
    const statusRows = await prisma.bid.groupBy({
      by: ['profileId', 'status'],
      where: { userId: req.userId, profileId: { not: null } },
      _count: { _all: true },
    });
    const statsByProfile = {};
    for (const row of statusRows) {
      const s = (statsByProfile[row.profileId] ||= { total: 0, placed: 0, converted: 0, error: 0, pendingReview: 0 });
      const n = row._count._all;
      s.total += n;
      if (row.status === 'placed') s.placed += n;
      else if (row.status === 'converted') s.converted += n;
      else if (row.status === 'error') s.error += n;
      else if (row.status === 'pending_review') s.pendingReview += n;
    }

    const profilesWithCounts = profiles.map((p) => {
      const s = statsByProfile[p.id] || { total: 0, placed: 0, converted: 0, error: 0, pendingReview: 0 };
      // "Delivered" bids = placed + converted (converted bids were placed first;
      // the status just moved on). Conversion = client replied / delivered.
      const delivered = s.placed + s.converted;
      return {
        ...formatProfile(p, s.total),
        stats: {
          ...s,
          delivered,
          conversionRate: delivered > 0 ? Math.round((s.converted / delivered) * 100) : null,
        },
      };
    });

    res.json({ profiles: profilesWithCounts });
  } catch (err) {
    next(err);
  }
});

// Per-kind bidding parameters. Checks the values that will end up stored: the
// request value, else the existing row (updates), else the column default.
// Returns an error message, or null when everything is consistent.
const { FIXED_BID_STRATEGIES, HOURLY_RATE_STRATEGIES, PERIOD_STRATEGIES } = require('../services/bidding/pricing');
function validateBiddingParams(body, existing = {}) {
  const pick = (key, fallback) => (body[key] !== undefined ? body[key] : (existing[key] !== undefined ? existing[key] : fallback));
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

  const fixedBidStrategy = pick('fixedBidStrategy', 'ai');
  if (!FIXED_BID_STRATEGIES.includes(fixedBidStrategy)) return 'Invalid fixed-price bid strategy';
  if (fixedBidStrategy === 'percentage') {
    const pct = num(pick('bidPercentage', null));
    if (!(pct > 0 && pct <= 100)) return 'Bid percentage must be between 1 and 100';
  }

  const hourlyRateStrategy = pick('hourlyRateStrategy', 'my_rate');
  if (!HOURLY_RATE_STRATEGIES.includes(hourlyRateStrategy)) return 'Invalid hourly rate strategy';

  for (const [kind, label] of [['fixed', 'Fixed-price'], ['hourly', 'Hourly']]) {
    const strategy = pick(`${kind}PeriodStrategy`, 'ai');
    if (!PERIOD_STRATEGIES.includes(strategy)) return `Invalid ${label.toLowerCase()} delivery period strategy`;
  }

  return null;
}

// POST /api/profiles — Create new profile
router.post('/', async (req, res, next) => {
  try {
    const {
      name, searchKeywords, jobIds, budgetMinFixed, budgetMaxFixed, budgetMinHourly, budgetMaxHourly,
      countries, excludedCountries, excludedRegions, countryExceptions, excludedCurrencies, languages,
      fixedBidStrategy, bidPercentage,
      fixedPeriodStrategy,
      hourlyRateStrategy,
      hourlyPeriodStrategy,
      minRelevanceScore, proposalPrompt, reviewMode,
      maxBidsPerHour, maxBidsPerDay, skillsSummary, experienceSummary, portfolioHighlights,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Profile name is required' });
    }

    const biddingError = validateBiddingParams(req.body);
    if (biddingError) return res.status(400).json({ error: biddingError });

    // Validate budget ranges
    if (budgetMinFixed && budgetMaxFixed && parseFloat(budgetMinFixed) > parseFloat(budgetMaxFixed)) {
      return res.status(400).json({ error: 'Fixed-price minimum budget cannot be greater than maximum' });
    }
    if (budgetMinHourly && budgetMaxHourly && parseFloat(budgetMinHourly) > parseFloat(budgetMaxHourly)) {
      return res.status(400).json({ error: 'Hourly minimum budget cannot be greater than maximum' });
    }

    const profile = await prisma.biddingProfile.create({
      data: {
        userId: req.userId,
        name: name.trim(),
        searchKeywords: searchKeywords || null,
        jobIds: jobIds || null,
        budgetMinFixed: budgetMinFixed ? parseFloat(budgetMinFixed) : null,
        budgetMaxFixed: budgetMaxFixed ? parseFloat(budgetMaxFixed) : null,
        budgetMinHourly: budgetMinHourly ? parseFloat(budgetMinHourly) : null,
        budgetMaxHourly: budgetMaxHourly ? parseFloat(budgetMaxHourly) : null,
        countries: serializeArray(countries),
        excludedCountries: serializeArray(excludedCountries),
        excludedRegions: serializeRegions(excludedRegions),
        countryExceptions: serializeArray(countryExceptions),
        excludedCurrencies: serializeArray(
          Array.isArray(excludedCurrencies)
            ? excludedCurrencies.map(c => typeof c === 'string' ? c.trim().toUpperCase() : c).filter(Boolean)
            : excludedCurrencies
        ),
        languages: languages || null,
        // Fixed-price projects
        fixedBidStrategy: fixedBidStrategy || 'ai',
        bidPercentage: bidPercentage ? parseFloat(bidPercentage) : null,
        fixedPeriodStrategy: fixedPeriodStrategy || 'ai',
        // Hourly projects
        hourlyRateStrategy: hourlyRateStrategy || 'my_rate',
        hourlyPeriodStrategy: hourlyPeriodStrategy || 'ai',
        minRelevanceScore: minRelevanceScore ? parseInt(minRelevanceScore) : 70,
        proposalPrompt: proposalPrompt || null,
        reviewMode: reviewMode === true,
        maxBidsPerHour: parseInt(maxBidsPerHour) || 8,
        maxBidsPerDay: parseInt(maxBidsPerDay) || 80,
        skillsSummary: skillsSummary || null,
        experienceSummary: experienceSummary || null,
        portfolioHighlights: portfolioHighlights || null,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.userId,
        action: 'profile_created',
        details: JSON.stringify({ profileId: profile.id, name: profile.name }),
      },
    });

    logger.info(`Profile created: "${profile.name}" (id: ${profile.id})`);
    res.status(201).json({ profile: formatProfile(profile, 0) });
  } catch (err) {
    next(err);
  }
});

// GET /api/profiles/:id — Get profile
router.get('/:id', async (req, res, next) => {
  try {
    const profile = await prisma.biddingProfile.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const bidCount = await prisma.bid.count({ where: { profileId: profile.id } });
    res.json({ profile: formatProfile(profile, bidCount) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/profiles/:id — Update profile
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.biddingProfile.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Profile not found' });

    const {
      name, searchKeywords, jobIds, budgetMinFixed, budgetMaxFixed, budgetMinHourly, budgetMaxHourly,
      countries, excludedCountries, excludedRegions, countryExceptions, excludedCurrencies, languages,
      fixedBidStrategy, bidPercentage,
      fixedPeriodStrategy,
      hourlyRateStrategy,
      hourlyPeriodStrategy,
      minRelevanceScore, proposalPrompt, reviewMode,
      maxBidsPerHour, maxBidsPerDay, skillsSummary, experienceSummary, portfolioHighlights,
    } = req.body;

    const biddingError = validateBiddingParams(req.body, existing);
    if (biddingError) return res.status(400).json({ error: biddingError });

    // Validate budget ranges (check final values after merge)
    const finalMinFixed = budgetMinFixed !== undefined ? (budgetMinFixed ? parseFloat(budgetMinFixed) : null) : existing.budgetMinFixed;
    const finalMaxFixed = budgetMaxFixed !== undefined ? (budgetMaxFixed ? parseFloat(budgetMaxFixed) : null) : existing.budgetMaxFixed;
    const finalMinHourly = budgetMinHourly !== undefined ? (budgetMinHourly ? parseFloat(budgetMinHourly) : null) : existing.budgetMinHourly;
    const finalMaxHourly = budgetMaxHourly !== undefined ? (budgetMaxHourly ? parseFloat(budgetMaxHourly) : null) : existing.budgetMaxHourly;

    if (finalMinFixed != null && finalMaxFixed != null && finalMinFixed > finalMaxFixed) {
      return res.status(400).json({ error: 'Fixed-price minimum budget cannot be greater than maximum' });
    }
    if (finalMinHourly != null && finalMaxHourly != null && finalMinHourly > finalMaxHourly) {
      return res.status(400).json({ error: 'Hourly minimum budget cannot be greater than maximum' });
    }

    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (searchKeywords !== undefined) data.searchKeywords = searchKeywords || null;
    if (jobIds !== undefined) data.jobIds = jobIds || null;
    if (budgetMinFixed !== undefined) data.budgetMinFixed = budgetMinFixed ? parseFloat(budgetMinFixed) : null;
    if (budgetMaxFixed !== undefined) data.budgetMaxFixed = budgetMaxFixed ? parseFloat(budgetMaxFixed) : null;
    if (budgetMinHourly !== undefined) data.budgetMinHourly = budgetMinHourly ? parseFloat(budgetMinHourly) : null;
    if (budgetMaxHourly !== undefined) data.budgetMaxHourly = budgetMaxHourly ? parseFloat(budgetMaxHourly) : null;
    if (countries !== undefined) data.countries = serializeArray(countries);
    if (excludedCountries !== undefined) data.excludedCountries = serializeArray(excludedCountries);
    if (excludedRegions !== undefined) data.excludedRegions = serializeRegions(excludedRegions);
    if (countryExceptions !== undefined) data.countryExceptions = serializeArray(countryExceptions);
    if (excludedCurrencies !== undefined) {
      data.excludedCurrencies = serializeArray(
        Array.isArray(excludedCurrencies)
          ? excludedCurrencies.map(c => typeof c === 'string' ? c.trim().toUpperCase() : c).filter(Boolean)
          : excludedCurrencies
      );
    }
    if (languages !== undefined) data.languages = languages || null;
    // Fixed-price projects
    if (fixedBidStrategy !== undefined) data.fixedBidStrategy = fixedBidStrategy;
    if (bidPercentage !== undefined) data.bidPercentage = bidPercentage ? parseFloat(bidPercentage) : null;
    if (fixedPeriodStrategy !== undefined) data.fixedPeriodStrategy = fixedPeriodStrategy;
    // Hourly projects
    if (hourlyRateStrategy !== undefined) data.hourlyRateStrategy = hourlyRateStrategy;
    if (hourlyPeriodStrategy !== undefined) data.hourlyPeriodStrategy = hourlyPeriodStrategy;
    if (minRelevanceScore !== undefined) data.minRelevanceScore = parseInt(minRelevanceScore);
    if (proposalPrompt !== undefined) data.proposalPrompt = proposalPrompt || null;
    if (reviewMode !== undefined) data.reviewMode = reviewMode === true;
    if (maxBidsPerHour !== undefined) data.maxBidsPerHour = parseInt(maxBidsPerHour) || existing.maxBidsPerHour;
    if (maxBidsPerDay !== undefined) data.maxBidsPerDay = parseInt(maxBidsPerDay) || existing.maxBidsPerDay;
    if (skillsSummary !== undefined) data.skillsSummary = skillsSummary || null;
    if (experienceSummary !== undefined) data.experienceSummary = experienceSummary || null;
    if (portfolioHighlights !== undefined) data.portfolioHighlights = portfolioHighlights || null;

    const profile = await prisma.biddingProfile.update({
      where: { id: existing.id },
      data,
    });

    const bidCount = await prisma.bid.count({ where: { profileId: profile.id } });
    logger.info(`Profile updated: "${profile.name}" (id: ${profile.id})`);
    res.json({ profile: formatProfile(profile, bidCount) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/profiles/:id — Delete profile
router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.biddingProfile.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Profile not found' });

    await prisma.biddingProfile.delete({ where: { id: existing.id } });
    logger.info(`Profile deleted: "${existing.name}" (id: ${existing.id})`);
    res.json({ message: 'Profile deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/profiles/:id/duplicate — Duplicate a profile
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const existing = await prisma.biddingProfile.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Profile not found' });

    const { id, createdAt, updatedAt, isActive, ...fields } = existing;

    const duplicate = await prisma.biddingProfile.create({
      data: {
        ...fields,
        name: `Copy of ${existing.name}`,
        isActive: false,
      },
    });

    logger.info(`Profile duplicated: "${existing.name}" → "${duplicate.name}" (id: ${duplicate.id})`);
    res.status(201).json({ profile: formatProfile(duplicate, 0) });
  } catch (err) {
    next(err);
  }
});

// POST /api/profiles/:id/activate — Enable auto-bidding
router.post('/:id/activate', async (req, res, next) => {
  try {
    const existing = await prisma.biddingProfile.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Profile not found' });

    const profile = await prisma.biddingProfile.update({
      where: { id: existing.id },
      data: { isActive: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.userId,
        action: 'profile_activated',
        details: JSON.stringify({ profileId: profile.id, name: profile.name }),
      },
    });

    logger.info(`Profile activated: "${profile.name}"`);
    res.json({ profile: formatProfile(profile) });

    // Trigger immediate pipeline run in the background (don't block response)
    runProfilePipeline(profile)
      .then(results => logger.info(`Immediate run for "${profile.name}": placed=${results.placed}, errors=${results.errors}`))
      .catch(err => logger.error(`Immediate run for "${profile.name}" failed: ${err.message}`));
  } catch (err) {
    next(err);
  }
});

// POST /api/profiles/:id/deactivate — Disable auto-bidding
router.post('/:id/deactivate', async (req, res, next) => {
  try {
    const existing = await prisma.biddingProfile.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Profile not found' });

    const profile = await prisma.biddingProfile.update({
      where: { id: existing.id },
      data: { isActive: false },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.userId,
        action: 'profile_deactivated',
        details: JSON.stringify({ profileId: profile.id, name: profile.name }),
      },
    });

    logger.info(`Profile deactivated: "${profile.name}"`);
    res.json({ profile: formatProfile(profile) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
