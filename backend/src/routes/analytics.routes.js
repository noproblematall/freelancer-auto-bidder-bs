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
const SENT = new Set(['placed', 'converted', 'rejected', 'retracted']); // reached Freelancer
// Outcomes come from Freelancer (services/bidding/outcomeSync.js) and the
// message poller: an award is a win, a first client message is a reply.
const isWon = (b) => b.awardStatus === 'awarded';
const isReplied = (b) => !!b.clientRepliedAt || b.status === 'converted';
const isLost = (b) => ['lost', 'expired', 'rejected', 'revoked'].includes(b.awardStatus);

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
// Freelancer-side levers that move win rate more than any bidding setting.
// Each item: done or not (null = unknown), why it matters, where to do it.
function buildChecklist(profile, reputation) {
  const v = profile.verified || {};
  const items = [];
  const add = (key, done, title, why, url) => items.push({ key, done: done === null ? null : !!done, title, why, url });
  add('payment', v.payment, 'Payment method verified', 'Clients filter out unverified freelancers; it also unlocks more bids.', 'https://www.freelancer.com/users/settings.php');
  add('identity', v.identity, 'Identity verified', 'The KYC badge on your bid builds trust with first-time clients.', 'https://www.freelancer.com/users/settings.php');
  add('phone', v.phone, 'Phone verified', 'A verification badge shown on every bid.', 'https://www.freelancer.com/users/settings.php');
  add('profileComplete', v.profileComplete, 'Profile marked complete', 'Freelancer ranks complete profiles higher in bid lists.', 'https://www.freelancer.com/me');
  add('portfolio', profile.portfolioCount == null ? null : profile.portfolioCount >= 5, profile.portfolioCount == null ? 'Portfolio has 5+ items' : `Portfolio has 5+ items (${profile.portfolioCount} now)`, 'Clients open the portfolio before they reply; five strong, relevant items beat twenty weak ones.', 'https://www.freelancer.com/me');
  add('exams', profile.qualifications == null ? null : profile.qualifications >= 3, profile.qualifications == null ? 'Passed 3+ skill exams' : `Passed 3+ skill exams (${profile.qualifications} now)`, 'Exam badges appear on bids for the matching skills and lift ranking.', 'https://www.freelancer.com/exam/');
  add('skills', profile.skills.length > 0 && profile.skills.length <= 40, `Skills list focused (${profile.skills.length} now)`, 'Seventy skills reads as "does anything"; keep the ones you want to be hired for so the search ranks you for them.', 'https://www.freelancer.com/me');
  const tagline = String(profile.tagline || '').trim();
  const genericTagline = /^[\w .+#/&-]{0,40}$/.test(tagline) && /\|/.test(tagline) || tagline.length < 25;
  add('tagline', tagline ? !genericTagline : false, 'Specific tagline', 'The tagline is the one line clients see under your name in the bid list; name the outcome you deliver ("Shopify stores that convert"), not a list of words.', 'https://www.freelancer.com/me');
  add('recentReviews', (reputation?.last3Months?.reviews || 0) > 0, 'A review in the last 3 months', 'Freelancer weighs recent reviews; one small completed job a quarter keeps the profile warm.', 'https://www.freelancer.com/me');
  add('preferred', v.preferredFreelancer, 'Preferred Freelancer Program', 'Preferred members get invited to recruiter projects with far less competition. Apply once the items above are done.', 'https://www.freelancer.com/preferred-freelancer-program');
  const done = items.filter((i) => i.done === true).length;
  const known = items.filter((i) => i.done !== null).length;
  return { items, done, total: items.length, known };
}

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
        limited_account: true, badge_details: true, qualification_details: true, portfolio_details: true,
        preferred_details: true,
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
        preferredFreelancer: !!r.preferred_freelancer || !!r.preferred_details?.is_preferred, freelancerVerified: !!r.status?.freelancer_verified_user,
      },
      qualifications: Array.isArray(r.qualifications) ? r.qualifications.length : null,
      portfolioCount: typeof r.portfolio_count === 'number' ? r.portfolio_count : null,
      description: r.profile_description || null,
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
  if (out.profile) out.checklist = buildChecklist(out.profile, out.reputation);
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
const CLIENT_SCORE_BANDS = [[0, 35, '< 35'], [35, 50, '35–49'], [50, 65, '50–64'], [65, 80, '65–79'], [80, 101, '80+']];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function bandOf(bands, v) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const b = bands.find(([lo, hi]) => v >= lo && v < hi);
  return b ? b[2] : null;
}

