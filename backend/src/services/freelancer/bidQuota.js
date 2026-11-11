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

// Candidate field names, most specific first. Matched against every key in
// the response, at any depth.
const REMAINING_KEYS = ['bids_remaining', 'remaining_bids', 'bids_left', 'bid_remaining', 'remaining_bid_count', 'bids_available', 'available_bids', 'bid_quota_remaining', 'bid_balance'];
const LIMIT_KEYS = ['bid_limit', 'bids_limit', 'bid_quota', 'max_bids', 'bid_allowance', 'monthly_bid_limit', 'bids_per_month'];

// Messages Freelancer returns when the allowance is used up.
const OUT_OF_BIDS_PATTERNS = [
  /bid limit/i,
  /bids? remaining/i,
  /no (more )?bids/i,
  /out of bids/i,
  /not enough bids/i,
  /insufficient bids/i,
  /exceeded .*bid/i,
  /bid.*quota/i,
  /BID_LIMIT/i,
];

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
  const remaining = findKey(result, REMAINING_KEYS);
  const limit = findKey(result, LIMIT_KEYS);
  const quota = {
    remaining: toNumber(remaining?.value),
    limit: toNumber(limit?.value),
    source: remaining?.path || null,
    limitSource: limit?.path || null,
    membership: result.membership_package?.name || result.membership?.package?.name || null,
    fetchedAt: Date.now(),
    exhaustedUntil: null,
    error: null,
  };
  if (quota.remaining === null) {
    logger.info(`Freelancer bid allowance not found in the self response; bid-related keys: ${bidKeyPaths(result).join(', ') || '(none)'}`);
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
// account as empty for an hour, whatever the self endpoint says.
function markBidsExhausted(userId, message) {
  const prev = cache.get(userId) || { limit: null, source: null, limitSource: null, membership: null };
  cache.set(userId, { ...prev, remaining: 0, fetchedAt: Date.now(), exhaustedUntil: Date.now() + EXHAUSTED_MS, error: null, lastRejection: String(message || '') });
}

// A bid went through: count it down so the cache stays honest between reads.
function noteBidPlaced(userId) {
  const q = cache.get(userId);
  if (q && typeof q.remaining === 'number' && q.remaining > 0) q.remaining -= 1;
}

function clearBidQuota(userId) {
  cache.delete(userId);
}

module.exports = { getBidQuota, getCachedBidQuota, markBidsExhausted, noteBidPlaced, clearBidQuota, isOutOfBidsError, fetchBidQuota, findKey, bidKeyPaths, CACHE_MS, EXHAUSTED_MS };
