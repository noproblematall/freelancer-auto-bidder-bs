'use strict'

// Main-process licensing. The app shows a device number; the owner's key
// generator (tools/keygen, the only holder of the private key) signs a key
// for that number, and the app verifies it offline with the embedded public
// key. Tokens issued earlier by the license server keep working.
// See LICENSING.md.

const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const core = require('./license-core')

// Legacy license server (tokens activated before offline keys existed).
const SERVER = process.env.GROWLANCE_LICENSE_SERVER || 'https://growlance.app'
const REQUEST_TIMEOUT_MS = 12000
const FATAL_ERRORS = ['license_revoked', 'license_refunded', 'invalid_key', 'device_not_activated', 'license_expired']

// ── Device fingerprint / number ──────────────────────────────────────────────
function getFingerprint() {
  try {
    const { machineIdSync } = require('node-machine-id')
    return crypto.createHash('sha256').update('growlance:' + machineIdSync(true)).digest('hex')
  } catch {
    // Fallback: stable-ish hash of hostname + first non-internal MAC.
    const mac = Object.values(os.networkInterfaces())
      .flat()
      .find((n) => n && !n.internal && n.mac && n.mac !== '00:00:00:00:00:00')?.mac
    return crypto.createHash('sha256').update('growlance:' + os.hostname() + ':' + (mac || 'nomac')).digest('hex')
  }
}

function getDeviceNumber() {
  return core.deviceNumberFromFingerprint(getFingerprint())
}

// ── Local storage (userData/.license, owner-only) ────────────────────────────
function licPath() {
  return path.join(app.getPath('userData'), '.license')
}
function load() {
  try {
    return JSON.parse(fs.readFileSync(licPath(), 'utf8'))
  } catch {
    return null
  }
}
function save(obj) {
  fs.writeFileSync(licPath(), JSON.stringify(obj), { mode: 0o600 })
}
function clear() {
  try {
    fs.unlinkSync(licPath())
  } catch {}
}

// Verify whatever is stored: an offline key or a legacy server token.
function verifyStored(lic) {
  if (!lic?.token) return { valid: false, reason: 'missing' }
  if (core.isOfflineKey(lic.token)) return { ...core.verifyOfflineKey(lic.token, getDeviceNumber()), offline: true }
  return { ...core.verifyServerToken(lic.token, getFingerprint()), offline: false }
}

// ── Offline activation ───────────────────────────────────────────────────────
function fmtDate(ms) {
  try {
    return new Date(ms).toLocaleDateString()
  } catch {
    return String(ms)
  }
}

async function activate(key) {
  const trimmed = core.normalizeKey(key)
  if (!trimmed) return { error: 'missing_key', message: 'Paste your license key or load the key file.' }
  const deviceNumber = getDeviceNumber()

  if (!core.isOfflineKey(trimmed)) {
    return {
      error: 'invalid_key',
      message: `This is not a BidPilot key. Send the device number ${deviceNumber} to get a key made for this device.`,
    }
  }

  const v = core.verifyOfflineKey(trimmed, deviceNumber)
  if (v.reason === 'device_mismatch') {
    const forDevice = core.normalizeDeviceNumber(v.payload?.d) || 'another device'
    return {
      error: 'device_mismatch',
      message: `This key was made for device ${forDevice}. This device is ${deviceNumber}; a key must be generated for it.`,
    }
  }
  if (v.reason === 'expired') {
    return { error: 'license_expired', message: `This key expired on ${fmtDate(v.payload.exp)}. A new key is needed.` }
  }
  if (!v.valid) {
    return { error: 'invalid_key', message: 'This key is damaged or was not issued for BidPilot. Check that you copied all of it.' }
  }

  save({
    key: trimmed,
    token: trimmed,
    plan: v.payload.exp ? 'limited' : 'lifetime',
    label: v.payload.label || null,
    expiresAt: v.payload.exp || null,
    activatedAt: Date.now(),
  })
  return { ok: true, plan: v.payload.exp ? 'limited' : 'lifetime', expiresAt: v.payload.exp || null }
}

// ── Legacy server calls (only for tokens the server issued) ──────────────────
async function postJson(pathname, payload) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const r = await fetch(`${SERVER}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    })
    let body = null
    try {
      body = await r.json()
    } catch {}
    return { ok: r.ok, status: r.status, body }
  } finally {
    clearTimeout(timer)
  }
}

async function validate() {
  const lic = load()
  if (!lic?.token) return { error: 'no_license' }
  if (core.isOfflineKey(lic.token)) {
    const v = verifyStored(lic)
    return v.valid ? { ok: true } : { error: v.reason === 'expired' ? 'license_expired' : 'invalid_key', fatal: true }
  }
  if (!lic.key) return { error: 'no_license' }
  let res
  try {
    res = await postJson('/api/license/validate', { key: lic.key, fingerprint: getFingerprint() })
  } catch {
    return { error: 'network' }
  }
  if (!res.ok || !res.body?.ok) {
    const code = res.body?.error || 'validate_failed'
    return { error: code, fatal: FATAL_ERRORS.includes(code) }
  }
  save({ ...lic, token: res.body.token })
  return { ok: true }
}

async function deactivate() {
  const lic = load()
  if (lic?.key && !core.isOfflineKey(lic.token)) {
    try {
      await postJson('/api/license/deactivate', { key: lic.key, fingerprint: getFingerprint() })
    } catch {}
  }
  clear()
  return { ok: true }
}

// ── The gate decision ────────────────────────────────────────────────────────
// Offline key: valid → allowed; expired or made for another device → relock
// (the activation screen explains and shows the device number).
// Legacy server token: offline-valid → allowed; expired/mismatch → re-validate
// online; fatal answer → relock; transient network error → grace for expiry only.
async function isLicensed() {
  const lic = load()
  if (!lic?.token) return false

  const v = verifyStored(lic)
  if (v.valid) return true
  if (v.offline) {
    clear()
    return false
  }

  if (v.reason !== 'expired' && v.reason !== 'fingerprint_mismatch') return false
  const r = await validate()
  if (r.ok) return true
  if (r.fatal) {
    clear()
    return false
  }
  return v.reason === 'expired' && v.payload?.plan !== 'trial'
}

function maskKey(key) {
  if (!key) return null
  const groups = String(key).split('-')
  if (groups.length < 2) return '••••'
  return groups.map((g, i) => (i === 0 || i === groups.length - 1 ? g : '•'.repeat(g.length))).join('-')
}

function getStatus() {
  const lic = load()
  const deviceNumber = getDeviceNumber()
  if (!lic?.token) return { licensed: false, deviceNumber }
  const v = verifyStored(lic)
  return {
    licensed: true,
    deviceNumber,
    plan: lic.plan || null,
    label: lic.label || null,
    key: v.offline ? `Device ${deviceNumber}` : maskKey(lic.key),
    valid: v.valid,
    expired: !!v.expired,
    expiresAt: v.payload?.exp || null,
  }
}

module.exports = { isLicensed, activate, validate, deactivate, getStatus, getFingerprint, getDeviceNumber }
