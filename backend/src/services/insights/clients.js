// Client explorer: the best employers among the projects BidPilot has seen,
// their project history and the bids on those projects (read live from
// Freelancer), and an AI study of how to win with each one.
const prisma = require('../../config/database');
const { createFreelancerClient } = require('../freelancer/client');
const { getProjectBids, getAwardedBids } = require('../freelancer/bids');
const { decrypt, isExpired } = require('../../utils/tokenManager');
const { askJson, saveReport, latestReport } = require('./ai');
const logger = require('../../utils/logger');

const STUDY_ACTION = 'ai_client_study';
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // key -> { at, value }
const cached = async (key, fn) => { const hit = cache.get(key); if (hit && Date.now() - hit.at < CACHE_MS) return hit.value; const value = await fn(); cache.set(key, { at: Date.now(), value }); return value; };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function flClientFor(userId) {
  const token = await prisma.freelancerToken.findUnique({ where: { userId } });
  if (!token || isExpired(token.expiresAt)) { const e = new Error('Freelancer is not connected. Connect it in Settings.'); e.status = 400; throw e; }
  return { client: createFreelancerClient(decrypt(token.accessToken)), myUid: Number(token.freelancerUid) || null };
}

const cityOf = (ownerLocation) => { try { return JSON.parse(ownerLocation || 'null')?.city || null; } catch { return null; } };

// Employers ranked from the projects table: quality (client score, hire
// history, rating) first, then how much we have seen of them. Freelancer hides
// who the client is, so projects are grouped by the anonymous owner key
// (registration time + country + city, see projectMapper.js); `ownerId` in
// the rows is that key.
async function topClients(userId, { period = '30d', limit = 40 } = {}) {
  const days = { '30d': 30, '90d': 90, '180d': 180, all: null }[period] ?? 30;
  const since = days ? new Date(Date.now() - days * 86400000) : null;
  const projects = await prisma.project.findMany({
    where: { ownerKey: { not: null }, ...(since ? { discoveredAt: { gte: since } } : {}) },
    select: {
      ownerKey: true, ownerName: true, ownerUsername: true, ownerCountry: true, ownerLocation: true, ownerPaymentVerified: true, ownerDepositMade: true, ownerReviews: true, ownerRating: true,
      ownerProjectsComplete: true, ownerProjectsAll: true, ownerRegisteredAt: true, clientScore: true, discoveredAt: true, budgetMax: true, currency: true, title: true, jobIds: true,
      bids: { where: { userId }, select: { status: true, awardStatus: true, clientRepliedAt: true } },
      winningBid: { select: { isMine: true, ourFreelancerBidId: true } },
    },
  });
  const byOwner = new Map();
  for (const p of projects) {
    const o = byOwner.get(p.ownerKey) || { ownerId: p.ownerKey, name: null, username: null, city: null, country: null, paymentVerified: null, depositMade: null, reviews: null, rating: null, projectsComplete: null, projectsAll: null, registeredAt: null, clientScore: null, seen: 0, bids: 0, replied: 0, won: 0, lastSeen: null, budgets: [], skills: new Map(), titles: [] };
    o.seen++;
    if (p.ownerName) o.name = p.ownerName;
    if (p.ownerUsername) o.username = p.ownerUsername;
    if (p.ownerCountry) o.country = p.ownerCountry;
    const city = cityOf(p.ownerLocation);
    if (city) o.city = city;
    // Facts from the newest project win: reviews and hire counts only grow.
    const newest = !o.lastSeen || p.discoveredAt >= o.lastSeen;
    for (const k of ['paymentVerified', 'depositMade', 'reviews', 'rating', 'projectsComplete', 'projectsAll', 'registeredAt']) {
      const v = p[`owner${k[0].toUpperCase()}${k.slice(1)}`];
      if (v !== null && v !== undefined && (newest || o[k] === null)) o[k] = v;
    }
    if (p.clientScore !== null) o.clientScore = Math.max(o.clientScore ?? 0, p.clientScore);
    if (newest) o.lastSeen = p.discoveredAt;
    if (p.budgetMax && p.currency === 'USD') o.budgets.push(p.budgetMax);
    if (o.titles.length < 3) o.titles.push(p.title);
    try { for (const j of JSON.parse(p.jobIds || '[]')) { const n = typeof j === 'object' ? j.name : null; if (n) o.skills.set(n, (o.skills.get(n) || 0) + 1); } } catch { /* ignore */ }
    // Our bids: placed through this app, or read from the Freelancer bid
    // history by the Market page's winner sync (bids from the desktop app too).
    if (p.bids.length) {
      for (const b of p.bids) {
        o.bids++;
        if (b.clientRepliedAt || b.status === 'converted') o.replied++;
        if (b.awardStatus === 'awarded') o.won++;
      }
    } else if (p.winningBid?.ourFreelancerBidId) {
      o.bids++;
      if (p.winningBid.isMine) o.won++;
    }
    byOwner.set(p.ownerKey, o);
  }
  for (const o of byOwner.values()) if (!o.name && !o.username) o.name = o.city ? `Client in ${o.city}` : 'Anonymous client';
  const rows = [...byOwner.values()].map((o) => ({
    ...o,
    budgets: undefined, skills: [...o.skills.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name),
    typicalBudgetUsd: o.budgets.length ? Math.round(o.budgets.reduce((a, b) => a + b, 0) / o.budgets.length) : null,
    rank: (o.clientScore ?? 0) + Math.min(20, (o.projectsComplete || 0)) + Math.min(10, o.reviews || 0) + (o.won ? 25 : 0) + (o.replied ? 10 : 0) + Math.min(5, o.seen),
  }));
  rows.sort((a, b) => b.rank - a.rank || (b.lastSeen?.getTime?.() || 0) - (a.lastSeen?.getTime?.() || 0));
  return { period, clients: rows.slice(0, limit), total: rows.length };
}

