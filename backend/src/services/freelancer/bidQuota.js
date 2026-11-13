// How many bids the Freelancer account has left.
//
// Every Freelancer membership comes with a monthly bid allowance that refills
// over time (Free: 6, Basic: 50, Plus: 100, Professional: 300, Premier: 1500).
// Once it is used up, every bid is rejected, so the engine checks it before
// spending OpenAI calls on a project, and the app shows it in the header.
//
// The allowance is read from the self endpoint with the membership details
// expanded. Freelancer does not document the field, so the response is
// searched for the usual names; if none is present the count is reported as
// unknown and the engine falls back to recognising the "no bids left" error
// when a bid is rejected.
const logger = require('../../utils/logger');

const CACHE_MS = 10 * 60 * 1000;         // re-read the allowance every 10 minutes
const EXHAUSTED_MS = 60 * 60 * 1000;     // after a rejected bid, wait an hour before trying again
const EXHAUSTED_MAX_MS = 6 * 60 * 60 * 1000; // repeated rejections back off up to 6 hours

// Candidate field names, most specific first. Matched against every key in
// the response, at any depth.
const REMAINING_KEYS = ['bids_remaining', 'remaining_bids', 'bids_left', 'bid_remaining', 'remaining_bid_count', 'bids_available', 'available_bids', 'bid_quota_remaining', 'bid_balance'];
const LIMIT_KEYS = ['bid_limit', 'bids_limit', 'bid_quota', 'max_bids', 'bid_allowance', 'monthly_bid_limit', 'bids_per_month'];

// Messages Freelancer returns when the allowance is used up.
const OUT_OF_BIDS_PATTERNS = [
  /used (up )?all (of )?your bids/i,   // "You have used all of your bids."
  /all (of )?your bids/i,
  /bid limit/i,
  /bids? remaining/i,
  /no (more )?bids/i,
  /out of bids/i,
  /not enough bids/i,
  /insufficient bids/i,
  /exceeded .*bid/i,
  /bid.*quota/i,
  /BID_LIMIT/i,
  /bids? (have )?(run out|ran out)/i,
  /(buy|purchase|upgrade).*more bids/i,
];

// Membership benefits often come as [{ internal_name: 'bid_limit', value: 100 }]
// rather than as a named key; these are the name/value keys to pair up.
const NAME_KEYS = ['internal_name', 'name', 'benefit', 'type', 'code', 'key', 'id'];
const VALUE_KEYS = ['remaining', 'value', 'count', 'limit', 'amount', 'quantity'];

