-- Migration 0012: Allow user_id in artist_profiles to be NULL for external artists
ALTER TABLE "artist_profiles" ALTER COLUMN "user_id" DROP NOT NULL;
