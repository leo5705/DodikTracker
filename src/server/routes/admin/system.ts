import { Router, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { requireAuth, isAdminRole, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import { sql } from 'drizzle-orm';
import { logAdminAction } from './auditHelper.ts';
import { verifyUploadsAndDatabase } from '../../../scripts/verifyUploads.ts';

const execFileAsync = promisify(execFile);

export const systemRouter = Router();

// Strict Admin Gatekeeper: Only SUPER_ADMIN and ADMIN roles are authorized
const requireAdminAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }
  if (!isAdminRole(req.dbUser.role)) {
    return res.status(403).json({ error: 'Доступ запрещён: требуются права администратора' });
  }
  next();
};

systemRouter.use(requireAuth, requireAdminAccess);

// -----------------------------------------------------------------------------
// Update Job State Machine
// -----------------------------------------------------------------------------
export type UpdateStage =
  | 'idle'
  | 'init'
  | 'preflight'
  | 'git_safety'
  | 'database_backup'
  | 'uploads_snapshot'
  | 'git_pull'
  | 'dependencies'
  | 'migrations'
  | 'build'
  | 'restart'
  | 'healthcheck'
  | 'uploads_integrity'
  | 'database_integrity'
  | 'completed';

export type UpdateState = 'idle' | 'queued' | 'running' | 'success' | 'failed';

export interface UpdateJob {
  id: string;
  pid?: number | null;
  state: UpdateState;
  stage: UpdateStage;
  progress: number;
  startTime: string | null;
  lastHeartbeatAt?: string | null;
  endTime: string | null;
  logSummary: string[];
  error: string | null;
  failedCommand?: string | null;
  exitCode?: number | null;
  rollbackStatus?: string | null;
  rollbackReason?: string | null;
  failedStage?: string | null;
  deployBranch?: string | null;
  triggeredBy?: {
    id: number;
    username: string;
  };
}

let activeUpdateJob: UpdateJob | null = null;
let lastUpdateResult: {
  status: 'SUCCESS' | 'FAILURE' | 'UP_TO_DATE' | 'UNKNOWN';
  timestamp?: string;
  details?: string;
  error?: string;
} | null = null;

// Helpers
function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getAppVersion(): string {
  try {
    const pkgPath = path.resolve('package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.version || '1.0.0';
    }
  } catch {}
  return process.env.APP_VERSION || '1.0.0';
}

let cachedNpmVer: string | null = null;
async function getNpmVersion(): Promise<string> {
  if (cachedNpmVer) return cachedNpmVer;
  try {
    const { stdout } = await execFileAsync('npm', ['--version'], { timeout: 4000 });
    cachedNpmVer = stdout.trim();
    return cachedNpmVer;
  } catch {
    return 'unknown';
  }
}

async function getGitInfo() {
  const gitDir = path.resolve('.git');
  if (!fs.existsSync(gitDir)) {
    return {
      isGit: false,
      currentBranch: 'main',
      currentCommit: 'unknown',
      currentCommitShort: 'unknown',
      remoteCommit: null,
      remoteCommitShort: null,
      updateAvailable: false,
    };
  }

  const safeGitExec = async (args: string[]): Promise<string> => {
    try {
      const { stdout } = await execFileAsync('git', args, { cwd: process.cwd(), timeout: 5000 });
      return stdout.trim();
    } catch {
      return '';
    }
  };

  const currentBranch = (await safeGitExec(['rev-parse', '--abbrev-ref', 'HEAD'])) || 'main';
  const currentCommit = (await safeGitExec(['rev-parse', 'HEAD'])) || 'unknown';
  const currentCommitShort = (await safeGitExec(['rev-parse', '--short', 'HEAD'])) || 'unknown';
  const remoteCommit = (await safeGitExec(['rev-parse', 'origin/main'])) || null;
  const remoteCommitShort = (await safeGitExec(['rev-parse', '--short', 'origin/main'])) || null;

  const updateAvailable = !!(remoteCommit && currentCommit && remoteCommit !== currentCommit);

  return {
    isGit: true,
    currentBranch,
    currentCommit,
    currentCommitShort,
    remoteCommit,
    remoteCommitShort,
    updateAvailable,
  };
}

async function getPm2Status(): Promise<{ status: string; uptime?: number; restarts?: number; memory?: number; cpu?: number }> {
  try {
    const { stdout } = await execFileAsync('pm2', ['jlist'], { timeout: 3000 });
    const list = JSON.parse(stdout);
    if (Array.isArray(list)) {
      const proc = list.find((p: any) => p.name === 'dodik-tracker');
      if (proc && proc.pm2_env) {
        return {
          status: proc.pm2_env.status || 'unknown',
          uptime: proc.pm2_env.pm_uptime ? Math.floor((Date.now() - proc.pm2_env.pm_uptime) / 1000) : undefined,
          restarts: proc.pm2_env.restart_time || 0,
          memory: proc.monit?.memory || 0,
          cpu: proc.monit?.cpu || 0,
        };
      }
    }
    return { status: 'not_running' };
  } catch {
    return { status: 'unavailable' };
  }
}

