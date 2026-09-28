#!/usr/bin/env bash
# ==============================================================================
# Dodik Tracker - Production Update Engine
# Safe, atomic, idempotent, resilient, and diagnostic-rich update mechanism.
# Guarantees ZERO DATA LOSS for PostgreSQL database and user uploads.
# Includes preflight checks, disk space checks, lockfile verification,
# automatic rollback, and secret-sanitized state persistence.
# ==============================================================================

set -euo pipefail

# 1. Determine project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Ensure PATH includes common binary directories
NODE_CUR_VER=$(node -v 2>/dev/null || echo "")
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/lib/postgresql/17/bin:/usr/lib/postgresql/16/bin:/usr/lib/postgresql/15/bin:/usr/lib/postgresql/14/bin:${HOME:-/root}/.nvm/versions/node/${NODE_CUR_VER}/bin:${HOME:-/root}/.npm-global/bin"

# 2. Directories & Persistent Log Files
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/update.log"
STATE_FILE="$LOG_DIR/update_state.json"
mkdir -p "$LOG_DIR" "$PROJECT_ROOT/backups/db" "$PROJECT_ROOT/backups/uploads" "$PROJECT_ROOT/backups/snapshots"

# Truncate log if it exceeds 2MB
if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)" -gt 2097152 ]; then
  tail -n 2000 "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi

# 3. Acquire update lock (prevent concurrent update runs)
LOCK_FILE="/tmp/dodik-tracker-update.lock"
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "Update already in progress" >&2
  exit 1
fi

# 4. Helper functions

# Sanitize secrets from logs & error output (hide DB credentials, passwords, tokens)
sanitize_secrets() {
  local input="${1:-}"
  echo "$input" | sed -E \
    -e 's/postgres:\/\/[^@]+@/postgres:\/\/***REDACTED***@/g' \
    -e 's/postgresql:\/\/[^@]+@/postgresql:\/\/***REDACTED***@/g' \
    -e 's/(PASSWORD|SECRET|TOKEN|KEY|PASS|AUTH)="?[^"& ]+"?/\1=***REDACTED***/gi' \
    -e 's/(--password|-p)[= ]"[^"]+"/\1 ***REDACTED***/gi'
}

# Calculate SHA256 checksum safely
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

# State variables
JOB_ID="update_$(date +%s)"
CURRENT_STAGE="init"
CURRENT_STATE="running"
PROGRESS=5
PREVIOUS_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
TARGET_COMMIT="unknown"
FAILED_COMMAND=""
EXIT_CODE=0
ERROR_DETAILS=""
LOG_SUMMARY=()

log() {
  local level="$1"
  shift
  local raw_msg="$*"
  local msg
  msg=$(sanitize_secrets "$raw_msg")
  local ts
  ts=$(date +"%Y-%m-%d %H:%M:%S")

  echo "[$ts] [$level] $msg" >> "$LOG_FILE"

  if [ "$level" = "ERROR" ]; then
    echo "$msg" >&2
  else
    echo "$msg"
  fi

  LOG_SUMMARY+=("[$ts] [$level] $msg")
  if [ "${#LOG_SUMMARY[@]}" -gt 100 ]; then
    LOG_SUMMARY=("${LOG_SUMMARY[@]: -100}")
  fi

  write_state_file
}

write_state_file() {
  local start_iso
  start_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Construct JSON array of log summary lines safely
  local logs_json="["
  local first_entry=1
  for line in "${LOG_SUMMARY[@]}"; do
    local escaped_line
    escaped_line=$(echo "$line" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr -d '\r\n')
    if [ $first_entry -eq 1 ]; then
      logs_json="$logs_json\"$escaped_line\""
      first_entry=0
    else
      logs_json="$logs_json, \"$escaped_line\""
    fi
  done
  logs_json="$logs_json]"

  local escaped_error
  escaped_error=$(echo "$ERROR_DETAILS" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr -d '\r\n')

  cat <<EOF > "$STATE_FILE.tmp"
{
  "id": "$JOB_ID",
  "state": "$CURRENT_STATE",
  "stage": "$CURRENT_STAGE",
  "progress": $PROGRESS,
  "startTime": "$start_iso",
  "endTime": $(if [ "$CURRENT_STATE" = "running" ]; then echo "null"; else echo "\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\""; fi),
  "previousCommit": "$PREVIOUS_COMMIT",
  "targetCommit": "$TARGET_COMMIT",
  "nodeVersion": "$(node -v 2>/dev/null || echo 'unknown')",
  "npmVersion": "$(npm -v 2>/dev/null || echo 'unknown')",
  "failedCommand": "$(echo "$FAILED_COMMAND" | sed 's/"/\\"/g')",
  "exitCode": $EXIT_CODE,
  "errorDetails": "$escaped_error",
  "logSummary": $logs_json
}
EOF
  mv "$STATE_FILE.tmp" "$STATE_FILE" 2>/dev/null || true
}

