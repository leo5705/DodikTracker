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
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <RotateCw className="w-8 h-8 text-[#9B6BFF] animate-spin" />
        <span className="text-xs text-[#9A94AA]">Построение аналитических срезов...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-red-400 text-xs bg-red-500/10 rounded-2xl border border-red-500/20">{error}</div>
    );
  }

  const { timeline, distributions, topLists, totals } = data;

  return (
    <div className="space-y-6">
      {/* Header & Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#14131A] border border-[#252233]">
        <div>
          <h3 className="text-sm font-bold text-[#F3F1F8]">Глубокая аналитика платформы</h3>
          <p className="text-xs text-[#9A94AA]">Динамика регистраций, добавления контента и активность сообщества</p>
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#0F0E12] border border-[#252233]">
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                range === r.id
                  ? 'bg-[#9B6BFF] text-white'
                  : 'text-[#9A94AA] hover:text-[#F3F1F8]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Platform Totals Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="p-3.5 rounded-xl bg-[#14131A] border border-[#252233]">
          <span className="text-[10px] uppercase font-bold text-[#656075] block">Юзеры</span>
          <span className="text-xl font-black text-[#F3F1F8]">{totals.users}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#14131A] border border-[#252233]">
          <span className="text-[10px] uppercase font-bold text-[#656075] block">Медиа</span>
          <span className="text-xl font-black text-[#F3F1F8]">{totals.media}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#14131A] border border-[#252233]">
          <span className="text-[10px] uppercase font-bold text-[#656075] block">Отзывы</span>
          <span className="text-xl font-black text-emerald-400">{totals.reviews}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#14131A] border border-[#252233]">
          <span className="text-[10px] uppercase font-bold text-[#656075] block">Списки</span>
          <span className="text-xl font-black text-indigo-400">{totals.lists}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#14131A] border border-[#252233]">
          <span className="text-[10px] uppercase font-bold text-[#656075] block">Tier Lists</span>
          <span className="text-xl font-black text-purple-400">{totals.tierLists}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#14131A] border border-[#252233]">
          <span className="text-[10px] uppercase font-bold text-[#656075] block">Комменты</span>
          <span className="text-xl font-black text-blue-400">{totals.comments}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#14131A] border border-[#252233]">
          <span className="text-[10px] uppercase font-bold text-[#656075] block">ЛС</span>
          <span className="text-xl font-black text-amber-400">{totals.messages}</span>
        </div>
      </div>

      {/* Activity Curves / Timelines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Registrations Timeline */}
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              Прирост пользователей
            </h4>
            <span className="text-xs text-[#9A94AA] font-mono">
              Всего за период: {timeline.registrations.reduce((acc: number, r: any) => acc + (r.count || 0), 0)}
            </span>
          </div>

          <div className="h-28 flex items-end gap-1 bg-[#0F0E12] p-3 rounded-xl border border-[#252233]/70">
            {timeline.registrations.length === 0 ? (
              <div className="w-full text-center text-xs text-[#656075] my-auto">Нет данных</div>
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
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-zinc-900 border border-zinc-700 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap pointer-events-none z-10">
                      {item.date}: {item.count}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Library Additions Timeline */}
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider flex items-center gap-2">
              <Film className="w-4 h-4 text-purple-400" />
              Добавления в библиотеку
            </h4>
            <span className="text-xs text-[#9A94AA] font-mono">
              Всего за период: {timeline.libraryAdditions.reduce((acc: number, r: any) => acc + (r.count || 0), 0)}
            </span>
          </div>

          <div className="h-28 flex items-end gap-1 bg-[#0F0E12] p-3 rounded-xl border border-[#252233]/70">
            {timeline.libraryAdditions.length === 0 ? (
              <div className="w-full text-center text-xs text-[#656075] my-auto">Нет данных</div>
            ) : (
              timeline.libraryAdditions.map((item: any, idx: number) => {
                const max = Math.max(...timeline.libraryAdditions.map((t: any) => t.count), 1);
                const heightPercent = Math.max(10, Math.round((item.count / max) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="w-full bg-[#9B6BFF] rounded-sm group-hover:bg-[#8B58F8] transition-all"
                    />
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-zinc-900 border border-zinc-700 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap pointer-events-none z-10">
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
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-3">
          <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider">
            Распределение библиотеки по категориям
          </h4>
          <div className="space-y-2">
            {distributions.byCategory.map((cat: any) => (
              <div key={cat.category} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#9A94AA] font-mono">{cat.category}</span>
                  <span className="font-bold text-[#F3F1F8]">{cat.count} шт.</span>
                </div>
                <div className="w-full h-2 bg-[#0F0E12] rounded-full overflow-hidden">
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
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-3">
          <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider">
            Статусы просмотра в трекере
          </h4>
          <div className="space-y-2">
            {distributions.byStatus.map((st: any) => (
              <div key={st.status} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#9A94AA] font-mono">{st.status}</span>
                  <span className="font-bold text-[#F3F1F8]">{st.count} пользователей</span>
                </div>
                <div className="w-full h-2 bg-[#0F0E12] rounded-full overflow-hidden">
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
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-3">
          <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            Топ-10 самых добавляемых произведений
          </h4>
          <div className="space-y-2">
            {topLists.mostTracked.map((item: any, idx: number) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F0E12] border border-[#252233]/70 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono text-[11px] font-bold text-[#656075] w-5">#{idx + 1}</span>
                  <div className="min-w-0">
                    <span className="font-bold text-[#F3F1F8] truncate block">{item.title}</span>
                    <span className="text-[10px] text-[#9A94AA] font-mono">{item.type} {item.year ? `(${item.year})` : ''}</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-[#AC82FF] font-bold font-mono shrink-0 ml-2">
                  {item.trackCount} юзеров
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Highest Rated */}
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-3">
          <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider flex items-center gap-1.5">
            <Star className="w-4 h-4 text-amber-400" />
            Топ-10 по оценкам пользователей
          </h4>
          <div className="space-y-2">
            {topLists.highestRated.map((item: any, idx: number) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F0E12] border border-[#252233]/70 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono text-[11px] font-bold text-[#656075] w-5">#{idx + 1}</span>
                  <div className="min-w-0">
                    <span className="font-bold text-[#F3F1F8] truncate block">{item.title}</span>
                    <span className="text-[10px] text-[#9A94AA] font-mono">{item.type} • {item.reviewCount} отзывов</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold font-mono shrink-0 ml-2">
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
