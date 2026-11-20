// One JSON question to the user's OpenAI model, for the Market page studies.
// Errors carry an HTTP status (400 no key, 502 model failure) so routes can
// show the real reason instead of "Internal server error".
const prisma = require('../../config/database');
const { decrypt } = require('../../utils/tokenManager');
const { createOpenAIClient } = require('../openai/client');
const logger = require('../../utils/logger');

const TIMEOUT_MS = Number(process.env.AI_ANALYTICS_TIMEOUT_MS) || 170000;

function parseJson(content) {
  const text = String(content || '').trim();
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  return { headline: text.slice(0, 500), raw: text };
}

async function askJson(userId, { system, user, maxTokens = 2500 }) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { openaiApiKey: true, openaiModel: true } });
  if (!u?.openaiApiKey) { const e = new Error('Add your OpenAI API key in Settings first.'); e.status = 400; throw e; }
  const openai = createOpenAIClient(decrypt(u.openaiApiKey), u.openaiModel || 'gpt-5.4-mini');
  let content, modelUsed;
  try {
    ({ content, modelUsed } = await openai.chat({
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' }, max_tokens: maxTokens, temperature: 0.4, timeout: TIMEOUT_MS,
    }));
  } catch (err) {
    logger.error({ err }, 'AI study failed');
    const msg = String(err.message || 'OpenAI request failed').replace(/^OpenAI API error: /, '');
    const e = new Error(/timeout/i.test(msg) ? `The AI study took too long (${msg}). Try again, or pick a faster model in Settings.` : `AI study failed: ${msg}`);
    e.status = 502;
    throw e;
  }
  return { report: parseJson(content), model: modelUsed };
}

// Store and read the latest report of a kind (optionally per subject, e.g. a client id).
async function saveReport(userId, action, { report, model, subject = null, message }) {
  await prisma.activityLog.create({
    data: { userId, action, details: JSON.stringify({ message: String(message || '').slice(0, 500), subject, model, report }) },
  });
  return { report, model, createdAt: new Date(), subject };
}

async function latestReport(userId, action, subject = null) {
  const rows = await prisma.activityLog.findMany({ where: { userId, action }, orderBy: { id: 'desc' }, take: subject === null ? 1 : 50 });
  for (const row of rows) {
    let d = {};
    try { d = JSON.parse(row.details || '{}'); } catch { continue; }
    if (subject === null || String(d.subject) === String(subject)) return { report: d.report || null, model: d.model || null, createdAt: row.createdAt, subject: d.subject ?? null };
  }
  return { report: null };
}

module.exports = { askJson, saveReport, latestReport, parseJson };
