ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "music_lyrics_provider" text DEFAULT 'auto' NOT NULL;
