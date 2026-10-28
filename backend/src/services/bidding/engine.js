const prisma = require('../../config/database');
const { decrypt, encrypt, willExpireSoon } = require('../../utils/tokenManager');
const { createFreelancerClient } = require('../freelancer/client');
const { refreshAccessToken } = require('../freelancer/auth');
const { searchProjects } = require('../freelancer/projects');
const { placeBid, sealBid, getBidById } = require('../freelancer/bids');
const { notifyBidPlaced, notifyBidError } = require('../notifications/telegram');
const { createOpenAIClient } = require('../openai/client');
const { convertFromUSD, roundHourlyRate } = require('../currency');
const { analyzeProject } = require('../openai/analyzer');
const { generateProposal } = require('../openai/proposalGenerator');
const { applySharedProfile } = require('./sharedProfile');
const logger = require('../../utils/logger');

/**
 * Errors matching these patterns mean the account needs manual intervention.
 * The scheduler will auto-pause (deactivate all profiles) when one is hit.
 */
const FATAL_ERROR_PATTERNS = [
  'you must reply to your awarded projects',
  'account has been suspended',
  'account has been banned',
  'account is suspended',
];

class FatalBidError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FatalBidError';
  }
}

// Log a user-facing problem to the activity feed at most once per window —
// the pipeline runs every minute, so unthrottled logging would flood the feed
// with the same "fix your key" row sixty times an hour.
async function logProblemOnce(userId, action, message, windowMs = 6 * 60 * 60 * 1000) {
  try {
    const recent = await prisma.activityLog.findFirst({
      where: { userId, action, createdAt: { gte: new Date(Date.now() - windowMs) } },
      select: { id: true },
    });
    if (recent) return;
    await prisma.activityLog.create({
      data: { userId, action, details: JSON.stringify({ message }) },
    });
  } catch (e) {
    logger.warn(`Failed to log ${action}: ${e.message}`);
  }
}

