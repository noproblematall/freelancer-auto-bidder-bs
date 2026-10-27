-- Review-and-send mode: when enabled on a bidding profile, the engine drafts
-- proposals and queues them as pending_review instead of auto-placing. The user
-- approves (places) or dismisses each one from the Bids page.
ALTER TABLE "bidding_profiles" ADD COLUMN "review_mode" BOOLEAN NOT NULL DEFAULT false;
