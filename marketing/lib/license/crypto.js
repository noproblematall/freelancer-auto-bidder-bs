import crypto from 'crypto'

// Crockford base32 (no ambiguous I L O U) for human-typeable keys.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

// GROW-XXXXX-XXXXX-XXXXX-XXXXX (20 random chars).
export function generateLicenseKey() {
  const b = crypto.randomBytes(20)
  let s = ''
  for (let i = 0; i < 20; i++) s += ALPHABET[b[i] & 31]
  return 'GROW-' + s.match(/.{5}/g).join('-')
}

// Normalize for hashing/lookup: uppercase, drop everything but A-Z0-9 (so dashes,
// spaces, and case don't matter). Issuance and activation must use the same form.
export function normalizeKey(key) {
  return String(key || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function hashKey(key) {
  return crypto.createHash('sha256').update(normalizeKey(key)).digest('hex')
}

function privateKey() {
  const b64 = process.env.LICENSE_SIGNING_PRIVATE_KEY
  if (!b64) throw new Error('LICENSE_SIGNING_PRIVATE_KEY not set')
  const pem = Buffer.from(b64, 'base64').toString('utf8')
  return crypto.createPrivateKey(pem)
}

// Signed offline-verifiable token: base64url(payload).base64url(ed25519 sig).
// The desktop app verifies this with the embedded public key — no network needed.
export function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.sign(null, Buffer.from(body), privateKey()).toString('base64url')
  return `${body}.${sig}`
}

// ── At-rest encryption for the raw license key ───────────────────────────────
// We store the key encrypted (not just hashed) so the success page can re-display
// it after payment. A DB leak alone is useless without LICENSE_KEY_ENC_SECRET.
const ENC_ALGO = 'aes-256-gcm'

function encSecret() {
  const b64 = process.env.LICENSE_KEY_ENC_SECRET
  if (!b64) throw new Error('LICENSE_KEY_ENC_SECRET not set')
  const buf = Buffer.from(b64, 'base64')
  if (buf.length !== 32) throw new Error('LICENSE_KEY_ENC_SECRET must be 32 bytes (base64)')
  return buf
}

export function encryptKey(plain) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv(ENC_ALGO, encSecret(), iv)
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decryptKey(b64) {
  const buf = Buffer.from(b64, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct = buf.subarray(28)
  const d = crypto.createDecipheriv(ENC_ALGO, encSecret(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
}