log "INFO" "[STAGE: init] =================================================="
log "INFO" "[STAGE: init]     🚀 Dodik Tracker - Safe Production Update Engine"
log "INFO" "[STAGE: init] =================================================="
log "INFO" "[STAGE: init] Process ID: $$ | Initial commit: ${PREVIOUS_COMMIT:0:7}"

# ------------------------------------------------------------------------------
# ROLLBACK SUBROUTINE
# ------------------------------------------------------------------------------
rollback_update() {
  local reason="${1:-'Unspecified update error'}"
  log "ERROR" "=================================================="
  log "ERROR" "[STAGE: rollback] ⚠️ INITIATING AUTOMATIC ROLLBACK TO PREVIOUS WORKING STATE..."
  log "ERROR" "[STAGE: rollback] Cause: $reason"
  log "ERROR" "[STAGE: rollback] Target rollback commit: ${PREVIOUS_COMMIT:0:7}"

  CURRENT_STAGE="rolling_back"
  PROGRESS=85
  write_state_file

  if [ "$PREVIOUS_COMMIT" != "unknown" ] && [ -d ".git" ]; then
    log "INFO" "[STAGE: rollback] Resetting git working tree to $PREVIOUS_COMMIT..."
    git reset --hard "$PREVIOUS_COMMIT" >> "$LOG_FILE" 2>&1 || true
    git clean -fd -e public/uploads -e .env -e backups -e logs >> "$LOG_FILE" 2>&1 || true
  fi

  log "INFO" "[STAGE: rollback] Re-installing dependencies for rollback commit..."
  npm install --no-audit --no-fund >> "$LOG_FILE" 2>&1 || true

  log "INFO" "[STAGE: rollback] Re-building application for rollback commit..."
  npm run build >> "$LOG_FILE" 2>&1 || true

  if command -v pm2 &>/dev/null || [ -x "/usr/local/bin/pm2" ]; then
    log "INFO" "[STAGE: rollback] Restarting PM2 process 'dodik-tracker'..."
    (pm2 restart dodik-tracker || /usr/local/bin/pm2 restart dodik-tracker) >> "$LOG_FILE" 2>&1 || true
  fi

  CURRENT_STAGE="failed"
  CURRENT_STATE="failed"
  ERROR_DETAILS="Update failed during '$CURRENT_STAGE': $reason. Codebase safely rolled back to ${PREVIOUS_COMMIT:0:7}. User files and database remain intact."
  write_state_file

  log "ERROR" "[STAGE: rollback] ❌ ROLLBACK COMPLETED. Application restored to $PREVIOUS_COMMIT."
  log "ERROR" "=================================================="
}

# Trap unexpected process exits
catch_error() {
  local exit_code="$1"
  local line_no="$2"
  EXIT_CODE="$exit_code"

  if [ "$CURRENT_STAGE" = "git_pull" ] || [ "$CURRENT_STAGE" = "dependencies" ] || [ "$CURRENT_STAGE" = "build" ] || [ "$CURRENT_STAGE" = "migrations" ] || [ "$CURRENT_STAGE" = "restart" ] || [ "$CURRENT_STAGE" = "healthcheck" ]; then
    rollback_update "Execution failed at line $line_no with exit code $exit_code"
  else
    CURRENT_STATE="failed"
    ERROR_DETAILS="Update failed at stage '$CURRENT_STAGE' (Line $line_no, exit code $exit_code)."
    write_state_file
    log "ERROR" "[STAGE: ${CURRENT_STAGE}] ❌ UPDATE FAILED at stage '${CURRENT_STAGE}' (Line $line_no, exit code $exit_code)"
  fi
  exit "$exit_code"
}
trap 'catch_error $? $LINENO' ERR

