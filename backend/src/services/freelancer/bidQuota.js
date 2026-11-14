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

// Every key path that mentions "bid" (or every scalar key path, with `all`),
// for the log when the count is unknown.
function bidKeyPaths(obj, path = '', out = [], depth = 0, all = false) {
  if (!obj || typeof obj !== 'object' || depth > 6 || out.length >= 40) return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (all ? typeof v !== 'object' : /bid/i.test(k)) out.push(typeof v === 'object' ? p : `${p}=${JSON.stringify(v)}`);
    if (v && typeof v === 'object') bidKeyPaths(v, p, out, depth + 1, all);
  }
  return out;
}

function isOutOfBidsError(message) {
  const text = String(message || '');
  return OUT_OF_BIDS_PATTERNS.some(p => p.test(text));
}

// Freelancer also has a per-project "bid info" endpoint ("information for
// posting bids on a project" — the path is only documented in third-party
// SDKs, so both spellings are tried). It is read for a recent project when the
// self response did not carry the count. A path that answered is remembered;
// when none does, the probe is repeated at most once an hour.
const BID_INFO_PATHS = ['/projects/0.1/projects/{id}/bidinfo/', '/projects/0.1/projects/{id}/bids_info/'];
const BID_INFO_RETRY_MS = 60 * 60 * 1000;
let bidInfoPath = null;
let bidInfoFailedAt = 0;
let bidInfoLastError = null; // e.g. "HTTP 404", for the diagnostics entry

async function fetchProjectBidInfo(client, projectId) {
  if (!projectId) { if (!bidInfoPath) bidInfoLastError = 'no project known yet to ask about'; return null; }
  if (!bidInfoPath && Date.now() - bidInfoFailedAt < BID_INFO_RETRY_MS) return null;
  const errors = [];
  for (const p of bidInfoPath ? [bidInfoPath] : BID_INFO_PATHS) {
    try {
      const res = await client.get(p.replace('{id}', String(projectId)));
      const body = res.data?.result ?? res.data;
      if (body && typeof body === 'object') { bidInfoPath = p; bidInfoLastError = null; return body; }
      errors.push(`${p}: empty reply`);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.message || err.response?.data?.error_code || err.message;
      errors.push(`${p}: ${status ? `HTTP ${status}` : 'no response'} ${String(detail).slice(0, 80)}`);
      if (status && status !== 404) logger.warn(`Freelancer bid info (${p}): HTTP ${status} ${err.message}`);
    }
  }
  bidInfoFailedAt = Date.now();
  bidInfoLastError = errors.join('; ');
  return null;
}

// For the diagnostics entry written when the count is unknown.
function bidInfoStatus() {
  return { path: bidInfoPath, lastError: bidInfoLastError, bidLimitError: bidLimitLastError };
}


// The endpoint Freelancer's own dashboard widget ("app-insights-bid-summary-
// widget") reads the count from: a legacy "ajax-api" call, not part of the
// documented REST API. The web app requests
//   GET https://www.freelancer.com/ajax-api/projects/getBidLimit.php
//       ?userId=<id>&compact=true&new_errors=true&new_pools=true
// and gets { status, result: { userId, bidsRemaining, bidLimit,
// bidsLastRefilled (s), bidRefreshTime (s), bidRefreshRate, unlimitedBids } }.
// The web app authenticates with its own session header; whether the OAuth
// header the app holds is accepted too is only known once it is tried, so a
// failure here is recorded and the other sources are consulted.
const BID_LIMIT_URL = 'https://www.freelancer.com/ajax-api/projects/getBidLimit.php';
let bidLimitLastError = null;

async function fetchBidLimit(client, freelancerUid) {
  if (!freelancerUid) return null;
  try {
    const res = await client.get(BID_LIMIT_URL, {
      params: { userId: freelancerUid, compact: 'true', new_errors: 'true', new_pools: 'true' },
    });
    const body = res.data;
    if (!body || typeof body !== 'object' || body.status === 'error') {
      bidLimitLastError = `getBidLimit: ${body?.message || body?.error_code || body?.status || 'empty reply'}`;
      return null;
    }
    bidLimitLastError = null;
    return body.result && typeof body.result === 'object' ? body.result : body;
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.response?.data?.error_code || err.message;
    bidLimitLastError = `getBidLimit: ${status ? `HTTP ${status}` : 'no response'} ${String(detail).slice(0, 80)}`;
    logger.warn(`Freelancer getBidLimit: ${bidLimitLastError}`);
    return null;
  }
}