async function getDatabaseStatus(): Promise<{ status: 'connected' | 'disconnected'; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return {
      status: 'connected',
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      status: 'disconnected',
      error: err.message || 'Database unreachable',
    };
  }
}

function getLastBackupMetadata() {
  const candidatesDirs = [path.resolve('backups/db'), path.resolve('backups')];
  const allFiles: { dir: string; filename: string; mtimeMs: number }[] = [];

  for (const dir of candidatesDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir).filter(f => f.startsWith('dodik_tracker_backup_') && f.endsWith('.sql'));
        for (const f of files) {
          const stat = fs.statSync(path.join(dir, f));
          allFiles.push({ dir, filename: f, mtimeMs: stat.mtimeMs });
        }
      } catch {}
    }
  }

  if (allFiles.length === 0) return null;
  allFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const latest = allFiles[0];
  const fullSqlPath = path.join(latest.dir, latest.filename);
  const metaPath = path.join(latest.dir, `${latest.filename}.meta.json`);

  if (fs.existsSync(metaPath)) {
    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {}
  }

  const stat = fs.statSync(fullSqlPath);
  return {
    filename: latest.filename,
    createdAt: stat.mtime.toISOString(),
    sizeBytes: stat.size,
    sizeHuman: formatBytes(stat.size),
    format: 'plain_sql',
    status: 'VALID',
  };
}

function getLastUploadsBackupMetadata() {
  const uploadsBackupDir = path.resolve('backups/uploads');
  if (!fs.existsSync(uploadsBackupDir)) return null;

  try {
    const files = fs.readdirSync(uploadsBackupDir).filter(f => f.startsWith('dodik_tracker_uploads_') && f.endsWith('.tar.gz'));
    if (files.length === 0) return null;

    files.sort((a, b) => {
      const statA = fs.statSync(path.join(uploadsBackupDir, a));
      const statB = fs.statSync(path.join(uploadsBackupDir, b));
      return statB.mtimeMs - statA.mtimeMs;
    });

    const latest = files[0];
    const metaPath = path.join(uploadsBackupDir, `${latest}.meta.json`);
    if (fs.existsSync(metaPath)) {
      try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {}
    }

    const stat = fs.statSync(path.join(uploadsBackupDir, latest));
    return {
      filename: latest,
      createdAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      sizeHuman: formatBytes(stat.size),
      format: 'tar.gz',
      status: 'VALID',
    };
  } catch {
    return null;
  }
}

function getLastUpdateResultFromLog() {
  const logPath = path.resolve('logs/update.log');
  if (!fs.existsSync(logPath)) return null;
  try {
    const content = fs.readFileSync(logPath, 'utf8').trim();
    const lines = content.split('\n');
    const tail = lines.slice(-25);

    const successLine = tail.find(l => l.includes('Final status: SUCCESS') || l.includes('SUCCESS: Dodik Tracker'));
    const failureLine = tail.find(l => l.includes('Final status: FAILURE') || l.includes('UPDATE FAILED'));
    const upToDateLine = tail.find(l => l.includes('Final status: UP_TO_DATE') || l.includes('already up to date'));

    if (successLine) return { status: 'SUCCESS' as const, details: successLine };
    if (failureLine) return { status: 'FAILURE' as const, details: failureLine };
    if (upToDateLine) return { status: 'UP_TO_DATE' as const, details: upToDateLine };
    return { status: 'UNKNOWN' as const, details: tail[tail.length - 1] };
  } catch {
    return null;
  }
}

function sanitizeSecretsText(text: string): string {
  if (!text) return '';
  return text
    .replace(/postgres:\/\/[^@]+@/g, 'postgres://***REDACTED***@')
    .replace(/postgresql:\/\/[^@]+@/g, 'postgresql://***REDACTED***@')
    .replace(/(PASSWORD|SECRET|TOKEN|KEY|PASS|AUTH)="?[^"& ]+"?/gi, '$1=***REDACTED***')
    .replace(/(--password|-p)[= ]"[^"]+"/gi, '$1 ***REDACTED***');
}

async function getDiskSpaceMB(): Promise<{ freeMB: number; totalMB: number }> {
  try {
    const { stdout } = await execFileAsync('df', ['-k', process.cwd()], { timeout: 3000 });
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      const totalKB = parseInt(parts[1], 10) || 0;
      const freeKB = parseInt(parts[3], 10) || 0;
      return { freeMB: Math.floor(freeKB / 1024), totalMB: Math.floor(totalKB / 1024) };
    }
  } catch {}
  return { freeMB: 2048, totalMB: 20480 };
}

