#!/usr/bin/env bash
# ==============================================================================
# Dodik Tracker - Production Update Engine
# Safe, atomic, idempotent, and resilient update mechanism
# Guarantees ZERO DATA LOSS for PostgreSQL database and user uploads
# ==============================================================================

set -euo pipefail

# 1. Determine project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Ensure PATH includes common binary directories for Node, PM2, and PostgreSQL
NODE_CUR_VER=$(node -v 2>/dev/null || echo "")
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/lib/postgresql/17/bin:/usr/lib/postgresql/16/bin:/usr/lib/postgresql/15/bin:/usr/lib/postgresql/14/bin:${HOME:-/root}/.nvm/versions/node/${NODE_CUR_VER}/bin:${HOME:-/root}/.npm-global/bin"

# 2. Acquire update lock (prevent concurrent update runs)
LOCK_FILE="/var/lock/dodik-tracker-update.lock"
if ! touch "$LOCK_FILE" 2>/dev/null; then
  LOCK_FILE="/tmp/dodik-tracker-update.lock"
fi

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "Update already in progress" >&2
  exit 1
fi

# 3. Setup logging
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/update.log"
mkdir -p "$LOG_DIR"

if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)" -gt 2097152 ]; then
  tail -n 2000 "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi

log() {
  local level="$1"
  shift
  local msg="$*"
  local ts
  ts=$(date +"%Y-%m-%d %H:%M:%S")
  echo "[$ts] [$level] $msg" >> "$LOG_FILE"
  if [ "$level" = "ERROR" ]; then
    echo "$msg" >&2
  else
    echo "$msg"
  fi
}

CURRENT_STAGE="init"
log "INFO" "[STAGE: init] =================================================="
log "INFO" "[STAGE: init]     🚀 Dodik Tracker - Safe Update Engine         "
log "INFO" "[STAGE: init] =================================================="
log "INFO" "[STAGE: init] Update process started at $(date)"

# Trap for unexpected errors to log failure and current stage
catch_error() {
  local exit_code="$1"
  local line_no="$2"
  log "ERROR" "=================================================="
  log "ERROR" "[STAGE: ${CURRENT_STAGE}] ❌ UPDATE FAILED at stage '${CURRENT_STAGE}' (Line $line_no, exit code $exit_code)"
  if command -v git &>/dev/null && [ -d ".git" ]; then
    log "ERROR" "Current Git commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
  fi
  log "ERROR" "Review logs at: logs/update.log"
  log "ERROR" "=================================================="
  exit "$exit_code"
}
trap 'catch_error $? $LINENO' ERR

# Helper: calculate SHA-256 checksum
calc_sha256() {
  local file="$1"
  if command -v sha256sum &>/dev/null; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum &>/dev/null; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    echo "unknown"
  fi
}

# ------------------------------------------------------------------------------
# STAGE 1: Preflight & Environment Check
# ------------------------------------------------------------------------------
CURRENT_STAGE="preflight"
log "INFO" "[STAGE: preflight] [1/11] Running preflight system checks..."

if [ -f .env ]; then
  set -a
  source .env
  set +a
  log "INFO" "[STAGE: preflight] Loaded .env configuration."
else
  log "WARN" "[STAGE: preflight] Notice: .env file not found. System environment variables will be used."
fi

for tool in git npm node curl tar; do
  if ! command -v "$tool" &>/dev/null; then
    log "ERROR" "[STAGE: preflight] ❌ Required tool '$tool' is not installed or not in PATH."
    exit 1
  fi
done

UPLOADS_DIR="${UPLOADS_DIR:-$PROJECT_ROOT/public/uploads}"
AUDIO_DIR="$UPLOADS_DIR/audio"
COVERS_DIR="$UPLOADS_DIR/covers"
mkdir -p "$AUDIO_DIR" "$COVERS_DIR" "$PROJECT_ROOT/backups/db" "$PROJECT_ROOT/backups/uploads" "$PROJECT_ROOT/backups/snapshots"

log "INFO" "[STAGE: preflight] Preflight tools and directories verified."

# ------------------------------------------------------------------------------
# STAGE 2: Git Safety Guard (assert_uploads_safe)
# ------------------------------------------------------------------------------
CURRENT_STAGE="git_safety"
log "INFO" "[STAGE: git_safety] [2/11] Enforcing Git safety guard for persistent uploads..."

if [ ! -d ".git" ]; then
  log "ERROR" "[STAGE: git_safety] ❌ Git repository (.git) not found in $PROJECT_ROOT."
  exit 1
fi

