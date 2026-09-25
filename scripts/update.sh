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

CURRENT_STAGE="init"
log "INFO" "[STAGE: init] =================================================="
log "INFO" "[STAGE: init]     🚀 Dodik Tracker - Safe Update Engine         "
log "INFO" "[STAGE: init] =================================================="
log "INFO" "[STAGE: init] Update process started."

# Trap for unexpected errors to log failure and current stage
trap 'catch_error $? $LINENO' ERR

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

# 4. Load environment variables safely
CURRENT_STAGE="env_check"
log "INFO" "[STAGE: env_check] Loading environment configuration..."
if [ -f .env ]; then
  set -a
  source .env
  set +a
  log "INFO" "[STAGE: env_check] Loaded .env configuration successfully."
else
  log "WARN" "[STAGE: env_check] Notice: .env file not found. System environment variables will be used."
fi

# 5. Verify required host tools
log "INFO" "[STAGE: env_check] Verifying required tools..."
for tool in git npm node curl; do
  if ! command -v "$tool" &>/dev/null; then
    log "ERROR" "[STAGE: env_check] ❌ Required tool '$tool' is not installed or not in PATH."
    log "ERROR" "[STAGE: env_check] Please install missing prerequisites before updating."
    exit 1
  fi
done
log "INFO" "[STAGE: env_check] Core tools verified (git, npm, node, curl)."

# Check PM2
if ! command -v pm2 &>/dev/null; then
  log "WARN" "[STAGE: env_check] ⚠️ Notice: pm2 not found in default PATH. Trying global lookup..."
fi

# 6. Node.js version diagnostics
NODE_VER=$(node -v 2>/dev/null || echo "unknown")
log "INFO" "[STAGE: env_check] Current Node version: $NODE_VER"
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "0")
if [ "$NODE_MAJOR" -lt 20 ]; then
  log "WARN" "[STAGE: env_check] ⚠️ Warning: Node version is $NODE_VER. Recommended Node >=20 LTS."
fi

# 7. Check Git repository and uncommitted changes
CURRENT_STAGE="git_check"
log "INFO" "[STAGE: git_check] Verifying Git repository status..."
if [ ! -d ".git" ]; then
  log "ERROR" "[STAGE: git_check] ❌ Git repository (.git) not found in $PROJECT_ROOT."
  exit 1
fi

GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
CURRENT_COMMIT_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
log "INFO" "[STAGE: git_check] Current branch: $GIT_BRANCH ($CURRENT_COMMIT_SHORT)"

UNCOMMITTED_CHANGES=$(git status --porcelain)
if [ -n "$UNCOMMITTED_CHANGES" ]; then
  log "ERROR" "[STAGE: git_check] ❌ Uncommitted local code modifications detected in repository:"
  echo "$UNCOMMITTED_CHANGES" >&2
  log "ERROR" "[STAGE: git_check] Update halted to preserve your changes. Please commit or stash modifications."
  exit 1
fi
log "INFO" "[STAGE: git_check] Working tree is clean."

# 8. Database backup BEFORE any code modification
CURRENT_STAGE="backup"
log "INFO" "[STAGE: backup] [1/6] Performing database backup before code updates..."
if [ ! -f "scripts/backup.sh" ]; then
  log "ERROR" "[STAGE: backup] ❌ scripts/backup.sh not found! UPDATE MUST STOP to prevent data loss."
  exit 1
fi

if ! bash scripts/backup.sh create >> "$LOG_FILE" 2>&1; then
  log "ERROR" "[STAGE: backup] ❌ Database backup failed! UPDATE MUST STOP to prevent data loss."
  exit 1
fi
log "INFO" "[STAGE: backup] Database backup successfully created and validated in backups/ directory."

# 9. Fetch remote changes and check if update is needed
CURRENT_STAGE="git_pull"
log "INFO" "[STAGE: git_pull] [2/6] Fetching latest changes from remote (origin main)..."
if ! git fetch origin main >> "$LOG_FILE" 2>&1; then
  log "ERROR" "[STAGE: git_pull] ❌ Failed to fetch from origin main. Check network connection and Git remote settings."
  exit 1
fi

REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null || echo "$CURRENT_COMMIT")
REMOTE_COMMIT_SHORT=$(git rev-parse --short origin/main 2>/dev/null || echo "$CURRENT_COMMIT_SHORT")
log "INFO" "[STAGE: git_pull] Target remote commit: $REMOTE_COMMIT ($REMOTE_COMMIT_SHORT)"

