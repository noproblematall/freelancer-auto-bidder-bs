-- Default bid profiles (see DEFAULT_BID_PROFILES in prisma/seed.js) for accounts
-- that have no profile yet. New accounts get them when the account is created.
-- All four start switched off. The app lists profiles newest first, so the
-- timestamps step down to show Default, Showcase, Questions, Short.
INSERT INTO "bidding_profiles" ("user_id", "name", "proposal_prompt", "created_at", "updated_at")
SELECT u."id", d."name", d."prompt",
       CAST(strftime('%s', 'now') AS INTEGER) * 1000 + d."step",
       CAST(strftime('%s', 'now') AS INTEGER) * 1000 + d."step"
FROM "users" u
CROSS JOIN (
  SELECT 3 AS "step", 'Default' AS "name", NULL AS "prompt"
  UNION ALL SELECT 2, 'Showcase', 'Near the end, include two or three of the most relevant links from my portfolio, each on its own line.'
  UNION ALL SELECT 1, 'Questions', 'Before the closing line, ask two short questions about this brief that show I read it.'
  UNION ALL SELECT 0, 'Short', 'Keep the bid under 600 characters.'
) d
WHERE NOT EXISTS (SELECT 1 FROM "bidding_profiles" p WHERE p."user_id" = u."id");