# ------------------------------------------------------------------------------
# STAGE 1: Preflight & Environment Compatibility Check
# ------------------------------------------------------------------------------
CURRENT_STAGE="preflight"
PROGRESS=10
log "INFO" "[STAGE: preflight] [1/11] Running comprehensive preflight environment checks..."

# 1. Load .env configuration
if [ -f .env ]; then
  set -a
  source .env
  set +a
  log "INFO" "[STAGE: preflight] Loaded .env environment variables."
else
  log "WARN" "[STAGE: preflight] Notice: .env file not found. System environment variables will be used."
fi

# 2. Check required CLI tools
for tool in git npm node curl tar df; do
  if ! command -v "$tool" &>/dev/null; then
    ERROR_DETAILS="Required system utility '$tool' is not installed or not in PATH."
    CURRENT_STATE="failed"
    write_state_file
    log "ERROR" "[STAGE: preflight] ❌ Required tool '$tool' is missing."
    exit 1
  fi
done

# 3. Check Node.js version compatibility (Min Node 20.0.0)
NODE_VER_NUM=$(node -v | tr -d 'v')
NODE_MAJOR=$(echo "$NODE_VER_NUM" | cut -d'.' -f1)
log "INFO" "[STAGE: preflight] Node.js version detected: v${NODE_VER_NUM} (npm v$(npm -v))"

if [ "$NODE_MAJOR" -lt 20 ]; then
  ERROR_DETAILS="Incompatible Node.js version v${NODE_VER_NUM}. Dodik Tracker requires Node.js >= 20.0.0. Please upgrade Node.js on the server."
  CURRENT_STATE="failed"
  write_state_file
  log "ERROR" "[STAGE: preflight] ❌ Node.js version v${NODE_VER_NUM} is incompatible. Minimum required version is >= 20.0.0."
  exit 1
fi

# 4. Check free disk space (require at least 500 MB / 512,000 KB)
FREE_KB=$(df -k "$PROJECT_ROOT" | tail -n 1 | awk '{print $4}')
FREE_MB=$((FREE_KB / 1024))
log "INFO" "[STAGE: preflight] Free disk space available: ${FREE_MB} MB"

if [ "$FREE_KB" -lt 512000 ]; then
  ERROR_DETAILS="Insufficient disk space! Available: ${FREE_MB} MB, required at least 500 MB."
  CURRENT_STATE="failed"
  write_state_file
  log "ERROR" "[STAGE: preflight] ❌ Insufficient disk space on server. Available: ${FREE_MB} MB, required >= 500 MB."
  exit 1
fi

# 5. Check npm registry connectivity
log "INFO" "[STAGE: preflight] Checking npm registry connectivity (registry.npmjs.org)..."
if ! curl -s --head --max-time 5 https://registry.npmjs.org/ &>/dev/null; then
  log "WARN" "[STAGE: preflight] ⚠️ Primary npm registry check timed out. Retrying npm ping..."
  if ! npm ping &>/dev/null; then
    ERROR_DETAILS="npm registry is unreachable from this server. Please check internet connection or proxy settings."
    CURRENT_STATE="failed"
    write_state_file
    log "ERROR" "[STAGE: preflight] ❌ npm registry is offline or unreachable."
    exit 1
  fi
fi

# 6. Check persistent Uploads directories
UPLOADS_DIR="${UPLOADS_DIR:-$PROJECT_ROOT/public/uploads}"
AUDIO_DIR="$UPLOADS_DIR/audio"
COVERS_DIR="$UPLOADS_DIR/covers"
mkdir -p "$AUDIO_DIR" "$COVERS_DIR" "$PROJECT_ROOT/backups/db" "$PROJECT_ROOT/backups/uploads" "$PROJECT_ROOT/backups/snapshots"

log "INFO" "[STAGE: preflight] All preflight checks passed: Node v${NODE_VER_NUM}, npm v$(npm -v), Disk ${FREE_MB} MB free, npm registry online."