function isProcessAlive(pid?: number | null): boolean {
  if (!pid || typeof pid !== 'number' || pid <= 0 || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error?.code === 'EPERM';
  }
}

function getPersistedUpdateJob(): UpdateJob | null {
  const statePath = path.resolve('logs/update_state.json');
  if (fs.existsSync(statePath)) {
    try {
      const raw = fs.readFileSync(statePath, 'utf8');
      const stateObj = JSON.parse(raw);
      if (stateObj && stateObj.id) {
        const rawState = stateObj.state || 'idle';
        const normalizedState: UpdateState =
          rawState === 'rollback_failed' ? 'failed' : (rawState as UpdateState);
        return {
          id: stateObj.id,
          pid: stateObj.pid ? Number(stateObj.pid) : null,
          state: normalizedState,
          stage: stateObj.stage || 'idle',
          progress: stateObj.progress || 0,
          startTime: stateObj.startTime || null,
          lastHeartbeatAt: stateObj.lastHeartbeatAt || null,
          endTime: stateObj.endTime || null,
          logSummary: Array.isArray(stateObj.logSummary) ? stateObj.logSummary.map(sanitizeSecretsText) : [],
          error: stateObj.errorDetails ? sanitizeSecretsText(stateObj.errorDetails) : null,
          failedCommand: stateObj.failedCommand || null,
          exitCode: stateObj.exitCode ?? null,
          rollbackStatus: stateObj.rollbackStatus || null,
          rollbackReason: stateObj.rollbackReason || null,
          failedStage: stateObj.failedStage || null,
          deployBranch: stateObj.deployBranch || null,
        } as any;
      }
    } catch {}
  }
  return null;
}

function persistTerminalFailure(job: UpdateJob, reason: string): void {
  job.state = 'failed';
  job.error = reason;
  job.endTime = new Date().toISOString();
  const statePath = path.resolve('logs/update_state.json');
  try {
    let existing: any = {};
    if (fs.existsSync(statePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      } catch {}
    }
    const updated = {
      ...existing,
      id: job.id,
      pid: job.pid || existing.pid || null,
      state: 'failed',
      stage: job.stage || existing.stage || 'failed',
      progress: job.progress || existing.progress || 0,
      startTime: job.startTime || existing.startTime,
      lastHeartbeatAt: job.lastHeartbeatAt || existing.lastHeartbeatAt,
      endTime: job.endTime,
      errorDetails: reason,
      logSummary: Array.isArray(existing.logSummary) ? existing.logSummary : job.logSummary,
    };
    fs.writeFileSync(statePath, JSON.stringify(updated, null, 2), 'utf8');
  } catch (e) {
    console.error('[AdminSystem] Error persisting failed state to disk:', e);
  }
}

function reconcileUpdateJob(): UpdateJob | null {
  const persisted = getPersistedUpdateJob();
  const job = persisted || activeUpdateJob;
  if (!job) return null;

  if (job.state === 'running') {
    const now = Date.now();
    const lastHbTime = job.lastHeartbeatAt ? new Date(job.lastHeartbeatAt).getTime() : 0;
    const startTime = job.startTime ? new Date(job.startTime).getTime() : 0;
    const refTime = lastHbTime || startTime || now;
    const elapsedSinceHeartbeat = now - refTime;

    const pidAlive = isProcessAlive(job.pid);

    // 1. If PID is present and definitely dead in OS process table:
    // Grace period of 15 seconds to allow normal file completion
    if (job.pid && !pidAlive) {
      if (elapsedSinceHeartbeat > 15000 || !lastHbTime) {
        const failureReason = `Процесс обновления аварийно завершился: worker PID (${job.pid}) отсутствует в системе`;
        persistTerminalFailure(job, failureReason);
        activeUpdateJob = null;
        lastUpdateResult = {
          status: 'FAILURE',
          error: failureReason,
          timestamp: job.endTime,
        };
        return job;
      }
    }

    // 2. If PID is missing entirely from a running state and job started > 25 seconds ago:
    if (!job.pid && elapsedSinceHeartbeat > 25000) {
      const failureReason = 'Процесс обновления аварийно завершился: worker PID отсутствует в системе';
      persistTerminalFailure(job, failureReason);
      activeUpdateJob = null;
      lastUpdateResult = {
        status: 'FAILURE',
        error: failureReason,
        timestamp: job.endTime,
      };
      return job;
    }

    // 3. Fallback: If heartbeat is stale for > 90 seconds and process is not alive
    if (elapsedSinceHeartbeat > 90000 && !pidAlive) {
      const failureReason = 'Процесс обновления аварийно завершился: heartbeat устарел (превышен таймаут отклика)';
      persistTerminalFailure(job, failureReason);
      activeUpdateJob = null;
      lastUpdateResult = {
        status: 'FAILURE',
        error: failureReason,
        timestamp: job.endTime,
      };
      return job;
    }
  }

  return job;
}

