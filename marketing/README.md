# Growlance — Marketing Site

Standalone landing page for selling Growlance. Built with Vite + React 19 +
Tailwind CSS 4, matching the app's navy/Outfit brand with an emerald accent.

It is fully independent of the desktop app — nothing here imports from
`frontend/` or `backend/`, so it builds and deploys on its own.

## Develop

```bash
cd marketing
npm install
npm run dev      # http://localhost:5180
```

## Build

```bash
npm run build    # outputs to marketing/dist
npm run preview  # preview the production build locally
```

## Edit the sales details

Everything you'll want to change lives in **`src/config.js`**:

- **Price** — `PRICING.price` (displayed price; the *charged* amount is the
  `GROWLANCE_PRICE_USD` env var — keep them in sync).
- **Crypto checkout** — `CHECKOUT.acceptedCoins` (the coin chips shown to buyers).
  The payment itself runs through a serverless function — see "Crypto checkout"
  below. The price and secret key are host env vars, not in this file.
- **Download links** — `DOWNLOADS.mac/windows/linux/releasesUrl`
  (point at your GitHub Releases assets).
- **Contact & domain** — `BRAND.email`, `BRAND.domain`.
- **External links** — `LINKS.github/docs/compliance`.

Feature copy lives in `src/data/features.js` and is distilled from the
repo's `HOMEPAGE.md` (the source-of-truth inventory) — keep them in sync.

## Crypto checkout (Plisio, via a serverless function)

Checkout is **crypto-only**, powered by **Plisio**. Because a Plisio invoice is a
one-time link (it can't be a permanent website button), the buy buttons call a
tiny **serverless function** (`api/checkout.js`) that creates a fresh invoice per
click and redirects the buyer to Plisio's hosted payment page.

Your Plisio **secret key never touches the browser** — it lives only in the
function, read from a host environment variable. The charged price is read
server-side too, so a buyer can't tamper with it.

### One-time setup

1. **Rotate your Plisio secret key** if it was ever shown/shared (Plisio → API →
   regenerate). Treat the old one as compromised.
2. **Deploy to a host that runs serverless functions** — **Vercel** or
   **Netlify** (both free, both auto-detect `api/`). See **Deploy** below.
3. **Set environment variables** in the host dashboard (never commit them):
   - `PLISIO_SECRET_KEY` — your Plisio API secret key
   - `GROWLANCE_PRICE_USD` — e.g. `89` (keep in sync with `PRICING.price`)
   - `GROWLANCE_PRICE_CURRENCY` — e.g. `USD`
4. **Configure your Plisio API integration** (the "Custom" integration page —
   the one in your screenshot):
   - **Supported currencies** — tick the coins you want to accept.
   - **Success URL** → `https://growlance.app/thank-you.html` (the included
     download page).
   - **Failed URL** → `https://growlance.app/#pricing`.
   - **Who pays the commission** — "Site" (you absorb ~0.5%) or "Client" (buyer
     pays it on top) — your call.
   - Leave **Disable withdrawal via API** checked (security).
   - **Status URL** (optional, advanced) — an IPN webhook, only if you later
     want to auto-verify payments / gate downloads. Not needed for launch.
5. **Set the download links** on the thank-you page: edit
   `public/thank-you.html` and replace the `href="#"` values with your real
   installer URLs (and set `DOWNLOADS` in `src/config.js` for the landing page).

> Heads-up: the thank-you page is a public redirect target, not a paywall —
> fine for launch. To truly gate downloads behind a *confirmed* payment, add a
> Status URL (IPN) handler later. Ask and I can build it.

> **Taxes:** accepting crypto doesn't change anything here — the income is still
> taxable wherever you're resident. Keep records of each sale's value at the
> time of payment.

The hero shows a CSS-rendered mock of the app (`src/components/AppPreview.jsx`).
Swap it for a real screenshot when you have one for stronger conversion.

## Deploy

The site is a static SPA **plus one serverless function** (`api/checkout.js`), so
deploy it to a host that runs both:

- **Vercel** (recommended) — import the `marketing/` folder as the project.
  Vercel auto-detects Vite (build `npm run build`, output `dist`) and serves
  `api/checkout.js` at `/api/checkout` with zero config. Add the env vars above
  under Project → Settings → Environment Variables.
- **Netlify** — works too; set the functions directory to `api/` if prompted.
  Same env vars.

Both give free auto-HTTPS, which is **required** for a `.app` domain (the whole
TLD is HSTS-preloaded).

> The buy buttons only work once deployed — the `/api/checkout` function isn't
> available under plain `npm run dev`. Use `vercel dev` / `netlify dev` locally
> if you want to test checkout end-to-end.

## SEO & social previews

Two build-time pieces make the site crawler- and share-friendly:

- **Pre-rendering** — `npm run build` runs `vite build` then
  `scripts/prerender.mjs`, which renders the React app to static HTML (via
  `react-dom/server` + esbuild — no headless browser) and injects it into
  `dist/index.html`. The client **hydrates** that markup (`src/main.jsx`), so
  real users get an interactive page while crawlers/scrapers that don't run JS
  still see the full content. Nothing to run manually — it's part of `build`.
- **OG image** — `public/og-image.png` (1200×630) is the social-share card,
  referenced by absolute URL in `index.html`'s OG/Twitter tags. Regenerate it
  with `npm run og` after editing `scripts/generate-og.mjs` (e.g. to change the
  headline). `sharp` is a devDependency used only by that script.

> If you change the production domain, update the absolute URLs in `index.html`
> (`og:url`, `og:image`, `twitter:image`).

## Before launch — checklist

- [ ] Rotate the Plisio secret key (it was shown in a screenshot) and set `PLISIO_SECRET_KEY`
- [ ] Set `GROWLANCE_PRICE_USD` (and keep `PRICING.price` in sync)
- [ ] In Plisio: pick supported currencies, set Success URL → `/thank-you.html`, Failed URL → `/#pricing`
- [ ] Set real installer links in `public/thank-you.html` and `DOWNLOADS` in `src/config.js`
- [ ] Deploy to Vercel/Netlify and add the env vars
- [x] OG image + pre-rendering for SEO/social previews (done)
- [ ] Replace the hero mock with a real screenshot
- [ ] Confirm the responsible-use copy still matches `COMPLIANCE.md`