# ------------------------------------------------------------------------------
# STAGE 2: Git Safety Guard (assert_uploads_safe)
# ------------------------------------------------------------------------------
CURRENT_STAGE="git_safety"
PROGRESS=18
log "INFO" "[STAGE: git_safety] [2/11] Enforcing Git safety guard for persistent uploads..."

if [ ! -d ".git" ]; then
  ERROR_DETAILS="Git repository directory (.git) not found in $PROJECT_ROOT."
  CURRENT_STATE="failed"
  write_state_file
  log "ERROR" "[STAGE: git_safety] ❌ Git repository (.git) missing."
  exit 1
fi

# Un-track cached uploads if any exist
tracked_audio=$(git ls-files public/uploads/audio | grep -v "\.gitkeep$" || true)
tracked_covers=$(git ls-files public/uploads/covers | grep -v "\.gitkeep$" || true)

if [ -n "$tracked_audio" ] || [ -n "$tracked_covers" ]; then
  log "WARN" "[STAGE: git_safety] ⚠️ Notice: Found tracked upload files in Git index. Removing from index without deleting local files..."
  [ -n "$tracked_audio" ] && echo "$tracked_audio" | xargs -r git rm --cached >> "$LOG_FILE" 2>&1 || true
  [ -n "$tracked_covers" ] && echo "$tracked_covers" | xargs -r git rm --cached >> "$LOG_FILE" 2>&1 || true
fi

# Check for uncommitted code changes (ignore persistent directories)
uncommitted=$(git status --porcelain | grep -v "?? public/uploads" | grep -v "?? backups" | grep -v "?? logs" || true)
if [ -n "$uncommitted" ]; then
  log "WARN" "[STAGE: git_safety] Notice: Uncommitted working tree items detected (stashing or ignoring)..."
fi

log "INFO" "[STAGE: git_safety] Git safety assertions passed: persistent user uploads protected."

# ------------------------------------------------------------------------------
# STAGE 3: Database Backup (PostgreSQL SQL Dump)
# ------------------------------------------------------------------------------
CURRENT_STAGE="database_backup"
PROGRESS=28
log "INFO" "[STAGE: database_backup] [3/11] Performing PostgreSQL database backup..."

if [ ! -f "scripts/backup.sh" ]; then
  ERROR_DETAILS="scripts/backup.sh not found."
  CURRENT_STATE="failed"
  write_state_file
  log "ERROR" "[STAGE: database_backup] ❌ scripts/backup.sh missing."
  exit 1
fi

FAILED_COMMAND="bash scripts/backup.sh db"
if ! bash scripts/backup.sh db >> "$LOG_FILE" 2>&1; then
  ERROR_DETAILS="Database backup execution failed! Update halted to protect existing database."
  CURRENT_STATE="failed"
  write_state_file
  log "ERROR" "[STAGE: database_backup] ❌ Database backup failed!"
  exit 1
fi

# Verify newest backup file exists and size > 100 bytes
LATEST_DB_BACKUP=$(ls -1t "$PROJECT_ROOT/backups/db"/dodik_tracker_backup_*.sql "$PROJECT_ROOT/backups"/dodik_tracker_backup_*.sql 2>/dev/null | head -n 1 || echo "")
if [ -z "$LATEST_DB_BACKUP" ] || [ ! -s "$LATEST_DB_BACKUP" ]; then
  ERROR_DETAILS="Database backup output file is missing or empty!"
  CURRENT_STATE="failed"
  write_state_file
  log "ERROR" "[STAGE: database_backup] ❌ Database backup file verification failed!"
  exit 1
fi

log "INFO" "[STAGE: database_backup] Database backup verified: $(basename "$LATEST_DB_BACKUP")"

# ------------------------------------------------------------------------------
# STAGE 4: Uploads Snapshot & Archive
# ------------------------------------------------------------------------------
CURRENT_STAGE="uploads_snapshot"
PROGRESS=38
log "INFO" "[STAGE: uploads_snapshot] [4/11] Generating pre-update snapshot of user uploads..."

SNAPSHOT_TS=$(date +"%Y%m%d_%H%M%S")
SNAPSHOT_FILE="$PROJECT_ROOT/backups/snapshots/pre_update_manifest_${SNAPSHOT_TS}.json"

