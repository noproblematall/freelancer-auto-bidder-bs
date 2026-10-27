import { Container, SectionHeading } from './ui.jsx'
import { Icon } from './icons.jsx'

// Mirrors the "Marketing-Ready Differentiators" table in HOMEPAGE.md.
const ROWS = [
  { label: 'Where your data lives', grow: 'Your machine', saas: 'Vendor cloud' },
  { label: 'Who pays for the AI', grow: 'You (your OpenAI key)', saas: 'Vendor markup' },
  { label: 'Freelancer API credentials', grow: 'Yours', saas: 'Shared (TOS risk)' },
  { label: 'Pricing', grow: 'Buy once', saas: 'Monthly forever' },
  { label: 'Telemetry', grow: 'None', saas: 'Usually yes' },
  { label: 'Works offline after auth', grow: 'Yes', saas: 'No' },
]

export function Comparison() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Why Growlance"
          title="Own your tooling. Don’t rent it."
          subtitle="Most bidding tools are cloud SaaS that hold your data, mark up the AI, and bill you every month. Growlance flips that."
        />

        <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl border border-navy-800">
          <div className="grid grid-cols-12 bg-navy-900/60 px-5 py-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <div className="col-span-6 sm:col-span-5" />
            <div className="col-span-3 sm:col-span-4 flex items-center gap-2 text-accent-400">
              <Icon.Shield width={15} height={15} /> Growlance
            </div>
            <div className="col-span-3 text-slate-400">Typical SaaS</div>
          </div>

          {ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-12 items-center px-5 py-3.5 text-sm ${
                i % 2 ? 'bg-navy-900/20' : ''
              }`}
            >
              <div className="col-span-6 sm:col-span-5 text-slate-300">{row.label}</div>
              <div className="col-span-3 sm:col-span-4 flex items-center gap-1.5 font-medium text-white">
                <Icon.Check width={15} height={15} className="shrink-0 text-accent-400" />
                <span className="truncate">{row.grow}</span>
              </div>
              <div className="col-span-3 flex items-center gap-1.5 text-slate-400">
                <Icon.X width={14} height={14} className="shrink-0 text-rose-400/60" />
                <span className="truncate">{row.saas}</span>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
