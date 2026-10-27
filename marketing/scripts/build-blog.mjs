// Static blog generator. Reads markdown posts from content/blog/, renders each to
// a self-contained, brand-matched HTML page under dist/blog/<slug>/index.html,
// builds the blog index, and regenerates dist/sitemap.xml to include every URL.
//
// Each post page ships real static HTML + per-post <title>/description/canonical/
// OpenGraph + Article JSON-LD — so it's fully crawlable and rich-result eligible
// without any client JS. A branded 1200×630 featured image is generated per post
// (sharp, SVG→PNG) and used as the banner, index thumbnail, and OG image.
// Runs after `vite build` (see package.json "build").
//
// Add a post: drop a .md file in content/blog/ with this frontmatter:
//   ---
//   title: ...
//   description: ...
//   slug: kebab-case-slug
//   date: 2026-06-24
//   author: Growlance
//   tags: a, b, c
//   ---
//   ...markdown body...

import { marked } from 'marked'
import sharp from 'sharp'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const contentDir = resolve(root, 'content/blog')
const distDir = resolve(root, 'dist')
const blogDist = resolve(distDir, 'blog')

const ORIGIN = 'https://growlance.app'
const OG_IMAGE = `${ORIGIN}/og-image.png`
const EMAIL = 'support@growlance.app'
const CALENDLY = 'https://calendly.com/hello-growlance-m-om/30min'

// ── helpers ───────────────────────────────────────────────────────────────────
function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// tiny frontmatter parser (key: value, no nested YAML needed)
function parse(raw) {
  const md = raw.replace(/\r\n/g, '\n') // tolerate CRLF working copies
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { meta: {}, body: md }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i === -1) continue
    let v = line.slice(i + 1).trim()
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1)
    meta[line.slice(0, i).trim()] = v
  }
  return { meta, body: m[2] }
}

function readingTime(body) {
  const words = body.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

function tagChips(tags) {
  const list = String(tags || '').split(',').map((t) => t.trim()).filter(Boolean)
  if (!list.length) return ''
  return `<div class="tags">${list.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>`
}

function fmtDate(iso) {
  const [y, mo, d] = String(iso).split('-').map(Number)
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  if (!y || !mo || !d) return iso
  return `${months[mo - 1]} ${d}, ${y}`
}

// Pick the most specific category from a post's tags (drives the cover label + icon).
const CAT_PRIORITY = ['ai','proposals','profile','tools','payments','platforms','automation','responsible-use','clients','strategy','bidding','productivity','beginners','freelancing']
function primaryCat(tags) {
  const list = String(tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  for (const c of CAT_PRIORITY) if (list.includes(c)) return c
  return list[0] || 'guide'
}

// ── per-article cover image ────────────────────────────────────────────────────
// Decorative line icon per category (local 0–100 coords, stroke-only). Makes each
// cover visually distinct and topical without any stock-photo licensing.
const ICONS = {
  proposals: '<rect x="26" y="14" width="48" height="72" rx="7"/><line x1="37" y1="36" x2="63" y2="36"/><line x1="37" y1="50" x2="63" y2="50"/><line x1="37" y1="64" x2="54" y2="64"/>',
  tools: '<line x1="18" y1="30" x2="82" y2="30"/><line x1="18" y1="50" x2="82" y2="50"/><line x1="18" y1="70" x2="82" y2="70"/><circle cx="38" cy="30" r="7"/><circle cx="64" cy="50" r="7"/><circle cx="46" cy="70" r="7"/>',
  automation: '<circle cx="50" cy="50" r="16"/><circle cx="50" cy="50" r="6"/><line x1="50" y1="26" x2="50" y2="18"/><line x1="50" y1="74" x2="50" y2="82"/><line x1="26" y1="50" x2="18" y2="50"/><line x1="74" y1="50" x2="82" y2="50"/><line x1="33" y1="33" x2="27" y2="27"/><line x1="67" y1="67" x2="73" y2="73"/><line x1="67" y1="33" x2="73" y2="27"/><line x1="33" y1="67" x2="27" y2="73"/>',
  'responsible-use': '<path d="M50 16 L80 28 L80 52 C80 72 50 86 50 86 C50 86 20 72 20 52 L20 28 Z"/><path d="M38 50 L47 60 L64 40"/>',
  bidding: '<path d="M22 22 L50 22 L82 54 L54 82 L22 50 Z"/><circle cx="37" cy="37" r="6"/>',
  strategy: '<circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="18"/><circle cx="50" cy="50" r="6"/>',
  platforms: '<rect x="16" y="24" width="46" height="58" rx="7"/><rect x="40" y="34" width="46" height="58" rx="7"/>',
  ai: '<path d="M50 16 L57 43 L84 50 L57 57 L50 84 L43 57 L16 50 L43 43 Z"/><path d="M78 20 L80 28 L88 30 L80 32 L78 40 L76 32 L68 30 L76 28 Z"/>',
  profile: '<circle cx="50" cy="36" r="15"/><path d="M22 84 C22 62 78 62 78 84"/>',
  payments: '<circle cx="50" cy="50" r="30"/><path d="M59 39 C59 33 41 33 41 43 C41 53 59 51 59 61 C59 71 41 71 41 63"/><line x1="50" y1="28" x2="50" y2="36"/><line x1="50" y1="64" x2="50" y2="72"/>',
  clients: '<path d="M14 24 H66 A8 8 0 0 1 74 32 V58 A8 8 0 0 1 66 66 H40 L26 78 V66 H14 A8 8 0 0 1 6 58 V32 A8 8 0 0 1 14 24 Z"/><circle cx="28" cy="45" r="3"/><circle cx="44" cy="45" r="3"/><circle cx="60" cy="45" r="3"/>',
  beginners: '<path d="M50 14 C66 26 68 48 60 66 L40 66 C32 48 34 26 50 14 Z"/><circle cx="50" cy="40" r="7"/><path d="M40 66 L30 80 L42 74"/><path d="M60 66 L70 80 L58 74"/>',
}
const BOLT = '<path d="M56 14 L30 54 L48 54 L42 86 L72 44 L54 44 Z"/>'

function wrapTitle(title, max = 22) {
  const words = String(title).split(/\s+/)
  const lines = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w }
    else cur = cur ? cur + ' ' + w : w
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 4)
}

