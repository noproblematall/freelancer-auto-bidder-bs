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

// Idempotent: only accounts that have never saved job filters are touched.
async function seedJobFilterDefaults(prisma) {
  const result = await prisma.user.updateMany({
    where: { jobFilters: null },
    data: { jobFilters: defaultJobFiltersJson() },
  });
  return result.count;
}

async function main() {
  const prisma = require('../src/config/database');
  try {
    const seeded = await seedJobFilterDefaults(prisma);
    console.log(`Seed: job filter defaults applied to ${seeded} account(s)`);
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

module.exports = { DEFAULT_JOB_FILTERS, defaultJobFiltersJson, seedJobFilterDefaults };
