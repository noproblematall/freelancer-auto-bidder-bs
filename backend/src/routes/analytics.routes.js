// Analytics: the Freelancer account's standing, how the bidding is doing, and
// an AI review that turns both into concrete changes to make in BidPilot.
const express = require('express');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');
const { decrypt } = require('../utils/tokenManager');
const { createFreelancerClient } = require('../services/freelancer/client');
const { createOpenAIClient } = require('../services/openai/client');
const { getBidQuota, latestProjectId } = require('../services/freelancer/bidQuota');
const { parseJobFilters } = require('../services/bidding/jobFilters');

const router = express.Router();
router.use(authMiddleware);

const PERIODS = { '7d': 7, '30d': 30, '90d': 90, all: null };
const AI_REPORT_ACTION = 'ai_analytics_report';
// The review is one big reasoning call; give it well beyond the client's 60 s default.
const AI_TIMEOUT_MS = Number(process.env.AI_ANALYTICS_TIMEOUT_MS) || 170000;

// Models sometimes wrap JSON in ``` fences or add a sentence around it.
function parseReport(content) {
  const text = String(content || '').trim();
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  return { headline: text.slice(0, 500), raw: text };
}
const WON = new Set(['converted']);
const SENT = new Set(['placed', 'converted', 'rejected', 'retracted']); // reached Freelancer

function periodStart(period) {
  const days = PERIODS[period] === undefined ? 30 : PERIODS[period];
  return days ? new Date(Date.now() - days * 86400000) : null;
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);

// ── Freelancer account ──────────────────────────────────────────────────────
async function fetchAccount(userId) {
  const tokenRecord = await prisma.freelancerToken.findUnique({ where: { userId } });
  if (!tokenRecord) return { connected: false };
  const client = createFreelancerClient(decrypt(tokenRecord.accessToken));
  const out = { connected: true, freelancerUid: tokenRecord.freelancerUid };
  try {
    const { data } = await client.get('/users/0.1/self/', {
      params: {
        reputation: true, membership_details: true, status: true, jobs: true,
        profile_description: true, display_info: true, avatar: true, location_details: true,
        limited_account: true, badge_details: true,
      },
    });
    const r = data?.result || {};
    const rep = r.reputation || {};
    const hist = rep.entire_history || {};
    const last3 = rep.last3months || {};
    const cat = hist.category_ratings || {};
    out.profile = {
      id: r.id, username: r.username, displayName: r.display_name || r.public_name, tagline: r.tagline,
      avatar: r.avatar_cdn || r.avatar_large_cdn || r.avatar || null,
      country: r.location?.country?.name || null, city: r.location?.city || null,
      registrationDate: r.registration_date ? r.registration_date * 1000 : null,
      hourlyRate: r.hourly_rate ?? null, currency: r.primary_currency?.code || null,
      membership: r.membership_package?.name || null,
      limitedAccount: !!r.limited_account,
      skills: Array.isArray(r.jobs) ? r.jobs.map((j) => j.name).filter(Boolean) : [],
      verified: {
        payment: !!r.status?.payment_verified, email: !!r.status?.email_verified, phone: !!r.status?.phone_verified,
        identity: !!r.status?.identity_verified, profileComplete: !!r.status?.profile_complete,
        preferredFreelancer: !!r.preferred_freelancer, freelancerVerified: !!r.status?.freelancer_verified_user,
      },
    };
    out.reputation = {
      rating: round1(hist.overall), reviews: hist.reviews ?? null, completeJobs: hist.complete ?? null,
      incompleteReviews: hist.incomplete_reviews ?? null, allJobs: hist.all ?? null,
      completionRate: hist.completion_rate != null ? Math.round(hist.completion_rate * 100) : null,
      onBudget: hist.on_budget != null ? Math.round(hist.on_budget * 100) : null,
      onTime: hist.on_time != null ? Math.round(hist.on_time * 100) : null,
      rehireRate: hist.rehire_rate != null ? Math.round(hist.rehire_rate * 100) : null,
      earningsScore: rep.earnings_score ?? null,
      categories: { quality: round1(cat.quality), communication: round1(cat.communication), expertise: round1(cat.expertise), professionalism: round1(cat.professionalism), hireAgain: round1(cat.hire_again) },
      last3Months: { rating: round1(last3.overall), reviews: last3.reviews ?? null, complete: last3.complete ?? null },
      projectStats: rep.project_stats || null,
      topJobs: Array.isArray(rep.job_history?.job_counts)
        ? rep.job_history.job_counts.slice().sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 12).map((j) => ({ name: j.job?.name, count: j.count }))
        : [],
    };
  } catch (err) {
    out.error = `Freelancer profile could not be read: HTTP ${err.response?.status ?? 'NETWORK'} ${err.message}`;
    logger.warn(out.error);
  }
  try {
    const q = await getBidQuota(userId, client, { freelancerUid: tokenRecord.freelancerUid, projectId: await latestProjectId(prisma) });
    out.bids = q ? { remaining: q.remaining, limit: q.limit, unlimited: !!q.unlimited, nextRefillAt: q.nextRefillAt || null, refreshRate: q.refreshRate ?? null } : null;
  } catch { out.bids = null; }
  return out;
}

