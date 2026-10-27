import { generateLicenseKey, hashKey, encryptKey, decryptKey } from './crypto.js'

// Idempotently issue a license for a paid Plisio txn. Safe to call from both the
// webhook and the success-page claim — order_ref (the txn_id) is unique, so a
// race resolves to the same single license, and the raw key is recoverable from
// the encrypted column for re-display.
export async function issueLicense({ sql, orderRef, email }) {
  const existing = (await sql`select key_enc from licenses where order_ref = ${orderRef} limit 1`)[0]
  if (existing) return { key: decryptKey(existing.key_enc), reused: true }

  const key = generateLicenseKey()
  const inserted = await sql`
    insert into licenses (key_hash, key_enc, email, order_ref)
    values (${hashKey(key)}, ${encryptKey(key)}, ${email || null}, ${orderRef})
    on conflict (order_ref) do nothing
    returning id
  `
  if (inserted.length === 0) {
    // Lost the race — another caller just issued it; return that one.
    const row = (await sql`select key_enc from licenses where order_ref = ${orderRef} limit 1`)[0]
    return { key: decryptKey(row.key_enc), reused: true }
  }
  return { key, reused: false }
}
