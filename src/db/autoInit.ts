import { Pool } from 'pg';

export async function runAutoMigrations(pool: Pool) {
  let adminPool: Pool | null = null;
  try {
    if (process.env.SQL_ADMIN_USER && process.env.SQL_ADMIN_PASSWORD) {
      adminPool = new Pool({
        host: process.env.SQL_HOST || 'localhost',
        port: parseInt(process.env.SQL_PORT || '5432', 10),
        user: process.env.SQL_ADMIN_USER,
        password: String(process.env.SQL_ADMIN_PASSWORD),
        database: process.env.SQL_DB_NAME,
        max: 1,
      });
    }

    const targetPool = adminPool || pool;
    const client = await targetPool.connect();
    try {
      await client.query(`
        -- 1. Users Table
        CREATE TABLE IF NOT EXISTS "users" (
          "id" serial PRIMARY KEY,
          "uid" text NOT NULL UNIQUE,
          "email" text,
          "username" text NOT NULL UNIQUE,
          "password_hash" text,
          "avatar" text,
          "bio" text,
          "role" text NOT NULL DEFAULT 'USER',
          "is_blocked" boolean NOT NULL DEFAULT false,
          "invites_left" integer NOT NULL DEFAULT 3,
          "profile_visibility" text NOT NULL DEFAULT 'PUBLIC',
          "library_visibility" text NOT NULL DEFAULT 'PUBLIC',
          "activity_visibility" text NOT NULL DEFAULT 'PUBLIC',
          "rating_visibility" text NOT NULL DEFAULT 'PUBLIC',
          "list_visibility" text NOT NULL DEFAULT 'PUBLIC',
          "statistics_visibility" text NOT NULL DEFAULT 'PUBLIC',
          "telegram_chat_id" text,
          "telegram_id" text,
          "telegram_username" text,
          "telegram_auth_code" text,
          "telegram_auth_expires" timestamp,
          "notification_settings" text NOT NULL DEFAULT '{"friendRequests":true,"friendReviews":true,"likes":true,"comments":true,"newReleases":true,"lists":true}',
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 2. Media Table
        CREATE TABLE IF NOT EXISTS "media" (
          "id" serial PRIMARY KEY,
          "type" text NOT NULL,
          "title" text NOT NULL,
          "original_title" text,
          "description" text,
          "poster_url" text,
          "backdrop_url" text,
          "release_date" text,
          "year" integer,
          "genres" text,
          "rating" double precision DEFAULT 0,
          "total_seasons" integer DEFAULT 0,
          "total_episodes" integer DEFAULT 0,
          "total_duration_minutes" integer,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 3. Media External IDs Table
        CREATE TABLE IF NOT EXISTS "media_external_ids" (
          "id" serial PRIMARY KEY,
          "media_id" integer NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
          "provider" text NOT NULL,
          "external_id" text NOT NULL
        );

        -- 4. Seasons Table
        CREATE TABLE IF NOT EXISTS "seasons" (
          "id" serial PRIMARY KEY,
          "media_id" integer NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
          "season_number" integer NOT NULL,
          "title" text,
          "episode_count" integer DEFAULT 0
        );

        -- 5. Episodes Table
        CREATE TABLE IF NOT EXISTS "episodes" (
          "id" serial PRIMARY KEY,
          "season_id" integer NOT NULL REFERENCES "seasons"("id") ON DELETE CASCADE,
          "episode_number" integer NOT NULL,
          "title" text,
          "air_date" text
        );

        -- 6. User Episodes Table
        CREATE TABLE IF NOT EXISTS "user_episodes" (
          "id" serial PRIMARY KEY,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "episode_id" integer NOT NULL REFERENCES "episodes"("id") ON DELETE CASCADE,
          "watched" boolean DEFAULT true,
          "watched_at" timestamp DEFAULT now()
        );

        -- 7. User Media Table
        CREATE TABLE IF NOT EXISTS "user_media" (
          "id" serial PRIMARY KEY,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "media_id" integer NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
          "status" text NOT NULL,
          "progress" integer DEFAULT 0,
          "progress_total" integer DEFAULT 0,
          "rating" integer,
          "is_favorite" boolean DEFAULT false,
          "started_at" timestamp,
          "completed_at" timestamp,
          "notes" text,
          "rewatch_count" integer DEFAULT 0,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 8. Media History Table
        CREATE TABLE IF NOT EXISTS "media_history" (
          "id" serial PRIMARY KEY,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "media_id" integer NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
          "action" text NOT NULL,
          "details" text,
          "created_at" timestamp DEFAULT now()
        );

        -- 9. Friend Requests Table
        CREATE TABLE IF NOT EXISTS "friend_requests" (
          "id" serial PRIMARY KEY,
          "sender_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "receiver_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "status" text NOT NULL DEFAULT 'PENDING',
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 10. Activities Table
        CREATE TABLE IF NOT EXISTS "activities" (
          "id" serial PRIMARY KEY,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "type" text NOT NULL,
          "media_id" integer REFERENCES "media"("id") ON DELETE SET NULL,
          "list_id" integer,
          "tier_list_id" integer,
          "details" text,
          "created_at" timestamp DEFAULT now()
        );

        -- 11. Likes Table
        CREATE TABLE IF NOT EXISTS "likes" (
          "id" serial PRIMARY KEY,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "target_type" text NOT NULL,
          "target_id" integer NOT NULL,
          "created_at" timestamp DEFAULT now()
        );

        -- 12. Comments Table
        CREATE TABLE IF NOT EXISTS "comments" (
          "id" serial PRIMARY KEY,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "target_type" text NOT NULL,
          "target_id" integer NOT NULL,
          "parent_id" integer,
          "content" text NOT NULL,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 13. Lists Table
        CREATE TABLE IF NOT EXISTS "lists" (
          "id" serial PRIMARY KEY,
          "title" text NOT NULL,
          "description" text,
          "category" text NOT NULL DEFAULT 'MOVIES_TV',
          "cover" text,
          "visibility" text NOT NULL DEFAULT 'PUBLIC',
          "owner_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 14. List Items Table
        CREATE TABLE IF NOT EXISTS "list_items" (
          "id" serial PRIMARY KEY,
          "list_id" integer NOT NULL REFERENCES "lists"("id") ON DELETE CASCADE,
          "media_id" integer NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
          "order_index" integer NOT NULL DEFAULT 0,
          "notes" text,
          "added_by_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "created_at" timestamp DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "list_items_list_id_media_id_unq" ON "list_items"("list_id", "media_id");

        -- 15. List Members Table
        CREATE TABLE IF NOT EXISTS "list_members" (
          "id" serial PRIMARY KEY,
          "list_id" integer NOT NULL REFERENCES "lists"("id") ON DELETE CASCADE,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "role" text NOT NULL DEFAULT 'EDITOR',
          "created_at" timestamp DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "list_members_list_id_user_id_unq" ON "list_members"("list_id", "user_id");

        -- 16. List Followers Table
        CREATE TABLE IF NOT EXISTS "list_followers" (
          "id" serial PRIMARY KEY,
          "list_id" integer NOT NULL REFERENCES "lists"("id") ON DELETE CASCADE,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "created_at" timestamp DEFAULT now()
        );

        -- 17. Tier Lists Table
        CREATE TABLE IF NOT EXISTS "tier_lists" (
          "id" serial PRIMARY KEY,
          "title" text NOT NULL,
          "description" text,
          "category" text DEFAULT 'ALL',
          "visibility" text NOT NULL DEFAULT 'PUBLIC',
          "owner_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "tiers_json" text NOT NULL,
          "items_json" text NOT NULL DEFAULT '[]',
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 18. Notifications Table
        CREATE TABLE IF NOT EXISTS "notifications" (
          "id" serial PRIMARY KEY,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "recipient_user_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
          "type" text NOT NULL,
          "title" text NOT NULL,
          "body" text NOT NULL,
          "message" text,
          "content" text,
          "link" text,
          "related_entity" text,
          "entity_type" text,
          "related_entity_id" text,
          "entity_id" text,
          "sender_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "sender_avatar" text,
          "sender_username" text,
          "metadata_json" text,
          "metadata" text,
          "dedup_key" text,
          "is_read" boolean NOT NULL DEFAULT false,
          "read_at" timestamp,
          "created_at" timestamp DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications"("user_id");
        CREATE INDEX IF NOT EXISTS "notifications_is_read_idx" ON "notifications"("is_read");
        CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "notifications"("type");

        -- Direct Messages Table
        CREATE TABLE IF NOT EXISTS "direct_messages" (
          "id" serial PRIMARY KEY,
          "sender_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "receiver_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "content" text NOT NULL,
          "is_read" boolean NOT NULL DEFAULT false,
          "created_at" timestamp DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS "direct_messages_sender_id_idx" ON "direct_messages"("sender_id");
        CREATE INDEX IF NOT EXISTS "direct_messages_receiver_id_idx" ON "direct_messages"("receiver_id");

        -- 19. System Integrations Table
        CREATE TABLE IF NOT EXISTS "system_integrations" (
          "id" serial PRIMARY KEY,
          "provider" text NOT NULL UNIQUE,
          "enabled" boolean NOT NULL DEFAULT false,
          "encrypted_credentials" text NOT NULL,
          "priority" integer NOT NULL DEFAULT 1,
          "settings" text,
          "last_checked_at" timestamp,
          "last_error" text,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 20. System Settings Table
        CREATE TABLE IF NOT EXISTS "system_settings" (
          "id" serial PRIMARY KEY,
          "key" text NOT NULL UNIQUE,
          "value" text NOT NULL,
          "description" text,
          "updated_at" timestamp DEFAULT now()
        );

        -- 21. Admin Audit Logs Table
        CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
          "id" serial PRIMARY KEY,
          "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "action" text NOT NULL,
          "details" text,
          "ip" text,
          "created_at" timestamp DEFAULT now()
        );

        -- 22. API Logs Table
        CREATE TABLE IF NOT EXISTS "api_logs" (
          "id" serial PRIMARY KEY,
          "provider" text NOT NULL,
          "endpoint" text NOT NULL,
          "status" integer NOT NULL,
          "latency_ms" integer NOT NULL,
          "error" text,
          "created_at" timestamp DEFAULT now()
        );

        -- 23. Reviews Table
        CREATE TABLE IF NOT EXISTS "reviews" (
          "id" serial PRIMARY KEY,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "media_id" integer NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
          "rating" integer,
          "title" text,
          "content" text NOT NULL,
          "contains_spoilers" boolean DEFAULT false,
          "likes_count" integer DEFAULT 0,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 23b. Review Reactions Table
        CREATE TABLE IF NOT EXISTS "review_reactions" (
          "id" serial PRIMARY KEY,
          "review_id" integer NOT NULL REFERENCES "reviews"("id") ON DELETE CASCADE,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "type" text NOT NULL DEFAULT 'LIKE',
          "created_at" timestamp DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "review_reactions_review_user_type_unq" ON "review_reactions"("review_id", "user_id", "type");
        CREATE INDEX IF NOT EXISTS "review_reactions_review_id_idx" ON "review_reactions"("review_id");
        CREATE INDEX IF NOT EXISTS "review_reactions_user_id_idx" ON "review_reactions"("user_id");

        -- 24. Invite Codes Table
        CREATE TABLE IF NOT EXISTS "invite_codes" (
          "id" serial PRIMARY KEY,
          "code" text NOT NULL UNIQUE,
          "creator_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "used_by_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "is_used" boolean NOT NULL DEFAULT false,
          "is_active" boolean NOT NULL DEFAULT true,
          "created_at" timestamp DEFAULT now(),
          "used_at" timestamp
        );

        -- 25. Password Reset Tokens Table
        CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
          "id" serial PRIMARY KEY,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "token_hash" text NOT NULL UNIQUE,
          "expires_at" timestamp NOT NULL,
          "used_at" timestamp,
          "created_at" timestamp DEFAULT now()
        );

        -- 26. Game Translations Table
        CREATE TABLE IF NOT EXISTS "game_translations" (
          "id" serial PRIMARY KEY,
          "provider" text NOT NULL,
          "external_id" text NOT NULL,
          "title_original" text NOT NULL,
          "title_ru" text,
          "description_ru" text,
          "genres_ru" text,
          "tags_ru" text,
          "source" text DEFAULT 'OFFICIAL',
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 27. Game Entity Mappings Table
        CREATE TABLE IF NOT EXISTS "game_entity_mappings" (
          "id" serial PRIMARY KEY,
          "entity_type" text NOT NULL,
          "internal_id" text NOT NULL,
          "provider" text NOT NULL,
          "external_id" text NOT NULL,
          "confidence" text DEFAULT 'HIGH',
          "metadata" text,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 28. Game Entity Cache Table
        CREATE TABLE IF NOT EXISTS "game_entity_cache" (
          "id" serial PRIMARY KEY,
          "cache_key" text NOT NULL UNIQUE,
          "entity_type" text NOT NULL,
          "data" text NOT NULL,
          "provider_sources" text,
          "expires_at" timestamp NOT NULL,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 29. Achievements Table
        CREATE TABLE IF NOT EXISTS "achievements" (
          "id" serial PRIMARY KEY,
          "slug" text NOT NULL,
          "title" text NOT NULL,
          "description" text NOT NULL,
          "icon" text NOT NULL DEFAULT 'Trophy',
          "rarity" text NOT NULL DEFAULT 'COMMON',
          "status" text NOT NULL DEFAULT 'ACTIVE',
          "badge_style" text NOT NULL DEFAULT 'purple',
          "is_active" boolean NOT NULL DEFAULT true,
          "condition_type" text NOT NULL,
          "condition_config" text NOT NULL DEFAULT '{}',
          "is_secret" boolean NOT NULL DEFAULT false,
          "points" integer NOT NULL DEFAULT 10,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );

        -- 30. User Achievements Table
        CREATE TABLE IF NOT EXISTS "user_achievements" (
          "id" serial PRIMARY KEY,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "achievement_id" integer NOT NULL REFERENCES "achievements"("id") ON DELETE CASCADE,
          "grant_type" text NOT NULL DEFAULT 'AUTOMATIC',
          "admin_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "reason" text,
          "is_revoked" boolean NOT NULL DEFAULT false,
          "revoked_at" timestamp,
          "revoked_by_admin_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "revoke_reason" text,
          "granted_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "user_achievements_user_id_achievement_id_unq" ON "user_achievements"("user_id", "achievement_id");

        -- 31. Achievement History Table
        CREATE TABLE IF NOT EXISTS "achievement_history" (
          "id" serial PRIMARY KEY,
          "achievement_id" integer NOT NULL REFERENCES "achievements"("id") ON DELETE CASCADE,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "action" text NOT NULL,
          "source" text NOT NULL DEFAULT 'AUTOMATIC',
          "admin_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "reason" text,
          "metadata" text,
          "created_at" timestamp DEFAULT now()
        );

        -- 32. Release Subscriptions Table
        CREATE TABLE IF NOT EXISTS "release_subscriptions" (
          "id" serial PRIMARY KEY,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "media_id" integer NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
          "notified" boolean DEFAULT false,
          "created_at" timestamp DEFAULT now(),
          CONSTRAINT "uq_user_media_release_sub" UNIQUE ("user_id", "media_id")
        );
        CREATE INDEX IF NOT EXISTS "idx_release_sub_user" ON "release_subscriptions"("user_id");
        CREATE INDEX IF NOT EXISTS "idx_release_sub_media" ON "release_subscriptions"("media_id");

        -- 33. Reports (Moderation Queue) Table
        CREATE TABLE IF NOT EXISTS "reports" (
          "id" serial PRIMARY KEY,
          "reporter_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "target_type" text NOT NULL,
          "target_id" text NOT NULL,
          "target_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "reason" text NOT NULL,
          "description" text,
          "status" text NOT NULL DEFAULT 'PENDING',
          "moderator_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "moderator_comment" text,
          "action_taken" text DEFAULT 'NONE',
          "resolved_at" timestamp,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports"("status");
        CREATE INDEX IF NOT EXISTS "reports_target_type_idx" ON "reports"("target_type");
        CREATE INDEX IF NOT EXISTS "reports_target_user_id_idx" ON "reports"("target_user_id");
        CREATE INDEX IF NOT EXISTS "reports_created_at_idx" ON "reports"("created_at");

        -- 33.1 Report / Feedback Replies Table
        CREATE TABLE IF NOT EXISTS "report_replies" (
          "id" serial PRIMARY KEY,
          "report_id" integer NOT NULL REFERENCES "reports"("id") ON DELETE CASCADE,
          "author_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "message" text NOT NULL,
          "is_admin_response" boolean NOT NULL DEFAULT false,
          "created_at" timestamp DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS "report_replies_report_id_idx" ON "report_replies"("report_id");
        CREATE INDEX IF NOT EXISTS "report_replies_author_idx" ON "report_replies"("author_user_id");
        CREATE INDEX IF NOT EXISTS "report_replies_created_at_idx" ON "report_replies"("created_at");

        -- 34. News (CMS) Table
        CREATE TABLE IF NOT EXISTS "news" (
          "id" serial PRIMARY KEY,
          "slug" text NOT NULL UNIQUE,
          "title" text NOT NULL,
          "excerpt" text,
          "content" text NOT NULL,
          "cover" text,
          "author_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "tags" text NOT NULL DEFAULT '[]',
          "status" text NOT NULL DEFAULT 'DRAFT',
          "is_pinned" boolean NOT NULL DEFAULT false,
          "is_featured" boolean NOT NULL DEFAULT false,
          "published_at" timestamp,
          "scheduled_at" timestamp,
          "views_count" integer NOT NULL DEFAULT 0,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "news_slug_idx" ON "news"("slug");
        CREATE INDEX IF NOT EXISTS "news_status_idx" ON "news"("status");
        CREATE INDEX IF NOT EXISTS "news_published_at_idx" ON "news"("published_at");

        -- 35. Announcements Table
        CREATE TABLE IF NOT EXISTS "announcements" (
          "id" serial PRIMARY KEY,
          "title" text NOT NULL,
          "content" text,
          "message" text NOT NULL,
          "priority" text NOT NULL DEFAULT 'NORMAL',
          "severity" text NOT NULL DEFAULT 'INFO',
          "status" text NOT NULL DEFAULT 'PUBLISHED',
          "target_audience" text NOT NULL DEFAULT 'ALL',
          "is_active" boolean NOT NULL DEFAULT true,
          "published_at" timestamp DEFAULT now(),
          "start_at" timestamp DEFAULT now(),
          "end_at" timestamp,
          "show_banner" boolean NOT NULL DEFAULT true,
          "send_telegram" boolean NOT NULL DEFAULT false,
          "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS "announcements_is_active_idx" ON "announcements"("is_active");
        CREATE INDEX IF NOT EXISTS "announcements_status_idx" ON "announcements"("status");
        CREATE INDEX IF NOT EXISTS "announcements_priority_idx" ON "announcements"("priority");
        CREATE INDEX IF NOT EXISTS "announcements_severity_idx" ON "announcements"("severity");
        CREATE INDEX IF NOT EXISTS "announcements_published_at_idx" ON "announcements"("published_at");

        -- 35b. Announcement Reads Table
        CREATE TABLE IF NOT EXISTS "announcement_reads" (
          "id" serial PRIMARY KEY,
          "announcement_id" integer NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "read_at" timestamp DEFAULT now(),
          CONSTRAINT "announcement_reads_ann_user_unq" UNIQUE ("announcement_id", "user_id")
        );
        CREATE INDEX IF NOT EXISTS "announcement_reads_user_id_idx" ON "announcement_reads"("user_id");
        CREATE INDEX IF NOT EXISTS "announcement_reads_ann_id_idx" ON "announcement_reads"("announcement_id");

        -- 36. Add Missing Columns to existing tables (Idempotent)
        ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "content" text;
        ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "priority" text NOT NULL DEFAULT 'NORMAL';
        ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'PUBLISHED';
        ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "published_at" timestamp;
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned_until" timestamp;
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_reason" text;
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "warning_count" integer NOT NULL DEFAULT 0;
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_warning_reason" text;
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "show_adult_content" boolean NOT NULL DEFAULT false;
        ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "is_hidden" boolean NOT NULL DEFAULT false;
        ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "is_adult" boolean NOT NULL DEFAULT false;
        ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "age_rating" text;
        ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "is_hidden" boolean NOT NULL DEFAULT false;
        ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "is_hidden" boolean NOT NULL DEFAULT false;
        ALTER TABLE "tier_lists" ADD COLUMN IF NOT EXISTS "is_hidden" boolean NOT NULL DEFAULT false;
        ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "is_hidden" boolean NOT NULL DEFAULT false;
        ALTER TABLE "invite_codes" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
        ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "recipient_user_id" integer REFERENCES "users"("id") ON DELETE CASCADE;
        ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "message" text;
        ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL;
        ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "entity_type" text;
        ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "entity_id" text;
        ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "metadata" text;
        ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "dedup_key" text;
      `);

      // 36b. Execute indexes & updates after columns are guaranteed in catalog
      await client.query(`
        CREATE INDEX IF NOT EXISTS "notifications_recipient_user_id_idx" ON "notifications"("recipient_user_id");
        CREATE INDEX IF NOT EXISTS "notifications_actor_user_id_idx" ON "notifications"("actor_user_id");
        CREATE INDEX IF NOT EXISTS "notifications_dedup_key_idx" ON "notifications"("dedup_key");
        CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "notifications"("type");
        UPDATE "notifications" SET
          "recipient_user_id" = COALESCE("recipient_user_id", "user_id"),
          "message" = COALESCE("message", "body"),
          "actor_user_id" = COALESCE("actor_user_id", "sender_id"),
          "entity_type" = COALESCE("entity_type", "related_entity"),
          "entity_id" = COALESCE("entity_id", "related_entity_id"),
          "metadata" = COALESCE("metadata", "metadata_json")
        WHERE "recipient_user_id" IS NULL OR "message" IS NULL;

        -- 37. Deduplicate existing records before applying unique constraints
        UPDATE "tier_lists" SET visibility = 'FRIENDS' WHERE visibility = 'FRIENDS_ONLY';
        UPDATE "lists" SET visibility = 'FRIENDS' WHERE visibility = 'FRIENDS_ONLY';

        DELETE FROM "friend_requests" a USING "friend_requests" b
        WHERE a.id < b.id AND a.sender_id = b.sender_id AND a.receiver_id = b.receiver_id;

        DELETE FROM "user_media" a USING "user_media" b
        WHERE a.id < b.id AND a.user_id = b.user_id AND a.media_id = b.media_id;

        DELETE FROM "likes" a USING "likes" b
        WHERE a.id < b.id AND a.user_id = b.user_id AND a.target_type = b.target_type AND a.target_id = b.target_id;

        -- Apply unique indexes
        CREATE UNIQUE INDEX IF NOT EXISTS "friend_requests_sender_receiver_unq" ON "friend_requests"("sender_id", "receiver_id");
        CREATE UNIQUE INDEX IF NOT EXISTS "user_media_user_media_unq" ON "user_media"("user_id", "media_id");
        CREATE UNIQUE INDEX IF NOT EXISTS "likes_user_target_unq" ON "likes"("user_id", "target_type", "target_id");

        -- 38. Safe Telegram Identity unique index
        -- First, clean any duplicates by keeping the most recently updated account and setting duplicates to NULL
        WITH ranked_tg_dupes AS (
          SELECT id, telegram_id,
                 ROW_NUMBER() OVER(PARTITION BY telegram_id ORDER BY updated_at DESC NULLS LAST, id DESC) as rn
          FROM users
          WHERE telegram_id IS NOT NULL AND telegram_id != ''
        )
        UPDATE users
        SET telegram_id = NULL
        WHERE id IN (
          SELECT id FROM ranked_tg_dupes WHERE rn > 1
        );

        -- Backfill telegram_id from numeric telegram_chat_id for legacy records if telegram_id is null and no conflict exists
        UPDATE users
        SET telegram_id = telegram_chat_id
        WHERE telegram_id IS NULL 
          AND telegram_chat_id IS NOT NULL 
          AND telegram_chat_id ~ '^[0-9]+$'
          AND telegram_chat_id NOT IN (SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL);

        CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_id_unique" ON "users"("telegram_id") WHERE "telegram_id" IS NOT NULL;
      `);
      console.log('[AutoInit] Database tables and indexes verified successfully.');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[AutoInit] Failed to ensure database tables:', err);
  } finally {
    if (adminPool) {
      await adminPool.end().catch(() => {});
    }
  }
}
