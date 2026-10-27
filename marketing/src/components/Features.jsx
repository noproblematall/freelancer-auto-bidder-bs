import { Container, SectionHeading } from './ui.jsx'
import { Icon } from './icons.jsx'
import { PILLARS, EXTRAS } from '../data/features.js'

function PillarCard({ feature }) {
  const Glyph = Icon[feature.icon]
  return (
    <div className="card-gradient group rounded-2xl border border-navy-800 p-6 transition hover:border-accent-500/40">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-500/10 text-accent-400 ring-1 ring-accent-500/20">
        {Glyph && <Glyph width={22} height={22} />}
      </div>
      <h3 className="mt-5 text-lg font-semibold text-white">{feature.title}</h3>
      <p className="mt-1 text-sm font-medium text-accent-400/90">{feature.tagline}</p>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">{feature.body}</p>
      <ul className="mt-4 space-y-2">
        {feature.points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-slate-300">
            <Icon.Check width={16} height={16} className="mt-0.5 shrink-0 text-accent-400" />
            {p}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ExtraCard({ item }) {
  const Glyph = Icon[item.icon]
  return (
    <div className="flex gap-3 rounded-xl border border-navy-800 bg-navy-900/40 p-4">
      <div className="mt-0.5 text-accent-400">{Glyph && <Glyph width={18} height={18} />}</div>
      <div>
        <div className="text-sm font-semibold text-white">{item.title}</div>
        <div className="mt-1 text-xs leading-relaxed text-slate-400">{item.text}</div>
      </div>
    </div>
  )
}

export function Features() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Everything in one app"
          title="A full bidding workflow — not just an auto-clicker"
          subtitle="From finding the right project to keeping the client relationship warm, Growlance handles the busywork so you can focus on the work that pays."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((f) => (
            <PillarCard key={f.title} feature={f} />
          ))}
        </div>

        <div className="mt-12">
          <p className="mb-5 text-center text-sm font-medium uppercase tracking-wider text-slate-400">
            Plus the control center you’d expect
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EXTRAS.map((e) => (
              <ExtraCard key={e.title} item={e} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  )
}
