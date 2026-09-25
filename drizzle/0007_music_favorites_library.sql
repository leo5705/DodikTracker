-- Dodik Tracker Music Favorites and Library Migration

-- 1. Music Favorite Releases Table
CREATE TABLE IF NOT EXISTS "music_favorite_releases" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "release_id" integer NOT NULL REFERENCES "music_releases"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "music_favorite_releases_user_release_unq" UNIQUE ("user_id", "release_id")
);

CREATE INDEX IF NOT EXISTS "music_favorite_releases_user_id_idx" ON "music_favorite_releases"("user_id");
CREATE INDEX IF NOT EXISTS "music_favorite_releases_release_id_idx" ON "music_favorite_releases"("release_id");
CREATE INDEX IF NOT EXISTS "music_favorite_releases_created_at_idx" ON "music_favorite_releases"("created_at");

-- 2. Music Favorite Tracks Table
CREATE TABLE IF NOT EXISTS "music_favorite_tracks" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "track_id" integer NOT NULL REFERENCES "music_tracks"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "music_favorite_tracks_user_track_unq" UNIQUE ("user_id", "track_id")
);

CREATE INDEX IF NOT EXISTS "music_favorite_tracks_user_id_idx" ON "music_favorite_tracks"("user_id");
CREATE INDEX IF NOT EXISTS "music_favorite_tracks_track_id_idx" ON "music_favorite_tracks"("track_id");
CREATE INDEX IF NOT EXISTS "music_favorite_tracks_created_at_idx" ON "music_favorite_tracks"("created_at");
