#!/usr/bin/env bash
# ==============================================================================
# Dodik Tracker - Restoration Script (Database & Uploads)
# Safely restores a PostgreSQL database or user uploads from backup
# Supports interactive confirmation (CLI) and explicit non-interactive token (Admin API)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

BACKUP_DIR="$PROJECT_ROOT/backups"
DB_BACKUP_DIR="$BACKUP_DIR/db"
UPLOADS_BACKUP_DIR="${UPLOADS_BACKUP_DIR:-$BACKUP_DIR/uploads}"
UPLOADS_DIR="${UPLOADS_DIR:-$PROJECT_ROOT/public/uploads}"

BACKUP_FILE="${1:-}"

# Read environment variables safely
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

DB_NAME="${SQL_DB_NAME:-${PGDATABASE:-dodik_tracker}}"
DB_USER="${SQL_ADMIN_USER:-${SQL_USER:-${PGUSER:-postgres}}}"
DB_HOST="${SQL_HOST:-${PGHOST:-localhost}}"
DB_PORT="${SQL_PORT:-${PGPORT:-5432}}"
DB_PASS="${SQL_ADMIN_PASSWORD:-${SQL_PASSWORD:-${PGPASSWORD:-}}}"

echo "=================================================="
echo "  Dodik Tracker - Safe Restore Tool"
echo "=================================================="

# If no backup file provided, show list of available backups using the manager
if [ -z "$BACKUP_FILE" ]; then
  if [ -f "$PROJECT_ROOT/scripts/backup.sh" ]; then
    bash "$PROJECT_ROOT/scripts/backup.sh" list
  else
    echo "Available backups in $BACKUP_DIR/:"
    ls -1t "$BACKUP_DIR"/* 2>/dev/null || echo "No backups found."
  fi
  echo ""
  echo "Please specify a backup file to restore."
  echo "Usage: ./scripts/restore.sh <path_to_backup.sql|path_to_uploads.tar.gz> [--confirm]"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Backup file '$BACKUP_FILE' does not exist." >&2
  exit 1
fi

# Detect backup type (Database SQL vs Uploads Archive)
BACKUP_TYPE="database"
if [[ "$BACKUP_FILE" =~ \.tar\.gz$ ]] || [[ "$BACKUP_FILE" =~ uploads_ ]]; then
  BACKUP_TYPE="uploads"
fi

echo "Backup Type: $BACKUP_TYPE"
echo "Backup File: $BACKUP_FILE"
if [ "$BACKUP_TYPE" = "database" ]; then
  echo "Target Database: $DB_NAME"
else
  echo "Target Uploads:  $UPLOADS_DIR"
fi
echo ""

# Explicit confirmation detection
CONFIRMED=0
for arg in "$@"; do
  if [ "$arg" = "--confirm" ] || [ "$arg" = "--yes" ] || [ "$arg" = "-y" ]; then
    CONFIRMED=1
  fi
done

if [ "${CONFIRM_RESTORE:-}" = "yes" ] || [ "${FORCE:-0}" = "1" ]; then
  CONFIRMED=1
fi

if [ $CONFIRMED -ne 1 ]; then
  if [ -t 0 ]; then
    if [ "$BACKUP_TYPE" = "database" ]; then
      echo "⚠️  WARNING: Restoring database will overwrite existing data with the contents of the backup!"
    else
      echo "⚠️  WARNING: Restoring uploads will overwrite files in $UPLOADS_DIR with the contents of the archive!"
    fi
    read -r -p "Are you sure you want to proceed? (type 'yes' to confirm): " USER_INPUT
    if [ "$USER_INPUT" != "yes" ]; then
      echo "Restoration cancelled by user."
      exit 0
    fi
  else
    echo "❌ Error: Restore in non-interactive environment requires explicit confirmation." >&2
    echo "Pass '--confirm' or set 'CONFIRM_RESTORE=yes' to execute." >&2
    exit 1
  fi
fi

if [ "$BACKUP_TYPE" = "uploads" ]; then
  echo "[Restore:Uploads] Restoring user uploaded files into $UPLOADS_DIR..."
  mkdir -p "$UPLOADS_DIR/audio" "$UPLOADS_DIR/covers"
  
  if tar -xzf "$BACKUP_FILE" -C "$UPLOADS_DIR"; then
    echo ""
    echo "✅ Uploads successfully restored from $BACKUP_FILE"
    echo "   Audio files:  $(find "$UPLOADS_DIR/audio" -type f ! -name ".gitkeep" | wc -l)"
    echo "   Cover files:  $(find "$UPLOADS_DIR/covers" -type f ! -name ".gitkeep" | wc -l)"
    echo "=================================================="
    exit 0
  else
    echo "❌ Error: Failed to unpack uploads archive!" >&2
    exit 1
  fi
fi

echo "[Restore:DB] Starting database restore..."
RESTORE_SUCCESS=0

# 1. Native psql (preferred)
if command -v psql &>/dev/null; then
  echo "[Restore:DB] Using native psql..."
  if [ -n "${DATABASE_URL:-}" ]; then
    if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$BACKUP_FILE"; then
      RESTORE_SUCCESS=1
    fi
  else
    if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$BACKUP_FILE"; then
      RESTORE_SUCCESS=1
    fi
  fi
fi

# 2. Docker Compose fallback if native psql is unavailable or failed
if [ $RESTORE_SUCCESS -eq 0 ]; then
  if command -v docker &>/dev/null && docker compose ps &>/dev/null; then
    if docker compose ps --services --filter "status=running" 2>/dev/null | grep -qE "^(postgres|db)$"; then
      SERVICE_NAME=$(docker compose ps --services --filter "status=running" | grep -E "^(postgres|db)$" | head -n 1)
      echo "[Restore:DB] Restoring through Docker Compose service: '$SERVICE_NAME'..."
      if docker compose exec -T "$SERVICE_NAME" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$BACKUP_FILE"; then
        RESTORE_SUCCESS=1
      fi
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
  echo "❌ Error: Database restore failed! Check database credentials and connection." >&2
  echo "==================================================" >&2
  exit 1
fi