function coverSvg(title, cat) {
  const lines = wrapTitle(title, 22)
  const fs = lines.length >= 4 ? 50 : 58
  const lh = fs + 16
  const titleSvg = lines
    .map(
      (ln, i) =>
        `<text x="80" y="${300 + i * lh}" font-family="Outfit, Arial, sans-serif" font-size="${fs}" font-weight="800" fill="#ffffff" letter-spacing="-1.5">${esc(ln)}</text>`
    )
    .join('\n  ')
  const label = esc(String(cat || 'guide').replace(/-/g, ' ').toUpperCase())
  const icon = ICONS[cat] || BOLT
  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#12151b"/>
      <stop offset="1" stop-color="#1a2029"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.8" cy="0.12" r="0.9">
      <stop offset="0" stop-color="#10b981" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#10b981" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="6" fill="#10b981" opacity="0.6"/>
  <g transform="translate(815,232) scale(2.5)" fill="none" stroke="#34d399" stroke-opacity="0.4" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${icon}</g>
  <text x="148" y="100" font-family="Outfit, Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff" letter-spacing="-1">Growlance</text>
  <text x="80" y="235" font-family="Outfit, Arial, sans-serif" font-size="24" font-weight="700" fill="#34d399" letter-spacing="3">${label}</text>
  ${titleSvg}
  <text x="80" y="568" font-family="Outfit, Arial, sans-serif" font-size="22" font-weight="600" fill="#94a3b8">growlance.app  ·  Freelancer.com bidding guides</text>
</svg>`
}

async function makeCover(title, cat, outPath) {
  const logo = await sharp(resolve(root, 'public/favicon-96x96.png'))
    .resize(52, 52, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  await sharp(Buffer.from(coverSvg(title, cat)))
    .composite([{ input: logo, left: 80, top: 64 }])
    .png()
    .toFile(outPath)
}

// ── shared page chrome ────────────────────────────────────────────────────────
const STYLE = `
:root{--navy-950:#12151b;--navy-900:#1a2029;--navy-800:#232a35;--navy-700:#334e68;
--accent-400:#34d399;--accent-500:#10b981;--slate-300:#cbd5e1;--slate-400:#94a3b8;--white:#fff}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--navy-950);color:var(--slate-300);
font-family:'Outfit',ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:var(--accent-400);text-decoration:none}
a:hover{text-decoration:underline}
img{max-width:100%}
.wrap{max-width:760px;margin:0 auto;padding:0 1.25rem}
.wide{max-width:1120px;margin:0 auto;padding:0 1.25rem}
header.site{position:sticky;top:0;z-index:10;border-bottom:1px solid rgba(35,42,53,.8);
background:rgba(18,21,27,.85);backdrop-filter:blur(8px)}
header.site .wide{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{display:flex;align-items:center;gap:.55rem;font-weight:700;color:var(--white);font-size:1.15rem}
.brand:hover{text-decoration:none}
.brand img{width:28px;height:28px;display:block}
.brand span{color:var(--white)}
.btn{display:inline-block;background:var(--accent-500);color:var(--navy-950);font-weight:600;
padding:.55rem 1.1rem;border-radius:.7rem;font-size:.9rem}
.btn:hover{text-decoration:none;filter:brightness(1.05)}
/* article */
article.post{padding:2.5rem 0 2rem}
.eyebrow{color:var(--accent-400);font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.cover{width:100%;height:auto;display:block;border:1px solid var(--navy-800);border-radius:1rem;margin:1rem 0 1.8rem}
.post h1{color:var(--white);font-size:2.6rem;line-height:1.1;margin:.4rem 0 .6rem;font-weight:800;letter-spacing:-.5px}
.meta{color:var(--slate-400);font-size:.85rem;margin:0 0 1.2rem}
.prose{font-size:1.07rem}
.prose h2{color:var(--white);font-size:1.6rem;margin:2.4rem 0 .8rem;font-weight:700;letter-spacing:-.3px}
.prose h3{color:var(--white);font-size:1.25rem;margin:1.9rem 0 .6rem;font-weight:600}
.prose p{margin:1.1rem 0}
.prose ul,.prose ol{margin:1.1rem 0;padding-left:1.3rem}
.prose li{margin:.45rem 0}
.prose strong{color:#e2e8f0}
.prose a{text-decoration:underline;text-underline-offset:2px}
.prose blockquote{border-left:3px solid var(--accent-500);margin:1.6rem 0;padding:.4rem 0 .4rem 1.2rem;color:var(--slate-300);font-style:italic}
.prose code{background:var(--navy-800);padding:.15rem .4rem;border-radius:.35rem;font-size:.9em}
.prose pre{background:var(--navy-900);border:1px solid var(--navy-800);border-radius:.7rem;padding:1.1rem;overflow:auto;font-size:.92rem}
.prose pre code{background:none;padding:0}
.prose img{border-radius:.7rem}
.prose table{width:100%;border-collapse:collapse;margin:1.5rem 0;font-size:.95rem}
.prose th,.prose td{border:1px solid var(--navy-800);padding:.6rem .8rem;text-align:left}
.prose th{background:var(--navy-900);color:var(--white);font-weight:600}
hr{border:0;border-top:1px solid var(--navy-800);margin:2.5rem 0}
.tags{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 1.5rem}
.chip{font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--accent-400);
border:1px solid rgba(16,185,129,.3);border-radius:999px;padding:.2rem .65rem}
/* cards + grid */
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1.5rem;margin:2.5rem 0}
.card{display:flex;flex-direction:column;border:1px solid var(--navy-800);background:var(--navy-900);
border-radius:1rem;overflow:hidden;transition:border-color .2s,transform .2s}
.card:hover{border-color:rgba(16,185,129,.4);transform:translateY(-3px)}
.card .thumb{display:block}
.card img{width:100%;height:auto;display:block;border-bottom:1px solid var(--navy-800)}
.card .body{padding:1.2rem 1.35rem}
.card .meta{margin:0 0 .5rem;font-size:.78rem}
.card h2,.card h3{margin:0 0 .5rem;font-size:1.2rem;line-height:1.3}
.card h2 a,.card h3 a{color:var(--white)}
.card .desc{margin:0;color:var(--slate-400);font-size:.92rem}
.related{margin-top:1.5rem}
.related>h2{font-size:1.5rem;color:var(--white);margin:0}
/* cta */
.cta{background:linear-gradient(180deg,var(--navy-900),var(--navy-950));border:1px solid rgba(16,185,129,.25);
border-radius:1.2rem;padding:2rem;margin:2.8rem 0 1rem;text-align:center}
.cta h3{margin:0 0 .5rem;color:var(--white);font-size:1.4rem}
.cta p{margin:0 auto 1.2rem;color:var(--slate-400);max-width:34rem}
.cta .cta-sub{margin:1rem auto 0;font-size:.82rem;color:var(--slate-400)}
/* index hero */
.bloghero{padding:3rem 0 .5rem}
.bloghero h1{color:var(--white);font-size:2.6rem;font-weight:800;margin:.4rem 0 .5rem;letter-spacing:-.5px}
.bloghero p{color:var(--slate-400);margin:0;font-size:1.05rem}
/* footer */
footer.site{border-top:1px solid var(--navy-800);margin-top:4rem;padding:3rem 0 2rem}
.footer-top{display:grid;grid-template-columns:2fr 1fr 1fr;gap:2.5rem}
.ftag{margin:1rem 0;color:var(--slate-400);font-size:.9rem;max-width:22rem;line-height:1.6}
.femail{font-size:.9rem;color:var(--accent-400)}
.ftitle{font-size:.85rem;font-weight:600;color:var(--white);margin-bottom:.9rem}
.fcol ul{list-style:none;padding:0;margin:0}
.fcol li{margin:.55rem 0}
.fcol a{color:var(--slate-400);font-size:.9rem}
.fcol a:hover{color:var(--white)}
.fbottom{display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;border-top:1px solid var(--navy-800);
margin-top:2.5rem;padding-top:1.5rem;color:var(--slate-400);font-size:.78rem}
@media(max-width:760px){
.grid{grid-template-columns:1fr}
.footer-top{grid-template-columns:1fr 1fr}
.post h1,.bloghero h1{font-size:2rem}
}
`

function header() {
  return `<header class="site" data-nosnippet><div class="wide">
<a class="brand" href="/"><img src="/favicon-96x96.png" alt="Growlance logo" width="28" height="28" /><span>Growlance</span></a>
<a class="btn" href="/#download">Try free for 7 days</a>
</div></header>`
}

function footer() {
  const year = new Date().getFullYear()
  return `<footer class="site" data-nosnippet>
<div class="wide footer-top">
<div class="fcol">
<a class="brand" href="/"><img src="/favicon-96x96.png" alt="Growlance logo" width="28" height="28" /><span>Growlance</span></a>
<p class="ftag">Your AI bidding co-pilot for Freelancer.com. Local-first, private, and yours to keep.</p>
<a class="femail" href="mailto:${EMAIL}">${EMAIL}</a>
</div>
<div class="fcol">
<div class="ftitle">Product</div>
<ul>
<li><a href="/#features">Features</a></li>
<li><a href="/#how">How it works</a></li>
<li><a href="/#pricing">Pricing</a></li>
<li><a href="/#download">Download</a></li>
</ul>
</div>
<div class="fcol">
<div class="ftitle">Resources</div>
<ul>
<li><a href="/blog/">Blog</a></li>
<li><a href="/#faq">FAQ</a></li>
<li><a href="/#responsible-use">Responsible use</a></li>
<li><a href="${CALENDLY}" target="_blank" rel="noopener noreferrer">Book a demo</a></li>
<li><a href="mailto:${EMAIL}">Contact</a></li>
</ul>
</div>
</div>
<div class="wide fbottom">
<span>© ${year} Growlance. All rights reserved.</span>
<span>Not affiliated with or endorsed by Freelancer.com. Use responsibly and in line with their terms.</span>
</div>
</footer>`
}

function chrome({ title, description, canonical, image = OG_IMAGE, head = '', body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${canonical}" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Growlance" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${image}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${image}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
<style>${STYLE}</style>
${head}
</head>
<body>
${header()}
${body}
${footer()}
</body>
</html>`
}

// Reusable post card (index grid + related grid).
function card(p, level) {
  return `<article class="card">
${p.cover ? `<a class="thumb" href="/blog/${p.slug}/"><img src="${p.cover}" alt="${esc(p.title)}" width="1200" height="630" loading="lazy" /></a>` : ''}
<div class="body">
<p class="meta">${fmtDate(p.date)} · ${p.readMins} min read</p>
<${level}><a href="/blog/${p.slug}/">${esc(p.title)}</a></${level}>
<p class="desc">${esc(p.description || '')}</p>
</div>
</article>`
}

// data-nosnippet keeps this promo block out of Google search snippets, so the
// article's own meta description / intro is used instead of the app pitch.
// Trial-first, matching the homepage funnel: the button starts the free trial;
// the buy-once price rides in the subline.
const CTA = `<div class="cta" data-nosnippet>
<h3>Stop refreshing the feed.</h3>
<p>Growlance is the local-first AI bidding assistant &amp; auto-bidder for Freelancer.com — try the full app free for 7 days. No card, no account.</p>
<a class="btn" href="/#download">Try free for 7 days</a>
<p class="cta-sub">Keep it for a one-time $89 — no subscription, yours forever.</p>
</div>`

// ── build ─────────────────────────────────────────────────────────────────────
rmSync(blogDist, { recursive: true, force: true })
mkdirSync(blogDist, { recursive: true })

let files = []
try {
  files = readdirSync(contentDir).filter((f) => f.endsWith('.md'))
} catch {
  console.warn('build-blog: no content/blog directory; skipping.')
}

const posts = files
  .map((file) => {
    const { meta, body } = parse(readFileSync(join(contentDir, file), 'utf8'))
    if (!meta.slug || !meta.title) throw new Error(`build-blog: ${file} is missing title/slug frontmatter`)
    return { ...meta, html: marked.parse(body), readMins: readingTime(body), cat: primaryCat(meta.tags) }
  })
  .sort((a, b) => String(b.date).localeCompare(String(a.date))) // newest first

// Pass 1: generate every cover first so related/index thumbnails are available.
for (const p of posts) {
  const slugDir = join(blogDist, p.slug)
  mkdirSync(slugDir, { recursive: true })
  p.cover = null
  try {
    await makeCover(p.title, p.cat, join(slugDir, 'cover.png'))
    p.cover = `/blog/${p.slug}/cover.png`
  } catch (e) {
    console.warn(`build-blog: cover image failed for ${p.slug}: ${e.message}`)
  }
}

// Pass 2: render each article page.
for (const p of posts) {
  const canonical = `${ORIGIN}/blog/${p.slug}/`
  const ogImage = p.cover ? `${ORIGIN}${p.cover}` : OG_IMAGE
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.title,
    description: p.description,
    datePublished: p.date,
    dateModified: p.date,
    author: { '@type': 'Organization', name: p.author || 'Growlance' },
    publisher: {
      '@type': 'Organization',
      name: 'Growlance',
      logo: { '@type': 'ImageObject', url: `${ORIGIN}/web-app-manifest-512x512.png` },
    },
    image: ogImage,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  }
  const others = posts.filter((o) => o.slug !== p.slug).slice(0, 2)
  const related = others.length
    ? `<div class="related"><hr/><h2>More from the blog</h2><div class="grid">${others.map((o) => card(o, 'h3')).join('')}</div></div>`
    : ''
  const body = `<main class="wrap"><article class="post">
<p class="eyebrow"><a href="/blog/">← Blog</a></p>
${p.cover ? `<img class="cover" src="${p.cover}" alt="${esc(p.title)}" width="1200" height="630" />` : ''}
<h1>${esc(p.title)}</h1>
<p class="meta">${fmtDate(p.date)} · ${p.readMins} min read${p.author ? ` · ${esc(p.author)}` : ''}</p>
${tagChips(p.tags)}
<div class="prose">${p.html}</div>
${related}
${CTA}
</article></main>`
  const page = chrome({
    title: `${p.title} — Growlance`,
    description: p.description || '',
    canonical,
    image: ogImage,
    head: `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`,
    body,
  })
  writeFileSync(join(blogDist, p.slug, 'index.html'), page)
}

