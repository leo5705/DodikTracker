-- Dodik Tracker Music Module Migration
CREATE TABLE IF NOT EXISTS "artist_profiles" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "stage_name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "avatar" text,
  "description" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "artist_profiles_user_id_idx" ON "artist_profiles"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "artist_profiles_slug_idx" ON "artist_profiles"("slug");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "music_genres" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL UNIQUE,
  "slug" text NOT NULL UNIQUE,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "music_genres_slug_idx" ON "music_genres"("slug");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "music_releases" (
  "id" serial PRIMARY KEY,
  "artist_id" integer NOT NULL REFERENCES "artist_profiles"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "type" text NOT NULL,
  "description" text,
  "cover" text,
  "release_date" text,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "music_releases_artist_id_idx" ON "music_releases"("artist_id");
CREATE UNIQUE INDEX IF NOT EXISTS "music_releases_slug_idx" ON "music_releases"("slug");
CREATE INDEX IF NOT EXISTS "music_releases_status_idx" ON "music_releases"("status");
CREATE INDEX IF NOT EXISTS "music_releases_type_idx" ON "music_releases"("type");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "music_release_genres" (
  "id" serial PRIMARY KEY,
  "release_id" integer NOT NULL REFERENCES "music_releases"("id") ON DELETE CASCADE,
  "genre_id" integer NOT NULL REFERENCES "music_genres"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "music_release_genres_unq" ON "music_release_genres"("release_id", "genre_id");
CREATE INDEX IF NOT EXISTS "music_release_genres_release_id_idx" ON "music_release_genres"("release_id");
CREATE INDEX IF NOT EXISTS "music_release_genres_genre_id_idx" ON "music_release_genres"("genre_id");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "music_tracks" (
  "id" serial PRIMARY KEY,
  "release_id" integer NOT NULL REFERENCES "music_releases"("id") ON DELETE CASCADE,
  "artist_id" integer NOT NULL REFERENCES "artist_profiles"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "slug" text,
  "track_number" integer NOT NULL DEFAULT 1,
  "audio_file" text NOT NULL,
  "duration" integer,
  "lyrics" text,
  "author_note" text,
  "explicit" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'PUBLISHED',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "music_tracks_release_id_idx" ON "music_tracks"("release_id");
CREATE INDEX IF NOT EXISTS "music_tracks_artist_id_idx" ON "music_tracks"("artist_id");
CREATE INDEX IF NOT EXISTS "music_tracks_release_track_no_idx" ON "music_tracks"("release_id", "track_number");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "music_reviews" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "release_id" integer NOT NULL REFERENCES "music_releases"("id") ON DELETE CASCADE,
  "music_score" integer NOT NULL,
  "performance_score" integer NOT NULL,
  "production_score" integer NOT NULL,
  "lyrics_score" integer NOT NULL,
  "atmosphere_score" integer NOT NULL,
  "cohesion_score" integer NOT NULL,
  "overall_score" double precision NOT NULL,
  "text" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "music_reviews_user_release_unq" ON "music_reviews"("user_id", "release_id");
CREATE INDEX IF NOT EXISTS "music_reviews_release_id_idx" ON "music_reviews"("release_id");
CREATE INDEX IF NOT EXISTS "music_reviews_user_id_idx" ON "music_reviews"("user_id");
