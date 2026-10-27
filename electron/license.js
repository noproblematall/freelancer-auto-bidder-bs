'use strict'

// Main-process licensing: device fingerprint, encrypted-at-rest-by-OS token
// storage, offline token verification (Ed25519), and online activate/validate/
// deactivate against the license server. See LICENSING.md.

const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const PUBLIC_KEY_PEM = require('./license-public-key')

// Override for local testing (e.g. http://localhost:5180 with `vercel dev`).
const SERVER = process.env.GROWLANCE_LICENSE_SERVER || 'https://growlance.app'
const REQUEST_TIMEOUT_MS = 12000

// Errors that mean "this license can never work here" → clear local state + relock.
// license_expired covers ended trials (paid licenses have no expiry).
const FATAL_ERRORS = ['license_revoked', 'license_refunded', 'invalid_key', 'device_not_activated', 'license_expired']

// ── Device fingerprint ───────────────────────────────────────────────────────
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

// ── Offline token verification ───────────────────────────────────────────────
// Token = base64url(payload).base64url(ed25519-signature). Verifies the signature
// with the embedded public key, that it's bound to THIS device, and not expired.
function verifyTokenOffline(token, fingerprint) {
  try {
    const [body, sig] = String(token || '').split('.')
    if (!body || !sig) return { valid: false, reason: 'malformed' }
    const pub = crypto.createPublicKey(PUBLIC_KEY_PEM)
    const ok = crypto.verify(null, Buffer.from(body), pub, Buffer.from(sig, 'base64url'))
    if (!ok) return { valid: false, reason: 'bad_signature' }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (payload.f !== fingerprint) return { valid: false, expired: false, reason: 'fingerprint_mismatch', payload }
    const expired = !(payload.exp && payload.exp > Date.now())
    return { valid: !expired, expired, reason: expired ? 'expired' : 'ok', payload }
  } catch (err) {
    // Unparseable/tampered token — treat as untrusted, never grace.
    return { valid: false, reason: 'malformed', error: err.message }
  }
}

// ── Server calls ─────────────────────────────────────────────────────────────
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

function humanError(code) {
  switch (code) {
    case 'invalid_key':
      return "That license key wasn't found. Double-check it for typos."
    case 'device_limit_reached':
      return 'This license is already active on another device. Email support@growlance.app to move it to this one.'
    case 'license_revoked':
      return 'This license has been revoked.'
    case 'license_refunded':
      return 'This license was refunded and is no longer active.'
    case 'license_expired':
      return 'Your free trial has ended. Get a lifetime license at growlance.app to keep going.'
    case 'trial_used':
      return 'This device has already used its free trial. Get a lifetime license at growlance.app to keep going.'
    case 'network':
      return "Couldn't reach the license server. Check your internet connection and try again."
    default:
      return 'Activation failed. Please try again, or contact support@growlance.app.'
  }
}

async function activate(key) {
  const trimmed = String(key || '').trim()
  if (!trimmed) return { error: 'missing_key', message: 'Enter your license key.' }
  const fingerprint = getFingerprint()
  let res
  try {
    res = await postJson('/api/license/activate', { key: trimmed, fingerprint, name: os.hostname() })
  } catch {
    return { error: 'network', message: humanError('network') }
  }
  if (!res.ok || !res.body?.ok) {
    const code = res.body?.error || 'activation_failed'
    return { error: code, message: humanError(code) }
  }
  // Verify the token the server just issued BEFORE saving it. If it doesn't
  // verify with our embedded public key (e.g. the app's public key and the
  // server's private key are from different keygen runs), saving it would create
  // an unrecoverable loop: restart → offline-verify fails → activation screen,
  // forever. Fail loudly instead.
  const check = verifyTokenOffline(res.body.token, fingerprint)
  if (!check.valid) {
    return {
      error: 'token_unverifiable',
      message:
        'Activation succeeded but the license could not be verified on this device. This usually means the app build is misconfigured — please contact support@growlance.app.',
    }
  }
  save({ key: trimmed, token: res.body.token, plan: res.body.plan, activatedAt: Date.now() })
  return { ok: true, plan: res.body.plan }
}

// Start a 7-day device-locked trial — no key entry, no account. The server
// enforces one trial per device fingerprint (forever); the token it returns
// expires at trial end, so the app hard-stops on time.
async function startTrial() {
  const fingerprint = getFingerprint()
  let res
  try {
    res = await postJson('/api/license/trial', { fingerprint, name: os.hostname() })
  } catch {
    return { error: 'network', message: humanError('network') }
  }
  if (!res.ok || !res.body?.ok) {
    const code = res.body?.error || 'trial_failed'
    return { error: code, message: humanError(code) }
  }
  // Same verify-before-save rule as activate(): a token our embedded public key
  // can't verify must never be persisted (it would relock forever on restart).
  const check = verifyTokenOffline(res.body.token, fingerprint)
  if (!check.valid) {
    return {
      error: 'token_unverifiable',
      message:
        'The trial started but the license could not be verified on this device. This usually means the app build is misconfigured — please contact support@growlance.app.',
    }
  }
  save({
    key: res.body.key,
    token: res.body.token,
    plan: 'trial',
    trialEndsAt: res.body.expiresAt,
    activatedAt: Date.now(),
  })
  return { ok: true, plan: 'trial', expiresAt: res.body.expiresAt }
}

async function validate() {
  const lic = load()
  if (!lic?.key) return { error: 'no_license' }
  const fingerprint = getFingerprint()
  let res
  try {
    res = await postJson('/api/license/validate', { key: lic.key, fingerprint })
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
  if (lic?.key) {
    try {
      await postJson('/api/license/deactivate', { key: lic.key, fingerprint: getFingerprint() })
    } catch {}
  }
  clear()
  return { ok: true }
}

// ── The gate decision ────────────────────────────────────────────────────────
// Policy: offline-valid token → allowed. Expired or device-mismatch → re-validate
// online; explicit revoke/refund/invalid → relock; transient network/server error
// on an otherwise-valid license → allow (don't punish paying users for our
// downtime — the 14-day token already bounds this).
async function isLicensed() {
  const lic = load()
  if (!lic?.token || !lic?.key) return false

  const fingerprint = getFingerprint()
  const v = verifyTokenOffline(lic.token, fingerprint)
  if (v.valid) return true

  // Only a genuinely-signed token that is simply EXPIRED or bound to a different
  // fingerprint is worth re-checking online. A malformed/tampered/bad-signature
  // token is never trusted — deny outright (prevents a hand-crafted .license file
  // from unlocking the app while offline).
  if (v.reason !== 'expired' && v.reason !== 'fingerprint_mismatch') return false

  const r = await validate()
  if (r.ok) return true
  if (r.fatal) {
    clear()
    return false
  }
  // Transient network/server error: extend grace ONLY for a genuinely-expired
  // token (don't punish paying users for our downtime). A device mismatch must be
  // confirmed by the server, so it does not get grace. Trials never get grace —
  // their token expiry IS the trial end, so an unreachable server (or a hosts-file
  // block) must not extend the trial.
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
  if (!lic?.token) return { licensed: false }
  const v = verifyTokenOffline(lic.token, getFingerprint())
  return {
    licensed: true,
    plan: lic.plan || null,
    key: maskKey(lic.key),
    valid: v.valid,
    expired: !!v.expired,
    // For trials: when access ends (ms epoch from the signed token).
    expiresAt: v.payload?.exp || null,
  }
}

module.exports = { isLicensed, activate, startTrial, validate, deactivate, getStatus, getFingerprint }