function isUpdateJobActive(): boolean {
  const current = reconcileUpdateJob();
  return Boolean(current && current.state === 'running');
}

// =============================================================================
// 1. GET /api/admin/system/update/status
// =============================================================================
systemRouter.get('/system/update/status', async (_req: AuthRequest, res: Response) => {
  try {
    const [gitInfo, pm2Status, dbStatus, npmVersion, diskSpace] = await Promise.all([
      getGitInfo(),
      getPm2Status(),
      getDatabaseStatus(),
      getNpmVersion(),
      getDiskSpaceMB(),
    ]);

    const lastBackup = getLastBackupMetadata();
    const lastUploadsBackup = getLastUploadsBackupMetadata();
    const currentJob = reconcileUpdateJob();
    const updateInProgress = Boolean(currentJob && currentJob.state === 'running');

    const resolvedLastResult = currentJob
      ? {
          status: currentJob.state === 'success' ? 'SUCCESS' : currentJob.state === 'failed' ? 'FAILURE' : 'UNKNOWN',
          details: currentJob.error || currentJob.logSummary[currentJob.logSummary.length - 1] || '',
          timestamp: currentJob.endTime || currentJob.startTime || undefined,
        }
      : (lastUpdateResult || getLastUpdateResultFromLog());

    // Check Node version readiness
    const nodeMajor = parseInt(process.version.replace('v', '').split('.')[0], 10) || 20;
    const isNodeCompatible = nodeMajor >= 20;
    const isDiskSpaceSufficient = diskSpace.freeMB >= 500;

    // Count physical uploads
    const uploadsRoot = process.env.UPLOADS_DIR
      ? path.resolve(process.env.UPLOADS_DIR)
      : path.resolve(process.cwd(), 'public', 'uploads');
    const audioDir = path.join(uploadsRoot, 'audio');
    const coversDir = path.join(uploadsRoot, 'covers');

    let audioCount = 0;
    let coversCount = 0;
    try {
      if (fs.existsSync(audioDir)) {
        audioCount = fs.readdirSync(audioDir).filter(f => f !== '.gitkeep' && !f.startsWith('.')).length;
      }
      if (fs.existsSync(coversDir)) {
        coversCount = fs.readdirSync(coversDir).filter(f => f !== '.gitkeep' && !f.startsWith('.')).length;
      }
    } catch {}

    res.json({
      currentCommit: gitInfo.currentCommit,
      currentCommitShort: gitInfo.currentCommitShort,
      currentBranch: gitInfo.currentBranch,
      remoteCommit: gitInfo.remoteCommit,
      remoteCommitShort: gitInfo.remoteCommitShort,
      updateAvailable: gitInfo.updateAvailable,
      currentVersion: getAppVersion(),
      nodeVersion: process.version,
      npmVersion,
      diskSpace,
      systemReadiness: {
        isNodeCompatible,
        minNodeVersion: 'v20.0.0',
        isDiskSpaceSufficient,
        minDiskSpaceMB: 500,
        isDatabaseOnline: dbStatus.status === 'connected',
      },
      pm2Status,
      databaseStatus: dbStatus,
      lastBackup,
      lastUploadsBackup,
      uploadsStats: {
        audioCount,
        coversCount,
        totalFiles: audioCount + coversCount,
        storageDirectory: uploadsRoot,
      },
      updateInProgress,
      lastUpdateResult: resolvedLastResult,
      job: currentJob || {
        id: null,
        state: 'idle',
        stage: 'idle',
        progress: 0,
        startTime: null,
        endTime: null,
        logSummary: [],
        error: null,
      },
    });
  } catch (err: any) {
    console.error('[AdminSystem] Error getting update status:', err);
    res.status(500).json({ error: 'Не удалось получить статус системы', details: err.message });
  }
});

