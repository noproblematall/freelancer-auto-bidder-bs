-- Milestone percentage is no longer a per-profile setting: every bid sends
-- 100, as Freelancer's own bid form does. ("--" comments only, one
-- statement per ";".)
ALTER TABLE "bidding_profiles" DROP COLUMN "milestone_percentage";
