-- "Shared profile settings" split up. The project search filters keep living in
-- the JSON column, now named job_filters. Review mode and the freelancer's AI
-- context move to their own columns so they are managed under Settings.
ALTER TABLE "users" RENAME COLUMN "shared_profile" TO "job_filters";
ALTER TABLE "users" ADD COLUMN "review_mode" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "skills_summary" TEXT;
ALTER TABLE "users" ADD COLUMN "experience_summary" TEXT;
ALTER TABLE "users" ADD COLUMN "portfolio_highlights" TEXT;
UPDATE "users" SET "review_mode" = 1
WHERE "job_filters" IS NOT NULL AND json_extract("job_filters", '$.reviewMode') = 1;
UPDATE "users" SET
  "skills_summary" = NULLIF(json_extract("job_filters", '$.skillsSummary'), ''),
  "experience_summary" = NULLIF(json_extract("job_filters", '$.experienceSummary'), ''),
  "portfolio_highlights" = NULLIF(json_extract("job_filters", '$.portfolioHighlights'), '')
WHERE "job_filters" IS NOT NULL;
UPDATE "users" SET "job_filters" = json_remove("job_filters", '$.reviewMode', '$.skillsSummary', '$.experienceSummary', '$.portfolioHighlights')
WHERE "job_filters" IS NOT NULL;
