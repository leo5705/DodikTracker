-- Dodik Tracker Unified User Rating System (0-100 scale)
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "dodik_rating" double precision;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "dodik_rating_count" integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "media_dodik_rating_idx" ON "media"("dodik_rating");
CREATE INDEX IF NOT EXISTS "media_dodik_rating_count_idx" ON "media"("dodik_rating_count");

-- Data migration: convert 1-10 scale ratings to 0-100 scale (* 10)
UPDATE "user_media" SET rating = rating * 10 WHERE rating IS NOT NULL AND rating <= 10;
UPDATE "reviews" SET rating = rating * 10 WHERE rating IS NOT NULL AND rating <= 10;
UPDATE "media_ratings" SET rating = ROUND(rating * 10) WHERE rating <= 10;

-- Sync user_media ratings into media_ratings
INSERT INTO "media_ratings" ("user_id", "media_id", "rating", "created_at", "updated_at")
SELECT um.user_id, um.media_id, um.rating, COALESCE(um.created_at, now()), COALESCE(um.updated_at, now())
FROM "user_media" um
WHERE um.rating IS NOT NULL
ON CONFLICT ("user_id", "media_id") DO UPDATE
SET rating = EXCLUDED.rating;

-- Recalculate Dodik community score and vote count for all media
UPDATE "media" m
SET
  "dodik_rating" = sub.avg_rating,
  "dodik_rating_count" = sub.cnt
FROM (
  SELECT media_id,
         ROUND(AVG(rating)::numeric, 1) as avg_rating,
         COUNT(*)::integer as cnt
  FROM "media_ratings"
  GROUP BY media_id
) sub
WHERE m.id = sub.media_id;
