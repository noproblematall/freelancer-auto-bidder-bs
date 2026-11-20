-- Applying the AI review's accepted actions for every account:
--   1. follow-up messaging on, one message 24 h after an unanswered bid
--   2. an "Outcome-first" bid profile (outcome line, proof line, three-step
--      plan, exactly one question) for accounts that do not have one, active
--   3. the stored AI reviews are dropped: they were produced under the old
--      goal (win rate); the next click produces one under the new goal (wins)

UPDATE "users" SET "follow_up_enabled" = true, "follow_up_hours" = 24;

INSERT INTO "bidding_profiles" ("user_id", "name", "is_active", "proposal_prompt", "created_at", "updated_at")
SELECT u."id", 'Outcome-first', true,
       'Structure the bid exactly like this and nothing else. Line 1: the direct outcome I will deliver for this job, specific to the brief (what the client will have when it is done). Line 2: one proof point from a similar project in my profile, in one sentence; never invent names, links or numbers. Then exactly three short plan lines, each on its own line starting with "- ", in the order I would do the work. Last line: exactly one clarifying question about the brief, on its own line. No greeting, no sign-off, no other text.',
       CAST(strftime('%s', 'now') AS INTEGER) * 1000,
       CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "users" u
WHERE NOT EXISTS (SELECT 1 FROM "bidding_profiles" p WHERE p."user_id" = u."id" AND p."name" = 'Outcome-first');

DELETE FROM "activity_logs" WHERE "action" = 'ai_analytics_report';
