-- How many bid history records an account keeps. Older records are removed
-- once a day (services/bidding/historyRetention.js).
ALTER TABLE "users" ADD COLUMN "bid_history_limit" INTEGER NOT NULL DEFAULT 50000;
