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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AchievementBadge, AchievementItemProps, RARITY_CONFIG } from '../achievements/AchievementBadge.tsx';

interface AchievementData {
  achievements: AchievementItemProps[];
  stats: {
    total: number;
    unlocked: number;
    points: number;
    percentage: number;
  };
}

export const AchievementsView: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const [data, setData] = useState<AchievementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNLOCKED' | 'IN_PROGRESS' | 'LOCKED' | 'SECRET'>('ALL');
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
      if (statusFilter === 'LOCKED' && ach.isUnlocked) return false;
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
    <div className="min-h-screen pb-16 space-y-6">
      {/* Top Banner & User Stats */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#19162B] via-[#141221] to-[#0D0C13] border border-[#2B2640] p-6 sm:p-8">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 text-xs font-bold font-mono text-[#AC82FF] uppercase tracking-wider">
              <Trophy className="w-4 h-4" />
              <span>Серверная система достижений Dodik Tracker</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#F3F1F8] tracking-tight">
              Достижения и Награды
            </h1>
            <p className="text-xs sm:text-sm text-[#9A94AA] leading-relaxed">
              Отслеживайте свой прогресс, получайте уникальные бейджи за просмотр медиа, написание
              рецензий, составление списков и активность в сообществе.
            </p>
          </div>

          {/* Stats Badges */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-3 rounded-2xl bg-[#1D1A2C] border border-[#3A3355] flex items-center gap-3 min-w-[140px]">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-[#AC82FF] flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-[#9A94AA] font-medium block">Очки (PTS)</span>
                <span className="text-lg font-black font-mono text-[#F3F1F8]">
                  {data?.stats.points ?? 0}
                </span>
              </div>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-[#1D1A2C] border border-[#3A3355] flex items-center gap-3 min-w-[140px]">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-[#9A94AA] font-medium block">Открыто</span>
                <span className="text-lg font-black font-mono text-[#F3F1F8]">
                  {data?.stats.unlocked ?? 0} / {data?.stats.total ?? 0}
                </span>
              </div>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-[#1D1A2C] border border-[#3A3355] flex items-center gap-3 min-w-[130px]">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-[#9A94AA] font-medium block">Прогресс</span>
                <span className="text-lg font-black font-mono text-[#F3F1F8]">
                  {data?.stats.percentage ?? 0}%
                </span>
              </div>
            </div>

            {/* Sync Button */}
            <button
              id="sync-achievements-btn"
              onClick={handleSyncAndCheck}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#9B6BFF] hover:bg-[#8B5CF6] text-white text-xs font-bold transition-all shadow-md shadow-purple-950/50 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Проверка...' : 'Проверить прогресс'}</span>
            </button>
          </div>
        </div>

        {/* Global Progress Bar */}
        {data && (
          <div className="mt-6 pt-5 border-t border-[#2B2640]/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#9A94AA] font-mono">
              <span>Общий прогресс разблокировки</span>
              <span className="text-[#AC82FF] font-bold">
                {data.stats.unlocked} из {data.stats.total} достижений ({data.stats.percentage}%)
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#181622] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#9B6BFF] via-[#AC82FF] to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, data.stats.percentage)}%` }}
              />
            </div>
          </div>
        )}

        {syncNotice && (
          <div className="mt-4 p-3 rounded-xl bg-purple-500/20 border border-purple-500/30 text-xs text-[#AC82FF] font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{syncNotice}</span>
          </div>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4">
        {/* Search and Status Pills */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9A94AA]" />
            <input
              id="search-achievements-input"
              type="text"
              placeholder="Поиск достижения по названию или описанию..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-xs text-[#F3F1F8] placeholder-[#656075] focus:outline-none focus:border-[#9B6BFF]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A94AA] hover:text-[#F3F1F8]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'ALL', label: 'Все' },
              { id: 'UNLOCKED', label: 'Полученные' },
              { id: 'IN_PROGRESS', label: 'В процессе' },
              { id: 'LOCKED', label: 'Заблокированные' },
              { id: 'SECRET', label: 'Секретные' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === st.id
                    ? 'bg-[#9B6BFF] text-white shadow-sm'
                    : 'bg-[#1C1A24] text-[#9A94AA] hover:text-[#F3F1F8] border border-[#2F2B42]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Filters: Rarity & Category */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#201D2C]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#656075] font-mono">Редкость:</span>
            <select
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-[#1C1A24] border border-[#2F2B42] text-xs text-[#9A94AA] focus:outline-none focus:border-[#9B6BFF]"
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
            <span className="text-[11px] text-[#656075] font-mono">Категория:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-[#1C1A24] border border-[#2F2B42] text-xs text-[#9A94AA] focus:outline-none focus:border-[#9B6BFF]"
            >
              <option value="ALL">Все категории</option>
              <option value="MEDIA">Контент и Библиотека</option>
              <option value="REVIEWS">Оценки и Рецензии</option>
              <option value="LISTS">Списки и Tier Lists</option>
              <option value="COMMUNITY">Друзья и Сообщество</option>
              <option value="ACTIVITY">Активность и Серии</option>
            </select>
          </div>

          <span className="ml-auto text-xs text-[#9A94AA] font-mono">
            Найдено: {filteredAchievements.length}
          </span>
        </div>
      </div>

      {/* Achievements Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#AC82FF] animate-spin" />
          <p className="text-xs text-[#9A94AA]">Загрузка достижений...</p>
        </div>
      ) : filteredAchievements.length === 0 ? (
        <div className="py-20 text-center space-y-3 rounded-2xl bg-[#14131A] border border-[#252233]">
          <Trophy className="w-10 h-10 text-zinc-600 mx-auto" />
          <p className="text-sm text-zinc-300 font-medium">Достижения не найдены</p>
          <p className="text-xs text-[#9A94AA]">Попробуйте изменить параметры поиска или фильтрации</p>
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

      {/* Achievement Detail Modal */}
      {selectedAchievement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-3xl bg-[#141221] border border-[#3A3355] p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Close Button */}
            <button
              onClick={() => setSelectedAchievement(null)}
              className="absolute top-4 right-4 p-2 rounded-xl text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#201D2E] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-4">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white border shadow-md ${
                  RARITY_CONFIG[selectedAchievement.rarity]?.badgeBg || 'bg-purple-950'
                }`}
              >
                <Trophy className="w-8 h-8" />
              </div>
              <div className="space-y-1 pr-6">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                      RARITY_CONFIG[selectedAchievement.rarity]?.badgeBg
                    }`}
                  >
                    {RARITY_CONFIG[selectedAchievement.rarity]?.label || 'Обычное'}
                  </span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-[#1F1C2B] text-[#AC82FF] border border-[#3A344E]">
                    +{selectedAchievement.points} PTS
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#F3F1F8] leading-tight">
                  {selectedAchievement.isSecret && !selectedAchievement.isUnlocked
                    ? 'Секретное достижение'
                    : selectedAchievement.title}
                </h3>
              </div>
            </div>

            {/* Description */}
            <div className="p-4 rounded-2xl bg-[#1A1827] border border-[#2D2840] space-y-2 text-xs text-[#9A94AA] leading-relaxed">
              <p>
                {selectedAchievement.isSecret && !selectedAchievement.isUnlocked
                  ? 'Условия получения скрыты. Продолжайте исследовать сервис, чтобы открыть его!'
                  : selectedAchievement.description}
              </p>
            </div>

            {/* Progress Section */}
            {selectedAchievement.progress && selectedAchievement.progress.target > 1 && (
              <div className="space-y-2 p-3 rounded-2xl bg-[#181622] border border-[#2B263C]">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#9A94AA]">Прогресс выполнения:</span>
                  <span className="text-[#AC82FF] font-bold">
                    {selectedAchievement.progress.current} / {selectedAchievement.progress.target} (
                    {selectedAchievement.progress.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#201D2C] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#9B6BFF] to-[#AC82FF]"
                    style={{ width: `${Math.min(100, selectedAchievement.progress.percentage)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Status Section */}
            <div className="space-y-2 text-xs border-t border-[#2B2640] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[#9A94AA]">Статус:</span>
                {selectedAchievement.isUnlocked ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Разблокировано
                  </span>
                ) : (
                  <span className="text-zinc-500 font-medium flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" />
                    Не разблокировано
                  </span>
                )}
              </div>

              {selectedAchievement.isUnlocked && selectedAchievement.unlockedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-[#9A94AA]">Дата получения:</span>
                  <span className="text-zinc-300 font-mono">
                    {new Date(selectedAchievement.unlockedAt).toLocaleString('ru-RU')}
                  </span>
                </div>
              )}

              {selectedAchievement.grantType === 'MANUAL' && (
                <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-800/40 text-[11px] text-purple-300 space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-[#AC82FF]" />
                    <span>Выдано администратором вручную</span>
                  </div>
                  {selectedAchievement.grantReason && (
                    <p className="text-purple-200/80 italic">«{selectedAchievement.grantReason}»</p>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedAchievement(null)}
              className="w-full py-2.5 rounded-xl bg-[#1F1C2B] hover:bg-[#282438] text-xs font-bold text-[#F3F1F8] border border-[#3A344E] transition-colors cursor-pointer"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
