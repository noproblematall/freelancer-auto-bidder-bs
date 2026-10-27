import { Container, PrimaryButton } from './ui.jsx'
import { BuyButton } from './BuyButton.jsx'
import { AppPreview } from './AppPreview.jsx'
import { Slideshow } from './Slideshow.jsx'
import { Icon } from './icons.jsx'
import { HERO, LINKS, PRICING } from '../config.js'

const TRUST = ['Free 7-day trial', 'Local-first & private', 'Your own API keys', 'No subscription']

export function Hero() {
  const shots = HERO.screenshots || []

  return (
    <section id="top" className="relative overflow-hidden pt-28 pb-20 sm:pt-32">
      <div className="hero-glow pointer-events-none absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-accent-500/30 to-transparent" />

      <Container>
        {/* centered intro */}
        <div className="mx-auto max-w-3xl text-center animate-fadeUp">
          <span className="inline-flex items-center gap-2 rounded-full border border-navy-700 bg-navy-900/60 px-3 py-1 text-xs font-medium text-slate-300">
            <Icon.Bolt width={13} height={13} className="text-accent-400" />
            Freelancer.com AI bidding assistant
          </span>

          <h1 className="mt-5 text-4xl font-bold leading-[1.08] text-white sm:text-5xl lg:text-[3.5rem]">
            Stop refreshing the Freelancer.com feed.{' '}
            <span className="bg-gradient-to-r from-accent-400 to-emerald-300 bg-clip-text text-transparent">
              Let your AI auto-bidder win the work.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
            Growlance is an AI bidding assistant that finds the right projects, drafts a tailored
            proposal, and tracks every client — from a private desktop app on your own machine. Your
            data, your keys, your rules.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <PrimaryButton href="#download" className="px-6 py-3.5 text-base">
              Try free for 7 days
            </PrimaryButton>
            <BuyButton variant="ghost" className="px-6 py-3.5 text-base">
              Get Growlance — {PRICING.currencySymbol}{PRICING.price}
            </BuyButton>
          </div>
          <p className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Icon.Bolt width={13} height={13} className="text-accent-400" />
            No card, no account — download and start bidding in minutes.{' '}
            <a href={LINKS.calendly} target="_blank" rel="noopener noreferrer" className="text-accent-400 hover:underline">
              Or book a demo
            </a>
          </p>

          <ul className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2">
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-2 text-sm text-slate-400">
                <Icon.Check width={16} height={16} className="text-accent-400" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* large product showcase */}
        <div className="mx-auto mt-14 max-w-5xl animate-fadeUp" style={{ animationDelay: '120ms' }}>
          {shots.length > 0 ? <Slideshow shots={shots} /> : <AppPreview />}
        </div>
      </Container>
    </section>
  )
}
