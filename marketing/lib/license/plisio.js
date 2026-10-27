// Server-side payment verification via the Plisio operations API. We never trust
// the success page or the raw webhook body — we ask Plisio directly whether a
// given order (our own order_number) is actually paid.
//
// NOTE: the operations endpoint/response shape is the one Plisio-specific bit to
// confirm with a real test payment after deploy. It's isolated here so a tweak
// is a one-file change. Returns the matching completed operation, or null.
const BASE = 'https://api.plisio.net/api/v1'

function apiKey() {
  const k = process.env.PLISIO_SECRET_KEY
  if (!k) throw new Error('PLISIO_SECRET_KEY not set')
  return k
}

export async function getOperationByOrder(orderNumber) {
  const url = `${BASE}/operations?api_key=${encodeURIComponent(apiKey())}&order_number=${encodeURIComponent(orderNumber)}`
  const j = await (await fetch(url)).json()
  const data = j?.data
  const list = Array.isArray(data) ? data : data?.operations || []
  // EXACT match only. Never fall back to "the most recent operation" — the list
  // endpoint may not strictly filter by order_number, and a loose match would let
  // a forged order id claim someone else's completed payment.
  return list.find((o) => o.order_number === orderNumber) || null
}

// Returns the operation object if it's a genuine, completed payment for one of
// OUR orders, else null. Validates: exact order match, only our order prefix,
// completed status, and a non-trivial amount.
export async function verifyPaidOrder(orderNumber) {
  try {
    // Only ever verify orders we minted (checkout.js / manual). Rejects arbitrary
    // ids before they ever reach Plisio's looser matching.
    if (!/^growlance-/.test(String(orderNumber))) {
      console.warn('Plisio verify: rejecting non-Growlance order', orderNumber)
      return null
    }

    const op = await getOperationByOrder(orderNumber)
    if (!op) return null

    if (op.order_number !== orderNumber) {
      console.warn('Plisio verify: order mismatch', orderNumber, '!=', op.order_number)
      return null
    }
    if (op.status !== 'completed') {
      console.warn('Plisio order', orderNumber, 'status:', op.status ?? 'unknown')
      return null
    }
    // Defence-in-depth: a completed op should carry a positive amount. Plisio uses
    // a few field names depending on type; accept any that parses > 0.
    const amount = Number(op.amount ?? op.source_amount ?? op.actual_sum ?? op.sum ?? 0)
    if (!(amount > 0)) {
      console.warn('Plisio verify: order', orderNumber, 'has non-positive amount', amount)
      return null
    }
    return op
  } catch (err) {
    console.error('Plisio verify error for order', orderNumber, err)
    return null
  }
}

export function opEmail(op) {
  return op?.email || op?.customer_email || null
}
