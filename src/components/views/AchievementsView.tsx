import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  Award,
  CheckCircle2,
  Lock,
  Flame,
  Star,
  Shield,
  Layers,
  Users,
  MessageSquare,
  Compass,
  X,
  Loader2,
  Zap,
  Target,
  Crown,
  ChevronRight,
  TrendingUp,
  Clock,
  CircleDot,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  AchievementBadge,
  AchievementItemProps,
  RARITY_CONFIG,
} from '../achievements/AchievementBadge.tsx';

interface AchievementData {
  achievements: AchievementItemProps[];
  stats: {
    total: number;
    unlocked: number;
    points: number;
    percentage: number;
  };
}

// User Level rank definitions
interface UserRank {
  level: number;
  title: string;
  minPts: number;
  maxPts: number;
  badgeColor: string;
}

const USER_RANKS: UserRank[] = [
  { level: 1, title: 'Новичок', minPts: 0, maxPts: 50, badgeColor: 'text-zinc-400 border-zinc-700 bg-zinc-900/50' },
  { level: 2, title: 'Исследователь', minPts: 50, maxPts: 150, badgeColor: 'text-sky-300 border-sky-500/40 bg-sky-950/40' },
  { level: 3, title: 'Киноман', minPts: 150, maxPts: 300, badgeColor: 'text-cyan-300 border-cyan-500/40 bg-cyan-950/40' },
  { level: 4, title: 'Геймер', minPts: 300, maxPts: 500, badgeColor: 'text-purple-300 border-purple-500/40 bg-purple-950/40' },
  { level: 5, title: 'Знаток медиа', minPts: 500, maxPts: 800, badgeColor: 'text-indigo-300 border-indigo-500/40 bg-indigo-950/40' },
  { level: 6, title: 'Эксперт', minPts: 800, maxPts: 1200, badgeColor: 'text-pink-300 border-pink-500/40 bg-pink-950/40' },
  { level: 7, title: 'Ветеран', minPts: 1200, maxPts: 1700, badgeColor: 'text-amber-300 border-amber-500/40 bg-amber-950/40' },
  { level: 8, title: 'Мастер Dodik', minPts: 1700, maxPts: 2400, badgeColor: 'text-orange-300 border-orange-500/40 bg-orange-950/40' },
  { level: 9, title: 'Грандмастер', minPts: 2400, maxPts: 3200, badgeColor: 'text-rose-300 border-rose-500/40 bg-rose-950/40' },
  { level: 10, title: 'Легенда Трекера', minPts: 3200, maxPts: 99999, badgeColor: 'text-amber-400 border-amber-400/50 bg-amber-900/40' },
];

