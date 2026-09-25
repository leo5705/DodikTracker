import { Router, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { spawn, exec, execFile } from 'child_process';
import { promisify } from 'util';
import { requireAuth, isAdminRole, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import { sql } from 'drizzle-orm';
import { logAdminAction } from './auditHelper.ts';

const execAsync = promisify(exec);
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
  | 'env_check'
  | 'git_check'
  | 'backup'
  | 'git_pull'
  | 'install'
  | 'migration'
  | 'build'
  | 'restart'
  | 'healthcheck'
  | 'completed';

export type UpdateState = 'idle' | 'queued' | 'running' | 'success' | 'failed';

export interface UpdateJob {
  id: string;
  state: UpdateState;
  stage: UpdateStage;
  progress: number;
  startTime: string | null;
  endTime: string | null;
  logSummary: string[];
  error: string | null;
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
  const backupDir = path.resolve('backups');
  if (!fs.existsSync(backupDir)) return null;

  try {
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('dodik_tracker_backup_') && f.endsWith('.sql'));
    if (files.length === 0) return null;

    files.sort((a, b) => {
      const statA = fs.statSync(path.join(backupDir, a));
      const statB = fs.statSync(path.join(backupDir, b));
      return statB.mtimeMs - statA.mtimeMs;
    });

    const latest = files[0];
    const metaPath = path.join(backupDir, `${latest}.meta.json`);
    if (fs.existsSync(metaPath)) {
      try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {}
    }

    const stat = fs.statSync(path.join(backupDir, latest));
    return {
      filename: latest,
      createdAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      sizeHuman: formatBytes(stat.size),
      format: 'plain_sql',
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

function isUpdateJobActive(): boolean {
  return !!(activeUpdateJob && (activeUpdateJob.state === 'running' || activeUpdateJob.state === 'queued'));
}

// =============================================================================
// 1. GET /api/admin/system/update/status
// =============================================================================
systemRouter.get('/system/update/status', async (_req: AuthRequest, res: Response) => {
  try {
    const [gitInfo, pm2Status, dbStatus, npmVersion] = await Promise.all([
      getGitInfo(),
      getPm2Status(),
      getDatabaseStatus(),
      getNpmVersion(),
    ]);

    const lastBackup = getLastBackupMetadata();
    const updateInProgress = isUpdateJobActive();
    const resolvedLastResult = activeUpdateJob
      ? {
          status: activeUpdateJob.state === 'success' ? 'SUCCESS' : activeUpdateJob.state === 'failed' ? 'FAILURE' : 'UNKNOWN',
          details: activeUpdateJob.error || activeUpdateJob.logSummary[activeUpdateJob.logSummary.length - 1] || '',
          timestamp: activeUpdateJob.endTime || activeUpdateJob.startTime || undefined,
        }
      : (lastUpdateResult || getLastUpdateResultFromLog());

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
      pm2Status,
      databaseStatus: dbStatus,
      lastBackup,
      updateInProgress,
      lastUpdateResult: resolvedLastResult,
      job: activeUpdateJob || {
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

    // Safely run git fetch origin main
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
      logSummary: ['[STAGE: init] Запуск единого механизма обновления Dodik Tracker...'],
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

    // Spawn child process running scripts/update.sh
    const child = spawn('bash', [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env },
    });

    const processLine = (rawLine: string) => {
      const line = rawLine.trim();
      if (!line) return;

      if (activeUpdateJob) {
        activeUpdateJob.logSummary.push(line);
        if (activeUpdateJob.logSummary.length > 60) {
          activeUpdateJob.logSummary.shift();
        }

        // Stage & Progress parsing
        if (line.includes('[STAGE: init]') || line.includes('Update process started')) {
          activeUpdateJob.stage = 'init';
          activeUpdateJob.progress = 5;
        } else if (line.includes('[STAGE: env_check]') || line.includes('Verifying required tools') || line.includes('Loading environment')) {
          activeUpdateJob.stage = 'env_check';
          activeUpdateJob.progress = 10;
        } else if (line.includes('[STAGE: git_check]') || line.includes('Verifying Git repository status')) {
          activeUpdateJob.stage = 'git_check';
          activeUpdateJob.progress = 15;
        } else if (line.includes('[STAGE: backup]') || line.includes('Performing database backup')) {
          activeUpdateJob.stage = 'backup';
          activeUpdateJob.progress = 25;
        } else if (line.includes('[STAGE: git_pull]') || line.includes('Fetching latest changes') || line.includes('Pulling updates')) {
          activeUpdateJob.stage = 'git_pull';
          activeUpdateJob.progress = 40;
        } else if (line.includes('[STAGE: install]') || line.includes('Installing npm dependencies')) {
          activeUpdateJob.stage = 'install';
          activeUpdateJob.progress = 55;
        } else if (line.includes('[STAGE: migration]') || line.includes('Executing database migrations')) {
          activeUpdateJob.stage = 'migration';
          activeUpdateJob.progress = 70;
        } else if (line.includes('[STAGE: build]') || line.includes('Building production application')) {
          activeUpdateJob.stage = 'build';
          activeUpdateJob.progress = 85;
        } else if (line.includes('[STAGE: restart]') || line.includes('Restarting PM2 process')) {
          activeUpdateJob.stage = 'restart';
          activeUpdateJob.progress = 92;
        } else if (line.includes('[STAGE: healthcheck]') || line.includes('Waiting for application') || line.includes('Live Health Check')) {
          activeUpdateJob.stage = 'healthcheck';
          activeUpdateJob.progress = 96;
        } else if (line.includes('[STAGE: completed]') || line.includes('SUCCESS: Dodik Tracker updated') || line.includes('already up to date')) {
          activeUpdateJob.stage = 'completed';
          activeUpdateJob.state = 'success';
          activeUpdateJob.progress = 100;
        } else if (line.includes('UPDATE FAILED') || line.includes('FAILURE: Health check failed')) {
          activeUpdateJob.state = 'failed';
          activeUpdateJob.error = line;
        }
      }
    };

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      text.split('\n').forEach(processLine);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      text.split('\n').forEach(processLine);
    });

    child.on('error', (err) => {
      if (activeUpdateJob) {
        activeUpdateJob.state = 'failed';
        activeUpdateJob.error = err.message;
        activeUpdateJob.endTime = new Date().toISOString();
        lastUpdateResult = {
          status: 'FAILURE',
          error: err.message,
          timestamp: activeUpdateJob.endTime,
        };
      }
    });

    child.on('close', (code) => {
      if (activeUpdateJob) {
        activeUpdateJob.endTime = new Date().toISOString();
        if (code === 0) {
          activeUpdateJob.state = 'success';
          activeUpdateJob.stage = 'completed';
          activeUpdateJob.progress = 100;
          lastUpdateResult = {
            status: 'SUCCESS',
            details: 'Update completed successfully',
            timestamp: activeUpdateJob.endTime,
          };
        } else {
          activeUpdateJob.state = 'failed';
          if (!activeUpdateJob.error) {
            activeUpdateJob.error = `Update process exited with error code ${code}`;
          }
          lastUpdateResult = {
            status: 'FAILURE',
            error: activeUpdateJob.error,
            timestamp: activeUpdateJob.endTime,
          };
        }
      }
    });

    // Respond immediately with HTTP 202 Accepted
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
// 4. GET /api/admin/system/backups
// =============================================================================
systemRouter.get('/system/backups', async (_req: AuthRequest, res: Response) => {
  try {
    const backupDir = path.resolve('backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('dodik_tracker_backup_') && f.endsWith('.sql'));

    const backups = files.map((filename) => {
      const fullSqlPath = path.join(backupDir, filename);
      const metaPath = path.join(backupDir, `${filename}.meta.json`);
      const stat = fs.statSync(fullSqlPath);

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
        database: process.env.SQL_DB_NAME || 'dodik_tracker',
        gitCommit: '—',
        appVersion: getAppVersion(),
        format: 'plain_sql',
        status: 'VALID',
      };
    });

    // Sort newest first
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const retentionCount = parseInt(process.env.BACKUP_RETENTION_COUNT || '10', 10);

    res.json({
      backups,
      total: backups.length,
      retentionCount: isNaN(retentionCount) ? 10 : retentionCount,
      storageDirectory: 'backups/',
    });
  } catch (err: any) {
    console.error('[AdminSystem] Error listing backups:', err);
    res.status(500).json({ error: 'Не удалось получить список резервных копий', details: err.message });
  }
});

// =============================================================================
// 5. POST /api/admin/system/backups
// =============================================================================
systemRouter.post('/system/backups', async (req: AuthRequest, res: Response) => {
  try {
    const scriptPath = path.resolve('scripts/backup.sh');
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({ error: 'Скрипт scripts/backup.sh не найден' });
    }

    const { stdout, stderr } = await execFileAsync('bash', [scriptPath, 'create'], {
      cwd: process.cwd(),
      timeout: 120000, // 2 minutes max
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

    // Strict security validation against Path Traversal & Injection
    if (!filename || !/^dodik_tracker_backup_[0-9]{8}_[0-9]{6}\.sql$/.test(filename)) {
      return res.status(400).json({
        error: 'Некорректное имя файла. Разрешены только файлы вида dodik_tracker_backup_YYYYMMDD_HHMMSS.sql',
      });
    }

    const backupDir = path.resolve('backups');
    const targetFile = path.resolve(backupDir, filename);

    // Path traversal check
    if (!targetFile.startsWith(backupDir + path.sep)) {
      return res.status(400).json({ error: 'Недопустимый путь к файлу' });
    }

    if (!fs.existsSync(targetFile)) {
      return res.status(404).json({ error: 'Файл резервной копии не найден' });
    }

    // Safety rule: Never delete the only remaining backup
    const existing = fs.readdirSync(backupDir).filter(f => f.startsWith('dodik_tracker_backup_') && f.endsWith('.sql'));
    if (existing.length <= 1) {
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

    // Strict security validation against Path Traversal & Injection
    if (!filename || !/^dodik_tracker_backup_[0-9]{8}_[0-9]{6}\.sql$/.test(filename)) {
      return res.status(400).json({
        error: 'Некорректное имя файла. Разрешены только файлы вида dodik_tracker_backup_YYYYMMDD_HHMMSS.sql',
      });
    }

    const backupDir = path.resolve('backups');
    const targetFile = path.resolve(backupDir, filename);

    // Path traversal check
    if (!targetFile.startsWith(backupDir + path.sep)) {
      return res.status(400).json({ error: 'Недопустимый путь к файлу' });
    }

    if (!fs.existsSync(targetFile)) {
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
