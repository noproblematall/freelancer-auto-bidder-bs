import { db } from '../../lib/license/db.js'
import { verifyPaidOrder, opEmail } from '../../lib/license/plisio.js'
import { issueLicense } from '../../lib/license/issue.js'

// Plisio Status URL (IPN). Set it in Plisio to:
//   https://growlance.app/api/license/webhook?json=true
// We don't trust the body — we re-verify the order with Plisio, then issue the
// license (idempotent). The success page also claims it; whichever runs first wins.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const body = req.body || {}
  const orderNumber = body.order_number || req.query?.order_number
  if (!orderNumber) return res.status(400).json({ error: 'missing_order_number' })

  try {
    // Ack non-completed IPNs (pending/new/expired) without issuing — Plisio
    // re-sends when the status changes to completed.
    const op = await verifyPaidOrder(orderNumber)
    if (!op) return res.status(200).json({ ok: true, issued: false })

    const sql = db()
    await issueLicense({ sql, orderRef: orderNumber, email: opEmail(op) })
    return res.status(200).json({ ok: true, issued: true })
  } catch (err) {
    console.error('webhook error:', err)
    return res.status(500).json({ error: 'server_error' })
  }
}
