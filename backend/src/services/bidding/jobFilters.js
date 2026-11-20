const prisma = require('../../config/database');
const logger = require('../../utils/logger');
const { COUNTRY_TO_REGION } = require('../../utils/regions');

// Job filters live on the User row (users.job_filters, JSON) and narrow the
// project search for EVERY bidding profile: which client countries, regions
// and project currencies to skip, which countries to allow, which languages
// to search in, and the budget bounds a project must fall within. They are
// set once under "Job Filters"; the per-profile form does not expose them.
//
// Merge rules (see mergeJobFilters):
//   - Exclusion lists are COMBINED with anything still stored on the profile
//     (legacy data from before job filters existed) — more exclusion is always
//     the safe direction.
//   - Allowlist, languages and budget bounds: the account value wins when
//     set. A legacy per-profile value is used only when the account one is
//     blank, so upgrading never silently widens a profile's reach.

// Lists whose values are combined with the profile's own list.
const UNION_LIST_FIELDS = ['excludedCountries', 'excludedRegions', 'countryExceptions', 'excludedCurrencies'];
// Lists where the account value replaces the profile's own when set.
const OVERRIDE_LIST_FIELDS = ['countries'];
// Free-text fields where the account value replaces the profile's own when set.
const OVERRIDE_TEXT_FIELDS = ['languages'];
// Numeric bounds (USD) where the account value replaces the profile's own when set.
const NUMBER_FIELDS = ['budgetMinFixed', 'budgetMaxFixed', 'budgetMinHourly', 'budgetMaxHourly'];
// What kind of work: Freelancer skills ("jobs", [{ id, name }]) sent as the
// search's jobs[] filter, and free-text keywords sent as its query. The
// account's skills replace a profile's own job ids when set; keywords are used
// when the profile has none of its own.
const JOB_FIELDS = ['jobs'];
const KEYWORD_FIELDS = ['keywords'];

const LIST_FIELDS = [...UNION_LIST_FIELDS, ...OVERRIDE_LIST_FIELDS];
const TEXT_FIELDS = [...OVERRIDE_TEXT_FIELDS, ...KEYWORD_FIELDS];
const ALL_FIELDS = [...LIST_FIELDS, ...TEXT_FIELDS, ...NUMBER_FIELDS, ...JOB_FIELDS];

// Account-level AI context copied onto every profile for the analyzer and
// proposal generator (users.skills_summary etc.). Not filters, but applied in
// the same pass so the engine sees one effective profile object.
const CONTEXT_FIELDS = ['skillsSummary', 'experienceSummary', 'portfolioHighlights'];

function emptyJobFilters() {
  const out = {};
  for (const f of LIST_FIELDS) out[f] = [];
  for (const f of JOB_FIELDS) out[f] = [];
  for (const f of TEXT_FIELDS) out[f] = '';
  for (const f of NUMBER_FIELDS) out[f] = null;
  return out;
}

// A non-negative finite number, or null when unset/blank/invalid.
function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
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

// [{ id, name }] with numeric ids, unique by id; strings/numbers are accepted as bare ids.
function normalizeJobs(value) {
  let arr = value;
  if (typeof value === 'string') { try { arr = JSON.parse(value); } catch { arr = []; } }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const id = Number(typeof raw === 'object' && raw !== null ? raw.id : raw);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    const name = typeof raw === 'object' && raw !== null && typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
    out.push({ id, name: name || String(id) });
  }
  return out;
}

// "react, shopify" → ['react', 'shopify'] (lowercase, unique)
function keywordList(text) {
  return [...new Set(String(text || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))];
}

// Parse the raw DB value (JSON string or null) into a fully-populated object.
// New accounts are seeded with defaults by prisma/seed.js; NULL here means
// nothing is configured.
function parseJobFilters(raw) {
  const out = emptyJobFilters();
  if (raw == null) return out;
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {
    logger.warn(`Job filters: failed to parse stored JSON: ${e.message}`);
    return out;
  }
  if (!parsed || typeof parsed !== 'object') return out;
  for (const f of LIST_FIELDS) {
    out[f] = normalizeList(parsed[f], { lowercase: f === 'excludedRegions' });
  }
  for (const f of TEXT_FIELDS) {
    out[f] = typeof parsed[f] === 'string' ? parsed[f].trim() : '';
  }
  for (const f of NUMBER_FIELDS) {
    out[f] = normalizeNumber(parsed[f]);
  }
  for (const f of JOB_FIELDS) {
    out[f] = normalizeJobs(parsed[f]);
  }
  return out;
}

// Build the JSON string to store from an API payload. Unknown keys are dropped.
// Always a document, so an explicitly emptied configuration is kept as such.
function serializeJobFilters(input) {
  return JSON.stringify(parseJobFilters(input || {}));
}

function isEmptyJobFilters(filters) {
  if (!filters) return true;
  return !ALL_FIELDS.some(f => Array.isArray(filters[f]) ? filters[f].length > 0 : (filters[f] !== null && filters[f] !== '' && filters[f] !== undefined));
}

