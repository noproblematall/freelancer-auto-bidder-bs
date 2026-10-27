// Automated accessibility audit: runs axe-core (WCAG 2.0/2.1 A & AA rules)
// against the pre-rendered dist/index.html. Run with: npm run a11y
//
// Note: color-contrast is verified separately (axe can't compute it in jsdom
// without a real layout engine) — see the contrast script / manual checks.

import { readFileSync } from 'fs'
import { JSDOM } from 'jsdom'
import axe from 'axe-core'

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true })

// Inject axe into the jsdom window, then run it there.
dom.window.eval(axe.source)

const results = await dom.window.axe.run(dom.window.document, {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
})

const fmt = (list) =>
  list
    .map(
      (r) =>
        `  • [${r.impact || 'n/a'}] ${r.id} — ${r.help}\n` +
        r.nodes.slice(0, 3).map((nd) => `      ${nd.target.join(' ')}`).join('\n')
    )
    .join('\n')

console.log(`\n=== axe-core audit: ${results.violations.length} violations, ${results.incomplete.length} needs-review ===\n`)

if (results.violations.length) {
  console.log('VIOLATIONS:')
  console.log(fmt(results.violations))
} else {
  console.log('✓ No automated WCAG A/AA violations found.')
}

if (results.incomplete.length) {
  console.log('\nNEEDS MANUAL REVIEW (axe could not decide — e.g. contrast in jsdom):')
  console.log(results.incomplete.map((r) => `  • ${r.id} — ${r.help}`).join('\n'))
}

process.exit(results.violations.length ? 1 : 0)
