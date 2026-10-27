-- Bid caps moved from per-profile to account-wide settings (Settings → Auto-Bidding)
ALTER TABLE "users" ADD COLUMN "max_bids_per_hour" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "users" ADD COLUMN "max_bids_per_day" INTEGER NOT NULL DEFAULT 80;
