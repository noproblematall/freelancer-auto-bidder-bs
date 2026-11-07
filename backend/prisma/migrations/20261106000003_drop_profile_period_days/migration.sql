-- "Fixed days" now promises the account-wide fallback days
-- (users.period_fallback_days) instead of a per-profile count, so the
-- per-profile columns go. ("--" comments only, one statement per ";".)
ALTER TABLE "bidding_profiles" DROP COLUMN "fixed_period_days";
ALTER TABLE "bidding_profiles" DROP COLUMN "hourly_period_days";
