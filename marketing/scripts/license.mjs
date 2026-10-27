// Manual license admin — create free/comp licenses (for yourself & friends),
// list them, and revoke/reactivate. Talks straight to the licenses DB; no
// payment involved. Manually-created licenses activate exactly like paid ones.
//
// Needs DATABASE_URL and (for `create` / `list --keys`) LICENSE_KEY_ENC_SECRET —
// the same values set in Vercel. Easiest: copy them into marketing/.env (which
// is gitignored), then run with Node's --env-file:
//
//   node --env-file=.env scripts/license.mjs create
//   node --env-file=.env scripts/license.mjs create --devices 3 --email "me"
//   node --env-file=.env scripts/license.mjs create --email "Sam (friend)"
//   node --env-file=.env scripts/license.mjs list
//   node --env-file=.env scripts/license.mjs list --keys
//   node --env-file=.env scripts/license.mjs revoke GROW-XXXXX-XXXXX-XXXXX-XXXXX
//   node --env-file=.env scripts/license.mjs reactivate GROW-...

import { db } from '../lib/license/db.js'
import { generateLicenseKey, hashKey, encryptKey, decryptKey } from '../lib/license/crypto.js'

function flag(name, def) {
  const i = process.argv.indexOf('--' + name)
  return i > -1 ? process.argv[i + 1] : def
}
function bool(name) {
  return process.argv.includes('--' + name)
}

const cmd = process.argv[2] || 'help'

if (cmd === 'help') {
  console.log(`Growlance license admin

Usage (set DATABASE_URL + LICENSE_KEY_ENC_SECRET in env, e.g. --env-file=.env):

  create [--devices N] [--email "<label>"] [--key GROW-...]
                        Create an active license. Default 1 device. Use a higher
                        --devices for your own multi-machine use. --email is just
                        a label so you can tell licenses apart.
  list [--keys]         List licenses (newest first). --keys also prints the key.
  revoke <key>          Deactivate a license (status=revoked).
  reactivate <key>      Re-enable a revoked license.
`)
  process.exit(0)
}

const sql = db()

if (cmd === 'create') {
  const key = flag('key') || generateLicenseKey()
  const label = flag('email') || flag('label') || null
  const devices = Math.max(1, parseInt(flag('devices', '1'), 10) || 1)
  const ref = 'manual-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)

  await sql`
    insert into licenses (key_hash, key_enc, email, plan, status, machine_limit, order_ref)
    values (${hashKey(key)}, ${encryptKey(key)}, ${label}, 'lifetime', 'active', ${devices}, ${ref})
  `
  console.log('\n✓ License created')
  console.log('  Key:     ' + key)
  console.log('  Devices: ' + devices)
  if (label) console.log('  Label:   ' + label)
  console.log('\nGive this key to the person — they enter it in Growlance to activate.\n')
} else if (cmd === 'list') {
  const showKeys = bool('keys')
  const rows = await sql`
    select l.email, l.status, l.machine_limit, l.order_ref, l.created_at, l.key_enc,
           (select count(*)::int from devices d where d.license_id = l.id) as used
    from licenses l order by l.created_at desc limit 200
  `
  if (!rows.length) {
    console.log('No licenses yet.')
  } else {
    console.log('status     used    label                     ref' + (showKeys ? '                          key' : ''))
    for (const r of rows) {
      const line = [
        r.status.padEnd(9),
        (r.used + '/' + r.machine_limit).padEnd(6),
        (r.email || '-').padEnd(24),
        r.order_ref.padEnd(28),
      ].join('  ')
      console.log(line + (showKeys ? '  ' + decryptKey(r.key_enc) : ''))
    }
  }
} else if (cmd === 'revoke' || cmd === 'reactivate') {
  const key = process.argv[3]
  if (!key) {
    console.error(`usage: license.mjs ${cmd} <key>`)
    process.exit(1)
  }
  const status = cmd === 'revoke' ? 'revoked' : 'active'
  const r = await sql`update licenses set status = ${status} where key_hash = ${hashKey(key)} returning id`
  console.log(r.length ? `✓ ${cmd === 'revoke' ? 'Revoked' : 'Re-activated'}` : 'Key not found')
} else {
  console.error(`Unknown command: ${cmd}. Run with "help".`)
  process.exit(1)
}
