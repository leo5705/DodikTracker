import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  RotateCw,
  Users,
  Film,
  MessageSquare,
  Layers,
  Star,
  Activity,
  Calendar,
  BarChart2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export const AdminAnalyticsTab: React.FC = () => {
  const { authFetch } = useAuth();
  const [data, setData] = useState<any | null>(null);
  const [range, setRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/admin/analytics?range=${range}`);
      if (!res.ok) throw new Error('Ошибка загрузки аналитики');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить аналитику');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [range]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3 bg-[#0B0D20] rounded-3xl border border-[#1E2442]">
        <RotateCw className="w-8 h-8 text-[#8B5CF6] animate-spin" />
        <span className="text-sm text-[#94A3B8]">Построение аналитических срезов...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-red-400 text-sm bg-red-500/10 rounded-3xl border border-red-500/20">{error}</div>
    );
  }

  const { timeline, distributions, topLists, totals } = data;

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      {/* Header & Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-[#F8FAFC]">Глубокая аналитика платформы</h3>
          <p className="text-xs sm:text-sm text-[#94A3B8]">Динамика регистраций, добавления контента и активность сообщества</p>
        </div>

        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#11152A] border border-[#1E2442] flex-wrap">
          {[
            { id: '7d', label: '7 дней' },
            { id: '14d', label: '14 дней' },
            { id: '30d', label: '30 дней' },
            { id: '90d', label: '3 месяца' },
            { id: '365d', label: '1 год' },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`h-10 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                range === r.id
                  ? 'bg-[#8B5CF6] text-white shadow-md'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Platform Totals Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-lg">
          <span className="text-xs uppercase font-bold text-[#64748B] block mb-1">Юзеры</span>
          <span className="text-2xl sm:text-3xl font-black text-[#F8FAFC]">{totals.users}</span>
        </div>
        <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-lg">
          <span className="text-xs uppercase font-bold text-[#64748B] block mb-1">Медиа</span>
          <span className="text-2xl sm:text-3xl font-black text-[#F8FAFC]">{totals.media}</span>
        </div>
        <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-lg">
          <span className="text-xs uppercase font-bold text-[#64748B] block mb-1">Отзывы</span>
          <span className="text-2xl sm:text-3xl font-black text-emerald-400">{totals.reviews}</span>
        </div>
        <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-lg">
          <span className="text-xs uppercase font-bold text-[#64748B] block mb-1">Списки</span>
          <span className="text-2xl sm:text-3xl font-black text-indigo-400">{totals.lists}</span>
        </div>
        <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-lg">
          <span className="text-xs uppercase font-bold text-[#64748B] block mb-1">Tier Lists</span>
          <span className="text-2xl sm:text-3xl font-black text-purple-400">{totals.tierLists}</span>
        </div>
        <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-lg">
          <span className="text-xs uppercase font-bold text-[#64748B] block mb-1">Комменты</span>
          <span className="text-2xl sm:text-3xl font-black text-blue-400">{totals.comments}</span>
        </div>
        <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-lg">
          <span className="text-xs uppercase font-bold text-[#64748B] block mb-1">ЛС</span>
          <span className="text-2xl sm:text-3xl font-black text-amber-400">{totals.messages}</span>
        </div>
      </div>

      {/* Activity Curves / Timelines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Registrations Timeline */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[#F8FAFC] uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4.5 h-4.5 text-indigo-400" />
              Прирост пользователей
            </h4>
            <span className="text-xs sm:text-sm text-[#94A3B8] font-mono">
              Всего за период: <strong className="text-[#F8FAFC]">{timeline.registrations.reduce((acc: number, r: any) => acc + (r.count || 0), 0)}</strong>
            </span>
          </div>

          <div className="h-36 flex items-end gap-1.5 bg-[#11152A] p-3.5 rounded-2xl border border-[#1E2442]/70">
            {timeline.registrations.length === 0 ? (
              <div className="w-full text-center text-sm text-[#64748B] my-auto">Нет данных</div>
            ) : (
              timeline.registrations.map((item: any, idx: number) => {
                const max = Math.max(...timeline.registrations.map((t: any) => t.count), 1);
                const heightPercent = Math.max(10, Math.round((item.count / max) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="w-full bg-indigo-500 rounded-sm group-hover:bg-indigo-400 transition-all"
                    />
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-9 bg-zinc-900 border border-zinc-700 text-white text-xs px-2 py-0.5 rounded-lg shadow-xl whitespace-nowrap pointer-events-none z-10 font-mono">
                      {item.date}: {item.count}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Library Additions Timeline */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[#F8FAFC] uppercase tracking-wider flex items-center gap-2">
              <Film className="w-4.5 h-4.5 text-purple-400" />
              Добавления в библиотеку
            </h4>
            <span className="text-xs sm:text-sm text-[#94A3B8] font-mono">
              Всего за период: <strong className="text-[#F8FAFC]">{timeline.libraryAdditions.reduce((acc: number, r: any) => acc + (r.count || 0), 0)}</strong>
            </span>
          </div>

          <div className="h-36 flex items-end gap-1.5 bg-[#11152A] p-3.5 rounded-2xl border border-[#1E2442]/70">
            {timeline.libraryAdditions.length === 0 ? (
              <div className="w-full text-center text-sm text-[#64748B] my-auto">Нет данных</div>
            ) : (
              timeline.libraryAdditions.map((item: any, idx: number) => {
                const max = Math.max(...timeline.libraryAdditions.map((t: any) => t.count), 1);
                const heightPercent = Math.max(10, Math.round((item.count / max) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="w-full bg-[#8B5CF6] rounded-sm group-hover:bg-[#7C3AED] transition-all"
                    />
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-9 bg-zinc-900 border border-zinc-700 text-white text-xs px-2 py-0.5 rounded-lg shadow-xl whitespace-nowrap pointer-events-none z-10 font-mono">
                      {item.date}: {item.count}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Distributions: Category & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category breakdown */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
          <h4 className="text-sm font-bold text-[#F8FAFC] uppercase tracking-wider">
            Распределение библиотеки по категориям
          </h4>
          <div className="space-y-3">
            {distributions.byCategory.map((cat: any) => (
              <div key={cat.category} className="space-y-1.5">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-[#94A3B8] font-mono font-bold">{cat.category}</span>
                  <span className="font-bold text-[#F8FAFC]">{cat.count} шт.</span>
                </div>
                <div className="w-full h-2.5 bg-[#11152A] rounded-full overflow-hidden">
                  <div
                    style={{
                      width: `${Math.min(100, Math.round((cat.count / (totals.media || 1)) * 100))}%`,
                    }}
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status breakdown */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
          <h4 className="text-sm font-bold text-[#F8FAFC] uppercase tracking-wider">
            Статусы просмотра в трекере
          </h4>
          <div className="space-y-3">
            {distributions.byStatus.map((st: any) => (
              <div key={st.status} className="space-y-1.5">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-[#94A3B8] font-mono font-bold">{st.status}</span>
                  <span className="font-bold text-[#F8FAFC]">{st.count} пользователей</span>
                </div>
                <div className="w-full h-2.5 bg-[#11152A] rounded-full overflow-hidden">
                  <div
                    style={{
                      width: `${Math.min(100, Math.round((st.count / Math.max(1, ...distributions.byStatus.map((s: any) => s.count))) * 100))}%`,
                    }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top 10 Most Tracked & Top Rated Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Tracked */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
          <h4 className="text-sm font-bold text-[#F8FAFC] uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            <span>Топ-10 самых добавляемых произведений</span>
          </h4>
          <div className="space-y-2.5">
            {topLists.mostTracked.map((item: any, idx: number) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs font-bold text-[#64748B] w-6">#{idx + 1}</span>
                  <div className="min-w-0">
                    <span className="font-bold text-base text-[#F8FAFC] truncate block">{item.title}</span>
                    <span className="text-xs text-[#94A3B8] font-mono">{item.type} {item.year ? `(${item.year})` : ''}</span>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-xl bg-purple-500/20 text-[#A78BFA] font-bold font-mono text-xs shrink-0 ml-2">
                  {item.trackCount} юзеров
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Highest Rated */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
          <h4 className="text-sm font-bold text-[#F8FAFC] uppercase tracking-wider flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400" />
            <span>Топ-10 по оценкам пользователей</span>
          </h4>
          <div className="space-y-2.5">
            {topLists.highestRated.map((item: any, idx: number) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs font-bold text-[#64748B] w-6">#{idx + 1}</span>
                  <div className="min-w-0">
                    <span className="font-bold text-base text-[#F8FAFC] truncate block">{item.title}</span>
                    <span className="text-xs text-[#94A3B8] font-mono">{item.type} • {item.reviewCount} отзывов</span>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-bold font-mono text-xs shrink-0 ml-2">
                  ★ {item.avgRating}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
