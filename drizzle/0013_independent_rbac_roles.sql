-- Migration 0013: Independent RBAC Roles Support
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roles" text NOT NULL DEFAULT '["user"]';

UPDATE "users" SET "roles" = 
  CASE 
    WHEN LOWER("role") = 'super_admin' THEN '["user", "super_admin"]'
    WHEN LOWER("role") = 'admin' THEN '["user", "admin"]'
    WHEN LOWER("role") = 'moderator' THEN '["user", "moderator"]'
    WHEN LOWER("role") = 'news_editor' THEN '["user", "news_editor"]'
    WHEN LOWER("role") = 'content_manager' THEN '["user", "content_manager"]'
    WHEN LOWER("role") = 'musician' THEN '["user", "musician"]'
    ELSE '["user"]'
  END
WHERE "roles" IS NULL OR "roles" = '["user"]' OR "roles" = '["USER"]';
