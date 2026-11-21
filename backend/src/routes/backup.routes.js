// Settings backup and restore (Settings → Backup & Restore): one JSON file
// with every account setting, the bid profiles and the job filters, and —
// when asked — the API keys and the Freelancer connection in plain text so a
// fresh install (or another machine, whose encryption key differs) can be
// restored completely.
const express = require('express');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/tokenManager');
const { serializeJobFilters } = require('../services/bidding/jobFilters');
const { validateScheduleWeek, serializeScheduleWeek } = require('../services/bidding/scheduleWeek');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authMiddleware);

const FORMAT = 'bidpilot-settings';
const FORMAT_VERSION = 1;

// Account fields that travel in the backup (no secrets here).
const USER_FIELDS = [
  'openaiModel', 'bidDelaySeconds', 'hourlyRate', 'periodMinDays', 'periodMaxDays', 'periodFallbackDays', 'aiBidPercentage', 'sealBids',
  'maxBidsPerHour', 'maxBidsPerDay', 'bidHistoryLimit',
  'scheduleEnabled', 'scheduleTimezone', 'scheduleStartTime', 'scheduleEndTime', 'scheduleDays', 'scheduleWeek',
  'telegramEnabled', 'telegramBidNotificationsEnabled', 'telegramChatId', 'webhookEnabled', 'webhookUrl',
  'jobFilters', 'reviewMode', 'skillsSummary', 'experienceSummary', 'portfolioHighlights', 'proposalPrompt',
  'minClientScore', 'maxProjectBids', 'followUpEnabled', 'followUpHours', 'followUpMinScore', 'autoReplyEnabled', 'aiReviewAuto',
  'freelancerClientId',
];
const USER_TYPES = {
  openaiModel: 'string', bidDelaySeconds: 'number', hourlyRate: 'number?', periodMinDays: 'int?', periodMaxDays: 'int?', periodFallbackDays: 'int', aiBidPercentage: 'int', sealBids: 'bool',
  maxBidsPerHour: 'int', maxBidsPerDay: 'int', bidHistoryLimit: 'int',
  scheduleEnabled: 'bool', scheduleTimezone: 'string', scheduleStartTime: 'string?', scheduleEndTime: 'string?', scheduleDays: 'string', scheduleWeek: 'string?',
  telegramEnabled: 'bool', telegramBidNotificationsEnabled: 'bool', telegramChatId: 'string?', webhookEnabled: 'bool', webhookUrl: 'string?',
  jobFilters: 'string?', reviewMode: 'bool', skillsSummary: 'string?', experienceSummary: 'string?', portfolioHighlights: 'string?', proposalPrompt: 'string?',
  minClientScore: 'int', maxProjectBids: 'int', followUpEnabled: 'bool', followUpHours: 'int', followUpMinScore: 'int', autoReplyEnabled: 'bool', aiReviewAuto: 'bool',
  freelancerClientId: 'string?',
};
// Secrets, stored encrypted; exported decrypted only when the user asks.
const SECRET_FIELDS = ['openaiApiKey', 'telegramBotToken', 'freelancerClientSecret'];

const PROFILE_FIELDS = [
  'name', 'isActive', 'searchKeywords', 'jobIds', 'budgetMinFixed', 'budgetMaxFixed', 'budgetMinHourly', 'budgetMaxHourly',
  'countries', 'excludedCountries', 'excludedRegions', 'countryExceptions', 'excludedCurrencies', 'languages',
  'fixedBidStrategy', 'bidPercentage', 'fixedPeriodStrategy', 'hourlyRateStrategy', 'hourlyPeriodStrategy',
  'minRelevanceScore', 'proposalPrompt', 'reviewMode', 'maxBidsPerHour', 'maxBidsPerDay', 'skillsSummary', 'experienceSummary', 'portfolioHighlights',
];
const PROFILE_TYPES = {
  name: 'string', isActive: 'bool', searchKeywords: 'string?', jobIds: 'string?', budgetMinFixed: 'number?', budgetMaxFixed: 'number?', budgetMinHourly: 'number?', budgetMaxHourly: 'number?',
  countries: 'string?', excludedCountries: 'string?', excludedRegions: 'string?', countryExceptions: 'string?', excludedCurrencies: 'string?', languages: 'string?',
  fixedBidStrategy: 'string', bidPercentage: 'number?', fixedPeriodStrategy: 'string', hourlyRateStrategy: 'string', hourlyPeriodStrategy: 'string',
  minRelevanceScore: 'int', proposalPrompt: 'string?', reviewMode: 'bool', maxBidsPerHour: 'int', maxBidsPerDay: 'int', skillsSummary: 'string?', experienceSummary: 'string?', portfolioHighlights: 'string?',
};

