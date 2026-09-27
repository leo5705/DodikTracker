-- Artist Subscriptions Migration

CREATE TABLE IF NOT EXISTS "artist_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "artist_id" integer REFERENCES "artist_profiles"("id") ON DELETE CASCADE,
  "provider" text,
  "external_artist_id" text,
  "external_artist_name" text,
  "external_artist_avatar" text,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "artist_sub_dodik_unq" UNIQUE ("user_id", "artist_id"),
  CONSTRAINT "artist_sub_ext_unq" UNIQUE ("user_id", "provider", "external_artist_id")
);

CREATE INDEX IF NOT EXISTS "artist_sub_user_id_idx" ON "artist_subscriptions"("user_id");
CREATE INDEX IF NOT EXISTS "artist_sub_artist_id_idx" ON "artist_subscriptions"("artist_id");
