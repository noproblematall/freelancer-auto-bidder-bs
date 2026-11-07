-- The per-profile "custom rate" is gone: hourly bids use the account-wide
-- rate or the AI suggestion. Profiles that used it switch to the account
-- rate. ("--" comments only, one statement per ";".)
UPDATE "bidding_profiles" SET "hourly_rate_strategy" = 'my_rate' WHERE "hourly_rate_strategy" = 'custom';
ALTER TABLE "bidding_profiles" DROP COLUMN "custom_hourly_rate";
