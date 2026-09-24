-- Add rejection_reason, reviewed_by, and reviewed_at columns to music_releases table
ALTER TABLE "music_releases" ADD COLUMN IF NOT EXISTS "rejection_reason" text;
ALTER TABLE "music_releases" ADD COLUMN IF NOT EXISTS "reviewed_by" integer REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "music_releases" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;
