-- Account-wide percentage applied to AI-suggested fixed-price bid amounts
-- (100 = bid exactly what the AI suggests). ("--" comments only, one
-- statement per ";".)
ALTER TABLE "users" ADD COLUMN "ai_bid_percentage" INTEGER NOT NULL DEFAULT 100;
