// Per-day bidding schedule (users.schedule_week, JSON).
//
// Shape: { "0": { enabled, start, end }, …, "6": { … } } keyed by JavaScript
// day-of-week (0 = Sunday). `start`/`end` are "HH:MM" in the account timezone.
// Accounts are seeded by prisma/seed.js; an account that predates the column
// is derived from the legacy single-window fields (schedule_days,
// schedule_start_time, schedule_end_time).

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LEGACY_START = '05:00';
const LEGACY_END = '21:00';

function normalizeDay(input, fallback) {
  const base = { enabled: false, start: LEGACY_START, end: LEGACY_END, ...fallback };
  if (!input || typeof input !== 'object') return base;
  return {
    enabled: input.enabled === true,
    start: TIME_RE.test(input.start) ? input.start : base.start,
    end: TIME_RE.test(input.end) ? input.end : base.end,
  };
}

// Parse the stored JSON (or null) into a full 7-day object. Unknown or
// malformed days fall back to disabled.
function parseScheduleWeek(raw) {
  let parsed = null;
  if (raw) {
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { parsed = null; }
  }
  const out = {};
  for (let d = 0; d <= 6; d++) out[d] = normalizeDay(parsed?.[d] ?? parsed?.[String(d)]);
  return out;
}

// Build a week from the pre-per-day fields so old rows keep working.
function weekFromLegacy({ scheduleDays, scheduleStartTime, scheduleEndTime } = {}) {
  const days = String(scheduleDays || '1,2,3,4,5').split(',').map(n => parseInt(n, 10)).filter(n => n >= 0 && n <= 6);
  const start = TIME_RE.test(scheduleStartTime || '') ? scheduleStartTime : LEGACY_START;
  const end = TIME_RE.test(scheduleEndTime || '') ? scheduleEndTime : LEGACY_END;
  const out = {};
  for (let d = 0; d <= 6; d++) out[d] = { enabled: days.includes(d), start, end };
  return out;
}

// The effective week for a user row: stored JSON when present, else legacy.
function resolveScheduleWeek(user) {
  if (user?.scheduleWeek) return parseScheduleWeek(user.scheduleWeek);
  return weekFromLegacy(user || {});
}

// Validate an API payload. Returns { value } (normalized) or { error }.
function validateScheduleWeek(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'scheduleWeek must be an object keyed by day (0-6)' };
  }
  const value = {};
  let anyEnabled = false;
  for (let d = 0; d <= 6; d++) {
    const day = input[d] ?? input[String(d)];
    if (!day || typeof day !== 'object') return { error: `scheduleWeek is missing ${DAY_NAMES[d]}` };
    if (typeof day.enabled !== 'boolean') return { error: `${DAY_NAMES[d]}: enabled must be a boolean` };
    if (!TIME_RE.test(day.start || '')) return { error: `${DAY_NAMES[d]}: start time must be HH:MM` };
    if (!TIME_RE.test(day.end || '')) return { error: `${DAY_NAMES[d]}: end time must be HH:MM` };
    if (day.enabled && day.start >= day.end) {
      return { error: `${DAY_NAMES[d]}: start time must be before end time` };
    }
    if (day.enabled) anyEnabled = true;
    value[d] = { enabled: day.enabled, start: day.start, end: day.end };
  }
  if (!anyEnabled) return { error: 'Enable at least one day, or turn the schedule off' };
  return { value };
}

function serializeScheduleWeek(week) {
  return JSON.stringify(parseScheduleWeek(week));
}

// Decide whether bidding may run right now, given the account's local time.
function checkScheduleWeek(week, { day, hours, minutes }) {
  const config = week[day] || { enabled: false };
  const name = DAY_NAMES[day] || `day ${day}`;
  if (!config.enabled) {
    return { allowed: false, reason: `${name} is disabled in the schedule` };
  }
  const now = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  if (now < config.start || now >= config.end) {
    return { allowed: false, reason: `Current time ${now} outside ${name}'s window ${config.start}-${config.end}` };
  }
  return { allowed: true, reason: `Within ${name}'s window ${config.start}-${config.end}` };
}

module.exports = {
  DAY_NAMES,
  parseScheduleWeek,
  weekFromLegacy,
  resolveScheduleWeek,
  validateScheduleWeek,
  serializeScheduleWeek,
  checkScheduleWeek,
};