// `freelancerUid` lets the dashboard's bid-limit call be made; `projectId`
// (a Freelancer project id) lets the per-project bid info be consulted.
async function fetchBidQuota(client, { projectId = null, freelancerUid = null } = {}) {
  const keys = [];
  // 1. The dashboard widget's source.
  const bl = await fetchBidLimit(client, freelancerUid);
  if (bl) {
    for (const k of bidKeyPaths(bl, '', [], 0, true)) keys.push(`getBidLimit.${k}`);
    const remaining = toNumber(bl.bidsRemaining ?? bl.bids_remaining);
    const unlimited = bl.unlimitedBids === true || bl.unlimited_bids === true;
    if (remaining !== null || unlimited) {
      const refilled = toNumber(bl.bidsLastRefilled ?? bl.bids_last_refilled);
      const every = toNumber(bl.bidRefreshTime ?? bl.bid_refresh_time);
      const quota = {
        remaining: unlimited ? null : remaining,
        unlimited,
        limit: toNumber(bl.bidLimit ?? bl.bid_limit),
        source: unlimited ? 'getBidLimit.unlimitedBids' : 'getBidLimit.bidsRemaining',
        limitSource: 'getBidLimit.bidLimit',
        refreshRate: toNumber(bl.bidRefreshRate ?? bl.bid_refresh_rate),
        nextRefillAt: refilled && every ? (refilled + every) * 1000 : null,
        membership: null,
        keys,
        fetchedAt: Date.now(),
        exhaustedUntil: null,
        error: null,
      };
      logger.info(`Freelancer bids left: ${unlimited ? 'unlimited' : `${quota.remaining}${quota.limit !== null ? ` of ${quota.limit}` : ''}`} (from getBidLimit)`);
      return quota;
    }
  }

  // 2. The documented self endpoint, searched for the usual names.
  const response = await client.get('/users/0.1/self/', {
    params: { membership_details: true, limited_account: true, bid_quality_details: true },
  });
  const result = response.data?.result || {};
  let remaining = findKey(result, REMAINING_KEYS)
    || findBenefit(result, /^(bids?_)?remaining(_bids?)?$|^bids?_left$|^bids?_balance$/i, ['remaining', 'value', 'count', 'amount']);
  let limit = findKey(result, LIMIT_KEYS)
    || findBenefit(result, /^bids?(_limit|_quota|_allowance|_count)?$|^(monthly_)?bid_limit$/i, VALUE_KEYS);
  keys.push(...bidKeyPaths(result));
  // 3. The per-project bid info.
  if (!remaining && projectId) {
    const info = await fetchProjectBidInfo(client, projectId);
    if (info) {
      // Only bid-named keys: a bare "remaining" in that reply could mean
      // anything, and a wrong 0 would stop bidding altogether.
      remaining = findKey(info, REMAINING_KEYS)
        || findBenefit(info, /^(bids?_)?remaining(_bids?)?$|^bids?_left$|^bids?_balance$/i, ['remaining', 'value', 'count', 'amount']);
      if (remaining) remaining.path = `bidinfo.${remaining.path}`;
      if (!limit) {
        limit = findKey(info, LIMIT_KEYS) || findBenefit(info, /^bids?(_limit|_quota|_allowance)?$|^(monthly_)?bid_limit$/i, VALUE_KEYS);
        if (limit) limit.path = `bidinfo.${limit.path}`;
      }
      for (const k of bidKeyPaths(info, '', [], 0, true)) keys.push(`bidinfo.${k}`);
    }
  }
  const quota = {
    remaining: toNumber(remaining?.value),
    unlimited: false,
    limit: toNumber(limit?.value),
    source: remaining?.path || null,
    limitSource: limit?.path || null,
    refreshRate: null,
    nextRefillAt: null,
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
// only the cache is consulted. `force` is the user clicking the bids pill:
// it also ends a pause that came from a rejected bid, since bids refill over
// time and the user can see the real count on their Freelancer dashboard.
async function getBidQuota(userId, client, { force = false, projectId = null, freelancerUid = null } = {}) {
  const cached = cache.get(userId);
  const now = Date.now();
  if (!force && cached && cached.exhaustedUntil && cached.exhaustedUntil > now) return cached;
  if (!force && cached && now - cached.fetchedAt < CACHE_MS) return cached;
  if (!client) return cached || null;
  try {
    const quota = await fetchBidQuota(client, { projectId, freelancerUid });
    // Freelancer not reporting the count says nothing about earlier
    // rejections, so the strike count carries over; a reported count resets
    // it, and so does the user asking for a fresh try.
    if (quota.remaining === null && cached) {
      quota.rejections = force ? 0 : (cached.rejections || 0);
      quota.lastRejection = cached.lastRejection;
      quota.lastRejectionAt = cached.lastRejectionAt;
    }
    cache.set(userId, quota);
    return quota;
  } catch (err) {
    const status = err.response?.status;
    logger.warn(`Could not read the Freelancer bid allowance: HTTP ${status ?? 'NETWORK'} ${err.message}`);
    const failed = { ...(cached || { remaining: null, limit: null, source: null, limitSource: null, membership: null }), fetchedAt: now, error: err.message };
    if (force && failed.source === 'rejection') { failed.remaining = null; failed.exhaustedUntil = null; failed.rejections = 0; }
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
    source: 'rejection',   // assumed from the rejected bid, not a count Freelancer reported
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
  // A zero that came from a rejection is stale now; read it again next time.
  if (q.source === 'rejection' && q.remaining === 0) { q.remaining = null; q.source = null; q.fetchedAt = 0; }
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
  let rejections = recent.filter(b => isOutOfBidsError(b.errorMessage)).reverse();
  if (rejections.length === 0) return false;
  // The user clicking "retry" (bid_quota_retry) ends the pause; rejections
  // before that click stay ended across a restart.
  const retry = await prisma.activityLog.findFirst({ where: { userId, action: 'bid_quota_retry' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  if (retry) rejections = rejections.filter(r => r.createdAt > retry.createdAt);
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

// A recent active project id, for the per-project bid info probe.
async function latestProjectId(prisma) {
  try {
    const p = await prisma.project.findFirst({ where: { status: 'active' }, orderBy: { discoveredAt: 'desc' }, select: { freelancerProjectId: true } });
    return p?.freelancerProjectId ?? null;
  } catch { return null; }
}

module.exports = { getBidQuota, getCachedBidQuota, markBidsExhausted, noteBidPlaced, restoreExhaustedFromDb, clearBidQuota, latestProjectId, isOutOfBidsError, fetchBidQuota, fetchBidLimit, fetchProjectBidInfo, bidInfoStatus, BID_LIMIT_URL, findKey, findBenefit, bidKeyPaths, CACHE_MS, EXHAUSTED_MS, EXHAUSTED_MAX_MS };
