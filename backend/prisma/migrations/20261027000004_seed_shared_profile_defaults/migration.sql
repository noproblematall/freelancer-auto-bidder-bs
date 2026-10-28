-- One-time back-fill for installs that predate the shared-profile seeder.
-- Snapshot of DEFAULT_SHARED_PROFILE from prisma/seed.js at the time of this migration;
-- accounts that already saved shared settings (non-NULL) are left untouched.
UPDATE "users" SET "shared_profile" = '{"excludedRegions":["south_asia","southeast_asia","central_asia","north_africa","west_africa","east_africa","central_africa","southern_africa","pacific_islands"],"countryExceptions":["SG","ZA"],"excludedCountries":["RU","UA","BY","XK","YE","IR","IQ","SY","HT","CU","NI"],"excludedCurrencies":[],"countries":[],"languages":"","skillsSummary":"","experienceSummary":"","portfolioHighlights":"","reviewMode":false}' WHERE "shared_profile" IS NULL;