// =============================================================================
// 2. POST /api/admin/system/update/check
// =============================================================================
systemRouter.post('/system/update/check', async (req: AuthRequest, res: Response) => {
  try {
    const gitDir = path.resolve('.git');
    if (!fs.existsSync(gitDir)) {
      return res.json({
        isGit: false,
        updateAvailable: false,
        currentCommit: 'unknown',
        remoteCommit: null,
        commitsBehind: 0,
        commitMessages: [],
        message: 'Репозиторий Git не инициализирован в данной среде',
      });
    }

    try {
      await execFileAsync('git', ['fetch', 'origin', 'main'], { cwd: process.cwd(), timeout: 15000 });
    } catch (fetchErr: any) {
      console.warn('[AdminSystem] git fetch origin main warning:', fetchErr.message);
    }

    const { stdout: curCommit } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), timeout: 3000 });
    const currentCommit = curCommit.trim();
    const currentCommitShort = currentCommit.slice(0, 7);

    let remoteCommit: string | null = null;
    let remoteCommitShort: string | null = null;
    let commitsBehind = 0;
    let commitMessages: string[] = [];

    try {
      const { stdout: remCommit } = await execFileAsync('git', ['rev-parse', 'origin/main'], { cwd: process.cwd(), timeout: 3000 });
      remoteCommit = remCommit.trim();
      remoteCommitShort = remoteCommit.slice(0, 7);

      if (remoteCommit && remoteCommit !== currentCommit) {
        const { stdout: countOut } = await execFileAsync('git', ['rev-list', '--count', 'HEAD..origin/main'], { cwd: process.cwd(), timeout: 3000 });
        commitsBehind = parseInt(countOut.trim(), 10) || 0;

        const { stdout: logOut } = await execFileAsync('git', ['log', '--oneline', '-n', '10', 'HEAD..origin/main'], { cwd: process.cwd(), timeout: 3000 });
        commitMessages = logOut.trim() ? logOut.trim().split('\n') : [];
      }
    } catch {}

    const updateAvailable = commitsBehind > 0 || (!!remoteCommit && remoteCommit !== currentCommit);

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'UPDATE_CHECK',
      details: `Checked for updates. Behind: ${commitsBehind} commits. Update available: ${updateAvailable}`,
      ip: req.ip,
    });

    res.json({
      isGit: true,
      currentCommit,
      currentCommitShort,
      remoteCommit,
      remoteCommitShort,
      commitsBehind,
      commitMessages,
      updateAvailable,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[AdminSystem] Error checking for updates:', err);
    res.status(500).json({ error: 'Ошибка при проверке обновлений', details: err.message });
  }
});

// =============================================================================
// 3. POST /api/admin/system/update
// =============================================================================
systemRouter.post('/system/update', async (req: AuthRequest, res: Response) => {
  try {
    if (isUpdateJobActive()) {
      return res.status(409).json({
        error: 'Процесс обновления уже выполняется',
        job: activeUpdateJob,
      });
    }

    const scriptPath = path.resolve('scripts/update.sh');
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({ error: 'Скрипт scripts/update.sh не найден' });
    }

    const jobId = `update_${Date.now()}`;
    activeUpdateJob = {
      id: jobId,
      state: 'running',
      stage: 'init',
      progress: 5,
      startTime: new Date().toISOString(),
      endTime: null,
      logSummary: ['[STAGE: init] Запуск единого безопасного механизма обновления Dodik Tracker...'],
      error: null,
      triggeredBy: {
        id: req.dbUser!.id,
        username: req.dbUser!.username,
      },
    };

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'SYSTEM_UPDATE_TRIGGERED',
      details: `Triggered system update job: ${jobId}`,
      ip: req.ip,
    });

    // Spawn detached child process running scripts/update.sh
    const child = spawn('bash', [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env, DODIK_UPDATE_SERVER_SPAWNED: '1' },
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    child.on('error', (err) => {
      console.error('[AdminSystem] Error spawning update process:', err);
      if (activeUpdateJob) {
        activeUpdateJob.state = 'failed';
        activeUpdateJob.error = `Failed to spawn update process: ${err.message}`;
        activeUpdateJob.endTime = new Date().toISOString();
        lastUpdateResult = {
          status: 'FAILURE',
          error: activeUpdateJob.error,
          timestamp: activeUpdateJob.endTime,
        };
      }
    });

    res.status(202).json({
      success: true,
      message: 'Процесс обновления запущен в фоновом режиме',
      job: activeUpdateJob,
    });
  } catch (err: any) {
    console.error('[AdminSystem] Error initiating update:', err);
    res.status(500).json({ error: 'Не удалось запустить обновление', details: err.message });
  }
});

