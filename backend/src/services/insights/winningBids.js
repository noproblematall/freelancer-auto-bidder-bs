// Winning bids: once a project we bid on is awarded, read the bid that won
// it (amount, period, text unless sealed, who the freelancer is) and keep it
// next to ours. The Market page shows the comparison and the AI study turns
// the pattern into changes to our pricing, prompt and profile.
const prisma = require('../../config/database');
const { createFreelancerClient } = require('../freelancer/client');
const { getProjectBids } = require('../freelancer/bids');
const { decrypt, isExpired } = require('../../utils/tokenManager');
const { askJson, saveReport, latestReport } = require('./ai');
const logger = require('../../utils/logger');

const STUDY_ACTION = 'ai_winning_bids_study';
const PERIOD_DAYS = { '30d': 30, '90d': 90, '180d': 180, all: null };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const round1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);

function bidderFacts(users, bidderId) {
  const u = users?.[String(bidderId)] || {};
  const rep = u.reputation?.entire_history || {};
  return {
    bidderName: u.display_name || u.public_name || null,
    bidderUsername: u.username || null,
    bidderCountry: u.location?.country?.code ? String(u.location.country.code).toUpperCase() : null,
    bidderRating: num(rep.overall),
    bidderReviews: num(rep.reviews),
    bidderHourlyRate: num(u.hourly_rate),
    bidderRegisteredAt: num(u.registration_date) ? new Date(u.registration_date * 1000) : null,
  };
}

// Read the awarded bid on one project from Freelancer and store it.
async function captureWinningBid(client, { project, myUid }) {
  const { bids, users } = await getProjectBids(client, project.freelancerProjectId);
  const winner = bids.find((b) => String(b.award_status || '').toLowerCase() === 'awarded');
  if (!winner) return null;
  const amounts = bids.map((b) => num(b.amount)).filter((a) => a !== null && a > 0);
  const data = {
    freelancerBidId: winner.id || null,
    bidderId: winner.bidder_id || null,
    ...bidderFacts(users, winner.bidder_id),
    amount: num(winner.amount),
    period: num(winner.period),
    description: winner.sealed ? null : (winner.description || null),
    sealed: !!winner.sealed,
    highlighted: !!winner.highlighted,
    bidSubmittedAt: num(winner.time_submitted) ? new Date(winner.time_submitted * 1000) : null,
    isMine: !!myUid && Number(winner.bidder_id) === Number(myUid),
    totalBids: bids.length || num(project.bidCount),
    avgBid: amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : null,
    fetchedAt: new Date(),
  };
  const row = await prisma.winningBid.upsert({ where: { projectId: project.id }, update: data, create: { projectId: project.id, ...data } });
  logger.info(`Winning bid captured for project #${project.id}: ${data.amount} by ${data.bidderName || data.bidderId}${data.isMine ? ' (ours)' : ''}`);
  return row;
}

// Projects we bid on that were decided but whose winner is not stored yet.
// Looks at the most recent RECENT_BIDS bids only and reads up to `limit`
// winners per call (one Freelancer request each); the rest wait for the next
// click or the 30-minute outcome check.
const RECENT_BIDS = 500;
async function syncWinningBids(userId, { limit = 50 } = {}) {
  const token = await prisma.freelancerToken.findUnique({ where: { userId } });
  if (!token || isExpired(token.expiresAt)) { const e = new Error('Freelancer is not connected. Connect it in Settings.'); e.status = 400; throw e; }
  const client = createFreelancerClient(decrypt(token.accessToken));
  const myUid = Number(token.freelancerUid) || null;
  // Decided bids among the most recent ones, then drop those whose winner is stored.
  const recent = await prisma.bid.findMany({
    where: { userId, awardStatus: { in: ['lost', 'awarded'] } },
    orderBy: { id: 'desc' }, take: RECENT_BIDS,
    select: { id: true, projectId: true, project: { select: { id: true, freelancerProjectId: true, bidCount: true } } },
  });
  const projectIds = [...new Set(recent.map((b) => b.projectId))];
  const stored = new Set((await prisma.winningBid.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true } })).map((w) => w.projectId));
  const pending = [];
  const seen = new Set();
  for (const b of recent) {
    if (stored.has(b.projectId) || seen.has(b.projectId)) continue;
    seen.add(b.projectId);
    pending.push(b);
  }
  const batch = pending.slice(0, limit);
  let captured = 0;
  let noWinner = 0;
  const errors = [];
  for (const b of batch) {
    try {
      if (await captureWinningBid(client, { project: b.project, myUid })) captured++; else noWinner++;
    } catch (err) {
      const status = err.response?.status;
      const msg = `project #${b.project.freelancerProjectId}: HTTP ${status ?? 'NETWORK'} ${err.response?.data?.message || err.message}`;
      logger.warn(`winningBids: ${msg}`);
      errors.push(msg);
      if (status === 401 || status === 403) break;
      if (errors.length >= 5) break;
    }
  }
  return { checked: batch.length, captured, noWinner, remaining: Math.max(0, pending.length - batch.length), errors };
}

