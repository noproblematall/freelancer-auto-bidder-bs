// The Freelancer *website* session, captured by the in-app "Sign in to
// Freelancer.com" window (electron/main.js). Freelancer's dashboard reads the
// bid count from an internal endpoint that the website session can call; the
// API token from the OAuth connection is a different credential. Only the
// user id and the auth hash cookie are kept, encrypted, in a small file next
// to the database, and they are used for nothing but that count.
const fs = require('fs');
const path = require('path');
const { encrypt, decrypt } = require('../../utils/tokenManager');
const logger = require('../../utils/logger');

function sessionFile() {
  const dbPath = String(process.env.DATABASE_URL || '').replace(/^file:/, '');
  const dir = dbPath && path.isAbsolute(dbPath) ? path.dirname(dbPath) : path.join(__dirname, '../../../prisma');
  return path.join(dir, 'freelancer-web-session.json');
}

let cached; // undefined = not read yet, null = none

function write(s) {
  fs.writeFileSync(sessionFile(), JSON.stringify({ userId: s.userId, hash: encrypt(s.hash), savedAt: s.savedAt, invalidAt: s.invalidAt || null }));
}

function load() {
  if (cached !== undefined) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(sessionFile(), 'utf8'));
    cached = { userId: String(raw.userId), hash: decrypt(raw.hash), savedAt: raw.savedAt || null, invalidAt: raw.invalidAt || null };
  } catch {
    cached = null;
  }
  return cached;
}

function save({ userId, hash }) {
  cached = { userId: String(userId), hash: String(hash), savedAt: Date.now(), invalidAt: null };
  try { write(cached); } catch (err) { logger.warn(`Could not save the Freelancer website session: ${err.message}`); }
  logger.info(`Freelancer website session saved for user ${cached.userId}`);
}

function clear() {
  cached = null;
  try { fs.unlinkSync(sessionFile()); } catch (_) {}
}

// Freelancer answered 401/403: the session has expired or was signed out.
function markInvalid() {
  const s = load();
  if (!s || s.invalidAt) return;
  s.invalidAt = Date.now();
  try { write(s); } catch (_) {}
}

function status() {
  const s = load();
  return { present: !!s, savedAt: s?.savedAt || null, invalid: !!s?.invalidAt, userId: s?.userId || null };
}

// Request headers the website itself sends.
function headers() {
  const s = load();
  if (!s) return null;
  return {
    'freelancer-auth-v2': `${s.userId};${s.hash}`,
    Cookie: `GETAFREE_USER_ID=${s.userId}; GETAFREE_AUTH_HASH_V2=${s.hash}`,
  };
}

module.exports = { load, save, clear, markInvalid, status, headers, sessionFile };
