#!/usr/bin/env bash
# ==============================================================================
# Dodik Tracker - Production Update Script
# Safely updates the codebase, runs migrations, creates backups, and builds
# ==============================================================================

set -eo pipefail

echo "=================================================="
echo "    🚀 Dodik Tracker - Production Update System   "
echo "=================================================="

# 1. Check working directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Please execute this script from the project root directory."
  exit 1
fi

# 2. Check environment file
if [ ! -f ".env" ]; then
  echo "⚠️ Warning: .env file not found. Copying from .env.example..."
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "Created default .env. Please configure your database credentials."
  fi
fi

# 3. Check Git status
if command -v git &>/dev/null && [ -d ".git" ]; then
  echo "[1/6] Checking Git status..."
  GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  echo "      Current branch: $GIT_BRANCH"
  
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "      ℹ️  Uncommitted local modifications detected."
  fi
else
  echo "[1/6] Git repository check skipped."
fi

# 4. Create database backup
echo "[2/6] Creating automatic database backup before update..."
if [ -f "scripts/backup.sh" ]; then
  bash scripts/backup.sh || {
    echo "❌ Database backup failed! Update halted to prevent data loss."
    exit 1
  }
else
  echo "⚠️ Warning: scripts/backup.sh not found, skipping automated backup."
fi

# 5. Install dependencies
echo "[3/6] Installing npm dependencies..."
npm install --no-audit --prefer-offline || npm install

# 6. Run database migrations
echo "[4/6] Executing database migrations..."
npm run db:migrate || {
  echo "❌ Database migration failed! Please inspect logs above."
  echo "ℹ️  To rollback, restore the database backup using: ./scripts/restore.sh"
  exit 1
}

# 7. Build application (Vite frontend + esbuild server.cjs)
echo "[5/6] Building production frontend and backend bundle..."
npm run build || {
  echo "❌ Production build failed!"
  exit 1
}

# 8. Check health / display completion
echo "[6/6] Finalizing update verification..."

# If server is already running, attempt health check
if command -v curl &>/dev/null; then
  HEALTH_STATUS=$(curl -s -m 3 http://localhost:3000/api/health 2>/dev/null || echo "")
  if [ -n "$HEALTH_STATUS" ]; then
    echo "      Live Server Health: $HEALTH_STATUS"
  fi
fi

CURRENT_VER=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")

echo ""
echo "=================================================="
echo "  ✅ Dodik Tracker successfully updated to v${CURRENT_VER}!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "  • If using Systemd: sudo systemctl restart dodik-tracker"
echo "  • If using PM2:     pm2 restart dodik-tracker"
echo "  • If using Docker:  docker compose restart app"
echo "  • If starting standalone: npm start"
echo ""
echo "Verify health at: http://localhost:3000/api/health"
echo "=================================================="
