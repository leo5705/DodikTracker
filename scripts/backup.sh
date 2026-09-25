#!/usr/bin/env bash
# ==============================================================================
# Dodik Tracker - Unified Backup Manager (Database & Uploads)
# Safe, atomic, and resilient backup engine
# Supports:
#   1. Database Backup (PostgreSQL plain SQL dump)
#   2. Uploads Backup (Persistent user audio & covers archive)
#   3. Full Combined Backup
# Used by:
#   - `npm run backup` (CLI manual execution)
#   - `npm run update` / `scripts/update.sh` (Pre-update automated backup)
#   - Admin Panel Backend API (`/api/admin/system/backups`)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

BACKUP_DIR="$PROJECT_ROOT/backups"
DB_BACKUP_DIR="$BACKUP_DIR/db"
UPLOADS_BACKUP_DIR="${UPLOADS_BACKUP_DIR:-$BACKUP_DIR/uploads}"
SNAPSHOTS_DIR="$BACKUP_DIR/snapshots"

mkdir -p "$DB_BACKUP_DIR" "$UPLOADS_BACKUP_DIR" "$SNAPSHOTS_DIR"

# 1. Load environment variables safely
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Uploads directory location
UPLOADS_DIR="${UPLOADS_DIR:-$PROJECT_ROOT/public/uploads}"

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

# Helper to calculate sha256 checksum safely
calc_sha256() {
  local target="$1"
  if command -v sha256sum &>/dev/null; then
    sha256sum "$target" | awk '{print $1}'
  elif command -v shasum &>/dev/null; then
    shasum -a 256 "$target" | awk '{print $1}'
  else
    echo "unknown"
  fi
}

