#!/bin/bash
set -e

# Config
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/dodik_tracker_backup_$TIMESTAMP.sql"

# Read DB vars from .env (fallback to defaults if not set)
source .env 2>/dev/null || true
PGUSER=${SQL_ADMIN_USER:-postgres}
PGDATABASE=${SQL_DB_NAME:-dodik_tracker}
PGHOST=${SQL_HOST:-localhost}

echo "Starting backup of $PGDATABASE from $PGHOST..."

# We assume running through docker-compose
if command -v docker-compose &> /dev/null; then
  DOCKER_CMD="docker-compose"
elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
  DOCKER_CMD="docker compose"
else
  echo "Docker Compose not found. Trying local pg_dump..."
  PGPASSWORD=$SQL_ADMIN_PASSWORD pg_dump -h $PGHOST -U $PGUSER $PGDATABASE > "$BACKUP_FILE"
  echo "Backup successful: $BACKUP_FILE"
  exit 0
fi

# Run via Docker Compose
$DOCKER_CMD exec -T postgres pg_dump -U $PGUSER $PGDATABASE > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "Backup successful: $BACKUP_FILE"
else
  echo "Backup failed!"
  rm -f "$BACKUP_FILE"
  exit 1
fi
