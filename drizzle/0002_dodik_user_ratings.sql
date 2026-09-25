-- Dodik Tracker Unified User Rating System (0-100 scale)
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "dodik_rating" double precision;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "dodik_rating_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_dodik_rating_idx" ON "media"("dodik_rating");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_dodik_rating_count_idx" ON "media"("dodik_rating_count");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "media_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"media_id" integer NOT NULL REFERENCES "media"("id") ON DELETE cascade,
	"rating" double precision NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "media_ratings_user_media_unq" UNIQUE("user_id","media_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_ratings_media_id_idx" ON "media_ratings"("media_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_ratings_user_id_idx" ON "media_ratings"("user_id");
--> statement-breakpoint

-- Data migration: convert 1-10 scale ratings to 0-100 scale (* 10)
UPDATE "user_media" SET rating = rating * 10 WHERE rating IS NOT NULL AND rating <= 10;
--> statement-breakpoint
UPDATE "reviews" SET rating = rating * 10 WHERE rating IS NOT NULL AND rating <= 10;
--> statement-breakpoint
UPDATE "media_ratings" SET rating = ROUND(rating * 10) WHERE rating <= 10;
--> statement-breakpoint

-- Sync user_media ratings into media_ratings
INSERT INTO "media_ratings" ("user_id", "media_id", "rating", "created_at", "updated_at")
SELECT um.user_id, um.media_id, um.rating, COALESCE(um.created_at, now()), COALESCE(um.updated_at, now())
FROM "user_media" um
WHERE um.rating IS NOT NULL
ON CONFLICT ("user_id", "media_id") DO UPDATE
SET rating = EXCLUDED.rating;
--> statement-breakpoint

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

