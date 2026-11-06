-- Bidding schedule becomes per-day: users.schedule_week holds a window for each
-- weekday. Accounts that customised the old single window keep it, copied onto
-- the days they had selected. Everyone else gets the seeded default (every day
-- except Sunday, 05:00-21:00) with the schedule switched on.
ALTER TABLE "users" ADD COLUMN "schedule_week" TEXT;
UPDATE "users" SET "schedule_week" = json_object(
  '0', json_object('enabled', json(CASE WHEN instr(',' || COALESCE("schedule_days", '') || ',', ',0,') > 0 THEN 'true' ELSE 'false' END), 'start', COALESCE("schedule_start_time", '05:00'), 'end', COALESCE("schedule_end_time", '21:00')),
  '1', json_object('enabled', json(CASE WHEN instr(',' || COALESCE("schedule_days", '') || ',', ',1,') > 0 THEN 'true' ELSE 'false' END), 'start', COALESCE("schedule_start_time", '05:00'), 'end', COALESCE("schedule_end_time", '21:00')),
  '2', json_object('enabled', json(CASE WHEN instr(',' || COALESCE("schedule_days", '') || ',', ',2,') > 0 THEN 'true' ELSE 'false' END), 'start', COALESCE("schedule_start_time", '05:00'), 'end', COALESCE("schedule_end_time", '21:00')),
  '3', json_object('enabled', json(CASE WHEN instr(',' || COALESCE("schedule_days", '') || ',', ',3,') > 0 THEN 'true' ELSE 'false' END), 'start', COALESCE("schedule_start_time", '05:00'), 'end', COALESCE("schedule_end_time", '21:00')),
  '4', json_object('enabled', json(CASE WHEN instr(',' || COALESCE("schedule_days", '') || ',', ',4,') > 0 THEN 'true' ELSE 'false' END), 'start', COALESCE("schedule_start_time", '05:00'), 'end', COALESCE("schedule_end_time", '21:00')),
  '5', json_object('enabled', json(CASE WHEN instr(',' || COALESCE("schedule_days", '') || ',', ',5,') > 0 THEN 'true' ELSE 'false' END), 'start', COALESCE("schedule_start_time", '05:00'), 'end', COALESCE("schedule_end_time", '21:00')),
  '6', json_object('enabled', json(CASE WHEN instr(',' || COALESCE("schedule_days", '') || ',', ',6,') > 0 THEN 'true' ELSE 'false' END), 'start', COALESCE("schedule_start_time", '05:00'), 'end', COALESCE("schedule_end_time", '21:00'))
)
WHERE "schedule_week" IS NULL
  AND ("schedule_start_time" IS NOT NULL OR "schedule_end_time" IS NOT NULL OR COALESCE("schedule_days", '1,2,3,4,5') <> '1,2,3,4,5');
UPDATE "users" SET "schedule_week" = '{"0":{"enabled":false,"start":"05:00","end":"21:00"},"1":{"enabled":true,"start":"05:00","end":"21:00"},"2":{"enabled":true,"start":"05:00","end":"21:00"},"3":{"enabled":true,"start":"05:00","end":"21:00"},"4":{"enabled":true,"start":"05:00","end":"21:00"},"5":{"enabled":true,"start":"05:00","end":"21:00"},"6":{"enabled":true,"start":"05:00","end":"21:00"}}', "schedule_enabled" = 1
WHERE "schedule_week" IS NULL;
