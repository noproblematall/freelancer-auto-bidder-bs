import { Container, SectionHeading } from './ui.jsx'
import { BuyButton } from './BuyButton.jsx'
import { CryptoBadges } from './CryptoBadges.jsx'
import { Icon } from './icons.jsx'
import { PRICING, CHECKOUT } from '../config.js'

const INCLUDED = [
  'Unlimited bidding profiles',
  'AI proposals & relevance scoring',
  'Built-in client CRM & follow-up inbox',
  'Message polling & meeting detection',
  'Telegram notifications',
  'macOS, Windows & Linux installers',
  'Bring your own OpenAI key — no AI markup',
  'Free updates',
]

export function Pricing() {
  return (
    <section id="pricing" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Pricing"
          title="One price. Yours forever."
          subtitle="No monthly fee, no per-bid charge, no AI markup. Pay once, download, and own it — on macOS, Windows, or Linux. One device at a time; switching machines is a quick support email away."
        />

        <div className="mx-auto mt-12 max-w-lg">
          <div className="card-gradient relative overflow-hidden rounded-3xl border border-accent-500/30 p-8 shadow-2xl shadow-accent-500/5">
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-400">
                Lifetime license
              </span>
            </div>

            <div className="mt-5 flex items-end gap-2">
              <span className="text-5xl font-bold text-white">
                {PRICING.currencySymbol}
                {PRICING.price}
              </span>
              <span className="mb-1.5 text-sm text-slate-400">{PRICING.cadence} · {PRICING.currency}</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">{CHECKOUT.note}</p>

            <CryptoBadges className="mt-5" />

            <BuyButton className="mt-5 w-full py-3.5 text-base">Get Growlance</BuyButton>

            <p className="mt-3 text-center text-xs text-slate-400">
              {PRICING.refund} · Not sure yet?{' '}
              <a href="#download" className="text-accent-400 hover:underline">Try free for 7 days</a>
            </p>

            <ul className="mt-7 grid gap-3 border-t border-navy-800 pt-7">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <Icon.Check width={17} height={17} className="mt-0.5 shrink-0 text-accent-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            You’ll need your own OpenAI API key and a free Freelancer developer app. Growlance never marks up AI usage —
            you pay OpenAI directly at cost.
          </p>
        </div>
      </Container>
    </section>
  )
}
