-- The bid that won a project we bid on, read from Freelancer once awarded
-- (services/insights/winningBids.js), for the Market page's winning-bid study.
CREATE TABLE IF NOT EXISTS "winning_bids" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "project_id" INTEGER NOT NULL,
  "freelancer_bid_id" INTEGER,
  "bidder_id" INTEGER,
  "bidder_name" TEXT,
  "bidder_username" TEXT,
  "bidder_country" TEXT,
  "bidder_rating" REAL,
  "bidder_reviews" INTEGER,
  "bidder_hourly_rate" REAL,
  "bidder_registered_at" DATETIME,
  "amount" REAL,
  "period" INTEGER,
  "description" TEXT,
  "sealed" BOOLEAN NOT NULL DEFAULT false,
  "highlighted" BOOLEAN NOT NULL DEFAULT false,
  "bid_submitted_at" DATETIME,
  "is_mine" BOOLEAN NOT NULL DEFAULT false,
  "total_bids" INTEGER,
  "avg_bid" REAL,
  "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "winning_bids_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "winning_bids_project_id_key" ON "winning_bids"("project_id");

-- Who posted the project, for the client explorer
ALTER TABLE "projects" ADD COLUMN "owner_name" TEXT;
ALTER TABLE "projects" ADD COLUMN "owner_username" TEXT;
