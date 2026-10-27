import { Container } from './ui.jsx'
import { BuyButton } from './BuyButton.jsx'
import { Icon } from './icons.jsx'
import { DOWNLOADS, PRICING } from '../config.js'

const PLATFORMS = [
  { key: 'mac', label: 'macOS (Apple Silicon)', icon: 'Apple', href: DOWNLOADS.mac },
  { key: 'mac-intel', label: 'macOS (Intel)', icon: 'Apple', href: DOWNLOADS.macIntel },
  { key: 'windows', label: 'Windows', icon: 'Windows', href: DOWNLOADS.windows },
  { key: 'linux', label: 'Linux', icon: 'Linux', href: DOWNLOADS.linux },
]

export function CTASection() {
  return (
    <section id="download" className="py-20 sm:py-28">
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-accent-500/25 bg-gradient-to-b from-navy-900 to-navy-950 px-6 py-14 text-center sm:px-12">
          <div className="hero-glow pointer-events-none absolute inset-0" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold sm:text-4xl">
              Win more work with less busywork
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-slate-400 sm:text-lg">
              Download for your platform, open the app, and click{' '}
              <span className="font-semibold text-white">“Start 7-day free trial”</span> — full app,
              no card, no account.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {PLATFORMS.map((p) => {
                const Glyph = Icon[p.icon]
                return (
                  <a
                    key={p.key}
                    href={p.href}
                    className="inline-flex items-center gap-2 rounded-xl border border-accent-500/40 bg-navy-900/60 px-5 py-3 text-sm font-semibold text-white transition hover:border-accent-400 hover:bg-navy-800/80"
                  >
                    {Glyph && <Glyph width={18} height={18} />}
                    {p.label}
                  </a>
                )
              })}
            </div>

            <p className="mx-auto mt-8 max-w-xl text-sm text-slate-400">
              Ready to keep it? One purchase, every platform, yours forever.
            </p>
            <div className="mt-3 flex justify-center">
              <BuyButton className="px-7 py-3.5 text-base">
                Get Growlance — {PRICING.currencySymbol}{PRICING.price}
              </BuyButton>
            </div>
            <p className="mt-5 text-xs text-slate-400">
              Already purchased? <a href={DOWNLOADS.releasesUrl} className="text-accent-400 hover:underline">Get the latest version →</a>
            </p>
          </div>
        </div>
      </Container>
    </section>
  )
}
