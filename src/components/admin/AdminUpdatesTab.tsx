import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Server,
  Database,
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Terminal,
  Clock,
  Sparkles,
  Copy,
  Check,
  Download,
  Trash2,
  HardDrive,
  GitCommit,
  ExternalLink,
  Loader2,
  Play,
  RotateCcw,
  AlertCircle,
  FileText,
  Activity,
  Cpu,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/NotificationContext.tsx';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';

interface SystemUpdateStatus {
  currentCommit: string;
  currentCommitShort: string;
  currentBranch: string;
  remoteCommit: string | null;
  remoteCommitShort: string | null;
  updateAvailable: boolean;
  currentVersion: string;
  nodeVersion: string;
  npmVersion: string;
  pm2Status: {
    status: string;
    uptime?: number;
    restarts?: number;
    memory?: number;
    cpu?: number;
  };
  databaseStatus: {
    status: 'connected' | 'disconnected';
    latencyMs?: number;
    error?: string;
  };
  lastBackup: {
    filename: string;
    createdAt: string;
    sizeBytes?: number;
    sizeHuman?: string;
    database?: string;
    gitCommit?: string;
  } | null;
  updateInProgress: boolean;
  lastUpdateResult?: {
    status: 'SUCCESS' | 'FAILURE' | 'UP_TO_DATE' | 'UNKNOWN';
    timestamp?: string;
    details?: string;
    error?: string;
  } | null;
  job?: {
    id: string | null;
    state: 'idle' | 'queued' | 'running' | 'success' | 'failed';
    stage: 'idle' | 'backup' | 'git' | 'install' | 'migration' | 'build' | 'restart' | 'healthcheck' | 'completed';
    progress: number;
    startTime: string | null;
    endTime: string | null;
    logSummary: string[];
    error: string | null;
    triggeredBy?: {
      id: number;
      username: string;
    };
  };
}

interface CheckResult {
  isGit: boolean;
  currentCommit: string;
  currentCommitShort: string;
  remoteCommit: string | null;
  remoteCommitShort: string | null;
  commitsBehind: number;
  commitMessages: string[];
  updateAvailable: boolean;
  timestamp: string;
  message?: string;
}

interface BackupItem {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  sizeHuman: string;
  database: string;
  gitCommit: string;
  appVersion?: string;
  format?: string;
  status?: string;
}

interface BackupsResponse {
  backups: BackupItem[];
  total: number;
  retentionCount: number;
  storageDirectory: string;
}

const STAGES_LIST: { id: string; label: string; desc: string }[] = [
  { id: 'init', label: 'Инициализация', desc: 'Блокировка и подготовка окружения' },
  { id: 'env_check', label: 'Проверка окружения', desc: 'Проверка системных утилит' },
  { id: 'git_check', label: 'Проверка Git', desc: 'Проверка чистоты рабочей копии' },
  { id: 'backup', label: 'Резервная копия', desc: 'Создание безопасного дампа PostgreSQL' },
  { id: 'git_pull', label: 'Pull Git', desc: 'Fast-forward обновление репозитория' },
  { id: 'install', label: 'Зависимости', desc: 'Установка npm пакетов' },
  { id: 'migration', label: 'Миграции БД', desc: 'Применение схемы Drizzle ORM' },
  { id: 'build', label: 'Сборка', desc: 'Vite клиент и esbuild сервер' },
  { id: 'restart', label: 'Перезапуск', desc: 'Перезапуск процесса PM2 dodik-tracker' },
  { id: 'healthcheck', label: 'Проверка здоровья', desc: 'Верификация эндпоинта /api/health' },
  { id: 'completed', label: 'Завершено', desc: 'Система обновлена и онлайн' },
];

