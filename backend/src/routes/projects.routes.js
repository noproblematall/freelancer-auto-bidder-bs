const express = require('express');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const flClient = require('../middleware/freelancerClient');
const { searchProjects, getProjectById, getJobs } = require('../services/freelancer/projects');
const { createOpenAIClient } = require('../services/openai/client');
const { analyzeProject } = require('../services/openai/analyzer');
const { generateProposal } = require('../services/openai/proposalGenerator');
const { applySharedProfile } = require('../services/bidding/sharedProfile');
const { decrypt } = require('../utils/tokenManager');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authMiddleware);

// Upsert projects from Freelancer API into local DB
async function upsertProjects(freelancerProjects) {
  const upserted = [];
  for (const p of freelancerProjects) {
    // Resolve owner country — owner_info.country is the correct source per Freelancer support
    // Note: currency.country is NOT used — it returns zone codes like "EU" for Euro, not actual country codes
    const rawCountry = p.owner_info?.country?.code
      || p.location?.country?.code
      || p.true_location?.country?.code
      || null;
    const ownerCountry = rawCountry ? rawCountry.toUpperCase() : null;
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
    record.jobNames = data.jobIds ? JSON.parse(data.jobIds) : [];
    upserted.push(record);
  }
  return upserted;
}

// POST /api/projects/search — Search Freelancer API, upsert to DB
router.post('/search', flClient, async (req, res, next) => {
  try {
    const { query, projectTypes, minBudget, maxBudget, jobIds, countries, languages, limit, offset } = req.body;

    const result = await searchProjects(req.flClient, {
      query, projectTypes, minBudget, maxBudget, jobIds, countries, languages,
      limit: limit || 20,
      offset: offset || 0,
    });

    const projects = await upsertProjects(result.projects || []);

    res.json({
      projects,
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

    const allowedSorts = ['discoveredAt', 'budgetMax', 'bidCount', 'relevanceScore', 'timeSubmitted'];
    const orderField = allowedSorts.includes(sortBy) ? sortBy : 'discoveredAt';

    const [rawProjects, totalCount] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: { [orderField]: sortOrder === 'asc' ? 'asc' : 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.project.count({ where }),
    ]);

    // Parse stored job data so frontend gets jobNames
    const projects = rawProjects.map(p => {
      try {
        const parsed = p.jobIds ? JSON.parse(p.jobIds) : [];
        p.jobNames = Array.isArray(parsed) ? parsed.map(j => typeof j === 'object' ? j : { id: j }) : [];
      } catch {
        p.jobNames = [];
      }
      return p;
    });

    res.json({
      projects,
      totalCount,
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
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
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
    // Shared settings supply skills/experience context even when no profile is picked
    profile = await applySharedProfile(profile, req.userId);

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
    // Shared settings supply skills/experience context even when no profile is picked
    profile = await applySharedProfile(profile, req.userId);

    project.jobNames = parseJobNames(project);

    const result = await generateProposal(openai, project, profile);

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
