import React, { useState, useEffect } from 'react';
import { BarChart3, Clock, Star, CheckCircle, Film, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { PrimaryButton, EmptyState } from '../design-system/index.ts';

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
      <div className="py-20 max-w-md mx-auto">
        <EmptyState
          icon={<BarChart3 className="w-8 h-8 text-[#8B5CF6]" />}
          title="Персональная статистика"
          description="Войдите в аккаунт, чтобы увидеть подробную аналитику времени просмотра, распределение оценок и любимые жанры."
          action={
            <PrimaryButton onClick={() => login()}>
              Войти в аккаунт
            </PrimaryButton>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl relative overflow-hidden">
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#A78BFA] uppercase tracking-wider font-mono">
            <BarChart3 className="w-4 h-4 text-[#8B5CF6]" />
            <span>Аналитика аккаунта</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight">
            Персональная статистика
          </h1>
          <p className="text-xs sm:text-sm text-[#94A3B8]">
            Метрики вашего потребления контента, часов просмотра и распределения оценок
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#8B5CF6] animate-spin" />
          <p className="text-xs text-[#94A3B8] font-mono">Считаем вашу статистику...</p>
        </div>
      ) : stats ? (
        <div className="space-y-6">
          {/* Top 4 KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 shadow-md">
              <div className="flex items-center gap-2 text-[#94A3B8] text-xs font-medium">
                <Film className="w-4 h-4 text-[#8B5CF6]" />
                Всего тайтлов
              </div>
              <p className="text-2xl font-black text-[#F8FAFC] font-mono">{stats.totalMedia}</p>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 shadow-md">
              <div className="flex items-center gap-2 text-[#94A3B8] text-xs font-medium">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                Завершено
              </div>
              <p className="text-2xl font-black text-emerald-400 font-mono">
                {stats.totalCompleted}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 shadow-md">
              <div className="flex items-center gap-2 text-[#94A3B8] text-xs font-medium">
                <Clock className="w-4 h-4 text-[#8B5CF6]" />
                Часов просмотра
              </div>
              <p className="text-2xl font-black text-[#F8FAFC] font-mono">
                ~{stats.estimatedWatchHours} ч
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 shadow-md">
              <div className="flex items-center gap-2 text-[#94A3B8] text-xs font-medium">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                Средняя оценка
              </div>
              <p className="text-2xl font-black text-amber-400 font-mono">
                {stats.averageRating ? `${stats.averageRating} / 10` : '—'}
              </p>
            </div>
          </div>

          {/* Rating distribution histogram */}
          <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
            <h3 className="text-xs font-bold text-[#94A3B8] font-mono uppercase tracking-wider">
              Распределение выставленных оценок (1-10)
            </h3>
            <div className="flex items-end gap-2 h-44 pt-4 px-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
                const count = stats.ratingDistribution?.[score] || 0;
                const maxCount = Math.max(...Object.values(stats.ratingDistribution as Record<string, number>), 1);
                const heightPercent = Math.round((count / maxCount) * 100);

                return (
                  <div key={score} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[10px] text-[#94A3B8] font-mono">{count}</span>
                    <div
                      style={{ height: `${Math.max(heightPercent, 6)}%` }}
                      className={`w-full rounded-t-lg transition-all ${
                        score >= 8
                          ? 'bg-gradient-to-t from-[#7C3AED] to-[#8B5CF6]'
                          : score >= 5
                          ? 'bg-[#8B5CF6]/60'
                          : 'bg-[#1E2442]'
                      }`}
                    />
                    <span className="text-xs font-bold text-[#F8FAFC] font-mono">{score}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* By Type Breakdown */}
          <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
            <h3 className="text-xs font-bold text-[#94A3B8] font-mono uppercase tracking-wider">
              Распределение по типам медиа
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(stats.byType || {}).map(([type, cnt]) => (
                <div key={type} className="p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442]">
                  <span className="text-[11px] text-[#94A3B8] block font-mono">{type}</span>
                  <span className="text-xl font-bold text-[#F8FAFC] font-mono">{cnt as number}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