async function loadJobFilters(userId) {
  if (!userId) return emptyJobFilters();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { jobFilters: true },
  });
  return parseJobFilters(user?.jobFilters);
}

// Return a copy of a BiddingProfile row with the account's job filters folded
// in. The result keeps the row's storage format (JSON strings for list fields)
// so the engine's search and filter steps work unchanged. Never mutates input.
function mergeJobFilters(profile, filters) {
  if (!profile) return null;
  if (isEmptyJobFilters(filters)) return { ...profile };

  const merged = { ...profile };

  for (const f of UNION_LIST_FIELDS) {
    const own = normalizeList(profile[f], { lowercase: f === 'excludedRegions' });
    const combined = normalizeList([...own, ...filters[f]], { lowercase: f === 'excludedRegions' });
    merged[f] = combined.length > 0 ? JSON.stringify(combined) : null;
  }

  for (const f of OVERRIDE_LIST_FIELDS) {
    if (filters[f].length > 0) merged[f] = JSON.stringify(filters[f]);
  }

  for (const f of OVERRIDE_TEXT_FIELDS) {
    if (filters[f]) merged[f] = filters[f];
  }

  for (const f of NUMBER_FIELDS) {
    if (filters[f] != null) merged[f] = filters[f];
  }

  // Kind of work: account skills replace the profile's job ids; account
  // keywords fill in when the profile has none of its own.
  if (filters.jobs.length > 0) merged.jobIds = JSON.stringify(filters.jobs.map(j => j.id));
  if (filters.keywords && !(typeof profile.searchKeywords === 'string' && profile.searchKeywords.trim())) {
    merged.searchKeywords = filters.keywords;
  }

  return merged;
}

// ── Applying job filters to stored projects ──────────────────────────────────
// The same rules the bidding engine applies after a search, for the Projects
// page: one version as a plain test for a single project, one as a database
// condition so paging and counts stay correct. A project whose country,
// language or type is unknown is kept, exactly as the engine keeps it.

