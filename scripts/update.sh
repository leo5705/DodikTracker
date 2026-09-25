#!/usr/bin/env bash
# ==============================================================================
# Dodik Tracker - Production Update Engine
# Safe, atomic, and idempotent update mechanism
# Can be executed via CLI (`npm run update`) or called by backend Admin API.
# ==============================================================================

set -euo pipefail

# 1. Determine project root directory regardless of current working directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

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

# 3. Setup logging (bounded log file with timestamps, no secrets)
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/update.log"
mkdir -p "$LOG_DIR"

# Rotate/truncate log if larger than 2MB (keep last 2000 lines)
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

log "INFO" "=================================================="
log "INFO" "    🚀 Dodik Tracker - Safe Update Engine         "
log "INFO" "=================================================="
log "INFO" "Update process started."

# Trap for unexpected errors to log failure and current stage
CURRENT_STAGE="Initialization"
trap 'catch_error $? $LINENO' ERR

catch_error() {
  local exit_code="$1"
  local line_no="$2"
  log "ERROR" "=================================================="
  log "ERROR" "❌ UPDATE FAILED at stage: '$CURRENT_STAGE' (Line $line_no, exit code $exit_code)"
  if command -v git &>/dev/null && [ -d ".git" ]; then
    log "ERROR" "Current Git commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
  fi
  log "ERROR" "Review logs at: logs/update.log"
  log "ERROR" "=================================================="
  exit "$exit_code"
}

# 4. Load environment variables safely
CURRENT_STAGE="Loading environment"
if [ -f .env ]; then
  set -a
  source .env
  set +a
  log "INFO" "Loaded .env configuration successfully."
else
  log "WARN" "Notice: .env file not found. System environment variables will be used."
fi

# 5. Verify required host tools
CURRENT_STAGE="Verifying required tools"
for tool in git npm node pg_dump pm2 curl; do
  if ! command -v "$tool" &>/dev/null; then
    log "ERROR" "❌ Required tool '$tool' is not installed or not in PATH."
    log "ERROR" "Please install missing prerequisites before updating."
    exit 1
  fi
done
log "INFO" "All required tools verified (git, npm, node, pg_dump, pm2, curl)."

# 6. Node.js version diagnostics
CURRENT_STAGE="Node version verification"
NODE_VER=$(node -v 2>/dev/null || echo "unknown")
log "INFO" "Current Node version: $NODE_VER"
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "0")
if [ "$NODE_MAJOR" -lt 22 ]; then
  log "WARN" "⚠️ Warning: Node version is $NODE_VER. Note: Some dependencies (such as firebase-admin) may recommend Node >=22. Node upgrade is managed separately."
fi

# 7. Check Git repository and uncommitted changes
CURRENT_STAGE="Checking Git repository"
if [ ! -d ".git" ]; then
  log "ERROR" "❌ Git repository (.git) not found in $PROJECT_ROOT."
  exit 1
fi

GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
CURRENT_COMMIT=$(git rev-parse HEAD)
CURRENT_COMMIT_SHORT=$(git rev-parse --short HEAD)
log "INFO" "Current branch: $GIT_BRANCH"
log "INFO" "Current commit: $CURRENT_COMMIT ($CURRENT_COMMIT_SHORT)"

UNCOMMITTED_CHANGES=$(git status --porcelain)
if [ -n "$UNCOMMITTED_CHANGES" ]; then
  log "ERROR" "❌ Uncommitted local changes detected in repository:"
  echo "$UNCOMMITTED_CHANGES" >&2
  log "ERROR" "Update halted to preserve your changes. Please commit or stash local modifications before updating."
  exit 1
fi
log "INFO" "Working tree is clean. No uncommitted modifications."

# 8. Database backup BEFORE any code modification
CURRENT_STAGE="Database backup"
log "INFO" "[1/6] Performing database backup before code updates..."
if [ ! -f "scripts/backup.sh" ]; then
  log "ERROR" "❌ scripts/backup.sh not found! UPDATE MUST STOP to prevent data loss."
  exit 1
fi

if ! bash scripts/backup.sh >> "$LOG_FILE" 2>&1; then
  log "ERROR" "❌ Database backup failed! UPDATE MUST STOP to prevent data loss."
  exit 1
fi
log "INFO" "Backup successfully created in backups/ directory."

# 9. Fetch remote changes and check if update is needed
CURRENT_STAGE="Fetching remote changes"
log "INFO" "[2/6] Fetching latest changes from remote (origin main)..."
if ! git fetch origin main >> "$LOG_FILE" 2>&1; then
  log "ERROR" "❌ Failed to fetch from origin main. Check network connection and Git remote settings."
  exit 1
fi

