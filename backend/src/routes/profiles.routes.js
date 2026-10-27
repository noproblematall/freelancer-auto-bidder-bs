const express = require('express');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { runProfilePipeline } = require('../services/bidding/engine');
const { loadSharedProfile, serializeSharedProfile, parseSharedProfile, ALL_FIELDS } = require('../services/bidding/sharedProfile');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authMiddleware);

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

// POST /api/profiles — Create new profile
router.post('/', async (req, res, next) => {
  try {
    const {
      name, searchKeywords, jobIds, budgetMinFixed, budgetMaxFixed, budgetMinHourly, budgetMaxHourly, projectTypes,
      countries, excludedCountries, excludedRegions, countryExceptions, excludedCurrencies, languages,
      bidAmountStrategy, fixedBidAmount, fixedHourlyRate, bidPercentage,
      periodDaysStrategy, defaultPeriodDays, defaultHourlyRate, minPeriodDays, maxPeriodDays,
      milestonePercentage, minRelevanceScore, proposalPrompt, reviewMode,
      maxBidsPerHour, maxBidsPerDay, skillsSummary, experienceSummary, portfolioHighlights,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Profile name is required' });
    }

    if (bidAmountStrategy === 'fixed' && !fixedBidAmount) {
      return res.status(400).json({ error: 'Fixed bid amount is required when using fixed strategy' });
    }
    if (bidAmountStrategy === 'percentage' && !bidPercentage) {
      return res.status(400).json({ error: 'Bid percentage is required when using percentage strategy' });
    }

    // Validate milestone percentage
    if (milestonePercentage !== undefined && milestonePercentage !== null && milestonePercentage !== '') {
      const milestone = parseInt(milestonePercentage);
      if (isNaN(milestone) || milestone < 0 || milestone > 100) {
        return res.status(400).json({ error: 'Milestone percentage must be between 0 and 100' });
      }
    }

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
        projectTypes: projectTypes || 'both',
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
        bidAmountStrategy: bidAmountStrategy || 'auto',
        fixedBidAmount: fixedBidAmount ? parseFloat(fixedBidAmount) : null,
        fixedHourlyRate: fixedHourlyRate ? parseFloat(fixedHourlyRate) : null,
        bidPercentage: bidPercentage ? parseFloat(bidPercentage) : null,
        periodDaysStrategy: periodDaysStrategy || 'fixed',
        defaultPeriodDays: defaultPeriodDays ? parseInt(defaultPeriodDays) : 7,
        defaultHourlyRate: defaultHourlyRate ? parseFloat(defaultHourlyRate) : null,
        minPeriodDays: minPeriodDays ? parseInt(minPeriodDays) : null,
        maxPeriodDays: maxPeriodDays ? parseInt(maxPeriodDays) : null,
        milestonePercentage: (milestonePercentage !== undefined && milestonePercentage !== null && milestonePercentage !== '')
          ? parseInt(milestonePercentage)
          : 100,
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

// GET /api/profiles/shared — Settings applied to every profile (targeting + AI context)
router.get('/shared', async (req, res, next) => {
  try {
    res.json({ shared: await loadSharedProfile(req.userId) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/profiles/shared — Replace the shared settings
router.put('/shared', async (req, res, next) => {
  try {
    const body = req.body || {};
    for (const f of ['skillsSummary', 'experienceSummary', 'portfolioHighlights', 'languages']) {
      if (body[f] != null && typeof body[f] !== 'string') {
        return res.status(400).json({ error: `${f} must be a string` });
      }
    }
    if (body.reviewMode != null && typeof body.reviewMode !== 'boolean') {
      return res.status(400).json({ error: 'reviewMode must be a boolean' });
    }
    for (const f of ['countries', 'excludedCountries', 'excludedRegions', 'countryExceptions', 'excludedCurrencies']) {
      if (body[f] != null && !Array.isArray(body[f]) && typeof body[f] !== 'string') {
        return res.status(400).json({ error: `${f} must be an array` });
      }
    }

    const payload = {};
    for (const f of ALL_FIELDS) if (body[f] !== undefined) payload[f] = body[f];

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { sharedProfile: serializeSharedProfile(payload) },
      select: { sharedProfile: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.userId,
        action: 'shared_profile_updated',
        details: JSON.stringify({ fields: Object.keys(payload) }),
      },
    });

    logger.info('Shared profile settings updated');
    res.json({ shared: parseSharedProfile(user.sharedProfile) });
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
      name, searchKeywords, jobIds, budgetMinFixed, budgetMaxFixed, budgetMinHourly, budgetMaxHourly, projectTypes,
      countries, excludedCountries, excludedRegions, countryExceptions, excludedCurrencies, languages,
      bidAmountStrategy, fixedBidAmount, fixedHourlyRate, bidPercentage,
      periodDaysStrategy, defaultPeriodDays, defaultHourlyRate, minPeriodDays, maxPeriodDays,
      milestonePercentage, minRelevanceScore, proposalPrompt, reviewMode,
      maxBidsPerHour, maxBidsPerDay, skillsSummary, experienceSummary, portfolioHighlights,
    } = req.body;

    if (bidAmountStrategy === 'fixed' && !fixedBidAmount && !existing.fixedBidAmount) {
      return res.status(400).json({ error: 'Fixed bid amount is required when using fixed strategy' });
    }
    if (bidAmountStrategy === 'percentage' && !bidPercentage && !existing.bidPercentage) {
      return res.status(400).json({ error: 'Bid percentage is required when using percentage strategy' });
    }

    // Validate milestone percentage
    if (milestonePercentage !== undefined && milestonePercentage !== null && milestonePercentage !== '') {
      const milestone = parseInt(milestonePercentage);
      if (isNaN(milestone) || milestone < 0 || milestone > 100) {
        return res.status(400).json({ error: 'Milestone percentage must be between 0 and 100' });
      }
    }

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
    if (projectTypes !== undefined) data.projectTypes = projectTypes;
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
    if (bidAmountStrategy !== undefined) data.bidAmountStrategy = bidAmountStrategy;
    if (fixedBidAmount !== undefined) data.fixedBidAmount = fixedBidAmount ? parseFloat(fixedBidAmount) : null;
    if (fixedHourlyRate !== undefined) data.fixedHourlyRate = fixedHourlyRate ? parseFloat(fixedHourlyRate) : null;
    if (bidPercentage !== undefined) data.bidPercentage = bidPercentage ? parseFloat(bidPercentage) : null;
    if (periodDaysStrategy !== undefined) data.periodDaysStrategy = periodDaysStrategy;
    if (defaultPeriodDays !== undefined) data.defaultPeriodDays = parseInt(defaultPeriodDays);
    if (defaultHourlyRate !== undefined) data.defaultHourlyRate = defaultHourlyRate ? parseFloat(defaultHourlyRate) : null;
    if (minPeriodDays !== undefined) data.minPeriodDays = minPeriodDays ? parseInt(minPeriodDays) : null;
    if (maxPeriodDays !== undefined) data.maxPeriodDays = maxPeriodDays ? parseInt(maxPeriodDays) : null;
    if (milestonePercentage !== undefined) {
      data.milestonePercentage = (milestonePercentage !== null && milestonePercentage !== '')
        ? parseInt(milestonePercentage)
        : 100;
    }
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