const safeDecrypt = (v) => { if (!v) return null; try { return decrypt(v); } catch { return null; } };

// Coerce a backup value to the column type; undefined = skip the field.
function coerce(value, type) {
  const optional = type.endsWith('?');
  const base = optional ? type.slice(0, -1) : type;
  if (value === undefined) return undefined;
  if (value === null || value === '') return optional ? null : undefined;
  switch (base) {
    case 'string': return typeof value === 'string' ? value.slice(0, 20000) : String(value);
    case 'bool': return value === true || value === 'true' || value === 1;
    case 'int': { const n = Number(value); return Number.isInteger(n) ? n : undefined; }
    case 'number': { const n = Number(value); return Number.isFinite(n) ? n : undefined; }
    default: return undefined;
  }
}

function pick(source, fields, types) {
  const out = {};
  for (const f of fields) {
    const v = coerce(source?.[f], types[f]);
    if (v !== undefined) out[f] = v;
  }
  return out;
}

// GET /api/backup/export?secrets=1
router.get('/export', async (req, res, next) => {
  try {
    const withSecrets = ['1', 'true'].includes(String(req.query.secrets || ''));
    const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { freelancerToken: true, biddingProfiles: { orderBy: { createdAt: 'asc' } } } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const settings = {};
    for (const f of USER_FIELDS) settings[f] = user[f] ?? null;
    const profiles = user.biddingProfiles.map((p) => { const o = {}; for (const f of PROFILE_FIELDS) o[f] = p[f] ?? null; return o; });
    const backup = {
      format: FORMAT, formatVersion: FORMAT_VERSION, app: 'BidPilot',
      appVersion: process.env.npm_package_version || null, exportedAt: new Date().toISOString(),
      settings, profiles,
    };
    if (withSecrets) {
      backup.secrets = {
        openaiApiKey: safeDecrypt(user.openaiApiKey),
        telegramBotToken: safeDecrypt(user.telegramBotToken),
        freelancerClientSecret: safeDecrypt(user.freelancerClientSecret),
        freelancerToken: user.freelancerToken ? {
          accessToken: safeDecrypt(user.freelancerToken.accessToken),
          refreshToken: safeDecrypt(user.freelancerToken.refreshToken),
          tokenType: user.freelancerToken.tokenType, expiresAt: user.freelancerToken.expiresAt, scopes: user.freelancerToken.scopes, freelancerUid: user.freelancerToken.freelancerUid,
        } : null,
      };
    }
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="bidpilot-settings-${stamp}.json"`);
    res.json(backup);
  } catch (err) { next(err); }
});

// POST /api/backup/import  { backup, profiles: 'merge' | 'replace' }
router.post('/import', async (req, res, next) => {
  try {
    const body = req.body || {};
    const backup = body.backup || body;
    if (!backup || backup.format !== FORMAT) return res.status(400).json({ error: 'This is not a BidPilot settings backup file.' });
    if (Number(backup.formatVersion) > FORMAT_VERSION) return res.status(400).json({ error: `This backup was made by a newer BidPilot (format ${backup.formatVersion}). Update the app first.` });
    const mode = body.profiles === 'replace' ? 'replace' : 'merge';

    // Account settings
    const data = pick(backup.settings, USER_FIELDS, USER_TYPES);
    if (data.jobFilters !== undefined && data.jobFilters !== null) {
      try { data.jobFilters = serializeJobFilters(JSON.parse(data.jobFilters)); } catch { delete data.jobFilters; }
    }
    if (data.scheduleWeek) {
      try {
        const checked = validateScheduleWeek(JSON.parse(data.scheduleWeek));
        if (checked.error) delete data.scheduleWeek; else data.scheduleWeek = serializeScheduleWeek(checked.value);
      } catch { delete data.scheduleWeek; }
    }
    const clamp = (k, lo, hi) => { if (typeof data[k] === 'number') data[k] = Math.max(lo, Math.min(hi, data[k])); };
    clamp('maxBidsPerHour', 1, 1000); clamp('maxBidsPerDay', 1, 10000); clamp('minClientScore', 0, 100); clamp('maxProjectBids', 0, 500);
    clamp('followUpHours', 1, 72); clamp('followUpMinScore', 0, 100); clamp('aiBidPercentage', 1, 200); clamp('bidDelaySeconds', 0, 3600);

    // Secrets
    let secrets = 0;
    let freelancerRestored = false;
    const s = backup.secrets;
    if (s && typeof s === 'object') {
      for (const f of SECRET_FIELDS) {
        if (typeof s[f] === 'string' && s[f].trim()) { data[f] = encrypt(s[f].trim()); secrets++; }
      }
      if (s.freelancerToken && typeof s.freelancerToken.accessToken === 'string' && s.freelancerToken.accessToken) {
        const t = s.freelancerToken;
        await prisma.freelancerToken.upsert({
          where: { userId: req.userId },
          update: { accessToken: encrypt(t.accessToken), refreshToken: t.refreshToken ? encrypt(t.refreshToken) : null, tokenType: t.tokenType || null, expiresAt: t.expiresAt ? new Date(t.expiresAt) : new Date(0), scopes: t.scopes || null, freelancerUid: t.freelancerUid ? String(t.freelancerUid) : null },
          create: { userId: req.userId, accessToken: encrypt(t.accessToken), refreshToken: t.refreshToken ? encrypt(t.refreshToken) : null, tokenType: t.tokenType || null, expiresAt: t.expiresAt ? new Date(t.expiresAt) : new Date(0), scopes: t.scopes || null, freelancerUid: t.freelancerUid ? String(t.freelancerUid) : null },
        });
        freelancerRestored = true;
        try { require('../services/freelancer/bidQuota').clearAllBidQuota(); } catch { /* optional */ }
      }
    }
    await prisma.user.update({ where: { id: req.userId }, data });

    // Bid profiles: matched by name
    let created = 0, updated = 0, removed = 0;
    const incoming = Array.isArray(backup.profiles) ? backup.profiles.map((p) => pick(p, PROFILE_FIELDS, PROFILE_TYPES)).filter((p) => p.name) : [];
    const existing = await prisma.biddingProfile.findMany({ where: { userId: req.userId }, select: { id: true, name: true } });
    const byName = new Map(existing.map((p) => [p.name, p.id]));
    const keep = new Set();
    for (const p of incoming) {
      const id = byName.get(p.name);
      if (id) { await prisma.biddingProfile.update({ where: { id }, data: p }); updated++; keep.add(id); }
      else { const row = await prisma.biddingProfile.create({ data: { ...p, userId: req.userId } }); created++; keep.add(row.id); }
    }
    if (mode === 'replace' && incoming.length > 0) {
      const gone = existing.filter((p) => !keep.has(p.id)).map((p) => p.id);
      if (gone.length) { await prisma.biddingProfile.deleteMany({ where: { id: { in: gone }, userId: req.userId } }); removed = gone.length; }
    }

    const summary = { settings: Object.keys(data).filter((k) => !SECRET_FIELDS.includes(k)).length, secrets, freelancerRestored, profiles: { created, updated, removed } };
    await prisma.activityLog.create({ data: { userId: req.userId, action: 'settings_imported', details: JSON.stringify({ message: `Settings restored from a backup made ${backup.exportedAt || 'unknown'}: ${summary.settings} settings, ${created} profiles created, ${updated} updated, ${removed} removed${secrets ? `, ${secrets} keys` : ''}${freelancerRestored ? ', Freelancer connection' : ''}.`, ...summary }) } }).catch(() => {});
    logger.info(`Settings imported for user ${req.userId}: ${JSON.stringify(summary)}`);
    res.json({ ok: true, summary });
  } catch (err) { next(err); }
});

module.exports = router;
