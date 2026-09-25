#!/usr/bin/env bash
# ==============================================================================
# Dodik Tracker - Unified PostgreSQL Backup Manager
# Used by:
#   1. `npm run backup` (CLI manual execution)
#   2. `npm run update` / `scripts/update.sh` (Pre-update automated backup)
#   3. Future Admin Panel Backend API (via script invocation or `backup:list`)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

BACKUP_DIR="$PROJECT_ROOT/backups"
mkdir -p "$BACKUP_DIR"

# 1. Load environment variables safely
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# 2. Extract sanitized database name without exposing credentials
get_db_name() {
  if [ -n "${SQL_DB_NAME:-}" ]; then
    echo "$SQL_DB_NAME"
    return
  fi
  if [ -n "${DATABASE_URL:-}" ]; then
    local clean_url="${DATABASE_URL%%\?*}"
    local db_part="${clean_url##*/}"
    if [ -n "$db_part" ]; then
      echo "$db_part"
      return
    fi
  fi
  echo "${PGDATABASE:-dodik_tracker}"
}

# 3. Read retention count configuration (default 10)
RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-10}"
if ! [[ "$RETENTION_COUNT" =~ ^[0-9]+$ ]] || [ "$RETENTION_COUNT" -lt 1 ]; then
  RETENTION_COUNT=10
fi