async function runProfilePipeline(profile, { profileIndex = 0, totalProfiles = 1 } = {}) {
  const results = { searched: 0, filtered: 0, analyzed: 0, qualified: 0, placed: 0, queued: 0, errors: 0, openaiError: null };

  // Fold the user's shared settings (targeting exclusions, skills/experience
  // context, …) into this profile so every step below sees the effective values.
  profile = await applySharedProfile(profile, profile.userId);

  // Step 1: Rate limit check — the caps are account-wide (Settings → Auto-Bidding)
  // and count bids from EVERY profile, so several active profiles share them.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const caps = await prisma.user.findUnique({
    where: { id: profile.userId },
    select: { maxBidsPerHour: true, maxBidsPerDay: true },
  });
  const maxBidsPerHour = caps?.maxBidsPerHour ?? 8;
  const maxBidsPerDay = caps?.maxBidsPerDay ?? 80;

  // Queued review drafts count against the caps too — otherwise a review-mode
  // profile on the 1-minute cron floods the queue (cap per RUN, not per window).
  const [bidsThisHour, bidsLast24h] = await Promise.all([
    prisma.bid.count({
      where: {
        userId: profile.userId,
        OR: [
          { status: 'placed', placedAt: { gte: oneHourAgo } },
          { status: 'pending_review', createdAt: { gte: oneHourAgo } },
        ],
      },
    }),
    prisma.bid.count({
      where: {
        userId: profile.userId,
        OR: [
          { status: 'placed', placedAt: { gte: last24Hours } },
          { status: 'pending_review', createdAt: { gte: last24Hours } },
        ],
      },
    }),
  ]);

  // Check if already at limits
  if (bidsThisHour >= maxBidsPerHour) {
    logger.info(`Profile "${profile.name}": account hourly limit reached (${bidsThisHour}/${maxBidsPerHour})`);
    return results;
  }
  if (bidsLast24h >= maxBidsPerDay) {
    logger.info(`Profile "${profile.name}": account daily limit reached (${bidsLast24h}/${maxBidsPerDay})`);
    return results;
  }

  // Calculate max bids allowed in this run (most restrictive of hourly/daily limits)
  const remainingThisHour = maxBidsPerHour - bidsThisHour;
  const remainingToday = maxBidsPerDay - bidsLast24h;
  const maxBidsThisRun = Math.min(remainingThisHour, remainingToday);

  logger.info(`Profile "${profile.name}" account rate limits: ${bidsThisHour}/${maxBidsPerHour} this hour, ${bidsLast24h}/${maxBidsPerDay} last 24h, max this run: ${maxBidsThisRun}`);

  // Step 2: Get clients
  const tokenRecord = await prisma.freelancerToken.findUnique({ where: { userId: profile.userId } });
  if (!tokenRecord) {
    logger.warn(`No Freelancer token for user ${profile.userId}`);
    return results;
  }

  const freelancerUid = parseInt(tokenRecord.freelancerUid);
  if (!tokenRecord.freelancerUid || isNaN(freelancerUid)) {
    logger.warn(`Invalid or missing Freelancer UID for user ${profile.userId} — re-authentication required`);
    return results;
  }

  // Load user (including per-user Freelancer API credentials) up front so the
  // refresh path below has everything it needs without a TDZ on `user`.
  const user = await prisma.user.findUnique({
    where: { id: profile.userId },
    select: {
      openaiApiKey: true,
      openaiModel: true,
      bidDelaySeconds: true,
      telegramBidNotificationsEnabled: true,
      telegramBotToken: true,
      telegramChatId: true,
      freelancerClientId: true,
      freelancerClientSecret: true,
      sealBids: true,
    },
  });

  // Resolve the plaintext access token — auto-refreshing if expired or expiring within 5 minutes
  let plainAccessToken = decrypt(tokenRecord.accessToken);
  if (willExpireSoon(tokenRecord.expiresAt)) {
    if (!tokenRecord.refreshToken) {
      logger.warn(`Freelancer token expired and no refresh token available for user ${profile.userId} — re-authentication required`);
      return results;
    }
    if (!user?.freelancerClientId || !user?.freelancerClientSecret) {
      logger.warn(`Freelancer token expired for user ${profile.userId} but no API credentials configured — re-authentication required`);
      return results;
    }
    try {
      logger.info(`Freelancer token expired/expiring for user ${profile.userId} — attempting auto-refresh`);
      let decryptedSecret;
      try {
        decryptedSecret = decrypt(user.freelancerClientSecret);
      } catch (e) {
        logger.error(`Failed to decrypt Freelancer client secret for user ${profile.userId}: ${e.message}`);
        return results;
      }
      const refreshed = await refreshAccessToken(decrypt(tokenRecord.refreshToken), {
        clientId: user.freelancerClientId,
        clientSecret: decryptedSecret,
      });
      const expiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000);
      await prisma.freelancerToken.update({
        where: { userId: profile.userId },
        data: {
          accessToken: encrypt(refreshed.access_token),
          refreshToken: refreshed.refresh_token ? encrypt(refreshed.refresh_token) : tokenRecord.refreshToken,
          expiresAt,
        },
      });
      // Log to audit trail (consistent with manual refresh endpoint)
      await prisma.activityLog.create({
        data: { userId: profile.userId, action: 'token_refreshed', details: JSON.stringify({ source: 'auto' }) },
      }).catch(e => logger.warn(`Failed to log token_refreshed: ${e.message}`));
      logger.info(`Freelancer token auto-refreshed for user ${profile.userId}, expires at ${expiresAt.toISOString()}`);
      plainAccessToken = refreshed.access_token;
    } catch (refreshErr) {
      const status = refreshErr.response?.status;
      const detail = refreshErr.response?.data ? JSON.stringify(refreshErr.response.data) : refreshErr.message;
      logger.error(`Freelancer token auto-refresh failed for user ${profile.userId}: HTTP ${status ?? 'N/A'} — ${detail} — re-authentication required`);
      // Surface in the activity feed — otherwise runs "complete" with 0 searched
      // and the user has no idea bidding is dead until they read log files.
      await logProblemOnce(profile.userId, 'token_refresh_failed',
        'Freelancer connection expired and could not be refreshed. Reconnect in Settings to resume bidding.');
      return results;
    }
  }

  const flClient = createFreelancerClient(plainAccessToken);

  if (!user?.openaiApiKey) {
    logger.warn(`No OpenAI API key for user ${profile.userId}`);
    await logProblemOnce(profile.userId, 'openai_not_configured',
      'No OpenAI API key configured — projects cannot be analyzed or bid on. Add your key in Settings.');
    return results;
  }
  const openai = createOpenAIClient(decrypt(user.openaiApiKey), user.openaiModel || 'gpt-5.4-mini');
  const bidDelayMs = (user?.bidDelaySeconds ?? 0) * 1000;

  // Resolve Telegram bid-notification config (loaded once per profile run)
  const tgBidEnabled = !!(user.telegramBidNotificationsEnabled && user.telegramBotToken && user.telegramChatId);
  const tgBotToken = tgBidEnabled ? decrypt(user.telegramBotToken) : null;
  const tgChatIds = tgBidEnabled
    ? user.telegramChatId.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  // Step 3: Search — newest projects first for fastest bidding
  const filters = { limit: 50, offset: 0, sortField: 'time_submitted' };
  if (profile.searchKeywords) filters.query = profile.searchKeywords;
  if (profile.jobIds) {
    try { filters.jobIds = JSON.parse(profile.jobIds); } catch (e) { logger.warn(`Profile "${profile.name}": failed to parse jobIds: ${e.message}`); }
  }
  // Note: Budget filtering is now done post-search based on project type
  // We set a wide budget range here to get more results, then filter by type-specific budgets
  const hasFixedBudget = profile.budgetMinFixed != null || profile.budgetMaxFixed != null;
  const hasHourlyBudget = profile.budgetMinHourly != null || profile.budgetMaxHourly != null;
  if (hasFixedBudget || hasHourlyBudget) {
    // Use the most permissive budget range for initial search
    const allMins = [profile.budgetMinFixed, profile.budgetMinHourly].filter(x => x != null);
    const allMaxs = [profile.budgetMaxFixed, profile.budgetMaxHourly].filter(x => x != null);
    if (allMins.length > 0) filters.minBudget = Math.min(...allMins);
    if (allMaxs.length > 0) filters.maxBudget = Math.max(...allMaxs);
  }
  if (profile.projectTypes && profile.projectTypes !== 'both') {
    filters.projectTypes = [profile.projectTypes];
  }
  if (profile.countries) {
    try { filters.countries = JSON.parse(profile.countries); } catch (e) { logger.warn(`Profile "${profile.name}": failed to parse countries: ${e.message}`); }
  }
  if (profile.languages) {
    // languages is a comma-separated string of codes (e.g. "en, es"), not JSON
    const langs = profile.languages.split(',').map(l => l.trim().toLowerCase()).filter(Boolean);
    if (langs.length) filters.languages = langs;
  }

  let searchResult;
  try {
    searchResult = await searchProjects(flClient, filters);
  } catch (err) {
    logger.error(`Search failed for profile "${profile.name}": ${err.message}`);
    results.errors++;
    return results;
  }

  const freelancerProjects = searchResult.projects || [];
  const searchUsers = searchResult.users || {};
  results.searched = freelancerProjects.length;

  if (freelancerProjects.length === 0) {
    logger.info(`Profile "${profile.name}": no projects found`);
    return results;
  }

  // Step 4: Filter — upsert to DB, resolve owner country from multiple sources
  const upsertedProjects = [];
  for (const p of freelancerProjects) {
    // Look up owner's user data from the search response users object
    const ownerUser = p.owner_id ? searchUsers[String(p.owner_id)] : null;

    // Log data sources on first project for debugging
    if (upsertedProjects.length === 0) {
      logger.info(`Sample project data sources: ${JSON.stringify({
        owner_info_country: p.owner_info?.country,
        owner_info_city: p.owner_info?.city,
        project_location: p.location,
        currency_country: p.currency?.country,
      })}`);
    }

    // Resolve country: owner_info.country (per Freelancer support) > project location > true_location > users map
    // Note: currency.country is NOT used — it returns zone codes like "EU" for Euro, not actual country codes
    const rawCountry = p.owner_info?.country?.code
      || p.location?.country?.code
      || p.true_location?.country?.code
      || ownerUser?.location?.country?.code
      || null;
    const ownerCountry = rawCountry ? rawCountry.toUpperCase() : null;

    const countrySource = p.owner_info?.country?.code ? 'owner_info.country'
      : p.location?.country?.code ? 'project.location'
      : p.true_location?.country?.code ? 'project.true_location'
      : ownerUser?.location?.country?.code ? 'users[owner].location'
      : 'none';
    logger.info(`Project #${p.id}: owner country = ${ownerCountry} (source: ${countrySource})`);

    // Store full location object for rich data: use owner_info city+country for richer data
    const ownerLocationObj = p.owner_info?.country
      ? { country: p.owner_info.country, city: p.owner_info.city || null }
      : p.location || p.true_location || null;
    const ownerLocation = ownerLocationObj ? JSON.stringify(ownerLocationObj) : null;

    const data = {
      freelancerProjectId: p.id,
      title: p.title || 'Untitled',
      description: p.preview_description || p.description || null,
      budgetMin: p.budget?.minimum ?? null,
      budgetMax: p.budget?.maximum ?? null,
      currency: p.currency?.code || 'USD',
      jobIds: p.jobs ? JSON.stringify(p.jobs.map(j => ({ id: j.id, name: j.name }))) : null,
      ownerId: p.owner_id ?? null,
      ownerCountry: ownerCountry,
      ownerLocation: ownerLocation,
      bidCount: p.bid_stats?.bid_count ?? 0,
      timeSubmitted: p.time_submitted ? new Date(p.time_submitted * 1000) : null,
      status: p.status || 'active',
      projectType: p.type || null,
      lastCheckedAt: new Date(),
    };

    const record = await prisma.project.upsert({
      where: { freelancerProjectId: p.id },
      update: data,
      create: data,
    });
    record.jobNames = p.jobs ? p.jobs.map(j => ({ id: j.id, name: j.name })) : [];
    upsertedProjects.push(record);
  }

  // Rescue orphaned projects: rows that were upserted in prior runs but never
  // analyzed. Each active profile searches Freelancer independently and only
  // sees its own top-50 by time_updated. Round-robin (`id % totalProfiles ===
  // profileIndex`) then assigns each project to exactly one profile. If the
  // fresh search that upserted a project came from a different profile than
  // the one round-robin assigns it to — and the assigned profile's own search
  // never returned it — the project is stranded: in the DB but never picked
  // up. Widening the candidate pool with recent still-unanalyzed rows lets the
  // assigned profile find them on a later cycle.
  {
    const RESCUE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
    const rescueSince = new Date(Date.now() - RESCUE_WINDOW_MS);
    const alreadyInPool = new Set(upsertedProjects.map(p => p.freelancerProjectId));
    const orphaned = await prisma.project.findMany({
      where: {
        aiAnalysis: null,
        status: 'active',
        discoveredAt: { gt: rescueSince },
        freelancerProjectId: { notIn: [...alreadyInPool] },
      },
      take: 100,
      orderBy: { discoveredAt: 'desc' },
    });
    if (orphaned.length > 0) {
      for (const r of orphaned) {
        try {
          const parsed = r.jobIds ? JSON.parse(r.jobIds) : [];
          r.jobNames = Array.isArray(parsed) ? parsed.map(j => typeof j === 'object' ? j : { id: j }) : [];
        } catch { r.jobNames = []; }
      }
      upsertedProjects.push(...orphaned);
      logger.info(`Profile "${profile.name}": rescued ${orphaned.length} unanalyzed project(s) from the last hour`);
    }
  }

  // Skip projects that already have ANY bid record for this user — placed,
  // queued for review, dismissed, cancelled, errored, all of it. A status
  // whitelist here caused review-mode drafts (pending_review) to be re-queued
  // on every run, duplicating the same project once a minute.
  const existingBids = await prisma.bid.findMany({
    where: {
      userId: profile.userId,
      projectId: { in: upsertedProjects.map(p => p.id) },
    },
    select: { projectId: true },
  });
  const bidProjectIds = new Set(existingBids.map(b => b.projectId));
  let newProjects = upsertedProjects.filter(p => !bidProjectIds.has(p.id));

  // Filter by excluded countries and regions
  {
    const { isCountryInExcludedRegion } = require('../../utils/regions');

    // Parse excluded countries list
    let excludedCountries = [];
    if (profile.excludedCountries) {
      try {
        const parsed = JSON.parse(profile.excludedCountries);
        excludedCountries = Array.isArray(parsed) ? parsed.map(c => c.toUpperCase()) : [];
      } catch (e) { logger.warn(`Profile "${profile.name}": failed to parse excludedCountries: ${e.message}`); }
    }

    // Parse excluded regions list
    let excludedRegions = [];
    if (profile.excludedRegions) {
      try {
        const parsed = JSON.parse(profile.excludedRegions);
        excludedRegions = Array.isArray(parsed) ? parsed : [];
      } catch (e) { logger.warn(`Profile "${profile.name}": failed to parse excludedRegions: ${e.message}`); }
    }

    // Parse country exceptions (always allowed even if region is excluded)
    let countryExceptions = new Set();
    if (profile.countryExceptions) {
      try {
        const parsed = JSON.parse(profile.countryExceptions);
        if (Array.isArray(parsed)) parsed.forEach(c => countryExceptions.add(c.toUpperCase()));
      } catch (e) { logger.warn(`Profile "${profile.name}": failed to parse countryExceptions: ${e.message}`); }
    }

    if (excludedCountries.length > 0 || excludedRegions.length > 0) {
      const excludedSet = new Set(excludedCountries);
      const beforeFilter = newProjects.length;

      newProjects = newProjects.filter(p => {
        if (!p.ownerCountry) return true; // include projects with unknown country
        const code = p.ownerCountry.toUpperCase();
        if (countryExceptions.has(code)) return true; // exception overrides everything
        if (excludedSet.has(code)) return false; // explicitly excluded country
        if (isCountryInExcludedRegion(code, excludedRegions)) return false; // region excluded
        return true;
      });

      const filtered = beforeFilter - newProjects.length;
      logger.info(`Profile "${profile.name}": filtered ${filtered} projects by country/region exclusions`);
    }

    // Parse excluded currencies list (ISO 4217 codes, uppercase)
    let excludedCurrencies = [];
    if (profile.excludedCurrencies) {
      try {
        const parsed = JSON.parse(profile.excludedCurrencies);
        excludedCurrencies = Array.isArray(parsed) ? parsed.map(c => String(c).toUpperCase()) : [];
      } catch (e) { logger.warn(`Profile "${profile.name}": failed to parse excludedCurrencies: ${e.message}`); }
    }

    if (excludedCurrencies.length > 0) {
      const excludedCurrencySet = new Set(excludedCurrencies);
      const beforeCurrencyFilter = newProjects.length;
      newProjects = newProjects.filter(p => {
        if (!p.currency) return true; // unknown currency — fail open
        return !excludedCurrencySet.has(String(p.currency).toUpperCase());
      });
      const filteredOut = beforeCurrencyFilter - newProjects.length;
      if (filteredOut > 0) {
        logger.info(`Profile "${profile.name}": filtered ${filteredOut} projects by excluded currencies (${excludedCurrencies.join(', ')})`);
      }
    }
  }

  // Filter by budget based on project type (fixed vs hourly)
  if (profile.budgetMinFixed || profile.budgetMaxFixed || profile.budgetMinHourly || profile.budgetMaxHourly) {
    const beforeBudgetFilter = newProjects.length;

    newProjects = newProjects.filter(p => {
      const isFixed = p.projectType === 'fixed';
      const isHourly = p.projectType === 'hourly';

      // If project type is unknown, include it (fail open)
      if (!isFixed && !isHourly) {
        logger.info(`Project #${p.id}: unknown type, including`);
        return true;
      }

      // Check against appropriate budget range
      if (isFixed) {
        // Min check: if profile has min set, pass if EITHER budgetMin OR budgetMax >= profile min
        // If profile has no min set, no lower bound (allow all)
        let minOk = true;
        if (profile.budgetMinFixed != null) {
          const minMeetsRequirement = p.budgetMin != null && p.budgetMin >= profile.budgetMinFixed;
          const maxMeetsRequirement = p.budgetMax != null && p.budgetMax >= profile.budgetMinFixed;
          minOk = minMeetsRequirement || maxMeetsRequirement;
        }

        // Max check: if profile has max set, project must have budgetMax <= it
        // If profile has no max set, no upper bound (allow all)
        // If project has no budgetMax, include it (fail open - limitless project)
        let maxOk = true;
        if (profile.budgetMaxFixed != null && p.budgetMax != null) {
          maxOk = p.budgetMax <= profile.budgetMaxFixed;
        }

        const passes = minOk && maxOk;
        logger.info(`Project #${p.id}: fixed-price $${p.budgetMin}-${p.budgetMax}, filter: $${profile.budgetMinFixed || '∞'}-${profile.budgetMaxFixed || '∞'}, passes: ${passes}`);
        return passes;
      }

      if (isHourly) {
        // Min check: if profile has min set, pass if EITHER budgetMin OR budgetMax >= profile min
        // If profile has no min set, no lower bound (allow all)
        let minOk = true;
        if (profile.budgetMinHourly != null) {
          const minMeetsRequirement = p.budgetMin != null && p.budgetMin >= profile.budgetMinHourly;
          const maxMeetsRequirement = p.budgetMax != null && p.budgetMax >= profile.budgetMinHourly;
          minOk = minMeetsRequirement || maxMeetsRequirement;
        }

        // Max check: if profile has max set, project must have budgetMax <= it
        // If profile has no max set, no upper bound (allow all)
        // If project has no budgetMax, include it (fail open - limitless project)
        let maxOk = true;
        if (profile.budgetMaxHourly != null && p.budgetMax != null) {
          maxOk = p.budgetMax <= profile.budgetMaxHourly;
        }

        const passes = minOk && maxOk;
        logger.info(`Project #${p.id}: hourly $${p.budgetMin}-${p.budgetMax}/hr, filter: $${profile.budgetMinHourly || '∞'}-${profile.budgetMaxHourly || '∞'}, passes: ${passes}`);
        return passes;
      }

      return false;
    });

    const budgetFiltered = beforeBudgetFilter - newProjects.length;
    logger.info(`Profile "${profile.name}": filtered ${budgetFiltered} projects by budget (fixed: $${profile.budgetMinFixed || '∞'}-${profile.budgetMaxFixed || '∞'}, hourly: $${profile.budgetMinHourly || '∞'}-${profile.budgetMaxHourly || '∞'}/hr)`);
  }

  // Pre-filter projects that already have a cached relevance score below the threshold.
  // These are genuinely irrelevant projects seen in prior runs — skip them to free up pipeline
  // slots for truly new candidates. Logged separately so the user can see real candidate counts.
  const staleFiltered = newProjects.filter(p =>
    p.aiAnalysis && p.relevanceScore != null && p.relevanceScore < profile.minRelevanceScore
  );
  newProjects = newProjects.filter(p =>
    !(p.aiAnalysis && p.relevanceScore != null && p.relevanceScore < profile.minRelevanceScore)
  );
  if (staleFiltered.length > 0) {
    logger.info(`Profile "${profile.name}": pre-filtered ${staleFiltered.length} stale projects (cached score < ${profile.minRelevanceScore}): ${staleFiltered.map(p => `#${p.id}(${p.relevanceScore})`).join(', ')}`);
  }

  results.filtered = newProjects.length;

  // When multiple profiles are active for the same user, distribute projects evenly
  // so each profile claims its own slice instead of the first profile taking all.
  // Uses project DB id modulo totalProfiles so the assignment is stable across runs.
  if (totalProfiles > 1) {
    const before = newProjects.length;
    newProjects = newProjects.filter(p => p.id % totalProfiles === profileIndex);
    logger.info(`Profile "${profile.name}" (slot ${profileIndex + 1}/${totalProfiles}): assigned ${newProjects.length}/${before} projects by round-robin`);
  }

  // Deduplicate by DB project id — Freelancer occasionally returns the same project
  // twice in a single search response, which would otherwise create two pending bids.
  const seenProjectIds = new Set();
  newProjects = newProjects.filter(p => {
    if (seenProjectIds.has(p.id)) return false;
    seenProjectIds.add(p.id);
    return true;
  });

  // Load converted client owner IDs for relevance score boost
  const convertedClientOwnerIds = new Set();
  try {
    const convertedClients = await prisma.client.findMany({
      where: { userId: profile.userId },
      select: { freelancerUserId: true },
    });
    convertedClients.forEach(c => convertedClientOwnerIds.add(c.freelancerUserId));
    if (convertedClientOwnerIds.size > 0) {
      logger.info(`Profile "${profile.name}": ${convertedClientOwnerIds.size} past client(s) will get +15 relevance boost`);
    }
  } catch (e) {
    logger.warn(`Profile "${profile.name}": failed to load past clients: ${e.message}`);
  }

  // Steps 5-10: Analyze, Qualify, Generate, Price, Place, Log
  let bidsPlacedThisRun = 0;

  for (const project of newProjects) {
    if (bidsPlacedThisRun >= maxBidsThisRun) break;

    let bidRecord = null;
    try {
      // Step 5: Use cached analysis if available, otherwise call OpenAI
      let analysis = null;
      if (project.aiAnalysis) {
        try {
          analysis = JSON.parse(project.aiAnalysis);
          logger.info(`Project #${project.id}: using cached analysis (relevance: ${analysis.relevance_score})`);
        } catch {
          analysis = null;
        }
      }
      if (!analysis) {
        try {
          analysis = await analyzeProject(openai, project, profile);
        } catch (analyzeErr) {
          logger.error(`analyzeProject failed for project #${project.id}: ${analyzeErr.message}`);
          results.errors++;
          if (!results.openaiError) results.openaiError = analyzeErr.message;
          continue;
        }
        await prisma.project.update({
          where: { id: project.id },
          data: { aiAnalysis: JSON.stringify(analysis), relevanceScore: analysis.relevance_score },
        });
      }
      results.analyzed++;

      // Apply +15 boost for past clients (capped at 100)
      if (project.ownerId && convertedClientOwnerIds.has(project.ownerId)) {
        const boosted = Math.min(100, analysis.relevance_score + 15);
        logger.info(`Project #${project.id}: past client boost applied (${analysis.relevance_score} → ${boosted})`);
        analysis = { ...analysis, relevance_score: boosted };
      }

      // Step 6: Qualify
      if (analysis.relevance_score < profile.minRelevanceScore) {
        logger.info(`Project #${project.id} below threshold (${analysis.relevance_score} < ${profile.minRelevanceScore})`);
        continue;
      }
      results.qualified++;

      // Step 7: Generate proposal
      let proposalText;
      try {
        ({ proposalText } = await generateProposal(openai, project, profile));
      } catch (err) {
        logger.error(`generateProposal failed for project #${project.id}: ${err.message}`);
        results.errors++;
        continue;
      }

      // Step 8: Price
      let bidAmount;
      let skipBudgetClamp = false;
      const isHourly = project.projectType === 'hourly';

      // Profile amounts are entered in USD; projects bid in their own currency.
      // Convert so "$50/hr" doesn't silently become £50/hr on a GBP project.
      // (Percentage strategy and AI suggestions are already in project currency.)
      const projectCurrency = project.currency || 'USD';

      // Fixed hourly rate override — always wins for hourly projects
      if (isHourly && profile.fixedHourlyRate > 0) {
        const conv = await convertFromUSD(profile.fixedHourlyRate, projectCurrency);
        // Snap converted hourly rates to the nearest 5 so we don't bid
        // awkward numbers like 71.02 CAD/hr.
        bidAmount = conv.converted ? roundHourlyRate(conv.amount) : conv.amount;
        skipBudgetClamp = true;
        logger.info(`Project #${project.id}: using fixed hourly rate $${profile.fixedHourlyRate} USD → ${bidAmount} ${projectCurrency}/hr${conv.converted ? ` (rate ${conv.rate}, rounded from ${conv.amount})` : ''} (ignoring project range ${project.budgetMin}-${project.budgetMax})`);
      } else if (profile.bidAmountStrategy === 'fixed') {
        if (profile.fixedBidAmount == null) {
          logger.warn(`Profile "${profile.name}": bidAmountStrategy='fixed' but fixedBidAmount is null — skipping project #${project.id}`);
          results.errors++;
          continue;
        }
        const conv = await convertFromUSD(profile.fixedBidAmount, projectCurrency);
        bidAmount = conv.amount;
        if (conv.converted) logger.info(`Project #${project.id}: fixed bid $${profile.fixedBidAmount} USD → ${bidAmount} ${projectCurrency} (rate ${conv.rate})`);
      } else if (profile.bidAmountStrategy === 'percentage' && project.budgetMax) {
        bidAmount = Math.round(project.budgetMax * (profile.bidPercentage / 100) * 100) / 100;
      } else if (isHourly && profile.defaultHourlyRate > 0) {
        // Hourly project (auto mode): bid at our hourly rate; clamp to client's range below
        const conv = await convertFromUSD(profile.defaultHourlyRate, projectCurrency);
        // Snap converted hourly rates to the nearest 5 (the budget clamp below
        // may still adjust into the client's range).
        bidAmount = conv.converted ? roundHourlyRate(conv.amount) : conv.amount;
        if (conv.converted) logger.info(`Project #${project.id}: hourly rate $${profile.defaultHourlyRate} USD → ${bidAmount} ${projectCurrency}/hr (rate ${conv.rate}, rounded from ${conv.amount})`);
      } else {
        bidAmount = analysis.suggested_bid_amount || project.budgetMin
          || (await convertFromUSD(50, projectCurrency)).amount;
      }
      // Clamp to client's budget range (skipped when using a fixed hourly rate override)
      if (!skipBudgetClamp) {
        if (project.budgetMin && bidAmount < project.budgetMin) bidAmount = project.budgetMin;
        if (project.budgetMax && bidAmount > project.budgetMax) bidAmount = project.budgetMax;
      }

      // Step 9: Place
      // Determine delivery period
      let periodDays = profile.defaultPeriodDays;
      if (profile.periodDaysStrategy === 'ai') {
        const aiDays = analysis.suggested_timeline_days > 0 ? analysis.suggested_timeline_days : 0;

        // Formula: budget / (8 * hourlyRate) — skipped for hourly-rate projects where budget = $/hr not total
        let formulaDays = 0;
        const isFixedPrice = !project.projectType || project.projectType === 'fixed';
        const budget = project.budgetMax || project.budgetMin;
        if (isFixedPrice && budget > 0 && profile.defaultHourlyRate > 0) {
          // Budget is in project currency; the hourly rate is USD — convert so
          // the day estimate isn't skewed on non-USD projects.
          const localRate = (await convertFromUSD(profile.defaultHourlyRate, projectCurrency)).amount;
          formulaDays = budget / (8 * localRate);
        }

        if (formulaDays > 0 && aiDays > 0) {
          // Formula is primary (90%), AI is secondary (10%)
          periodDays = Math.round(formulaDays * 0.90 + aiDays * 0.10);
        } else if (formulaDays > 0) {
          periodDays = Math.round(formulaDays);
        } else if (aiDays > 0) {
          periodDays = aiDays;
        }
        // else: keep defaultPeriodDays as fallback

        if (profile.minPeriodDays && periodDays < profile.minPeriodDays) periodDays = profile.minPeriodDays;
        if (profile.maxPeriodDays && periodDays > profile.maxPeriodDays) periodDays = profile.maxPeriodDays;
        if (periodDays < 1) periodDays = 1;

        logger.info(`Project #${project.id}: formula=${formulaDays.toFixed(1)}d, AI=${aiDays}d → period=${periodDays}d`);
      }

      // Validate and sanitize milestone percentage (0-100)
      let milestonePercentage = profile.milestonePercentage;
      if (typeof milestonePercentage !== 'number' || isNaN(milestonePercentage) || milestonePercentage < 0 || milestonePercentage > 100) {
        logger.warn(`Invalid milestonePercentage (${milestonePercentage}) in profile "${profile.name}", using default 100`);
        milestonePercentage = 100;
      }

      // Just-in-time duplicate guard: a run can span minutes (bid delays), so
      // re-check no bid record appeared for this project since the run's
      // initial exclusion query (e.g. a manual bid, or an overlapping run).
      const duplicate = await prisma.bid.findFirst({
        where: { userId: profile.userId, projectId: project.id },
        select: { id: true, status: true },
      });
      if (duplicate) {
        logger.info(`Project #${project.id}: bid #${duplicate.id} (${duplicate.status}) already exists — skipping duplicate`);
        continue;
      }

      // Review-and-send mode: queue the fully-priced draft for human approval
      // instead of placing it. The user approves (places) or dismisses it from
      // the Bids page. Queued drafts count toward this run's cap so a review
      // backlog can't grow unbounded.
      if (profile.reviewMode) {
        bidRecord = await prisma.bid.create({
          data: {
            userId: profile.userId,
            profileId: profile.id,
            projectId: project.id,
            amount: bidAmount,
            periodDays,
            milestonePercentage,
            proposalText,
            status: 'pending_review',
          },
        });
        prisma.activityLog.create({
          data: {
            userId: profile.userId,
            action: 'bid_queued_for_review',
            details: JSON.stringify({ bidId: bidRecord.id, projectId: project.id, profileId: profile.id, amount: bidAmount }),
          },
        }).catch(() => {});
        logger.info(`Project #${project.id}: queued for review (bid #${bidRecord.id}, $${bidAmount}) — review mode on`);
        results.queued++;
        bidsPlacedThisRun++;
        continue;
      }

      bidRecord = await prisma.bid.create({
        data: {
          userId: profile.userId,
          profileId: profile.id,
          projectId: project.id,
          amount: bidAmount,
          periodDays,
          milestonePercentage,
          proposalText,
          status: 'pending',
        },
      });

      // Wait before placing bid — simulates reading the project carefully and avoids
      // Freelancer's "bidding too fast" warning.
      // Use the project's posted time (timeSubmitted) to calculate remaining wait:
      //   if the project was posted more than bidDelay seconds ago, bid immediately.
      //   otherwise wait only the remaining portion of the delay.
      // A ±25% jitter is applied so bids don't all land at the exact same offset,
      // which would be a clear bot signal in Freelancer's bid timing analytics.
      if (bidDelayMs > 0) {
        const postedAt = project.timeSubmitted ? new Date(project.timeSubmitted).getTime() : null;
        const elapsedMs = postedAt ? Math.max(0, Date.now() - postedAt) : 0;
        const remainingMs = Math.max(0, bidDelayMs - elapsedMs);

        // Jitter: uniform random in [-25%, +25%] of the configured delay
        const jitterMs = (Math.random() * 0.5 - 0.25) * bidDelayMs;
        const waitMs = Math.max(0, remainingMs + jitterMs);

        if (waitMs > 0) {
          logger.info(`Project #${project.id} posted ${Math.round(elapsedMs / 1000)}s ago — waiting ${Math.round(waitMs / 1000)}s before bidding (jitter: ${jitterMs >= 0 ? '+' : ''}${Math.round(jitterMs / 1000)}s)...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        } else {
          logger.info(`Project #${project.id} posted ${Math.round(elapsedMs / 1000)}s ago — delay already elapsed, bidding immediately`);
        }
      }

      // After the delay, check the bid wasn't already placed manually (e.g. via "Bid Now").
      // If so, skip — placing again would create a duplicate bid on Freelancer.
      const currentBid = await prisma.bid.findUnique({ where: { id: bidRecord.id }, select: { status: true } });
      if (currentBid?.status !== 'pending') {
        logger.info(`Bid #${bidRecord.id} already ${currentBid?.status} during delay — skipping`);
        // Only count as placed if the user manually placed it during the delay
        if (currentBid?.status === 'placed' || currentBid?.status === 'converted') {
          results.placed++;
          bidsPlacedThisRun++;
        }
        continue;
      }

      try {
        const flResult = await placeBid(flClient, {
          projectId: project.freelancerProjectId,
          bidderId: freelancerUid,
          amount: bidAmount,
          period: periodDays,
          milestonePercentage,
          description: proposalText,
          sealed: !!user?.sealBids,
        });

        let sealedActual = !!flResult?.sealed;

        // Fallback: if sealing was requested but the POST didn't take, try the
        // PUT ?action=seal upgrade endpoint, then re-read the bid to verify.
        if (user?.sealBids && !sealedActual && flResult?.id) {
          logger.info(`Bid #${bidRecord.id}: POST sealed=true ignored — trying PUT ?action=seal fallback`);
          const sealRes = await sealBid(flClient, flResult.id);
          if (sealRes.ok) {
            try {
              const verified = await getBidById(flClient, flResult.id);
              sealedActual = !!verified?.sealed;
              if (sealedActual) {
                logger.info(`Bid #${bidRecord.id}: action=seal succeeded (verified sealed=true)`);
              } else {
                logger.warn(`Bid #${bidRecord.id}: action=seal returned 2xx but bid still shows sealed=false`);
              }
            } catch (vErr) {
              logger.warn(`Bid #${bidRecord.id}: could not verify seal status after PUT: ${vErr.message}`);
            }
          }
        }

        if (user?.sealBids && !sealedActual) {
          logger.warn(`Bid #${bidRecord.id}: sealing was requested but Freelancer's API did not apply it (POST and PUT ?action=seal both ineffective)`);
        }

        await prisma.bid.update({
          where: { id: bidRecord.id },
          data: {
            freelancerBidId: flResult.id,
            status: 'placed',
            placedAt: new Date(),
            sealed: sealedActual,
          },
        });

        // Step 10: Log success (non-fatal — bid is already placed)
        prisma.activityLog.create({
          data: {
            userId: profile.userId,
            action: 'bid_placed',
            details: JSON.stringify({
              bidId: bidRecord.id,
              projectId: project.id,
              profileId: profile.id,
              amount: bidAmount,
              freelancerBidId: flResult.id,
            }),
          },
        }).catch(logErr => logger.warn(`activityLog.create failed for bid #${bidRecord.id}: ${logErr.message}`));

        results.placed++;
        bidsPlacedThisRun++;
        logger.info(`Auto-bid placed: project #${project.id}, $${bidAmount}, profile "${profile.name}"`);

        // Telegram bid-placed notification
        if (tgBidEnabled) {
          const projectUrl = `https://www.freelancer.com/projects/${project.freelancerProjectId}`;
          for (const chatId of tgChatIds) {
            notifyBidPlaced({
              botToken: tgBotToken, chatId,
              projectTitle: project.title, projectUrl,
              amount: bidAmount, currency: project.currency,
              profileName: profile.name,
            }).catch((err) => logger.warn(`Telegram bid-placed notification failed: ${err.message}`));
          }
        }

      } catch (placeErr) {
        await prisma.bid.update({
          where: { id: bidRecord.id },
          data: { status: 'error', errorMessage: placeErr.message },
        });

        await prisma.activityLog.create({
          data: {
            userId: profile.userId,
            action: 'bid_error',
            details: JSON.stringify({
              bidId: bidRecord.id,
              projectId: project.id,
              profileId: profile.id,
              error: placeErr.message,
            }),
          },
        });

        results.errors++;
        logger.error(`Auto-bid failed: project #${project.id}, error: ${placeErr.message}`);

        // Telegram bid-error notification
        if (tgBidEnabled) {
          const projectUrl = `https://www.freelancer.com/projects/${project.freelancerProjectId}`;
          for (const chatId of tgChatIds) {
            notifyBidError({
              botToken: tgBotToken, chatId,
              projectTitle: project.title, projectUrl,
              errorMessage: placeErr.message,
              profileName: profile.name,
            }).catch((err) => logger.warn(`Telegram bid-error notification failed: ${err.message}`));
          }
        }

        // If this is a fatal account-level error, escalate so the scheduler can pause.
        const normalized = placeErr.message.toLowerCase();
        if (FATAL_ERROR_PATTERNS.some(p => normalized.includes(p))) {
          throw new FatalBidError(placeErr.message);
        }
      }
    } catch (err) {
      // FatalBidError must propagate so the scheduler can pause.
      if (err instanceof FatalBidError) throw err;

      results.errors++;
      logger.error(`Pipeline error for project #${project.id}: ${err.message}`);
      // If bidRecord was created before the error, mark it as failed so it doesn't
      // stay in 'pending' indefinitely.
      if (bidRecord) {
        prisma.bid.update({
          where: { id: bidRecord.id },
          data: { status: 'error', errorMessage: err.message },
        }).catch(dbErr => logger.warn(`Failed to mark bid #${bidRecord.id} as error: ${dbErr.message}`));
      }
    }
  }

  return results;
}

module.exports = { runProfilePipeline, FatalBidError };
