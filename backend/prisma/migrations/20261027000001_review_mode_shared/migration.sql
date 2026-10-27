-- Review mode moved from per-profile to the shared settings (users.shared_profile JSON).
-- Keep review ON for any user who had it enabled on at least one profile, so an
-- upgrade never silently switches an account from queued drafts to live bidding.
UPDATE "users"
SET "shared_profile" = json_set(COALESCE("shared_profile", '{}'), '$.reviewMode', json('true'))
WHERE "id" IN (SELECT "user_id" FROM "bidding_profiles" WHERE "review_mode" = 1);