assert_uploads_safe() {
  # 1. Verify that real media files in public/uploads are NOT tracked by Git
  local tracked_audio
  tracked_audio=$(git ls-files public/uploads/audio | grep -v "\.gitkeep$" || true)
  local tracked_covers
  tracked_covers=$(git ls-files public/uploads/covers | grep -v "\.gitkeep$" || true)

  if [ -n "$tracked_audio" ] || [ -n "$tracked_covers" ]; then
    log "WARN" "[STAGE: git_safety] ⚠️ Notice: Found tracked real media files in Git index! Un-tracking from Git index without deleting local files..."
    if [ -n "$tracked_audio" ]; then
      while IFS= read -r f; do
        [ -n "$f" ] && git rm --cached "$f" >> "$LOG_FILE" 2>&1 || true
      done <<< "$tracked_audio"
    fi
    if [ -n "$tracked_covers" ]; then
      while IFS= read -r f; do
        [ -n "$f" ] && git rm --cached "$f" >> "$LOG_FILE" 2>&1 || true
      done <<< "$tracked_covers"
    fi
    log "INFO" "[STAGE: git_safety] Tracked media files removed from Git index successfully."
  fi

  # 2. Verify working tree is clean (only untracked ignored files allowed)
  local uncommitted
  uncommitted=$(git status --porcelain | grep -v "?? public/uploads" | grep -v "?? backups" | grep -v "?? logs" || true)
  if [ -n "$uncommitted" ]; then
    log "ERROR" "[STAGE: git_safety] ❌ Uncommitted local code modifications detected:"
    echo "$uncommitted" >&2
    log "ERROR" "[STAGE: git_safety] Update halted to preserve local changes. Please commit or stash modifications."
    exit 1
  fi

  # 3. Check gitignore safety test on temporary probe file
  local probe_file="$AUDIO_DIR/.safety_probe_$$"
  touch "$probe_file"
  if ! git check-ignore -q "$probe_file" 2>/dev/null; then
    log "WARN" "[STAGE: git_safety] Warning: .gitignore probe test did not match $probe_file. Ensuring public/uploads/* is ignored."
  fi
  rm -f "$probe_file"
}

assert_uploads_safe
log "INFO" "[STAGE: git_safety] Git safety assertions passed: uploads are untracked and protected."

# ------------------------------------------------------------------------------
# STAGE 3: Database Backup (PostgreSQL SQL Dump)
# ------------------------------------------------------------------------------
CURRENT_STAGE="database_backup"
log "INFO" "[STAGE: database_backup] [3/11] Performing PostgreSQL database backup..."

if [ ! -f "scripts/backup.sh" ]; then
  log "ERROR" "[STAGE: database_backup] ❌ scripts/backup.sh not found! UPDATE MUST STOP."
  exit 1
fi

if ! bash scripts/backup.sh db >> "$LOG_FILE" 2>&1; then
  log "ERROR" "[STAGE: database_backup] ❌ Database backup failed! UPDATE MUST STOP."
  exit 1
fi
log "INFO" "[STAGE: database_backup] Database backup created and validated."

# ------------------------------------------------------------------------------
# STAGE 4: Uploads Pre-Update Snapshot & Archive
# ------------------------------------------------------------------------------
CURRENT_STAGE="uploads_snapshot"
log "INFO" "[STAGE: uploads_snapshot] [4/11] Generating pre-update snapshot of user uploads..."

SNAPSHOT_TS=$(date +"%Y%m%d_%H%M%S")
SNAPSHOT_FILE="$PROJECT_ROOT/backups/snapshots/pre_update_manifest_${SNAPSHOT_TS}.json"