REMOTE_COMMIT=$(git rev-parse origin/main)
REMOTE_COMMIT_SHORT=$(git rev-parse --short origin/main)
log "INFO" "Target remote commit: $REMOTE_COMMIT ($REMOTE_COMMIT_SHORT)"

if [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
  log "INFO" "✅ Dodik Tracker is already up to date at commit $CURRENT_COMMIT_SHORT. No update needed."
  log "INFO" "Final status: UP_TO_DATE"
  exit 0
fi

# 10. Fast-forward pull
CURRENT_STAGE="Git pull"
log "INFO" "[3/6] Pulling updates (git pull --ff-only origin main)..."
if ! git pull --ff-only origin main >> "$LOG_FILE" 2>&1; then
  log "ERROR" "❌ Fast-forward pull failed! Local and remote branches have diverged."
  log "ERROR" "Automatic merge is disabled for safety. Current commit remains: $(git rev-parse --short HEAD)"
  exit 1
fi
NEW_COMMIT=$(git rev-parse HEAD)
NEW_COMMIT_SHORT=$(git rev-parse --short HEAD)
log "INFO" "Codebase updated to commit: $NEW_COMMIT ($NEW_COMMIT_SHORT)."

# 11. Install dependencies
CURRENT_STAGE="Installing npm dependencies"
log "INFO" "[4/6] Installing npm dependencies..."
if ! npm install >> "$LOG_FILE" 2>&1; then
  log "ERROR" "❌ npm install failed! Check logs in logs/update.log."
  exit 1
fi
log "INFO" "Dependencies installed successfully."

# 12. Run database migrations via existing project mechanism
CURRENT_STAGE="Database migrations"
log "INFO" "[5/6] Executing database migrations (npm run db:migrate)..."
if ! npm run db:migrate >> "$LOG_FILE" 2>&1; then
  log "ERROR" "❌ Database migration failed! Current commit: $(git rev-parse --short HEAD)."
  log "ERROR" "Database can be restored to the pre-update state using: ./scripts/restore.sh"
  exit 1
fi
log "INFO" "Database migrations successfully applied."

# 13. Build production bundle and verify dist/server.cjs
CURRENT_STAGE="Production build"
log "INFO" "[6/6] Building production application (npm run build)..."
if ! npm run build >> "$LOG_FILE" 2>&1; then
  log "ERROR" "❌ Production build failed! Check logs in logs/update.log."
  exit 1
fi

if [ ! -f "$PROJECT_ROOT/dist/server.cjs" ]; then
  log "ERROR" "❌ Build artifact missing: dist/server.cjs was not found!"
  exit 1
fi
log "INFO" "Production bundle verified: dist/server.cjs exists."

# 14. PM2 Restart & Health Verification
CURRENT_STAGE="PM2 restart and health check"
log "INFO" "Restarting PM2 process 'dodik-tracker'..."
if ! pm2 restart dodik-tracker >> "$LOG_FILE" 2>&1; then
  log "ERROR" "❌ Failed to restart PM2 process 'dodik-tracker'!"
  pm2 status dodik-tracker 2>&1 | tee -a "$LOG_FILE" || true
  exit 1
fi

log "INFO" "Waiting for application to start..."
sleep 3

HEALTH_URL="http://localhost:3000/api/health"
HEALTH_SUCCESS=0
HEALTH_BODY=""

for attempt in {1..6}; do
  HEALTH_BODY=$(curl -fsS "$HEALTH_URL" 2>/dev/null || echo "")
  if [[ "$HEALTH_BODY" =~ \"status\"[[:space:]]*:[[:space:]]*\"UP\" ]]; then
    HEALTH_SUCCESS=1
    break
  fi
  sleep 2
done

if [ $HEALTH_SUCCESS -eq 1 ]; then
  CURRENT_VER=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")
  log "INFO" "Live Health Check: OK ($HEALTH_BODY)"
  log "INFO" "=================================================="
  log "INFO" "  ✅ SUCCESS: Dodik Tracker updated to v${CURRENT_VER} ($NEW_COMMIT_SHORT)"
  log "INFO" "=================================================="
  log "INFO" "Final status: SUCCESS"
  exit 0
else
  log "ERROR" "=================================================="
  log "ERROR" "  ❌ FAILURE: Health check failed for $HEALTH_URL after update!"
  log "ERROR" "  Response received: ${HEALTH_BODY:-'<empty or connection refused>'}"
  log "ERROR" "  PM2 Status:"
  pm2 status dodik-tracker 2>&1 | tee -a "$LOG_FILE" || true
  log "ERROR" "  Recent PM2 logs:"
  pm2 logs dodik-tracker --lines 40 --nostream 2>&1 | tee -a "$LOG_FILE" || true
  log "ERROR" "=================================================="
  log "ERROR" "Final status: FAILURE"
  exit 1
fi
