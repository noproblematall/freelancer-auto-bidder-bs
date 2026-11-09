-- Language code of each project posting, so the Projects page can apply the
-- Job Filters language list. Existing rows stay NULL (language unknown).
ALTER TABLE "projects" ADD COLUMN "language" TEXT;
