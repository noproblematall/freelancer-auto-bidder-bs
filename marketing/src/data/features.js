// Feature copy is distilled from HOMEPAGE.md (the source-of-truth inventory).
// Keep claims honest and in sync with that file.

export const PILLARS = [
  {
    icon: 'Bot',
    title: 'Automated bidding engine',
    tagline: 'Set your rules. Let Growlance bid while you build.',
    body: 'A scheduled engine evaluates new Freelancer projects against your active profiles, scores relevance with GPT, drafts a custom proposal, and places the bid — strictly inside the rate limits and working hours you set.',
    points: [
      'Hourly + daily caps per profile',
      'Human-like bid delay with ±25% jitter',
      'Never bids twice on the same project',
    ],
  },
  {
    icon: 'Pen',
    title: 'AI proposals & relevance scoring',
    tagline: 'Spend tokens only on the projects that actually fit.',
    body: 'Every candidate is scored 0–100 for fit before a word is written. Above your threshold, OpenAI drafts a tailored proposal within Freelancer’s character limit, personalised with your skills and portfolio.',
    points: [
      'Per-profile minimum relevance threshold',
      'Detects red flags & estimates complexity',
      'Cached analyses — never pay to re-score',
    ],
  },
  {
    icon: 'Target',
    title: 'Targeting & flexible pricing',
    tagline: 'One profile per niche. Price them however you like.',
    body: 'Build independent profiles for each niche or budget tier and run them in parallel. Filter by budget band, project type, country, language, and currency — then price with a fixed amount, a percentage, or an AI-calculated number.',
    points: [
      'Country, region & currency filters',
      'Fixed / percentage / AI bid amounts',
      'Fixed or AI-formula delivery timelines',
    ],
  },
  {
    icon: 'Users',
    title: 'Built-in client CRM',
    tagline: 'Every client you’ve ever won, in one place.',
    body: 'Growlance builds a client database automatically from your converted bids — total value, project count, last project date, and editable notes. A follow-up inbox surfaces the replies that actually move the needle.',
    points: [
      'Auto-tracked from converted bids',
      'Follow-up inbox for unanswered threads',
      'Backfill historical clients via the API',
    ],
  },
  {
    icon: 'Calendar',
    title: 'Messages, meetings & alerts',
    tagline: 'Growlance reads your inbox so you don’t have to refresh it.',
    body: 'It polls your Freelancer messages, uses GPT to detect when a client wants to schedule a call, and drops it on a built-in calendar with reminders. Every event that matters is pushed to your phone over Telegram.',
    points: [
      'Detects Zoom, Meet, Teams, Skype & more',
      'Calendar with reminders before each call',
      'Telegram push for messages, bids & meetings',
    ],
  },
  {
    icon: 'Shield',
    title: 'Local-first & private',
    tagline: 'No cloud account. No telemetry. No vendor lock-in.',
    body: 'Growlance is a desktop app. Your database lives on your machine, your secrets are encrypted at rest, and nothing leaves your computer except direct calls to Freelancer, OpenAI, and Telegram (all using your own API keys) plus a periodic license check to growlance.app — your key and an anonymous device id, never your data.',
    points: [
      'SQLite stored in your user-data folder',
      'AES-256 encryption for all stored secrets',
      'No subscription — buy once, run forever',
    ],
  },
]

// Secondary “control center” features shown in a compact grid.
export const EXTRAS = [
  { icon: 'Chart', title: 'Dashboard & analytics', text: 'Bids placed, conversion rate, and history charts the moment you open the app.' },
  { icon: 'Gauge', title: 'Working hours & rate limits', text: 'A timezone-aware schedule that pauses itself outside your chosen window.' },
  { icon: 'Bell', title: 'Activity audit trail', text: 'Every bid, profile change, and scheduler run on the record, filterable and searchable.' },
  { icon: 'Bolt', title: 'Project discovery', text: 'Search Freelancer with the same filters the engine uses — and bid manually anytime.' },
  { icon: 'Lock', title: 'Your own credentials', text: 'Each install runs under your Freelancer developer app and your OpenAI key.' },
  { icon: 'Shield', title: 'Model choice + auto-fallback', text: 'Pick GPT-5.4 or the cost-saving mini/nano; never get stuck when billing hiccups.' },
]
