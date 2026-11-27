-- Closed projects already searched for a winner, so the Market page's sync
-- does not ask Freelancer about them again.
ALTER TABLE "projects" ADD COLUMN "winner_checked_at" DATETIME;