// ── Bidding analytics from the local history ────────────────────────────────
const BUDGET_BANDS = [[0, 50, '< $50'], [50, 150, '$50–150'], [150, 500, '$150–500'], [500, 1500, '$500–1.5k'], [1500, 5000, '$1.5k–5k'], [5000, Infinity, '> $5k']];
const COMPETITION_BANDS = [[0, 5, '0–4 bids'], [5, 15, '5–14'], [15, 30, '15–29'], [30, 60, '30–59'], [60, Infinity, '60+']];
const SPEED_BANDS = [[0, 5, '< 5 min'], [5, 15, '5–15 min'], [15, 60, '15–60 min'], [60, 360, '1–6 h'], [360, 1440, '6–24 h'], [1440, Infinity, '> 1 day']];
const SCORE_BANDS = [[0, 60, '< 60'], [60, 70, '60–69'], [70, 80, '70–79'], [80, 90, '80–89'], [90, 101, '90+']];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function bandOf(bands, v) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const b = bands.find(([lo, hi]) => v >= lo && v < hi);
  return b ? b[2] : null;
}

function tally(map, key, bid) {
  if (key === null || key === undefined || key === '') return;
  const row = map.get(key) || { key, bids: 0, sent: 0, won: 0, errors: 0 };
  row.bids++;
  if (SENT.has(bid.status)) row.sent++;
  if (WON.has(bid.status)) row.won++;
  if (bid.status === 'error') row.errors++;
  map.set(key, row);
}
const finish = (map, { sortBy = 'sent', limit = 12, order = null } = {}) => {
  let rows = [...map.values()].map((r) => ({ ...r, winRate: pct(r.won, r.sent) }));
  if (order) rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  else rows.sort((a, b) => b[sortBy] - a[sortBy]);
  return rows.slice(0, limit);
};

function normaliseError(msg) {
  const m = String(msg || '').toLowerCase();
  if (!m) return 'Unknown error';
  if (/bid limit|no bids|bids remaining|used all of your bids|out of bids/.test(m)) return 'No Freelancer bids left';
  if (/already (placed|bid)|duplicate/.test(m)) return 'Already bid on the project';
  if (/closed|not accepting|frozen|awarded/.test(m)) return 'Project closed or awarded';
  if (/insufficient|balance|deposit|payment/.test(m)) return 'Account balance / payment';
  if (/openai|model|rate limit|quota/.test(m)) return 'OpenAI error';
  if (/timeout|network|econn|socket|502|503|504/.test(m)) return 'Network / Freelancer outage';
  if (/401|403|token|unauthori/.test(m)) return 'Freelancer session / token';
  if (/sealed|nda|exam|qualification|not qualified|preferred/.test(m)) return 'Not eligible for the project';
  return String(msg).slice(0, 80);
}

