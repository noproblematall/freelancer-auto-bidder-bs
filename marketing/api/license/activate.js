import { db } from '../../lib/license/db.js'
import { hashKey, signToken } from '../../lib/license/crypto.js'

// POST /api/license/activate  { key, fingerprint, name? }
// Validates the key, enforces the per-license device limit, records this device,
// and returns a signed offline-verifiable token.
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

  const { key, fingerprint, name } = req.body || {}
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
    // Time-limited licenses (trials): refuse once past expiry.
    const licExpMs = lic.expires_at ? new Date(lic.expires_at).getTime() : null
    if (licExpMs && licExpMs <= Date.now()) return res.status(403).json({ error: 'license_expired' })

    // Atomic device registration (avoids the count-then-insert TOCTOU): insert
    // only if this device already exists (re-activation) OR the license is under
    // its machine limit. Run SERIALIZABLE with one retry so two concurrent
    // activations can't both slip past a limit-1 license. on-conflict handles a
    // same-device re-activation (just bumps last_seen).
    const registerDevice = () =>
      sql.transaction(
        [
          sql`
            insert into devices (license_id, fingerprint, name)
            select ${lic.id}, ${fingerprint}, ${name || null}
            where exists (select 1 from devices d where d.license_id = ${lic.id} and d.fingerprint = ${fingerprint})
               or (select count(*) from devices d where d.license_id = ${lic.id}) < ${lic.machine_limit}
            on conflict (license_id, fingerprint)
              do update set last_seen_at = now(), name = coalesce(excluded.name, devices.name)
            returning id
          `,
        ],
        { isolationLevel: 'Serializable' }
      )

    let result
    try {
      result = await registerDevice()
    } catch (e) {
      // Serialization failure under concurrency → retry once with a fresh snapshot.
      if (String(e?.code) === '40001' || /serializ/i.test(String(e?.message))) {
        result = await registerDevice()
      } else {
        throw e
      }
    }
    if (!(result?.[0]?.length)) {
      return res.status(409).json({ error: 'device_limit_reached', limit: lic.machine_limit })
    }

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
    return res.status(200).json({ ok: true, token, plan: lic.plan, email: lic.email })
  } catch (err) {
    console.error('activate error:', err)
    return res.status(500).json({ error: 'server_error' })
  }
}
