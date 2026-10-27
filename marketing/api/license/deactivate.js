import { db } from '../../lib/license/db.js'
import { hashKey } from '../../lib/license/crypto.js'

// POST /api/license/deactivate  { key, fingerprint }
// Self-service transfer: frees this device's slot so the license can be activated
// on a new machine (new laptop, reinstall, etc.).
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
    const lic = (await sql`select id from licenses where key_hash = ${keyHash} limit 1`)[0]
    if (!lic) return res.status(404).json({ error: 'invalid_key' })

    const removed = await sql`
      delete from devices where license_id = ${lic.id} and fingerprint = ${fingerprint} returning id
    `
    return res.status(200).json({ ok: true, removed: removed.length })
  } catch (err) {
    console.error('deactivate error:', err)
    return res.status(500).json({ error: 'server_error' })
  }
}
