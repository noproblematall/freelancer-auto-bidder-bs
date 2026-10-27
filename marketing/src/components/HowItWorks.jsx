import { Container, SectionHeading } from './ui.jsx'

const STEPS = [
  {
    n: '01',
    title: 'Connect your accounts',
    body: 'Install the app, link your own Freelancer developer credentials and OpenAI key. Everything stays on your machine — nothing is shared with a vendor.',
  },
  {
    n: '02',
    title: 'Build your profiles',
    body: 'Define one profile per niche: keywords, budget bands, country and currency filters, pricing strategy, working hours, and rate limits. Tune your relevance threshold.',
  },
  {
    n: '03',
    title: 'Review or automate',
    body: 'Use it as a research-and-drafting co-pilot — score projects and generate proposals on demand — or switch on the scheduler and let it bid within your limits. Your call.',
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="border-y border-navy-800/70 bg-navy-900/30 py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="Up and running in three steps"
          subtitle="No SaaS onboarding, no waiting list. Download, connect, and you’re bidding the same afternoon."
        />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-navy-800 bg-navy-950/40 p-6">
              <div className="text-4xl font-bold text-accent-500/30">{s.n}</div>
              <h3 className="mt-3 text-lg font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
