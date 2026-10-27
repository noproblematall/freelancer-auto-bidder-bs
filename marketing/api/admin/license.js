import crypto from 'crypto'
import { db } from '../../lib/license/db.js'
import { generateLicenseKey, hashKey, encryptKey, decryptKey } from '../../lib/license/crypto.js'

// Password-protected admin API for license management (used by /admin.html).
// Auth: send the ADMIN_TOKEN as the `x-admin-token` header. All actions POST to
// this single endpoint with an `action` field.

function authed(req) {
  const token = process.env.ADMIN_TOKEN
  if (!token) return false
  const got = String(req.headers['x-admin-token'] || '')
  const a = Buffer.from(got)
  const b = Buffer.from(token)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function safeDecrypt(enc) {
  try {
    return decryptKey(enc)
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  if (!process.env.ADMIN_TOKEN) return res.status(500).json({ error: 'admin_not_configured' })
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' })

  const body = req.body || {}
  const action = body.action

  // Auth-only ping (no DB) — lets the login verify the password even before the
  // database is configured.
  if (action === 'ping') return res.status(200).json({ ok: true })

  let sql
  try {
    sql = db()
  } catch {
    return res.status(503).json({ error: 'db_unconfigured' })
  }

  try {
    if (action === 'list') {
      const rows = await sql`
        select l.id, l.email as label, l.plan, l.status, l.machine_limit, l.order_ref,
               l.created_at, l.expires_at, l.key_enc,
               (select count(*)::int from devices d where d.license_id = l.id) as devices_used,
               (select min(d.activated_at) from devices d where d.license_id = l.id) as activated_at,
               (select max(d.last_seen_at) from devices d where d.license_id = l.id) as last_seen_at,
               (select string_agg(coalesce(d.name, 'unnamed'), ', ') from devices d where d.license_id = l.id) as device_names
        from licenses l order by l.created_at desc limit 500`
      const items = rows.map((r) => ({
        id: r.id,
        label: r.label,
        status: r.status,
        machineLimit: r.machine_limit,
        devicesUsed: r.devices_used,
        ref: r.order_ref,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        activatedAt: r.activated_at,
        lastSeenAt: r.last_seen_at,
        deviceNames: r.device_names,
        key: safeDecrypt(r.key_enc),
        type:
          r.plan === 'trial' || String(r.order_ref || '').startsWith('trial:')
            ? 'trial'
            : String(r.order_ref || '').startsWith('manual-')
              ? 'manual'
              : 'paid',
      }))
      return res.json({ ok: true, items })
    }

    if (action === 'create') {
      const key = (body.key && String(body.key).trim()) || generateLicenseKey()
      const label = body.label ? String(body.label).slice(0, 120) : null
      const devices = Math.max(1, parseInt(body.devices, 10) || 1)
      const ref = 'manual-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
      await sql`
        insert into licenses (key_hash, key_enc, email, plan, status, machine_limit, order_ref)
        values (${hashKey(key)}, ${encryptKey(key)}, ${label}, 'lifetime', 'active', ${devices}, ${ref})`
      return res.json({ ok: true, key })
    }

    if (action === 'setStatus') {
      if (!['active', 'revoked', 'refunded'].includes(body.status)) return res.status(400).json({ error: 'bad_status' })
      await sql`update licenses set status = ${body.status} where id = ${body.id}`
      return res.json({ ok: true })
    }

    if (action === 'setLimit') {
      const limit = Math.max(1, parseInt(body.machineLimit, 10) || 1)
      await sql`update licenses set machine_limit = ${limit} where id = ${body.id}`
      return res.json({ ok: true })
    }

    if (action === 'resetDevices') {
      await sql`delete from devices where license_id = ${body.id}`
      return res.json({ ok: true })
    }

    if (action === 'delete') {
      await sql`delete from licenses where id = ${body.id}`
      return res.json({ ok: true })
    }

    return res.status(400).json({ error: 'unknown_action' })
  } catch (err) {
    console.error('admin error:', err)
    return res.status(500).json({ error: 'server_error' })
  }
}
