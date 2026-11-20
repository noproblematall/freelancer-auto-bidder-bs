const express = require('express');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const flClient = require('../middleware/freelancerClient');
const { loadJobFilters, serializeJobFilters, parseJobFilters, normalizeJobs, ALL_FIELDS } = require('../services/bidding/jobFilters');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authMiddleware);

// GET /api/job-filters/suggestions — the skills on the Freelancer profile and
// the ones the account has been hired for, as { id, name } for the skills picker.
router.get('/suggestions', flClient, async (req, res, next) => {
  try {
    const { data } = await req.flClient.get('/users/0.1/self/', { params: { jobs: true, reputation: true } });
    const r = data?.result || {};
    const profile = normalizeJobs(Array.isArray(r.jobs) ? r.jobs.map((j) => ({ id: j.id, name: j.name })) : []);
    const counts = Array.isArray(r.reputation?.job_history?.job_counts) ? r.reputation.job_history.job_counts : [];
    const hired = normalizeJobs(counts.filter((c) => c.job?.id).sort((a, b) => (b.count || 0) - (a.count || 0)).map((c) => ({ id: c.job.id, name: c.job.name })));
    res.json({ profile, hired });
  } catch (err) {
    next(err);
  }
});

// GET /api/job-filters — Account-wide project search filters (apply to every profile)
router.get('/', async (req, res, next) => {
  try {
    res.json({ filters: await loadJobFilters(req.userId) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/job-filters — Replace the filters
router.put('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (body.languages != null && typeof body.languages !== 'string') {
      return res.status(400).json({ error: 'languages must be a string' });
    }
    for (const f of ['countries', 'excludedCountries', 'excludedRegions', 'countryExceptions', 'excludedCurrencies']) {
      if (body[f] != null && !Array.isArray(body[f]) && typeof body[f] !== 'string') {
        return res.status(400).json({ error: `${f} must be an array` });
      }
    }
    if (body.keywords != null && typeof body.keywords !== 'string') {
      return res.status(400).json({ error: 'keywords must be a string' });
    }
    if (body.keywords && body.keywords.length > 500) {
      return res.status(400).json({ error: 'keywords must be 500 characters or fewer' });
    }
    if (body.jobs != null) {
      if (!Array.isArray(body.jobs)) return res.status(400).json({ error: 'jobs must be an array of { id, name }' });
      if (normalizeJobs(body.jobs).length !== body.jobs.length) return res.status(400).json({ error: 'Every skill needs a Freelancer job id' });
      if (body.jobs.length > 100) return res.status(400).json({ error: 'Pick at most 100 skills' });
    }

    const bounds = {};
    for (const f of ['budgetMinFixed', 'budgetMaxFixed', 'budgetMinHourly', 'budgetMaxHourly']) {
      if (body[f] === undefined) continue;
      if (body[f] === null || body[f] === '') { bounds[f] = null; continue; }
      const n = Number(body[f]);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: `${f} must be a number of 0 or more` });
      }
      bounds[f] = n;
    }
    if (bounds.budgetMinFixed != null && bounds.budgetMaxFixed != null && bounds.budgetMinFixed > bounds.budgetMaxFixed) {
      return res.status(400).json({ error: 'Fixed-price minimum budget cannot be greater than maximum' });
    }
    if (bounds.budgetMinHourly != null && bounds.budgetMaxHourly != null && bounds.budgetMinHourly > bounds.budgetMaxHourly) {
      return res.status(400).json({ error: 'Hourly minimum rate cannot be greater than maximum' });
    }

    const payload = {};
    for (const f of ALL_FIELDS) if (body[f] !== undefined) payload[f] = body[f];
    Object.assign(payload, bounds);

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { jobFilters: serializeJobFilters(payload) },
      select: { jobFilters: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.userId,
        action: 'job_filters_updated',
        details: JSON.stringify({ fields: Object.keys(payload) }),
      },
    });

    logger.info('Job filters updated');
    res.json({ filters: parseJobFilters(user.jobFilters) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
