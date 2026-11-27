-- Indexes for the paginated lists. The desktop database holds ~100k projects;
-- without these every Projects page sorted the whole table and every lookup
-- of a project's bids scanned the bids table.
CREATE INDEX IF NOT EXISTS "projects_discovered_at_idx" ON "projects"("discovered_at");
CREATE INDEX IF NOT EXISTS "projects_time_submitted_idx" ON "projects"("time_submitted");
CREATE INDEX IF NOT EXISTS "bids_project_id_idx" ON "bids"("project_id");
CREATE INDEX IF NOT EXISTS "bids_user_id_created_at_idx" ON "bids"("user_id", "created_at");