// =============================================================================
// 3.1 GET /api/admin/system/update/logs
// =============================================================================
systemRouter.get('/system/update/logs', async (_req: AuthRequest, res: Response) => {
  try {
    const logPath = path.resolve('logs/update.log');
    if (!fs.existsSync(logPath)) {
      return res.json({ logs: 'Лог-файл обновления еще не создан.' });
    }
    const rawContent = fs.readFileSync(logPath, 'utf8');
    const sanitizedContent = sanitizeSecretsText(rawContent);
    const lines = sanitizedContent.split('\n');
    const recentLines = lines.slice(-500).join('\n');

    res.json({
      logs: recentLines,
      totalLines: lines.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Не удалось прочитать лог обновления', details: err.message });
  }
});

// =============================================================================
// 4. GET /api/admin/system/backups (Database Backups)
// =============================================================================
systemRouter.get('/system/backups', async (_req: AuthRequest, res: Response) => {
  try {
    const candidatesDirs = [path.resolve('backups/db'), path.resolve('backups')];
    const seenFiles = new Set<string>();
    const backups: any[] = [];

    for (const dir of candidatesDirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.startsWith('dodik_tracker_backup_') && f.endsWith('.sql'));
        for (const filename of files) {
          if (seenFiles.has(filename)) continue;
          seenFiles.add(filename);

          const fullSqlPath = path.join(dir, filename);
          const metaPath = path.join(dir, `${filename}.meta.json`);
          const stat = fs.statSync(fullSqlPath);

          if (fs.existsSync(metaPath)) {
            try {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
              backups.push({
                ...meta,
                filename,
                sizeBytes: meta.sizeBytes || stat.size,
                sizeHuman: meta.sizeHuman || formatBytes(stat.size),
                createdAt: meta.createdAt || stat.mtime.toISOString(),
              });
              continue;
            } catch {}
          }

          backups.push({
            filename,
            createdAt: stat.mtime.toISOString(),
            sizeBytes: stat.size,
            sizeHuman: formatBytes(stat.size),
            database: process.env.SQL_DB_NAME || 'dodik_tracker',
            gitCommit: '—',
            appVersion: getAppVersion(),
            format: 'plain_sql',
            status: 'VALID',
          });
        }
      }
    }

    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const retentionCount = parseInt(process.env.BACKUP_RETENTION_COUNT || '10', 10);

    res.json({
      backups,
      total: backups.length,
      retentionCount: isNaN(retentionCount) ? 10 : retentionCount,
      storageDirectory: 'backups/db/',
    });
  } catch (err: any) {
    console.error('[AdminSystem] Error listing backups:', err);
    res.status(500).json({ error: 'Не удалось получить список резервных копий', details: err.message });
  }
});

// =============================================================================
// 5. POST /api/admin/system/backups (Create DB Backup)
// =============================================================================
systemRouter.post('/system/backups', async (req: AuthRequest, res: Response) => {
  try {
    const scriptPath = path.resolve('scripts/backup.sh');
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({ error: 'Скрипт scripts/backup.sh не найден' });
    }

    const { stdout } = await execFileAsync('bash', [scriptPath, 'db'], {
      cwd: process.cwd(),
      timeout: 120000,
    });

    const latestBackup = getLastBackupMetadata();

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'BACKUP_CREATED',
      details: `Created database backup: ${latestBackup?.filename || 'unknown'}`,
      ip: req.ip,
    });

    res.status(201).json({
      success: true,
      message: 'Резервная копия базы данных успешно создана',
      backup: latestBackup,
      output: stdout.trim(),
    });
  } catch (err: any) {
    console.error('[AdminSystem] Error creating backup:', err);
    res.status(500).json({
      error: 'Ошибка при создании резервной копии базы данных',
      details: err.stderr || err.stdout || err.message,
    });
  }
});

// =============================================================================
// 6. DELETE /api/admin/system/backups/:filename
// =============================================================================
systemRouter.delete('/system/backups/:filename', async (req: AuthRequest, res: Response) => {
  try {
    const { filename } = req.params;

    if (!filename || !/^dodik_tracker_backup_[0-9]{8}_[0-9]{6}\.sql$/.test(filename)) {
      return res.status(400).json({
        error: 'Некорректное имя файла. Разрешены только файлы вида dodik_tracker_backup_YYYYMMDD_HHMMSS.sql',
      });
    }

    const possibleDirs = [path.resolve('backups/db'), path.resolve('backups')];
    let targetFile: string | null = null;
    let targetDir: string | null = null;

    for (const d of possibleDirs) {
      const f = path.resolve(d, filename);
      if (fs.existsSync(f)) {
        targetFile = f;
        targetDir = d;
        break;
      }
    }

    if (!targetFile || !targetDir) {
      return res.status(404).json({ error: 'Файл резервной копии не найден' });
    }

    // Safety rule: Never delete the only remaining backup across both folders
    const allDbBackups = possibleDirs.flatMap(d => fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.startsWith('dodik_tracker_backup_') && f.endsWith('.sql')) : []);
    if (allDbBackups.length <= 1) {
      return res.status(400).json({ error: 'Запрещено удалять единственный существующий бэкап' });
    }

    fs.unlinkSync(targetFile);
    const metaFile = `${targetFile}.meta.json`;
    if (fs.existsSync(metaFile)) {
      fs.unlinkSync(metaFile);
    }

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'BACKUP_DELETED',
      details: `Deleted database backup: ${filename}`,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: `Резервная копия ${filename} успешно удалена`,
      filename,
    });
  } catch (err: any) {
    console.error('[AdminSystem] Error deleting backup:', err);
    res.status(500).json({ error: 'Не удалось удалить резервную копию', details: err.message });
  }
});

