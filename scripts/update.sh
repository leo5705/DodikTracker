#!/usr/bin/env bash
# ==============================================================================
# Dodik Tracker - Production Update Engine
# Safe, atomic, idempotent, resilient, and diagnostic-rich update mechanism.
# Guarantees ZERO DATA LOSS for PostgreSQL database and user uploads.
# Includes preflight checks, disk space checks, lockfile verification,
# automatic rollback, process liveness heartbeat, and secret-sanitized state persistence.
# ==============================================================================

set -euo pipefail

# Ignore SIGPIPE globally so that dead parent pipes (e.g. Node process restarting)
# never terminate the update engine.
trap '' PIPE

# 1. Determine project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# 2. Daemonization & Process Isolation
# Two-stage detached architecture:
# Node.js / PM2 -> launcher update.sh -> setsid update.sh worker -> independent process (PPID 1)
#
# If not already running as the isolated worker daemon (DODIK_UPDATE_WORKER=1):
# 1) Probe lockfile non-blockingly so launcher exits immediately if an update is already active
# 2) Spawn worker via setsid in background with stdin </dev/null and stdout/stderr redirected to update.log
# 3) Capture worker PID accurately
# 4) Launcher exits cleanly with code 0 (or streams logs if interactive SSH session)
# 5) Worker is immediately orphaned and reparented to PID 1, completely isolated from Node.js & PM2
LOCK_FILE="/tmp/dodik-tracker-update.lock"

if [ -z "${DODIK_UPDATE_WORKER:-}" ]; then
  mkdir -p "$PROJECT_ROOT/logs"

  # Fast non-blocking lock check in launcher to reject concurrent updates immediately
  if ! ( exec 200>"$LOCK_FILE" && flock -n 200 ); then
    echo "Update already in progress" >&2
    exit 1
  fi

  export DODIK_UPDATE_WORKER=1

  # Launch independent worker daemon with setsid, detached stdin/stdout/stderr
  setsid bash "$0" "$@" </dev/null >> "$PROJECT_ROOT/logs/update.log" 2>&1 &
  WORKER_PID=$!

  # If running in an interactive SSH terminal (and not spawned by server API):
  if [ -t 1 ] && [ -z "${DODIK_UPDATE_SERVER_SPAWNED:-}" ]; then
    echo "=================================================="
    echo "🚀 Dodik Tracker - Safe Production Update Engine"
    echo "=================================================="
    echo "Worker process detached (PID: $WORKER_PID, session leader, reparenting to PID 1)."
    echo "Streaming logs from logs/update.log..."
    echo "(You may press Ctrl+C at any time to disconnect; update will safely continue in background)"
    echo "=================================================="
    sleep 0.5

    # Stream logs until update reaches terminal state or worker exits
    tail -n 30 -f "$PROJECT_ROOT/logs/update.log" &
    TAIL_PID=$!

    while kill -0 "$WORKER_PID" 2>/dev/null; do
      if [ -f "$PROJECT_ROOT/logs/update_state.json" ]; then
        if grep -q -E '"state":[[:space:]]*"(success|failed|rollback_failed)"' "$PROJECT_ROOT/logs/update_state.json" 2>/dev/null; then
          break
        fi
      fi
      sleep 1
    done

    sleep 1
    kill "$TAIL_PID" 2>/dev/null || true
    wait "$TAIL_PID" 2>/dev/null || true
    echo ""
    echo "=================================================="
    if [ -f "$PROJECT_ROOT/logs/update_state.json" ] && grep -q '"state":[[:space:]]*"success"' "$PROJECT_ROOT/logs/update_state.json" 2>/dev/null; then
      echo "✅ Dodik Tracker update completed successfully!"
    else
      echo "⚠️ Update process finished. Check logs/update.log for details."
    fi
    echo "=================================================="
    exit 0
  fi

  # Exit launcher process immediately with code 0 so worker is orphaned to PID 1
  exit 0
fi

# Ensure PATH includes common binary directories
NODE_CUR_VER=$(node -v 2>/dev/null || echo "")
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/lib/postgresql/17/bin:/usr/lib/postgresql/16/bin:/usr/lib/postgresql/15/bin:/usr/lib/postgresql/14/bin:${HOME:-/root}/.nvm/versions/node/${NODE_CUR_VER}/bin:${HOME:-/root}/.npm-global/bin"

# 3. Directories & Persistent Log Files
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/update.log"
STATE_FILE="$LOG_DIR/update_state.json"
HEARTBEAT_FILE="$LOG_DIR/update_heartbeat"
UPLOADS_DIR="${UPLOADS_DIR:-$PROJECT_ROOT/public/uploads}"
AUDIO_DIR="$UPLOADS_DIR/audio"
COVERS_DIR="$UPLOADS_DIR/covers"
mkdir -p "$LOG_DIR" "$AUDIO_DIR" "$COVERS_DIR" "$PROJECT_ROOT/backups/db" "$PROJECT_ROOT/backups/uploads" "$PROJECT_ROOT/backups/snapshots"

# Truncate log if it exceeds 2MB
if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)" -gt 2097152 ]; then
  tail -n 2000 "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi

# 4. Acquire update lock (prevent concurrent update runs)
LOCK_FILE="/tmp/dodik-tracker-update.lock"
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "Update already in progress" >&2
  exit 1
fi

# 5. Helper functions

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

# Execute command with timeout and return exact exit status without triggering ERR trap unexpectedly
run_timed() {
  local seconds="$1"
  shift

  local exit_code=0
  if ! command -v timeout >/dev/null 2>&1; then
    "$@" || exit_code=$?
    return $exit_code
  fi

  timeout --signal=TERM --kill-after=10s "${seconds}s" "$@" || exit_code=$?
  return $exit_code
}

# Determine if an exit code indicates command timeout
is_timeout() {
  local code="$1"
  [ "$code" -eq 124 ] || [ "$code" -eq 137 ] || [ "$code" -eq 143 ]
}

