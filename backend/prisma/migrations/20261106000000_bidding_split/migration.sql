-- Bidding parameters split by project kind. Every profile now bids on both
-- fixed-price and hourly projects, each kind with its own pricing and
-- delivery settings, and the freelancer's hourly rate becomes account-wide.
--
-- Kept compatible with the Electron migration runner: "--" comments only,
-- one statement per ";".

-- Account-wide hourly rate (USD/hr). Carried over from the old per-profile
-- rates where one was set, otherwise the seeded default (prisma/seed.js).
ALTER TABLE "users" ADD COLUMN "hourly_rate" REAL;
UPDATE "users" SET "hourly_rate" = (
  SELECT COALESCE(MAX(p."fixed_hourly_rate"), MAX(p."default_hourly_rate"))
  FROM "bidding_profiles" p
  WHERE p."user_id" = "users"."id" AND (p."fixed_hourly_rate" > 0 OR p."default_hourly_rate" > 0)
);
UPDATE "users" SET "hourly_rate" = 25 WHERE "hourly_rate" IS NULL OR "hourly_rate" <= 0;

-- Rebuild bidding_profiles (SQLite cannot rename columns and change their
-- defaults in place). Old values map onto the new columns:
--   bid_amount_strategy auto|percentage|fixed  → fixed_bid_strategy ai|percentage|amount
--   period_days_strategy / default_period_days / min|max_period_days
--                                              → fixed_* and hourly_* period settings
--   fixed_hourly_rate (set)                    → hourly_rate_strategy 'custom' + custom_hourly_rate
--   project_types, default_hourly_rate         → dropped (all projects; account rate)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_bidding_profiles" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "search_keywords" TEXT,
    "job_ids" TEXT,
    "budget_min_fixed" REAL,
    "budget_max_fixed" REAL,
    "budget_min_hourly" REAL,
    "budget_max_hourly" REAL,
    "countries" TEXT,
    "excluded_countries" TEXT,
    "excluded_regions" TEXT,
    "country_exceptions" TEXT,
    "excluded_currencies" TEXT,
    "languages" TEXT,
    "fixed_bid_strategy" TEXT NOT NULL DEFAULT 'ai',
    "fixed_bid_amount" REAL,
    "bid_percentage" REAL,
    "fixed_period_strategy" TEXT NOT NULL DEFAULT 'ai',
    "fixed_period_days" INTEGER NOT NULL DEFAULT 7,
    "fixed_min_period_days" INTEGER,
    "fixed_max_period_days" INTEGER,
    "milestone_percentage" INTEGER NOT NULL DEFAULT 100,
    "hourly_rate_strategy" TEXT NOT NULL DEFAULT 'my_rate',
    "custom_hourly_rate" REAL,
    "hourly_period_strategy" TEXT NOT NULL DEFAULT 'ai',
    "hourly_period_days" INTEGER NOT NULL DEFAULT 7,
    "hourly_min_period_days" INTEGER,
    "hourly_max_period_days" INTEGER,
    "min_relevance_score" INTEGER NOT NULL DEFAULT 70,
    "proposal_prompt" TEXT,
    "review_mode" BOOLEAN NOT NULL DEFAULT false,
    "max_bids_per_hour" INTEGER NOT NULL DEFAULT 5,
    "max_bids_per_day" INTEGER NOT NULL DEFAULT 20,
    "skills_summary" TEXT,
    "experience_summary" TEXT,
    "portfolio_highlights" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "bidding_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_bidding_profiles" (
    "id", "user_id", "name", "is_active", "search_keywords", "job_ids",
    "budget_min_fixed", "budget_max_fixed", "budget_min_hourly", "budget_max_hourly",
    "countries", "excluded_countries", "excluded_regions", "country_exceptions", "excluded_currencies", "languages",
    "fixed_bid_strategy", "fixed_bid_amount", "bid_percentage",
    "fixed_period_strategy", "fixed_period_days", "fixed_min_period_days", "fixed_max_period_days",
    "milestone_percentage",
    "hourly_rate_strategy", "custom_hourly_rate",
    "hourly_period_strategy", "hourly_period_days", "hourly_min_period_days", "hourly_max_period_days",
    "min_relevance_score", "proposal_prompt", "review_mode", "max_bids_per_hour", "max_bids_per_day",
    "skills_summary", "experience_summary", "portfolio_highlights", "created_at", "updated_at"
)
SELECT
    "id", "user_id", "name", "is_active", "search_keywords", "job_ids",
    "budget_min_fixed", "budget_max_fixed", "budget_min_hourly", "budget_max_hourly",
    "countries", "excluded_countries", "excluded_regions", "country_exceptions", "excluded_currencies", "languages",
    CASE "bid_amount_strategy" WHEN 'fixed' THEN 'amount' WHEN 'percentage' THEN 'percentage' ELSE 'ai' END,
    "fixed_bid_amount", "bid_percentage",
    CASE "period_days_strategy" WHEN 'ai' THEN 'ai' ELSE 'fixed' END,
    "default_period_days", "min_period_days", "max_period_days",
    "milestone_percentage",
    CASE WHEN "fixed_hourly_rate" > 0 THEN 'custom' ELSE 'my_rate' END,
    CASE WHEN "fixed_hourly_rate" > 0 THEN "fixed_hourly_rate" ELSE NULL END,
    CASE "period_days_strategy" WHEN 'ai' THEN 'ai' ELSE 'fixed' END,
    "default_period_days", "min_period_days", "max_period_days",
    "min_relevance_score", "proposal_prompt", "review_mode", "max_bids_per_hour", "max_bids_per_day",
    "skills_summary", "experience_summary", "portfolio_highlights", "created_at", "updated_at"
FROM "bidding_profiles";
DROP TABLE "bidding_profiles";
ALTER TABLE "new_bidding_profiles" RENAME TO "bidding_profiles";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
