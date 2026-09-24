import React from 'react';
import {
  Search,
  X,
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
import { CalendarFilters as CalendarFiltersType, CATEGORIES, ScopeMode } from './types.ts';

interface CalendarFiltersProps {
  filters: CalendarFiltersType;
  onChange: (updated: Partial<CalendarFiltersType>) => void;
  onReset: () => void;
  totalCount?: number;
}

export const CalendarFilters: React.FC<CalendarFiltersProps> = ({
  filters,
  onChange,
  onReset,
  totalCount,
}) => {
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
    (filters.categories.length > 0 && !filters.categories.includes('all')) ||
    filters.followedOnly ||
    filters.search.trim().length > 0 ||
    filters.scope !== 'upcoming';

  return (
    <div className="space-y-3 bg-[#0B0D20] p-3.5 sm:p-4 rounded-3xl border border-[#1E2442] shadow-xl">
      {/* Row 1: Scope Tabs + "My Followed" toggle + Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Scope Tabs (Upcoming / Past / All) */}
        <div className="flex items-center gap-1 bg-[#11152A] p-1 rounded-2xl border border-[#1E2442] self-start sm:self-auto">
          <button
            onClick={() => onChange({ scope: 'upcoming' })}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filters.scope === 'upcoming'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Будущие релизы
          </button>
          <button
            onClick={() => onChange({ scope: 'past' })}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filters.scope === 'past'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Прошедшие
          </button>
          <button
            onClick={() => onChange({ scope: 'all' })}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filters.scope === 'all'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Все
          </button>
        </div>

        {/* Right tools: Followed Filter + Search */}
        <div className="flex items-center gap-2.5 flex-1 lg:max-w-md">
          {/* Followed Only Toggle */}
          <button
            onClick={() => onChange({ followedOnly: !filters.followedOnly })}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-bold transition-all shrink-0 cursor-pointer ${
              filters.followedOnly
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/50 shadow-md shadow-purple-950/40'
                : 'bg-[#11152A] text-[#94A3B8] border-[#1E2442] hover:text-white hover:border-[#8B5CF6]/40'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${filters.followedOnly ? 'fill-purple-400 text-purple-400' : ''}`} />
            <span className="hidden sm:inline">Мои ожидания</span>
          </button>

          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Поиск по премьерам..."
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value })}
              className="w-full bg-[#11152A] border border-[#1E2442] rounded-2xl pl-9 pr-8 py-2 text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] transition-colors"
            />
            {filters.search && (
              <button
                onClick={() => onChange({ search: '' })}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Category Pills (Все, Фильмы, Сериалы, Аниме, Игры, Манга, Книги, Комиксы, Музыка) */}
      <div className="pt-2 border-t border-[#1E2442] flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0 py-0.5">
          {CATEGORIES.map((cat) => {
            const selected = isCatSelected(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  selected
                    ? 'bg-[#151932] text-[#A78BFA] border border-[#8B5CF6]/50 shadow-md shadow-[#7C3AED]/15'
                    : 'bg-[#11152A] text-[#94A3B8] hover:text-white border border-[#1E2442]'
                }`}
              >
                <span className={selected ? 'text-[#A78BFA]' : cat.color}>
                  {getCategoryIcon(cat.icon)}
                </span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Clear Filters Button if any active */}
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="text-[11px] font-semibold text-[#A78BFA] hover:text-white hover:underline shrink-0 px-2 cursor-pointer"
          >
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
};
