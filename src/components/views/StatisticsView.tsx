import React, { useState, useEffect } from 'react';
import { BarChart3, Clock, Star, CheckCircle, Flame, Film, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export const StatisticsView: React.FC = () => {
  const { authFetch, dbUser, login } = useAuth();
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUser) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      setLoading(true);
      try {
        const res = await authFetch('/api/statistics');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to load statistics:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [dbUser]);

  if (!dbUser) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-purple-950/60 border border-purple-800/40 flex items-center justify-center mx-auto text-purple-400">
          <BarChart3 className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-zinc-100 font-mono">СТАТИСТИКА</h2>
        <p className="text-xs text-zinc-400">
          Войдите в аккаунт, чтобы увидеть подробную аналитику времени просмотра, распределение оценок и любимые жанры.
        </p>
        <button
          onClick={() => login()}
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/30"
        >
          Войти в аккаунт
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-zinc-100 font-mono tracking-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-purple-400" />
          ПЕРСОНАЛЬНАЯ СТАТИСТИКА
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Метрики вашего потребления контента, часов просмотра и распределения оценок
        </p>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-xs text-zinc-400">Считаем вашу статистику...</p>
        </div>
      ) : stats ? (
        <div className="space-y-6">
          {/* Top 4 KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
                <Film className="w-4 h-4 text-purple-400" />
                Всего тайтлов
              </div>
              <p className="text-2xl font-black text-zinc-100 font-mono">{stats.totalMedia}</p>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                Завершено
              </div>
              <p className="text-2xl font-black text-emerald-400 font-mono">
                {stats.totalCompleted}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
                <Clock className="w-4 h-4 text-purple-400" />
                Часов просмотра
              </div>
              <p className="text-2xl font-black text-zinc-100 font-mono">
                ~{stats.estimatedWatchHours} ч
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                Средняя оценка
              </div>
              <p className="text-2xl font-black text-amber-400 font-mono">
                {stats.averageRating ? `${stats.averageRating} / 10` : '—'}
              </p>
            </div>
          </div>

          {/* Rating distribution histogram */}
          <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-zinc-200 font-mono uppercase tracking-wider">
              Распределение выставленных оценок (1-10)
            </h3>
            <div className="flex items-end gap-2 h-40 pt-4 px-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
                const count = stats.ratingDistribution?.[score] || 0;
                const maxCount = Math.max(...Object.values(stats.ratingDistribution as Record<string, number>), 1);
                const heightPercent = Math.round((count / maxCount) * 100);

                return (
                  <div key={score} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[10px] text-zinc-400 font-mono">{count}</span>
                    <div
                      style={{ height: `${Math.max(heightPercent, 4)}%` }}
                      className={`w-full rounded-t-lg transition-all ${
                        score >= 8
                          ? 'bg-purple-500'
                          : score >= 5
                          ? 'bg-purple-700/80'
                          : 'bg-zinc-700'
                      }`}
                    />
                    <span className="text-xs font-bold text-zinc-300 font-mono">{score}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* By Type Breakdown */}
          <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-zinc-200 font-mono uppercase tracking-wider">
              Распределение по типам медиа
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(stats.byType || {}).map(([type, cnt]) => (
                <div key={type} className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <span className="text-[11px] text-zinc-400 block font-mono">{type}</span>
                  <span className="text-lg font-bold text-zinc-100 font-mono">{cnt as number}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
