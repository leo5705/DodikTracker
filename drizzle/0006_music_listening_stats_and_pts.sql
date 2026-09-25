-- Dodik Tracker Music Listening Stats and PTS Ledger Migration

-- 1. Add listen_count to music_releases and music_tracks
ALTER TABLE "music_releases" ADD COLUMN IF NOT EXISTS "listen_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "music_tracks" ADD COLUMN IF NOT EXISTS "listen_count" integer NOT NULL DEFAULT 0;

-- 2. Playback Sessions table
CREATE TABLE IF NOT EXISTS "music_playback_sessions" (
  "id" serial PRIMARY KEY,
  "playback_session_id" text NOT NULL UNIQUE,
  "track_id" integer NOT NULL REFERENCES "music_tracks"("id") ON DELETE CASCADE,
  "release_id" integer NOT NULL REFERENCES "music_releases"("id") ON DELETE CASCADE,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "session_identifier" text,
  "is_consumed" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "music_playback_sessions_session_id_idx" ON "music_playback_sessions"("playback_session_id");
CREATE INDEX IF NOT EXISTS "music_playback_sessions_track_id_idx" ON "music_playback_sessions"("track_id");

-- 3. Music Listens Table (Real Qualified Listens & History)
CREATE TABLE IF NOT EXISTS "music_listens" (
  "id" serial PRIMARY KEY,
  "track_id" integer NOT NULL REFERENCES "music_tracks"("id") ON DELETE CASCADE,
  "release_id" integer NOT NULL REFERENCES "music_releases"("id") ON DELETE CASCADE,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "session_identifier" text,
  "playback_session_id" text NOT NULL,
  "duration_played" integer,
  "is_eligible" boolean NOT NULL DEFAULT false,
  "is_author" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "qualified_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "music_listens_track_id_idx" ON "music_listens"("track_id");
CREATE INDEX IF NOT EXISTS "music_listens_release_id_idx" ON "music_listens"("release_id");
CREATE INDEX IF NOT EXISTS "music_listens_user_id_idx" ON "music_listens"("user_id");
CREATE INDEX IF NOT EXISTS "music_listens_created_at_idx" ON "music_listens"("created_at");
CREATE INDEX IF NOT EXISTS "music_listens_track_user_created_idx" ON "music_listens"("track_id", "user_id", "created_at");
CREATE INDEX IF NOT EXISTS "music_listens_track_session_created_idx" ON "music_listens"("track_id", "session_identifier", "created_at");
CREATE INDEX IF NOT EXISTS "music_listens_release_eligible_idx" ON "music_listens"("release_id", "is_eligible", "created_at");

-- 4. PTS Transactions (Ledger Model)
CREATE TABLE IF NOT EXISTS "pts_transactions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "amount" integer NOT NULL,
  "type" text NOT NULL,
  "source" text NOT NULL,
  "reference_id" text UNIQUE,
  "description" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pts_transactions_user_id_idx" ON "pts_transactions"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pts_transactions_reference_id_idx" ON "pts_transactions"("reference_id");
CREATE INDEX IF NOT EXISTS "pts_transactions_type_idx" ON "pts_transactions"("type");
