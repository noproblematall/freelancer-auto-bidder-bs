'use strict'

// Renders the SVG icons to every size the builds need and assembles the
// Windows .ico and macOS .icns containers (PNG-compressed entries).
//
//   <electron binary> tools/icons/render-icons.js
//
// Run with the Electron binary (node_modules/.bin/electron), not Node: it uses
// Chromium to rasterise the SVG, so no extra image library is needed.
//
//   build/icon.svg               → build/icon.png (1024), icon.ico, icon.icns,
//                                   frontend/public/{favicon.svg, favicon.ico,
//                                   favicon-96x96.png, apple-touch-icon.png,
//                                   web-app-manifest-192x192.png, -512x512.png}
//   tools/keygen/build/icon.svg  → tools/keygen/build/icon.png, icon.ico, icon.icns

const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const SIZES = [16, 24, 32, 48, 64, 96, 128, 180, 192, 256, 512, 1024]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// One offscreen window is shared by every SVG (a second window in the same
// session failed to load); a local HTML page shows the SVG filling the
// viewport, and the window is resized for every output size.
let win = null
function getWindow() {
  if (!win) {
    win = new BrowserWindow({
      show: false, width: 1024, height: 1024, frame: false, transparent: true, useContentSize: true,
      webPreferences: { offscreen: true, zoomFactor: 1 },
    })
  }
  return win
}

async function render(svgPath) {
  const htmlPath = path.join(path.dirname(svgPath), '.render-icon.html')
  fs.writeFileSync(htmlPath,
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}` +
    `img{display:block;width:100vw;height:100vh}</style></head><body><img src="${path.basename(svgPath)}"></body></html>`)
  const w = getWindow()
  const out = {}
  try {
    await w.loadFile(htmlPath)
    await sleep(200)
    for (const s of SIZES) {
      w.setContentSize(s, s)
      await sleep(250)
      let img = await w.webContents.capturePage({ x: 0, y: 0, width: s, height: s })
      const size = img.getSize()
      if (size.width !== s || size.height !== s) img = img.resize({ width: s, height: s, quality: 'best' })
      out[s] = img.toPNG()
    }
  } finally {
    fs.unlinkSync(htmlPath)
  }
  // Sanity: the corner outside the rounded tile must be transparent
  const corner = nativeImage.createFromBuffer(out[256]).toBitmap()
  if (corner[3] !== 0) throw new Error('corner pixel is not transparent; rendering lost the alpha channel')
  return out
}

function ico(pngs, sizes) {
  const entries = sizes.map((s) => ({ s, png: pngs[s] }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = header.length + dir.length
  entries.forEach((e, i) => {
    const o = i * 16
    dir.writeUInt8(e.s >= 256 ? 0 : e.s, o); dir.writeUInt8(e.s >= 256 ? 0 : e.s, o + 1)
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3)
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(e.png.length, o + 8); dir.writeUInt32LE(offset, o + 12)
    offset += e.png.length
  })
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)])
}

function icns(pngs) {
  const types = { 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' }
  const chunks = Object.entries(types).map(([s, type]) => {
    const png = pngs[Number(s)]
    const h = Buffer.alloc(8); h.write(type, 0, 'ascii'); h.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([h, png])
  })
  const total = 8 + chunks.reduce((n, c) => n + c.length, 0)
  const head = Buffer.alloc(8); head.write('icns', 0, 'ascii'); head.writeUInt32BE(total, 4)
  return Buffer.concat([head, ...chunks])
}

function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, buf)
  console.log('wrote', path.relative(ROOT, file), buf.length, 'bytes')
}

app.whenReady().then(async () => {
  try {
    // App
    const appSvg = path.join(ROOT, 'build', 'icon.svg')
    const a = await render(appSvg)
    write(path.join(ROOT, 'build', 'icon.png'), a[1024])
    write(path.join(ROOT, 'build', 'icon.ico'), ico(a, [16, 24, 32, 48, 64, 128, 256]))
    write(path.join(ROOT, 'build', 'icon.icns'), icns(a))
    const pub = path.join(ROOT, 'frontend', 'public')
    fs.copyFileSync(appSvg, path.join(pub, 'favicon.svg'))
    write(path.join(pub, 'favicon.ico'), ico(a, [16, 32, 48]))
    write(path.join(pub, 'favicon-96x96.png'), a[96])
    write(path.join(pub, 'apple-touch-icon.png'), a[180])
    write(path.join(pub, 'web-app-manifest-192x192.png'), a[192])
    write(path.join(pub, 'web-app-manifest-512x512.png'), a[512])

    // Keygen
    const k = await render(path.join(ROOT, 'tools', 'keygen', 'build', 'icon.svg'))
    write(path.join(ROOT, 'tools', 'keygen', 'build', 'icon.png'), k[1024])
    write(path.join(ROOT, 'tools', 'keygen', 'build', 'icon.ico'), ico(k, [16, 24, 32, 48, 64, 128, 256]))
    write(path.join(ROOT, 'tools', 'keygen', 'build', 'icon.icns'), icns(k))

    // Preview for a quick look
    write(path.join(ROOT, 'dist', 'icon-preview-app-256.png'), a[256])
    write(path.join(ROOT, 'dist', 'icon-preview-keygen-256.png'), k[256])
    write(path.join(ROOT, 'dist', 'icon-preview-app-32.png'), a[32])
    app.exit(0)
  } catch (err) {
    console.error(err)
    app.exit(1)
  }
})
