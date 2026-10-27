import { Container } from './ui.jsx'
import { Icon } from './icons.jsx'

const ITEMS = [
  { icon: 'Lock', title: 'Encrypted at rest', text: 'Tokens, API keys, and bot tokens are sealed with AES-256 in a secrets file generated per install.' },
  { icon: 'Shield', title: 'No cloud, no usage tracking', text: 'Nothing leaves your computer except direct API calls to Freelancer, OpenAI, and Telegram — plus a periodic license check that sends only your key and an anonymous device id.' },
  { icon: 'Users', title: 'Runs under your account', text: 'You register your own Freelancer developer app, so OAuth runs under you — not a shared vendor key.' },
]

export function Privacy() {
  return (
    <section id="privacy" className="border-y border-navy-800/70 bg-navy-900/30 py-20 sm:py-28">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-accent-400">
            Local-first
          </span>
          <h2 className="mt-4 text-3xl font-bold sm:text-4xl">Your business runs on your machine</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400 sm:text-lg">
            Growlance is a desktop app, not a website pretending to be one. Your client list, your bid history,
            and your keys never touch someone else’s server. That’s better for your privacy — and it keeps you
            on the right side of Freelancer’s API terms.
          </p>

          <div className="mt-8 space-y-4">
            {ITEMS.map((it) => {
              const Glyph = Icon[it.icon]
              return (
                <div key={it.title} className="flex gap-3.5">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-400 ring-1 ring-accent-500/20">
                    {Glyph && <Glyph width={18} height={18} />}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{it.title}</div>
                    <div className="mt-0.5 text-sm leading-relaxed text-slate-400">{it.text}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card-gradient rounded-2xl border border-navy-800 p-8">
          <pre className="overflow-x-auto text-xs leading-relaxed text-slate-400">
{`~/Library/Application Support/Growlance/
├── growlance.db        # SQLite — your data, your disk
├── .secret             # AES key · chmod 0600
└── logs/

Outbound connections:
  → api.freelancer.com   (your OAuth)
  → api.openai.com       (your key)
  → api.telegram.org     (your bot)
  → growlance.app        (license check only)

No analytics. No usage data. No account.`}
          </pre>
        </div>
      </Container>
    </section>
  )
}