function tally(map, key, bid) {
  if (key === null || key === undefined || key === '') return;
  const row = map.get(key) || { key, bids: 0, sent: 0, replied: 0, won: 0, lost: 0, errors: 0 };
  row.bids++;
  if (SENT.has(bid.status)) row.sent++;
  if (isReplied(bid)) row.replied++;
  if (isWon(bid)) row.won++;
  if (isLost(bid)) row.lost++;
  if (bid.status === 'error') row.errors++;
  map.set(key, row);
}
const finish = (map, { sortBy = 'sent', limit = 12, order = null } = {}) => {
  let rows = [...map.values()].map((r) => ({ ...r, winRate: pct(r.won, r.sent), replyRate: pct(r.replied, r.sent) }));
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
      awardStatus: true, clientRepliedAt: true, followUpAt: true,
      project: { select: { budgetMin: true, budgetMax: true, currency: true, ownerCountry: true, bidCount: true, timeSubmitted: true, projectType: true, relevanceScore: true, status: true, clientScore: true, ownerPaymentVerified: true, ownerReviews: true } },
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
  const byClientScore = new Map();
  const byClientKind = new Map();
  const byFollowUp = new Map();
  const errors = new Map();
  const replyMinutes = [];
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
    tally(byClientScore, bandOf(CLIENT_SCORE_BANDS, p.clientScore), b);
    tally(byClientKind, p.ownerPaymentVerified === true ? (p.ownerReviews > 0 ? 'Verified, has hired before' : 'Verified, first hire') : p.ownerPaymentVerified === false ? 'Payment not verified' : null, b);
    if (SENT.has(b.status)) tally(byFollowUp, b.followUpAt ? 'With follow-up' : 'No follow-up', b);
    if (b.clientRepliedAt && b.placedAt) { const m = (new Date(b.clientRepliedAt) - b.placedAt) / 60000; if (m >= 0) replyMinutes.push(m); }
    if (b.placedAt && p.timeSubmitted) {
      const min = (b.placedAt - p.timeSubmitted) / 60000;
      if (min >= 0 && min < 60 * 24 * 30) { speeds.push(min); tally(bySpeed, bandOf(SPEED_BANDS, min), b); }
    }
    if (SENT.has(b.status) && (p.currency || 'USD') === 'USD' && b.amount > 0) {
      amountsUsd.push(b.amount);
      if (isWon(b)) wonAmountsUsd.push(b.amount);
    }
    if (b.periodDays > 0 && SENT.has(b.status)) periods.push(b.periodDays);
    if (b.status === 'error') { const k = normaliseError(b.errorMessage); errors.set(k, (errors.get(k) || 0) + 1); }
  }

  const total = bids.length;
  const sent = bids.filter((b) => SENT.has(b.status)).length;
  const replied = bids.filter(isReplied).length;
  const won = bids.filter(isWon).length;
  const lost = bids.filter(isLost).length;
  const open = bids.filter((b) => SENT.has(b.status) && !isWon(b) && !isLost(b)).length;
  const errored = byStatus.error || 0;
  const days = start ? Math.max(1, (Date.now() - start.getTime()) / 86400000) : Math.max(1, (Date.now() - (bids[0]?.createdAt?.getTime() || Date.now())) / 86400000);

  // Discovery funnel: projects found in the period → analysed → above the lowest active threshold → bid → won.
  const minScore = Math.min(...profiles.filter((p) => p.isActive).map((p) => p.minRelevanceScore), 70);
  const projWhere = start ? { discoveredAt: { gte: start } } : {};
  const [discovered, analysed, qualified, decisionRows] = await Promise.all([
    prisma.project.count({ where: projWhere }),
    prisma.project.count({ where: { ...projWhere, aiAnalysis: { not: null } } }),
    prisma.project.count({ where: { ...projWhere, relevanceScore: { gte: minScore } } }),
    prisma.project.groupBy({ by: ['decision', 'decisionReason'], where: { ...projWhere, decision: { not: null } }, _count: { _all: true } }),
  ]);
  // Why projects found in the period were not bid on (engine.js decisions)
  const decisions = decisionRows
    .map((r) => ({ decision: r.decision, reason: r.decisionReason, count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  // Fill the daily series so the chart has every day.
  const series = [];
  if (start || bids.length) {
    const cursor = new Date(start || bids[0].createdAt); cursor.setHours(0, 0, 0, 0);
    const end = new Date();
    while (cursor <= end) {
      const k = cursor.toISOString().slice(0, 10);
      const r = byDay.get(k) || { bids: 0, sent: 0, replied: 0, won: 0, errors: 0 };
      series.push({ date: k, bids: r.bids, sent: r.sent, replied: r.replied, won: r.won, errors: r.errors });
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const hours = Array.from({ length: 24 }, (_, h) => { const r = byHour.get(h) || { bids: 0, sent: 0, replied: 0, won: 0, errors: 0 }; return { hour: h, sent: r.sent, replied: r.replied, won: r.won, winRate: pct(r.won, r.sent), replyRate: pct(r.replied, r.sent) }; });

  return {
    period, since: start ? start.toISOString() : null, days: Math.round(days),
    totals: {
      total, sent, replied, won, lost, open, errored,
      pendingReview: byStatus.pending_review || 0, retracted: byStatus.retracted || 0, rejected: byStatus.rejected || 0,
      winRate: pct(won, sent), replyRate: pct(replied, sent), errorRate: pct(errored, total),
      medianReplyMin: round1(median(replyMinutes)),
      followUpsSent: bids.filter((b) => b.followUpAt).length,
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
    clientScores: finish(byClientScore, { order: CLIENT_SCORE_BANDS.map((b) => b[2]), limit: 10 }),
    clientKinds: finish(byClientKind, { limit: 5 }),
    followUps: finish(byFollowUp, { limit: 2 }),
    errors: [...errors.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    decisions,
    funnel: { discovered, analysed, qualified, minScore, bid: sent, replied, won },
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

// The AI review itself, shared by the button (POST /ai) and the monthly
// automatic run (services/bidding/outcomeSync.js).
async function generateAiReview(userId, period = '30d', { trigger = 'manual' } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { openaiApiKey: true, openaiModel: true } });
  if (!user?.openaiApiKey) { const e = new Error('Add your OpenAI API key in Settings first.'); e.status = 400; throw e; }
  const [account, bids, settings] = await Promise.all([
    fetchAccount(userId).catch((e) => ({ connected: false, error: e.message })),
    buildBidAnalytics(userId, period),
    buildSettingsSummary(userId),
  ]);
  const data = { account, bidding: bids, settings };
  const openai = createOpenAIClient(decrypt(user.openaiApiKey), user.openaiModel || 'gpt-5.4-mini');
    const messages = [
      { role: 'system', content:
        'You are a Freelancer.com bidding coach reviewing a freelancer\'s auto-bidding setup (BidPilot: searches Freelancer projects by keywords/skills, scores each project with an AI relevance score and each client with a client score (payment verified, reviews, hire history, bids already on the project), writes a proposal with an LLM, places the bid, records client replies and awards from Freelancer, can send one follow-up message per bid and can reply automatically to the client\'s first message; the freelancer\'s own profile, rate and settings are given). ' +
        'The single goal is more awarded projects per Freelancer bid spent. "replied" = the client wrote back (early signal, the bid was read); "won" = Freelancer reported the bid awarded; "lost" = the project went to someone else or expired. Reason from the numbers given: reply and win rate by hour, weekday, country, budget band, competition, response speed, relevance-score band, client-score band, client kind, profile, follow-up; the error reasons; the decisions (why found projects were skipped); the funnel; the Freelancer reputation, verifications and the account checklist; the bid allowance and caps; the settings. ' +
        'Be specific and quantitative; name the exact setting to change and the value (e.g. Settings → Auto-Bidding → Minimum client score 45; Bid Profiles → <name> → Minimum relevance score 80; Settings → Follow up after 24 h). Prefer the few changes with the largest expected effect. Do not invent data; when a sample is too small (< 20 bids) say so instead of concluding. Always include the Freelancer-side levers from the checklist that are not done (verifications, profile completeness, portfolio, exams, focused skills, specific tagline, recent reviews, Preferred Freelancer Program) because they move win rate more than any bidding setting; and the proposal prompt (hook in the first two lines, proof, plan, one question). ' +
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
    const e = new Error(/timeout/i.test(msg) ? `The AI review took too long (${msg}). Try again, or pick a faster model in Settings.` : `AI review failed: ${msg}`);
    e.status = 502;
    throw e;
  }
  const report = parseReport(content);
  await prisma.activityLog.create({
    data: { userId, action: AI_REPORT_ACTION, details: JSON.stringify({ message: `AI analytics review generated (${period}, ${trigger}): ${report.headline || ''}`.slice(0, 500), period, model: modelUsed, trigger, report }) },
  });
  return { report, createdAt: new Date(), period, model: modelUsed };
}

// POST /api/analytics/ai?period=30d — run the AI review and keep it
router.post('/ai', async (req, res, next) => {
  try {
    const period = PERIODS[req.query.period] === undefined ? '30d' : req.query.period;
    const result = await generateAiReview(req.userId, period, { trigger: 'manual' });
    res.json(result);
  } catch (err) {
    if (err.status === 400 || err.status === 502) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
module.exports.generateAiReview = generateAiReview;
module.exports.buildBidAnalytics = buildBidAnalytics;
