-- Anonymous client key: Freelancer hides owner ids, so a client's projects are
-- grouped by the owner's registration time, country and city instead
-- (services/freelancer/projectMapper.js ownerKeyOf builds the same string).
ALTER TABLE "projects" ADD COLUMN "owner_key" TEXT;
CREATE INDEX "projects_owner_key_idx" ON "projects"("owner_key");

-- Projects already stored with those facts get their key now.
-- owner_registered_at is stored in milliseconds.
UPDATE "projects"
SET "owner_key" = CAST("owner_registered_at" / 1000 AS INTEGER) || '-' ||
  lower(coalesce(json_extract("owner_location", '$.country.code'), '')) || '-' ||
  trim(coalesce(json_extract("owner_location", '$.city'), ''))
WHERE "owner_registered_at" IS NOT NULL AND "owner_key" IS NULL;
