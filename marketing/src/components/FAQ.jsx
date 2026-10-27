import { useState } from 'react'
import { Container, SectionHeading } from './ui.jsx'
import { Icon } from './icons.jsx'

const FAQS = [
  {
    q: 'Is there a free trial?',
    a: 'Yes — a full-featured 7-day trial. Download Growlance, open it, and click "Start 7-day free trial" — no card and no account needed. The trial is tied to your device (one per machine); when it ends, buy once to keep going and everything you set up stays.',
  },
  {
    q: 'Do I need a subscription?',
    a: 'No. Growlance is a one-time purchase — buy it once and run it forever, including free updates. The only ongoing cost is your own OpenAI usage, billed directly by OpenAI at cost with no markup from us.',
  },
  {
    q: 'How does it pick which projects to bid on?',
    a: 'Two stages, all configurable — no prompt engineering. First, hard filters in your bid profile: skill categories, keywords, min/max budget (set separately for fixed-price and hourly), project type, client countries, and languages. Then everything that passes is scored 0–100 by AI against your actual skills and experience; only projects above your threshold (default 70) get a proposal drafted, and the analysis flags red flags like vague briefs.',
  },
  {
    q: 'Can I control when it bids — or keep a human in the loop?',
    a: 'Yes to both. You set budget floors per profile, hourly and daily bid caps, and a working-hours schedule — outside those, it holds back. And you can run it review-and-send: Growlance drafts the proposal, and nothing is submitted until you approve it.',
  },
  {
    q: 'Where is my data stored?',
    a: 'Entirely on your computer, in a local SQLite database inside your OS user-data folder. There’s no vendor cloud and no usage tracking. The app makes direct API calls to Freelancer, OpenAI, and Telegram using your own keys, plus a periodic license check to growlance.app that sends only your license key and an anonymous device id — never your data.',
  },
  {
    q: 'Is this against Freelancer.com’s rules?',
    a: 'Growlance is designed to be used responsibly. You connect your own Freelancer developer credentials, and you can run it as a review-and-drafting co-pilot so a human approves what gets submitted. You’re responsible for bidding only on projects you intend to deliver, in line with Freelancer’s Code of Conduct.',
  },
  {
    q: 'What do I need to get started?',
    a: 'A Freelancer.com account with a free developer app (for API access), and an OpenAI API key. The app walks you through connecting both. That’s it — no extra accounts or services.',
  },
  {
    q: 'Which operating systems are supported?',
    a: 'macOS (Apple Silicon and Intel), Windows (x64), and Linux (AppImage). Your license activates one device at a time and works on any of these platforms. Switching computers? Email support@growlance.app and we’ll move it over for you.',
  },
  {
    q: 'How do I pay?',
    a: 'Checkout is crypto-only. You pay in Bitcoin, a stablecoin, or another supported coin through a hosted, non-custodial payment page — funds settle straight to the seller’s own wallet and there’s no account to create. You get your download right after the payment confirms, plus a 14-day money-back guarantee (refunded in the crypto amount you paid) if it isn’t for you.',
  },
]

function Item({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-navy-800">
      <button
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="font-medium text-white">{q}</span>
        <Icon.Arrow
          width={18}
          height={18}
          className={`shrink-0 text-accent-400 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && <p className="-mt-1 pb-5 pr-8 text-sm leading-relaxed text-slate-400">{a}</p>}
    </div>
  )
}

export function FAQ() {
  return (
    <section id="faq" className="border-t border-navy-800/70 bg-navy-900/30 py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="mx-auto mt-10 max-w-2xl">
          {FAQS.map((f) => (
            <Item key={f.q} {...f} />
          ))}
        </div>
      </Container>
    </section>
  )
}