// "en, es" → ['en', 'es']
function languageList(text) {
  return String(text || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

// Every country code the filters rule out: the listed countries plus every
// country of an excluded region, minus the exceptions (an exception always wins).
function excludedCountryCodes(filters) {
  const out = new Set(filters.excludedCountries);
  if (filters.excludedRegions.length > 0) {
    for (const [code, region] of Object.entries(COUNTRY_TO_REGION)) {
      if (filters.excludedRegions.includes(region)) out.add(code);
    }
  }
  for (const code of filters.countryExceptions) out.delete(code);
  return [...out];
}

// Budget bounds for one kind of project; the filter numbers are compared with
// the project's own budget figures, as the engine does.
function budgetBounds(filters, kind) {
  return kind === 'hourly'
    ? { min: filters.budgetMinHourly, max: filters.budgetMaxHourly }
    : { min: filters.budgetMinFixed, max: filters.budgetMaxFixed };
}

// True when a stored project row passes the (parsed) job filters.
function matchesJobFilters(project, filters) {
  if (isEmptyJobFilters(filters)) return true;

  const country = project.ownerCountry ? String(project.ownerCountry).toUpperCase() : null;
  if (country) {
    if (filters.countries.length > 0 && !filters.countries.includes(country)) return false;
    if (excludedCountryCodes(filters).includes(country)) return false;
  }

  if (project.currency && filters.excludedCurrencies.includes(String(project.currency).toUpperCase())) return false;

  const languages = languageList(filters.languages);
  if (languages.length > 0 && project.language && !languages.includes(String(project.language).toLowerCase())) return false;

  if (filters.jobs.length > 0 && project.jobIds) {
    let ids = [];
    try { ids = (JSON.parse(project.jobIds) || []).map(j => Number(typeof j === 'object' && j !== null ? j.id : j)); } catch { ids = []; }
    if (ids.length > 0 && !ids.some(id => filters.jobs.some(j => j.id === id))) return false;
  }
  const keywords = keywordList(filters.keywords);
  if (keywords.length > 0) {
    const text = `${project.title || ''} ${project.description || ''}`.toLowerCase();
    if (!keywords.some(k => text.includes(k))) return false;
  }

  if (project.projectType === 'fixed' || project.projectType === 'hourly') {
    const { min, max } = budgetBounds(filters, project.projectType);
    if (min != null) {
      const reachesMin = (project.budgetMin != null && project.budgetMin >= min) || (project.budgetMax != null && project.budgetMax >= min);
      if (!reachesMin) return false;
    }
    if (max != null && project.budgetMax != null && project.budgetMax > max) return false;
  }
  return true;
}

// The same test as a list of Prisma conditions for `where: { AND: [...] }`.
function jobFiltersWhere(filters) {
  const and = [];
  if (isEmptyJobFilters(filters)) return and;

  if (filters.countries.length > 0) {
    and.push({ OR: [{ ownerCountry: null }, { ownerCountry: { in: filters.countries } }] });
  }
  const excluded = excludedCountryCodes(filters);
  if (excluded.length > 0) {
    and.push({ OR: [{ ownerCountry: null }, { ownerCountry: { notIn: excluded } }] });
  }
  if (filters.excludedCurrencies.length > 0) {
    and.push({ currency: { notIn: filters.excludedCurrencies } });
  }
  const languages = languageList(filters.languages);
  if (languages.length > 0) {
    and.push({ OR: [{ language: null }, { language: { in: languages } }] });
  }

  // Skills: the stored jobIds JSON holds {"id":<n>,...} entries, so a contains
  // on '"id":<n>,' matches the id exactly (3 does not match 30). Projects whose
  // skills are unknown are kept.
  if (filters.jobs.length > 0) {
    and.push({ OR: [{ jobIds: null }, { jobIds: '[]' }, ...filters.jobs.map(j => ({ jobIds: { contains: `"id":${j.id},` } }))] });
  }
  const keywords = keywordList(filters.keywords);
  if (keywords.length > 0) {
    and.push({ OR: keywords.flatMap(k => [{ title: { contains: k } }, { description: { contains: k } }]) });
  }

  const kindCondition = (kind) => {
    const { min, max } = budgetBounds(filters, kind);
    const parts = [];
    if (min != null) parts.push({ OR: [{ budgetMin: { gte: min } }, { budgetMax: { gte: min } }] });
    if (max != null) parts.push({ OR: [{ budgetMax: null }, { budgetMax: { lte: max } }] });
    return parts.length > 0 ? { projectType: kind, AND: parts } : { projectType: kind };
  };
  if (NUMBER_FIELDS.some(f => filters[f] != null)) {
    and.push({ OR: [
      kindCondition('fixed'),
      kindCondition('hourly'),
      { projectType: null },
      { projectType: { notIn: ['fixed', 'hourly'] } },
    ] });
  }
  return and;
}

// Build the effective profile the engine and the AI routes work with: the
// profile row plus the account's job filters, review mode, hourly rate and AI context.
// When `profile` is null (an ad-hoc analysis with no profile picked) a bare
// profile-shaped object carrying the account context is returned instead.
async function applyAccountSettings(profile, userId) {
  const id = userId || profile?.userId;
  const user = id
    ? await prisma.user.findUnique({
        where: { id },
        select: { jobFilters: true, reviewMode: true, proposalPrompt: true, hourlyRate: true, periodMinDays: true, periodMaxDays: true, periodFallbackDays: true, aiBidPercentage: true, skillsSummary: true, experienceSummary: true, portfolioHighlights: true },
      })
    : null;

  const base = profile ? mergeJobFilters(profile, parseJobFilters(user?.jobFilters)) : { userId: id };

  // Review mode is account-wide: the per-profile column is ignored entirely.
  base.reviewMode = user?.reviewMode === true;

  // The freelancer's hourly rate (USD/hr) is account-wide; see services/bidding/pricing.js.
  base.hourlyRate = typeof user?.hourlyRate === 'number' && user.hourlyRate > 0 ? user.hourlyRate : null;

  // Delivery period bounds for AI-estimated periods are account-wide too.
  const days = (v) => (Number.isInteger(v) && v > 0 ? v : null);
  base.periodMinDays = days(user?.periodMinDays);
  base.periodMaxDays = days(user?.periodMaxDays);
  base.periodFallbackDays = days(user?.periodFallbackDays) || 7;

  // Share of the AI-suggested amount to bid on fixed-price projects (account-wide).
  base.aiBidPercentage = days(user?.aiBidPercentage) || 100;

  // Account-wide proposal prompt; the profile's own proposalPrompt is appended
  // to it by promptLoader.getProposalPrompt.
  base.accountProposalPrompt = (typeof user?.proposalPrompt === 'string' && user.proposalPrompt.trim()) || null;

  // AI context: the account value wins; a legacy per-profile value is kept
  // only when the account has none.
  for (const f of CONTEXT_FIELDS) {
    const own = typeof base[f] === 'string' ? base[f].trim() : '';
    const account = typeof user?.[f] === 'string' ? user[f].trim() : '';
    if (account) base[f] = account;
    else if (!own) base[f] = null;
  }

  return base;
}

module.exports = {
  normalizeJobs, keywordList,
  UNION_LIST_FIELDS,
  OVERRIDE_LIST_FIELDS,
  OVERRIDE_TEXT_FIELDS,
  NUMBER_FIELDS,
  LIST_FIELDS,
  TEXT_FIELDS,
  ALL_FIELDS,
  CONTEXT_FIELDS,
  emptyJobFilters,
  parseJobFilters,
  serializeJobFilters,
  isEmptyJobFilters,
  loadJobFilters,
  mergeJobFilters,
  languageList,
  excludedCountryCodes,
  matchesJobFilters,
  jobFiltersWhere,
  applyAccountSettings,
};