# ------------------------------------------------------------------------------
# Action: List Backups
# ------------------------------------------------------------------------------
list_backups() {
  local json_mode=0
  if [ "${1:-}" = "--json" ] || [ "${2:-}" = "--json" ]; then
    json_mode=1
  fi

  local files=()
  while IFS= read -r file; do
    [ -n "$file" ] && files+=("$file")
  done < <(ls -1t "$BACKUP_DIR"/dodik_tracker_backup_*.sql 2>/dev/null || true)

  if [ $json_mode -eq 1 ]; then
    echo "["
    local first=1
    for f in "${files[@]}"; do
      local meta_file="${f}.meta.json"
      if [ -f "$meta_file" ]; then
        [ $first -eq 0 ] && echo ","
        cat "$meta_file"
        first=0
      else
        local fname
        fname=$(basename "$f")
        local fsize
        fsize=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo 0)
        local fdate
        fdate=$(date -r "$f" -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
        [ $first -eq 0 ] && echo ","
        echo -n "{\"filename\":\"$fname\",\"createdAt\":\"$fdate\",\"sizeBytes\":$fsize,\"database\":\"$(get_db_name)\",\"format\":\"plain_sql\"}"
        first=0
      fi
    done
    echo ""
    echo "]"
    return 0
  fi

  echo "================================================================================"
  echo "  Dodik Tracker - Available PostgreSQL Backups"
  echo "  Storage Location: $BACKUP_DIR"
  echo "  Retention Policy: $RETENTION_COUNT latest backups retained"
  echo "================================================================================"
  
  if [ ${#files[@]} -eq 0 ]; then
    echo "No backups found in $BACKUP_DIR/"
    return 0
  fi

  printf "%-40s | %-19s | %-9s | %-12s | %-7s\n" "FILENAME" "CREATED AT (UTC)" "SIZE" "DB NAME" "COMMIT"
  echo "--------------------------------------------------------------------------------"
  for f in "${files[@]}"; do
    local fname
    fname=$(basename "$f")
    local meta_file="${f}.meta.json"
    local created_at=""
    local size_human=""
    local db_name=""
    local git_commit=""

    if [ -f "$meta_file" ]; then
      created_at=$(grep -o '"createdAt":[[:space:]]*"[^"]*"' "$meta_file" | head -1 | cut -d'"' -f4)
      size_human=$(grep -o '"sizeHuman":[[:space:]]*"[^"]*"' "$meta_file" | head -1 | cut -d'"' -f4)
      db_name=$(grep -o '"database":[[:space:]]*"[^"]*"' "$meta_file" | head -1 | cut -d'"' -f4)
      git_commit=$(grep -o '"gitCommit":[[:space:]]*"[^"]*"' "$meta_file" | head -1 | cut -d'"' -f4)
    fi

    [ -z "$created_at" ] && created_at=$(date -r "$f" -u +"%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "unknown")
    [ -z "$size_human" ] && size_human=$(ls -lh "$f" | awk '{print $5}')
    [ -z "$db_name" ] && db_name="$(get_db_name)"
    [ -z "$git_commit" ] && git_commit="—"

    # Format created_at to clean 19 chars
    created_at="${created_at:0:19}"
    printf "%-40s | %-19s | %-9s | %-12s | %-7s\n" "$fname" "$created_at" "$size_human" "$db_name" "$git_commit"
  done
  echo "================================================================================"
  echo "Total backups: ${#files[@]}"
}

# ------------------------------------------------------------------------------
# Action: Retention Cleanup
# ------------------------------------------------------------------------------
apply_retention() {
  local files=()
  while IFS= read -r file; do
    [ -n "$file" ] && files+=("$file")
  done < <(ls -1t "$BACKUP_DIR"/dodik_tracker_backup_*.sql 2>/dev/null || true)

  local total=${#files[@]}
  if [ "$total" -le "$RETENTION_COUNT" ]; then
    return 0
  fi

  # Never delete the only backup
  if [ "$total" -le 1 ]; then
    return 0
  fi

  echo "[Retention] Total backups ($total) exceeds retention limit ($RETENTION_COUNT)."
  local to_remove=("${files[@]:$RETENTION_COUNT}")
  for old_file in "${to_remove[@]}"; do
    # Safety check: double check count before each removal
    local remaining
    remaining=$(ls -1 "$BACKUP_DIR"/dodik_tracker_backup_*.sql 2>/dev/null | wc -l)
    if [ "$remaining" -le 1 ]; then
      echo "[Retention] Safety threshold reached: keeping last backup ($old_file)."
      break
    fi

    echo "[Retention] Pruning old backup: $(basename "$old_file")"
    rm -f "$old_file"
    rm -f "${old_file}.meta.json"
  done
}

# ------------------------------------------------------------------------------
# Action: Create Backup
# ------------------------------------------------------------------------------
create_backup() {
  local timestamp
  timestamp=$(date +"%Y%m%d_%H%M%S")
  local backup_file="$BACKUP_DIR/dodik_tracker_backup_${timestamp}.sql"
  local meta_file="${backup_file}.meta.json"

  local db_name
  db_name="$(get_db_name)"
  local db_user="${SQL_ADMIN_USER:-${SQL_USER:-${PGUSER:-postgres}}}"
  local db_host="${SQL_HOST:-${PGHOST:-localhost}}"
  local db_port="${SQL_PORT:-${PGPORT:-5432}}"
  local db_pass="${SQL_ADMIN_PASSWORD:-${SQL_PASSWORD:-${PGPASSWORD:-}}}"

  echo "=================================================="
  echo "  Dodik Tracker - PostgreSQL Backup Manager"
  echo "  Database: $db_name"
  echo "  Target:   $(basename "$backup_file")"
  echo "=================================================="

  local backup_success=0

  # 1. Native pg_dump (preferred)
  if command -v pg_dump &>/dev/null; then
    echo "[Backup] Executing native pg_dump..."
    if [ -n "${DATABASE_URL:-}" ]; then
      if pg_dump "$DATABASE_URL" -f "$backup_file" 2>/dev/null; then
        backup_success=1
      fi
    else
      if PGPASSWORD="$db_pass" pg_dump -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -f "$backup_file" 2>/dev/null; then
        backup_success=1
      fi
    fi
  fi

  # 2. Docker Compose fallback if native pg_dump not on host or failed
  if [ $backup_success -eq 0 ]; then
    if command -v docker &>/dev/null && docker compose ps &>/dev/null; then
      if docker compose ps --services --filter "status=running" 2>/dev/null | grep -qE "^(postgres|db)$"; then
        local service_name
        service_name=$(docker compose ps --services --filter "status=running" | grep -E "^(postgres|db)$" | head -n 1)
        echo "[Backup] Executing pg_dump via Docker Compose service '$service_name'..."
        if docker compose exec -T "$service_name" pg_dump -U "$db_user" "$db_name" > "$backup_file" 2>/dev/null; then
          backup_success=1
        fi
      fi
    elif command -v docker-compose &>/dev/null && docker-compose ps &>/dev/null; then
      if docker-compose ps --services 2>/dev/null | grep -qE "^(postgres|db)$"; then
        local service_name
        service_name=$(docker-compose ps --services | grep -E "^(postgres|db)$" | head -n 1)
        echo "[Backup] Executing pg_dump via docker-compose service '$service_name'..."
        if docker-compose exec -T "$service_name" pg_dump -U "$db_user" "$db_name" > "$backup_file" 2>/dev/null; then
          backup_success=1
        fi
      fi
    fi
  fi

  # 3. Comprehensive Backup Validation
  local is_valid=0
  if [ $backup_success -eq 1 ] && [ -f "$backup_file" ] && [ -s "$backup_file" ]; then
    local file_size_bytes
    file_size_bytes=$(stat -c%s "$backup_file" 2>/dev/null || stat -f%z "$backup_file" 2>/dev/null || echo 0)
    
    # Must be > 100 bytes and contain PostgreSQL header markers
    if [ "$file_size_bytes" -gt 100 ] && head -n 50 "$backup_file" | grep -q -iE "PostgreSQL|pg_dump"; then
      is_valid=1
    fi
  fi

  if [ $is_valid -eq 1 ]; then
    local size_human
    size_human=$(ls -lh "$backup_file" | awk '{print $5}')
    local git_commit_full="unknown"
    local git_commit_short="unknown"
    if command -v git &>/dev/null && [ -d "$PROJECT_ROOT/.git" ]; then
      git_commit_full=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
      git_commit_short=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    fi
    local app_ver="1.0.0"
    if [ -f "$PROJECT_ROOT/package.json" ]; then
      app_ver=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")
    fi
    local created_iso
    created_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Generate metadata JSON (safe: no passwords, no full connection string)
    cat <<EOF > "$meta_file"
{
  "filename": "$(basename "$backup_file")",
  "createdAt": "$created_iso",
  "sizeBytes": $file_size_bytes,
  "sizeHuman": "$size_human",
  "database": "$db_name",
  "gitCommit": "$git_commit_short",
  "gitCommitFull": "$git_commit_full",
  "appVersion": "$app_ver",
  "format": "plain_sql",
  "status": "VALID"
}
EOF

    echo "✅ Backup successfully created and validated!"
    echo "   File:     $backup_file ($size_human)"
    echo "   Metadata: $meta_file"
    echo "   Database: $db_name | Commit: $git_commit_short | Version: v$app_ver"

    # 4. Prune old backups according to retention policy
    apply_retention

    echo "=================================================="
    exit 0
  else
    echo "❌ Error: Backup creation or validation failed!" >&2
    echo "   pg_dump was unable to produce a valid PostgreSQL dump file." >&2
    rm -f "$backup_file" "$meta_file"
    echo "==================================================" >&2
    exit 1
  fi
}

# ------------------------------------------------------------------------------
# Entrypoint Router
# ------------------------------------------------------------------------------
CMD="${1:-create}"

case "$CMD" in
  list|--list|-l)
    list_backups "${2:-}"
    ;;
  create|--create)
    create_backup
    ;;
  retention|--retention)
    apply_retention
    ;;
  help|--help|-h)
    echo "Usage: ./scripts/backup.sh [command]"
    echo ""
    echo "Commands:"
    echo "  create        Create a new validated PostgreSQL database backup (default)"
    echo "  list          List all available backups and metadata"
    echo "  list --json   List all backups formatted as JSON array"
    echo "  retention     Run backup retention cleanup"
    echo "  help          Show this help text"
    ;;
  *)
    create_backup
    ;;
esac
