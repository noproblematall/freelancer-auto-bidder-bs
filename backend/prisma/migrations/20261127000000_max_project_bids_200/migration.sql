-- Default "Max bids already on a project" raised from 40 to 200: popular
-- projects pass 40 bids within a minute of posting. Move installs still on the
-- old default; an explicitly chosen other value is left as-is.
UPDATE "users" SET "max_project_bids" = 200 WHERE "max_project_bids" = 40;
