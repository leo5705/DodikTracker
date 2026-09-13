import { Pool } from 'pg';

export async function runAutoMigrations(pool: Pool) {
  try {
    const client = await pool.connect();
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
          "type" text NOT NULL,
          "title" text NOT NULL,
          "body" text NOT NULL,
          "content" text,
          "link" text,
          "related_entity" text,
          "related_entity_id" text,
          "sender_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "sender_avatar" text,
          "sender_username" text,
          "metadata_json" text,
          "is_read" boolean NOT NULL DEFAULT false,
          "read_at" timestamp,
          "created_at" timestamp DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications"("user_id");
        CREATE INDEX IF NOT EXISTS "notifications_is_read_idx" ON "notifications"("is_read");

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

        -- 24. Invite Codes Table
        CREATE TABLE IF NOT EXISTS "invite_codes" (
          "id" serial PRIMARY KEY,
          "code" text NOT NULL UNIQUE,
          "creator_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "used_by_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
          "is_used" boolean NOT NULL DEFAULT false,
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
      `);
      console.log('[AutoInit] Database tables and indexes verified successfully.');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[AutoInit] Failed to ensure database tables:', err);
  }
}