// The client's projects BidPilot has seen (grouped by the anonymous owner key;
// Freelancer no longer lists a client's projects by owner), newest first, with
// their current state and winner read live from Freelancer.
async function clientHistory(userId, ownerKey) {
  const { client, myUid } = await flClientFor(userId);
  return cached(`history:${userId}:${ownerKey}`, async () => {
    const rows = await prisma.project.findMany({
      where: { ownerKey },
      orderBy: [{ timeSubmitted: 'desc' }, { discoveredAt: 'desc' }],
      take: 40,
      include: {
        winningBid: true,
        bids: { where: { userId }, orderBy: { id: 'desc' }, take: 1, select: { id: true, amount: true, status: true, awardStatus: true } },
      },
    });
    if (!rows.length) { const e = new Error('No projects stored for this client.'); e.status = 404; throw e; }

    // Live state of those projects and the winners of the closed ones.
    const ids = rows.map((r) => r.freelancerProjectId);
    const live = new Map();
    const winners = new Map();
    try {
      const r = await client.get('/projects/0.1/projects/', { params: { 'projects[]': ids, limit: ids.length, job_details: true } });
      for (const p of r.data?.result?.projects || []) live.set(p.id, p);
      const closed = [...live.values()].filter((p) => p.status === 'closed').map((p) => p.id);
      for (let i = 0; i < closed.length; i += 20) {
        const { bids } = await getAwardedBids(client, closed.slice(i, i + 20));
        for (const b of bids) if (!winners.has(b.project_id) || Number(b.bidder_id) === myUid) winners.set(b.project_id, b);
      }
    } catch (err) {
      logger.warn(`client explorer: live state of ${ids.length} projects not read: ${err.message}`);
    }

    const projects = rows.map((r) => {
      const p = live.get(r.freelancerProjectId) || {};
      const w = winners.get(r.freelancerProjectId);
      const stored = r.winningBid;
      const awarded = w
        ? { bidderId: w.bidder_id, amount: num(w.amount) || null, period: num(w.period), isMine: !!myUid && Number(w.bidder_id) === myUid, awardedAt: num(w.time_awarded) ? new Date(w.time_awarded * 1000) : null }
        : stored ? { bidderId: stored.bidderId, amount: stored.amount, period: stored.period, isMine: stored.isMine, awardedAt: null } : null;
      const local = r.bids[0];
      const ourBid = local ? { id: local.id, amount: local.amount, status: local.status, awardStatus: local.awardStatus }
        : stored?.ourFreelancerBidId ? { id: null, amount: stored.ourAmount, status: 'placed', awardStatus: stored.isMine ? 'awarded' : 'lost' } : null;
      let skills = [];
      try { skills = JSON.parse(r.jobIds || '[]').map((j) => (typeof j === 'object' ? j.name : null)).filter(Boolean); } catch { /* ignore */ }
      return {
        freelancerProjectId: r.freelancerProjectId, title: r.title, status: p.status || r.status, frontendStatus: p.frontend_project_status || null,
        type: r.projectType, currency: r.currency, budgetMin: r.budgetMin, budgetMax: r.budgetMax,
        bidCount: p.bid_stats?.bid_count ?? r.bidCount, bidAvg: num(p.bid_stats?.bid_avg) ?? r.bidAvg, postedAt: r.timeSubmitted,
        skills, awarded, ourBid, url: `https://www.freelancer.com/projects/${r.freelancerProjectId}`,
      };
    });
    const awarded = projects.filter((p) => p.awarded);
    const latest = rows[0];
    const city = rows.map((r) => cityOf(r.ownerLocation)).find(Boolean) || null;
    return {
      ownerId: ownerKey,
      employer: {
        name: city ? `Client in ${city}` : 'Anonymous client', username: null, avatar: null,
        country: latest.ownerCountry, city, registeredAt: latest.ownerRegisteredAt,
        paymentVerified: !!latest.ownerPaymentVerified, depositMade: !!latest.ownerDepositMade, identityVerified: false,
        rating: latest.ownerReviews ? latest.ownerRating : null, reviews: latest.ownerReviews, projectsAll: latest.ownerProjectsAll, projectsComplete: latest.ownerProjectsComplete,
        onBudget: null, onTime: null, earnings: null, url: null,
      },
      totalProjects: latest.ownerProjectsAll,
      projects,
      summary: {
        posted: projects.length, awarded: awarded.length, hireRate: projects.length ? Math.round((awarded.length / projects.length) * 100) : null,
        medianAwardVsBudget: (() => { const xs = awarded.filter((p) => p.awarded.amount && p.budgetMax).map((p) => p.awarded.amount / p.budgetMax); if (!xs.length) return null; const s = xs.sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)] * 100) / 100; })(),
        skills: Object.entries(projects.flatMap((p) => p.skills).reduce((m, s) => { m[s] = (m[s] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
      },
    };
  });
}

// Live: every bid on one of the client's projects, winner first.
async function clientProjectBids(userId, freelancerProjectId) {
  const { client, myUid } = await flClientFor(userId);
  return cached(`bids:${userId}:${freelancerProjectId}`, async () => {
    const { bids, users } = await getProjectBids(client, freelancerProjectId);
    const rows = bids.map((b) => {
      const u = users?.[String(b.bidder_id)] || {};
      const rep = u.reputation?.entire_history || {};
      return {
        bidId: b.id, bidderId: b.bidder_id, isMine: !!myUid && Number(b.bidder_id) === Number(myUid),
        name: u.display_name || u.public_name || null, username: u.username || null, country: u.location?.country?.code || null,
        rating: num(rep.overall), reviews: num(rep.reviews), hourlyRate: num(u.hourly_rate),
        amount: num(b.amount), period: num(b.period), awarded: String(b.award_status || '').toLowerCase() === 'awarded', awardStatus: b.award_status || null,
        sealed: !!b.sealed, highlighted: !!b.highlighted, description: b.sealed ? null : (b.description || null), submittedAt: num(b.time_submitted) ? new Date(b.time_submitted * 1000) : null,
      };
    });
    rows.sort((a, b) => (b.awarded - a.awarded) || (b.isMine - a.isMine) || ((a.submittedAt?.getTime?.() || 0) - (b.submittedAt?.getTime?.() || 0)));
    return { freelancerProjectId, bids: rows, total: rows.length };
  });
}

const CLIENT_SCHEMA = `{
  "headline": "one sentence on this client and whether to pursue them",
  "priority": "high|medium|low",
  "whatTheyHire": ["kinds of work, with budgets and how often"],
  "whoTheyPick": { "pricePosition": "where winning bids sit vs the budget and the average bid", "profile": "ratings/reviews/countries of the freelancers they awarded", "timing": "how fast after posting winners bid, if visible", "textStyle": "what the winning texts have in common" },
  "howToPitch": ["concrete, ordered steps for the next project from this client"],
  "pitchOpening": "the first two lines of a bid to this client, written for their style",
  "watchOuts": ["risks or red flags, if any"]
}`;

async function studyClient(userId, ownerId) {
  const history = await clientHistory(userId, ownerId);
  const awardedProjects = history.projects.filter((p) => p.awarded).slice(0, 6);
  const bidSamples = [];
  for (const p of awardedProjects) {
    try {
      const { bids } = await clientProjectBids(userId, p.freelancerProjectId);
      const winner = bids.find((b) => b.awarded);
      const others = bids.filter((b) => !b.awarded);
      const amounts = others.map((b) => b.amount).filter((a) => a);
      bidSamples.push({
        title: p.title, budget: [p.budgetMin, p.budgetMax, p.currency], totalBids: bids.length,
        avgOtherBid: amounts.length ? Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length) : null,
        winner: winner ? { amount: winner.amount, period: winner.period, country: winner.country, rating: winner.rating, reviews: winner.reviews, text: winner.description ? winner.description.slice(0, 600) : '(sealed)', minutesAfterPost: winner.submittedAt && p.postedAt ? Math.round((new Date(winner.submittedAt) - new Date(p.postedAt)) / 60000) : null } : null,
        ourBid: p.ourBid,
      });
    } catch (err) {
      logger.warn(`client study: bids for project ${p.freelancerProjectId} not read: ${err.message}`);
    }
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { hourlyRate: true, skillsSummary: true } });
  const system = 'You are a Freelancer.com bidding coach studying ONE client (employer) so this freelancer can win their next project. Use the client\'s profile, their posted projects, and the bids on the projects they awarded. Say what they hire, what they pay relative to budget, whom they pick and why, and exactly how to pitch them. Quote winning texts only in short fragments. Be specific and quantitative; do not invent data; say when the sample is small. Respond with JSON only matching: ' + CLIENT_SCHEMA;
  const userMsg = `Client: ${JSON.stringify(history.employer)}\nSummary: ${JSON.stringify(history.summary)}\nProjects (newest first, up to 40): ${JSON.stringify(history.projects.slice(0, 40).map((p) => ({ title: p.title, status: p.frontendStatus || p.status, budget: [p.budgetMin, p.budgetMax, p.currency], type: p.type, bids: p.bidCount, avgBid: p.bidAvg, skills: p.skills.slice(0, 5), awarded: p.awarded ? { amount: p.awarded.amount, period: p.awarded.period, isMe: p.awarded.isMine } : null, ourBid: p.ourBid })))}\nBids on awarded projects: ${JSON.stringify(bidSamples)}\nMe: hourly rate ${user?.hourlyRate} USD; skills: ${String(user?.skillsSummary || '').slice(0, 300)}`;
  const { report, model } = await askJson(userId, { system, user: userMsg, maxTokens: 2200 });
  return saveReport(userId, STUDY_ACTION, { report, model, subject: ownerId, message: `Client study for ${history.employer?.name || history.employer?.username || `#${ownerId}`}: ${report.headline || ''}` });
}

const latestClientStudy = (userId, ownerId) => latestReport(userId, STUDY_ACTION, ownerId);

module.exports = { topClients, clientHistory, clientProjectBids, studyClient, latestClientStudy, STUDY_ACTION };
