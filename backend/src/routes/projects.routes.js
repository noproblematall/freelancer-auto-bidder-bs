const express = require('express');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const flClient = require('../middleware/freelancerClient');
const { searchProjects, getProjectById, getJobs } = require('../services/freelancer/projects');
const { createOpenAIClient } = require('../services/openai/client');
const { analyzeProject } = require('../services/openai/analyzer');
const { generateProposal } = require('../services/openai/proposalGenerator');
const { applyAccountSettings, loadJobFilters, matchesJobFilters, jobFiltersWhere, languageList } = require('../services/bidding/jobFilters');
const { decrypt } = require('../utils/tokenManager');
const { projectDataFromApi, forPrisma } = require('../services/freelancer/projectMapper');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authMiddleware);

// Upsert projects from Freelancer API into local DB (same mapping as the
// bidding engine, including the employer facts and client score).
async function upsertProjects(freelancerProjects, users = {}) {
  const upserted = [];
  for (const p of freelancerProjects) {
    const data = forPrisma(projectDataFromApi(p, users));

    const record = await prisma.project.upsert({
      where: { freelancerProjectId: p.id },
      update: data,
      create: data,
    });
    record.jobNames = data.jobIds ? JSON.parse(data.jobIds) : [];
    upserted.push(record);
  }
  return upserted;
}

// POST /api/projects/search — Search Freelancer API, upsert to DB
router.post('/search', flClient, async (req, res, next) => {
  try {
    const { query, projectTypes, minBudget, maxBudget, jobIds, limit, offset } = req.body;

    // The account's Job Filters apply here as they do to automatic bidding:
    // Freelancer is asked only for the chosen languages and allowed countries,
    // and the rest (exclusions, currencies, budgets) is checked on the results.
    const jobFilters = await loadJobFilters(req.userId);
    const filterLanguages = languageList(jobFilters.languages);
    const countries = jobFilters.countries.length > 0 ? jobFilters.countries : req.body.countries;
    const languages = filterLanguages.length > 0 ? filterLanguages : req.body.languages;
    // Kind of work from the Job Filters unless the search names its own
    const searchJobIds = Array.isArray(jobIds) && jobIds.length > 0 ? jobIds : jobFilters.jobs.map((j) => j.id);
    const searchQuery = (typeof query === 'string' && query.trim()) || jobFilters.keywords || undefined;

    const result = await searchProjects(req.flClient, {
      query: searchQuery, projectTypes, minBudget, maxBudget, jobIds: searchJobIds, countries, languages,
      limit: limit || 20,
      offset: offset || 0,
    });

    const found = await upsertProjects(result.projects || [], result.users || {});
    const projects = found.filter(p => matchesJobFilters(p, jobFilters));

    res.json({
      projects,
      hiddenCount: found.length - projects.length,
      totalCount: result.total_count || 0,
      offset: offset || 0,
      limit: limit || 20,
    });
  } catch (err) {
    logger.error('Project search failed', err.message);
    next(err);
  }
});

