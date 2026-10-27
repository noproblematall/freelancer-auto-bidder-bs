// Serverless checkout (Vercel / Netlify Node function).
//
// Flow: buyer clicks "Get Growlance" → this endpoint creates a fresh Plisio
// invoice via the API → redirects the buyer to Plisio's hosted payment page.
//
// The Plisio SECRET KEY lives ONLY here, read from the host's environment
// variables — it never reaches the browser. The charged amount is read from the
// server too, so a buyer can't tamper with the price.
//
// Required env vars (set in your hosting dashboard, never commit them):
//   PLISIO_SECRET_KEY          your Plisio API secret key
//   GROWLANCE_PRICE_USD        e.g. "89"          (optional, defaults to 89)
//   GROWLANCE_PRICE_CURRENCY   e.g. "USD"         (optional, defaults to USD)

import { allow, clientIp } from '../lib/license/ratelimit.js'

export default async function handler(req, res) {
  // Don't mint an invoice for crawlers, link unfurlers, or browser prefetch —
  // only a real navigation should create one. (BuyButton is rel="nofollow" and
  // robots.txt disallows /api/, this is the belt-and-suspenders.)
  const purpose = req.headers['sec-purpose'] || req.headers['purpose'] || req.headers['x-purpose'] || ''
  if (req.method !== 'GET' || /prefetch|preview|prerender/i.test(String(purpose))) {
    res.status(204).end()
    return
  }

  // A human buys once, maybe retries a few times — cap invoice creation per IP
  // so bots that ignore robots.txt can't spam the Plisio account (which could
  // trip Plisio-side limits and fail REAL buyers). Best-effort per instance.
  if (!allow(`checkout:${clientIp(req)}`, 5, 10 * 60 * 1000)) {
    res.writeHead(302, { Location: '/#pricing' })
    res.end()
    return
  }

  const apiKey = process.env.PLISIO_SECRET_KEY
  const amount = process.env.GROWLANCE_PRICE_USD || '89'
  const currency = process.env.GROWLANCE_PRICE_CURRENCY || 'USD'

  // Failures land on a top-level navigation, so return a small branded page
  // (not raw text) with a way back and the support address.
  const failPage = (status, message) => {
    res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkout — Growlance</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#12151b;color:#cbd5e1;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;text-align:center;padding:24px}
h1{color:#fff;font-size:1.4rem;margin:0 0 10px}p{margin:0 0 22px;color:#94a3b8;max-width:26rem;line-height:1.6}
a.btn{display:inline-block;background:#10b981;color:#0b3b2e;font-weight:700;padding:12px 22px;border-radius:12px;text-decoration:none}
a{color:#34d399}</style></head><body><div>
<h1>Checkout didn&rsquo;t start</h1>
<p>${message} If this keeps happening, email <a href="mailto:support@growlance.app">support@growlance.app</a> and we&rsquo;ll sort it out.</p>
<a class="btn" href="/#pricing">&larr; Back to Growlance</a>
</div></body></html>`)
  }

  if (!apiKey) {
    failPage(500, 'Checkout is not configured yet.')
    return
  }

  // Unique order id per click — required by Plisio and useful for reconciliation.
  const orderNumber = `growlance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Public base URL (override with BASE_URL env if the domain changes).
  const base = process.env.BASE_URL || 'https://growlance.app'

  const params = new URLSearchParams({
    api_key: apiKey,
    order_number: orderNumber,
    order_name: 'Growlance — Lifetime License',
    source_currency: currency,
    source_amount: String(amount),
    // After payment, Plisio redirects the buyer here; we carry our own order id
    // so the page can claim + display the license key.
    success_callback_url: `${base}/thank-you.html?order=${orderNumber}`,
    fail_callback_url: `${base}/#pricing`,
    // Async IPN — the reliable issuance trigger. json=true sends a JSON body.
    callback_url: `${base}/api/license/webhook?json=true`,
  })

  try {
    const r = await fetch(`https://api.plisio.net/api/v1/invoices/new?${params.toString()}`)
    const data = await r.json()
    const invoiceUrl = data && data.data && data.data.invoice_url

    if (data && data.status === 'success' && invoiceUrl) {
      res.writeHead(302, { Location: invoiceUrl })
      res.end()
      return
    }

    console.error('Plisio invoice creation failed:', JSON.stringify(data))
    failPage(502, 'We could not create your payment invoice — please try again in a minute.')
  } catch (err) {
    console.error('Plisio request error:', err)
    failPage(502, 'We could not reach the payment provider — please try again shortly.')
  }
}
