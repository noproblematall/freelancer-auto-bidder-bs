-- Win tracking, client scoring, per-project decisions, follow-ups and the
-- settings that drive them.

-- Account settings
ALTER TABLE "users" ADD COLUMN "min_client_score" INTEGER NOT NULL DEFAULT 35;
ALTER TABLE "users" ADD COLUMN "max_project_bids" INTEGER NOT NULL DEFAULT 40;
ALTER TABLE "users" ADD COLUMN "follow_up_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "follow_up_hours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "users" ADD COLUMN "follow_up_min_score" INTEGER NOT NULL DEFAULT 85;
ALTER TABLE "users" ADD COLUMN "auto_reply_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "ai_review_auto" BOOLEAN NOT NULL DEFAULT true;

-- Employer facts, client score and the last automatic decision per project
ALTER TABLE "projects" ADD COLUMN "owner_payment_verified" BOOLEAN;
ALTER TABLE "projects" ADD COLUMN "owner_deposit_made" BOOLEAN;
ALTER TABLE "projects" ADD COLUMN "owner_reviews" INTEGER;
ALTER TABLE "projects" ADD COLUMN "owner_rating" REAL;
ALTER TABLE "projects" ADD COLUMN "owner_projects_complete" INTEGER;
ALTER TABLE "projects" ADD COLUMN "owner_projects_all" INTEGER;
ALTER TABLE "projects" ADD COLUMN "owner_registered_at" DATETIME;
ALTER TABLE "projects" ADD COLUMN "bid_avg" REAL;
ALTER TABLE "projects" ADD COLUMN "client_score" INTEGER;
ALTER TABLE "projects" ADD COLUMN "client_score_reasons" TEXT;
ALTER TABLE "projects" ADD COLUMN "decision" TEXT;
ALTER TABLE "projects" ADD COLUMN "decision_reason" TEXT;
ALTER TABLE "projects" ADD COLUMN "decision_detail" TEXT;
ALTER TABLE "projects" ADD COLUMN "decided_at" DATETIME;
ALTER TABLE "projects" ADD COLUMN "decision_profile_id" INTEGER;

-- Bid outcomes
ALTER TABLE "bids" ADD COLUMN "award_status" TEXT;
ALTER TABLE "bids" ADD COLUMN "awarded_at" DATETIME;
ALTER TABLE "bids" ADD COLUMN "client_replied_at" DATETIME;
ALTER TABLE "bids" ADD COLUMN "follow_up_at" DATETIME;
ALTER TABLE "bids" ADD COLUMN "follow_up_thread_id" INTEGER;
ALTER TABLE "bids" ADD COLUMN "last_synced_at" DATETIME;

-- Bids the message poller already marked converted were converted on the
-- client's first message, so that is when the client replied.
UPDATE "bids" SET "client_replied_at" = "placed_at" WHERE "status" = 'converted' AND "client_replied_at" IS NULL;

-- Drafted replies to client messages
ALTER TABLE "message_threads" ADD COLUMN "draft_reply" TEXT;
ALTER TABLE "message_threads" ADD COLUMN "auto_replied_at" DATETIME;