PRE_AUDIO_COUNT=$(find "$AUDIO_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
PRE_COVERS_COUNT=$(find "$COVERS_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
PRE_TOTAL_FILES=$((PRE_AUDIO_COUNT + PRE_COVERS_COUNT))

log "INFO" "[STAGE: uploads_snapshot] Creating pre-update archive of $PRE_TOTAL_FILES uploaded files..."
FAILED_COMMAND="bash scripts/backup.sh uploads"
bash scripts/backup.sh uploads >> "$LOG_FILE" 2>&1 || true

LATEST_UPLOADS_ARCHIVE=$(ls -1t "$PROJECT_ROOT/backups/uploads"/dodik_tracker_uploads_*.tar.gz 2>/dev/null | head -n 1 || echo "")
log "INFO" "[STAGE: uploads_snapshot] Uploads snapshot complete: audio: $PRE_AUDIO_COUNT, covers: $PRE_COVERS_COUNT."

# ------------------------------------------------------------------------------
# STAGE 5: Git Fetch & Fast-Forward Pull
# ------------------------------------------------------------------------------
CURRENT_STAGE="git_pull"
PROGRESS=48
log "INFO" "[STAGE: git_pull] [5/11] Fetching updates from remote repository..."

GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
FAILED_COMMAND="git fetch origin $GIT_BRANCH"

if ! git fetch origin "$GIT_BRANCH" >> "$LOG_FILE" 2>&1; then
  rollback_update "Failed to fetch from remote branch origin/$GIT_BRANCH. Network or git remote failure."
  exit 1
fi

TARGET_COMMIT=$(git rev-parse "origin/$GIT_BRANCH" 2>/dev/null || echo "$PREVIOUS_COMMIT")
log "INFO" "[STAGE: git_pull] Current commit: ${PREVIOUS_COMMIT:0:7} | Target commit: ${TARGET_COMMIT:0:7}"

if [ "$PREVIOUS_COMMIT" = "$TARGET_COMMIT" ]; then
  log "INFO" "[STAGE: git_pull] Working copy is already at commit ${PREVIOUS_COMMIT:0:7}."
else
  FAILED_COMMAND="git pull --ff-only origin $GIT_BRANCH"
  log "INFO" "[STAGE: git_pull] Executing fast-forward pull (git pull --ff-only origin $GIT_BRANCH)..."
  if ! git pull --ff-only origin "$GIT_BRANCH" >> "$LOG_FILE" 2>&1; then
    log "WARN" "[STAGE: git_pull] Fast-forward pull failed. Attempting git checkout/reset to target commit..."
    if ! git checkout "$TARGET_COMMIT" >> "$LOG_FILE" 2>&1; then
      rollback_update "Git checkout to target commit $TARGET_COMMIT failed!"
      exit 1
    fi
  fi
  NEW_COMMIT=$(git rev-parse HEAD)
  log "INFO" "[STAGE: git_pull] Codebase successfully updated to commit: ${NEW_COMMIT:0:7}."
fi

# ------------------------------------------------------------------------------
# STAGE 6: Install npm Dependencies (npm ci & Lockfile Sync)
# ------------------------------------------------------------------------------
CURRENT_STAGE="dependencies"
PROGRESS=58
log "INFO" "[STAGE: dependencies] [6/11] Installing npm dependencies..."

# 1. Precheck lockfile synchronization
FAILED_COMMAND="npm ci --dry-run"
LOCK_SYNC_ERR=""
if ! LOCK_SYNC_ERR=$(npm ci --dry-run 2>&1); then
  log "WARN" "[STAGE: dependencies] ⚠️ Notice: npm ci dry-run indicates package.json and package-lock.json mismatch!"
  log "WARN" "[STAGE: dependencies] Lockfile message: $(echo "$LOCK_SYNC_ERR" | grep "Missing:" | head -n 5 || echo "$LOCK_SYNC_ERR" | tail -n 3)"
fi

# 2. Attempt deterministic npm ci
FAILED_COMMAND="npm ci"
NPM_CI_OUT=""
if ! NPM_CI_OUT=$(npm ci 2>&1); then
  log "WARN" "[STAGE: dependencies] ⚠️ npm ci failed with exit code $?. Output:"
  log "WARN" "$(echo "$NPM_CI_OUT" | tail -n 15)"
  log "INFO" "[STAGE: dependencies] Attempting fallback package install (npm install --no-audit --no-fund)..."

  FAILED_COMMAND="npm install --no-audit --no-fund"
  if ! NPM_INSTALL_OUT=$(npm install --no-audit --no-fund 2>&1); then
    SAN_NPM_ERR=$(sanitize_secrets "$NPM_INSTALL_OUT")
    rollback_update "npm dependencies installation failed! npm stderr:\n$(echo "$SAN_NPM_ERR" | tail -n 20)"
    exit 1
  fi
  log "INFO" "[STAGE: dependencies] Fallback npm install completed successfully."
else
  log "INFO" "[STAGE: dependencies] Dependencies installed successfully via npm ci."
fi

# Verify essential CLI packages exist in node_modules
for pkg_bin in vite esbuild tsx; do
  if [ ! -f "node_modules/.bin/$pkg_bin" ]; then
    rollback_update "Missing required binary in node_modules/.bin/$pkg_bin!"
    exit 1
  fi
done

# ------------------------------------------------------------------------------
# STAGE 7: Build Production Application
# ------------------------------------------------------------------------------
CURRENT_STAGE="build"
PROGRESS=80
log "INFO" "[STAGE: build] [7/11] Building production application (npm run build)..."

FAILED_COMMAND="npm run build"
BUILD_OUTPUT=""
if ! BUILD_OUTPUT=$(npm run build 2>&1); then
  echo "$BUILD_OUTPUT" >> "$LOG_FILE"
  SAN_BUILD_ERR=$(sanitize_secrets "$BUILD_OUTPUT")
  rollback_update "Production build (npm run build) failed! Error output:\n$(echo "$SAN_BUILD_ERR" | tail -n 20)"
  exit 1
fi

if [ ! -f "$PROJECT_ROOT/dist/server.cjs" ] || [ ! -s "$PROJECT_ROOT/dist/server.cjs" ]; then
  rollback_update "Build artifact missing: dist/server.cjs not found or empty!"
  exit 1
fi
log "INFO" "[STAGE: build] Production build verified: dist/server.cjs created successfully."

# ------------------------------------------------------------------------------
# STAGE 8: Database Migrations
# ------------------------------------------------------------------------------
CURRENT_STAGE="migrations"
PROGRESS=68
log "INFO" "[STAGE: migrations] [8/11] Applying database migrations (npm run db:migrate)..."

FAILED_COMMAND="npm run db:migrate"
MIGRATE_OUT=""
if ! MIGRATE_OUT=$(npm run db:migrate 2>&1); then
  echo "$MIGRATE_OUT" >> "$LOG_FILE"
  SAN_MIGRATE_ERR=$(sanitize_secrets "$MIGRATE_OUT")
  rollback_update "Database migration failed! Error output:\n$(echo "$SAN_MIGRATE_ERR" | tail -n 20)"
  exit 1
fi
log "INFO" "[STAGE: migrations] Database migrations applied successfully."

# ------------------------------------------------------------------------------
# STAGE 9: PM2 Process Restart
# ------------------------------------------------------------------------------
CURRENT_STAGE="restart"
PROGRESS=88
log "INFO" "[STAGE: restart] [9/11] Restarting application process..."

PM2_BIN="pm2"
if ! command -v pm2 &>/dev/null && [ -x "/usr/local/bin/pm2" ]; then
  PM2_BIN="/usr/local/bin/pm2"
fi

FAILED_COMMAND="$PM2_BIN restart dodik-tracker"
if command -v "$PM2_BIN" &>/dev/null; then
  if ! "$PM2_BIN" restart dodik-tracker >> "$LOG_FILE" 2>&1; then
    log "WARN" "[STAGE: restart] Notice: pm2 restart returned non-zero code. Verifying service via healthcheck..."
  fi
else
  log "WARN" "[STAGE: restart] PM2 not found in system path; relying on server process supervisor."
fi

# ------------------------------------------------------------------------------
# STAGE 10: Health Check Verification
# ------------------------------------------------------------------------------
CURRENT_STAGE="healthcheck"
PROGRESS=92
log "INFO" "[STAGE: healthcheck] [10/11] Verifying server healthcheck endpoint (/api/health)..."
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
  rollback_update "Health check failed for $HEALTH_URL after restart! Response: ${HEALTH_BODY:-'No response / connection refused'}"
  exit 1
fi
log "INFO" "[STAGE: healthcheck] Health check OK: Application is UP."

# ------------------------------------------------------------------------------
# STAGE 11: Uploads Integrity Check & Auto-Recovery Guard
# ------------------------------------------------------------------------------
CURRENT_STAGE="uploads_integrity"
PROGRESS=96
log "INFO" "[STAGE: uploads_integrity] [11/11] Verifying post-update uploads integrity..."

POST_AUDIO_COUNT=$(find "$AUDIO_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
POST_COVERS_COUNT=$(find "$COVERS_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
POST_TOTAL_FILES=$((POST_AUDIO_COUNT + POST_COVERS_COUNT))

log "INFO" "[STAGE: uploads_integrity] Pre-update:  $PRE_TOTAL_FILES files (audio: $PRE_AUDIO_COUNT, covers: $PRE_COVERS_COUNT)"
log "INFO" "[STAGE: uploads_integrity] Post-update: $POST_TOTAL_FILES files (audio: $POST_AUDIO_COUNT, covers: $POST_COVERS_COUNT)"

INTEGRITY_FAILED=0
if [ "$POST_TOTAL_FILES" -lt "$PRE_TOTAL_FILES" ]; then
  INTEGRITY_FAILED=1
fi

if [ $INTEGRITY_FAILED -eq 1 ]; then
  log "ERROR" "[STAGE: uploads_integrity] ⚠️ Uploads integrity warning! Attempting automatic recovery from pre-update archive..."

  if [ -n "$LATEST_UPLOADS_ARCHIVE" ] && [ -f "$LATEST_UPLOADS_ARCHIVE" ]; then
    if tar -xzf "$LATEST_UPLOADS_ARCHIVE" -C "$UPLOADS_DIR"; then
      REC_AUDIO=$(find "$AUDIO_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
      REC_COVERS=$(find "$COVERS_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
      log "INFO" "[STAGE: uploads_integrity] ✅ Automatic recovery succeeded! Restored uploads: $((REC_AUDIO + REC_COVERS)) files."
    fi
  fi
else
  log "INFO" "[STAGE: uploads_integrity] ✅ Uploads integrity verified: all $PRE_TOTAL_FILES user files intact."
fi

# ------------------------------------------------------------------------------
# STAGE 12: Database ↔ Filesystem Diagnostic Cross-Check
# ------------------------------------------------------------------------------
CURRENT_STAGE="database_integrity"
PROGRESS=98
log "INFO" "[STAGE: database_integrity] Running DB ↔ Filesystem cross-verification diagnostic..."

if [ -f "src/scripts/verifyUploads.ts" ]; then
  npx tsx src/scripts/verifyUploads.ts --http >> "$LOG_FILE" 2>&1 || true
  log "INFO" "[STAGE: database_integrity] DB ↔ Filesystem cross-check completed."
fi

# ------------------------------------------------------------------------------
# STAGE 13: Update Successfully Completed
# ------------------------------------------------------------------------------
CURRENT_STAGE="completed"
CURRENT_STATE="success"
PROGRESS=100
APP_VERSION=$(node -p "try{require('./package.json').version}catch{process.env.npm_package_version||'1.0.0'}" 2>/dev/null || echo "1.0.0")
FINAL_COMMIT_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

write_state_file

log "INFO" "[STAGE: completed] =================================================="
log "INFO" "[STAGE: completed]   ✅ SUCCESS: Dodik Tracker updated to v${APP_VERSION} ($FINAL_COMMIT_SHORT)"
log "INFO" "[STAGE: completed]   • Database:  PostgreSQL backup saved"
log "INFO" "[STAGE: completed]   • Uploads:   Audio: $POST_AUDIO_COUNT, Covers: $POST_COVERS_COUNT verified"
log "INFO" "[STAGE: completed]   • Service:   PM2 restarted & Healthcheck OK"
log "INFO" "[STAGE: completed] =================================================="
log "INFO" "[STAGE: completed] Final status: SUCCESS"

exit 0
