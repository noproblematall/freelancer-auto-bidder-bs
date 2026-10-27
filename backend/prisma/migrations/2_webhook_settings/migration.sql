-- User-configurable webhook: fires a POST to webhook_url on new incoming
-- Freelancer messages when webhook_enabled is on (see Settings → Webhook).
ALTER TABLE "users" ADD COLUMN "webhook_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "webhook_url" TEXT;