// Rows for the Market page plus the headline numbers.
async function winningBidRows(userId, period = '30d') {
  const days = PERIOD_DAYS[period] === undefined ? 30 : PERIOD_DAYS[period];
  const since = days ? new Date(Date.now() - days * 86400000) : null;
  const rows = await prisma.winningBid.findMany({
    where: { ...(since ? { fetchedAt: { gte: since } } : {}), project: { bids: { some: { userId } } } },
    orderBy: { fetchedAt: 'desc' }, take: 500,
    include: {
      project: {
        select: {
          id: true, freelancerProjectId: true, title: true, budgetMin: true, budgetMax: true, currency: true, projectType: true, ownerCountry: true, bidCount: true, bidAvg: true, timeSubmitted: true, relevanceScore: true, clientScore: true, jobIds: true,
          bids: { where: { userId }, orderBy: { id: 'desc' }, take: 1, select: { id: true, amount: true, periodDays: true, status: true, awardStatus: true, proposalText: true, placedAt: true, sealed: true, clientRepliedAt: true } },
        },
      },
    },
  });
  const items = rows.map((w) => {
    const our = w.project.bids[0] || null;
    const ratio = our?.amount > 0 && w.amount > 0 ? round1(w.amount / our.amount) : null;
    return {
      projectId: w.project.id, freelancerProjectId: w.project.freelancerProjectId, title: w.project.title,
      currency: w.project.currency, projectType: w.project.projectType, budgetMin: w.project.budgetMin, budgetMax: w.project.budgetMax,
      clientCountry: w.project.ownerCountry, relevanceScore: w.project.relevanceScore, clientScore: w.project.clientScore,
      postedAt: w.project.timeSubmitted, totalBids: w.totalBids ?? w.project.bidCount, avgBid: w.avgBid ?? w.project.bidAvg,
      our: our ? { id: our.id, amount: our.amount, period: our.periodDays, status: our.status, awardStatus: our.awardStatus, replied: !!our.clientRepliedAt || our.status === 'converted', placedAt: our.placedAt, sealed: our.sealed, proposal: our.proposalText } : null,
      winner: {
        isMine: w.isMine, bidderId: w.bidderId, name: w.bidderName, username: w.bidderUsername, country: w.bidderCountry,
        rating: w.bidderRating, reviews: w.bidderReviews, hourlyRate: w.bidderHourlyRate, registeredAt: w.bidderRegisteredAt,
        amount: w.amount, period: w.period, description: w.description, sealed: w.sealed, highlighted: w.highlighted, submittedAt: w.bidSubmittedAt,
      },
      ratio, fetchedAt: w.fetchedAt,
    };
  });
  const lost = items.filter((i) => !i.winner.isMine && i.our);
  const ratios = lost.map((i) => i.ratio).filter((r) => r !== null);
  const cheaper = lost.filter((i) => i.ratio !== null && i.ratio < 1).length;
  const stats = {
    total: items.length, lost: lost.length, won: items.filter((i) => i.winner.isMine).length,
    winnerCheaperPct: pct(cheaper, ratios.length), medianRatio: round1(median(ratios)),
    medianWinnerAmountUsd: round1(median(lost.filter((i) => i.currency === 'USD' && i.winner.amount).map((i) => i.winner.amount))),
    medianOurAmountUsd: round1(median(lost.filter((i) => i.currency === 'USD' && i.our?.amount).map((i) => i.our.amount))),
    medianWinnerPeriod: median(lost.map((i) => i.winner.period).filter((p) => p)), medianOurPeriod: median(lost.map((i) => i.our?.period).filter((p) => p)),
    medianWinnerReviews: median(lost.map((i) => i.winner.reviews).filter((r) => r !== null)),
    medianWinnerRating: round1(median(lost.map((i) => i.winner.rating).filter((r) => r !== null))),
    sealedPct: pct(lost.filter((i) => i.winner.sealed).length, lost.length),
    medianWinnerTextLen: median(lost.map((i) => i.winner.description?.length).filter((n) => n)),
    medianOurTextLen: median(lost.map((i) => i.our?.proposal?.length).filter((n) => n)),
    winnerCountries: Object.entries(lost.reduce((m, i) => { if (i.winner.country) m[i.winner.country] = (m[i.winner.country] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([country, count]) => ({ country, count })),
    bidSpeed: { winnerBeforeUs: lost.filter((i) => i.winner.submittedAt && i.our?.placedAt && new Date(i.winner.submittedAt) < new Date(i.our.placedAt)).length, compared: lost.filter((i) => i.winner.submittedAt && i.our?.placedAt).length },
  };
  return { period, items, stats };
}

const STUDY_SCHEMA = `{
  "headline": "one sentence: the main reason winners beat our bids",
  "score": <0-100 how competitive our bids are against the winners>,
  "patterns": [{ "title": "...", "evidence": "numbers from the data", "impact": "high|medium|low" }],
  "pricing": { "finding": "...", "change": "exact setting and value, e.g. Settings → Auto-Bidding → AI-suggested bid amount 85%, or Bid Profiles → <name> → Fixed-price strategy" },
  "proposal": { "finding": "what winning texts do that ours do not", "promptChanges": ["concrete lines to add/change in the proposal prompt"], "rewrite": { "projectTitle": "...", "winnerOpening": "first 2 lines of the winner's text, quoted", "ourOpening": "first 2 lines of ours, quoted", "suggestedOpening": "how ours should have opened" } },
  "profile": { "finding": "how winners' profiles differ (reviews, rating, country, rate)", "actions": ["..."] },
  "actions": [{ "priority": 1, "title": "...", "where": "BidPilot page/setting or Freelancer page", "change": "...", "why": "...", "expected": "..." }]
}`;

async function studyWinningBids(userId, period = '30d') {
  const { items, stats } = await winningBidRows(userId, period);
  const lost = items.filter((i) => !i.winner.isMine && i.our);
  if (lost.length < 3) { const e = new Error(`Only ${lost.length} lost project(s) with a stored winning bid. Click "Fetch winning bids" first, or wait for more awards; at least 3 are needed.`); e.status = 400; throw e; }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { hourlyRate: true, aiBidPercentage: true, proposalPrompt: true, skillsSummary: true } });
  const sample = lost.slice(0, 25).map((i) => ({
    title: i.title, currency: i.currency, type: i.projectType, budget: [i.budgetMin, i.budgetMax], clientCountry: i.clientCountry, totalBids: i.totalBids, avgBid: i.avgBid,
    ours: { amount: i.our.amount, period: i.our.period, replied: i.our.replied, text: String(i.our.proposal || '').slice(0, 700) },
    winner: { amount: i.winner.amount, period: i.winner.period, country: i.winner.country, rating: i.winner.rating, reviews: i.winner.reviews, hourlyRate: i.winner.hourlyRate, sealed: i.winner.sealed, text: i.winner.description ? String(i.winner.description).slice(0, 700) : '(sealed / not visible)' },
  }));
  const system = 'You are a Freelancer.com bidding coach. You compare the bids that WON projects with the bids this freelancer placed on the same projects and LOST. Find what the winners did differently (price position vs budget and vs the average bid, delivery period, how the text opens, specificity, questions, proof, length, profile strength, country, bid timing) and turn it into concrete changes to this freelancer\'s BidPilot settings and proposal prompt. The goal is MORE PROJECTS WON IN TOTAL, not a better win rate: never suggest bidding on fewer projects; suggest what makes each bid win more often at the same volume. Quote winners\' text only in short fragments. Be quantitative and specific; do not invent data. Respond with JSON only matching: ' + STUDY_SCHEMA;
  const userMsg = `Summary over ${lost.length} lost projects: ${JSON.stringify(stats)}\nOur settings: hourly rate ${user?.hourlyRate} USD, AI bid percentage ${user?.aiBidPercentage}%, custom proposal prompt: ${!!user?.proposalPrompt}. Our skills: ${String(user?.skillsSummary || '').slice(0, 300)}\n\nProject-by-project (ours vs winner):\n${JSON.stringify(sample)}`;
  const { report, model } = await askJson(userId, { system, user: userMsg, maxTokens: 3000 });
  return saveReport(userId, STUDY_ACTION, { report, model, message: `Winning-bid study (${period}, ${lost.length} lost projects): ${report.headline || ''}` });
}

const latestWinningBidStudy = (userId) => latestReport(userId, STUDY_ACTION);

module.exports = { captureWinningBid, syncWinningBids, winningBidRows, studyWinningBids, latestWinningBidStudy, STUDY_ACTION };
