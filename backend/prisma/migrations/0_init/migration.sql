-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "openai_api_key" TEXT,
    "openai_model" TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
    "bid_delay_seconds" REAL NOT NULL DEFAULT 10,
    "schedule_enabled" BOOLEAN NOT NULL DEFAULT false,
    "schedule_timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "schedule_start_time" TEXT,
    "schedule_end_time" TEXT,
    "schedule_days" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "telegram_enabled" BOOLEAN NOT NULL DEFAULT false,
    "telegram_bid_notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
    "telegram_bot_token" TEXT,
    "telegram_chat_id" TEXT,
    "last_message_check_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "freelancer_tokens" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "token_type" TEXT,
    "expires_at" DATETIME NOT NULL,
    "scopes" TEXT,
    "freelancer_uid" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "freelancer_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bidding_profiles" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "search_keywords" TEXT,
    "job_ids" TEXT,
    "budget_min_fixed" REAL,
    "budget_max_fixed" REAL,
    "budget_min_hourly" REAL,
    "budget_max_hourly" REAL,
    "project_types" TEXT NOT NULL DEFAULT 'both',
    "countries" TEXT,
    "excluded_countries" TEXT,
    "excluded_regions" TEXT,
    "country_exceptions" TEXT,
    "languages" TEXT,
    "bid_amount_strategy" TEXT NOT NULL DEFAULT 'auto',
    "fixed_bid_amount" REAL,
    "bid_percentage" REAL,
    "period_days_strategy" TEXT NOT NULL DEFAULT 'fixed',
    "default_period_days" INTEGER NOT NULL DEFAULT 7,
    "default_hourly_rate" REAL,
    "min_period_days" INTEGER,
    "max_period_days" INTEGER,
    "milestone_percentage" INTEGER NOT NULL DEFAULT 100,
    "min_relevance_score" INTEGER NOT NULL DEFAULT 70,
    "proposal_prompt" TEXT,
    "max_bids_per_hour" INTEGER NOT NULL DEFAULT 5,
    "max_bids_per_day" INTEGER NOT NULL DEFAULT 20,
    "skills_summary" TEXT,
    "experience_summary" TEXT,
    "portfolio_highlights" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "bidding_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "projects" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "freelancer_project_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "budget_min" REAL,
    "budget_max" REAL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "job_ids" TEXT,
    "owner_id" INTEGER,
    "owner_country" TEXT,
    "owner_location" TEXT,
    "bid_count" INTEGER NOT NULL DEFAULT 0,
    "time_submitted" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "project_type" TEXT,
    "relevance_score" INTEGER,
    "ai_analysis" TEXT,
    "last_checked_at" DATETIME,
    "discovered_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "bids" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "profile_id" INTEGER,
    "project_id" INTEGER NOT NULL,
    "freelancer_bid_id" INTEGER,
    "amount" REAL NOT NULL,
    "period_days" INTEGER NOT NULL,
    "milestone_percentage" INTEGER NOT NULL DEFAULT 100,
    "proposal_text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "placed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bids_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bids_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "bidding_profiles" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "bids_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "freelancer_tokens_user_id_key" ON "freelancer_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_freelancer_project_id_key" ON "projects"("freelancer_project_id");
