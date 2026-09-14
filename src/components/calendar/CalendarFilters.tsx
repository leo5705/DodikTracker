import React, { useState } from 'react';
import {
  Search,
  X,
  SlidersHorizontal,
  Heart,
  Calendar,
  Sparkles,
  Film,
  Tv,
  Flame,
  Gamepad2,
  BookOpen,
  BookMarked,
  Shield,
  Music,
} from 'lucide-react';
import { CalendarFilters as CalendarFiltersType, CATEGORIES, PERIOD_OPTIONS, ScopeMode, PeriodType } from './types.ts';

interface CalendarFiltersProps {
  filters: CalendarFiltersType;
  onChange: (updated: Partial<CalendarFiltersType>) => void;
  onReset: () => void;
  totalCount?: number;
  followedCount?: number;
}

export const CalendarFilters: React.FC<CalendarFiltersProps> = ({
  filters,
  onChange,
  onReset,
  totalCount,
  followedCount = 0,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const getCategoryIcon = (icon: string) => {
    switch (icon) {
      case 'Film':
        return <Film className="w-3.5 h-3.5" />;
      case 'Tv':
        return <Tv className="w-3.5 h-3.5" />;
      case 'Flame':
        return <Flame className="w-3.5 h-3.5" />;
      case 'Gamepad2':
        return <Gamepad2 className="w-3.5 h-3.5" />;
      case 'BookOpen':
        return <BookOpen className="w-3.5 h-3.5" />;
      case 'BookMarked':
        return <BookMarked className="w-3.5 h-3.5" />;
      case 'Mask':
      case 'Shield':
        return <Shield className="w-3.5 h-3.5" />;
      case 'Music':
        return <Music className="w-3.5 h-3.5" />;
      default:
        return <Sparkles className="w-3.5 h-3.5" />;
    }
  };

  const handleCategoryClick = (catId: string) => {
    if (catId === 'all') {
      onChange({ categories: ['all'] });
      return;
    }
    const current = filters.categories.filter((c) => c !== 'all');
    if (current.includes(catId)) {
      const next = current.filter((c) => c !== catId);
      onChange({ categories: next.length > 0 ? next : ['all'] });
    } else {
      onChange({ categories: [...current, catId] });
    }
  };

  const isCatSelected = (catId: string) => {
    if (catId === 'all') {
      return filters.categories.length === 0 || filters.categories.includes('all');
    }
    return filters.categories.includes(catId);
  };

  const hasActiveFilters =
    filters.categories.length > 0 && !filters.categories.includes('all') ||
    filters.followedOnly ||
    filters.search.trim().length > 0 ||
    filters.genre.trim().length > 0 ||
    filters.platform.trim().length > 0 ||
    filters.scope !== 'upcoming';

  return (
    <div className="space-y-3 bg-[#13121B] p-3.5 sm:p-4 rounded-2xl border border-[#232032] shadow-sm">
      {/* Row 1: Scope Tabs (Upcoming vs Past vs All) + "My Releases" toggle + Search */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Scope Tabs */}
        <div className="flex items-center gap-1 bg-[#0E0D14] p-1 rounded-xl border border-[#1E1C2B] self-start sm:self-auto">
          <button
            onClick={() => onChange({ scope: 'upcoming' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              filters.scope === 'upcoming'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
            }`}
          >
            <span>🔥 Предстоящие</span>
          </button>
          <button
            onClick={() => onChange({ scope: 'past' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filters.scope === 'past'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
            }`}
          >
            <span>Прошедшие</span>
          </button>
          <button
            onClick={() => onChange({ scope: 'all' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filters.scope === 'all'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
            }`}
          >
            <span>Все даты</span>
          </button>
        </div>

        {/* Right side: My Releases Pill + Search Input + Advanced toggle */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Followed Only Button */}
          <button
            onClick={() => onChange({ followedOnly: !filters.followedOnly })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap ${
              filters.followedOnly
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
                : 'bg-[#0E0D14] text-zinc-400 border-[#1E1C2B] hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            <Heart
              className={`w-3.5 h-3.5 ${filters.followedOnly ? 'fill-rose-400 text-rose-400' : ''}`}
            />
            <span>Мои релизы</span>
            {followedCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 font-mono">
                {followedCount}
              </span>
            )}
          </button>

          {/* Search Bar */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Поиск по названию..."
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value })}
              className="w-full bg-[#0E0D14] border border-[#1E1C2B] focus:border-purple-500 rounded-xl pl-9 pr-8 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-400 focus:outline-none transition-colors"
            />
            {filters.search && (
              <button
                onClick={() => onChange({ search: '' })}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filter toggle button */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`p-2 rounded-xl border text-xs font-semibold transition-all ${
              showAdvanced || hasActiveFilters
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/40'
                : 'bg-[#0E0D14] text-zinc-400 border-[#1E1C2B] hover:text-zinc-200'
            }`}
            title="Дополнительные фильтры"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          {hasActiveFilters && (
            <button
              onClick={onReset}
              className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-xs transition-colors"
              title="Сбросить фильтры"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Categories pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {CATEGORIES.map((cat) => {
          const selected = isCatSelected(cat.id);
          return (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap shrink-0 ${
                selected
                  ? 'bg-purple-600/20 text-purple-200 border-purple-500/50 shadow-sm'
                  : 'bg-[#0E0D14] text-zinc-400 border-[#1E1C2B] hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <span className={selected ? 'text-purple-300' : cat.color}>
                {getCategoryIcon(cat.icon)}
              </span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Row 3: Quick Period selector pills (Shown in List and Timeline views or when selected) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-[#1F1C2D]/80">
        <span className="text-[11px] font-mono text-zinc-400 mr-1 shrink-0 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          Период:
        </span>
        {PERIOD_OPTIONS.map((p) => {
          const isSelected = filters.period === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onChange({ period: p.id })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all whitespace-nowrap shrink-0 ${
                isSelected
                  ? 'bg-zinc-800 text-purple-300 border-purple-500/40 font-semibold'
                  : 'bg-transparent text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-850/60'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Advanced filters drawer: Sort, Genre, Platform, Custom date inputs */}
      {showAdvanced && (
        <div className="pt-3 border-t border-[#1F1C2D] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Custom Date From */}
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">
              Дата с
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => onChange({ dateFrom: e.target.value, period: 'custom' })}
              className="w-full bg-[#0E0D14] border border-[#1E1C2B] focus:border-purple-500 rounded-xl px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none"
            />
          </div>

          {/* Custom Date To */}
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">
              Дата по
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => onChange({ dateTo: e.target.value, period: 'custom' })}
              className="w-full bg-[#0E0D14] border border-[#1E1C2B] focus:border-purple-500 rounded-xl px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none"
            />
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">
              Сортировка
            </label>
            <select
              value={`${filters.sort}_${filters.order}`}
              onChange={(e) => {
                const [sort, order] = e.target.value.split('_') as [any, any];
                onChange({ sort, order });
              }}
              className="w-full bg-[#0E0D14] border border-[#1E1C2B] focus:border-purple-500 rounded-xl px-3 py-1.5 text-xs text-zinc-200 focus:outline-none"
            >
              <option value="date_asc">По дате (ближайшие)</option>
              <option value="date_desc">По дате (поздние)</option>
              <option value="popularity_desc">По популярности</option>
              <option value="rating_desc">По рейтингу</option>
              <option value="title_asc">По алфавиту (А-Я)</option>
            </select>
          </div>

          {/* Platform / Genre filter */}
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">
              Платформа (для игр)
            </label>
            <select
              value={filters.platform}
              onChange={(e) => onChange({ platform: e.target.value })}
              className="w-full bg-[#0E0D14] border border-[#1E1C2B] focus:border-purple-500 rounded-xl px-3 py-1.5 text-xs text-zinc-200 focus:outline-none"
            >
              <option value="">Все платформы</option>
              <option value="PC">PC</option>
              <option value="PlayStation">PlayStation</option>
              <option value="Xbox">Xbox</option>
              <option value="Nintendo">Nintendo Switch</option>
              <option value="iOS">iOS / Android</option>
            </select>
          </div>
        </div>
      )}

      {/* Result stats */}
      {totalCount !== undefined && (
        <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-1">
          <span>Найдено релизов: <strong className="text-zinc-200">{totalCount}</strong></span>
          {filters.followedOnly && (
            <span className="text-rose-400 flex items-center gap-1">
              <Heart className="w-3 h-3 fill-rose-400" /> Фильтр «Мои релизы» активен
            </span>
          )}
        </div>
      )}
    </div>
  );
};
