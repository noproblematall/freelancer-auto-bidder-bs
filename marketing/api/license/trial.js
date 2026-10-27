import { db } from '../../lib/license/db.js'
import { generateLicenseKey, hashKey, encryptKey, decryptKey, signToken } from '../../lib/license/crypto.js'
import { allow, clientIp } from '../../lib/license/ratelimit.js'

// POST /api/license/trial  { fingerprint, name? }
// Issues a 7-day trial license locked to this device — no payment, no account.
//
// Anti-abuse: order_ref = 'trial:<fingerprint>' and order_ref is UNIQUE, so each
// device fingerprint can ever get ONE trial row (a second request returns the
// same, by-then-expired trial → trial_used). Fingerprints are sha256 of the OS
// machine id computed inside the app, and the issued token is bound to that
// fingerprint — a made-up fingerprint yields a token the real app won't accept.
const TRIAL_DAYS = 7

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { fingerprint, name } = req.body || {}
  // The app always sends a sha256 hex fingerprint — reject anything else early
  // (also keeps junk out of order_ref).
  if (!/^[a-f0-9]{64}$/i.test(String(fingerprint || ''))) {
    return res.status(400).json({ error: 'missing_fields' })
  }

  // Fabricated fingerprints are free, so cap issuance per IP (a real machine
  // needs exactly one). Best-effort per-instance limit — see ratelimit.js.
  if (!allow(`trial:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'rate_limited' })
  }

  let sql
  try {
    sql = db()
  } catch {
    return res.status(500).json({ error: 'server_misconfigured' })
  }

  try {
    const orderRef = `trial:${fingerprint}`

    // Idempotent issuance (same pattern as paid licenses): the unique order_ref
    // resolves races to a single row, and re-requests return that same trial.
    let lic = (await sql`select * from licenses where order_ref = ${orderRef} limit 1`)[0]
    let rawKey = null
    if (!lic) {
      const key = generateLicenseKey()
      const endsAt = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString()
      const inserted = await sql`
        insert into licenses (key_hash, key_enc, plan, machine_limit, order_ref, expires_at)
        values (${hashKey(key)}, ${encryptKey(key)}, 'trial', 1, ${orderRef}, ${endsAt})
        on conflict (order_ref) do nothing
        returning *
      `
      if (inserted.length) {
        lic = inserted[0]
        rawKey = key
      } else {
        // Lost the race — another request just created it; use that one.
        lic = (await sql`select * from licenses where order_ref = ${orderRef} limit 1`)[0]
      }
    }

    if (!lic) {
      // Should be unreachable (insert-or-select above), but never 500 on it.
      console.error('trial: license row missing after insert for', orderRef)
      return res.status(500).json({ error: 'server_error' })
    }
    if (lic.status !== 'active') return res.status(403).json({ error: `license_${lic.status}` })

    const expMs = new Date(lic.expires_at).getTime()
    if (!(expMs > Date.now())) {
      // This device already had its trial and it has ended.
      return res.status(403).json({ error: 'trial_used' })
    }

    // Register (or refresh) this device. No machine-limit dance needed: the
    // fingerprint IS the trial's identity, so it's one device by construction.
    await sql`
      insert into devices (license_id, fingerprint, name)
      values (${lic.id}, ${fingerprint}, ${name || null})
      on conflict (license_id, fingerprint)
        do update set last_seen_at = now(), name = coalesce(excluded.name, devices.name)
    `

    // Token expiry = trial end (never beyond), so the app hard-stops on time.
    const token = signToken({
      lid: lic.id,
      f: fingerprint,
      plan: 'trial',
      iat: Date.now(),
      exp: expMs,
    })
    return res.status(200).json({
      ok: true,
      token,
      key: rawKey || decryptKey(lic.key_enc),
      plan: 'trial',
      expiresAt: new Date(expMs).toISOString(),
    })
  } catch (err) {
    console.error('trial error:', err)
    return res.status(500).json({ error: 'server_error' })
  }
}
