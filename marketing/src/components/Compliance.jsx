import { Container } from './ui.jsx'
import { Icon } from './icons.jsx'

// Honest-use section. Mirrors the Compliance note in HOMEPAGE.md — the homepage
// must never imply spam-style usage.
export function Compliance() {
  return (
    <section id="responsible-use" className="scroll-mt-20 py-16">
      <Container>
        <div className="mx-auto max-w-3xl rounded-2xl border border-navy-800 bg-navy-900/40 p-7 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/10 text-accent-400 ring-1 ring-accent-500/20">
              <Icon.Shield width={18} height={18} />
            </div>
            <h3 className="text-lg font-semibold text-white">Built for honest bidding</h3>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Growlance is a co-pilot, not a spam cannon. Use it in <strong className="text-slate-200">review mode</strong> to
            score projects and draft proposals while you stay in control of every submission — the recommended posture for
            bidding only on work you intend to deliver, in line with Freelancer.com’s Code of Conduct. Rate limits, working
            hours, and per-profile targeting are there to keep your activity deliberate and human-paced. How you use it is
            your responsibility.
          </p>
        </div>
      </Container>
    </section>
  )
}
