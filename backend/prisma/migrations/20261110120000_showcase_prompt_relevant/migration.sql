-- The shipped "Showcase" prompt no longer forces two or three portfolio links
-- into every bid; links are included only when they clearly match the project
-- (see DEFAULT_BID_PROFILES in prisma/seed.js). Update profiles that still
-- carry the original wording; prompts the user has edited are left alone.
UPDATE "bidding_profiles"
SET "proposal_prompt" = 'If my portfolio lists sites that clearly match this project (same platform, stack or kind of work), include up to three of them near the end, each on its own line with a few words on what it is. If none clearly match, include no links and do not mention my portfolio.'
WHERE "proposal_prompt" = 'Near the end, include two or three of the most relevant links from my portfolio, each on its own line.';
