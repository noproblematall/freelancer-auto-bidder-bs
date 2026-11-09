'use strict'

// Pure licensing logic (no Electron dependency) shared by electron/license.js
// and the tests: device numbers, offline key verification, and the legacy
// server-token check. The key generator (tools/keygen) is the only holder of
// the matching private key.
const crypto = require('crypto')
const KEYS = require('./license-public-key')

// Offline key: "GROWL1." + base64url(payload) + "." + base64url(ed25519 signature)
// payload = { v: 1, d: "XXXX-XXXX-XXXX-XXXX", iat: ms, exp: ms | null, label?: string }
const OFFLINE_PREFIX = 'GROWL1.'

// The device number shown to the user: the first 16 hex characters of the
// device fingerprint, upper-cased and grouped in fours.
function deviceNumberFromFingerprint(fingerprint) {
  return formatDeviceNumber(String(fingerprint || '').slice(0, 16))
}

// Accepts any spacing/case/dashes the user typed; null when it is not 16 hex chars.
function normalizeDeviceNumber(input) {
  const hex = String(input || '').toUpperCase().replace(/[^0-9A-F]/g, '')
  return hex.length === 16 ? formatDeviceNumber(hex) : null
}

function formatDeviceNumber(hex16) {
  return hex16.toUpperCase().match(/.{1,4}/g).join('-')
}

function verifySignature(body, sig, pem) {
  try {
    const pub = crypto.createPublicKey(pem)
    return crypto.verify(null, Buffer.from(body), pub, Buffer.from(sig, 'base64url'))
  } catch {
    return false
  }
}

// Key files may carry line breaks or spaces from copy/paste.
function normalizeKey(key) {
  return String(key || '').replace(/\s+/g, '')
}

function isOfflineKey(key) {
  return normalizeKey(key).startsWith(OFFLINE_PREFIX)
}

// → { valid, expired, reason, payload }
//   reason: ok | malformed | bad_signature | device_mismatch | expired
function verifyOfflineKey(key, deviceNumber) {
  const k = normalizeKey(key)
  if (!k.startsWith(OFFLINE_PREFIX)) return { valid: false, reason: 'malformed' }
  const [body, sig] = k.slice(OFFLINE_PREFIX.length).split('.')
  if (!body || !sig) return { valid: false, reason: 'malformed' }
  if (!verifySignature(body, sig, KEYS.offline)) return { valid: false, reason: 'bad_signature' }
  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { valid: false, reason: 'malformed' }
  }
  if (payload.v !== 1 || normalizeDeviceNumber(payload.d) !== deviceNumber) {
    return { valid: false, expired: false, reason: 'device_mismatch', payload }
  }
  const expired = payload.exp != null && !(payload.exp > Date.now())
  return { valid: !expired, expired, reason: expired ? 'expired' : 'ok', payload }
}

// Legacy token issued by the license server: base64url(payload).base64url(sig),
// payload { lid, f: fingerprint, plan, iat, exp }. Kept so installs activated
// before the offline keys stay licensed.
function verifyServerToken(token, fingerprint) {
  try {
    const [body, sig] = String(token || '').split('.')
    if (!body || !sig) return { valid: false, reason: 'malformed' }
    if (!verifySignature(body, sig, KEYS.server)) return { valid: false, reason: 'bad_signature' }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (payload.f !== fingerprint) return { valid: false, expired: false, reason: 'fingerprint_mismatch', payload }
    const expired = !(payload.exp && payload.exp > Date.now())
    return { valid: !expired, expired, reason: expired ? 'expired' : 'ok', payload }
  } catch (err) {
    return { valid: false, reason: 'malformed', error: err.message }
  }
}

module.exports = {
  OFFLINE_PREFIX,
  deviceNumberFromFingerprint,
  normalizeDeviceNumber,
  normalizeKey,
  isOfflineKey,
  verifyOfflineKey,
  verifyServerToken,
}
