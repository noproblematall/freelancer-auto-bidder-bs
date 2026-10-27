import { db } from '../../lib/license/db.js'
import { decryptKey } from '../../lib/license/crypto.js'
import { verifyPaidOrder, opEmail } from '../../lib/license/plisio.js'
import { issueLicense } from '../../lib/license/issue.js'

// Called same-origin by the thank-you page after Plisio redirects back with our
// order number. Re-verifies payment with Plisio, then returns the (idempotently
// issued) license key + download link to display. GET or POST with ?order=...
export default async function handler(req, res) {
  // Same-origin only — no CORS. This returns a raw license key; it must never be
  // readable cross-origin or cached anywhere.
  res.setHeader('Cache-Control', 'no-store')

  const orderNumber = req.method === 'POST' ? req.body?.order : req.query?.order
  if (!orderNumber) return res.status(400).json({ error: 'missing_order' })
  // Only Plisio checkout orders are claimable. This also keeps the DB-first
  // short-circuit below from ever serving non-purchase rows (e.g. trial
  // licenses, whose order_ref is 'trial:<fingerprint>').
  if (!String(orderNumber).startsWith('growlance-')) return res.status(400).json({ error: 'invalid_order' })

  try {
    const sql = db()

    // DB first: once a license exists for this order, payment was already
    // verified (webhook or an earlier claim) — return it without another Plisio
    // round-trip. The thank-you page polls up to ~40x per buyer; without this
    // short-circuit a traffic spike multiplies into Plisio API throttling, which
    // would make ALREADY-PAID buyers poll forever.
    const existing = (await sql`select key_enc from licenses where order_ref = ${orderNumber} limit 1`)[0]
    if (existing) {
      return res.status(200).json({ ok: true, key: decryptKey(existing.key_enc), download: process.env.DOWNLOAD_URL || null })
    }

    const op = await verifyPaidOrder(orderNumber)
    if (!op) return res.status(402).json({ error: 'payment_not_confirmed' })

    const { key } = await issueLicense({ sql, orderRef: orderNumber, email: opEmail(op) })
    return res.status(200).json({ ok: true, key, download: process.env.DOWNLOAD_URL || null })
  } catch (err) {
    console.error('claim error:', err)
    return res.status(500).json({ error: 'server_error' })
  }
}
