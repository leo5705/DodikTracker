-- Sync user music listening history with current application schema.
ALTER TABLE "user_music_history"
  ADD COLUMN IF NOT EXISTS "played_seconds" integer;

ALTER TABLE "user_music_history"
  ADD COLUMN IF NOT EXISTS "completion_ratio" double precision;

ALTER TABLE "user_music_history"
  ADD COLUMN IF NOT EXISTS "is_completed" boolean NOT NULL DEFAULT false;

ALTER TABLE "user_music_history"
  ADD COLUMN IF NOT EXISTS "is_skipped" boolean NOT NULL DEFAULT false;

ALTER TABLE "user_music_history"
  ADD COLUMN IF NOT EXISTS "is_quick_skip" boolean NOT NULL DEFAULT false;

ALTER TABLE "user_music_history"
  ADD COLUMN IF NOT EXISTS "context_source" text;

ALTER TABLE "user_music_history"
  ADD COLUMN IF NOT EXISTS "from_track_id" text;

CREATE INDEX IF NOT EXISTS "user_music_history_user_artist_idx"
  ON "user_music_history" ("user_id", "artist_id");

-- Track-to-track transition graph used by music recommendations.
CREATE TABLE IF NOT EXISTS "music_track_transitions" (
  "id" serial PRIMARY KEY NOT NULL,
  "from_track_id" text NOT NULL,
  "to_track_id" text NOT NULL,
  "from_artist_name" text,
  "to_artist_name" text,
  "transition_count" integer NOT NULL DEFAULT 1,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "music_track_transitions_from_track_idx"
  ON "music_track_transitions" ("from_track_id");

CREATE INDEX IF NOT EXISTS "music_track_transitions_to_track_idx"
  ON "music_track_transitions" ("to_track_id");

CREATE UNIQUE INDEX IF NOT EXISTS "music_track_transitions_from_to_unq"
  ON "music_track_transitions" ("from_track_id", "to_track_id");
