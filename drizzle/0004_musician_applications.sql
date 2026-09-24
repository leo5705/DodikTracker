-- Dodik Tracker Musician Applications Table
CREATE TABLE IF NOT EXISTS "musician_applications" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'PENDING',
  "message" text,
  "reviewed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "rejection_reason" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "musician_applications_user_id_idx" ON "musician_applications"("user_id");
CREATE INDEX IF NOT EXISTS "musician_applications_status_idx" ON "musician_applications"("status");