// =============================================================================
// 7. GET /api/admin/system/backups/:filename/download
// =============================================================================
systemRouter.get('/system/backups/:filename/download', async (req: AuthRequest, res: Response) => {
  try {
    const { filename } = req.params;

    if (!filename || !/^dodik_tracker_backup_[0-9]{8}_[0-9]{6}\.sql$/.test(filename)) {
      return res.status(400).json({
        error: 'Некорректное имя файла. Разрешены только файлы вида dodik_tracker_backup_YYYYMMDD_HHMMSS.sql',
      });
    }

    const possibleDirs = [path.resolve('backups/db'), path.resolve('backups')];
    let targetFile: string | null = null;

    for (const d of possibleDirs) {
      const f = path.resolve(d, filename);
      if (fs.existsSync(f)) {
        targetFile = f;
        break;
      }
    }

    if (!targetFile) {
      return res.status(404).json({ error: 'Файл резервной копии не найден' });
    }

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'BACKUP_DOWNLOADED',
      details: `Downloaded database backup: ${filename}`,
      ip: req.ip,
    });

    res.download(targetFile, filename, (err) => {
      if (err && !res.headersSent) {
        console.error('[AdminSystem] Error transmitting backup file:', err);
        res.status(500).json({ error: 'Ошибка передачи файла' });
      }
    });
  } catch (err: any) {
    console.error('[AdminSystem] Error downloading backup:', err);
    res.status(500).json({ error: 'Ошибка при скачивании резервной копии', details: err.message });
  }
});

// =============================================================================
// 8. Uploads Management & Verification Endpoints
// =============================================================================

// GET /api/admin/system/uploads/status
systemRouter.get('/system/uploads/status', async (_req: AuthRequest, res: Response) => {
  try {
    const uploadsRoot = process.env.UPLOADS_DIR
      ? path.resolve(process.env.UPLOADS_DIR)
      : path.resolve(process.cwd(), 'public', 'uploads');
    const audioDir = path.join(uploadsRoot, 'audio');
    const coversDir = path.join(uploadsRoot, 'covers');

    let audioCount = 0;
    let coversCount = 0;
    let totalBytes = 0;

    const countFiles = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const item of fs.readdirSync(dir)) {
        if (item === '.gitkeep' || item.startsWith('.')) continue;
        const full = path.join(dir, item);
        try {
          const stat = fs.statSync(full);
          if (stat.isFile()) {
            totalBytes += stat.size;
            if (dir === audioDir) audioCount++;
            if (dir === coversDir) coversCount++;
          }
        } catch {}
      }
    };

    countFiles(audioDir);
    countFiles(coversDir);

    const lastUploadsBackup = getLastUploadsBackupMetadata();

    res.json({
      uploadsRoot,
      audioCount,
      coversCount,
      totalFiles: audioCount + coversCount,
      totalBytes,
      totalSizeHuman: formatBytes(totalBytes),
      lastUploadsBackup,
    });
  } catch (err: any) {
    console.error('[AdminSystem] Error getting uploads status:', err);
    res.status(500).json({ error: 'Не удалось получить статус загрузок', details: err.message });
  }
});

// POST /api/admin/system/uploads/verify (Diagnostic Cross-Check DB <-> Filesystem)
systemRouter.post('/system/uploads/verify', async (req: AuthRequest, res: Response) => {
  try {
    const report = await verifyUploadsAndDatabase({ checkHttp: true });

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'UPLOADS_VERIFIED',
      details: `Uploads verified: ${report.summary.totalPhysicalFiles} files, ${report.summary.brokenDbReferencesCount} broken references, ${report.summary.orphanFilesCount} orphan files. Status: ${report.summary.status}`,
      ip: req.ip,
    });

    res.json(report);
  } catch (err: any) {
    console.error('[AdminSystem] Error verifying uploads:', err);
    res.status(500).json({ error: 'Ошибка диагностики файлов загрузок', details: err.message });
  }
});

// POST /api/admin/system/uploads/backup (Create Uploads Archive Backup)
systemRouter.post('/system/uploads/backup', async (req: AuthRequest, res: Response) => {
  try {
    const scriptPath = path.resolve('scripts/backup.sh');
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({ error: 'Скрипт scripts/backup.sh не найден' });
    }

    const { stdout } = await execFileAsync('bash', [scriptPath, 'uploads'], {
      cwd: process.cwd(),
      timeout: 180000,
    });

    const latestUploadsBackup = getLastUploadsBackupMetadata();

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'UPLOADS_BACKUP_CREATED',
      details: `Created uploads archive backup: ${latestUploadsBackup?.filename || 'unknown'}`,
      ip: req.ip,
    });

    res.status(201).json({
      success: true,
      message: 'Резервная копия пользовательских файлов успешно создана',
      backup: latestUploadsBackup,
      output: stdout.trim(),
    });
  } catch (err: any) {
    console.error('[AdminSystem] Error creating uploads backup:', err);
    res.status(500).json({
      error: 'Ошибка создания резервной копии файлов',
      details: err.stderr || err.stdout || err.message,
    });
  }
});

