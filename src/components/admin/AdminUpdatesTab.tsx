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
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-[#A78BFA]">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#F8FAFC]">Обновления и статус системы</h2>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              Мониторинг версий, миграций PostgreSQL и инструкции по релизу
            </p>
          </div>
        </div>
        <button
          onClick={fetchSystemInfo}
          disabled={loading}
          className="flex items-center gap-2 h-11 px-5 rounded-2xl bg-[#11152A] hover:bg-[#1E2442] text-xs sm:text-sm font-bold text-[#F8FAFC] border border-[#1E2442] transition-colors self-start sm:self-auto disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 text-[#8B5CF6] ${loading ? 'animate-spin' : ''}`} />
          <span>Обновить данные</span>
        </button>
      </div>

      {/* Grid of Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Version */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 shadow-lg">
          <div className="flex items-center justify-between text-xs sm:text-sm text-[#94A3B8]">
            <span className="font-semibold">Версия Dodik Tracker</span>
            <Sparkles className="w-4.5 h-4.5 text-[#8B5CF6]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#F8FAFC]">
            v{systemInfo?.appVersion || '1.0.0'}
          </div>
          <div className="text-xs text-[#64748B] font-mono">
            Окружение: <span className="text-[#A78BFA] font-bold">{systemInfo?.environment || 'development'}</span>
          </div>
        </div>

        {/* Database Migrations */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 shadow-lg">
          <div className="flex items-center justify-between text-xs sm:text-sm text-[#94A3B8]">
            <span className="font-semibold">Миграции БД</span>
            <Database className="w-4.5 h-4.5 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#F8FAFC]">
            {systemInfo?.database.appliedMigrations || 0}
            <span className="text-xs sm:text-sm text-[#64748B] font-normal ml-2 font-sans">применено</span>
          </div>
          <div className="text-xs truncate font-mono">
            {systemInfo?.database.pendingMigrations ? (
              <span className="text-amber-400 font-semibold">
                ⚠️ Ожидает: {systemInfo.database.pendingMigrations}
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Все применены
              </span>
            )}
          </div>
        </div>

        {/* Backend & DB Health */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 shadow-lg">
          <div className="flex items-center justify-between text-xs sm:text-sm text-[#94A3B8]">
            <span className="font-semibold">Состояние сервиса</span>
            <ShieldCheck className="w-4.5 h-4.5 text-sky-400" />
          </div>
          <div className="flex items-center gap-2.5">
            <span
              className={`w-3 h-3 rounded-full ${
                dbHealth === 'UP' ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className="text-base sm:text-lg font-bold font-mono text-[#F8FAFC]">
              {dbHealth === 'UP' ? 'ONLINE (UP)' : 'DEGRADED / ERROR'}
            </span>
          </div>
          <div className="text-xs text-[#64748B] font-mono">
            {healthInfo?.database?.latencyMs !== undefined
              ? `DB Latency: ${healthInfo.database.latencyMs}ms`
              : 'PostgreSQL: connected'}
          </div>
        </div>

        {/* System Uptime */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 shadow-lg">
          <div className="flex items-center justify-between text-xs sm:text-sm text-[#94A3B8]">
            <span className="font-semibold">Время работы (Uptime)</span>
            <Clock className="w-4.5 h-4.5 text-[#8B5CF6]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#F8FAFC]">
            {formatUptime(healthInfo?.uptime)}
          </div>
          <div className="text-xs text-[#64748B]">
            Порт: <span className="text-[#F8FAFC] font-mono font-bold">3000</span>
          </div>
        </div>
      </div>

      {/* Production Update Workflow Section */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-6 h-6 text-[#8B5CF6]" />
          <div>
            <h3 className="text-base font-bold text-[#F8FAFC]">
              Безопасное обновление и обслуживание (Production Update Flow)
            </h3>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              Рекомендуемые команды для обновления на VPS и работы с миграциями
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Main Update Command */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-[#A78BFA] flex items-center gap-2 font-mono">
                <span>🚀 Единая команда обновления</span>
              </div>
              <button
                onClick={() => copyToClipboard('npm run update')}
                className="p-1.5 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
                title="Копировать"
              >
                {copiedCmd === 'npm run update' ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Автоматически проверяет Git, создает бэкап PostgreSQL, устанавливает зависимости, накатывает новые миграции и пересобирает проект.
            </p>
            <div className="p-3 rounded-xl bg-black/60 font-mono text-xs sm:text-sm text-[#F8FAFC] select-all border border-[#1E2442]">
              npm run update
            </div>
          </div>

          {/* Backup & Restore Commands */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-emerald-300 flex items-center gap-2 font-mono">
                <span>💾 Бэкап и Восстановление БД</span>
              </div>
              <button
                onClick={() => copyToClipboard('npm run backup')}
                className="p-1.5 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
                title="Копировать"
              >
                {copiedCmd === 'npm run backup' ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Создает полный SQL-дамп в папку <span className="font-mono text-zinc-300">./backups/</span>.
            </p>
            <div className="p-3 rounded-xl bg-black/60 font-mono text-xs sm:text-sm text-[#F8FAFC] select-all border border-[#1E2442] flex flex-col gap-1.5">
              <div>npm run backup</div>
              <div className="text-[#64748B]"># Восстановление: npm run restore</div>
            </div>
          </div>

          {/* Migrations Flow */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-sky-300 flex items-center gap-2 font-mono">
                <span>⚡ Миграции Drizzle ORM</span>
              </div>
              <button
                onClick={() => copyToClipboard('npm run db:migrate')}
                className="p-1.5 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
                title="Копировать"
              >
                {copiedCmd === 'npm run db:migrate' ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Генерация SQL из <span className="font-mono text-zinc-300">schema.ts</span> и накат на базу данных.
            </p>
            <div className="p-3 rounded-xl bg-black/60 font-mono text-xs sm:text-sm text-[#F8FAFC] select-all border border-[#1E2442] flex flex-col gap-1.5">
              <div>npm run db:generate <span className="text-[#64748B]"># создать sql</span></div>
              <div>npm run db:migrate  <span className="text-[#64748B]"># применить</span></div>
            </div>
          </div>

          {/* Health Check Command */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-amber-300 flex items-center gap-2 font-mono">
                <span>🔍 Проверка статуса (Healthcheck)</span>
              </div>
              <button
                onClick={() => copyToClipboard('curl -s http://localhost:3000/api/health')}
                className="p-1.5 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
                title="Копировать"
              >
                {copiedCmd === 'curl -s http://localhost:3000/api/health' ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Возвращает статус сервера, соединение с БД и задержку (HTTP 200 / 503).
            </p>
            <div className="p-3 rounded-xl bg-black/60 font-mono text-xs sm:text-sm text-[#F8FAFC] select-all border border-[#1E2442]">
              curl -s http://localhost:3000/api/health
            </div>
          </div>
        </div>
      </div>

      {/* Release Notes & Manifest */}
      {systemInfo?.manifest && (
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-[#8B5CF6]" />
              <h3 className="text-base font-bold text-[#F8FAFC]">
                Информация о текущем релизе (v{systemInfo.manifest.version})
              </h3>
            </div>
            <span className="text-xs sm:text-sm font-mono text-[#94A3B8] px-3 py-1 rounded-xl bg-[#11152A] border border-[#1E2442]">
              {systemInfo.manifest.releaseDate}
            </span>
          </div>

          <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
            {systemInfo.manifest.notes}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {systemInfo.manifest.changes?.added && systemInfo.manifest.changes.added.length > 0 && (
              <div className="p-4 sm:p-5 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-2.5">
                <div className="text-xs sm:text-sm font-bold text-emerald-400 flex items-center gap-2 font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  Добавлено
                </div>
                <ul className="text-xs sm:text-sm text-[#F8FAFC] space-y-2 list-disc list-inside">
                  {systemInfo.manifest.changes.added.map((item, idx) => (
                    <li key={idx} className="text-[#94A3B8] leading-relaxed">
                      <span className="text-[#F8FAFC]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {systemInfo.manifest.changes?.changed && systemInfo.manifest.changes.changed.length > 0 && (
              <div className="p-4 sm:p-5 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-2.5">
                <div className="text-xs sm:text-sm font-bold text-sky-400 flex items-center gap-2 font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                  Изменено
                </div>
                <ul className="text-xs sm:text-sm text-[#F8FAFC] space-y-2 list-disc list-inside">
                  {systemInfo.manifest.changes.changed.map((item, idx) => (
                    <li key={idx} className="text-[#94A3B8] leading-relaxed">
                      <span className="text-[#F8FAFC]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {systemInfo.manifest.changes?.fixed && systemInfo.manifest.changes.fixed.length > 0 && (
              <div className="p-4 sm:p-5 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-2.5">
                <div className="text-xs sm:text-sm font-bold text-amber-400 flex items-center gap-2 font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  Исправлено
                </div>
                <ul className="text-xs sm:text-sm text-[#F8FAFC] space-y-2 list-disc list-inside">
                  {systemInfo.manifest.changes.fixed.map((item, idx) => (
                    <li key={idx} className="text-[#94A3B8] leading-relaxed">
                      <span className="text-[#F8FAFC]">{item}</span>
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
