// Winning bids: once a project we bid on is awarded, read the bid that won
// it (amount, period, text unless sealed, who the freelancer is) and keep it
// next to ours. The Market page shows the comparison and the AI study turns
// the pattern into changes to our pricing, prompt and profile.
const prisma = require('../../config/database');
const { createFreelancerClient } = require('../freelancer/client');
const { getAwardedBids, getAccountBids } = require('../freelancer/bids');
const { projectDataFromApi, forPrisma } = require('../freelancer/projectMapper');
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

// Freelancer reports 0 as the amount of many awarded bids (the agreed price is
// private); 0 means "not shown", never a free bid.
const amountOrNull = (v) => (num(v) && v > 0 ? v : null);

function winnerData(winner, users, { myUid, totalBids, avgBid, ourBid }) {
  return {
    freelancerBidId: winner.id || null,
    bidderId: winner.bidder_id || null,
    ...bidderFacts(users, winner.bidder_id),
    amount: amountOrNull(winner.amount),
    period: num(winner.period),
    description: winner.sealed ? null : (winner.description || null),
    sealed: !!winner.sealed,
    highlighted: !!winner.highlighted,
    bidSubmittedAt: num(winner.time_submitted) ? new Date(winner.time_submitted * 1000) : null,
    isMine: !!myUid && Number(winner.bidder_id) === Number(myUid),
    totalBids: num(totalBids),
    avgBid: amountOrNull(avgBid),
    fetchedAt: new Date(),
    ...(ourBid ? {
      ourFreelancerBidId: ourBid.id || null,
      ourAmount: amountOrNull(ourBid.amount),
      ourPeriod: num(ourBid.period),
      ourText: ourBid.description || null,
      ourPlacedAt: num(ourBid.time_submitted) ? new Date(ourBid.time_submitted * 1000) : null,
    } : {}),
  };
}

// Read the awarded bid on one project from Freelancer and store it (used by
// the 30-minute outcome check for bids this app placed).
async function captureWinningBid(client, { project, myUid }) {
  const { bids, users } = await getAwardedBids(client, [project.freelancerProjectId]);
  const winner = bids.find((b) => Number(b.bidder_id) === Number(myUid)) || bids[0];
  if (!winner) return null;
  const data = winnerData(winner, users, { myUid, totalBids: project.bidCount, avgBid: project.bidAvg });
  const row = await prisma.winningBid.upsert({ where: { projectId: project.id }, update: data, create: { projectId: project.id, ...data } });
  logger.info(`Winning bid captured for project #${project.id}: ${data.amount ?? 'amount hidden'} by ${data.bidderName || data.bidderId}${data.isMine ? ' (ours)' : ''}`);
  return row;
}

// Every project the account bid on in the last HISTORY_DAYS, read from
// Freelancer itself, so bids placed by the desktop app or on the website count
// too, not only the ones in this app's database. Decided (closed) projects get
// their winner stored next to our bid; projects still open are left for a
// later click.
const HISTORY_DAYS = 180;
const PROJECTS_PER_CALL = 50;
const WINNERS_PER_CALL = 20;

