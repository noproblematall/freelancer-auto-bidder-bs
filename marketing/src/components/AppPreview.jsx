// Pure-CSS mock of the Growlance dashboard — the fallback hero visual used when
// no real screenshots are configured (HERO.screenshots is empty).
import { Icon } from './icons.jsx'

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-navy-700/70 bg-navy-900/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-bold ${accent ? 'text-accent-400' : 'text-white'}`}>{value}</div>
    </div>
  )
}

function BidRow({ title, amount, status, color }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-navy-800/70 py-2 last:border-0">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-slate-200">{title}</div>
        <div className="text-[10px] text-slate-400">{amount}</div>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>{status}</span>
    </div>
  )
}

export function AppPreview() {
  return (
    <div className="relative w-full">
      {/* window chrome */}
      <div className="overflow-hidden rounded-2xl border border-navy-700/80 bg-navy-900/80 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="flex items-center gap-1.5 border-b border-navy-800 bg-navy-950/60 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Icon.Shield width={12} height={12} className="text-accent-400" />
            Running locally · localhost
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3 p-4">
          {/* sidebar */}
          <div className="col-span-3 hidden flex-col gap-1.5 sm:flex">
            {['Dashboard', 'Profiles', 'Projects', 'Bids', 'Clients', 'Calendar'].map((item, i) => (
              <div
                key={item}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
                  i === 0 ? 'bg-accent-500/15 text-accent-300' : 'text-slate-400'
                }`}
              >
                {item}
              </div>
            ))}
          </div>

          {/* main */}
          <div className="col-span-12 sm:col-span-9">
            <div className="grid grid-cols-3 gap-2.5">
              <Stat label="Bids today" value="14" accent />
              <Stat label="Conversion" value="23%" />
              <Stat label="Active profiles" value="4" />
            </div>

            <div className="mt-3 rounded-xl border border-navy-700/70 bg-navy-900/60 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300">Recent bids</span>
                <span className="text-[10px] text-accent-400">● live</span>
              </div>
              <BidRow title="React dashboard for SaaS analytics" amount="$1,200 · React profile" status="Converted" color="bg-accent-500/15 text-accent-300" />
              <BidRow title="Node.js API integration & webhooks" amount="$680 · Backend profile" status="Placed" color="bg-sky-500/15 text-sky-300" />
              <BidRow title="Landing page redesign (Figma → code)" amount="$450 · Frontend profile" status="Placed" color="bg-sky-500/15 text-sky-300" />
              <BidRow title="Fix WordPress performance issues" amount="— · skipped, low fit" status="Score 41" color="bg-navy-700/60 text-slate-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
