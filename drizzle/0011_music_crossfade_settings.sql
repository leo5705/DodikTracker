-- Add music player crossfade settings to users
-- Keeps production database in sync with src/db/schema.ts

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "music_crossfade_enabled"
    boolean NOT NULL DEFAULT false;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "music_crossfade_duration"
    integer NOT NULL DEFAULT 4;