// blog index
const cards = posts.map((p) => card(p, 'h2')).join('\n')
const indexBody = `<main class="wide">
<div class="bloghero">
<p class="eyebrow">Growlance Blog</p>
<h1>Win more Freelancer.com work</h1>
<p>Guides on proposals, bidding strategy, and getting more out of the feed.</p>
</div>
<div class="grid">${cards || '<p>Posts coming soon.</p>'}</div>
</main>`
writeFileSync(
  join(blogDist, 'index.html'),
  chrome({
    title: 'Blog — Growlance',
    description: 'Guides on writing winning Freelancer.com proposals, smarter bidding, and getting more out of the project feed.',
    canonical: `${ORIGIN}/blog/`,
    body: indexBody,
  })
)

// regenerate sitemap (home + blog index + each post) — single source of truth
const urls = [
  { loc: `${ORIGIN}/`, priority: '1.0', changefreq: 'weekly' },
  { loc: `${ORIGIN}/blog/`, priority: '0.7', changefreq: 'weekly' },
  ...posts.map((p) => ({ loc: `${ORIGIN}/blog/${p.slug}/`, priority: '0.6', changefreq: 'monthly', lastmod: p.date })),
]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
  )
  .join('\n')}
</urlset>
`
writeFileSync(join(distDir, 'sitemap.xml'), sitemap)

console.log(`✓ Built blog: ${posts.length} post(s) + index, sitemap with ${urls.length} URLs`)