async function buildBidAnalytics(userId, period) {
  const start = periodStart(period);
  const where = { userId, ...(start ? { createdAt: { gte: start } } : {}) };
  const bids = await prisma.bid.findMany({
    where,
    select: {
      id: true, status: true, amount: true, periodDays: true, createdAt: true, placedAt: true, errorMessage: true, profileId: true,
      project: { select: { budgetMin: true, budgetMax: true, currency: true, ownerCountry: true, bidCount: true, timeSubmitted: true, projectType: true, relevanceScore: true, status: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 20000,
  });
  const profiles = await prisma.biddingProfile.findMany({ where: { userId }, select: { id: true, name: true, isActive: true, minRelevanceScore: true } });
  const profileName = new Map(profiles.map((p) => [p.id, p.name]));

  const byStatus = {};
  const byDay = new Map();
  const byHour = new Map();
  const byWeekday = new Map();
  const byCountry = new Map();
  const byProfile = new Map();
  const byBudget = new Map();
  const byCompetition = new Map();
  const bySpeed = new Map();
  const byScore = new Map();
  const byType = new Map();
  const byCurrency = new Map();
  const errors = new Map();
  const speeds = [];
  const amountsUsd = [];
  const wonAmountsUsd = [];
  const periods = [];

  for (const b of bids) {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
    const p = b.project || {};
    const day = b.createdAt.toISOString().slice(0, 10);
    tally(byDay, day, b);
    const when = b.placedAt || b.createdAt;
    tally(byHour, when.getHours(), b);
    tally(byWeekday, DAYS[when.getDay()], b);
    tally(byCountry, p.ownerCountry || null, b);
    tally(byProfile, profileName.get(b.profileId) || 'Removed profile', b);
    const budgetMax = p.budgetMax ?? p.budgetMin;
    tally(byBudget, bandOf(BUDGET_BANDS, budgetMax), b);
    tally(byCompetition, bandOf(COMPETITION_BANDS, p.bidCount), b);
    tally(byScore, bandOf(SCORE_BANDS, p.relevanceScore), b);
    tally(byType, p.projectType || null, b);
    tally(byCurrency, p.currency || null, b);
    if (b.placedAt && p.timeSubmitted) {
      const min = (b.placedAt - p.timeSubmitted) / 60000;
      if (min >= 0 && min < 60 * 24 * 30) { speeds.push(min); tally(bySpeed, bandOf(SPEED_BANDS, min), b); }
    }
    if (SENT.has(b.status) && (p.currency || 'USD') === 'USD' && b.amount > 0) {
      amountsUsd.push(b.amount);
      if (WON.has(b.status)) wonAmountsUsd.push(b.amount);
    }
    if (b.periodDays > 0 && SENT.has(b.status)) periods.push(b.periodDays);
    if (b.status === 'error') { const k = normaliseError(b.errorMessage); errors.set(k, (errors.get(k) || 0) + 1); }
  }

  const total = bids.length;
  const sent = bids.filter((b) => SENT.has(b.status)).length;
  const won = byStatus.converted || 0;
  const errored = byStatus.error || 0;
  const days = start ? Math.max(1, (Date.now() - start.getTime()) / 86400000) : Math.max(1, (Date.now() - (bids[0]?.createdAt?.getTime() || Date.now())) / 86400000);

  // Discovery funnel: projects found in the period → analysed → above the lowest active threshold → bid → won.
  const minScore = Math.min(...profiles.filter((p) => p.isActive).map((p) => p.minRelevanceScore), 70);
  const projWhere = start ? { discoveredAt: { gte: start } } : {};
  const [discovered, analysed, qualified] = await Promise.all([
    prisma.project.count({ where: projWhere }),
    prisma.project.count({ where: { ...projWhere, aiAnalysis: { not: null } } }),
    prisma.project.count({ where: { ...projWhere, relevanceScore: { gte: minScore } } }),
  ]);

  // Fill the daily series so the chart has every day.
  const series = [];
  if (start || bids.length) {
    const cursor = new Date(start || bids[0].createdAt); cursor.setHours(0, 0, 0, 0);
    const end = new Date();
    while (cursor <= end) {
      const k = cursor.toISOString().slice(0, 10);
      const r = byDay.get(k) || { bids: 0, sent: 0, won: 0, errors: 0 };
      series.push({ date: k, bids: r.bids, sent: r.sent, won: r.won, errors: r.errors });
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const hours = Array.from({ length: 24 }, (_, h) => { const r = byHour.get(h) || { bids: 0, sent: 0, won: 0, errors: 0 }; return { hour: h, sent: r.sent, won: r.won, winRate: pct(r.won, r.sent) }; });

  return {
    period, since: start ? start.toISOString() : null, days: Math.round(days),
    totals: {
      total, sent, won, errored,
      pendingReview: byStatus.pending_review || 0, retracted: byStatus.retracted || 0, rejected: byStatus.rejected || 0,
      winRate: pct(won, sent), errorRate: pct(errored, total),
      sentPerDay: round1(sent / days),
      avgBidUsd: amountsUsd.length ? Math.round(amountsUsd.reduce((a, b) => a + b, 0) / amountsUsd.length) : null,
      medianBidUsd: round1(median(amountsUsd)), medianWonBidUsd: round1(median(wonAmountsUsd)),
      medianPeriodDays: median(periods),
      medianSpeedMin: round1(median(speeds)), speedSamples: speeds.length,
      wonValueUsd: Math.round(wonAmountsUsd.reduce((a, b) => a + b, 0)),
    },
    byStatus,
    series,
    hours,
    weekdays: finish(byWeekday, { order: DAYS, limit: 7 }),
    countries: finish(byCountry, { limit: 12 }),
    profiles: finish(byProfile, { limit: 20 }),
    budgets: finish(byBudget, { order: BUDGET_BANDS.map((b) => b[2]), limit: 10 }),
    competition: finish(byCompetition, { order: COMPETITION_BANDS.map((b) => b[2]), limit: 10 }),
    speed: finish(bySpeed, { order: SPEED_BANDS.map((b) => b[2]), limit: 10 }),
    scores: finish(byScore, { order: SCORE_BANDS.map((b) => b[2]), limit: 10 }),
    types: finish(byType, { limit: 5 }),
    currencies: finish(byCurrency, { limit: 8 }),
    errors: [...errors.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    funnel: { discovered, analysed, qualified, minScore, bid: sent, won },
  };
}

async function buildSettingsSummary(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      hourlyRate: true, periodMinDays: true, periodMaxDays: true, periodFallbackDays: true, aiBidPercentage: true, sealBids: true,
      maxBidsPerHour: true, maxBidsPerDay: true, reviewMode: true, bidDelaySeconds: true, openaiModel: true,
      scheduleEnabled: true, scheduleTimezone: true, scheduleWeek: true, scheduleStartTime: true, scheduleEndTime: true, scheduleDays: true,
      skillsSummary: true, experienceSummary: true, portfolioHighlights: true, proposalPrompt: true, jobFilters: true,
    },
  });
  const profiles = await prisma.biddingProfile.findMany({
    where: { userId },
    select: {
      name: true, isActive: true, searchKeywords: true, jobIds: true, budgetMinFixed: true, budgetMaxFixed: true, budgetMinHourly: true, budgetMaxHourly: true,
      countries: true, excludedCountries: true, languages: true, fixedBidStrategy: true, bidPercentage: true, hourlyRateStrategy: true,
      minRelevanceScore: true, proposalPrompt: true, reviewMode: true, maxBidsPerHour: true, maxBidsPerDay: true,
    },
  });
  const clients = await prisma.client.aggregate({ where: { userId }, _count: { _all: true }, _sum: { totalValue: true } });
  const repeat = await prisma.client.count({ where: { userId, projectCount: { gt: 1 } } });
  let jobFilters = null;
  try { jobFilters = parseJobFilters(user?.jobFilters); } catch { jobFilters = null; }
  return {
    account: {
      hourlyRateUsd: user?.hourlyRate ?? null, aiBidPercentage: user?.aiBidPercentage, sealBids: user?.sealBids, reviewMode: user?.reviewMode,
      maxBidsPerHour: user?.maxBidsPerHour, maxBidsPerDay: user?.maxBidsPerDay, bidDelaySeconds: user?.bidDelaySeconds, openaiModel: user?.openaiModel,
      deliveryDays: { min: user?.periodMinDays, max: user?.periodMaxDays, fallback: user?.periodFallbackDays },
      schedule: user?.scheduleEnabled ? { timezone: user.scheduleTimezone, week: user.scheduleWeek, start: user.scheduleStartTime, end: user.scheduleEndTime, days: user.scheduleDays } : 'always on',
      skillsSummary: user?.skillsSummary || null, experienceSummary: user?.experienceSummary || null, portfolioHighlights: user?.portfolioHighlights || null,
      customProposalPrompt: !!user?.proposalPrompt,
      jobFilters,
    },
    profiles: profiles.map((p) => ({ ...p, customProposalPrompt: !!p.proposalPrompt, proposalPrompt: undefined, jobIds: p.jobIds ? String(p.jobIds).slice(0, 200) : null })),
    clients: { count: clients._count._all, totalValue: clients._sum.totalValue || 0, repeat },
  };
}

// GET /api/analytics/overview?period=30d
router.get('/overview', async (req, res, next) => {
  try {
    const period = PERIODS[req.query.period] === undefined ? '30d' : req.query.period;
    const [account, bids, settings] = await Promise.all([
      fetchAccount(req.userId).catch((e) => ({ connected: false, error: e.message })),
      buildBidAnalytics(req.userId, period),
      buildSettingsSummary(req.userId),
    ]);
    res.json({ generatedAt: Date.now(), period, account, bids, clients: settings.clients });
  } catch (err) { next(err); }
});

// GET /api/analytics/ai — the latest AI review
router.get('/ai', async (req, res, next) => {
  try {
    const row = await prisma.activityLog.findFirst({ where: { userId: req.userId, action: AI_REPORT_ACTION }, orderBy: { id: 'desc' } });
    if (!row) return res.json({ report: null });
    let details = {};
    try { details = JSON.parse(row.details || '{}'); } catch { /* ignore */ }
    res.json({ report: details.report || null, createdAt: row.createdAt, period: details.period || null, model: details.model || null });
  } catch (err) { next(err); }
});

const REPORT_SCHEMA = `{
  "headline": "one sentence on where the account stands",
  "score": 0-100 (how well set up this account is to win work through BidPilot),
  "strengths": ["short, specific, backed by a number from the data"],
  "problems": [{ "title": "...", "evidence": "the numbers that show it", "impact": "high|medium|low" }],
  "actions": [{
    "priority": 1,
    "title": "imperative, specific",
    "where": "the BidPilot page/setting or Freelancer page to change (e.g. Bid Profiles → <name> → Minimum relevance score; Settings → Auto-Bidding; Freelancer.com profile)",
    "change": "exactly what to set or do, with the value",
    "why": "the evidence in the data",
    "expected": "what should move and by roughly how much"
  }],
  "experiments": [{ "title": "...", "how": "...", "measure": "which metric on this page to watch, for how long" }],
  "proposalAdvice": ["concrete changes to the proposal prompt / profile text"],
  "nextReviewDays": number
}`;

// POST /api/analytics/ai?period=30d — run the AI review and keep it
router.post('/ai', async (req, res, next) => {
  try {
    const period = PERIODS[req.query.period] === undefined ? '30d' : req.query.period;
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { openaiApiKey: true, openaiModel: true } });
    if (!user?.openaiApiKey) return res.status(400).json({ error: 'Add your OpenAI API key in Settings first.' });
    const [account, bids, settings] = await Promise.all([
      fetchAccount(req.userId).catch((e) => ({ connected: false, error: e.message })),
      buildBidAnalytics(req.userId, period),
      buildSettingsSummary(req.userId),
    ]);
    const data = { account, bidding: bids, settings };
    const openai = createOpenAIClient(decrypt(user.openaiApiKey), user.openaiModel || 'gpt-5.4-mini');
    const messages = [
      { role: 'system', content:
        'You are a Freelancer.com bidding coach reviewing a freelancer\'s auto-bidding setup (BidPilot: searches Freelancer projects by keywords/skills, scores each with an AI relevance score, writes a proposal with an LLM, places the bid; the freelancer\'s own profile, rate and settings are given). ' +
        'The single goal is more awarded projects per Freelancer bid spent. Reason from the numbers given: win rate by hour, weekday, country, budget band, competition (bids on the project when bid), response speed, relevance-score band, profile; the error reasons; the funnel; the Freelancer reputation and verifications; the bid allowance and caps; the settings. ' +
        'Be specific and quantitative; name the exact setting to change and the value. Prefer the few changes with the largest expected effect. Do not invent data; when a sample is too small (< 20 bids) say so instead of concluding. Where Freelancer\'s own levers matter (profile completeness, verifications, portfolio, reviews, membership bids, Preferred Freelancer, exams), include them. ' +
        `Respond with JSON only, matching this shape: ${REPORT_SCHEMA}` },
      { role: 'user', content: `Analytics period: ${period}. Data:\n${JSON.stringify(data)}` },
    ];
    let content, modelUsed;
    try {
      ({ content, modelUsed } = await openai.chat({ messages, response_format: { type: 'json_object' }, max_tokens: 3000, temperature: 0.4, timeout: AI_TIMEOUT_MS }));
    } catch (err) {
      // Surface the real reason (the generic handler hides messages in production).
      logger.error({ err }, 'AI analytics review failed');
      const msg = String(err.message || 'OpenAI request failed').replace(/^OpenAI API error: /, '');
      return res.status(502).json({ error: /timeout/i.test(msg) ? `The AI review took too long (${msg}). Try again, or pick a faster model in Settings.` : `AI review failed: ${msg}` });
    }
    const report = parseReport(content);
    await prisma.activityLog.create({
      data: { userId: req.userId, action: AI_REPORT_ACTION, details: JSON.stringify({ message: `AI analytics review generated (${period}): ${report.headline || ''}`.slice(0, 500), period, model: modelUsed, report }) },
    });
    res.json({ report, createdAt: new Date(), period, model: modelUsed });
  } catch (err) { next(err); }
});

module.exports = router;
