#!/usr/bin/env node
'use strict'

// Builds the Windows installer, publishes it as a GitHub Release (the
// installed apps pick it up automatically — see electron/updater.js), deletes
// every older release on GitHub and every older installer in dist/electron.
//
//   npm run release:win            publish the version in package.json
//   npm run release:win -- patch   bump 1.4.14 → 1.4.15 first (also: minor, major, or an exact x.y.z)
//
// Needs a GitHub token with "repo" access in the GH_TOKEN environment
// variable, or in a file named .github-token in the project root (ignored by git).
const fs = require('fs')
const path = require('path')
const https = require('https')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const outDir = path.join(root, 'dist', 'electron')
const builderCfg = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
const owner = /^\s*owner:\s*(\S+)/m.exec(builderCfg)?.[1]
const repo = /^\s*repo:\s*(\S+)/m.exec(builderCfg)?.[1]
if (!owner || !repo) fail('publish.owner / publish.repo missing from electron-builder.yml')

const token = process.env.GH_TOKEN || readTokenFile()
if (!token) fail('No GitHub token. Set GH_TOKEN or put the token in .github-token (project root).')
process.env.GH_TOKEN = token

// ── version ────────────────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const bump = process.argv[2]
if (bump) {
  const [ma, mi, pa] = pkg.version.split('.').map(Number)
  const next = bump === 'major' ? `${ma + 1}.0.0`
    : bump === 'minor' ? `${ma}.${mi + 1}.0`
      : bump === 'patch' ? `${ma}.${mi}.${pa + 1}`
        : /^\d+\.\d+\.\d+$/.test(bump) ? bump : null
  if (!next) fail(`Unknown version argument "${bump}" (use patch, minor, major or x.y.z)`)
  const raw = fs.readFileSync(pkgPath, 'utf8')
  fs.writeFileSync(pkgPath, raw.replace(`"version": "${pkg.version}"`, `"version": "${next}"`))
  console.log(`version ${pkg.version} → ${next}`)
  pkg.version = next
}
const version = pkg.version
const tag = `v${version}`

// ── build + publish ────────────────────────────────────────────────────────
run('npx', ['electron-builder', '--win', '--publish', 'always'])

const installer = path.join(outDir, `BidPilot Setup ${version}.exe`)
if (!fs.existsSync(installer)) fail(`Installer not found after the build: ${installer}`)

main().catch(fail)

async function main() {
  // Confirm the release is live and complete before deleting anything.
  const releases = await gh('GET', `/repos/${owner}/${repo}/releases?per_page=100`)
  const current = releases.find(r => r.tag_name === tag)
  if (!current) fail(`Release ${tag} is not on GitHub after publishing`)
  const names = current.assets.map(a => a.name)
  if (!names.includes('latest.yml') || !names.some(n => n.endsWith('.exe'))) {
    fail(`Release ${tag} is missing assets (${names.join(', ')}); older releases were left alone`)
  }
  if (current.draft) {
    await gh('PATCH', `/repos/${owner}/${repo}/releases/${current.id}`, { draft: false })
  }
  console.log(`published ${tag}: ${names.join(', ')}`)

  // Older releases (and their tags) go; the installed apps only read the newest.
  for (const r of releases) {
    if (r.id === current.id) continue
    await gh('DELETE', `/repos/${owner}/${repo}/releases/${r.id}`)
    try { await gh('DELETE', `/repos/${owner}/${repo}/git/refs/tags/${r.tag_name}`) } catch (_) {}
    console.log(`removed old release ${r.tag_name}`)
  }

  // Older local installers go too.
  for (const f of fs.readdirSync(outDir)) {
    const m = /^BidPilot Setup (\d+\.\d+\.\d+)\.exe(\.blockmap)?$/.exec(f)
    if (m && m[1] !== version) {
      fs.rmSync(path.join(outDir, f))
      console.log(`removed old installer ${f}`)
    }
  }
  console.log(`\nDone. Installed apps will update to ${version} on their next check (within 4 hours, or at the next start).`)
}

// ── helpers ────────────────────────────────────────────────────────────────
function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: process.env })
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} exited with ${r.status}`)
}

function readTokenFile() {
  try { return fs.readFileSync(path.join(root, '.github-token'), 'utf8').trim() } catch (_) { return '' }
}

function gh(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request({
      hostname: 'api.github.com', path: p, method,
      headers: {
        'User-Agent': 'bidpilot-release', Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(buf ? JSON.parse(buf) : null)
        reject(new Error(`GitHub ${method} ${p} → ${res.statusCode}: ${buf.slice(0, 300)}`))
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function fail(msg) {
  console.error(`\nrelease failed: ${msg instanceof Error ? msg.message : msg}`)
  process.exit(1)
}