# Helper to find pg_dump in standard and Ubuntu postgres package paths
find_pg_dump() {
  if command -v pg_dump &>/dev/null; then
    command -v pg_dump
    return 0
  fi
  for p in /usr/lib/postgresql/*/bin/pg_dump /usr/local/bin/pg_dump /usr/bin/pg_dump; do
    if [ -x "$p" ]; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

# ------------------------------------------------------------------------------
# Action: Retention Cleanup for DB and Uploads
# ------------------------------------------------------------------------------
apply_retention() {
  # 1. DB retention
  local db_files=()
  while IFS= read -r file; do
    [ -n "$file" ] && [ -f "$file" ] && db_files+=("$file")
  done < <(ls -1t "$DB_BACKUP_DIR"/dodik_tracker_backup_*.sql "$BACKUP_DIR"/dodik_tracker_backup_*.sql 2>/dev/null || true)

  local db_total=${#db_files[@]}
  if [ "$db_total" -gt "$RETENTION_COUNT" ] && [ "$db_total" -gt 1 ]; then
    echo "[Retention:DB] Total database backups ($db_total) exceeds retention limit ($RETENTION_COUNT)."
    local db_to_remove=("${db_files[@]:$RETENTION_COUNT}")
    for old_file in "${db_to_remove[@]}"; do
      echo "[Retention:DB] Pruning old database backup: $(basename "$old_file")"
      rm -f "$old_file" "${old_file}.meta.json" || true
    done
  fi

  # 2. Uploads retention
  local uploads_files=()
  while IFS= read -r file; do
    [ -n "$file" ] && [ -f "$file" ] && uploads_files+=("$file")
  done < <(ls -1t "$UPLOADS_BACKUP_DIR"/dodik_tracker_uploads_*.tar.gz 2>/dev/null || true)

  local uploads_total=${#uploads_files[@]}
  if [ "$uploads_total" -gt "$RETENTION_COUNT" ] && [ "$uploads_total" -gt 1 ]; then
    echo "[Retention:Uploads] Total uploads backups ($uploads_total) exceeds retention limit ($RETENTION_COUNT)."
    local uploads_to_remove=("${uploads_files[@]:$RETENTION_COUNT}")
    for old_file in "${uploads_to_remove[@]}"; do
      echo "[Retention:Uploads] Pruning old uploads backup: $(basename "$old_file")"
      rm -f "$old_file" "${old_file}.meta.json" || true
    done
  fi
}

# ------------------------------------------------------------------------------
# Action: Create Database Backup (Atomic & Resilient)
# ------------------------------------------------------------------------------
create_db_backup() {
  local timestamp
  timestamp=$(date +"%Y%m%d_%H%M%S")
  local final_backup_file="$DB_BACKUP_DIR/dodik_tracker_backup_${timestamp}.sql"
  local temp_backup_file="$DB_BACKUP_DIR/dodik_tracker_backup_${timestamp}.sql.tmp"
  local meta_file="${final_backup_file}.meta.json"
  local err_log_file="/tmp/dodik_backup_err_${timestamp}.log"

  local db_name
  db_name="$(get_db_name)"
  local db_user="${SQL_ADMIN_USER:-${SQL_USER:-${PGUSER:-postgres}}}"
  local db_host="${SQL_HOST:-${PGHOST:-localhost}}"
  local db_port="${SQL_PORT:-${PGPORT:-5432}}"
  local db_pass="${SQL_ADMIN_PASSWORD:-${SQL_PASSWORD:-${PGPASSWORD:-}}}"

  echo "=================================================="
  echo "  Dodik Tracker - PostgreSQL Database Backup"
  echo "  Database: $db_name"
  echo "  Target:   $(basename "$final_backup_file")"
  echo "=================================================="

  local backup_success=0
  local pg_dump_bin=""

  # 1. Native pg_dump (preferred)
  if pg_dump_bin=$(find_pg_dump); then
    echo "[Backup:DB] Executing native pg_dump ($pg_dump_bin)..."
    if [ -n "${DATABASE_URL:-}" ]; then
      if "$pg_dump_bin" "$DATABASE_URL" -f "$temp_backup_file" 2>"$err_log_file"; then
        backup_success=1
      fi
    else
      if PGPASSWORD="$db_pass" "$pg_dump_bin" -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -f "$temp_backup_file" 2>"$err_log_file"; then
        backup_success=1
      fi
    fi
  fi

  # 2. Node.js Drizzle SQL Dumper fallback
  if [ $backup_success -eq 0 ]; then
    echo "[Backup:DB] Trying Node.js database dumper engine (fallback)..."
    if npx tsx src/scripts/dumpDb.ts "$temp_backup_file" 2>"$err_log_file"; then
      backup_success=1
    fi
  fi

  # 3. Docker Compose fallback if needed
  if [ $backup_success -eq 0 ]; then
    if command -v docker &>/dev/null && docker compose ps &>/dev/null; then
      if docker compose ps --services --filter "status=running" 2>/dev/null | grep -qE "^(postgres|db)$"; then
        local service_name
        service_name=$(docker compose ps --services --filter "status=running" | grep -E "^(postgres|db)$" | head -n 1)
        echo "[Backup:DB] Executing pg_dump via Docker Compose service '$service_name'..."
        if docker compose exec -T "$service_name" pg_dump -U "$db_user" "$db_name" > "$temp_backup_file" 2>"$err_log_file"; then
          backup_success=1
        fi
      fi
    fi
  fi

  # 4. Validation
  local is_valid=0
  if [ $backup_success -eq 1 ] && [ -f "$temp_backup_file" ] && [ -s "$temp_backup_file" ]; then
    local file_size_bytes
    file_size_bytes=$(stat -c%s "$temp_backup_file" 2>/dev/null || stat -f%z "$temp_backup_file" 2>/dev/null || echo 0)
    
    if [ "$file_size_bytes" -gt 100 ] && head -n 50 "$temp_backup_file" | grep -q -iE "PostgreSQL|pg_dump|SET|INSERT INTO|CREATE TABLE"; then
      is_valid=1
    fi
  fi

  if [ $is_valid -eq 1 ]; then
    mv "$temp_backup_file" "$final_backup_file"
    rm -f "$err_log_file"

    local final_size_bytes
    final_size_bytes=$(stat -c%s "$final_backup_file" 2>/dev/null || stat -f%z "$final_backup_file" 2>/dev/null || echo 0)
    local size_human
    size_human=$(ls -lh "$final_backup_file" 2>/dev/null | awk '{print $5}' || echo "0B")
    local checksum
    checksum=$(calc_sha256 "$final_backup_file")

    local git_commit_full="unknown"
    local git_commit_short="unknown"
    if command -v git &>/dev/null && [ -d "$PROJECT_ROOT/.git" ]; then
      git_commit_full=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
      git_commit_short=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    fi

    local app_ver="1.0.0"
    if [ -f "$PROJECT_ROOT/package.json" ]; then
      app_ver=$(node -p "try{require('./package.json').version}catch{process.env.npm_package_version||'1.0.0'}" 2>/dev/null || echo "1.0.0")
    fi

    local created_iso
    created_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    cat <<EOF > "$meta_file"
{
  "filename": "$(basename "$final_backup_file")",
  "type": "database",
  "createdAt": "$created_iso",
  "sizeBytes": $final_size_bytes,
  "sizeHuman": "$size_human",
  "sha256": "$checksum",
  "database": "$db_name",
  "gitCommit": "$git_commit_short",
  "gitCommitFull": "$git_commit_full",
  "appVersion": "$app_ver",
  "format": "plain_sql",
  "status": "VALID"
}
EOF

    echo "✅ Database backup successfully created and validated!"
    echo "   File:     $final_backup_file ($size_human)"
    echo "   SHA-256:  $checksum"
    echo "   Metadata: $meta_file"

    apply_retention
    echo "=================================================="
    return 0
  else
    local err_msg="Unknown error"
    if [ -f "$err_log_file" ]; then
      err_msg=$(cat "$err_log_file" | tr '\n' ' ' | sed 's/password=[^ ]*/password=****/g')
      rm -f "$err_log_file"
    fi
    echo "❌ Error: Database backup failed or validation failed!" >&2
    echo "   Details: $err_msg" >&2
    rm -f "$temp_backup_file"
    return 1
  fi
}