export const AchievementsView: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const [data, setData] = useState<AchievementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_PROGRESS' | 'UNLOCKED' | 'SECRET'>('ALL');
  const [rarityFilter, setRarityFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Selected for modal
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementItemProps | null>(null);

  const fetchAchievements = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/achievements');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch achievements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAchievements();
  }, []);

  const handleSyncAndCheck = async () => {
    try {
      setSyncing(true);
      setSyncNotice(null);
      const res = await authFetch('/api/achievements/check', { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        setData(result);
        if (result.newlyUnlocked && result.newlyUnlocked.length > 0) {
          setSyncNotice(`🎉 Открыто новых достижений: ${result.newlyUnlocked.length}!`);
        } else {
          setSyncNotice('Все достижения актуальны и проверены');
        }
        setTimeout(() => setSyncNotice(null), 4000);
      }
    } catch (err) {
      console.error('Sync error:', err);
      setSyncNotice('Ошибка при синхронизации достижений');
    } finally {
      setSyncing(false);
    }
  };

  // Compute rare unlocked achievements count
  const rareUnlockedCount = useMemo(() => {
    if (!data?.achievements) return 0;
    return data.achievements.filter(
      (a) =>
        a.isUnlocked &&
        (a.rarity === 'RARE' ||
          a.rarity === 'EPIC' ||
          a.rarity === 'LEGENDARY' ||
          a.rarity === 'MYTHIC')
    ).length;
  }, [data]);

  // Compute user level details
  const userRankInfo = useMemo(() => {
    const pts = data?.stats.points || 0;
    let rank = USER_RANKS[0];
    for (const r of USER_RANKS) {
      if (pts >= r.minPts) {
        rank = r;
      }
    }
    const currentSpan = rank.maxPts - rank.minPts;
    const currentProgressPts = pts - rank.minPts;
    const progressPct =
      rank.level === 10
        ? 100
        : Math.min(100, Math.max(0, Math.round((currentProgressPts / currentSpan) * 100)));
    const ptsToNext = Math.max(0, rank.maxPts - pts);

    return {
      ...rank,
      pts,
      progressPct,
      ptsToNext,
    };
  }, [data]);

  // Compute latest unlocked achievement
  const latestUnlocked = useMemo(() => {
    if (!data?.achievements) return null;
    const unlockedList = data.achievements.filter((a) => a.isUnlocked);
    if (unlockedList.length === 0) return null;

    // Sort by unlockedAt descending
    return [...unlockedList].sort((a, b) => {
      const timeA = a.unlockedAt ? new Date(a.unlockedAt).getTime() : 0;
      const timeB = b.unlockedAt ? new Date(b.unlockedAt).getTime() : 0;
      return timeB - timeA;
    })[0];
  }, [data]);

  // Compute closest achievement to completion
  const closestAchievement = useMemo(() => {
    if (!data?.achievements) return null;
    const inProgressList = data.achievements.filter(
      (a) => !a.isUnlocked && a.progress && a.progress.target > 1
    );

    if (inProgressList.length === 0) {
      // Fallback to any locked non-secret achievement
      const locked = data.achievements.filter((a) => !a.isUnlocked && !a.isSecret);
      return locked[0] || null;
    }

    // Sort by highest progress percentage
    return [...inProgressList].sort(
      (a, b) => (b.progress?.percentage || 0) - (a.progress?.percentage || 0)
    )[0];
  }, [data]);

  // Filtered achievements
  const filteredAchievements = useMemo(() => {
    if (!data?.achievements) return [];
    return data.achievements.filter((ach) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = ach.title.toLowerCase().includes(q);
        const matchDesc = ach.description.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc) return false;
      }

      // Status
      if (statusFilter === 'UNLOCKED' && !ach.isUnlocked) return false;
      if (statusFilter === 'SECRET' && !ach.isSecret) return false;
      if (statusFilter === 'IN_PROGRESS') {
        if (ach.isUnlocked) return false;
        if (!ach.progress || ach.progress.current === 0) return false;
      }

      // Rarity
      if (rarityFilter !== 'ALL' && ach.rarity !== rarityFilter) return false;

      // Category
      if (categoryFilter !== 'ALL') {
        const type = (ach as any).conditionType || '';
        if (categoryFilter === 'MEDIA' && !type.startsWith('MEDIA')) return false;
        if (categoryFilter === 'REVIEWS' && !type.includes('REVIEW') && !type.includes('LIKE')) return false;
        if (categoryFilter === 'LISTS' && !type.includes('LIST')) return false;
        if (categoryFilter === 'COMMUNITY' && !type.includes('FRIEND') && !type.includes('REGISTERED')) return false;
        if (categoryFilter === 'ACTIVITY' && !type.includes('STREAK') && !type.includes('EXPLORER')) return false;
      }

      return true;
    });
  }, [data, searchQuery, statusFilter, rarityFilter, categoryFilter]);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 space-y-6 pb-16 animate-in fade-in duration-300">
      {/* 1. TOP HEADER & METRIC STATS */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0B0D20] border border-[#1E2442] p-5 sm:p-7 shadow-2xl">
        {/* Glow ambient background accent */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#7C3AED]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-[#6366F1]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-md bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30 font-mono">
                Progression System
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight flex items-center gap-3">
              <Trophy className="w-7 h-7 text-amber-400 shrink-0" />
              <span>Достижения</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
              Отслеживайте прогресс вашей коллекции, получайте уникальные бейджи за активность и повышайте уровень аккаунта.
            </p>
          </div>

          {/* Sync Button */}
          <button
            onClick={handleSyncAndCheck}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:from-[#8B5CF6] hover:to-[#7C3AED] text-white text-xs font-bold transition-all shadow-lg shadow-[#7C3AED]/25 disabled:opacity-50 cursor-pointer self-start lg:self-auto shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Проверка...' : 'Проверить прогресс'}</span>
          </button>
        </div>

        {/* 4 Top Metric Cards (PTS, Получено, Редкие, Процент) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-5 border-t border-[#1E2442]">
          {/* PTS Card */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center gap-3 shadow-md">
            <div className="w-11 h-11 rounded-xl bg-purple-500/15 border border-purple-500/30 text-[#A78BFA] flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] text-[#94A3B8] font-mono block">PTS</span>
              <span className="text-lg sm:text-xl font-black font-mono text-white">
                {data?.stats.points ?? 0}
              </span>
            </div>
          </div>

          {/* Unlocked Count Card */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center gap-3 shadow-md">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] text-[#94A3B8] font-mono block">Получено</span>
              <span className="text-lg sm:text-xl font-black font-mono text-white">
                {data?.stats.unlocked ?? 0}{' '}
                <span className="text-xs text-[#64748B] font-normal">/ {data?.stats.total ?? 0}</span>
              </span>
            </div>
          </div>

          {/* Rare Achievements Card */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center gap-3 shadow-md">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] text-[#94A3B8] font-mono block">Редкие</span>
              <span className="text-lg sm:text-xl font-black font-mono text-amber-300">
                {rareUnlockedCount}
              </span>
            </div>
          </div>

          {/* Progress Percent Card */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center gap-3 shadow-md">
            <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] text-[#94A3B8] font-mono block">Прогресс</span>
              <span className="text-lg sm:text-xl font-black font-mono text-white">
                {data?.stats.percentage ?? 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        {data && (
          <div className="mt-4 pt-3 border-t border-[#1E2442]/60 space-y-1.5">
            <div className="w-full h-2 rounded-full bg-[#151932] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-emerald-400 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, data.stats.percentage)}%` }}
              />
            </div>
          </div>
        )}

        {syncNotice && (
          <div className="mt-3 p-3 rounded-2xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-xs text-[#A78BFA] font-medium flex items-center gap-2 animate-in fade-in">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{syncNotice}</span>
          </div>
        )}
      </div>

      {/* 2. PROGRESSION WIDGETS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Widget 1: Твой уровень */}
        <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] flex flex-col justify-between gap-3 shadow-xl relative overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Твой уровень</span>
              </span>
              <span
                className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-lg border ${userRankInfo.badgeColor}`}
              >
                LVL {userRankInfo.level}
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-white font-mono">{userRankInfo.title}</h3>
              <p className="text-[11px] text-[#94A3B8]">
                {userRankInfo.pts} PTS накоплено
              </p>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-[#1E2442]">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#94A3B8]">
              <span>До следующего ранга:</span>
              <span className="text-[#A78BFA] font-bold">
                {userRankInfo.level === 10 ? 'MAX' : `${userRankInfo.ptsToNext} PTS`}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#151932] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#7C3AED] to-amber-400 rounded-full transition-all duration-300"
                style={{ width: `${userRankInfo.progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Widget 2: Последнее достижение */}
        <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] flex flex-col justify-between gap-3 shadow-xl relative overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#A78BFA]" />
                <span>Последнее достижение</span>
              </span>
              {latestUnlocked && (
                <span className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Получено
                </span>
              )}
            </div>

            {latestUnlocked ? (
              <div
                onClick={() => setSelectedAchievement(latestUnlocked)}
                className="flex items-start gap-3 p-2 rounded-2xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 cursor-pointer transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center text-[#A78BFA] shrink-0 shadow-md shadow-[#7C3AED]/15">
                  <Trophy className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate">{latestUnlocked.title}</h4>
                  <p className="text-[10px] text-[#94A3B8] line-clamp-1">{latestUnlocked.description}</p>
                  <span className="text-[10px] text-[#A78BFA] font-mono font-bold">
                    +{latestUnlocked.points} PTS
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-3 text-center text-xs text-[#64748B] font-mono">
                Еще нет полученных наград
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[#1E2442] text-[10px] font-mono text-[#94A3B8] flex items-center justify-between">
            <span>Дата открытия:</span>
            <span>
              {latestUnlocked?.unlockedAt
                ? new Date(latestUnlocked.unlockedAt).toLocaleDateString('ru-RU')
                : '—'}
            </span>
          </div>
        </div>

        {/* Widget 3: Ближайшее достижение */}
        <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] flex flex-col justify-between gap-3 shadow-xl relative overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Target className="w-4 h-4 text-purple-400" />
                <span>Ближайшее достижение</span>
              </span>
              {closestAchievement && (
                <span className="text-[10px] font-mono text-purple-300 font-bold">
                  +{closestAchievement.points} PTS
                </span>
              )}
            </div>

            {closestAchievement ? (
              <div
                onClick={() => setSelectedAchievement(closestAchievement)}
                className="flex items-start gap-3 p-2 rounded-2xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 cursor-pointer transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[#64748B] shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate">
                    {closestAchievement.isSecret ? 'Секретное достижение' : closestAchievement.title}
                  </h4>
                  <p className="text-[10px] text-[#94A3B8] line-clamp-1">
                    {closestAchievement.isSecret
                      ? 'Условия скрыты'
                      : closestAchievement.description}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-3 text-center text-xs text-[#64748B] font-mono">
                Все достижения открыты!
              </div>
            )}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-[#1E2442]">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#94A3B8]">
              <span>Прогресс:</span>
              <span className="text-[#A78BFA] font-bold">
                {closestAchievement?.progress
                  ? `${closestAchievement.progress.current} / ${closestAchievement.progress.target} (${closestAchievement.progress.percentage}%)`
                  : '0%'}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#151932] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#7C3AED] to-[#6366F1] rounded-full transition-all duration-300"
                style={{
                  width: `${closestAchievement?.progress?.percentage || 0}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. FILTER TOOLBAR */}
      <div className="p-4 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
        {/* Search and Primary Category Tabs */}
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Primary Tabs (Все, В процессе, Полученные, Секретные) */}
          <div className="flex items-center gap-1 bg-[#11152A] p-1 rounded-2xl border border-[#1E2442] overflow-x-auto no-scrollbar">
            {[
              { id: 'ALL', label: 'Все' },
              { id: 'IN_PROGRESS', label: 'В процессе' },
              { id: 'UNLOCKED', label: 'Полученные' },
              { id: 'SECRET', label: 'Секретные' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id as any)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  statusFilter === st.id
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative flex-1 lg:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <input
              type="text"
              placeholder="Поиск по названию или описанию..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#11152A] border border-[#1E2442] rounded-2xl pl-9 pr-8 py-2 text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Secondary Filters: Rarity & Category */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#1E2442]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#64748B] font-mono">Редкость:</span>
              <select
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-[#CBD5E1] focus:outline-none focus:border-[#8B5CF6]"
              >
                <option value="ALL">Все редкости</option>
                <option value="COMMON">Обычные</option>
                <option value="RARE">Редкие</option>
                <option value="EPIC">Эпические</option>
                <option value="LEGENDARY">Легендарные</option>
                <option value="MYTHIC">Мифические</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#64748B] font-mono">Категория:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-[#CBD5E1] focus:outline-none focus:border-[#8B5CF6]"
              >
                <option value="ALL">Все типы</option>
                <option value="MEDIA">Контент и Библиотека</option>
                <option value="REVIEWS">Оценки и Рецензии</option>
                <option value="LISTS">Списки и Tier Lists</option>
                <option value="COMMUNITY">Друзья и Сообщество</option>
                <option value="ACTIVITY">Активность и Серии</option>
              </select>
            </div>
          </div>

          <span className="text-xs text-[#94A3B8] font-mono">
            Найдено: <strong className="text-white">{filteredAchievements.length}</strong>
          </span>
        </div>
      </div>

      {/* 4. ACHIEVEMENTS GRID */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#8B5CF6] animate-spin" />
          <p className="text-xs text-[#94A3B8] font-mono">Загрузка достижений...</p>
        </div>
      ) : filteredAchievements.length === 0 ? (
        <div className="py-20 text-center space-y-3 rounded-3xl bg-[#0B0D20] border border-[#1E2442] p-6">
          <Trophy className="w-10 h-10 text-[#64748B] mx-auto" />
          <p className="text-sm text-white font-bold">Достижения не найдены</p>
          <p className="text-xs text-[#94A3B8]">
            Попробуйте изменить категорию или сбросить поисковый запрос
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAchievements.map((ach) => (
            <AchievementBadge
              key={ach.id}
              {...ach}
              onClick={() => setSelectedAchievement(ach)}
            />
          ))}
        </div>
      )}

      {/* 5. ACHIEVEMENT DETAIL MODAL */}
      {selectedAchievement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-3xl bg-[#0B0D20] border border-[#1E2442] p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Close Button */}
            <button
              onClick={() => setSelectedAchievement(null)}
              className="absolute top-4 right-4 p-2 rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#151932] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-4">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white border shadow-xl ${
                  RARITY_CONFIG[selectedAchievement.rarity]?.badgeBg || 'bg-purple-950'
                }`}
              >
                <Trophy className="w-8 h-8" />
              </div>
              <div className="space-y-1 pr-6">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-lg border uppercase tracking-wider ${
                      RARITY_CONFIG[selectedAchievement.rarity]?.badgeBg
                    }`}
                  >
                    {RARITY_CONFIG[selectedAchievement.rarity]?.label || 'Обычное'}
                  </span>
                  <span className="text-xs font-mono font-black px-2 py-0.5 rounded-lg bg-[#151932] text-[#A78BFA] border border-[#8B5CF6]/40">
                    +{selectedAchievement.points} PTS
                  </span>
                </div>
                <h3 className="text-base font-bold text-white leading-tight">
                  {selectedAchievement.isSecret && !selectedAchievement.isUnlocked
                    ? 'Секретное достижение'
                    : selectedAchievement.title}
                </h3>
              </div>
            </div>

            {/* Description */}
            <div className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-2 text-xs text-[#94A3B8] leading-relaxed">
              <p>
                {selectedAchievement.isSecret && !selectedAchievement.isUnlocked
                  ? 'Условия получения скрыты. Исследуйте разделы Dodik Tracker, чтобы раскрыть тайну!'
                  : selectedAchievement.description}
              </p>
            </div>

            {/* Progress Section */}
            {selectedAchievement.progress && selectedAchievement.progress.target > 1 && (
              <div className="space-y-2 p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442]">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#94A3B8]">Прогресс выполнения:</span>
                  <span className="text-[#A78BFA] font-bold">
                    {selectedAchievement.progress.current} / {selectedAchievement.progress.target} (
                    {selectedAchievement.progress.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#151932] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#7C3AED] to-[#6366F1]"
                    style={{ width: `${Math.min(100, selectedAchievement.progress.percentage)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Status Section */}
            <div className="space-y-2 text-xs border-t border-[#1E2442] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">Статус:</span>
                {selectedAchievement.isUnlocked ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Разблокировано
                  </span>
                ) : (
                  <span className="text-[#64748B] font-medium flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" />
                    Не получено
                  </span>
                )}
              </div>

              {selectedAchievement.isUnlocked && selectedAchievement.unlockedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-[#94A3B8]">Дата получения:</span>
                  <span className="text-white font-mono">
                    {new Date(selectedAchievement.unlockedAt).toLocaleString('ru-RU')}
                  </span>
                </div>
              )}

              {selectedAchievement.grantType === 'MANUAL' && (
                <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-800/40 text-[11px] text-purple-300 space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span>Выдано администратором</span>
                  </div>
                  {selectedAchievement.grantReason && (
                    <p className="text-purple-200/80 italic">«{selectedAchievement.grantReason}»</p>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedAchievement(null)}
              className="w-full py-2.5 rounded-2xl bg-[#151932] hover:bg-[#1E2442] text-xs font-bold text-white border border-[#1E2442] transition-colors cursor-pointer"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
