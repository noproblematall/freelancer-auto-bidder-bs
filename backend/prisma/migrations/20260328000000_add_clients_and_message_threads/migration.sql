CREATE TABLE IF NOT EXISTS "clients" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "freelancer_user_id" INTEGER NOT NULL,
  "display_name" TEXT,
  "username" TEXT,
  "country" TEXT,
  "notes" TEXT,
  "total_value" REAL NOT NULL DEFAULT 0,
  "project_count" INTEGER NOT NULL DEFAULT 0,
  "last_project_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "clients_user_id_freelancer_user_id_key"
  ON "clients"("user_id", "freelancer_user_id");

CREATE TABLE IF NOT EXISTS "message_threads" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "freelancer_thread_id" INTEGER NOT NULL,
  "project_id" INTEGER,
  "client_freelancer_id" INTEGER,
  "last_message_from_client_at" DATETIME,
  "last_message_from_me_at" DATETIME,
  "last_message_text" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "message_threads_user_id_thread_id_key"
  ON "message_threads"("user_id", "freelancer_thread_id");