// GET /api/admin/system/backups/uploads (List Uploads Backups)
systemRouter.get('/system/backups/uploads', async (_req: AuthRequest, res: Response) => {
  try {
    const uploadsBackupDir = path.resolve('backups/uploads');
    if (!fs.existsSync(uploadsBackupDir)) {
      fs.mkdirSync(uploadsBackupDir, { recursive: true });
    }

    const files = fs.readdirSync(uploadsBackupDir).filter(f => f.startsWith('dodik_tracker_uploads_') && f.endsWith('.tar.gz'));
    const backups = files.map((filename) => {
      const fullPath = path.join(uploadsBackupDir, filename);
      const metaPath = path.join(uploadsBackupDir, `${filename}.meta.json`);
      const stat = fs.statSync(fullPath);

      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          return {
            ...meta,
            filename,
            sizeBytes: meta.sizeBytes || stat.size,
            sizeHuman: meta.sizeHuman || formatBytes(stat.size),
            createdAt: meta.createdAt || stat.mtime.toISOString(),
          };
        } catch {}
      }

      return {
        filename,
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        sizeHuman: formatBytes(stat.size),
        format: 'tar.gz',
        status: 'VALID',
      };
    });

    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      backups,
      total: backups.length,
      storageDirectory: 'backups/uploads/',
    });
  } catch (err: any) {
    console.error('[AdminSystem] Error listing uploads backups:', err);
    res.status(500).json({ error: 'Не удалось получить список архивов загрузок', details: err.message });
  }
});

// GET /api/admin/system/backups/uploads/:filename/download
systemRouter.get('/system/backups/uploads/:filename/download', async (req: AuthRequest, res: Response) => {
  try {
    const { filename } = req.params;
    if (!filename || !/^dodik_tracker_uploads_[0-9]{8}_[0-9]{6}\.tar\.gz$/.test(filename)) {
      return res.status(400).json({ error: 'Некорректное имя файла' });
    }

    const uploadsBackupDir = path.resolve('backups/uploads');
    const targetFile = path.resolve(uploadsBackupDir, filename);

    if (!targetFile.startsWith(uploadsBackupDir + path.sep) || !fs.existsSync(targetFile)) {
      return res.status(404).json({ error: 'Файл архива не найден' });
    }

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'UPLOADS_BACKUP_DOWNLOADED',
      details: `Downloaded uploads archive: ${filename}`,
      ip: req.ip,
    });

    res.download(targetFile, filename, (err) => {
      if (err && !res.headersSent) {
        console.error('[AdminSystem] Error transmitting archive file:', err);
        res.status(500).json({ error: 'Ошибка передачи файла' });
      }
    });
  } catch (err: any) {
    console.error('[AdminSystem] Error downloading uploads archive:', err);
    res.status(500).json({ error: 'Ошибка при скачивании архива', details: err.message });
  }
});

// DELETE /api/admin/system/backups/uploads/:filename
systemRouter.delete('/system/backups/uploads/:filename', async (req: AuthRequest, res: Response) => {
  try {
    const { filename } = req.params;
    if (!filename || !/^dodik_tracker_uploads_[0-9]{8}_[0-9]{6}\.tar\.gz$/.test(filename)) {
      return res.status(400).json({ error: 'Некорректное имя файла' });
    }

    const uploadsBackupDir = path.resolve('backups/uploads');
    const targetFile = path.resolve(uploadsBackupDir, filename);

    if (!targetFile.startsWith(uploadsBackupDir + path.sep) || !fs.existsSync(targetFile)) {
      return res.status(404).json({ error: 'Файл архива не найден' });
    }

    fs.unlinkSync(targetFile);
    const metaFile = `${targetFile}.meta.json`;
    if (fs.existsSync(metaFile)) {
      fs.unlinkSync(metaFile);
    }

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'UPLOADS_BACKUP_DELETED',
      details: `Deleted uploads archive: ${filename}`,
      ip: req.ip,
    });

    res.json({ success: true, message: `Архив ${filename} успешно удален` });
  } catch (err: any) {
    console.error('[AdminSystem] Error deleting uploads archive:', err);
    res.status(500).json({ error: 'Не удалось удалить архив', details: err.message });
  }
});