if [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
  log "INFO" "[STAGE: completed] ✅ Dodik Tracker is already up to date at commit $CURRENT_COMMIT_SHORT. No update needed."
  log "INFO" "[STAGE: completed] Final status: UP_TO_DATE"
  exit 0
fi

# 10. Fast-forward pull
log "INFO" "[STAGE: git_pull] [3/6] Pulling updates (git pull --ff-only origin main)..."
if ! git pull --ff-only origin main >> "$LOG_FILE" 2>&1; then
  log "ERROR" "[STAGE: git_pull] ❌ Fast-forward pull failed! Local and remote branches have diverged."
  log "ERROR" "[STAGE: git_pull] Automatic merge is disabled for safety. Current commit remains: $(git rev-parse --short HEAD)"
  exit 1
fi
NEW_COMMIT=$(git rev-parse HEAD)
NEW_COMMIT_SHORT=$(git rev-parse --short HEAD)
log "INFO" "[STAGE: git_pull] Codebase updated to commit: $NEW_COMMIT ($NEW_COMMIT_SHORT)."

# 11. Install dependencies
CURRENT_STAGE="install"
log "INFO" "[STAGE: install] [4/6] Installing npm dependencies..."
if ! npm install >> "$LOG_FILE" 2>&1; then
  log "ERROR" "[STAGE: install] ❌ npm install failed! Check logs in logs/update.log."
  exit 1
fi
log "INFO" "[STAGE: install] Dependencies installed successfully."

# 12. Run database migrations via existing project mechanism
CURRENT_STAGE="migration"
log "INFO" "[STAGE: migration] [5/6] Executing database migrations (npm run db:migrate)..."
if ! npm run db:migrate >> "$LOG_FILE" 2>&1; then
  log "ERROR" "[STAGE: migration] ❌ Database migration failed! Current commit: $(git rev-parse --short HEAD)."
  log "ERROR" "[STAGE: migration] Database can be restored to the pre-update state using: ./scripts/restore.sh"
  exit 1
fi
log "INFO" "[STAGE: migration] Database migrations successfully applied."

# 13. Build production bundle and verify dist/server.cjs
CURRENT_STAGE="build"
log "INFO" "[STAGE: build] [6/6] Building production application (npm run build)..."
if ! npm run build >> "$LOG_FILE" 2>&1; then
  log "ERROR" "[STAGE: build] ❌ Production build failed! Check logs in logs/update.log."
  exit 1
fi

if [ ! -f "$PROJECT_ROOT/dist/server.cjs" ]; then
  log "ERROR" "[STAGE: build] ❌ Build artifact missing: dist/server.cjs was not found!"
  exit 1
fi
log "INFO" "[STAGE: build] Production bundle verified: dist/server.cjs exists."

# 14. PM2 Restart & Health Verification
CURRENT_STAGE="restart"
log "INFO" "[STAGE: restart] Restarting PM2 process 'dodik-tracker'..."
PM2_BIN="pm2"
if ! command -v pm2 &>/dev/null; then
  if [ -x "/usr/local/bin/pm2" ]; then
    PM2_BIN="/usr/local/bin/pm2"
  fi
fi

if command -v "$PM2_BIN" &>/dev/null; then
  if ! "$PM2_BIN" restart dodik-tracker >> "$LOG_FILE" 2>&1; then
    log "WARN" "[STAGE: restart] Notice: pm2 restart dodik-tracker returned non-zero code. Checking if service runs..."
  fi
fi

CURRENT_STAGE="healthcheck"
log "INFO" "[STAGE: healthcheck] Waiting for application to start..."
sleep 3

HEALTH_URL="http://localhost:3000/api/health"
HEALTH_SUCCESS=0
HEALTH_BODY=""

for attempt in {1..8}; do
  HEALTH_BODY=$(curl -fsS "$HEALTH_URL" 2>/dev/null || echo "")
  if [[ "$HEALTH_BODY" =~ \"status\"[[:space:]]*:[[:space:]]*\"UP\" ]]; then
    HEALTH_SUCCESS=1
    break
  fi
  sleep 2
done

CURRENT_STAGE="completed"
if [ $HEALTH_SUCCESS -eq 1 ]; then
  CURRENT_VER="1.0.0"
  if [ -f "package.json" ]; then
    CURRENT_VER=$(node -p "try{require('./package.json').version}catch{process.env.npm_package_version||'1.0.0'}" 2>/dev/null || echo "1.0.0")
  fi
  log "INFO" "[STAGE: completed] Live Health Check: OK ($HEALTH_BODY)"
  log "INFO" "[STAGE: completed] =================================================="
  log "INFO" "[STAGE: completed]   ✅ SUCCESS: Dodik Tracker updated to v${CURRENT_VER} ($NEW_COMMIT_SHORT)"
  log "INFO" "[STAGE: completed] =================================================="
  log "INFO" "[STAGE: completed] Final status: SUCCESS"
  exit 0
else
  log "ERROR" "[STAGE: healthcheck] =================================================="
  log "ERROR" "[STAGE: healthcheck]   ❌ FAILURE: Health check failed for $HEALTH_URL after update!"
  log "ERROR" "[STAGE: healthcheck]   Response received: ${HEALTH_BODY:-'<empty or connection refused>'}"
  log "ERROR" "[STAGE: healthcheck] =================================================="
  log "ERROR" "[STAGE: healthcheck] Final status: FAILURE"
  exit 1
fi
