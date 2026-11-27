-- Our own bid next to the winner, read from the account's Freelancer bid
-- history, so bids placed outside this app (desktop app, website) can be
-- compared too.
ALTER TABLE "winning_bids" ADD COLUMN "our_freelancer_bid_id" INTEGER;
ALTER TABLE "winning_bids" ADD COLUMN "our_amount" REAL;
ALTER TABLE "winning_bids" ADD COLUMN "our_period" INTEGER;
ALTER TABLE "winning_bids" ADD COLUMN "our_text" TEXT;
ALTER TABLE "winning_bids" ADD COLUMN "our_placed_at" DATETIME;
