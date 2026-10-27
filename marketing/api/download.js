// Download proxy for installers hosted as GitHub Releases on a PRIVATE repo.
// Anonymous private-release links 404, so this endpoint uses a server-side
// read-only GitHub token to resolve the latest release's asset and 302-redirect
// the buyer to GitHub's short-lived signed URL. The token never reaches the
// browser; the installer download itself is public (the license is the gate).
//
// Env vars (set in Vercel, never commit):
//   GITHUB_TOKEN   fine-grained PAT with read-only "Contents" access to the repo
//   GITHUB_REPO    e.g. "jzappi/Freelancer-auto-bidder" (optional; default below)
//
// Usage: /api/download?platform=windows|mac|mac-intel|linux|auto  (default auto)

const REPO = process.env.GITHUB_REPO || 'jzappi/Freelancer-auto-bidder'

// Hard floor: never serve a release older than this. Older builds (v1.1.7 and
// earlier) shipped WITHOUT the license gate and with a broken Windows Prisma
// engine, so if GitHub's "latest release" resolves to anything below this we
// refuse to hand it out (returns 503) rather than serve an unlicensed build.
// Bump this in lockstep with the app version when a new release goes live.
const MIN_VERSION = process.env.MIN_DOWNLOAD_VERSION || '1.3.0'

function parseVer(s) {
  const m = String(s || '').match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

// true if `a` (e.g. release tag) is >= `b` (the floor)
function gte(a, b) {
  const x = parseVer(a)
  const y = parseVer(b)
  if (!x || !y) return false
  for (let i = 0; i < 3; i++) {
    if (x[i] > y[i]) return true
    if (x[i] < y[i]) return false
  }
  return true
}

// Match the latest release's asset filenames (e.g. "Growlance Setup 1.2.0.exe",
// "Growlance-1.2.0-arm64.dmg", "Growlance-1.2.0.dmg", "Growlance-1.2.0.AppImage").
const PATTERNS = {
  windows: /\.exe$/i,
  mac: /-arm64\.dmg$/i, // Apple Silicon
  'mac-intel': /(?<!-arm64)\.dmg$/i, // x64 .dmg (no -arm64 suffix)
  linux: /\.AppImage$/i,
}

function detectPlatform(ua) {
  ua = String(ua || '')
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac' // arch isn't in the UA → default Apple Silicon
  if (/Linux|X11|Ubuntu/i.test(ua)) return 'linux'
  return 'windows'
}

export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    res.status(500).send('Downloads are not configured yet (missing GITHUB_TOKEN).')
    return
  }

  let platform = String(req.query.platform || 'auto').toLowerCase()
  if (platform === 'auto') platform = detectPlatform(req.headers['user-agent'])
  const pattern = PATTERNS[platform]
  if (!pattern) {
    res.status(400).send('Unknown platform.')
    return
  }

  const gh = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'growlance-download-proxy',
    Accept: 'application/vnd.github+json',
  }

  try {
    const relRes = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: gh })
    if (!relRes.ok) {
      console.error('GitHub release fetch failed:', relRes.status, await relRes.text())
      res.status(502).send('Could not reach the latest release.')
      return
    }
    const release = await relRes.json()

    // Refuse to serve anything below the floor (e.g. a stale v1.1.7 that lacks
    // the license gate). This keeps downloads safely "unavailable" until the
    // real v1.2.0 release publishes, instead of handing out an unlicensed build.
    if (!gte(release.tag_name, MIN_VERSION)) {
      console.warn(`Latest release ${release.tag_name} is below floor ${MIN_VERSION}; refusing to serve.`)
      res.setHeader('Cache-Control', 'no-store')
      res.status(503).send('Downloads are temporarily unavailable while we publish the latest version. Please check back shortly.')
      return
    }

    const asset = (release.assets || []).find((a) => pattern.test(a.name))
    if (!asset) {
      res.status(404).send('No matching installer in the latest release yet.')
      return
    }

    // Resolve the signed URL without following the redirect, then hand it to the
    // browser. (GitHub returns 302 → a time-limited storage URL anyone can fetch.)
    const assetRes = await fetch(asset.url, {
      headers: { ...gh, Accept: 'application/octet-stream' },
      redirect: 'manual',
    })
    const location = assetRes.headers.get('location')
    if (!location) {
      console.error('No redirect location for asset', asset.name, assetRes.status)
      res.status(502).send('Could not resolve the download URL.')
      return
    }

    res.setHeader('Cache-Control', 'no-store')
    res.writeHead(302, { Location: location })
    res.end()
  } catch (err) {
    console.error('download proxy error:', err)
    res.status(502).send('Download failed. Please try again shortly.')
  }
}