async function syncWinningBids(userId) {
  const token = await prisma.freelancerToken.findUnique({ where: { userId } });
  if (!token || isExpired(token.expiresAt)) { const e = new Error('Freelancer is not connected. Connect it in Settings.'); e.status = 400; throw e; }
  const client = createFreelancerClient(decrypt(token.accessToken));
  const myUid = Number(token.freelancerUid) || null;
  if (!myUid) { const e = new Error('The Freelancer user id is unknown. Reconnect Freelancer in Settings.'); e.status = 400; throw e; }
  const errors = [];
  const fail = (what, err) => {
    const msg = `${what}: HTTP ${err.response?.status ?? 'NETWORK'} ${err.response?.data?.message || err.message}`;
    logger.warn(`winningBids: ${msg}`);
    errors.push(msg);
    return err.response?.status === 401 || err.response?.status === 403;
  };

  // 1. The account's bids, newest first; the latest bid per project.
  const sinceSec = Math.floor(Date.now() / 1000) - HISTORY_DAYS * 86400;
  let accountBids;
  try { accountBids = await getAccountBids(client, myUid, { sinceSec }); } catch (err) { fail('reading your bids', err); return { bidsRead: 0, checked: 0, captured: 0, noWinner: 0, open: 0, errors }; }
  const ourByProject = new Map();
  for (const b of accountBids) {
    const prev = ourByProject.get(b.project_id);
    if (!prev || (b.time_submitted || 0) > (prev.time_submitted || 0)) ourByProject.set(b.project_id, b);
  }

  // 2. Skip projects whose winner is already stored.
  const allIds = [...ourByProject.keys()];
  const storedRows = await prisma.winningBid.findMany({
    where: { project: { freelancerProjectId: { in: allIds } } },
    select: { id: true, ourFreelancerBidId: true, project: { select: { freelancerProjectId: true } } },
  });
  const stored = new Set(storedRows.map((r) => r.project.freelancerProjectId));
  // Rows stored before our own bid was kept next to the winner: fill it in.
  for (const r of storedRows) {
    const ours = ourByProject.get(r.project.freelancerProjectId);
    if (ours && !r.ourFreelancerBidId) {
      await prisma.winningBid.update({ where: { id: r.id }, data: {
        ourFreelancerBidId: ours.id || null, ourAmount: amountOrNull(ours.amount), ourPeriod: num(ours.period),
        ourText: ours.description || null, ourPlacedAt: num(ours.time_submitted) ? new Date(ours.time_submitted * 1000) : null,
      } }).catch(() => {});
    }
  }
  // Closed projects already searched without a winner: closed is final.
  // (One query over all checked projects, filtered here: an IN list of
  // thousands of ids next to a NOT NULL filter exceeds SQLite's limits.)
  const ourIds = new Set(allIds);
  const checkedRows = await prisma.project.findMany({ where: { winnerCheckedAt: { not: null } }, select: { freelancerProjectId: true } });
  const checkedBefore = new Set(checkedRows.map((r) => r.freelancerProjectId).filter((id) => ourIds.has(id) && !stored.has(id)));
  const pendingIds = allIds.filter((id) => !stored.has(id) && !checkedBefore.has(id));

  // 3. Current state of those projects; keep a local row for each one decided.
  const decided = []; // { local, api }
  let open = 0;
  let stop = false;
  for (let i = 0; i < pendingIds.length && !stop; i += PROJECTS_PER_CALL) {
    const ids = pendingIds.slice(i, i + PROJECTS_PER_CALL);
    let projects = [];
    try {
      const r = await client.get('/projects/0.1/projects/', { params: { 'projects[]': ids, limit: ids.length, job_details: true, owner_info: true } });
      projects = r.data?.result?.projects || [];
    } catch (err) { stop = fail(`reading ${ids.length} projects`, err); continue; }
    for (const p of projects) {
      if (p.status !== 'closed') { open++; continue; }
      const ours = ourByProject.get(p.id);
      const data = forPrisma(projectDataFromApi(p, {}));
      const local = await prisma.project.upsert({
        where: { freelancerProjectId: p.id },
        update: { status: data.status, bidCount: data.bidCount, bidAvg: data.bidAvg, lastCheckedAt: new Date() },
        // Filed under the time of our bid so old projects do not land on top of the Projects page.
        create: { ...data, discoveredAt: ours?.time_submitted ? new Date(ours.time_submitted * 1000) : new Date() },
      });
      decided.push({ local, api: p });
    }
  }

  // 4. The winner of each decided project, many projects per request.
  let captured = 0;
  let noWinner = 0;
  for (let i = 0; i < decided.length && !stop; i += WINNERS_PER_CALL) {
    const group = decided.slice(i, i + WINNERS_PER_CALL);
    let res;
    try { res = await getAwardedBids(client, group.map((g) => g.api.id)); } catch (err) { stop = fail(`reading winners of ${group.length} projects`, err); continue; }
    await prisma.project.updateMany({ where: { id: { in: group.map((g) => g.local.id) } }, data: { winnerCheckedAt: new Date() } });
    for (const { local, api } of group) {
      const awarded = res.bids.filter((b) => b.project_id === api.id);
      const winner = awarded.find((b) => Number(b.bidder_id) === myUid) || awarded[0];
      if (!winner) { noWinner++; continue; }
      const data = winnerData(winner, res.users, { myUid, totalBids: api.bid_stats?.bid_count, avgBid: api.bid_stats?.bid_avg, ourBid: ourByProject.get(api.id) });
      await prisma.winningBid.upsert({ where: { projectId: local.id }, update: data, create: { projectId: local.id, ...data } });
      captured++;
    }
  }
  noWinner += checkedBefore.size;
  logger.info(`winningBids: ${accountBids.length} account bids on ${allIds.length} projects; ${stored.size} winners already stored, ${captured} new, ${noWinner} closed without a winner, ${open} still open`);
  return { bidsRead: accountBids.length, projects: allIds.length, alreadyStored: stored.size, checked: decided.length, captured, noWinner, open, errors };
}

// Rows for the Market page plus the headline numbers.
async function winningBidRows(userId, period = '30d') {
  const days = PERIOD_DAYS[period] === undefined ? 30 : PERIOD_DAYS[period];
  const since = days ? new Date(Date.now() - days * 86400000) : null;
  // Projects we bid on: through this app (a row in `bids`) or anywhere else
  // (our bid read from the account's Freelancer history). The period is when
  // the project was posted, not when its winner was fetched.
  const rows = await prisma.winningBid.findMany({
    where: {
      OR: [{ project: { bids: { some: { userId } } } }, { ourFreelancerBidId: { not: null } }],
      ...(since ? { project: { OR: [{ timeSubmitted: { gte: since } }, { timeSubmitted: null, discoveredAt: { gte: since } }] } } : {}),
    },
    orderBy: [{ project: { timeSubmitted: 'desc' } }, { fetchedAt: 'desc' }], take: 2000,
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
    const local = w.project.bids[0] || null;
    const our = local ? { ...local, amount: local.amount || w.ourAmount, periodDays: local.periodDays || w.ourPeriod, proposalText: local.proposalText || w.ourText }
      : w.ourFreelancerBidId ? { id: null, amount: w.ourAmount, periodDays: w.ourPeriod, status: 'placed', awardStatus: w.isMine ? 'awarded' : 'lost', proposalText: w.ourText, placedAt: w.ourPlacedAt, sealed: false, clientRepliedAt: null }
      : null;
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
