// Generates marketing/public/og-image.png (1200×630) for social link previews.
// Run with: npm run og
//
// Design: dark navy background + emerald glow, the transparent Growlance mark,
// wordmark, headline, and a one-line value strip. Text uses a sans-serif fallback
// (the exact brand font isn't required for an OG image to look clean).

import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const W = 1200
const H = 630

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#12151b"/>
      <stop offset="1" stop-color="#1a2029"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.28" cy="0.0" r="0.9">
      <stop offset="0" stop-color="#10b981" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#10b981" stop-opacity="0"/>
    </radialGradient>
    <font-face font-family="ui"/>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="6" fill="#10b981" opacity="0.55"/>

  <!-- wordmark (logo image is composited separately by sharp at x=96,y=70) -->
  <text x="214" y="150" font-family="Outfit, Arial, sans-serif" font-size="52" font-weight="700" fill="#ffffff" letter-spacing="-1.5">Growlance</text>

  <!-- headline -->
  <text x="96" y="330" font-family="Outfit, Arial, sans-serif" font-size="76" font-weight="700" fill="#ffffff" letter-spacing="-2.5">Win more work,</text>
  <text x="96" y="418" font-family="Outfit, Arial, sans-serif" font-size="76" font-weight="700" fill="#ffffff" letter-spacing="-2.5">with less busywork.</text>

  <!-- subhead -->
  <text x="98" y="486" font-family="Outfit, Arial, sans-serif" font-size="30" font-weight="500" fill="#94a3b8">Your AI bidding co-pilot for Freelancer.com</text>

  <!-- value strip -->
  <text x="98" y="556" font-family="Outfit, Arial, sans-serif" font-size="25" font-weight="600" fill="#34d399">Local-first  ·  Your own API keys  ·  No subscription</text>
</svg>`

// Use the transparent green mark (not the white-box app icon) so it sits cleanly
// on the dark background.
const logo = await sharp(resolve(root, 'public/favicon-96x96.png'))
  .resize(100, 100, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()

await sharp(Buffer.from(svg))
  .composite([{ input: logo, left: 98, top: 66 }])
  .png()
  .toFile(resolve(root, 'public/og-image.png'))

console.log('✓ public/og-image.png generated (1200×630)')
