-- The "fixed amount" bid strategy is gone: fixed-price bids are either
-- AI-suggested or a percentage of the budget. Profiles that used it fall
-- back to the AI suggestion. ("--" comments only, one statement per ";",
-- for the Electron migration runner.)
UPDATE "bidding_profiles" SET "fixed_bid_strategy" = 'ai' WHERE "fixed_bid_strategy" = 'amount';
ALTER TABLE "bidding_profiles" DROP COLUMN "fixed_bid_amount";