# ------------------------------------------------------------------------------
# Action: Create Uploads Archive Backup (Persistent Audio & Covers)
# ------------------------------------------------------------------------------
create_uploads_backup() {
  local timestamp
  timestamp=$(date +"%Y%m%d_%H%M%S")
  local final_archive="$UPLOADS_BACKUP_DIR/dodik_tracker_uploads_${timestamp}.tar.gz"
  local temp_archive="$UPLOADS_BACKUP_DIR/dodik_tracker_uploads_${timestamp}.tar.gz.tmp"
  local meta_file="${final_archive}.meta.json"

  echo "=================================================="
  echo "  Dodik Tracker - Uploads Archive Backup"
  echo "  Source:   $UPLOADS_DIR"
  echo "  Target:   $(basename "$final_archive")"
  echo "=================================================="

  # Ensure source directories exist
  mkdir -p "$UPLOADS_DIR/audio" "$UPLOADS_DIR/covers"

  # Count files
  local audio_count
  audio_count=$(find "$UPLOADS_DIR/audio" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
  local covers_count
  covers_count=$(find "$UPLOADS_DIR/covers" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
  local total_files=$((audio_count + covers_count))

  echo "[Backup:Uploads] Found $audio_count audio files, $covers_count cover images (Total: $total_files files)"

  # Create tar.gz archive safely from uploads directory
  if tar -czf "$temp_archive" -C "$UPLOADS_DIR" audio covers 2>/dev/null; then
    mv "$temp_archive" "$final_archive"

    local final_size_bytes
    final_size_bytes=$(stat -c%s "$final_archive" 2>/dev/null || stat -f%z "$final_archive" 2>/dev/null || echo 0)
    local size_human
    size_human=$(ls -lh "$final_archive" 2>/dev/null | awk '{print $5}' || echo "0B")
    local checksum
    checksum=$(calc_sha256 "$final_archive")

    local git_commit_short="unknown"
    if command -v git &>/dev/null && [ -d "$PROJECT_ROOT/.git" ]; then
      git_commit_short=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    fi

    local created_iso
    created_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    cat <<EOF > "$meta_file"
{
  "filename": "$(basename "$final_archive")",
  "type": "uploads",
  "createdAt": "$created_iso",
  "sizeBytes": $final_size_bytes,
  "sizeHuman": "$size_human",
  "sha256": "$checksum",
  "totalFiles": $total_files,
  "audioFiles": $audio_count,
  "coversFiles": $covers_count,
  "gitCommit": "$git_commit_short",
  "format": "tar.gz",
  "status": "VALID"
}
EOF

    echo "✅ Uploads backup successfully created!"
    echo "   File:     $final_archive ($size_human)"
    echo "   SHA-256:  $checksum"
    echo "   Metadata: $meta_file"
    echo "   Contents: $audio_count audio, $covers_count covers"

    apply_retention
    echo "=================================================="
    return 0
  else
    echo "❌ Error: Failed to create uploads archive!" >&2
    rm -f "$temp_archive"
    return 1
  fi
}

# ------------------------------------------------------------------------------
# Action: List Backups (DB & Uploads)
# ------------------------------------------------------------------------------
list_backups() {
  local json_mode=0
  if [ "${1:-}" = "--json" ] || [ "${2:-}" = "--json" ]; then
    json_mode=1
  fi

  local db_files=()
  while IFS= read -r file; do
    [ -n "$file" ] && [ -f "$file" ] && db_files+=("$file")
  done < <(ls -1t "$DB_BACKUP_DIR"/dodik_tracker_backup_*.sql "$BACKUP_DIR"/dodik_tracker_backup_*.sql 2>/dev/null || true)

  local uploads_files=()
  while IFS= read -r file; do
    [ -n "$file" ] && [ -f "$file" ] && uploads_files+=("$file")
  done < <(ls -1t "$UPLOADS_BACKUP_DIR"/dodik_tracker_uploads_*.tar.gz 2>/dev/null || true)

  if [ $json_mode -eq 1 ]; then
    echo "{"
    echo "  \"database\": ["
    local first=1
    for f in "${db_files[@]}"; do
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
        echo -n "{\"filename\":\"$fname\",\"type\":\"database\",\"createdAt\":\"$fdate\",\"sizeBytes\":$fsize,\"database\":\"$(get_db_name)\",\"format\":\"plain_sql\"}"
        first=0
      fi
    done
    echo ""
    echo "  ],"
    echo "  \"uploads\": ["
    first=1
    for f in "${uploads_files[@]}"; do
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
        echo -n "{\"filename\":\"$fname\",\"type\":\"uploads\",\"createdAt\":\"$fdate\",\"sizeBytes\":$fsize,\"format\":\"tar.gz\"}"
        first=0
      fi
    done
    echo ""
    echo "  ]"
    echo "}"
    return 0
  fi

  echo "================================================================================"
  echo "  Dodik Tracker - Available Backups"
  echo "  DB Backups Location:      $DB_BACKUP_DIR"
  echo "  Uploads Backups Location: $UPLOADS_BACKUP_DIR"
  echo "  Retention Policy:         $RETENTION_COUNT latest retained"
  echo "================================================================================"

  echo ""
  echo "--- 1. DATABASE BACKUPS (${#db_files[@]}) ---"
  if [ ${#db_files[@]} -eq 0 ]; then
    echo "No database backups found."
  else
    printf "%-38s | %-19s | %-8s | %-10s | %-7s\n" "FILENAME" "CREATED AT (UTC)" "SIZE" "DB" "COMMIT"
    echo "--------------------------------------------------------------------------------"
    for f in "${db_files[@]}"; do
      local fname
      fname=$(basename "$f")
      local meta_file="${f}.meta.json"
      local created_at="" size_human="" db_name="" git_commit=""
      if [ -f "$meta_file" ]; then
        created_at=$(grep -o '"createdAt":[[:space:]]*"[^"]*"' "$meta_file" | head -1 | cut -d'"' -f4 || true)
        size_human=$(grep -o '"sizeHuman":[[:space:]]*"[^"]*"' "$meta_file" | head -1 | cut -d'"' -f4 || true)
        db_name=$(grep -o '"database":[[:space:]]*"[^"]*"' "$meta_file" | head -1 | cut -d'"' -f4 || true)
        git_commit=$(grep -o '"gitCommit":[[:space:]]*"[^"]*"' "$meta_file" | head -1 | cut -d'"' -f4 || true)
      fi
      [ -z "$created_at" ] && created_at=$(date -r "$f" -u +"%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "unknown")
      [ -z "$size_human" ] && size_human=$(ls -lh "$f" 2>/dev/null | awk '{print $5}' || echo "0B")
      [ -z "$db_name" ] && db_name="$(get_db_name)"
      [ -z "$git_commit" ] && git_commit="—"
      created_at="${created_at:0:19}"
      printf "%-38s | %-19s | %-8s | %-10s | %-7s\n" "$fname" "$created_at" "$size_human" "$db_name" "$git_commit"
    done
  fi

  echo ""
  echo "--- 2. UPLOADS BACKUPS (${#uploads_files[@]}) ---"
  if [ ${#uploads_files[@]} -eq 0 ]; then
    echo "No uploads backups found."
  else
    printf "%-38s | %-19s | %-8s | %-12s | %-7s\n" "FILENAME" "CREATED AT (UTC)" "SIZE" "FILES" "COMMIT"
    echo "--------------------------------------------------------------------------------"
    for f in "${uploads_files[@]}"; do
      local fname
      fname=$(basename "$f")
      local meta_file="${f}.meta.json"
      local created_at="" size_human="" total_files="" git_commit=""
      if [ -f "$meta_file" ]; then
        created_at=$(grep -o '"createdAt":[[:space:]]*"[^"]*"' "$meta_file" | head -1 | cut -d'"' -f4 || true)
        size_human=$(grep -o '"sizeHuman":[[:space:]]*"[^"]*"' "$meta_file" | head -1 | cut -d'"' -f4 || true)
        total_files=$(grep -o '"totalFiles":[[:space:]]*[0-9]*' "$meta_file" | head -1 | awk -F: '{print $2}' | tr -d ' ' || true)
        git_commit=$(grep -o '"gitCommit":[[:space:]]*"[^"]*"' "$meta_file" | head -1 | cut -d'"' -f4 || true)
      fi
      [ -z "$created_at" ] && created_at=$(date -r "$f" -u +"%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "unknown")
      [ -z "$size_human" ] && size_human=$(ls -lh "$f" 2>/dev/null | awk '{print $5}' || echo "0B")
      [ -z "$total_files" ] && total_files="—"
      [ -z "$git_commit" ] && git_commit="—"
      created_at="${created_at:0:19}"
      printf "%-38s | %-19s | %-8s | %-12s | %-7s\n" "$fname" "$created_at" "$size_human" "$total_files files" "$git_commit"
    done
  fi
  echo "================================================================================"
}

# ------------------------------------------------------------------------------
# Entrypoint Router
# ------------------------------------------------------------------------------
CMD="${1:-create}"

case "$CMD" in
  db|create|--db|--create)
    create_db_backup
    ;;
  uploads|--uploads)
    create_uploads_backup
    ;;
  all|--all)
    create_db_backup
    create_uploads_backup
    ;;
  list|--list|-l)
    list_backups "${2:-}"
    ;;
  retention|--retention)
    apply_retention
    ;;
  help|--help|-h)
    echo "Usage: ./scripts/backup.sh [command]"
    echo ""
    echo "Commands:"
    echo "  db / create   Create a PostgreSQL database backup (default)"
    echo "  uploads       Create a persistent uploads archive backup (audio & covers)"
    echo "  all           Create both database and uploads backups"
    echo "  list          List all available database and uploads backups"
    echo "  list --json   List all backups formatted as JSON object"
    echo "  retention     Run backup retention cleanup"
    echo "  help          Show this help text"
    ;;
  *)
    create_db_backup
    ;;
esac
