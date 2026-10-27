-- Shared profile settings (JSON): targeting rules and AI context applied to every bidding profile
ALTER TABLE "users" ADD COLUMN "shared_profile" TEXT;
