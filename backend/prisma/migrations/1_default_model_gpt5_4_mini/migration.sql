-- Move existing installs off the legacy OpenAI default. The previous default
-- (gpt-4o-mini) and the stale "gpt-5.2" option are remapped to the new
-- cost-optimized default, gpt-5.4-mini. An explicit gpt-4o choice is left as-is.
UPDATE "users" SET "openai_model" = 'gpt-5.4-mini'
WHERE "openai_model" IN ('gpt-4o-mini', 'gpt-5.2');