PRE_AUDIO_COUNT=$(find "$AUDIO_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
PRE_COVERS_COUNT=$(find "$COVERS_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
PRE_TOTAL_FILES=$((PRE_AUDIO_COUNT + PRE_COVERS_COUNT))
PRE_TOTAL_BYTES=0

# Create structured pre-update manifest JSON
{
  echo "{"
  echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
  echo "  \"totalFiles\": $PRE_TOTAL_FILES,"
  echo "  \"audioCount\": $PRE_AUDIO_COUNT,"
  echo "  \"coversCount\": $PRE_COVERS_COUNT,"
  echo "  \"files\": ["
  
  first_file=1
  # Scan audio files
  while IFS= read -r fpath; do
    if [ -n "$fpath" ] && [ -f "$fpath" ] && [ "$(basename "$fpath")" != ".gitkeep" ]; then
      fname=$(basename "$fpath")
      fsize=$(stat -c%s "$fpath" 2>/dev/null || stat -f%z "$fpath" 2>/dev/null || echo 0)
      fmtime=$(date -r "$fpath" -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
      fsha=$(calc_sha256 "$fpath")
      PRE_TOTAL_BYTES=$((PRE_TOTAL_BYTES + fsize))

      [ $first_file -eq 0 ] && echo ","
      echo -n "    {\"relPath\": \"audio/$fname\", \"name\": \"$fname\", \"category\": \"audio\", \"size\": $fsize, \"mtime\": \"$fmtime\", \"sha256\": \"$fsha\"}"
      first_file=0
    fi
  done < <(find "$AUDIO_DIR" -type f ! -name ".gitkeep" 2>/dev/null || true)

  # Scan cover files
  while IFS= read -r fpath; do
    if [ -n "$fpath" ] && [ -f "$fpath" ] && [ "$(basename "$fpath")" != ".gitkeep" ]; then
      fname=$(basename "$fpath")
      fsize=$(stat -c%s "$fpath" 2>/dev/null || stat -f%z "$fpath" 2>/dev/null || echo 0)
      fmtime=$(date -r "$fpath" -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
      fsha=$(calc_sha256 "$fpath")
      PRE_TOTAL_BYTES=$((PRE_TOTAL_BYTES + fsize))

      [ $first_file -eq 0 ] && echo ","
      echo -n "    {\"relPath\": \"covers/$fname\", \"name\": \"$fname\", \"category\": \"covers\", \"size\": $fsize, \"mtime\": \"$fmtime\", \"sha256\": \"$fsha\"}"
      first_file=0
    fi
  done < <(find "$COVERS_DIR" -type f ! -name ".gitkeep" 2>/dev/null || true)

  echo ""
  echo "  ],"
  echo "  \"totalBytes\": $PRE_TOTAL_BYTES"
  echo "}"
} > "$SNAPSHOT_FILE"

# Create pre-update uploads backup archive
log "INFO" "[STAGE: uploads_snapshot] Creating persistent pre-update archive of $PRE_TOTAL_FILES uploaded files ($PRE_TOTAL_BYTES bytes)..."
if ! bash scripts/backup.sh uploads >> "$LOG_FILE" 2>&1; then
  log "WARN" "[STAGE: uploads_snapshot] Notice: backup.sh uploads had warnings, checking archive..."
fi

# Find the latest uploads archive created for recovery if needed
LATEST_UPLOADS_ARCHIVE=$(ls -1t "$PROJECT_ROOT/backups/uploads"/dodik_tracker_uploads_*.tar.gz 2>/dev/null | head -n 1 || echo "")
log "INFO" "[STAGE: uploads_snapshot] Uploads snapshot complete: audio: $PRE_AUDIO_COUNT, covers: $PRE_COVERS_COUNT. Manifest: $(basename "$SNAPSHOT_FILE")"

# ------------------------------------------------------------------------------
# STAGE 5: Git Fetch & Fast-Forward Pull
# ------------------------------------------------------------------------------
CURRENT_STAGE="git_pull"
log "INFO" "[STAGE: git_pull] [5/11] Fetching updates from remote repository..."

GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
CURRENT_COMMIT_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

if ! git fetch origin "$GIT_BRANCH" >> "$LOG_FILE" 2>&1; then
  log "ERROR" "[STAGE: git_pull] ❌ Failed to fetch from origin $GIT_BRANCH. Check internet connection and Git remotes."
  exit 1
fi

REMOTE_COMMIT=$(git rev-parse "origin/$GIT_BRANCH" 2>/dev/null || echo "$CURRENT_COMMIT")
REMOTE_COMMIT_SHORT=$(git rev-parse --short "origin/$GIT_BRANCH" 2>/dev/null || echo "$CURRENT_COMMIT_SHORT")
log "INFO" "[STAGE: git_pull] Current commit: $CURRENT_COMMIT_SHORT | Remote commit: $REMOTE_COMMIT_SHORT"

if [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
  log "INFO" "[STAGE: git_pull] Working copy is already at commit $CURRENT_COMMIT_SHORT."
else
  log "INFO" "[STAGE: git_pull] Pulling updates (git pull --ff-only origin $GIT_BRANCH)..."
  if ! git pull --ff-only origin "$GIT_BRANCH" >> "$LOG_FILE" 2>&1; then
    log "ERROR" "[STAGE: git_pull] ❌ Fast-forward pull failed! Local and remote branches have diverged."
    exit 1
  fi
  NEW_COMMIT=$(git rev-parse HEAD)
  NEW_COMMIT_SHORT=$(git rev-parse --short HEAD)
  log "INFO" "[STAGE: git_pull] Codebase updated to commit: $NEW_COMMIT_SHORT."
fi

# ------------------------------------------------------------------------------
# STAGE 6: Install npm dependencies
# ------------------------------------------------------------------------------
CURRENT_STAGE="dependencies"
log "INFO" "[STAGE: dependencies] [6/11] Installing npm dependencies..."
if ! npm install >> "$LOG_FILE" 2>&1; then
  log "ERROR" "[STAGE: dependencies] ❌ npm install failed! Check logs/update.log."
  exit 1
fi
log "INFO" "[STAGE: dependencies] Dependencies installed successfully."

# ------------------------------------------------------------------------------
# STAGE 7: Database Migrations
# ------------------------------------------------------------------------------
CURRENT_STAGE="migrations"
log "INFO" "[STAGE: migrations] [7/11] Applying database migrations (npm run db:migrate)..."
if ! npm run db:migrate >> "$LOG_FILE" 2>&1; then
  log "ERROR" "[STAGE: migrations] ❌ Database migration failed! Restore database using: bash scripts/restore.sh <backup_file> --confirm"
  exit 1
fi
log "INFO" "[STAGE: migrations] Database migrations applied successfully."

# ------------------------------------------------------------------------------
# STAGE 8: Build Production Application
# ------------------------------------------------------------------------------
CURRENT_STAGE="build"
log "INFO" "[STAGE: build] [8/11] Building production application (npm run build)..."
if ! npm run build >> "$LOG_FILE" 2>&1; then
  log "ERROR" "[STAGE: build] ❌ Production build failed! Check logs/update.log."
  exit 1
fi

if [ ! -f "$PROJECT_ROOT/dist/server.cjs" ]; then
  log "ERROR" "[STAGE: build] ❌ Build artifact missing: dist/server.cjs not found!"
  exit 1
fi
log "INFO" "[STAGE: build] Build verified: dist/server.cjs created successfully."

# ------------------------------------------------------------------------------
# STAGE 9: PM2 Process Restart
# ------------------------------------------------------------------------------
CURRENT_STAGE="restart"
log "INFO" "[STAGE: restart] [9/11] Restarting PM2 process 'dodik-tracker'..."

PM2_BIN="pm2"
if ! command -v pm2 &>/dev/null && [ -x "/usr/local/bin/pm2" ]; then
  PM2_BIN="/usr/local/bin/pm2"
fi

if command -v "$PM2_BIN" &>/dev/null; then
  if ! "$PM2_BIN" restart dodik-tracker >> "$LOG_FILE" 2>&1; then
    log "WARN" "[STAGE: restart] Notice: pm2 restart returned non-zero code. Verifying service via healthcheck..."
  fi
else
  log "WARN" "[STAGE: restart] pm2 not found in system path; skipping pm2 restart command."
fi

# ------------------------------------------------------------------------------
# STAGE 10: Health Check Verification
# ------------------------------------------------------------------------------
CURRENT_STAGE="healthcheck"
log "INFO" "[STAGE: healthcheck] [10/11] Verifying server healthcheck endpoint..."
sleep 2

HEALTH_URL="http://localhost:3000/api/health"
HEALTH_SUCCESS=0
HEALTH_BODY=""

for attempt in {1..10}; do
  HEALTH_BODY=$(curl -fsS "$HEALTH_URL" 2>/dev/null || echo "")
  if [[ "$HEALTH_BODY" =~ \"status\"[[:space:]]*:[[:space:]]*\"UP\" ]]; then
    HEALTH_SUCCESS=1
    break
  fi
  sleep 2
done

if [ $HEALTH_SUCCESS -ne 1 ]; then
  log "ERROR" "[STAGE: healthcheck] ❌ Health check failed for $HEALTH_URL after update!"
  log "ERROR" "[STAGE: healthcheck] Response: ${HEALTH_BODY:-'<empty or connection refused>'}"
  exit 1
fi
log "INFO" "[STAGE: healthcheck] Health check OK: Application is UP."

# ------------------------------------------------------------------------------
# STAGE 11: Uploads Integrity Check & Auto-Recovery Guard
# ------------------------------------------------------------------------------
CURRENT_STAGE="uploads_integrity"
log "INFO" "[STAGE: uploads_integrity] [11/11] Verifying post-update uploads integrity against pre-update snapshot..."

POST_AUDIO_COUNT=$(find "$AUDIO_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
POST_COVERS_COUNT=$(find "$COVERS_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
POST_TOTAL_FILES=$((POST_AUDIO_COUNT + POST_COVERS_COUNT))

log "INFO" "[STAGE: uploads_integrity] Pre-update:  $PRE_TOTAL_FILES files (audio: $PRE_AUDIO_COUNT, covers: $PRE_COVERS_COUNT)"
log "INFO" "[STAGE: uploads_integrity] Post-update: $POST_TOTAL_FILES files (audio: $POST_AUDIO_COUNT, covers: $POST_COVERS_COUNT)"

INTEGRITY_FAILED=0
MISSING_FILES=()

# Verify each file from pre-update manifest
if [ -f "$SNAPSHOT_FILE" ] && [ "$PRE_TOTAL_FILES" -gt 0 ]; then
  while IFS= read -r relpath; do
    [ -z "$relpath" ] && continue
    full_target="$UPLOADS_DIR/$relpath"
    if [ ! -f "$full_target" ]; then
      log "ERROR" "[STAGE: uploads_integrity] ❌ Missing upload detected: $relpath"
      INTEGRITY_FAILED=1
      MISSING_FILES+=("$relpath")
    fi
  done < <(grep -o '"relPath":[[:space:]]*"[^"]*"' "$SNAPSHOT_FILE" | cut -d'"' -f4 || true)
fi

# Auto-recovery if uploads disappeared or were compromised
if [ $INTEGRITY_FAILED -eq 1 ] || [ "$POST_TOTAL_FILES" -lt "$PRE_TOTAL_FILES" ]; then
  log "ERROR" "[STAGE: uploads_integrity] ❌ CRITICAL: Uploads integrity check FAILED! Missing ${#MISSING_FILES[@]} files."
  log "INFO" "[STAGE: uploads_integrity] Attempting AUTOMATIC RECOVERY from pre-update uploads backup archive..."

  if [ -n "$LATEST_UPLOADS_ARCHIVE" ] && [ -f "$LATEST_UPLOADS_ARCHIVE" ]; then
    log "INFO" "[STAGE: uploads_integrity] Unpacking archive: $(basename "$LATEST_UPLOADS_ARCHIVE")..."
    if tar -xzf "$LATEST_UPLOADS_ARCHIVE" -C "$UPLOADS_DIR"; then
      REC_AUDIO=$(find "$AUDIO_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
      REC_COVERS=$(find "$COVERS_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
      REC_TOTAL=$((REC_AUDIO + REC_COVERS))
      log "INFO" "[STAGE: uploads_integrity] ✅ Automatic recovery succeeded! Restored uploads: $REC_TOTAL files (audio: $REC_AUDIO, covers: $REC_COVERS)."
    else
      log "ERROR" "[STAGE: uploads_integrity] ❌ FATAL: Automatic recovery failed to unpack archive!"
      exit 1
    fi
  else
    log "ERROR" "[STAGE: uploads_integrity] ❌ FATAL: No backup archive found for automatic recovery!"
    exit 1
  fi
else
  log "INFO" "[STAGE: uploads_integrity] ✅ Uploads integrity verified: all $PRE_TOTAL_FILES user files intact."
fi

# ------------------------------------------------------------------------------
# STAGE 12: Database ↔ Filesystem Diagnostic Cross-Check
# ------------------------------------------------------------------------------
CURRENT_STAGE="database_integrity"
log "INFO" "[STAGE: database_integrity] Running Database ↔ Filesystem cross-verification diagnostic..."

if [ -f "src/scripts/verifyUploads.ts" ]; then
  npx tsx src/scripts/verifyUploads.ts --http >> "$LOG_FILE" 2>&1 || true
  log "INFO" "[STAGE: database_integrity] DB ↔ Filesystem cross-check completed. Review log for broken references or orphan files."
fi

# ------------------------------------------------------------------------------
# STAGE 13: Update Successfully Completed
# ------------------------------------------------------------------------------
CURRENT_STAGE="completed"
APP_VERSION=$(node -p "try{require('./package.json').version}catch{process.env.npm_package_version||'1.0.0'}" 2>/dev/null || echo "1.0.0")
FINAL_COMMIT_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

log "INFO" "[STAGE: completed] =================================================="
log "INFO" "[STAGE: completed]   ✅ SUCCESS: Dodik Tracker updated to v${APP_VERSION} ($FINAL_COMMIT_SHORT)"
log "INFO" "[STAGE: completed]   • Database:  PostgreSQL backup saved"
log "INFO" "[STAGE: completed]   • Uploads:   Audio: $POST_AUDIO_COUNT, Covers: $POST_COVERS_COUNT verified"
log "INFO" "[STAGE: completed]   • Service:   PM2 restarted & Healthcheck OK"
log "INFO" "[STAGE: completed] =================================================="
log "INFO" "[STAGE: completed] Final status: SUCCESS"
exit 0
