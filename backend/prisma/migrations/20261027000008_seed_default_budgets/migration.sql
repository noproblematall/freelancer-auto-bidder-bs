-- Budget bounds moved from per-profile to the account-wide job filters, with
-- seeded minimums of $50 (fixed-price) and $15/hr (hourly). Back-fill accounts
-- whose filters predate these keys; an account that already has a value (or an
-- explicit null) is left as it is.
UPDATE "users" SET "job_filters" = json_set("job_filters", '$.budgetMinFixed', 50)
WHERE "job_filters" IS NOT NULL AND json_type("job_filters", '$.budgetMinFixed') IS NULL;
UPDATE "users" SET "job_filters" = json_set("job_filters", '$.budgetMinHourly', 15)
WHERE "job_filters" IS NOT NULL AND json_type("job_filters", '$.budgetMinHourly') IS NULL;
