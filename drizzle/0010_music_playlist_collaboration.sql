-- Music playlist collaboration
-- Brings existing production schema in sync with src/db/schema.ts

ALTER TABLE "music_playlists"
  ADD COLUMN IF NOT EXISTS "is_collaborative" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "music_playlists_is_collaborative_idx"
  ON "music_playlists"("is_collaborative");

ALTER TABLE "music_playlist_tracks"
  ADD COLUMN IF NOT EXISTS "added_by_user_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'music_playlist_tracks_added_by_user_id_users_fk'
  ) THEN
    ALTER TABLE "music_playlist_tracks"
      ADD CONSTRAINT "music_playlist_tracks_added_by_user_id_users_fk"
      FOREIGN KEY ("added_by_user_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "music_playlist_tracks_added_by_user_id_idx"
  ON "music_playlist_tracks"("added_by_user_id");

CREATE TABLE IF NOT EXISTS "music_playlist_members" (
  "id" serial PRIMARY KEY,
  "playlist_id" integer NOT NULL
    REFERENCES "music_playlists"("id")
    ON DELETE CASCADE,
  "user_id" integer NOT NULL
    REFERENCES "users"("id")
    ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'COLLABORATOR',
  "can_add_tracks" boolean NOT NULL DEFAULT true,
  "can_remove_tracks" boolean NOT NULL DEFAULT false,
  "added_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "music_playlist_members_playlist_id_idx"
  ON "music_playlist_members"("playlist_id");

CREATE INDEX IF NOT EXISTS "music_playlist_members_user_id_idx"
  ON "music_playlist_members"("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "music_playlist_members_unq"
  ON "music_playlist_members"("playlist_id", "user_id");
