import React, { useState, useEffect } from 'react';
import {
  Users,
  Film,
  MessageSquare,
  AlertTriangle,
  Server,
  Activity,
  ShieldCheck,
  Radio,
  Layers,
  ListOrdered,
  Sparkles,
  ArrowUpRight,
  Clock,
  RotateCw,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Newspaper,
  Bell,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

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
        throw new Error('Ошибка загрузки данных дашборда');
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
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <RotateCw className="w-8 h-8 text-[#9B6BFF] animate-spin" />
        <p className="text-sm text-[#9A94AA]">Загрузка сводки платформы...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error || 'Не удалось загрузить данные'}</span>
        </div>
        <button
          onClick={fetchDashboard}
          className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs font-semibold text-white transition-colors"
        >
          Повторить
        </button>
      </div>
    );
  }

  const { users, content, engagement, moderation, system, trends, recentAudit } = data;

  return (
    <div className="space-y-6">
      {/* Top Banner Alert if Pending Reports or Maintenance Mode */}
      {moderation.pending > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#F3F1F8]">
                В очереди модерации {moderation.pending} {moderation.pending === 1 ? 'жалоба' : 'жалоб'}
              </h4>
              <p className="text-xs text-[#9A94AA]">Пользователи сообщили о контенте, требующем проверки администраторами</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('moderation')}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            Рассмотреть
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {system.maintenanceMode && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-rose-300">Режим технического обслуживания включён</h4>
              <p className="text-xs text-[#9A94AA]">Публичный доступ ограничен предупреждающим экраном</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('settings')}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs font-semibold text-rose-200 transition-colors"
          >
            Настройки
          </button>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] hover:border-[#3A344E] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9A94AA] uppercase tracking-wider">Пользователи</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#F3F1F8]">{users.total}</span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-0.5">
              +{users.new7d} за 7д
            </span>
          </div>
          <div className="mt-2 text-xs text-[#9A94AA] flex items-center justify-between border-t border-[#252233]/60 pt-2">
            <span>Активных (30д): {users.active30d}</span>
            {users.blocked > 0 && <span className="text-red-400 font-medium">Заблокир: {users.blocked}</span>}
          </div>
        </div>

        {/* Content Catalog */}
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] hover:border-[#3A344E] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9A94AA] uppercase tracking-wider">Медиа-каталог</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-[#AC82FF] flex items-center justify-center">
              <Film className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#F3F1F8]">{content.total}</span>
            <span className="text-xs text-[#9A94AA]">произведений</span>
          </div>
          <div className="mt-2 text-xs text-[#9A94AA] flex items-center justify-between border-t border-[#252233]/60 pt-2">
            <span>В трекере: {engagement.userMedia}</span>
            {content.hidden > 0 && <span className="text-amber-400">Скрыто: {content.hidden}</span>}
          </div>
        </div>

        {/* Community Engagement */}
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] hover:border-[#3A344E] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9A94AA] uppercase tracking-wider">Активность</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#F3F1F8]">{engagement.reviews}</span>
            <span className="text-xs text-[#9A94AA]">отзывов</span>
          </div>
          <div className="mt-2 text-xs text-[#9A94AA] flex items-center justify-between border-t border-[#252233]/60 pt-2">
            <span>Списков: {engagement.lists}</span>
            <span>Tier Lists: {engagement.tierLists}</span>
          </div>
        </div>

        {/* Moderation & System */}
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] hover:border-[#3A344E] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9A94AA] uppercase tracking-wider">Модерация</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              moderation.pending > 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
            }`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#F3F1F8]">{moderation.pending}</span>
            <span className="text-xs text-[#9A94AA]">ожидают решения</span>
          </div>
          <div className="mt-2 text-xs text-[#9A94AA] flex items-center justify-between border-t border-[#252233]/60 pt-2">
            <span>Всего жалоб: {moderation.total}</span>
            <span className="text-emerald-400">Закрыто: {moderation.resolved}</span>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => onNavigateTab('moderation')}
          className="p-3.5 rounded-xl bg-[#191724] hover:bg-[#211E30] border border-[#2B273F] text-left transition-colors flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#F3F1F8] group-hover:text-amber-300 transition-colors truncate">
              Модерация
            </div>
            <div className="text-[10px] text-[#9A94AA] truncate">{moderation.pending} в очереди</div>
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('news')}
          className="p-3.5 rounded-xl bg-[#191724] hover:bg-[#211E30] border border-[#2B273F] text-left transition-colors flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
            <Newspaper className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#F3F1F8] group-hover:text-indigo-300 transition-colors truncate">
              Новости
            </div>
            <div className="text-[10px] text-[#9A94AA] truncate">CMS публикации</div>
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('announcements')}
          className="p-3.5 rounded-xl bg-[#191724] hover:bg-[#211E30] border border-[#2B273F] text-left transition-colors flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-[#AC82FF] flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#F3F1F8] group-hover:text-[#AC82FF] transition-colors truncate">
              Объявления
            </div>
            <div className="text-[10px] text-[#9A94AA] truncate">Баннеры платформы</div>
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('notifications')}
          className="p-3.5 rounded-xl bg-[#191724] hover:bg-[#211E30] border border-[#2B273F] text-left transition-colors flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#F3F1F8] group-hover:text-emerald-300 transition-colors truncate">
              Уведомления
            </div>
            <div className="text-[10px] text-[#9A94AA] truncate">Рассылка сообщений</div>
          </div>
        </button>
      </div>

      {/* Two Column Grid: Activity Trends & System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: 14-Day Activity Trends */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#F3F1F8]">Динамика платформы (14 дней)</h3>
              <p className="text-xs text-[#9A94AA]">Регистрации и добавление медиа в библиотеку</p>
            </div>
            <button
              onClick={() => onNavigateTab('analytics')}
              className="text-xs text-[#AC82FF] hover:underline flex items-center gap-1 font-semibold"
            >
              Подробная аналитика
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          {/* Simple Bars visualization */}
          <div className="space-y-3 pt-2">
            <div>
              <div className="flex items-center justify-between text-xs text-[#9A94AA] mb-1.5">
                <span className="font-semibold text-indigo-300">Новые пользователи</span>
                <span>{trends.registrations?.reduce((acc: number, r: any) => acc + (r.count || 0), 0) || 0} за 14 дн.</span>
              </div>
              <div className="h-14 flex items-end gap-1.5 bg-[#0F0E12] p-2 rounded-xl border border-[#252233]/60">
                {(trends.registrations || []).length === 0 ? (
                  <div className="w-full text-center text-xs text-[#656075] py-2">Нет данных за период</div>
                ) : (
                  trends.registrations.map((item: any, idx: number) => {
                    const maxVal = Math.max(...trends.registrations.map((t: any) => t.count), 1);
                    const heightPercent = Math.max(10, Math.round((item.count / maxVal) * 100));
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-indigo-500/80 group-hover:bg-indigo-400 rounded-sm transition-all"
                        />
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 bg-zinc-900 border border-zinc-700 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap pointer-events-none z-10">
                          {item.day}: {item.count}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-[#9A94AA] mb-1.5">
                <span className="font-semibold text-purple-300">Добавления в библиотеки</span>
                <span>{trends.userMedia?.reduce((acc: number, r: any) => acc + (r.count || 0), 0) || 0} за 14 дн.</span>
              </div>
              <div className="h-14 flex items-end gap-1.5 bg-[#0F0E12] p-2 rounded-xl border border-[#252233]/60">
                {(trends.userMedia || []).length === 0 ? (
                  <div className="w-full text-center text-xs text-[#656075] py-2">Нет данных за период</div>
                ) : (
                  trends.userMedia.map((item: any, idx: number) => {
                    const maxVal = Math.max(...trends.userMedia.map((t: any) => t.count), 1);
                    const heightPercent = Math.max(10, Math.round((item.count / maxVal) * 100));
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-purple-500/80 group-hover:bg-purple-400 rounded-sm transition-all"
                        />
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 bg-zinc-900 border border-zinc-700 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap pointer-events-none z-10">
                          {item.day}: {item.count}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Media Categories Distribution */}
          <div className="pt-2 border-t border-[#252233]/60">
            <h4 className="text-xs font-semibold text-[#9A94AA] mb-2 uppercase tracking-wider">
              Распределение медиа по типам
            </h4>
            <div className="flex flex-wrap gap-2">
              {(content.byCategory || []).map((cat: any) => (
                <div
                  key={cat.type}
                  className="px-2.5 py-1 rounded-lg bg-[#191724] border border-[#252233] text-xs flex items-center gap-1.5"
                >
                  <span className="text-[#9A94AA]">{cat.type}:</span>
                  <span className="font-bold text-[#F3F1F8]">{cat.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: System & Infrastructure Status */}
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#252233]">
              <h3 className="text-sm font-bold text-[#F3F1F8]">Статус системы</h3>
              <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                ONLINE
              </div>
            </div>

            <div className="divide-y divide-[#252233]/60 mt-2">
              <div className="py-2.5 flex items-center justify-between text-xs">
                <span className="text-[#9A94AA]">Режим регистрации:</span>
                <span className="font-semibold text-purple-300 px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30">
                  {system.registrationMode}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between text-xs">
                <span className="text-[#9A94AA]">Внешние интеграции:</span>
                <span className="font-semibold text-[#F3F1F8] flex items-center gap-1">
                  {system.integrations.enabled} активных
                  {system.integrations.hasErrors > 0 && (
                    <span className="text-amber-400">({system.integrations.hasErrors} с ошибками)</span>
                  )}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between text-xs">
                <span className="text-[#9A94AA]">Команда платформы (Staff):</span>
                <span className="font-semibold text-[#F3F1F8]">{users.staff} чел.</span>
              </div>

              <div className="py-2.5 flex items-center justify-between text-xs">
                <span className="text-[#9A94AA]">Личные сообщения:</span>
                <span className="font-semibold text-[#F3F1F8]">{engagement.messages}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#252233]">
            <button
              onClick={() => onNavigateTab('integrations')}
              className="w-full py-2 px-3 rounded-xl bg-[#191724] hover:bg-[#211E30] text-xs font-semibold text-white border border-[#2B273F] transition-colors flex items-center justify-center gap-2"
            >
              <Server className="w-3.5 h-3.5 text-[#AC82FF]" />
              Проверить ключи и API
            </button>
          </div>
        </div>
      </div>

      {/* Recent Audit Log Ticker */}
      <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#AC82FF]" />
            <h3 className="text-sm font-bold text-[#F3F1F8]">Последние действия администраторов</h3>
          </div>
          <button
            onClick={() => onNavigateTab('logs')}
            className="text-xs text-[#AC82FF] hover:underline font-semibold"
          >
            Все записи журнала
          </button>
        </div>

        <div className="space-y-2">
          {recentAudit.length === 0 ? (
            <p className="text-xs text-[#656075] py-2">Журнал аудита пока пуст</p>
          ) : (
            recentAudit.map((log: any) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F0E12] border border-[#252233]/60 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px] font-bold shrink-0">
                    {log.action}
                  </span>
                  <span className="text-[#F3F1F8] font-semibold shrink-0">
                    @{log.adminUsername || 'admin'}:
                  </span>
                  <span className="text-[#9A94AA] truncate">{log.details}</span>
                </div>
                <span className="text-[11px] text-[#656075] whitespace-nowrap ml-3 shrink-0">
                  {new Date(log.createdAt).toLocaleString('ru-RU')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
