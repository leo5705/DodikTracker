import React, { useState, useEffect } from 'react';
import {
  Users,
  Activity,
  TrendingUp,
  Film,
  MessageSquare,
  ShieldAlert,
  Server,
  AlertTriangle,
  RotateCw,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  Radio,
  Newspaper,
  Bell,
  Ticket,
  Key,
  Settings,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatAuditLog } from '../../utils/auditFormatter.ts';

interface AdminDashboardTabProps {
  onNavigateTab: (tab: string) => void;
}

export const AdminDashboardTab: React.FC<AdminDashboardTabProps> = ({ onNavigateTab }) => {
  const { authFetch } = useAuth();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/dashboard');
      if (!res.ok) {
        throw new Error('Ошибка загрузки данных контрольного центра');
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить данные дашборда');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 space-y-3">
        <RotateCw className="w-8 h-8 text-[#8B5CF6] animate-spin" />
        <p className="text-sm text-[#94A3B8] font-mono">Загрузка оперативной сводки платформы...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{error || 'Не удалось получить данные телеметрии'}</span>
        </div>
        <button
          onClick={fetchDashboard}
          className="h-10 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-white font-bold transition-colors cursor-pointer"
        >
          Повторить
        </button>
      </div>
    );
  }

  const {
    users,
    content: contentStats,
    engagement,
    moderation,
    system,
    trends,
    recentAudit,
    additionalStats,
  } = data;

  const activePercent = Math.min(
    100,
    Math.round(((users.active30d || 0) / Math.max(1, users.total || 1)) * 100)
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-200 w-full">
      {/* Critical Alert Bar (if reports pending or maintenance mode) */}
      {moderation.pending > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-white">В очереди модерации: {moderation.pending}</span>
              <span className="text-[#94A3B8] ml-2 hidden sm:inline">
                Требуется проверка жалоб пользователей на контент
              </span>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('moderation')}
            className="h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md"
          >
            Рассмотреть
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {system.maintenanceMode && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-500/25 text-rose-300 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-rose-200">Режим технического обслуживания активен</span>
              <span className="text-rose-300/80 ml-2 hidden sm:inline">
                Публичный доступ ограничен предупреждающим экраном
              </span>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('settings')}
            className="h-9 px-3.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold text-xs transition-colors shrink-0 cursor-pointer"
          >
            Настройки
          </button>
        </div>
      )}

      {/* 7 COMPACT KPI WIDGETS (SCALED UP ~10-15%) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3.5">
        {/* 1. Users */}
        <div
          onClick={() => onNavigateTab('users')}
          className="p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 hover:bg-[#11152A] transition-all cursor-pointer shadow-md group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider font-mono">Пользователи</span>
            <Users className="w-5 h-5 text-indigo-400 group-hover:text-indigo-300" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono">{users.total}</div>
          <div className="mt-1.5 text-xs text-[#94A3B8] font-mono flex items-center justify-between">
            <span>Админ: {users.staff}</span>
            {users.blocked > 0 && <span className="text-rose-400 font-bold">Бан: {users.blocked}</span>}
          </div>
        </div>

        {/* 2. Active users */}
        <div
          onClick={() => onNavigateTab('users')}
          className="p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 hover:bg-[#11152A] transition-all cursor-pointer shadow-md group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider font-mono">Активные</span>
            <Activity className="w-5 h-5 text-emerald-400 group-hover:text-emerald-300" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono">{users.active30d}</div>
          <div className="mt-1.5 text-xs text-emerald-400 font-mono flex items-center gap-1 font-semibold">
            <span>30д активность: {activePercent}%</span>
          </div>
        </div>

        {/* 3. New users */}
        <div
          onClick={() => onNavigateTab('users')}
          className="p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 hover:bg-[#11152A] transition-all cursor-pointer shadow-md group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider font-mono">Новые</span>
            <TrendingUp className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-cyan-300 font-mono">+{users.new7d}</div>
          <div className="mt-1.5 text-xs text-[#94A3B8] font-mono">+{users.new30d} за 30д</div>
        </div>

        {/* 4. Content */}
        <div
          onClick={() => onNavigateTab('content')}
          className="p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 hover:bg-[#11152A] transition-all cursor-pointer shadow-md group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider font-mono">Контент</span>
            <Film className="w-5 h-5 text-amber-400 group-hover:text-amber-300" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono">{contentStats.total}</div>
          <div className="mt-1.5 text-xs text-[#94A3B8] font-mono flex items-center justify-between">
            <span>В базах: {engagement.userMedia}</span>
            {contentStats.hidden > 0 && <span className="text-amber-400 font-bold">Скрыто: {contentStats.hidden}</span>}
          </div>
        </div>

        {/* 5. Reviews */}
        <div
          onClick={() => onNavigateTab('content')}
          className="p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 hover:bg-[#11152A] transition-all cursor-pointer shadow-md group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider font-mono">Рецензии</span>
            <MessageSquare className="w-5 h-5 text-[#A78BFA] group-hover:text-purple-300" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono">{engagement.reviews}</div>
          <div className="mt-1.5 text-xs text-[#94A3B8] font-mono">
            {engagement.lists} списков • {engagement.tierLists} тирлистов
          </div>
        </div>

        {/* 6. Reports */}
        <div
          onClick={() => onNavigateTab('moderation')}
          className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer shadow-md group flex flex-col justify-between ${
            moderation.pending > 0
              ? 'bg-[#181014] border-amber-500/40 hover:border-amber-400'
              : 'bg-[#0B0D20] border-[#1E2442] hover:border-[#8B5CF6]/50 hover:bg-[#11152A]'
          }`}
        >
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider font-mono">Жалобы</span>
            <ShieldAlert
              className={`w-5 h-5 ${
                moderation.pending > 0 ? 'text-amber-400 animate-pulse' : 'text-blue-400'
              }`}
            />
          </div>
          <div
            className={`text-2xl sm:text-3xl font-black font-mono ${
              moderation.pending > 0 ? 'text-amber-300' : 'text-white'
            }`}
          >
            {moderation.pending}
          </div>
          <div className="mt-1.5 text-xs text-[#94A3B8] font-mono flex items-center justify-between">
            <span>Всего: {moderation.total}</span>
            <span className="text-emerald-400 font-bold">Закрыто: {moderation.resolved}</span>
          </div>
        </div>

        {/* 7. API status */}
        <div
          onClick={() => onNavigateTab('integrations')}
          className="p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 hover:bg-[#11152A] transition-all cursor-pointer shadow-md group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider font-mono">Статус API</span>
            <Server
              className={`w-5 h-5 ${
                system.integrations.hasErrors > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-base sm:text-lg font-black text-white font-mono">В СЕТИ</span>
          </div>
          <div className="mt-1.5 text-xs font-mono truncate">
            {system.integrations.hasErrors > 0 ? (
              <span className="text-rose-400 font-bold">{system.integrations.hasErrors} ошибок API</span>
            ) : (
              <span className="text-emerald-400 font-semibold">{system.integrations.enabled} интеграций OK</span>
            )}
          </div>
        </div>
      </div>

      {/* QUICK COMMAND ACTION ROW (LARGER BUTTONS) */}
      <div className="flex items-center gap-2.5 overflow-x-auto custom-scrollbar py-1">
        <button
          onClick={() => onNavigateTab('moderation')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B0D20] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 text-xs sm:text-sm font-bold text-white transition-all shrink-0 cursor-pointer shadow-sm"
        >
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span>Модерация</span>
          {moderation.pending > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-mono font-bold">
              {moderation.pending}
            </span>
          )}
        </button>

        <button
          onClick={() => onNavigateTab('news')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B0D20] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 text-xs sm:text-sm font-bold text-white transition-all shrink-0 cursor-pointer shadow-sm"
        >
          <Newspaper className="w-4 h-4 text-indigo-400" />
          <span>Новости</span>
          <span className="text-xs text-[#94A3B8] font-mono">
            ({additionalStats?.news?.published || 0})
          </span>
        </button>

        <button
          onClick={() => onNavigateTab('announcements')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B0D20] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 text-xs sm:text-sm font-bold text-white transition-all shrink-0 cursor-pointer shadow-sm"
        >
          <Radio className="w-4 h-4 text-purple-400" />
          <span>Объявления</span>
          {additionalStats?.announcements?.active > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-mono font-bold">
              {additionalStats.announcements.active}
            </span>
          )}
        </button>

        <button
          onClick={() => onNavigateTab('invites')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B0D20] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 text-xs sm:text-sm font-bold text-white transition-all shrink-0 cursor-pointer shadow-sm"
        >
          <Ticket className="w-4 h-4 text-pink-400" />
          <span>Инвайты</span>
          <span className="text-xs text-[#94A3B8] font-mono">
            ({additionalStats?.invites?.active || 0})
          </span>
        </button>

        <button
          onClick={() => onNavigateTab('integrations')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B0D20] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 text-xs sm:text-sm font-bold text-white transition-all shrink-0 cursor-pointer shadow-sm"
        >
          <Key className="w-4 h-4 text-sky-400" />
          <span>Интеграции</span>
        </button>

        <button
          onClick={() => onNavigateTab('settings')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B0D20] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 text-xs sm:text-sm font-bold text-white transition-all shrink-0 cursor-pointer shadow-sm"
        >
          <Settings className="w-4 h-4 text-[#94A3B8]" />
          <span>Настройки</span>
        </button>
      </div>

      {/* TWO-COLUMN TELEMETRY & ACTIVITY DECK */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: 14-day dynamics */}
        <div className="lg:col-span-2 p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <TrendingUp className="w-5 h-5 text-[#8B5CF6]" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Динамика платформы (14 дней)
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('analytics')}
              className="text-xs text-[#A78BFA] hover:text-white font-mono flex items-center gap-1.5 font-semibold cursor-pointer"
            >
              Подробная аналитика
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Registrations Micro-Chart */}
            <div className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442]">
              <div className="flex items-center justify-between text-xs font-mono text-[#94A3B8] mb-2.5">
                <span className="text-indigo-300 font-bold">Новые регистрации</span>
                <span className="text-white font-bold">
                  {trends.registrations?.reduce(
                    (acc: number, r: any) => acc + (Number(r.count) || 0),
                    0
                  ) || 0}{' '}
                  пользователей
                </span>
              </div>
              <div className="h-14 flex items-end gap-1.5 bg-[#080A18] p-2 rounded-xl border border-[#1E2442]/60">
                {(trends.registrations || []).length === 0 ? (
                  <div className="w-full text-center text-xs text-[#64748B] py-3">
                    Нет данных
                  </div>
                ) : (
                  trends.registrations.map((item: any, idx: number) => {
                    const maxVal = Math.max(
                      ...trends.registrations.map((t: any) => t.count),
                      1
                    );
                    const heightPercent = Math.max(14, Math.round((item.count / maxVal) * 100));
                    return (
                      <div
                        key={idx}
                        className="flex-1 flex flex-col items-center justify-end h-full group relative"
                      >
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-indigo-500 hover:bg-indigo-400 rounded-sm transition-all"
                        />
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 bg-[#151932] border border-[#1E2442] text-white text-[10px] font-mono px-2 py-0.5 rounded shadow whitespace-nowrap pointer-events-none z-10 font-bold">
                          {item.day}: {item.count}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Media additions Micro-Chart */}
            <div className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442]">
              <div className="flex items-center justify-between text-xs font-mono text-[#94A3B8] mb-2.5">
                <span className="text-purple-300 font-bold">Добавления в библиотеки</span>
                <span className="text-white font-bold">
                  {trends.userMedia?.reduce(
                    (acc: number, r: any) => acc + (Number(r.count) || 0),
                    0
                  ) || 0}{' '}
                  медиа
                </span>
              </div>
              <div className="h-14 flex items-end gap-1.5 bg-[#080A18] p-2 rounded-xl border border-[#1E2442]/60">
                {(trends.userMedia || []).length === 0 ? (
                  <div className="w-full text-center text-xs text-[#64748B] py-3">
                    Нет данных
                  </div>
                ) : (
                  trends.userMedia.map((item: any, idx: number) => {
                    const maxVal = Math.max(
                      ...trends.userMedia.map((t: any) => t.count),
                      1
                    );
                    const heightPercent = Math.max(14, Math.round((item.count / maxVal) * 100));
                    return (
                      <div
                        key={idx}
                        className="flex-1 flex flex-col items-center justify-end h-full group relative"
                      >
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-[#8B5CF6] hover:bg-purple-400 rounded-sm transition-all"
                        />
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 bg-[#151932] border border-[#1E2442] text-white text-[10px] font-mono px-2 py-0.5 rounded shadow whitespace-nowrap pointer-events-none z-10 font-bold">
                          {item.day}: {item.count}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Media Categories chips */}
          <div className="pt-3 border-t border-[#1E2442] flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-mono uppercase text-[#64748B] font-bold">Категории:</span>
            <div className="flex flex-wrap gap-2">
              {(contentStats.byCategory || []).map((cat: any) => (
                <span
                  key={cat.type}
                  className="px-2.5 py-1 rounded-lg bg-[#11152A] border border-[#1E2442] text-xs font-mono text-[#CBD5E1]"
                >
                  <strong className="text-white">{cat.type}:</strong> {cat.count}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: System Status */}
        <div className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2442]">
              <span className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                Инфраструктура
              </span>
              <span className="text-xs font-mono text-emerald-400 font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                ACTIVE
              </span>
            </div>

            <div className="divide-y divide-[#1E2442] text-sm mt-1">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#94A3B8]">Режим регистрации:</span>
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-[#151932] text-purple-300 border border-[#8B5CF6]/30">
                  {system.registrationMode}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#94A3B8]">Интеграции API:</span>
                <span className="font-mono text-xs font-bold text-white">
                  {system.integrations.enabled} / {system.integrations.total}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#94A3B8]">Команда Staff:</span>
                <span className="font-mono text-xs font-bold text-white">{users.staff} чел.</span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#94A3B8]">Личные сообщения:</span>
                <span className="font-mono text-xs font-bold text-white">{engagement.messages}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('integrations')}
            className="w-full h-11 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 text-sm font-bold text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <Key className="w-4 h-4 text-[#8B5CF6]" />
            <span>Управление ключами API</span>
          </button>
        </div>
      </div>

      {/* AUDIT LOG TICKER */}
      <div className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-[#1E2442]">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-[#8B5CF6]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Оперативный журнал событий (Audit Stream)
            </h3>
          </div>
          <button
            onClick={() => onNavigateTab('audit')}
            className="text-xs sm:text-sm text-[#A78BFA] hover:text-white font-mono flex items-center gap-1.5 font-semibold cursor-pointer"
          >
            Полный журнал
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {recentAudit.length === 0 ? (
            <p className="text-sm text-[#64748B] py-4 text-center font-mono">
              Журнал событий пока пуст
            </p>
          ) : (
            recentAudit.slice(0, 6).map((log: any) => {
              const item = formatAuditLog(log);
              return (
                <div
                  key={log.id}
                  onClick={() => onNavigateTab('audit')}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs sm:text-sm hover:border-[#8B5CF6]/40 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] sm:text-xs font-bold shrink-0 border ${item.badgeClass}`}>
                      {item.category}
                    </span>
                    <span className="text-white font-bold font-mono text-xs sm:text-sm shrink-0">
                      {item.isSystem ? 'Система' : item.actorName}:
                    </span>
                    <span className="text-[#94A3B8] text-xs sm:text-sm truncate group-hover:text-white transition-colors">
                      {item.title} — {item.summary}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[#64748B] whitespace-nowrap ml-3 shrink-0">
                    {item.relativeDate}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
