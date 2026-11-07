-- Delivery period bounds (min/max days for AI-estimated periods, and the
-- fallback days) move from each profile to the account: Settings → Auto-Bidding.
-- Kept compatible with the Electron migration runner: "--" comments only.
ALTER TABLE "users" ADD COLUMN "period_min_days" INTEGER;
ALTER TABLE "users" ADD COLUMN "period_max_days" INTEGER;
ALTER TABLE "users" ADD COLUMN "period_fallback_days" INTEGER NOT NULL DEFAULT 7;

-- Carry over the tightest bounds any of the account's profiles had set
UPDATE "users" SET
  "period_min_days" = (SELECT MAX(COALESCE(p."fixed_min_period_days", p."hourly_min_period_days")) FROM "bidding_profiles" p WHERE p."user_id" = "users"."id"),
  "period_max_days" = (SELECT MIN(COALESCE(p."fixed_max_period_days", p."hourly_max_period_days")) FROM "bidding_profiles" p WHERE p."user_id" = "users"."id");
UPDATE "users" SET "period_max_days" = NULL
  WHERE "period_min_days" IS NOT NULL AND "period_max_days" IS NOT NULL AND "period_min_days" > "period_max_days";

ALTER TABLE "bidding_profiles" DROP COLUMN "fixed_min_period_days";
ALTER TABLE "bidding_profiles" DROP COLUMN "fixed_max_period_days";
ALTER TABLE "bidding_profiles" DROP COLUMN "hourly_min_period_days";
ALTER TABLE "bidding_profiles" DROP COLUMN "hourly_max_period_days";