// GET /api/projects — List from local DB
router.get('/', async (req, res, next) => {
  try {
    const {
      status, minBudget, maxBudget, projectType, search,
      sortBy = 'discoveredAt', sortOrder = 'desc',
      limit = '20', offset = '0',
    } = req.query;

    const where = {};
    if (status) where.status = status;
    if (projectType && projectType !== 'both') where.projectType = projectType;
    if (minBudget) where.budgetMax = { gte: parseFloat(minBudget) };
    if (maxBudget) where.budgetMin = { lte: parseFloat(maxBudget) };
    // SQLite LIKE is case-insensitive for ASCII by default, but Prisma's
    // `contains` compiles to LIKE '%term%' which is already case-insensitive
    // on SQLite. Search both title and description.
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    // Only projects that pass the account's Job Filters are listed. The count
    // of the ones left out is returned so the page can say so.
    const unfilteredWhere = { ...where };
    const filterConditions = jobFiltersWhere(await loadJobFilters(req.userId));
    if (filterConditions.length > 0) where.AND = filterConditions;

    const allowedSorts = ['discoveredAt', 'budgetMax', 'bidCount', 'relevanceScore', 'timeSubmitted'];
    const orderField = allowedSorts.includes(sortBy) ? sortBy : 'discoveredAt';

    const [rawProjects, totalCount, unfilteredCount] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: { [orderField]: sortOrder === 'asc' ? 'asc' : 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
        // The account's latest bid on each project, so the list can show its status,
        // and the bid that won the project once it is known
        include: {
          winningBid: true,
          bids: {
            where: { userId: req.userId },
            orderBy: { id: 'desc' },
            take: 1,
            select: { id: true, status: true, awardStatus: true, amount: true, placedAt: true, createdAt: true, clientRepliedAt: true, followUpAt: true, errorMessage: true },
          },
        },
      }),
      prisma.project.count({ where }),
      filterConditions.length > 0 ? prisma.project.count({ where: unfilteredWhere }) : null,
    ]);
    const hiddenCount = unfilteredCount == null ? 0 : Math.max(0, unfilteredCount - totalCount);

    // Parse stored job data so frontend gets jobNames
    const projects = rawProjects.map(p => {
      try {
        const parsed = p.jobIds ? JSON.parse(p.jobIds) : [];
        p.jobNames = Array.isArray(parsed) ? parsed.map(j => typeof j === 'object' ? j : { id: j }) : [];
      } catch {
        p.jobNames = [];
      }
      p.bid = p.bids?.[0] || null;
      delete p.bids;
      return p;
    });

    res.json({
      projects,
      totalCount,
      hiddenCount,
      offset: parseInt(offset),
      limit: parseInt(limit),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/jobs — Freelancer jobs/skills list
router.get('/jobs', flClient, async (req, res, next) => {
  try {
    const jobIds = req.query.jobIds ? req.query.jobIds.split(',').map(Number) : null;
    const result = await getJobs(req.flClient, jobIds);
    res.json({ jobs: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id — Single project from DB
router.get('/:id', async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: parseInt(req.params.id) },
      // The account's latest bid on the project, in full, for the project page
      include: {
        bids: {
          where: { userId: req.userId },
          orderBy: { id: 'desc' },
          take: 1,
          select: {
            id: true, status: true, awardStatus: true, amount: true, periodDays: true, proposalText: true, sealed: true,
            placedAt: true, createdAt: true, clientRepliedAt: true, followUpAt: true, errorMessage: true,
            profile: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.bid = project.bids?.[0] || null;
    delete project.bids;
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id/detail — Fetch fresh from Freelancer API
router.get('/:id/detail', flClient, async (req, res, next) => {
  try {
    const localProject = await prisma.project.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!localProject) return res.status(404).json({ error: 'Project not found' });

    const result = await getProjectById(req.flClient, localProject.freelancerProjectId);

    // Resolve country from fresh API data (owner_info.country is the correct source per Freelancer support)
    const rawFreshCountry = result.owner_info?.country?.code
      || result.location?.country?.code
      || result.true_location?.country?.code
      || localProject.ownerCountry;
    const freshOwnerCountry = rawFreshCountry ? rawFreshCountry.toUpperCase() : null;
    const freshLocationObj = result.owner_info?.country
      ? { country: result.owner_info.country, city: result.owner_info.city || null }
      : result.location || result.true_location || null;
    const freshOwnerLocation = freshLocationObj
      ? JSON.stringify(freshLocationObj)
      : localProject.ownerLocation;

    const updated = await prisma.project.update({
      where: { id: localProject.id },
      data: {
        description: result.description || result.preview_description || localProject.description,
        bidCount: result.bid_stats?.bid_count ?? localProject.bidCount,
        status: result.status || localProject.status,
        lastCheckedAt: new Date(),
        ownerCountry: freshOwnerCountry,
        ownerLocation: freshOwnerLocation,
      },
    });

    res.json({
      project: updated,
      owner: result.owner_info || result.owner || null,
      fullDescription: result.description || result.preview_description || null,
    });
  } catch (err) {
    next(err);
  }
});

// Helper: get user's OpenAI client from their encrypted API key
async function getUserOpenAIClient(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { openaiApiKey: true, openaiModel: true },
  });
  if (!user?.openaiApiKey) return null;
  const apiKey = decrypt(user.openaiApiKey);
  return createOpenAIClient(apiKey, user.openaiModel || 'gpt-5.4-mini');
}

// Helper: parse jobNames from project's jobIds field
function parseJobNames(project) {
  try {
    const parsed = project.jobIds ? JSON.parse(project.jobIds) : [];
    return Array.isArray(parsed) ? parsed.map(j => typeof j === 'object' ? j : { id: j }) : [];
  } catch {
    return [];
  }
}

// POST /api/projects/:id/analyze — AI analysis of a project
router.post('/:id/analyze', async (req, res, next) => {
  try {
    const openai = await getUserOpenAIClient(req.userId);
    if (!openai) return res.status(400).json({ error: 'OpenAI API key not configured. Go to Settings to add your key.' });

    const project = await prisma.project.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Optionally use a bidding profile for context
    let profile = null;
    if (req.body.profileId) {
      profile = await prisma.biddingProfile.findFirst({ where: { id: parseInt(req.body.profileId), userId: req.userId } });
    }
    // Account settings supply the AI context even when no profile is picked
    profile = await applyAccountSettings(profile, req.userId);

    // Attach jobNames for the analyzer
    project.jobNames = parseJobNames(project);

    const analysis = await analyzeProject(openai, project, profile);
    if (!analysis) return res.status(500).json({ error: 'AI analysis failed. Please try again.' });

    // Store in DB
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        aiAnalysis: JSON.stringify(analysis),
        relevanceScore: analysis.relevance_score,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.userId,
        action: 'project_analyzed',
        details: JSON.stringify({ projectId: project.id, relevanceScore: analysis.relevance_score }),
      },
    });

    updated.jobNames = project.jobNames;
    res.json({ project: updated, analysis });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:id/generate-proposal — Generate bid proposal text
router.post('/:id/generate-proposal', async (req, res, next) => {
  try {
    const openai = await getUserOpenAIClient(req.userId);
    if (!openai) return res.status(400).json({ error: 'OpenAI API key not configured. Go to Settings to add your key.' });

    const project = await prisma.project.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    let profile = null;
    if (req.body.profileId) {
      profile = await prisma.biddingProfile.findFirst({ where: { id: parseInt(req.body.profileId), userId: req.userId } });
    }
    // Account settings supply the AI context even when no profile is picked
    profile = await applyAccountSettings(profile, req.userId);

    project.jobNames = parseJobNames(project);

    const result = await generateProposal(openai, project, profile);
    if (result.skipped) {
      return res.status(422).json({ error: `The proposal prompt rules say not to bid on this project (${result.reason}).` });
    }

    // Return existing analysis if available
    const analysis = project.aiAnalysis ? JSON.parse(project.aiAnalysis) : null;

    res.json({
      proposalText: result.proposalText,
      charCount: result.charCount,
      analysis,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
