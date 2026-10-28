-- Default search languages (English, Spanish) added to the shared-profile seed.
-- Back-fill accounts with no languages set; an explicit choice is left as it is.
UPDATE "users"
SET "shared_profile" = json_set("shared_profile", '$.languages', 'en, es')
WHERE "shared_profile" IS NOT NULL
  AND COALESCE(json_extract("shared_profile", '$.languages'), '') = '';