export function AdminUpdatesTab() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();

  const [statusData, setStatusData] = useState<SystemUpdateStatus | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [retentionCount, setRetentionCount] = useState<number>(10);

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [backupToDelete, setBackupToDelete] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Format helpers
  const formatUptime = (seconds?: number) => {
    if (!seconds) return '—';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}д ${h}ч ${m}м`;
    if (h > 0) return `${h}ч ${m}м`;
    return `${m}м`;
  };

  const formatDateTime = (isoStr?: string | null) => {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Fetch status and backups
  const fetchStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/system/update/status');
      if (res.ok) {
        const data: SystemUpdateStatus = await res.json();
        setStatusData(data);
        return data;
      }
    } catch (err) {
      console.error('Failed to fetch update status:', err);
    }
    return null;
  }, [authFetch]);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/system/backups');
      if (res.ok) {
        const data: BackupsResponse = await res.json();
        setBackups(data.backups || []);
        if (data.retentionCount) {
          setRetentionCount(data.retentionCount);
        }
      }
    } catch (err) {
      console.error('Failed to fetch backups:', err);
    }
  }, [authFetch]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStatus(), fetchBackups()]);
    setLoading(false);
  }, [fetchStatus, fetchBackups]);

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Polling management for active update job
  useEffect(() => {
    const isRunning = statusData?.updateInProgress || statusData?.job?.state === 'running';

    if (isRunning) {
      if (!pollTimerRef.current) {
        pollTimerRef.current = setInterval(async () => {
          const freshData = await fetchStatus();
          if (freshData && freshData.job && (freshData.job.state === 'success' || freshData.job.state === 'failed')) {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            fetchBackups();
            if (freshData.job.state === 'success') {
              showToast('Обновление платформы успешно завершено!', 'success');
            } else {
              showToast('Ошибка при обновлении платформы', 'error');
            }
          }
        }, 1500);
      }
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [statusData?.updateInProgress, statusData?.job?.state, fetchStatus, fetchBackups, showToast]);

  // Auto-scroll terminal logs during update
  useEffect(() => {
    if (statusData?.job?.state === 'running' && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [statusData?.job?.logSummary]);

  // Action: Check for updates
  const handleCheckUpdates = async () => {
    setChecking(true);
    try {
      const res = await authFetch('/api/admin/system/update/check', { method: 'POST' });
      if (res.ok) {
        const data: CheckResult = await res.json();
        setCheckResult(data);
        setLastCheckTime(new Date().toLocaleTimeString('ru-RU'));
        await fetchStatus();
        if (data.updateAvailable) {
          showToast(`Доступны обновления: ${data.commitsBehind} новых коммитов`, 'info');
        } else {
          showToast('Установлена актуальная версия системы', 'success');
        }
      } else {
        const err = await res.json();
        showToast(err.error || 'Ошибка проверки обновлений', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Сетевая ошибка при проверке', 'error');
    } finally {
      setChecking(false);
    }
  };

  // Action: Start update
  const handleStartUpdate = async () => {
    setShowUpdateModal(false);
    setUpdating(true);
    try {
      const res = await authFetch('/api/admin/system/update', { method: 'POST' });
      if (res.status === 202) {
        showToast('Процесс обновления запущен в фоновом режиме', 'info');
        await fetchStatus();
      } else {
        const err = await res.json();
        showToast(err.error || 'Не удалось запустить обновление', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка запуска обновления', 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Action: Create manual backup
  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await authFetch('/api/admin/system/backups', { method: 'POST' });
      if (res.status === 201) {
        const data = await res.json();
        showToast('Резервная копия базы данных успешно создана', 'success');
        await fetchBackups();
        await fetchStatus();
      } else {
        const err = await res.json();
        showToast(err.error || 'Не удалось создать резервную копию', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка при создании резервной копии', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  // Action: Download backup file
  const handleDownloadBackup = async (filename: string) => {
    setDownloadingFile(filename);
    try {
      const res = await authFetch(`/api/admin/system/backups/${filename}/download`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast(`Файл ${filename} успешно скачан`, 'success');
      } else {
        const err = await res.json();
        showToast(err.error || 'Не удалось скачать файл', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка скачивания', 'error');
    } finally {
      setDownloadingFile(null);
    }
  };

  // Action: Delete backup file
  const handleDeleteBackup = async () => {
    if (!backupToDelete) return;
    const fname = backupToDelete;
    setBackupToDelete(null);
    try {
      const res = await authFetch(`/api/admin/system/backups/${fname}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`Резервная копия ${fname} удалена`, 'success');
        await fetchBackups();
        await fetchStatus();
      } else {
        const err = await res.json();
        showToast(err.error || 'Не удалось удалить резервную копию', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка при удалении', 'error');
    }
  };

  const job = statusData?.job;
  const isJobRunning = job && job.state === 'running';
  const isJobSuccess = job && job.state === 'success';
  const isJobFailed = job && job.state === 'failed';

  const updateAvailable =
    checkResult?.updateAvailable ?? statusData?.updateAvailable ?? false;

  const currentCommitShort =
    statusData?.currentCommitShort ||
    (statusData?.currentCommit ? statusData.currentCommit.slice(0, 7) : 'unknown');

  const remoteCommitShort =
    checkResult?.remoteCommitShort ||
    statusData?.remoteCommitShort ||
    (statusData?.remoteCommit ? statusData.remoteCommit.slice(0, 7) : null);

  const getStageIndex = (stageId?: string) => {
    if (!stageId || stageId === 'idle') return -1;
    const idx = STAGES_LIST.findIndex((s) => s.id === stageId);
    return idx >= 0 ? idx : 0;
  };

  const currentStageIndex = getStageIndex(job?.stage);

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      {/* 1. Header Overview Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-[#A78BFA] shadow-inner shrink-0">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#F8FAFC]">
              Обслуживание и обновление системы
            </h2>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              Единый безопасный центр управления релизами, миграциями и бэкапами PostgreSQL
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={refreshAll}
            disabled={loading || checking || isJobRunning}
            className="flex items-center gap-2 h-10 px-4 rounded-2xl bg-[#11152A] hover:bg-[#1E2442] text-xs sm:text-sm font-semibold text-[#F8FAFC] border border-[#1E2442] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-[#8B5CF6] ${loading ? 'animate-spin' : ''}`} />
            <span>Обновить статус</span>
          </button>
        </div>
      </div>

      {/* 2. Key Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Version */}
        <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1 shadow-md">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span className="font-semibold">Версия</span>
            <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
          </div>
          <div className="text-xl font-bold font-mono text-[#F8FAFC]">
            v{statusData?.currentVersion || '1.0.0'}
          </div>
          <div className="text-[11px] text-[#64748B] font-mono truncate">
            Node: <span className="text-[#A78BFA]">{statusData?.nodeVersion || 'v20.x'}</span>
          </div>
        </div>

        {/* Current Commit */}
        <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1 shadow-md">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span className="font-semibold">Коммит</span>
            <GitCommit className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold font-mono text-[#F8FAFC]">{currentCommitShort}</span>
            {currentCommitShort !== 'unknown' && (
              <button
                onClick={() => copyToClipboard(statusData?.currentCommit || '', 'commit')}
                className="p-1 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#1E2442] transition-colors cursor-pointer"
                title="Скопировать полный хеш коммита"
              >
                {copiedText === 'commit' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
          <div className="text-[11px] text-[#64748B] font-mono truncate">
            Ветка: <span className="text-emerald-400">{statusData?.currentBranch || 'main'}</span>
          </div>
        </div>

        {/* Database Status */}
        <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1 shadow-md">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span className="font-semibold">База данных</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                statusData?.databaseStatus?.status === 'connected'
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span className="text-base font-bold font-mono text-[#F8FAFC]">
              {statusData?.databaseStatus?.status === 'connected' ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
          <div className="text-[11px] text-[#64748B] font-mono">
            {statusData?.databaseStatus?.latencyMs !== undefined
              ? `Задержка: ${statusData.databaseStatus.latencyMs}мс`
              : 'PostgreSQL'}
          </div>
        </div>

        {/* PM2 & Process Health */}
        <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1 shadow-md">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span className="font-semibold">Процесс PM2</span>
            <Cpu className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                statusData?.pm2Status?.status === 'online'
                  ? 'bg-emerald-400'
                  : 'bg-amber-400'
              }`}
            />
            <span className="text-base font-bold font-mono text-[#F8FAFC]">
              {statusData?.pm2Status?.status === 'online' ? 'ONLINE' : statusData?.pm2Status?.status || 'UNKNOWN'}
            </span>
          </div>
          <div className="text-[11px] text-[#64748B] font-mono truncate">
            Аптайм: {formatUptime(statusData?.pm2Status?.uptime)}
          </div>
        </div>

        {/* Latest Backup */}
        <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1 shadow-md">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span className="font-semibold">Крайний бэкап</span>
            <HardDrive className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-base font-bold font-mono text-[#F8FAFC] truncate">
            {statusData?.lastBackup ? statusData.lastBackup.sizeHuman || 'Дамп создан' : 'Нет бэкапов'}
          </div>
          <div className="text-[11px] text-[#64748B] font-mono truncate">
            {statusData?.lastBackup ? formatDateTime(statusData.lastBackup.createdAt) : 'Не создавался'}
          </div>
        </div>

        {/* Last Check */}
        <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1 shadow-md">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span className="font-semibold">Проверка Git</span>
            <Clock className="w-4 h-4 text-[#8B5CF6]" />
          </div>
          <div className="text-base font-bold font-mono text-[#F8FAFC]">
            {lastCheckTime || 'Не проверялось'}
          </div>
          <div className="text-[11px] text-[#64748B] font-mono truncate">
            {updateAvailable ? (
              <span className="text-amber-400 font-bold">Есть обновления</span>
            ) : (
              <span className="text-emerald-400">Актуально</span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Section: System Update Management */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-center text-[#A78BFA]">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#F8FAFC]">Обновление системы</h3>
              <p className="text-xs text-[#94A3B8]">
                Автоматизированный цикл: Backup → Git Pull → npm install → DB Migrate → Build → PM2 Restart → Healthcheck
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleCheckUpdates}
              disabled={checking || isJobRunning}
              className="flex items-center gap-2 h-10 px-4 rounded-2xl bg-[#11152A] hover:bg-[#1E2442] text-xs sm:text-sm font-semibold text-[#F8FAFC] border border-[#1E2442] transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-[#A78BFA] ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? 'Проверка Git...' : 'Проверить обновления'}</span>
            </button>

            <button
              onClick={() => setShowUpdateModal(true)}
              disabled={isJobRunning || checking}
              className="flex items-center gap-2 h-10 px-5 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-xs sm:text-sm font-bold text-white shadow-lg shadow-[#7C3AED]/25 border border-[#8B5CF6]/50 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Создать backup и обновить</span>
            </button>
          </div>
        </div>

        {/* Update Notification Banner if updates exist */}
        {updateAvailable && !isJobRunning && (
          <div className="p-4 sm:p-5 rounded-2xl bg-[#151932] border border-[#8B5CF6]/40 space-y-3 animate-in fade-in duration-300">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
                <h4 className="text-sm font-bold text-[#F8FAFC]">
                  Доступна новая версия Dodik Tracker!
                </h4>
              </div>
              {checkResult?.commitsBehind ? (
                <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs font-mono font-bold text-amber-300">
                  {checkResult.commitsBehind} новых коммитов
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-black/40 border border-[#1E2442]">
                <span className="text-[#64748B] block mb-1">Текущий коммит:</span>
                <span className="text-[#F8FAFC] font-bold">{currentCommitShort}</span>
              </div>
              <div className="p-3 rounded-xl bg-black/40 border border-[#1E2442]">
                <span className="text-[#64748B] block mb-1">Новый коммит:</span>
                <span className="text-emerald-400 font-bold">{remoteCommitShort || 'origin/main'}</span>
              </div>
            </div>

            {checkResult?.commitMessages && checkResult.commitMessages.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-xs font-semibold text-[#94A3B8]">История последних изменений:</span>
                <ul className="space-y-1 text-xs font-mono text-[#CBD5E1] bg-black/40 p-3 rounded-xl border border-[#1E2442] max-h-32 overflow-y-auto">
                  {checkResult.commitMessages.map((msg, idx) => (
                    <li key={idx} className="truncate flex items-center gap-2">
                      <span className="text-[#8B5CF6]">•</span>
                      <span>{msg}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Real-time Update Execution / Job Status Box */}
        {isJobRunning && (
          <div className="p-5 rounded-2xl bg-[#11152A] border border-[#8B5CF6]/60 space-y-4 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <Loader2 className="w-5 h-5 text-[#A78BFA] animate-spin" />
                <h4 className="text-sm font-bold text-white">
                  Выполняется автоматическое обновление системы
                </h4>
              </div>
              <span className="text-xs font-mono font-bold px-3 py-1 rounded-xl bg-purple-500/20 text-[#A78BFA] border border-purple-500/30">
                {job?.progress || 10}% выполнено
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2.5 rounded-full bg-black/60 overflow-hidden border border-[#1E2442]">
              <div
                className="h-full bg-gradient-to-r from-[#7C3AED] via-[#6366F1] to-emerald-400 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, Math.max(5, job?.progress || 10))}%` }}
              />
            </div>

            {/* Stage Stepper */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-2">
              {STAGES_LIST.map((stage, idx) => {
                const isPassed = currentStageIndex > idx;
                const isCurrent = currentStageIndex === idx;
                return (
                  <div
                    key={stage.id}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      isPassed
                        ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                        : isCurrent
                        ? 'bg-purple-950/40 border-[#8B5CF6] text-white shadow-lg shadow-purple-950/50'
                        : 'bg-black/30 border-[#1E2442] text-[#64748B]'
                    }`}
                  >
                    <div className="flex items-center justify-center mb-1">
                      {isPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : isCurrent ? (
                        <Loader2 className="w-4 h-4 text-[#A78BFA] animate-spin" />
                      ) : (
                        <span className="text-xs font-mono text-[#64748B]">{idx + 1}</span>
                      )}
                    </div>
                    <div className="text-[11px] font-bold truncate">{stage.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Live Terminal Output */}
            <div className="rounded-xl bg-black/80 border border-[#1E2442] p-3.5 space-y-1.5 font-mono text-xs text-[#94A3B8] max-h-48 overflow-y-auto">
              <div className="text-[11px] text-[#64748B] flex items-center justify-between pb-1 border-b border-[#1E2442]/60">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  <span>Журнал выполнения (live output)</span>
                </span>
                <span className="text-emerald-400 animate-pulse">● active</span>
              </div>
              {job?.logSummary && job.logSummary.length > 0 ? (
                job.logSummary.map((logLine, idx) => (
                  <div key={idx} className="leading-relaxed text-[#CBD5E1] break-all">
                    {logLine}
                  </div>
                ))
              ) : (
                <div className="text-[#64748B]">Ожидание первых данных от скрипта...</div>
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        )}

        {/* Success View */}
        {isJobSuccess && !isJobRunning && (
          <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-500/50 space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">Обновление успешно завершено!</h4>
                  <p className="text-xs text-emerald-300/80">
                    Система развернута, миграции выполнены, PM2 перезапущен, эндпоинт здоровья подтверждён.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Проверить сайт</span>
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono pt-1">
              <div className="p-3 rounded-xl bg-black/40 border border-emerald-500/30">
                <span className="text-[#94A3B8] block mb-1">Итоговый коммит:</span>
                <span className="text-white font-bold">{currentCommitShort}</span>
              </div>
              <div className="p-3 rounded-xl bg-black/40 border border-emerald-500/30">
                <span className="text-[#94A3B8] block mb-1">Время завершения:</span>
                <span className="text-white font-bold">{formatDateTime(job?.endTime)}</span>
              </div>
              <div className="p-3 rounded-xl bg-black/40 border border-emerald-500/30">
                <span className="text-[#94A3B8] block mb-1">Статус сервиса:</span>
                <span className="text-emerald-400 font-bold">ONLINE (HTTP 200 UP)</span>
              </div>
            </div>
          </div>
        )}

        {/* Failure View */}
        {isJobFailed && !isJobRunning && (
          <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-500/50 space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">Обновление не завершено</h4>
                  <p className="text-xs text-rose-300/80">
                    {job?.stage === 'backup'
                      ? 'Ошибка произошла на этапе создания резервной копии базы данных. Обновление остановлено.'
                      : ['git_pull', 'install', 'migration', 'build', 'restart', 'healthcheck'].includes(job?.stage || '')
                      ? `На этапе '${STAGES_LIST.find((s) => s.id === job?.stage)?.label || job?.stage}' произошла ошибка. База данных предварительно сохранена в бэкапе.`
                      : `На этапе '${STAGES_LIST.find((s) => s.id === job?.stage)?.label || job?.stage}' произошла ошибка. База данных не изменялась.`}
                  </p>
                </div>
              </div>

              <button
                onClick={handleCheckUpdates}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Попробовать снова</span>
              </button>
            </div>

            {job?.error && (
              <div className="p-3 rounded-xl bg-black/60 border border-rose-500/30 font-mono text-xs text-rose-200 break-all">
                <span className="text-rose-400 font-bold block mb-1">Причина ошибки:</span>
                {job.error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Section: Database Backups Management */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-center text-emerald-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#F8FAFC]">
                Резервные копии базы данных (PostgreSQL)
              </h3>
              <p className="text-xs text-[#94A3B8]">
                Автоматические и ручные SQL-дампы. Политика хранения: сохраняются последние {retentionCount} копий
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleCreateBackup}
              disabled={creatingBackup || isJobRunning}
              className="flex items-center gap-2 h-10 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-xs sm:text-sm font-bold text-white shadow-lg shadow-emerald-950/40 border border-emerald-500/50 transition-all disabled:opacity-50 cursor-pointer"
            >
              {creatingBackup ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Database className="w-4 h-4" />
              )}
              <span>{creatingBackup ? 'Создание дампа...' : 'Создать резервную копию'}</span>
            </button>
          </div>
        </div>

        {/* Backups Table */}
        <div className="overflow-x-auto rounded-2xl border border-[#1E2442] bg-[#11152A]">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#0B0D20] border-b border-[#1E2442] text-[#94A3B8] font-mono uppercase text-[11px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Дата создания</th>
                <th className="py-3 px-4">Имя файла</th>
                <th className="py-3 px-4">Размер</th>
                <th className="py-3 px-4">Коммит</th>
                <th className="py-3 px-4 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2442] text-[#CBD5E1]">
              {backups.length > 0 ? (
                backups.map((b) => (
                  <tr key={b.filename} className="hover:bg-[#151932] transition-colors">
                    <td className="py-3 px-4 font-mono whitespace-nowrap text-[#F8FAFC]">
                      {formatDateTime(b.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-[#A78BFA] truncate max-w-xs sm:max-w-sm">
                      {b.filename}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-lg bg-black/40 border border-[#1E2442] font-semibold text-white">
                        {b.sizeHuman}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-[#64748B] whitespace-nowrap">
                      {b.gitCommit && b.gitCommit !== '—' ? (
                        <span className="text-sky-300 font-bold">{b.gitCommit}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Download button */}
                        <button
                          onClick={() => handleDownloadBackup(b.filename)}
                          disabled={downloadingFile === b.filename}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B0D20] hover:bg-[#1E2442] text-xs font-semibold text-sky-300 border border-[#1E2442] transition-colors disabled:opacity-50 cursor-pointer"
                          title="Скачать дамп"
                        >
                          {downloadingFile === b.filename ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">Скачать</span>
                        </button>

                        {/* Delete button */}
                        <button
                          onClick={() => setBackupToDelete(b.filename)}
                          disabled={backups.length <= 1}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B0D20] hover:bg-rose-950/50 text-xs font-semibold text-rose-400 border border-[#1E2442] hover:border-rose-800/50 transition-colors disabled:opacity-30 cursor-pointer"
                          title={
                            backups.length <= 1
                              ? 'Запрещено удалять единственный существующий бэкап'
                              : 'Удалить дамп'
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Удалить</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-[#64748B]">
                    Резервные копии еще не создавались. Нажмите «Создать резервную копию» выше.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal: Start Update */}
      <ConfirmModal
        isOpen={showUpdateModal}
        title="Подтверждение обновления Dodik Tracker"
        message="Перед началом обновления система автоматически создаст резервный backup базы данных PostgreSQL в папку backups/. Затем будут загружены изменения из Git, применены миграции, пересобран проект и перезапущен процесс PM2. Продолжить?"
        confirmText="Создать backup и обновить"
        cancelText="Отмена"
        variant="primary"
        loading={updating}
        onConfirm={handleStartUpdate}
        onCancel={() => setShowUpdateModal(false)}
      />

      {/* Confirmation Modal: Delete Backup */}
      <ConfirmModal
        isOpen={!!backupToDelete}
        title="Удаление резервной копии"
        message={`Вы уверены, что хотите удалить файл резервной копии ${backupToDelete}? Это действие необратимо.`}
        confirmText="Удалить навсегда"
        cancelText="Отмена"
        variant="danger"
        onConfirm={handleDeleteBackup}
        onCancel={() => setBackupToDelete(null)}
      />
    </div>
  );
}
