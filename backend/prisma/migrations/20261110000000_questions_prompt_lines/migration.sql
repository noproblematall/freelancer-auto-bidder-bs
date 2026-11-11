-- The shipped "Questions" prompt now asks for one question per line (see
-- DEFAULT_BID_PROFILES in prisma/seed.js). Update profiles that still carry the
-- original wording; prompts the user has edited are left alone.
UPDATE "bidding_profiles"
SET "proposal_prompt" = 'Before the closing line, ask two short questions about this brief that show I read it. Put each question on its own line.'
WHERE "proposal_prompt" = 'Before the closing line, ask two short questions about this brief that show I read it.';
