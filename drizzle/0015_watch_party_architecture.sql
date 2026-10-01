-- Dodik Tracker Watch Party Schema Migration
CREATE TABLE IF NOT EXISTS "watch_party_rooms" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "title" text NOT NULL,
  "media_id" integer REFERENCES "media"("id") ON DELETE set null,
  "media_type" text NOT NULL DEFAULT 'MOVIE',
  "season_number" integer,
  "episode_number" integer,
  "host_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "source_type" text NOT NULL DEFAULT 'DIRECT',
  "source_url" text,
  "source_config" text,
  "media_metadata" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "privacy" text NOT NULL DEFAULT 'PUBLIC',
  "passcode_hash" text,
  "playback_state" text NOT NULL DEFAULT 'PAUSED',
  "last_current_time" double precision NOT NULL DEFAULT 0,
  "last_duration" double precision NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "closed_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "watch_party_rooms_code_idx"
  ON "watch_party_rooms" ("code");

CREATE INDEX IF NOT EXISTS "watch_party_rooms_host_idx"
  ON "watch_party_rooms" ("host_user_id");

CREATE INDEX IF NOT EXISTS "watch_party_rooms_status_idx"
  ON "watch_party_rooms" ("status");

CREATE INDEX IF NOT EXISTS "watch_party_rooms_media_idx"
  ON "watch_party_rooms" ("media_id");

CREATE INDEX IF NOT EXISTS "watch_party_rooms_created_at_idx"
  ON "watch_party_rooms" ("created_at");

CREATE TABLE IF NOT EXISTS "watch_party_members" (
  "id" serial PRIMARY KEY NOT NULL,
  "room_id" integer NOT NULL REFERENCES "watch_party_rooms"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" text NOT NULL DEFAULT 'MEMBER',
  "is_banned" boolean NOT NULL DEFAULT false,
  "joined_at" timestamp DEFAULT now(),
  "last_seen_at" timestamp DEFAULT now(),
  "left_at" timestamp
);

CREATE INDEX IF NOT EXISTS "watch_party_members_room_idx"
  ON "watch_party_members" ("room_id");

CREATE INDEX IF NOT EXISTS "watch_party_members_user_idx"
  ON "watch_party_members" ("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "watch_party_members_room_user_unq"
  ON "watch_party_members" ("room_id", "user_id");

CREATE TABLE IF NOT EXISTS "watch_party_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "room_id" integer NOT NULL REFERENCES "watch_party_rooms"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "type" text NOT NULL DEFAULT 'TEXT',
  "content" text NOT NULL,
  "playback_timestamp" double precision,
  "metadata" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "watch_party_messages_room_idx"
  ON "watch_party_messages" ("room_id");

CREATE INDEX IF NOT EXISTS "watch_party_messages_user_idx"
  ON "watch_party_messages" ("user_id");

CREATE INDEX IF NOT EXISTS "watch_party_messages_created_at_idx"
  ON "watch_party_messages" ("created_at");
