// Database seeder.
//
//   npx prisma db seed        — seeds an existing database (also runs after `prisma migrate reset`)
//
// The same defaults are used by the app when a new account is created, so a
// fresh user starts with these rows without a separate seeding step. Existing
// installs were back-filled by the 20261027000004..6 migrations, which carry
// snapshots of these values.

// Job filters (users.job_filters) for a new account: skip the regions,
// countries and currencies where project budgets are rarely worth a bid, and
// search in English and Spanish. The shape mirrors services/bidding/jobFilters.js.
// Region keys come from utils/regions.js; country codes are ISO 3166-1 alpha-2;
// currency codes are ISO 4217.
const DEFAULT_JOB_FILTERS = Object.freeze({
  excludedRegions: [
    'south_asia', 'southeast_asia', 'central_asia',
    'north_africa', 'west_africa', 'east_africa', 'central_africa', 'southern_africa',
    'pacific_islands',
  ],
  // Allowed even though their region is excluded
  countryExceptions: ['SG', 'ZA'],
  // Blocked although their region is open
  excludedCountries: ['RU', 'UA', 'BY', 'XK', 'YE', 'IR', 'IQ', 'SY', 'HT', 'CU', 'NI'],
  // Project currencies to skip even when the client is listed elsewhere (e.g. an
  // INR-denominated project posted from Canada)
  excludedCurrencies: ['INR', 'PKR', 'BDT', 'LKR', 'NPR', 'IDR', 'PHP', 'VND', 'EGP', 'NGN', 'KES', 'GHS', 'RUB', 'UAH'],
  countries: [],
  // Search languages (comma-separated codes); blank would mean all languages
  languages: 'en, es',
  // Budget bounds in USD; null means no bound
  budgetMinFixed: 50,
  budgetMaxFixed: null,
  budgetMinHourly: 15,
  budgetMaxHourly: null,
});

function defaultJobFiltersJson() {
  return JSON.stringify(DEFAULT_JOB_FILTERS);
}

// Bidding schedule (users.schedule_week) for a new account: every day except
// Sunday, 05:00–21:00 in the account timezone. Keys are JavaScript days
// (0 = Sunday). The shape mirrors services/bidding/scheduleWeek.js.
const DEFAULT_SCHEDULE_WEEK = Object.freeze({
  0: { enabled: false, start: '05:00', end: '21:00' },
  1: { enabled: true, start: '05:00', end: '21:00' },
  2: { enabled: true, start: '05:00', end: '21:00' },
  3: { enabled: true, start: '05:00', end: '21:00' },
  4: { enabled: true, start: '05:00', end: '21:00' },
  5: { enabled: true, start: '05:00', end: '21:00' },
  6: { enabled: true, start: '05:00', end: '21:00' },
});

function defaultScheduleWeekJson() {
  return JSON.stringify(DEFAULT_SCHEDULE_WEEK);
}

// Freelancer profile (users.skills_summary / experience_summary /
// portfolio_highlights): what the AI is told about the freelancer when it
// scores projects and writes bids. A solid full-stack, mobile and AI developer
// profile by default; the account owner edits it under Settings → Freelancer
// Profile. Skills and experience describe capabilities in general. Portfolio
// highlights are the owner's sample sites grouped by skill. The shipped
// proposal prompt (ChatGPT-prompt.md) quotes them only when a client asks for
// examples; a custom account prompt (Settings → Auto-Bidding) may use them more.
const DEFAULT_FREELANCER_PROFILE = Object.freeze({
  // One "- " bullet per area so the text reads cleanly in the Settings editor and in the prompt
  skillsSummary: [
    "- Full-stack web and mobile developer with a strong AI and machine learning background.",
    "- Frontend: React, Next.js, Vue, TypeScript, Tailwind, responsive and accessible UI.",
    "- Backend: Node.js (Express, NestJS), Python (Django, FastAPI), PHP (Laravel), REST and GraphQL APIs, auth, background jobs.",
    "- Mobile: React Native and Expo, Flutter, native iOS (Swift, SwiftUI) and Android (Kotlin), push notifications, offline sync, in-app purchases, App Store and Google Play releases.",
    "- AI and ML: LLM apps with OpenAI, Anthropic and open-source models, RAG pipelines, vector search (pgvector, Pinecone), prompt design, fine-tuning and model training with PyTorch and scikit-learn, chatbots and AI agents, data labeling and evaluation.",
    "- Data: PostgreSQL, MySQL, MongoDB, Redis, ETL pipelines, reporting dashboards.",
    "- E-commerce: Shopify (themes, Liquid, custom apps), WooCommerce, Stripe and PayPal.",
    "- CMS: WordPress themes and plugins, headless CMS.",
    "- Integrations and automation: third-party APIs, webhooks, scraping, scheduled jobs, Zapier, Make, n8n.",
    "- DevOps: Docker, AWS, GCP, Vercel, CI/CD, monitoring, performance and SEO.",
  ].join('\n'),
  experienceSummary: [
    "- About 10 years building web and mobile products for small businesses, agencies and startups, and the last few years adding AI features to them.",
    "- Web: custom apps and client portals, SaaS dashboards, multi-vendor marketplaces with split payouts, booking and scheduling platforms, internal tools and CRMs that replace spreadsheets, real-time operations dashboards, and API integrations with CRMs, payment, shipping and marketing tools.",
    "- E-commerce: Shopify and WooCommerce stores built from scratch or rebuilt, custom themes, subscription and checkout customisation, and performance work that typically halves load times.",
    "- Mobile: cross-platform iOS and Android apps for marketplaces, food delivery with live order tracking, bookings and loyalty programs, from design handoff to store submission and post-launch updates; companion apps for existing web products.",
    "- AI: customer-support assistants with retrieval over help docs and order data, contract and document analysis tools with reviewer UIs, fine-tuned classification models that route and flag content, content and proposal generation tools, recommendation models, and AI agents that automate back-office work.",
    "- Maintenance: bug fixing, performance tuning, security hardening, and migrations of legacy sites (for example WordPress to React) to modern stacks while preserving URLs and search rankings. Comfortable taking over someone else's code.",
    "- Way of working: clear written updates, realistic estimates, a short demo at each milestone, and no surprises on scope or cost.",
  ].join('\n'),
  // A heading per skill, one site per line, a blank line between groups
  portfolioHighlights: [
    "Shopify (Shopify Partner since 2018, themes and apps)",
    "- https://www.tombihn.com",
    "- https://usabaseballshop.com",
    "- https://www.foriawellness.com",
    "- https://nanohearingaids.com",
    "- https://platinumtherapylights.com",
    "- https://www.hotelcollection.com",
    "",
    "PHP and Laravel with React, Vue or Angular",
    "- https://alchemy.team",
    "- https://sparktutoring.team",
    "- https://serwish.ge",
    "- https://metrix.ge",
    "- https://hogar.zurich.ar.onmtc.com",
    "- https://movilidad.zurich.ar.onmtc.com",
  ].join('\n'),
});

