ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "recipient_user_id" integer REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "message" text;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "actor_user_id" integer REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "entity_type" text;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "entity_id" text;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "metadata" text;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "dedup_key" text;
--> statement-breakpoint
UPDATE "notifications" SET
  "recipient_user_id" = COALESCE("recipient_user_id", "user_id"),
  "message" = COALESCE("message", "body"),
  "actor_user_id" = COALESCE("actor_user_id", "sender_id"),
  "entity_type" = COALESCE("entity_type", "related_entity"),
  "entity_id" = COALESCE("entity_id", "related_entity_id"),
  "metadata" = COALESCE("metadata", "metadata_json")
WHERE "recipient_user_id" IS NULL OR "message" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_user_id_idx" ON "notifications" USING btree ("recipient_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_actor_user_id_idx" ON "notifications" USING btree ("actor_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_dedup_key_idx" ON "notifications" USING btree ("dedup_key");