const cache = new Map(); // userId -> quota object

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Depth-first search for the first key in `names` (order of `names` wins over
// depth). Returns { value, path } or null.
function findKey(obj, names) {
  for (const name of names) {
    const hit = findOne(obj, name, '');
    if (hit) return hit;
  }
  return null;
}
function findOne(obj, name, path, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return null;
  if (Object.prototype.hasOwnProperty.call(obj, name) && typeof obj[name] !== 'object') {
    return { value: obj[name], path: path ? `${path}.${name}` : name };
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') {
      const hit = findOne(v, name, path ? `${path}.${k}` : k, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// Benefit-style entries: an object whose name field matches `namePattern`
// (e.g. /^bids?(_limit)?$/) with a numeric value field next to it. Returns
// { value, path } for the first match, searching depth-first.
function findBenefit(obj, namePattern, valueKeys, path = '', depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return null;
  if (!Array.isArray(obj)) {
    const nameKey = NAME_KEYS.find(k => typeof obj[k] === 'string' && namePattern.test(obj[k]));
    if (nameKey) {
      const valueKey = valueKeys.find(k => toNumber(obj[k]) !== null);
      if (valueKey) return { value: obj[valueKey], path: `${path ? path + '.' : ''}${valueKey}[${obj[nameKey]}]` };
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') {
      const hit = findBenefit(v, namePattern, valueKeys, path ? `${path}.${k}` : k, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// Every key path that mentions "bid", for the log when the count is unknown.
function bidKeyPaths(obj, path = '', out = [], depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6 || out.length >= 40) return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (/bid/i.test(k)) out.push(typeof v === 'object' ? p : `${p}=${JSON.stringify(v)}`);
    if (v && typeof v === 'object') bidKeyPaths(v, p, out, depth + 1);
  }
  return out;
}

function isOutOfBidsError(message) {
  const text = String(message || '');
  return OUT_OF_BIDS_PATTERNS.some(p => p.test(text));
}

async function fetchBidQuota(client) {
  const response = await client.get('/users/0.1/self/', {
    params: { membership_details: true, limited_account: true, bid_quality_details: true },
  });
  const result = response.data?.result || {};
  const remaining = findKey(result, REMAINING_KEYS)
    || findBenefit(result, /^(bids?_)?remaining(_bids?)?$|^bids?_left$|^bids?_balance$/i, ['remaining', 'value', 'count', 'amount']);
  const limit = findKey(result, LIMIT_KEYS)
    || findBenefit(result, /^bids?(_limit|_quota|_allowance|_count)?$|^(monthly_)?bid_limit$/i, VALUE_KEYS);
  const keys = bidKeyPaths(result);
  const quota = {
    remaining: toNumber(remaining?.value),
    limit: toNumber(limit?.value),
    source: remaining?.path || null,
    limitSource: limit?.path || null,
    membership: result.membership_package?.name || result.membership?.package?.name || null,
    keys,                       // bid-related key paths, for diagnosing an unknown count
    fetchedAt: Date.now(),
    exhaustedUntil: null,
    error: null,
  };
  if (quota.remaining === null) {
    logger.info(`Freelancer bid allowance not found in the self response; bid-related keys: ${keys.join(', ') || '(none)'}`);
  } else {
    logger.info(`Freelancer bids left: ${quota.remaining}${quota.limit !== null ? ` of ${quota.limit}` : ''} (from ${quota.source})`);
  }
  return quota;
}

// Cached read. `client` is a Freelancer API client for the user; without one
// only the cache is consulted.
async function getBidQuota(userId, client, { force = false } = {}) {
  const cached = cache.get(userId);
  const now = Date.now();
  if (cached && cached.exhaustedUntil && cached.exhaustedUntil > now) return cached;
  if (!force && cached && now - cached.fetchedAt < CACHE_MS) return cached;
  if (!client) return cached || null;
  try {
    const quota = await fetchBidQuota(client);
    // Freelancer not reporting the count says nothing about earlier
    // rejections, so the strike count carries over; a reported count resets it.
    if (quota.remaining === null && cached) {
      quota.rejections = cached.rejections || 0;
      quota.lastRejection = cached.lastRejection;
      quota.lastRejectionAt = cached.lastRejectionAt;
    }
    cache.set(userId, quota);
    return quota;
  } catch (err) {
    const status = err.response?.status;
    logger.warn(`Could not read the Freelancer bid allowance: HTTP ${status ?? 'NETWORK'} ${err.message}`);
    const failed = { ...(cached || { remaining: null, limit: null, source: null, limitSource: null, membership: null }), fetchedAt: now, error: err.message };
    cache.set(userId, failed);
    return failed;
  }
}

function getCachedBidQuota(userId) {
  return cache.get(userId) || null;
}

// Freelancer rejected a bid because the allowance is used up: treat the
// account as empty, whatever the self endpoint says. The first rejection
// pauses for an hour; each further rejection in a row doubles the pause (up
// to six hours) so an empty account is not re-tried every hour for days.
// `at` lets a rejection recorded earlier (e.g. before an app restart) be
// replayed with its original time.
function markBidsExhausted(userId, message, { at = Date.now() } = {}) {
  const prev = cache.get(userId) || { limit: null, source: null, limitSource: null, membership: null };
  const strikes = (prev.rejections || 0) + 1;
  const waitMs = Math.min(EXHAUSTED_MS * 2 ** (strikes - 1), EXHAUSTED_MAX_MS);
  cache.set(userId, {
    ...prev,
    remaining: 0,
    fetchedAt: at,
    exhaustedUntil: at + waitMs,
    rejections: strikes,
    error: null,
    lastRejection: String(message || ''),
    lastRejectionAt: at,
  });
}

// A bid went through: count it down so the cache stays honest between reads,
// and forget earlier rejections — the allowance has clearly refilled.
function noteBidPlaced(userId) {
  const q = cache.get(userId);
  if (!q) return;
  if (typeof q.remaining === 'number' && q.remaining > 0) q.remaining -= 1;
  q.rejections = 0;
  q.exhaustedUntil = null;
}

// After a restart the in-memory cache is empty, so a recent "no bids left"
// rejection stored with a bid is replayed from the database. Returns true when
// the account is (still) marked empty.
async function restoreExhaustedFromDb(userId, prisma) {
  const q = cache.get(userId);
  if (q && (q.exhaustedUntil || q.lastRejectionAt)) return !!(q.exhaustedUntil && q.exhaustedUntil > Date.now());
  const since = new Date(Date.now() - EXHAUSTED_MAX_MS);
  // Bids have no updated-at column; a failed placement is recorded moments
  // after the row is created, so created-at is close enough.
  const recent = await prisma.bid.findMany({
    where: { userId, status: 'error', createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { errorMessage: true, createdAt: true },
  });
  const rejections = recent.filter(b => isOutOfBidsError(b.errorMessage)).reverse();
  if (rejections.length === 0) return false;
  // Any bid placed after the last rejection means the allowance refilled.
  const last = rejections[rejections.length - 1].createdAt;
  const placedSince = await prisma.bid.count({ where: { userId, status: 'placed', placedAt: { gt: last } } });
  if (placedSince > 0) return false;
  for (const r of rejections) markBidsExhausted(userId, r.errorMessage, { at: r.createdAt.getTime() });
  const now = cache.get(userId);
  return !!(now.exhaustedUntil && now.exhaustedUntil > Date.now());
}

function clearBidQuota(userId) {
  cache.delete(userId);
}

module.exports = { getBidQuota, getCachedBidQuota, markBidsExhausted, noteBidPlaced, restoreExhaustedFromDb, clearBidQuota, isOutOfBidsError, fetchBidQuota, findKey, findBenefit, bidKeyPaths, CACHE_MS, EXHAUSTED_MS, EXHAUSTED_MAX_MS };