function defaultFreelancerProfile() {
  return { ...DEFAULT_FREELANCER_PROFILE };
}

// Bid profiles every new account starts with (bidding_profiles). All four run
// the same open search; the proposal prompt gives each its own bid style.
// They start switched off, so nothing is bid until the owner turns one on.
// Accounts that existed before this, and had no profile, get the same four
// from the 20261109000000_default_bid_profiles migration.
const DEFAULT_BID_PROFILES = Object.freeze([
  { name: 'Default', proposalPrompt: null },
  { name: 'Showcase', proposalPrompt: 'Near the end, include two or three of the most relevant links from my portfolio, each on its own line.' },
  { name: 'Questions', proposalPrompt: 'Before the closing line, ask two short questions about this brief that show I read it.' },
  { name: 'Short', proposalPrompt: 'Keep the bid under 600 characters.' },
]);

// Rows for a nested create. The app lists profiles newest first, so the
// timestamps step down to keep the order above.
function defaultBidProfiles(now = Date.now()) {
  const last = DEFAULT_BID_PROFILES.length - 1;
  return DEFAULT_BID_PROFILES.map((profile, i) => ({ ...profile, createdAt: new Date(now + (last - i)) }));
}

// Idempotent: only accounts with no profile text at all are touched.
async function seedFreelancerProfileDefaults(prisma) {
  const result = await prisma.user.updateMany({
    where: { skillsSummary: null, experienceSummary: null, portfolioHighlights: null },
    data: defaultFreelancerProfile(),
  });
  return result.count;
}

// Idempotent: accounts without a per-day schedule get the default and the
// schedule switched on. (Accounts that customised the legacy single window
// are converted by the 20261027000009_schedule_week migration instead.)
async function seedScheduleDefaults(prisma) {
  const result = await prisma.user.updateMany({
    where: { scheduleWeek: null },
    data: { scheduleWeek: defaultScheduleWeekJson(), scheduleEnabled: true },
  });
  return result.count;
}

// Idempotent: only accounts that have never saved job filters are touched.
async function seedJobFilterDefaults(prisma) {
  const result = await prisma.user.updateMany({
    where: { jobFilters: null },
    data: { jobFilters: defaultJobFiltersJson() },
  });
  return result.count;
}

// Hourly rate (users.hourly_rate), USD per hour, shared by every bid profile:
// bid as-is on hourly projects and used to turn a fixed budget into a
// delivery estimate (budget ÷ (8h × rate)). The owner sets their real rate
// under Settings → Auto-Bidding.
const DEFAULT_HOURLY_RATE = 25;

// Idempotent: only accounts without a rate are touched.
async function seedHourlyRateDefault(prisma) {
  const result = await prisma.user.updateMany({
    where: { hourlyRate: null },
    data: { hourlyRate: DEFAULT_HOURLY_RATE },
  });
  return result.count;
}

async function main() {
  const prisma = require('../src/config/database');
  try {
    const seeded = await seedJobFilterDefaults(prisma);
    console.log(`Seed: job filter defaults applied to ${seeded} account(s)`);
    const scheduled = await seedScheduleDefaults(prisma);
    console.log(`Seed: schedule defaults applied to ${scheduled} account(s)`);
    const profiled = await seedFreelancerProfileDefaults(prisma);
    console.log(`Seed: freelancer profile defaults applied to ${profiled} account(s)`);
    const rated = await seedHourlyRateDefault(prisma);
    console.log(`Seed: hourly rate default applied to ${rated} account(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_JOB_FILTERS, defaultJobFiltersJson, seedJobFilterDefaults,
  DEFAULT_SCHEDULE_WEEK, defaultScheduleWeekJson, seedScheduleDefaults,
  DEFAULT_FREELANCER_PROFILE, defaultFreelancerProfile, seedFreelancerProfileDefaults,
  DEFAULT_BID_PROFILES, defaultBidProfiles,
  DEFAULT_HOURLY_RATE, seedHourlyRateDefault,
};
