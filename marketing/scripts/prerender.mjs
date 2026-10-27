// Post-build pre-rendering for SEO / non-JS crawlers & social scrapers.
//
// Renders the React app to static HTML with react-dom/server and injects it into
// dist/index.html's #root. The client then hydrates it (see src/main.jsx), so
// there's no double render for real users — but crawlers that don't run JS now
// get the full page content instead of an empty <div>.
//
// Uses esbuild (already bundled with Vite) to compile App.jsx for Node — no
// browser, no extra framework. Runs automatically after `vite build`.

import { build } from 'esbuild'
import { readFileSync, writeFileSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const tmp = resolve(root, '.prerender-app.mjs')
const indexPath = resolve(root, 'dist/index.html')

// 1. Bundle the app's component tree for Node (CSS/asset imports stripped —
//    the built CSS is already linked in dist/index.html).
await build({
  entryPoints: [resolve(root, 'src/App.jsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  outfile: tmp,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  loader: { '.css': 'empty', '.png': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl' },
  logLevel: 'silent',
})

// 2. Render to a hydratable static markup string.
const { default: App } = await import('file://' + tmp + '?t=' + Date.now())
const { createElement } = await import('react')
const { renderToString } = await import('react-dom/server')

const appHtml = renderToString(createElement(App))

// 3. Inject into the built HTML and clean up.
let index = readFileSync(indexPath, 'utf8')
if (!index.includes('<div id="root"></div>')) {
  rmSync(tmp, { force: true })
  throw new Error('prerender: could not find empty <div id="root"></div> in dist/index.html')
}
index = index.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
writeFileSync(indexPath, index)
rmSync(tmp, { force: true })

console.log(`✓ Prerendered dist/index.html (${appHtml.length.toLocaleString()} chars of static HTML)`)
