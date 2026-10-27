-- Default bid delay raised from 10s to 30s. Move installs still on the old default;
-- an explicitly chosen other value is left as-is.
UPDATE "users" SET "bid_delay_seconds" = 30 WHERE "bid_delay_seconds" = 10;
