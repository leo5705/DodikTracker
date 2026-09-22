import React, { useEffect, useState } from 'react';
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
  Check
} from 'lucide-react';

interface SystemInfo {
  appVersion: string;
  environment?: string;
  database: {
    appliedMigrations: number;
    pendingMigrations: number;
    latestMigration?: string | null;
  };
  manifest: {
    version: string;
    releaseDate: string;
    notes: string;
    changes?: {
      added?: string[];
      changed?: string[];
      fixed?: string[];
    };
    migrations?: string[];
  } | null;
}

interface HealthInfo {
  status: string;
  database?: {
    status: string;
    latencyMs?: number;
  };
  uptime?: number;
}

export function AdminUpdatesTab() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [healthInfo, setHealthInfo] = useState<HealthInfo | null>(null);
  const [dbHealth, setDbHealth] = useState<'LOADING' | 'UP' | 'DOWN'>('LOADING');
  const [loading, setLoading] = useState(true);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const fetchSystemInfo = async () => {
    setLoading(true);
    try {
      const [versionRes, healthRes] = await Promise.all([
        fetch('/api/system/version'),
        fetch('/api/health')
      ]);

      if (versionRes.ok) {
        setSystemInfo(await versionRes.json());
      }

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealthInfo(healthData);
        setDbHealth(healthData.status === 'UP' ? 'UP' : 'DOWN');
      } else {
        setDbHealth('DOWN');
      }
    } catch (err) {
      console.error('Failed to fetch system info:', err);
      setDbHealth('DOWN');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemInfo();
  }, []);

  const copyToClipboard = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '—';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}д ${h}ч ${m}м`;
    if (h > 0) return `${h}ч ${m}м`;
    return `${m}м`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#14131A] border border-[#252233]">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-[#AC82FF]">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#F3F1F8]">Обновления и статус системы</h2>
            <p className="text-xs text-[#9A94AA]">
              Мониторинг версий, миграций PostgreSQL и инструкции по релизу
            </p>
          </div>
        </div>
        <button
          onClick={fetchSystemInfo}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#191724] hover:bg-[#211E30] text-xs font-semibold text-[#F3F1F8] border border-[#2B273F] transition-colors self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#AC82FF] ${loading ? 'animate-spin' : ''}`} />
          <span>Обновить данные</span>
        </button>
      </div>

      {/* Grid of Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Version */}
        <div className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#9A94AA]">
            <span>Версия Dodik Tracker</span>
            <Sparkles className="w-4 h-4 text-[#AC82FF]" />
          </div>
          <div className="text-xl font-bold text-[#F3F1F8]">
            v{systemInfo?.appVersion || '1.0.0'}
          </div>
          <div className="text-[11px] text-[#9A94AA] font-mono">
            Окружение: <span className="text-purple-300 font-bold">{systemInfo?.environment || 'development'}</span>
          </div>
        </div>

        {/* Database Migrations */}
        <div className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#9A94AA]">
            <span>Миграции БД</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-[#F3F1F8]">
            {systemInfo?.database.appliedMigrations || 0}
            <span className="text-xs text-[#9A94AA] font-normal ml-1.5">применено</span>
          </div>
          <div className="text-[11px] truncate">
            {systemInfo?.database.pendingMigrations ? (
              <span className="text-amber-400 font-semibold">
                ⚠️ Ожидает: {systemInfo.database.pendingMigrations}
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Все применены
              </span>
            )}
          </div>
        </div>

        {/* Backend & DB Health */}
        <div className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#9A94AA]">
            <span>Состояние сервиса</span>
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                dbHealth === 'UP' ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className="text-base font-bold text-[#F3F1F8]">
              {dbHealth === 'UP' ? 'ONLINE (UP)' : 'DEGRADED / ERROR'}
            </span>
          </div>
          <div className="text-[11px] text-[#9A94AA]">
            {healthInfo?.database?.latencyMs !== undefined
              ? `DB Latency: ${healthInfo.database.latencyMs}ms`
              : 'PostgreSQL: connected'}
          </div>
        </div>

        {/* System Uptime */}
        <div className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#9A94AA]">
            <span>Время работы (Uptime)</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-[#F3F1F8]">
            {formatUptime(healthInfo?.uptime)}
          </div>
          <div className="text-[11px] text-[#9A94AA]">
            Порт: <span className="text-[#F3F1F8] font-mono">3000</span>
          </div>
        </div>
      </div>

      {/* Production Update Workflow Section */}
      <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-[#AC82FF]" />
          <div>
            <h3 className="text-sm font-bold text-[#F3F1F8]">
              Безопасное обновление и обслуживание (Production Update Flow)
            </h3>
            <p className="text-xs text-[#9A94AA]">
              Рекомендуемые команды для обновления на VPS и работы с миграциями
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Main Update Command */}
          <div className="p-4 rounded-xl bg-[#0F0E12] border border-[#252233] space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                <span>🚀 Единая команда обновления</span>
              </div>
              <button
                onClick={() => copyToClipboard('npm run update')}
                className="p-1 rounded bg-[#191724] hover:bg-[#252233] text-[#9A94AA] hover:text-white transition-colors"
                title="Копировать"
              >
                {copiedCmd === 'npm run update' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-[#9A94AA] leading-relaxed">
              Автоматически проверяет Git, создает бэкап PostgreSQL, устанавливает зависимости, накатывает новые миграции и пересобирает проект.
            </p>
            <div className="p-2.5 rounded-lg bg-black/60 font-mono text-xs text-[#F3F1F8] select-all border border-[#252233]/60">
              npm run update
            </div>
          </div>

          {/* Backup & Restore Commands */}
          <div className="p-4 rounded-xl bg-[#0F0E12] border border-[#252233] space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <span>💾 Бэкап и Восстановление БД</span>
              </div>
              <button
                onClick={() => copyToClipboard('npm run backup')}
                className="p-1 rounded bg-[#191724] hover:bg-[#252233] text-[#9A94AA] hover:text-white transition-colors"
                title="Копировать"
              >
                {copiedCmd === 'npm run backup' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-[#9A94AA] leading-relaxed">
              Создает полный SQL-дамп в папку <span className="font-mono text-zinc-300">./backups/</span>.
            </p>
            <div className="p-2.5 rounded-lg bg-black/60 font-mono text-xs text-[#F3F1F8] select-all border border-[#252233]/60 flex flex-col gap-1">
              <div>npm run backup</div>
              <div className="text-[#9A94AA]"># Восстановление: npm run restore</div>
            </div>
          </div>

          {/* Migrations Flow */}
          <div className="p-4 rounded-xl bg-[#0F0E12] border border-[#252233] space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                <span>⚡ Миграции Drizzle ORM</span>
              </div>
              <button
                onClick={() => copyToClipboard('npm run db:migrate')}
                className="p-1 rounded bg-[#191724] hover:bg-[#252233] text-[#9A94AA] hover:text-white transition-colors"
                title="Копировать"
              >
                {copiedCmd === 'npm run db:migrate' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-[#9A94AA] leading-relaxed">
              Генерация SQL из <span className="font-mono text-zinc-300">schema.ts</span> и накат на базу данных.
            </p>
            <div className="p-2.5 rounded-lg bg-black/60 font-mono text-xs text-[#F3F1F8] select-all border border-[#252233]/60 flex flex-col gap-1">
              <div>npm run db:generate <span className="text-[#9A94AA]"># создать sql</span></div>
              <div>npm run db:migrate  <span className="text-[#9A94AA]"># применить</span></div>
            </div>
          </div>

          {/* Health Check Command */}
          <div className="p-4 rounded-xl bg-[#0F0E12] border border-[#252233] space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <span>🔍 Проверка статуса (Healthcheck)</span>
              </div>
              <button
                onClick={() => copyToClipboard('curl -s http://localhost:3000/api/health')}
                className="p-1 rounded bg-[#191724] hover:bg-[#252233] text-[#9A94AA] hover:text-white transition-colors"
                title="Копировать"
              >
                {copiedCmd === 'curl -s http://localhost:3000/api/health' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-[#9A94AA] leading-relaxed">
              Возвращает статус сервера, соединение с БД и задержку (HTTP 200 / 503).
            </p>
            <div className="p-2.5 rounded-lg bg-black/60 font-mono text-xs text-[#F3F1F8] select-all border border-[#252233]/60">
              curl -s http://localhost:3000/api/health
            </div>
          </div>
        </div>
      </div>

      {/* Release Notes & Manifest */}
      {systemInfo?.manifest && (
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#AC82FF]" />
              <h3 className="text-sm font-bold text-[#F3F1F8]">
                Информация о текущем релизе (v{systemInfo.manifest.version})
              </h3>
            </div>
            <span className="text-xs font-mono text-[#9A94AA] px-2.5 py-1 rounded-lg bg-[#191724] border border-[#252233]">
              {systemInfo.manifest.releaseDate}
            </span>
          </div>

          <p className="text-xs text-[#9A94AA] leading-relaxed">
            {systemInfo.manifest.notes}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            {systemInfo.manifest.changes?.added && systemInfo.manifest.changes.added.length > 0 && (
              <div className="p-3.5 rounded-xl bg-[#0F0E12] border border-[#252233] space-y-2">
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Добавлено
                </div>
                <ul className="text-xs text-[#F3F1F8] space-y-1.5 list-disc list-inside">
                  {systemInfo.manifest.changes.added.map((item, idx) => (
                    <li key={idx} className="text-[#9A94AA] leading-relaxed">
                      <span className="text-[#F3F1F8]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {systemInfo.manifest.changes?.changed && systemInfo.manifest.changes.changed.length > 0 && (
              <div className="p-3.5 rounded-xl bg-[#0F0E12] border border-[#252233] space-y-2">
                <div className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  Изменено
                </div>
                <ul className="text-xs text-[#F3F1F8] space-y-1.5 list-disc list-inside">
                  {systemInfo.manifest.changes.changed.map((item, idx) => (
                    <li key={idx} className="text-[#9A94AA] leading-relaxed">
                      <span className="text-[#F3F1F8]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {systemInfo.manifest.changes?.fixed && systemInfo.manifest.changes.fixed.length > 0 && (
              <div className="p-3.5 rounded-xl bg-[#0F0E12] border border-[#252233] space-y-2">
                <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Исправлено
                </div>
                <ul className="text-xs text-[#F3F1F8] space-y-1.5 list-disc list-inside">
                  {systemInfo.manifest.changes.fixed.map((item, idx) => (
                    <li key={idx} className="text-[#9A94AA] leading-relaxed">
                      <span className="text-[#F3F1F8]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
