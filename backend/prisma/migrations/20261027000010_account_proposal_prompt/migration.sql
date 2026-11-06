-- Account-wide proposal prompt (Settings → Auto-Bidding). NULL means the shipped
-- default prompt; a bid profile's own prompt is appended to it at generation time.
ALTER TABLE "users" ADD COLUMN "proposal_prompt" TEXT;
