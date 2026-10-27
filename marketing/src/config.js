// ─────────────────────────────────────────────────────────────────────────────
// Edit everything sales-related here. The rest of the site reads from this file.
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND = {
  name: 'Growlance',
  domain: 'growlance.app',
  tagline: 'Your AI bidding co-pilot for Freelancer.com',
  // Public-facing contact (a Zoho alias that routes to the hello@ mailbox).
  email: 'support@growlance.app',
}

export const PRICING = {
  // One-time purchase (the app has no subscription — "buy once, run forever").
  // NOTE: this is only the DISPLAYED price. The amount actually charged is set
  // server-side via the GROWLANCE_PRICE_USD env var (see api/checkout.js) so a
  // buyer can't tamper with it — keep the two in sync.
  price: 89,
  currency: 'USD',
  currencySymbol: '$',
  cadence: 'one-time',
  refund: '14-day money-back guarantee',
}

// ── Crypto checkout (Plisio, via serverless function) ────────────────────────
// Checkout is crypto-only. The buy buttons hit a same-origin serverless function
// (api/checkout.js) that creates a fresh Plisio invoice and redirects the buyer
// to Plisio's hosted payment page. The Plisio SECRET KEY lives only in that
// function as a host env var (PLISIO_SECRET_KEY) — it never touches the browser.
// See marketing/README.md for the full deploy + Plisio dashboard setup.
export const CHECKOUT = {
  provider: 'plisio',
  endpoint: '/api/checkout',
  // Cosmetic only — what buyers see as "accepted". Your Plisio account settings
  // ("Supported currencies") decide what's actually enabled.
  acceptedCoins: ['BTC', 'ETH', 'USDT', 'USDC', 'LTC'],
  note: 'Pay with Bitcoin, stablecoins & more · settles to the seller’s own wallet',
}

// Downloads go through the same-origin proxy (api/download.js), which resolves
// the latest GitHub Release asset for the chosen platform and redirects to it —
// so installers can live on the PRIVATE repo. Needs GITHUB_TOKEN set in Vercel.
export const DOWNLOADS = {
  mac: '/api/download?platform=mac', // Apple Silicon .dmg
  macIntel: '/api/download?platform=mac-intel', // Intel .dmg
  windows: '/api/download?platform=windows', // .exe installer
  linux: '/api/download?platform=linux', // .AppImage
  releasesUrl: '/api/download', // auto-detect by OS
}

export const HERO = {
  // Screenshots for the hero slideshow, in order. Drop each file in public/ and
  // add an entry with a short caption. 1 image = shown static; 2+ = autoplaying
  // slideshow with arrows + dots. For a clean carousel, capture every page at
  // the SAME window size (recommended ~1400×900, PNG, dark mode).
  // Leave the array empty to fall back to the built-in CSS mock.
  screenshots: [
    { src: '/app-screenshot.png', label: 'Dashboard' },
    { src: '/screenshot-projects.png', label: 'Projects' },
    { src: '/screenshot-profiles.png', label: 'Bid Profiles' },
    { src: '/screenshot-bids.png', label: 'Bid History' },
    { src: '/screenshots-calendar.png', label: 'Calendar' },
    { src: '/screenshot-settings.png', label: 'Settings' },
  ],
}

export const LINKS = {
  // Calendly booking link for the "Book a demo" CTA.
  calendly: 'https://calendly.com/hello-growlance-m-om/30min',
}