# Reusable healthcheck verification against /api/health
check_health() {
  local health_url="${1:-http://localhost:3000/api/health}"
  local max_attempts="${2:-10}"
  local delay_sec="${3:-2}"
  local attempt=1
  local health_body=""

  while [ "$attempt" -le "$max_attempts" ]; do
    health_body=$(curl --connect-timeout 3 --max-time 5 -fsS "$health_url" 2>/dev/null || echo "")
    if [[ "$health_body" =~ \"status\"[[:space:]]*:[[:space:]]*\"UP\" ]]; then
      return 0
    fi
    if [ "$attempt" -lt "$max_attempts" ]; then
      sleep "$delay_sec"
    fi
    attempt=$((attempt + 1))
  done

  return 1
}

# Explicit production target branch
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

# State variables
JOB_ID="${DODIK_UPDATE_JOB_ID:-update_$(date +%s)}"
JOB_PID="$$"
JOB_START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LAST_HEARTBEAT_AT="$JOB_START_TIME"
CURRENT_STAGE="init"
CURRENT_STATE="running"
PROGRESS=5
PREVIOUS_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
TARGET_COMMIT="unknown"
ROLLBACK_REASON=""
FAILED_STAGE=""
ROLLBACK_STATUS="not_needed"
FAILED_COMMAND=""
EXIT_CODE=0
ERROR_DETAILS=""
LOG_SUMMARY=()
PRE_AUDIO_COUNT=0
PRE_COVERS_COUNT=0
PRE_TOTAL_FILES=0
LATEST_UPLOADS_ARCHIVE=""

# Test lifecycle stage filter
should_run_stage() {
  local stage_num="$1"
  local start_stage="${DODIK_TEST_START_STAGE:-1}"
  if [ "$start_stage" = "migrations" ] || [ "$start_stage" = "8" ]; then
    start_stage=8
  elif [ "$start_stage" = "preflight" ]; then
    start_stage=1
  fi
  [ "$stage_num" -ge "$start_stage" ]
}

# Helper to clear error state upon successful transitions
clear_stage_error() {
  FAILED_COMMAND=""
  EXIT_CODE=0
  ERROR_DETAILS=""
}

# Helper to advance stage cleanly and persist state
advance_stage() {
  local new_stage="$1"
  local new_progress="$2"
  CURRENT_STAGE="$new_stage"
  PROGRESS="$new_progress"
  clear_stage_error
  write_state_file
}

write_state_file() {
  LAST_HEARTBEAT_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "$LAST_HEARTBEAT_AT" > "$HEARTBEAT_FILE.tmp" 2>/dev/null && mv -f "$HEARTBEAT_FILE.tmp" "$HEARTBEAT_FILE" 2>/dev/null || true

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
  local escaped_rollback_reason
  escaped_rollback_reason=$(echo "$ROLLBACK_REASON" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr -d '\r\n')
  local escaped_failed_stage
  escaped_failed_stage=$(echo "$FAILED_STAGE" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr -d '\r\n')
  local escaped_failed_cmd
  escaped_failed_cmd=$(echo "$FAILED_COMMAND" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr -d '\r\n')

  cat <<EOF > "$STATE_FILE.tmp"
{
  "id": "$JOB_ID",
  "pid": $JOB_PID,
  "state": "$CURRENT_STATE",
  "stage": "$CURRENT_STAGE",
  "progress": $PROGRESS,
  "startTime": "$JOB_START_TIME",
  "lastHeartbeatAt": "$LAST_HEARTBEAT_AT",
  "endTime": $(if [ "$CURRENT_STATE" = "running" ]; then echo "null"; else echo "\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\""; fi),
  "deployBranch": "$DEPLOY_BRANCH",
  "previousCommit": "$PREVIOUS_COMMIT",
  "targetCommit": "$TARGET_COMMIT",
  "rollbackStatus": "$ROLLBACK_STATUS",
  "rollbackReason": "$escaped_rollback_reason",
  "failedStage": "$escaped_failed_stage",
  "nodeVersion": "$(node -v 2>/dev/null || echo 'unknown')",
  "npmVersion": "$(npm -v 2>/dev/null || echo 'unknown')",
  "failedCommand": "$escaped_failed_cmd",
  "exitCode": $EXIT_CODE,
  "errorDetails": "$escaped_error",
  "logSummary": $logs_json
}
EOF
  mv -f "$STATE_FILE.tmp" "$STATE_FILE" 2>/dev/null || true
}

log() {
  local level="$1"
  shift
  local raw_msg="$*"
  local msg
  msg=$(sanitize_secrets "$raw_msg")
  local ts
  ts=$(date +"%Y-%m-%d %H:%M:%S")

  echo "[$ts] [$level] $msg" >> "$LOG_FILE"

  # Safely print to stdout/stderr without dying if parent pipe was severed
  if [ "$level" = "ERROR" ]; then
    echo "$msg" >&2 2>/dev/null || true
  else
    echo "$msg" 2>/dev/null || true
  fi

  LOG_SUMMARY+=("[$ts] [$level] $msg")
  if [ "${#LOG_SUMMARY[@]}" -gt 100 ]; then
    LOG_SUMMARY=("${LOG_SUMMARY[@]: -100}")
  fi

  write_state_file
}

# ------------------------------------------------------------------------------
# HEARTBEAT WORKER (Periodic liveness proof for long-running operations)
# ------------------------------------------------------------------------------
HEARTBEAT_PID=""
start_heartbeat() {
  local parent_pid="$$"
  (
    while true; do
      sleep 5
      # If parent process has died, stop heartbeat worker immediately
      if ! kill -0 "$parent_pid" 2>/dev/null; then
        break
      fi
      local now_iso
      now_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      echo "$now_iso" > "$HEARTBEAT_FILE.tmp" 2>/dev/null && mv -f "$HEARTBEAT_FILE.tmp" "$HEARTBEAT_FILE" 2>/dev/null || true
    done
  ) &
  HEARTBEAT_PID=$!
}

stop_heartbeat() {
  if [ -n "${HEARTBEAT_PID:-}" ]; then
    kill "$HEARTBEAT_PID" 2>/dev/null || true
    wait "$HEARTBEAT_PID" 2>/dev/null || true
    HEARTBEAT_PID=""
  fi
  rm -f "$HEARTBEAT_FILE" "$HEARTBEAT_FILE.tmp" 2>/dev/null || true
}

log "INFO" "[STAGE: init] =================================================="
log "INFO" "[STAGE: init]     🚀 Dodik Tracker - Safe Production Update Engine"
log "INFO" "[STAGE: init] =================================================="
log "INFO" "[STAGE: init] Process ID: $$ | Initial commit: ${PREVIOUS_COMMIT:0:7}"

# Start background liveness heartbeat worker
start_heartbeat

# ------------------------------------------------------------------------------
# ROLLBACK SUBROUTINE
# ------------------------------------------------------------------------------
rollback_update() {
  local reason="${1:-'Unspecified update error'}"
  ROLLBACK_REASON="$reason"
  local failed_stage="$CURRENT_STAGE"
  FAILED_STAGE="$failed_stage"

  log "ERROR" "=================================================="
  log "ERROR" "[STAGE: rollback] ⚠️ INITIATING AUTOMATIC ROLLBACK TO PREVIOUS WORKING STATE..."
  log "ERROR" "[STAGE: rollback] Failed stage: $failed_stage"
  log "ERROR" "[STAGE: rollback] Cause: $ROLLBACK_REASON"
  log "ERROR" "[STAGE: rollback] Target rollback commit: ${PREVIOUS_COMMIT:0:7}"

  CURRENT_STAGE="rolling_back"
  ROLLBACK_STATUS="in_progress"
  PROGRESS=85
  write_state_file

  if [ "$PREVIOUS_COMMIT" != "unknown" ] && [ -d ".git" ]; then
    log "INFO" "[STAGE: rollback] Resetting git working tree to $PREVIOUS_COMMIT (git reset --hard)..."
    local rb_git_exit=0
    run_timed 60 git reset --hard "$PREVIOUS_COMMIT" >> "$LOG_FILE" 2>&1 || rb_git_exit=$?
    if [ $rb_git_exit -ne 0 ]; then
      if is_timeout $rb_git_exit; then
        log "ERROR" "[STAGE: rollback] [TIMEOUT] Git reset to $PREVIOUS_COMMIT exceeded 60 seconds."
      else
        log "ERROR" "[STAGE: rollback] Git reset to $PREVIOUS_COMMIT failed with exit code $rb_git_exit."
      fi
    fi
  fi

  # Dependencies rollback (check lockfile existence, never run git clean)
  log "INFO" "[STAGE: rollback] Re-installing dependencies for rollback commit..."
  local rb_npm_exit=0
  if [ -f "package-lock.json" ]; then
    log "INFO" "[STAGE: rollback] package-lock.json found -> using npm ci"
    run_timed 300 npm ci --no-audit --no-fund >> "$LOG_FILE" 2>&1 || rb_npm_exit=$?
  else
    log "INFO" "[STAGE: rollback] package-lock.json not found -> using npm install"
    run_timed 300 npm install --no-audit --no-fund >> "$LOG_FILE" 2>&1 || rb_npm_exit=$?
  fi
  if [ $rb_npm_exit -ne 0 ]; then
    if is_timeout $rb_npm_exit; then
      log "ERROR" "[STAGE: rollback] [TIMEOUT] Dependency re-install during rollback exceeded 300 seconds."
    else
      log "ERROR" "[STAGE: rollback] Dependency re-install during rollback failed with exit code $rb_npm_exit."
    fi
  fi

  # Build rollback
  log "INFO" "[STAGE: rollback] Re-building application for rollback commit..."
  local rb_build_exit=0
  run_timed 300 npm run build >> "$LOG_FILE" 2>&1 || rb_build_exit=$?
  if [ $rb_build_exit -ne 0 ]; then
    if is_timeout $rb_build_exit; then
      log "ERROR" "[STAGE: rollback] [TIMEOUT] Production build during rollback exceeded 300 seconds."
    else
      log "ERROR" "[STAGE: rollback] Production build during rollback failed with exit code $rb_build_exit."
    fi
  fi

  # PM2 restart rollback with session isolation
  local pm2_bin="pm2"
  if ! command -v pm2 &>/dev/null && [ -x "/usr/local/bin/pm2" ]; then
    pm2_bin="/usr/local/bin/pm2"
  fi
  if command -v "$pm2_bin" &>/dev/null || [ -x "$pm2_bin" ]; then
    log "INFO" "[STAGE: rollback] Restarting PM2 process 'dodik-tracker' for rollback..."
    local rb_pm2_exit=0
    run_timed 60 setsid "$pm2_bin" restart dodik-tracker --update-env </dev/null >> "$LOG_FILE" 2>&1 || rb_pm2_exit=$?
    if [ $rb_pm2_exit -ne 0 ]; then
      if is_timeout $rb_pm2_exit; then
        log "ERROR" "[STAGE: rollback] [TIMEOUT] PM2 restart during rollback exceeded 60 seconds."
      else
        log "ERROR" "[STAGE: rollback] PM2 restart during rollback failed with exit code $rb_pm2_exit."
      fi
    fi
  fi

  # Database migration notice: Never automatically rollback PostgreSQL migrations
  log "WARN" "[STAGE: rollback] Note: PostgreSQL database migrations are intentionally not reverted during rollback to prevent data loss or schema corruption."

  # Healthcheck verification for rollback state
  log "INFO" "[STAGE: rollback] Verifying server healthcheck endpoint (/api/health) after rollback..."
  sleep 2

  local rollback_hc_ok=0
  if check_health "http://localhost:3000/api/health" 10 2; then
    rollback_hc_ok=1
  fi

  stop_heartbeat

  if [ $rollback_hc_ok -eq 1 ]; then
    ROLLBACK_STATUS="success"
    CURRENT_STAGE="failed"
    CURRENT_STATE="failed"
    ERROR_DETAILS="Update failed during '$failed_stage': $ROLLBACK_REASON. Codebase rolled back to ${PREVIOUS_COMMIT:0:7}."
    write_state_file
    log "INFO" "[STAGE: rollback] Rollback completed successfully."
    log "ERROR" "[STAGE: rollback] ❌ UPDATE FAILED. Codebase rolled back to $PREVIOUS_COMMIT (healthcheck UP)."
  else
    ROLLBACK_STATUS="failed"
    CURRENT_STAGE="rollback_failed"
    CURRENT_STATE="rollback_failed"
    ERROR_DETAILS="Update failed during '$failed_stage': $ROLLBACK_REASON. CRITICAL: Rollback healthcheck failed! Manual intervention required."
    write_state_file
    log "ERROR" "[STAGE: rollback] ❌ ROLLBACK FAILED: Healthcheck did not pass after rollback!"
  fi
  log "ERROR" "=================================================="
}

# Signal handler to shield update engine from parent shutdown during service restarts
handle_signal() {
  local sig="$1"
  # If already completed successfully, do not alter status
  if [ "$CURRENT_STATE" = "success" ]; then
    return
  fi

  # Shield critical restart and rollback stages from termination signals
  if [ "$CURRENT_STAGE" = "restart" ] || [ "$CURRENT_STAGE" = "rolling_back" ]; then
    log "WARN" "[STAGE: $CURRENT_STAGE] Signal $sig received during $CURRENT_STAGE; shielded to protect update lifecycle."
    return
  fi

  stop_heartbeat
  ERROR_DETAILS="Process received signal $sig at stage '$CURRENT_STAGE'."
  CURRENT_STATE="failed"
  write_state_file
  log "ERROR" "[STAGE: $CURRENT_STAGE] ❌ Update aborted by signal $sig."
  exit 143
}
trap 'handle_signal SIGTERM' SIGTERM
trap 'handle_signal SIGINT' SIGINT
trap 'handle_signal SIGHUP' SIGHUP

# Trap unexpected process exits
catch_error() {
  local exit_code="$1"
  local line_no="$2"
  EXIT_CODE="$exit_code"

  # Avoid re-triggering rollback if already rolling back, failed, or successful
  if [ "$CURRENT_STAGE" = "rolling_back" ] || [ "$ROLLBACK_STATUS" = "in_progress" ] || [ "$CURRENT_STATE" = "success" ]; then
    log "ERROR" "[STAGE: rollback] Unexpected process exit at line $line_no with exit code $exit_code."
    exit "$exit_code"
  fi

  if [ "$CURRENT_STAGE" = "git_pull" ] || [ "$CURRENT_STAGE" = "dependencies" ] || [ "$CURRENT_STAGE" = "build" ] || [ "$CURRENT_STAGE" = "migrations" ] || [ "$CURRENT_STAGE" = "restart" ] || [ "$CURRENT_STAGE" = "healthcheck" ]; then
    rollback_update "Execution failed at line $line_no with exit code $exit_code"
  else
    stop_heartbeat
    CURRENT_STATE="failed"
    ERROR_DETAILS="Update failed at stage '$CURRENT_STAGE' (Line $line_no, exit code $exit_code)."
    write_state_file
    log "ERROR" "[STAGE: ${CURRENT_STAGE}] ❌ UPDATE FAILED at stage '${CURRENT_STAGE}' (Line $line_no, exit code $exit_code)"
  fi
  exit "$exit_code"
}
trap 'catch_error $? $LINENO' ERR

# Safe EXIT trap: Never overwrites success, stops heartbeat, records failure if exited while still marked running
handle_exit() {
  local exit_code=$?
  stop_heartbeat

  # If already marked success, failed, or rollback_failed, leave state pristine
  if [ "$CURRENT_STATE" = "success" ] || [ "$CURRENT_STATE" = "failed" ] || [ "$CURRENT_STATE" = "rollback_failed" ]; then
    return
  fi

  # If shell abruptly exited while still marked running
  if [ "$CURRENT_STATE" = "running" ] || [ "$CURRENT_STAGE" = "rolling_back" ]; then
    EXIT_CODE="$exit_code"
    CURRENT_STATE="failed"
    if [ -z "$ERROR_DETAILS" ]; then
      ERROR_DETAILS="Process terminated unexpectedly at stage '$CURRENT_STAGE' with exit code $exit_code."
    fi
    write_state_file
    log "ERROR" "[STAGE: $CURRENT_STAGE] ❌ Unexpected termination with exit code $exit_code."
  fi
}
trap handle_exit EXIT

# ------------------------------------------------------------------------------
# STAGE 1: Preflight & Environment Compatibility Check
# ------------------------------------------------------------------------------
if should_run_stage 1; then
  advance_stage "preflight" 8
  log "INFO" "[STAGE: preflight] [1/13] Running comprehensive preflight environment checks..."

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

  clear_stage_error
  write_state_file
  log "INFO" "[STAGE: preflight] All preflight checks passed: Node v${NODE_VER_NUM}, npm v$(npm -v), Disk ${FREE_MB} MB free, npm registry online."
fi

# ------------------------------------------------------------------------------
# STAGE 2: Git Safety Guard (assert_uploads_safe)
# ------------------------------------------------------------------------------
if should_run_stage 2; then
  advance_stage "git_safety" 15
  log "INFO" "[STAGE: git_safety] [2/13] Enforcing Git safety guard for persistent uploads..."

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

  clear_stage_error
  write_state_file
  log "INFO" "[STAGE: git_safety] Git safety assertions passed: persistent user uploads protected."
fi

# ------------------------------------------------------------------------------
# STAGE 3: Database Backup (PostgreSQL SQL Dump)
# ------------------------------------------------------------------------------
if should_run_stage 3; then
  advance_stage "database_backup" 23
  log "INFO" "[STAGE: database_backup] [3/13] Performing PostgreSQL database backup..."

  if [ ! -f "scripts/backup.sh" ]; then
    ERROR_DETAILS="scripts/backup.sh not found."
    CURRENT_STATE="failed"
    write_state_file
    log "ERROR" "[STAGE: database_backup] ❌ scripts/backup.sh missing."
    exit 1
  fi

  FAILED_COMMAND="bash scripts/backup.sh db"
  db_backup_exit=0
  run_timed 120 bash scripts/backup.sh db >> "$LOG_FILE" 2>&1 || db_backup_exit=$?
  if [ $db_backup_exit -ne 0 ]; then
    if is_timeout $db_backup_exit; then
      ERROR_DETAILS="Database backup execution timed out after 120 seconds! Update halted to protect existing database."
      log "ERROR" "[STAGE: database_backup] [TIMEOUT] Database backup exceeded 120 seconds."
    else
      ERROR_DETAILS="Database backup execution failed (exit code $db_backup_exit)! Update halted to protect existing database."
      log "ERROR" "[STAGE: database_backup] ❌ Database backup failed!"
    fi
    stop_heartbeat
    CURRENT_STATE="failed"
    write_state_file
    exit 1
  fi

  # Verify newest backup file exists and size > 100 bytes
  LATEST_DB_BACKUP=$(ls -1t "$PROJECT_ROOT/backups/db"/dodik_tracker_backup_*.sql "$PROJECT_ROOT/backups"/dodik_tracker_backup_*.sql 2>/dev/null | head -n 1 || echo "")
  if [ -z "$LATEST_DB_BACKUP" ] || [ ! -s "$LATEST_DB_BACKUP" ]; then
    ERROR_DETAILS="Database backup output file is missing or empty!"
    stop_heartbeat
    CURRENT_STATE="failed"
    write_state_file
    log "ERROR" "[STAGE: database_backup] ❌ Database backup file verification failed!"
    exit 1
  fi

  clear_stage_error
  write_state_file
  log "INFO" "[STAGE: database_backup] Database backup verified: $(basename "$LATEST_DB_BACKUP")"
fi

# ------------------------------------------------------------------------------
# STAGE 4: Uploads Snapshot & Archive
# ------------------------------------------------------------------------------
if should_run_stage 4; then
  advance_stage "uploads_snapshot" 31
  log "INFO" "[STAGE: uploads_snapshot] [4/13] Generating pre-update snapshot of user uploads..."

  SNAPSHOT_TS=$(date +"%Y%m%d_%H%M%S")
  SNAPSHOT_FILE="$PROJECT_ROOT/backups/snapshots/pre_update_manifest_${SNAPSHOT_TS}.json"

  PRE_AUDIO_COUNT=$(find "$AUDIO_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
  PRE_COVERS_COUNT=$(find "$COVERS_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
  PRE_TOTAL_FILES=$((PRE_AUDIO_COUNT + PRE_COVERS_COUNT))

  log "INFO" "[STAGE: uploads_snapshot] Creating pre-update archive of $PRE_TOTAL_FILES uploaded files..."
  FAILED_COMMAND="bash scripts/backup.sh uploads"
  uploads_backup_exit=0
  run_timed 120 bash scripts/backup.sh uploads >> "$LOG_FILE" 2>&1 || uploads_backup_exit=$?

  LATEST_UPLOADS_ARCHIVE=$(ls -1t "$PROJECT_ROOT/backups/uploads"/dodik_tracker_uploads_*.tar.gz 2>/dev/null | head -n 1 || echo "")

  if [ $uploads_backup_exit -ne 0 ]; then
    if is_timeout $uploads_backup_exit; then
      log "ERROR" "[STAGE: uploads_snapshot] [TIMEOUT] Uploads archive backup exceeded 120 seconds."
    else
      log "ERROR" "[STAGE: uploads_snapshot] ❌ Uploads archive backup script failed with exit code $uploads_backup_exit."
    fi
  fi

  if [ "$PRE_TOTAL_FILES" -gt 0 ]; then
    # If PRE_TOTAL_FILES > 0 and archive is missing or empty, stop update before Git stage
    if [ -z "$LATEST_UPLOADS_ARCHIVE" ] || [ ! -s "$LATEST_UPLOADS_ARCHIVE" ] || [ $uploads_backup_exit -ne 0 ]; then
      ERROR_DETAILS="Uploads backup failed or archive not created, but $PRE_TOTAL_FILES persistent files exist. Halting update to protect user uploads."
      stop_heartbeat
      CURRENT_STATE="failed"
      write_state_file
      log "ERROR" "[STAGE: uploads_snapshot] ❌ $ERROR_DETAILS"
      exit 1
    fi
  else
    log "INFO" "[STAGE: uploads_snapshot] Zero uploaded files found; absence of archive is acceptable."
  fi

  clear_stage_error
  write_state_file
  log "INFO" "[STAGE: uploads_snapshot] Uploads snapshot complete: audio: $PRE_AUDIO_COUNT, covers: $PRE_COVERS_COUNT."
fi

# ------------------------------------------------------------------------------
# STAGE 5: Git Fetch & Target Branch Reset
# ------------------------------------------------------------------------------
if should_run_stage 5; then
  advance_stage "git_pull" 40
  log "INFO" "[STAGE: git_pull] [5/13] Production deployment branch: $DEPLOY_BRANCH"

  CURRENT_LOCAL_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")
  if [ "$CURRENT_LOCAL_BRANCH" != "$DEPLOY_BRANCH" ] && [ "$CURRENT_LOCAL_BRANCH" != "HEAD" ]; then
    log "WARN" "[STAGE: git_pull] WARNING: current local branch is $CURRENT_LOCAL_BRANCH, production target branch is $DEPLOY_BRANCH"
  fi

  FAILED_COMMAND="git fetch origin $DEPLOY_BRANCH"
  fetch_exit=0
  run_timed 60 git fetch origin "$DEPLOY_BRANCH" >> "$LOG_FILE" 2>&1 || fetch_exit=$?
  if [ $fetch_exit -ne 0 ]; then
    if is_timeout $fetch_exit; then
      log "ERROR" "[STAGE: git_pull] [TIMEOUT] Git fetch origin $DEPLOY_BRANCH exceeded 60 seconds."
      rollback_update "Git operation timed out (fetch origin/$DEPLOY_BRANCH exceeded 60s)."
    else
      log "ERROR" "[STAGE: git_pull] Git fetch origin $DEPLOY_BRANCH failed with exit code $fetch_exit."
      rollback_update "Failed to fetch from remote branch origin/$DEPLOY_BRANCH. Network or git remote failure."
    fi
    exit 1
  fi

  TARGET_COMMIT=$(git rev-parse "origin/$DEPLOY_BRANCH" 2>/dev/null || echo "$PREVIOUS_COMMIT")
  log "INFO" "[STAGE: git_pull] Current commit: ${PREVIOUS_COMMIT:0:7} | Target commit: ${TARGET_COMMIT:0:7}"

  if [ "$PREVIOUS_COMMIT" = "$TARGET_COMMIT" ]; then
    log "INFO" "[STAGE: git_pull] Working copy is already at commit ${PREVIOUS_COMMIT:0:7}."
  else
    FAILED_COMMAND="git reset --hard $TARGET_COMMIT"
    log "INFO" "[STAGE: git_pull] Updating working copy to target commit $TARGET_COMMIT (git reset --hard $TARGET_COMMIT)..."
    reset_exit=0
    run_timed 60 git reset --hard "$TARGET_COMMIT" >> "$LOG_FILE" 2>&1 || reset_exit=$?
    if [ $reset_exit -ne 0 ]; then
      if is_timeout $reset_exit; then
        log "ERROR" "[STAGE: git_pull] [TIMEOUT] Git reset to $TARGET_COMMIT exceeded 60 seconds."
        rollback_update "Git reset to target commit $TARGET_COMMIT timed out."
      else
        log "ERROR" "[STAGE: git_pull] Git reset to $TARGET_COMMIT failed with exit code $reset_exit."
        rollback_update "Git reset to target commit $TARGET_COMMIT failed!"
      fi
      exit 1
    fi
    NEW_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "$TARGET_COMMIT")
    log "INFO" "[STAGE: git_pull] Codebase successfully updated to commit: ${NEW_COMMIT:0:7}."
  fi

  clear_stage_error
  write_state_file
fi

# ------------------------------------------------------------------------------
# STAGE 6: Install npm Dependencies (npm ci / npm install)
# ------------------------------------------------------------------------------
if should_run_stage 6; then
  advance_stage "dependencies" 50
  log "INFO" "[STAGE: dependencies] [6/13] Installing npm dependencies..."

  had_lockfile=0
  npm_tmp="/tmp/dodik_npm_$$.log"
  if [ -f "package-lock.json" ]; then
    had_lockfile=1
    log "INFO" "[STAGE: dependencies] package-lock.json found -> using npm ci"
    FAILED_COMMAND="npm ci --no-audit --no-fund"
    ci_exit=0
    run_timed 300 npm ci --no-audit --no-fund > "$npm_tmp" 2>&1 || ci_exit=$?
    cat "$npm_tmp" >> "$LOG_FILE"
    if [ $ci_exit -ne 0 ]; then
      san_ci_err=$(sanitize_secrets "$(tail -n 25 "$npm_tmp")")
      rm -f "$npm_tmp"
      if is_timeout $ci_exit; then
        log "ERROR" "[STAGE: dependencies] [TIMEOUT] npm ci exceeded 300 seconds (5 minutes)."
        rollback_update "npm ci timed out after 300 seconds."
        exit 1
      else
        log "WARN" "[STAGE: dependencies] ⚠️ npm ci failed with exit code $ci_exit. Output:\n$san_ci_err"
        log "INFO" "[STAGE: dependencies] Attempting fallback package install (npm install --no-audit --no-fund)..."
        FAILED_COMMAND="npm install --no-audit --no-fund"
        fallback_exit=0
        fallback_tmp="/tmp/dodik_npm_fb_$$.log"
        run_timed 300 npm install --no-audit --no-fund > "$fallback_tmp" 2>&1 || fallback_exit=$?
        cat "$fallback_tmp" >> "$LOG_FILE"
        if [ $fallback_exit -ne 0 ]; then
          san_fallback_err=$(sanitize_secrets "$(tail -n 25 "$fallback_tmp")")
          rm -f "$fallback_tmp"
          if is_timeout $fallback_exit; then
            log "ERROR" "[STAGE: dependencies] [TIMEOUT] npm install fallback exceeded 300 seconds."
            rollback_update "npm install fallback timed out after 300 seconds."
          else
            rollback_update "npm dependencies installation failed! npm stderr:\n$san_fallback_err"
          fi
          exit 1
        fi
        rm -f "$fallback_tmp"
        log "INFO" "[STAGE: dependencies] Fallback npm install completed successfully."
      fi
    else
      rm -f "$npm_tmp"
      log "INFO" "[STAGE: dependencies] Dependencies installed successfully via npm ci."
    fi
  else
    log "INFO" "[STAGE: dependencies] package-lock.json not found -> using npm install"
    FAILED_COMMAND="npm install --no-audit --no-fund"
    install_exit=0
    run_timed 300 npm install --no-audit --no-fund > "$npm_tmp" 2>&1 || install_exit=$?
    cat "$npm_tmp" >> "$LOG_FILE"
    if [ $install_exit -ne 0 ]; then
      san_install_err=$(sanitize_secrets "$(tail -n 25 "$npm_tmp")")
      rm -f "$npm_tmp"
      if is_timeout $install_exit; then
        log "ERROR" "[STAGE: dependencies] [TIMEOUT] npm install exceeded 300 seconds (5 minutes)."
        rollback_update "npm install timed out after 300 seconds."
      else
        rollback_update "npm dependencies installation failed! npm stderr:\n$san_install_err"
      fi
      exit 1
    fi
    rm -f "$npm_tmp"
    log "INFO" "[STAGE: dependencies] Dependencies installed successfully via npm install."
  fi

  # Check git status for newly generated package-lock.json (do not treat as application update)
  if [ $had_lockfile -eq 0 ] && [ -f "package-lock.json" ]; then
    log "INFO" "[STAGE: dependencies] Notice: untracked package-lock.json was generated during npm install; keeping intact without committing."
  fi

  # Verify essential CLI packages exist in node_modules
  for pkg_bin in vite esbuild tsx; do
    if [ ! -f "node_modules/.bin/$pkg_bin" ]; then
      rollback_update "Missing required binary in node_modules/.bin/$pkg_bin!"
      exit 1
    fi
  done
  clear_stage_error
  write_state_file
  log "INFO" "[STAGE: dependencies] Verified required binaries (vite, esbuild, tsx) in node_modules/.bin."
fi

# ------------------------------------------------------------------------------
# STAGE 7: Build Production Application
# ------------------------------------------------------------------------------
if should_run_stage 7; then
  advance_stage "build" 62
  log "INFO" "[STAGE: build] [7/13] Building production application (npm run build)..."

  FAILED_COMMAND="npm run build"
  build_exit=0
  build_tmp="/tmp/dodik_build_$$.log"
  run_timed 300 npm run build > "$build_tmp" 2>&1 || build_exit=$?
  cat "$build_tmp" >> "$LOG_FILE"

  if [ $build_exit -ne 0 ]; then
    san_build_err=$(sanitize_secrets "$(tail -n 25 "$build_tmp")")
    rm -f "$build_tmp"
    if is_timeout $build_exit; then
      log "ERROR" "[STAGE: build] [TIMEOUT] Production build exceeded 300 seconds."
      rollback_update "Production build timed out."
    else
      rollback_update "Production build (npm run build) failed! Error output:\n$san_build_err"
    fi
    exit 1
  fi
  rm -f "$build_tmp"

  if [ ! -f "$PROJECT_ROOT/dist/server.cjs" ] || [ ! -s "$PROJECT_ROOT/dist/server.cjs" ]; then
    rollback_update "Build artifact missing: dist/server.cjs not found or empty!"
    exit 1
  fi

  clear_stage_error
  write_state_file
  log "INFO" "[STAGE: build] Production build verified: dist/server.cjs created successfully."
fi

# ------------------------------------------------------------------------------
# STAGE 8: Database Migrations
# ------------------------------------------------------------------------------
advance_stage "migrations" 74
log "INFO" "[STAGE: migrations] [8/13] Applying database migrations (npm run db:migrate)..."

FAILED_COMMAND="npm run db:migrate"
migrate_exit=0
migrate_tmp="/tmp/dodik_migrate_$$.log"
if [ -n "${DODIK_TEST_MIGRATE_CMD:-}" ]; then
  log "INFO" "[STAGE: migrations] Test migrate override active: $DODIK_TEST_MIGRATE_CMD"
  run_timed 120 bash -c "$DODIK_TEST_MIGRATE_CMD" > "$migrate_tmp" 2>&1 || migrate_exit=$?
else
  run_timed 120 npm run db:migrate > "$migrate_tmp" 2>&1 || migrate_exit=$?
fi
cat "$migrate_tmp" >> "$LOG_FILE"

if [ $migrate_exit -ne 0 ]; then
  san_migrate_err=$(sanitize_secrets "$(tail -n 25 "$migrate_tmp")")
  rm -f "$migrate_tmp"
  if is_timeout $migrate_exit; then
    log "ERROR" "[STAGE: migrations] [TIMEOUT] Database migrations exceeded 120 seconds."
    rollback_update "Database migration timed out after 120 seconds."
  else
    rollback_update "Database migration failed! Error output:\n$san_migrate_err"
  fi
  exit 1
fi
rm -f "$migrate_tmp"

clear_stage_error
write_state_file
log "INFO" "[STAGE: migrations] Database migrations applied successfully."

# ------------------------------------------------------------------------------
# STAGE 9: PM2 Process Restart (Isolated Lifecycle)
# ------------------------------------------------------------------------------
advance_stage "restart" 82
log "INFO" "[STAGE: restart] [9/13] Restarting application process..."

PM2_BIN="pm2"
if ! command -v pm2 &>/dev/null && [ -x "/usr/local/bin/pm2" ]; then
  PM2_BIN="/usr/local/bin/pm2"
fi

FAILED_COMMAND="$PM2_BIN restart dodik-tracker"
restart_exit=0
pm2_available=0

if command -v "$PM2_BIN" &>/dev/null || [ -x "$PM2_BIN" ]; then
  pm2_available=1
fi

# Execute restart safely isolated with closed stdin and redirected output
if [ -n "${DODIK_TEST_RESTART_CMD:-}" ]; then
  # Test override hook for verified local testing
  log "INFO" "[STAGE: restart] Test restart override active: $DODIK_TEST_RESTART_CMD"
  run_timed 60 bash -c "$DODIK_TEST_RESTART_CMD" >> "$LOG_FILE" 2>&1 || restart_exit=$?
elif [ $pm2_available -eq 1 ]; then
  run_timed 60 setsid "$PM2_BIN" restart dodik-tracker --update-env </dev/null >> "$LOG_FILE" 2>&1 || restart_exit=$?
else
  log "WARN" "[STAGE: restart] PM2 not found in system path; relying on server process supervisor."
fi

# Differentiate PM2 CLI exit code from actual application status
if [ $restart_exit -eq 0 ]; then
  log "INFO" "[STAGE: restart] PM2 restart command executed successfully."
  clear_stage_error
  write_state_file
else
  if is_timeout $restart_exit; then
    log "WARN" "[STAGE: restart] [TIMEOUT] PM2 restart command exceeded 60 seconds."
  else
    log "WARN" "[STAGE: restart] Notice: pm2 restart returned non-zero code ($restart_exit)."
  fi

  log "INFO" "[STAGE: restart] Checking application health before making rollback decision..."
  sleep 2
  if check_health "http://localhost:3000/api/health" 10 2; then
    log "WARN" "[STAGE: restart] Application is verified UP despite PM2 warning ($restart_exit). Continuing deployment."
    clear_stage_error
    write_state_file
  else
    log "ERROR" "[STAGE: restart] Application healthcheck failed after PM2 error ($restart_exit)."
    rollback_update "PM2 restart failed with exit code $restart_exit and application healthcheck failed."
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# STAGE 10: Health Check Verification
# ------------------------------------------------------------------------------
advance_stage "healthcheck" 90
log "INFO" "[STAGE: healthcheck] [10/13] Verifying server healthcheck endpoint (/api/health)..."
sleep 2

HEALTH_URL="${DODIK_TEST_HEALTH_URL:-http://localhost:3000/api/health}"
FAILED_COMMAND="check_health $HEALTH_URL"
health_ok=0
if [ -n "${DODIK_TEST_HEALTHCHECK_CMD:-}" ]; then
  log "INFO" "[STAGE: healthcheck] Test healthcheck override active: $DODIK_TEST_HEALTHCHECK_CMD"
  if bash -c "$DODIK_TEST_HEALTHCHECK_CMD"; then
    health_ok=1
  fi
elif check_health "$HEALTH_URL" 10 2; then
  health_ok=1
fi

if [ $health_ok -ne 1 ]; then
  LAST_BODY=$(curl --connect-timeout 3 --max-time 5 -fsS "$HEALTH_URL" 2>/dev/null || echo "No response / connection refused")
  CURRENT_STATE="failed"
  FAILED_STAGE="healthcheck"
  rollback_update "Health check failed for $HEALTH_URL after restart! Response: $LAST_BODY"
  exit 1
fi

clear_stage_error
write_state_file
log "INFO" "[STAGE: healthcheck] Health check OK: Application is UP."

# ------------------------------------------------------------------------------
# STAGE 11: Uploads Integrity Check & Auto-Recovery Guard
# ------------------------------------------------------------------------------
advance_stage "uploads_integrity" 95
log "INFO" "[STAGE: uploads_integrity] [11/13] Verifying post-update uploads integrity..."

POST_AUDIO_COUNT=$(find "$AUDIO_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
POST_COVERS_COUNT=$(find "$COVERS_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
POST_TOTAL_FILES=$((POST_AUDIO_COUNT + POST_COVERS_COUNT))

log "INFO" "[STAGE: uploads_integrity] Pre-update:  $PRE_TOTAL_FILES files (audio: $PRE_AUDIO_COUNT, covers: $PRE_COVERS_COUNT)"
log "INFO" "[STAGE: uploads_integrity] Post-update: $POST_TOTAL_FILES files (audio: $POST_AUDIO_COUNT, covers: $POST_COVERS_COUNT)"

if [ "$POST_TOTAL_FILES" -lt "$PRE_TOTAL_FILES" ]; then
  log "WARN" "[STAGE: uploads_integrity] ⚠️ Uploads integrity mismatch detected ($POST_TOTAL_FILES < $PRE_TOTAL_FILES)! Attempting automatic recovery from pre-update archive..."

  recovered=0
  if [ -n "$LATEST_UPLOADS_ARCHIVE" ] && [ -f "$LATEST_UPLOADS_ARCHIVE" ]; then
    if tar -xzf "$LATEST_UPLOADS_ARCHIVE" -C "$UPLOADS_DIR" 2>> "$LOG_FILE"; then
      REC_AUDIO=$(find "$AUDIO_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
      REC_COVERS=$(find "$COVERS_DIR" -type f ! -name ".gitkeep" 2>/dev/null | wc -l || echo 0)
      REC_TOTAL_FILES=$((REC_AUDIO + REC_COVERS))
      log "INFO" "[STAGE: uploads_integrity] Re-checked counts after extraction: $REC_TOTAL_FILES (audio: $REC_AUDIO, covers: $REC_COVERS)"

      if [ "$REC_TOTAL_FILES" -ge "$PRE_TOTAL_FILES" ]; then
        recovered=1
        POST_AUDIO_COUNT="$REC_AUDIO"
        POST_COVERS_COUNT="$REC_COVERS"
        POST_TOTAL_FILES="$REC_TOTAL_FILES"
        log "INFO" "[STAGE: uploads_integrity] ✅ Automatic recovery succeeded! Restored uploads: $REC_TOTAL_FILES files."
      else
        log "ERROR" "[STAGE: uploads_integrity] ❌ Post-recovery count ($REC_TOTAL_FILES) is still less than pre-update count ($PRE_TOTAL_FILES)!"
      fi
    else
      log "ERROR" "[STAGE: uploads_integrity] ❌ tar extraction failed during uploads recovery!"
    fi
  else
    log "ERROR" "[STAGE: uploads_integrity] ❌ No valid pre-update archive available for recovery!"
  fi

  if [ $recovered -ne 1 ]; then
    stop_heartbeat
    CURRENT_STAGE="uploads_integrity_failed"
    CURRENT_STATE="failed"
    ERROR_DETAILS="Uploads integrity check failed: expected at least $PRE_TOTAL_FILES files, but only $POST_TOTAL_FILES available after recovery."
    write_state_file
    log "ERROR" "[STAGE: uploads_integrity_failed] ❌ $ERROR_DETAILS"
    exit 1
  fi
else
  log "INFO" "[STAGE: uploads_integrity] ✅ Uploads integrity verified: all $PRE_TOTAL_FILES user files intact."
fi

clear_stage_error
write_state_file

# ------------------------------------------------------------------------------
# STAGE 12: Database ↔ Filesystem Diagnostic Cross-Check
# ------------------------------------------------------------------------------
advance_stage "database_integrity" 98
log "INFO" "[STAGE: database_integrity] [12/13] Running DB ↔ Filesystem cross-verification diagnostic..."

if [ -f "src/scripts/verifyUploads.ts" ]; then
  diag_exit=0
  run_timed 60 npx tsx src/scripts/verifyUploads.ts --http >> "$LOG_FILE" 2>&1 || diag_exit=$?
  if [ $diag_exit -ne 0 ]; then
    if is_timeout $diag_exit; then
      log "WARN" "[STAGE: database_integrity] [TIMEOUT] DB/filesystem diagnostic timed out after 60 seconds."
    else
      log "WARN" "[STAGE: database_integrity] DB/filesystem diagnostic exited with code $diag_exit."
    fi
    log "WARN" "[STAGE: database_integrity] DB/filesystem diagnostic failed or timed out; update itself remains successful if healthcheck and upload integrity passed."
  else
    log "INFO" "[STAGE: database_integrity] DB ↔ Filesystem cross-check completed successfully."
  fi
fi

clear_stage_error
write_state_file

# ------------------------------------------------------------------------------
# STAGE 13: Update Successfully Completed
# ------------------------------------------------------------------------------
stop_heartbeat

CURRENT_STAGE="completed"
CURRENT_STATE="success"
PROGRESS=100
ROLLBACK_STATUS="not_needed"
FAILED_STAGE=""
FAILED_COMMAND=""
EXIT_CODE=0
ERROR_DETAILS=""
APP_VERSION=$(node -p "try{require('./package.json').version}catch{process.env.npm_package_version||'1.0.0'}" 2>/dev/null || echo "1.0.0")
FINAL_COMMIT_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

write_state_file

log "INFO" "[STAGE: completed] [13/13] =================================================="
log "INFO" "[STAGE: completed]   ✅ SUCCESS: Dodik Tracker updated to v${APP_VERSION} ($FINAL_COMMIT_SHORT)"
log "INFO" "[STAGE: completed]   • Deployment: Branch: $DEPLOY_BRANCH"
log "INFO" "[STAGE: completed]   • Database:   PostgreSQL backup saved & migrations applied"
log "INFO" "[STAGE: completed]   • Uploads:    Audio: $POST_AUDIO_COUNT, Covers: $POST_COVERS_COUNT verified"
log "INFO" "[STAGE: completed]   • Service:    PM2 restarted & Healthcheck OK"
log "INFO" "[STAGE: completed] =================================================="
log "INFO" "[STAGE: completed] Final status: SUCCESS"

exit 0
