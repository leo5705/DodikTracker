# Changelog

All notable changes to the Dodik Tracker project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-09-15

### Added
- **Unified Production Update Workflow**: Single-command update system (`npm run update` / `./scripts/update.sh`) executing Git checks, automatic PostgreSQL backup, dependency install, database migrations, and production build.
- **PostgreSQL Database Migration System**: Managed with Drizzle ORM and automatic runner (`npm run db:migrate`), tracking applied migrations in `__drizzle_migrations`.
- **Automated Backup and Restore Tools**: 
  - `./scripts/backup.sh` (`npm run backup`) — Creates timestamped SQL dumps in `./backups/`.
  - `./scripts/restore.sh` (`npm run restore`) — Safe restoration tool with interactive confirmation.
- **System Health and Diagnostics**:
  - `/api/health` — Full healthcheck verifying DB latency, uptime, and app version (HTTP 200 / 503).
  - `/api/system/version` — Exposing version, migration status, and release metadata to the Admin Panel.
- **Admin Updates & Status Dashboard**: `AdminUpdatesTab.tsx` providing real-time diagnostics, migration counters, and copyable maintenance commands.
- **Unit and Integration Test Suite**: `npm test` verifying core notification and database logic.

### Changed
- Refactored `server.ts` to bundle cleanly with esbuild into `dist/server.cjs`.
- Improved database connection pooling with support for `DATABASE_URL`, `POSTGRES_URL`, and individual parameter overrides.
- Cleaned and audited repository from temporary scripts and patch files.

### Security
- Hardened image proxy against SSRF attacks.
- Secured rate-limiting and helmet policies on Express routes.
- Sanitized system diagnostics so credentials and environment secrets are never exposed to clients.
