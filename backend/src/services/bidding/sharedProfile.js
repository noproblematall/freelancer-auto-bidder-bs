const prisma = require('../../config/database');
const logger = require('../../utils/logger');

// Shared profile settings live on the User row as a JSON blob and apply to
// every bidding profile the user owns. Targeting, languages, and the "about me"
// context are set ONCE here; the per-profile form no longer exposes them.
//
// Merge rules (see mergeSharedProfile):
//   - Exclusion lists are COMBINED with anything still stored on the profile
//     (legacy data from before shared settings existed) — more exclusion is
//     always the safe direction.
//   - Every other field: the shared value wins when set. A legacy per-profile
//     value is used only when the shared one is blank, so upgrading never
//     silently widens a profile's reach.
//   - Booleans (review mode) are always taken from the shared settings.

// Lists whose values are combined with the profile's own list.
const UNION_LIST_FIELDS = ['excludedCountries', 'excludedRegions', 'countryExceptions', 'excludedCurrencies'];
// Lists where the shared value replaces the profile's own when set.
const OVERRIDE_LIST_FIELDS = ['countries'];
// Free-text fields where the shared value replaces the profile's own when set.
const OVERRIDE_TEXT_FIELDS = ['languages', 'skillsSummary', 'experienceSummary', 'portfolioHighlights'];
// Booleans that apply to every profile. Default off.
const BOOL_FIELDS = ['reviewMode'];

const LIST_FIELDS = [...UNION_LIST_FIELDS, ...OVERRIDE_LIST_FIELDS];
const TEXT_FIELDS = [...OVERRIDE_TEXT_FIELDS];
const ALL_FIELDS = [...LIST_FIELDS, ...TEXT_FIELDS, ...BOOL_FIELDS];

function emptySharedProfile() {
  const out = {};
  for (const f of LIST_FIELDS) out[f] = [];
  for (const f of TEXT_FIELDS) out[f] = '';
  for (const f of BOOL_FIELDS) out[f] = false;
  return out;
}

function normalizeList(value, { lowercase = false } = {}) {
  let arr = value;
  if (typeof value === 'string') {
    try { arr = JSON.parse(value); } catch { arr = value.split(','); }
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const s = String(raw).trim();
    if (!s) continue;
    const key = lowercase ? s.toLowerCase() : s.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

// Parse the raw DB value (JSON string or null) into a fully-populated object.
function parseSharedProfile(raw) {
  const out = emptySharedProfile();
  if (!raw) return out;
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {
    logger.warn(`Shared profile: failed to parse stored JSON: ${e.message}`);
    return out;
  }
  if (!parsed || typeof parsed !== 'object') return out;
  for (const f of LIST_FIELDS) {
    out[f] = normalizeList(parsed[f], { lowercase: f === 'excludedRegions' });
  }
  for (const f of TEXT_FIELDS) {
    out[f] = typeof parsed[f] === 'string' ? parsed[f].trim() : '';
  }
  for (const f of BOOL_FIELDS) {
    out[f] = parsed[f] === true;
  }
  return out;
}

// Build the JSON string to store from an API payload. Unknown keys are dropped.
function serializeSharedProfile(input) {
  const normalized = parseSharedProfile(input || {});
  const hasContent = ALL_FIELDS.some(f => Array.isArray(normalized[f]) ? normalized[f].length > 0 : !!normalized[f]);
  return hasContent ? JSON.stringify(normalized) : null;
}

function isEmptySharedProfile(shared) {
  if (!shared) return true;
  return !ALL_FIELDS.some(f => Array.isArray(shared[f]) ? shared[f].length > 0 : !!shared[f]);
}

async function loadSharedProfile(userId) {
  if (!userId) return emptySharedProfile();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sharedProfile: true },
  });
  return parseSharedProfile(user?.sharedProfile);
}

// Return a copy of a BiddingProfile row with the shared settings folded in.
// The result keeps the row's storage format (JSON strings for list fields) so
// everything downstream — engine filters, analyzer, proposal generator — works
// unchanged. The original object is never mutated.
function mergeSharedProfile(profile, shared) {
  if (!profile) return null;

  const merged = { ...profile };

  // Booleans are shared-only: the per-profile value is ignored entirely.
  for (const f of BOOL_FIELDS) merged[f] = shared?.[f] === true;

  if (isEmptySharedProfile(shared)) return merged;

  for (const f of UNION_LIST_FIELDS) {
    const own = normalizeList(profile[f], { lowercase: f === 'excludedRegions' });
    const combined = normalizeList([...own, ...shared[f]], { lowercase: f === 'excludedRegions' });
    merged[f] = combined.length > 0 ? JSON.stringify(combined) : null;
  }

  for (const f of OVERRIDE_LIST_FIELDS) {
    if (shared[f].length > 0) merged[f] = JSON.stringify(shared[f]);
  }

  for (const f of OVERRIDE_TEXT_FIELDS) {
    if (shared[f]) merged[f] = shared[f];
  }

  return merged;
}

// Convenience: load the user's shared settings and merge them into `profile`.
// When `profile` is null (e.g. an ad-hoc analysis with no profile picked) and
// shared settings exist, a bare profile-shaped object is returned so the AI
// still gets the user's skills/experience context.
async function applySharedProfile(profile, userId) {
  const shared = await loadSharedProfile(userId || profile?.userId);
  if (profile) return mergeSharedProfile(profile, shared);
  if (isEmptySharedProfile(shared)) return null;
  return mergeSharedProfile({ userId }, shared);
}

module.exports = {
  UNION_LIST_FIELDS,
  OVERRIDE_LIST_FIELDS,
  OVERRIDE_TEXT_FIELDS,
  BOOL_FIELDS,
  TEXT_FIELDS,
  LIST_FIELDS,
  ALL_FIELDS,
  emptySharedProfile,
  parseSharedProfile,
  serializeSharedProfile,
  isEmptySharedProfile,
  loadSharedProfile,
  mergeSharedProfile,
  applySharedProfile,
};
