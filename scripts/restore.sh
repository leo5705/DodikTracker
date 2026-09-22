#!/usr/bin/env bash
# ==============================================================================
# Dodik Tracker - Database Restoration Script
# Safely restores a PostgreSQL database from a SQL backup file
# ==============================================================================

set -eo pipefail

BACKUP_DIR="./backups"
BACKUP_FILE="$1"

# Read environment variables if .env exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs -0 2>/dev/null) || true
fi

DB_NAME="${SQL_DB_NAME:-${PGDATABASE:-dodik_tracker}}"
DB_USER="${SQL_ADMIN_USER:-${SQL_USER:-${PGUSER:-postgres}}}"
DB_HOST="${SQL_HOST:-${PGHOST:-localhost}}"
DB_PORT="${SQL_PORT:-${PGPORT:-5432}}"
DB_PASS="${SQL_ADMIN_PASSWORD:-${SQL_PASSWORD:-${PGPASSWORD:-}}}"

echo "=================================================="
echo "  Dodik Tracker - Database Restore Tool"
echo "=================================================="

# If no backup file provided, show list of available backups
if [ -z "$BACKUP_FILE" ]; then
  if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR"/*.sql 2>/dev/null)" ]; then
    echo "❌ No backup files found in $BACKUP_DIR/"
    echo "Usage: ./scripts/restore.sh <path_to_backup.sql>"
    exit 1
  fi

  echo "Available backups in $BACKUP_DIR/:"
  ls -1t "$BACKUP_DIR"/*.sql
  echo ""
  echo "Please specify a backup file to restore."
  echo "Usage: ./scripts/restore.sh $BACKUP_DIR/dodik_tracker_backup_YYYYMMDD_HHMMSS.sql"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Backup file '$BACKUP_FILE' does not exist."
  exit 1
fi

echo "Target Database: $DB_NAME"
echo "Backup File:     $BACKUP_FILE"
echo ""
echo "⚠️  WARNING: Restoring will overwrite existing data with the contents of the backup!"
read -p "Are you sure you want to proceed with database restore? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Restoration cancelled by user."
  exit 0
fi

echo ""
echo "[Restore] Starting database restore..."

RESTORE_SUCCESS=0

# 1. Try Docker Compose if running
if command -v docker &>/dev/null && docker compose ps &>/dev/null; then
  if docker compose ps --services --filter "status=running" 2>/dev/null | grep -qE "^(postgres|db)$"; then
    SERVICE_NAME=$(docker compose ps --services --filter "status=running" | grep -E "^(postgres|db)$" | head -n 1)
    echo "[Restore] Restoring through Docker Compose service: '$SERVICE_NAME'..."
    if docker compose exec -T "$SERVICE_NAME" psql -U "$DB_USER" -d "$DB_NAME" < "$BACKUP_FILE"; then
      RESTORE_SUCCESS=1
    fi
  fi
fi

# 2. Fallback to native psql
if [ $RESTORE_SUCCESS -eq 0 ]; then
  if command -v psql &>/dev/null; then
    echo "[Restore] Using native psql..."
    if [ -n "$DATABASE_URL" ]; then
      psql "$DATABASE_URL" < "$BACKUP_FILE" && RESTORE_SUCCESS=1
    else
      PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$BACKUP_FILE" && RESTORE_SUCCESS=1
    fi
  fi
fi

if [ $RESTORE_SUCCESS -eq 1 ]; then
  echo ""
  echo "✅ Database successfully restored from $BACKUP_FILE"
  echo "=================================================="
  exit 0
else
  echo ""
  echo "❌ Database restore failed! Check database credentials and connection."
  echo "=================================================="
  exit 1
fi
