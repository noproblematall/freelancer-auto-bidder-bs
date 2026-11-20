// Learns from the account's own outcomes. Replies and awards recorded by
// outcomeSync / the message poller are grouped by skill and client country;
// segments that clearly out- or under-perform the account's average move a
// project's relevance score by a few points before the threshold is applied.
//
// Deliberately small and explainable: at most ±10 points, only with enough
// history (30 sent bids overall, 10 in a segment), and every point is named
// in `reasons` so the Projects page can show it.
const prisma = require('../../config/database');
const logger = require('../../utils/logger');

const CACHE_MS = 60 * 60 * 1000;
const HISTORY_DAYS = 180;
const MIN_TOTAL = 30;
const MIN_SEGMENT = 10;
const SENT = ['placed', 'converted', 'rejected', 'retracted'];
const cache = new Map(); // userId -> { signals, at }

// A reply is worth 1, an award 3: awards are rare, replies are the early signal.
const outcomeValue = (b) => (b.awardStatus === 'awarded' ? 3 : (b.clientRepliedAt || b.status === 'converted') ? 1 : 0);

function bump(map, key, bid) {
  if (!key) return;
  const row = map.get(key) || { key, sent: 0, replied: 0, won: 0, value: 0 };
  row.sent++;
  if (bid.clientRepliedAt || bid.status === 'converted') row.replied++;
  if (bid.awardStatus === 'awarded') row.won++;
  row.value += outcomeValue(bid);
  map.set(key, row);
}

async function computeSignals(userId) {
  const since = new Date(Date.now() - HISTORY_DAYS * 86400000);
  const bids = await prisma.bid.findMany({
    where: { userId, status: { in: SENT }, createdAt: { gte: since } },
    select: {
      status: true, awardStatus: true, clientRepliedAt: true,
      project: { select: { jobIds: true, ownerCountry: true } },
    },
  });
  const skills = new Map();
  const countries = new Map();
  let value = 0;
  for (const b of bids) {
    value += outcomeValue(b);
    bump(countries, b.project?.ownerCountry, b);
    let jobs = [];
    try { jobs = b.project?.jobIds ? JSON.parse(b.project.jobIds) : []; } catch { jobs = []; }
    for (const j of jobs) bump(skills, typeof j === 'object' ? j.name : null, b);
  }
  return {
    sentTotal: bids.length,
    avgValue: bids.length ? value / bids.length : 0,
    skills, countries,
    generatedAt: Date.now(),
  };
}

async function getLearningSignals(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.signals;
  try {
    const signals = await computeSignals(userId);
    cache.set(userId, { signals, at: Date.now() });
    return signals;
  } catch (err) {
    logger.warn(`Learning signals failed for user ${userId}: ${err.message}`);
    return null;
  }
}

function clearLearningCache(userId) {
  if (userId) cache.delete(userId); else cache.clear();
}

// Per-segment adjustment: compares the segment's average outcome value with
// the account's. Returns points and a reason, or null when nothing is learned.
function segmentPoints(row, avg, scale, label) {
  if (!row || row.sent < MIN_SEGMENT) return null;
  const rate = row.value / row.sent;
  if (avg > 0 && rate >= avg * 1.5 && row.value > 0) {
    return { points: scale, reason: `+${scale} ${label}: ${row.replied} replies / ${row.won} awards from ${row.sent} bids (above your average)` };
  }
  if (row.value === 0 && row.sent >= MIN_SEGMENT + 5) {
    return { points: -scale, reason: `-${scale} ${label}: no reply from ${row.sent} bids` };
  }
  if (avg > 0 && rate <= avg * 0.33) {
    return { points: -Math.ceil(scale / 2), reason: `-${Math.ceil(scale / 2)} ${label}: ${row.replied} replies from ${row.sent} bids (well below your average)` };
  }
  return null;
}

function learningBoost(signals, project) {
  if (!signals || signals.sentTotal < MIN_TOTAL) return { boost: 0, reasons: [] };
  const reasons = [];
  let boost = 0;
  let jobs = [];
  try { jobs = project.jobNames || (project.jobIds ? JSON.parse(project.jobIds) : []); } catch { jobs = []; }
  let skillPoints = 0;
  for (const j of jobs) {
    const name = typeof j === 'object' ? j.name : null;
    const r = segmentPoints(signals.skills.get(name), signals.avgValue, 3, `skill ${name}`);
    if (r && Math.abs(skillPoints + r.points) <= 6) { skillPoints += r.points; reasons.push(r.reason); }
  }
  boost += skillPoints;
  const c = segmentPoints(signals.countries.get(project.ownerCountry), signals.avgValue, 4, `clients in ${project.ownerCountry}`);
  if (c) { boost += c.points; reasons.push(c.reason); }
  boost = Math.max(-10, Math.min(10, boost));
  return { boost, reasons };
}

module.exports = { getLearningSignals, learningBoost, clearLearningCache, MIN_TOTAL, MIN_SEGMENT };
