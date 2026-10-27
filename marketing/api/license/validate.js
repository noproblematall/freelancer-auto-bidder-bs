import { db } from '../../lib/license/db.js'
import { hashKey, signToken } from '../../lib/license/crypto.js'

// POST /api/license/validate  { key, fingerprint }
// Periodic re-check from the app: confirms the license is still active and this
// device is still registered, then issues a fresh token. A revoked/refunded
// license (or an unregistered device) returns an error so the app can lock down.
const TOKEN_TTL_DAYS = 14

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { key, fingerprint } = req.body || {}
  if (!key || !fingerprint) return res.status(400).json({ error: 'missing_fields' })

  let sql
  try {
    sql = db()
  } catch {
    return res.status(500).json({ error: 'server_misconfigured' })
  }

  try {
    const keyHash = hashKey(key)
    const lic = (await sql`select * from licenses where key_hash = ${keyHash} limit 1`)[0]
    if (!lic) return res.status(404).json({ error: 'invalid_key' })
    if (lic.status !== 'active') return res.status(403).json({ error: `license_${lic.status}` })
    // Time-limited licenses (trials): refuse once past expiry so the app locks.
    const licExpMs = lic.expires_at ? new Date(lic.expires_at).getTime() : null
    if (licExpMs && licExpMs <= Date.now()) return res.status(403).json({ error: 'license_expired' })

    const dev = (
      await sql`select id from devices where license_id = ${lic.id} and fingerprint = ${fingerprint} limit 1`
    )[0]
    if (!dev) return res.status(409).json({ error: 'device_not_activated' })

    await sql`update devices set last_seen_at = now() where id = ${dev.id}`

    const now = Date.now()
    // Cap the token at the license's own expiry (trials must hard-stop on time).
    const exp = Math.min(now + TOKEN_TTL_DAYS * 86400000, licExpMs || Infinity)
    const token = signToken({
      lid: lic.id,
      f: fingerprint,
      plan: lic.plan,
      iat: now,
      exp,
    })
    return res.status(200).json({ ok: true, token, plan: lic.plan })
  } catch (err) {
    console.error('validate error:', err)
    return res.status(500).json({ error: 'server_error' })
  }
}
