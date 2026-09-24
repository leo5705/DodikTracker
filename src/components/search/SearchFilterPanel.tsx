import React, { useState } from 'react';
import {
  SlidersHorizontal,
  X,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Star,
  Calendar,
  Layers,
  Gamepad2,
  Tv,
  Check,
  ArrowUpDown,
  Filter,
  Globe,
  ShieldAlert,
  Bookmark,
  UserCheck,
  BookOpen,
  Music,
} from 'lucide-react';
import {
  SearchFilters,
  SearchSort,
  MediaTypeCategory,
  ActiveFilterChip,
  CATEGORY_GENRES,
  GAME_PLATFORMS,
  ANIME_STATUSES,
  AGE_RATING_OPTIONS,
  USER_STATUS_OPTIONS,
  COMMON_COUNTRIES,
  QUICK_YEAR_PRESETS,
  SORT_OPTIONS,
  getActiveFilterChips,
} from '../../types/search.ts';
import { useAuth } from '../../context/AuthContext.tsx';

interface SearchFilterPanelProps {
  type: MediaTypeCategory;
  filters: SearchFilters;
  sort: SearchSort;
  onFilterChange: (newFilters: SearchFilters) => void;
  onSortChange: (newSort: SearchSort) => void;
  onReset: () => void;
  resultCount?: number;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const SearchFilterPanel: React.FC<SearchFilterPanelProps> = ({
  type,
  filters,
  sort,
  onFilterChange,
  onSortChange,
  onReset,
  resultCount,
  isOpen,
  onToggleOpen,
}) => {
  const { dbUser } = useAuth();
  const [genreSearch, setGenreSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    sort: true,
    rating: true,
    userLibrary: true,
    year: true,
    genres: true,
    platform: true,
    countries: false,
    creators: false,
    status: false,
    ageRating: false,
    safety: false,
  });

  const toggleSection = (sec: string) => {
    setExpandedSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Available genres based on media category
  const availableGenres =
    type !== 'ALL' && CATEGORY_GENRES[type]
      ? CATEGORY_GENRES[type]
      : Array.from(new Set(Object.values(CATEGORY_GENRES).flat())).sort();

  const filteredGenres = availableGenres.filter((g) =>
    g.toLowerCase().includes(genreSearch.toLowerCase().trim())
  );

  const activeChips = getActiveFilterChips(filters, sort, type);
  const activeCount = activeChips.length;

  const handleToggleGenre = (genre: string) => {
    const nextGenres = filters.genres.includes(genre)
      ? filters.genres.filter((g) => g !== genre)
      : [...filters.genres, genre];
    onFilterChange({ ...filters, genres: nextGenres });
  };

  const handleTogglePlatform = (platform: string) => {
    const current = filters.platforms || [];
    const next = current.includes(platform)
      ? current.filter((p) => p !== platform)
      : [...current, platform];
    onFilterChange({ ...filters, platforms: next });
  };

  const handleToggleCountry = (country: string) => {
    const current = filters.countries || [];
    const next = current.includes(country)
      ? current.filter((c) => c !== country)
      : [...current, country];
    onFilterChange({ ...filters, countries: next });
  };

  const handleToggleAgeRating = (age: string) => {
    const current = filters.ageRatings || [];
    const next = current.includes(age)
      ? current.filter((a) => a !== age)
      : [...current, age];
    onFilterChange({ ...filters, ageRatings: next });
  };

  const handleRemoveChip = (chip: ActiveFilterChip) => {
    if (chip.field === 'genres') {
      onFilterChange({
        ...filters,
        genres: filters.genres.filter((g) => g !== chip.value),
      });
    } else if (chip.field === 'countries') {
      onFilterChange({
        ...filters,
        countries: (filters.countries || []).filter((c) => c !== chip.value),
      });
    } else if (chip.field === 'ageRatings') {
      onFilterChange({
        ...filters,
        ageRatings: (filters.ageRatings || []).filter((a) => a !== chip.value),
      });
    } else if (chip.field === 'adultFilter') {
      onFilterChange({ ...filters, adultFilter: 'all' });
    } else if (chip.field === 'year' || chip.field === 'yearFrom' || chip.field === 'yearTo') {
      onFilterChange({
        ...filters,
        year: undefined,
        yearFrom: undefined,
        yearTo: undefined,
      });
    } else if (chip.field === 'ratingFrom' || chip.field === 'ratingTo') {
      onFilterChange({
        ...filters,
        ratingFrom: undefined,
        ratingTo: undefined,
      });
    } else if (chip.field === 'dodikRatingFrom' || chip.field === 'dodikRatingTo') {
      onFilterChange({
        ...filters,
        dodikRatingFrom: undefined,
        dodikRatingTo: undefined,
      });
    } else if (chip.field === 'dodikRatingCountFrom') {
      onFilterChange({ ...filters, dodikRatingCountFrom: undefined });
    } else if (chip.field === 'myStatus') {
      onFilterChange({ ...filters, myStatus: undefined });
    } else if (chip.field === 'inLibrary') {
      onFilterChange({ ...filters, inLibrary: 'any' });
    } else if (chip.field === 'myRatingState' || chip.field === 'myRating' || chip.field === 'myRatingFrom' || chip.field === 'myRatingTo') {
      onFilterChange({
        ...filters,
        myRatingState: 'any',
        myRating: undefined,
        myRatingFrom: undefined,
        myRatingTo: undefined,
      });
    } else if (chip.field === 'hasReview') {
      onFilterChange({ ...filters, hasReview: 'any' });
    } else if (chip.field === 'platforms') {
      onFilterChange({
        ...filters,
        platforms: (filters.platforms || []).filter((p) => p !== chip.value),
      });
    } else if (chip.field === 'developer') {
      onFilterChange({ ...filters, developer: undefined });
    } else if (chip.field === 'publisher') {
      onFilterChange({ ...filters, publisher: undefined });
    } else if (chip.field === 'author') {
      onFilterChange({ ...filters, author: undefined });
    } else if (chip.field === 'artist') {
      onFilterChange({ ...filters, artist: undefined });
    } else if (chip.field === 'album') {
      onFilterChange({ ...filters, album: undefined });
    } else if (chip.field === 'language') {
      onFilterChange({ ...filters, language: undefined });
    } else if (chip.field === 'status') {
      onFilterChange({ ...filters, status: undefined });
    } else if (chip.field === 'season') {
      onFilterChange({ ...filters, season: undefined, seasonYear: undefined });
    } else if (chip.field === 'animeFormat') {
      onFilterChange({ ...filters, animeFormat: undefined });
    } else if (
      chip.field === 'hideAdult' ||
      chip.field === 'hideNudity' ||
      chip.field === 'hideSexualContent' ||
      chip.field === 'hideViolence' ||
      chip.field === 'hideExplicitLanguage'
    ) {
      onFilterChange({ ...filters, [chip.field]: undefined });
    } else if (chip.field === 'sort') {
      onSortChange({ sortBy: 'relevance', sortOrder: 'desc' });
    }
  };

  const statusOptionsForCategory = USER_STATUS_OPTIONS[type] || USER_STATUS_OPTIONS.DEFAULT;

  // Render main filter sections
  const renderFilterSections = () => (
    <div className="space-y-4 text-xs sm:text-sm">
      {/* 1. Сортировка */}
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={() => toggleSection('sort')}
          className="w-full flex items-center justify-between text-xs sm:text-sm font-bold text-[#E2E8F0] hover:text-white transition-colors cursor-pointer select-none"
        >
          <span className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-[#8B5CF6]" /> Сортировка
          </span>
          {expandedSections.sort ? (
            <ChevronUp className="w-4 h-4 text-[#64748B]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#64748B]" />
          )}
        </button>

        {expandedSections.sort && (
          <div className="space-y-2 pt-0.5">
            <select
              value={sort.sortBy}
              onChange={(e) =>
                onSortChange({ ...sort, sortBy: e.target.value as any })
              }
              aria-label="Сортировка"
              className="w-full min-w-0 h-10 px-3 rounded-xl bg-[#080A18] text-xs sm:text-sm text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] transition-colors outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSortChange({ ...sort, sortOrder: 'desc' })}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  sort.sortOrder === 'desc'
                    ? 'bg-[#151932] text-white border border-[#8B5CF6]/60 shadow-xs'
                    : 'bg-[#080A18] text-[#94A3B8] hover:text-white border border-[#1E2442]'
                }`}
              >
                По убыванию ▼
              </button>
              <button
                type="button"
                onClick={() => onSortChange({ ...sort, sortOrder: 'asc' })}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  sort.sortOrder === 'asc'
                    ? 'bg-[#151932] text-white border border-[#8B5CF6]/60 shadow-xs'
                    : 'bg-[#080A18] text-[#94A3B8] hover:text-white border border-[#1E2442]'
                }`}
              >
                По возрастанию ▲
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Рейтинги и Оценки */}
      <div className="space-y-2.5 pt-3.5 border-t border-[#1E2442]/70">
        <button
          type="button"
          onClick={() => toggleSection('rating')}
          className="w-full flex items-center justify-between text-xs sm:text-sm font-bold text-[#E2E8F0] hover:text-white transition-colors cursor-pointer select-none"
        >
          <span className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400/20" /> Рейтинги и Оценки
          </span>
          <span className="text-xs font-mono text-[#A78BFA]">
            {filters.dodikRatingFrom !== undefined || filters.ratingFrom !== undefined ? 'Активен' : 'Любой'}
          </span>
        </button>

        {expandedSections.rating && (
          <div className="space-y-3.5 pt-0.5">
            {/* Рейтинг Dodik Tracker (1-10) */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#A78BFA]">
                Рейтинг Dodik Tracker (1-10)
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="10"
                  placeholder="От (7.5)"
                  value={filters.dodikRatingFrom !== undefined ? filters.dodikRatingFrom : ''}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      dodikRatingFrom: e.target.value !== '' ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-1/2 min-w-0 h-9 px-3 rounded-xl bg-[#080A18] text-xs font-mono text-purple-300 border border-purple-900/40 focus:border-[#8B5CF6] outline-none"
                />
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="10"
                  placeholder="До (10.0)"
                  value={filters.dodikRatingTo !== undefined ? filters.dodikRatingTo : ''}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      dodikRatingTo: e.target.value !== '' ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-1/2 min-w-0 h-9 px-3 rounded-xl bg-[#080A18] text-xs font-mono text-purple-300 border border-purple-900/40 focus:border-[#8B5CF6] outline-none"
                />
              </div>
            </div>

            {/* Мин. количество оценок Dodik */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                Мин. оценок Dodik Tracker
              </span>
              <input
                type="number"
                placeholder="Мин. оценок (напр. 5)"
                value={filters.dodikRatingCountFrom !== undefined ? filters.dodikRatingCountFrom : ''}
                onChange={(e) =>
                  onFilterChange({
                    ...filters,
                    dodikRatingCountFrom: e.target.value !== '' ? parseInt(e.target.value, 10) : undefined,
                  })
                }
                className="w-full min-w-0 h-9 px-3 rounded-xl bg-[#080A18] text-xs font-mono text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] outline-none"
              />
            </div>

            {/* Внешний рейтинг (0-10) */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                Внешний рейтинг (0-10)
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="10"
                  placeholder="От (7.0)"
                  value={filters.ratingFrom !== undefined ? filters.ratingFrom : ''}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      ratingFrom: e.target.value !== '' ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-1/2 min-w-0 h-9 px-3 rounded-xl bg-[#080A18] text-xs font-mono text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] outline-none"
                />
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="10"
                  placeholder="До (10)"
                  value={filters.ratingTo !== undefined ? filters.ratingTo : ''}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      ratingTo: e.target.value !== '' ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-1/2 min-w-0 h-9 px-3 rounded-xl bg-[#080A18] text-xs font-mono text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Пользовательские фильтры (Моя библиотека) - доступно авторизованным */}
      {dbUser && (
        <div className="space-y-2.5 pt-3.5 border-t border-[#1E2442]/70">
          <button
            type="button"
            onClick={() => toggleSection('userLibrary')}
            className="w-full flex items-center justify-between text-xs sm:text-sm font-bold text-[#E2E8F0] hover:text-white transition-colors cursor-pointer select-none"
          >
            <span className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-indigo-400" /> Моя библиотека
            </span>
            {(filters.myStatus || filters.inLibrary !== 'any' || filters.myRatingState !== 'any' || filters.hasReview !== 'any') && (
              <span className="text-[11px] font-mono font-bold text-indigo-400 bg-[#151932] px-2 py-0.5 rounded-md">
                Активен
              </span>
            )}
          </button>

          {expandedSections.userLibrary && (
            <div className="space-y-3.5 pt-0.5">
              {/* В библиотеке / Не в библиотеке */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  Наличие в библиотеке
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'any', label: 'Все' },
                    { id: 'in_library', label: 'В библиотеке' },
                    { id: 'not_in_library', label: 'Не в библиотеке' },
                  ].map((opt) => {
                    const isSelected = (filters.inLibrary || 'any') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onFilterChange({ ...filters, inLibrary: opt.id as any })}
                        className={`py-2 px-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center truncate ${
                          isSelected
                            ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/60'
                            : 'bg-[#080A18] text-[#94A3B8] hover:text-white border border-[#1E2442]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Мой статус */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  Мой статус
                </span>
                <select
                  value={filters.myStatus || ''}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      myStatus: e.target.value || undefined,
                      inLibrary: e.target.value ? 'in_library' : filters.inLibrary,
                    })
                  }
                  className="w-full min-w-0 h-9.5 px-3 rounded-xl bg-[#080A18] text-xs sm:text-sm text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] outline-none cursor-pointer"
                >
                  <option value="">Любой статус</option>
                  {statusOptionsForCategory.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Оценено мной */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  Моя оценка
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'any', label: 'Любая' },
                    { id: 'rated', label: 'Оценено' },
                    { id: 'unrated', label: 'Без оценки' },
                  ].map((opt) => {
                    const isSelected = (filters.myRatingState || 'any') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          if (opt.id === 'unrated') {
                            onFilterChange({
                              ...filters,
                              myRatingState: 'unrated',
                              myRating: undefined,
                              myRatingFrom: undefined,
                              myRatingTo: undefined,
                            });
                          } else if (opt.id === 'any') {
                            onFilterChange({
                              ...filters,
                              myRatingState: 'any',
                              myRating: undefined,
                              myRatingFrom: undefined,
                              myRatingTo: undefined,
                            });
                          } else {
                            onFilterChange({ ...filters, myRatingState: 'rated' });
                          }
                        }}
                        className={`py-2 px-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center truncate ${
                          isSelected
                            ? 'bg-amber-600/25 text-amber-300 border border-amber-500/50'
                            : 'bg-[#080A18] text-[#94A3B8] hover:text-white border border-[#1E2442]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {filters.myRatingState === 'rated' && (
                  <div className="pt-2 space-y-2">
                    <span className="text-[10px] text-[#94A3B8] font-medium block">
                      Точная оценка (1-10) или диапазон:
                    </span>
                    <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => {
                        const isExact = filters.myRating === star;
                        return (
                          <button
                            key={star}
                            type="button"
                            onClick={() => {
                              onFilterChange({
                                ...filters,
                                myRatingState: 'rated',
                                myRating: isExact ? undefined : star,
                                myRatingFrom: undefined,
                                myRatingTo: undefined,
                              });
                            }}
                            className={`py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer text-center ${
                              isExact
                                ? 'bg-amber-500 text-black shadow-xs shadow-amber-500/30'
                                : 'bg-[#080A18] text-[#CBD5E1] hover:text-white hover:bg-[#1E2442] border border-[#1E2442]'
                            }`}
                          >
                            ★{star}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="10"
                        placeholder="От (★)"
                        value={filters.myRatingFrom !== undefined ? filters.myRatingFrom : ''}
                        onChange={(e) =>
                          onFilterChange({
                            ...filters,
                            myRatingState: 'rated',
                            myRating: undefined,
                            myRatingFrom: e.target.value !== '' ? parseInt(e.target.value, 10) : undefined,
                          })
                        }
                        className="w-1/2 min-w-0 h-8 px-2.5 rounded-lg bg-[#080A18] text-xs font-mono text-amber-300 border border-amber-900/40 focus:border-amber-500 outline-none"
                      />
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="10"
                        placeholder="До (★)"
                        value={filters.myRatingTo !== undefined ? filters.myRatingTo : ''}
                        onChange={(e) =>
                          onFilterChange({
                            ...filters,
                            myRatingState: 'rated',
                            myRating: undefined,
                            myRatingTo: e.target.value !== '' ? parseInt(e.target.value, 10) : undefined,
                          })
                        }
                        className="w-1/2 min-w-0 h-8 px-2.5 rounded-lg bg-[#080A18] text-xs font-mono text-amber-300 border border-amber-900/40 focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Наличие рецензии */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  Моя рецензия
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'any', label: 'Все' },
                    { id: 'with_review', label: 'С рецензией' },
                    { id: 'without_review', label: 'Без рецензии' },
                  ].map((opt) => {
                    const isSelected = (filters.hasReview || 'any') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onFilterChange({ ...filters, hasReview: opt.id as any })}
                        className={`py-2 px-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center truncate ${
                          isSelected
                            ? 'bg-fuchsia-600/25 text-fuchsia-300 border border-fuchsia-500/50'
                            : 'bg-[#080A18] text-[#94A3B8] hover:text-white border border-[#1E2442]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Год выпуска */}
      <div className="space-y-2.5 pt-3.5 border-t border-[#1E2442]/70">
        <button
          type="button"
          onClick={() => toggleSection('year')}
          className="w-full flex items-center justify-between text-xs sm:text-sm font-bold text-[#E2E8F0] hover:text-white transition-colors cursor-pointer select-none"
        >
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#8B5CF6]" /> Год выпуска
          </span>
          <span className="text-xs font-mono text-[#A78BFA]">
            {filters.year
              ? String(filters.year)
              : filters.yearFrom || filters.yearTo
              ? `${filters.yearFrom || '...'}–${filters.yearTo || '...'}`
              : 'Любой'}
          </span>
        </button>

        {expandedSections.year && (
          <div className="space-y-2.5 pt-0.5">
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_YEAR_PRESETS.map((preset) => {
                const isSelected =
                  filters.yearFrom === preset.from &&
                  filters.yearTo === preset.to;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        onFilterChange({
                          ...filters,
                          year: undefined,
                          yearFrom: undefined,
                          yearTo: undefined,
                        });
                      } else {
                        onFilterChange({
                          ...filters,
                          year: undefined,
                          yearFrom: preset.from,
                          yearTo: preset.to,
                        });
                      }
                    }}
                    className={`py-2 px-1.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer text-center truncate ${
                      isSelected
                        ? 'bg-[#151932] text-white border border-[#8B5CF6]/60 shadow-xs'
                        : 'bg-[#080A18] text-[#94A3B8] hover:text-white hover:bg-[#11152A] border border-[#1E2442]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom year range inputs */}
            <div className="flex items-center gap-2 min-w-0">
              <input
                type="number"
                placeholder="От (1970)"
                value={filters.yearFrom || ''}
                onChange={(e) =>
                  onFilterChange({
                    ...filters,
                    year: undefined,
                    yearFrom: e.target.value ? parseInt(e.target.value, 10) : undefined,
                  })
                }
                className="w-1/2 min-w-0 h-9 px-3 rounded-xl bg-[#080A18] text-xs font-mono text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] outline-none"
              />
              <input
                type="number"
                placeholder="До (2026)"
                value={filters.yearTo || ''}
                onChange={(e) =>
                  onFilterChange({
                    ...filters,
                    year: undefined,
                    yearTo: e.target.value ? parseInt(e.target.value, 10) : undefined,
                  })
                }
                className="w-1/2 min-w-0 h-9 px-3 rounded-xl bg-[#080A18] text-xs font-mono text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* 5. Жанры */}
      <div className="space-y-2.5 pt-3.5 border-t border-[#1E2442]/70">
        <button
          type="button"
          onClick={() => toggleSection('genres')}
          className="w-full flex items-center justify-between text-xs sm:text-sm font-bold text-[#E2E8F0] hover:text-white transition-colors cursor-pointer select-none"
        >
          <span className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#8B5CF6]" /> Жанры
          </span>
          {filters.genres.length > 0 && (
            <span className="text-xs font-mono font-bold text-[#A78BFA] bg-[#151932] px-2 py-0.5 rounded-md">
              +{filters.genres.length}
            </span>
          )}
        </button>

        {expandedSections.genres && (
          <div className="space-y-2 pt-0.5">
            {availableGenres.length > 6 && (
              <input
                type="text"
                placeholder="Поиск жанров..."
                value={genreSearch}
                onChange={(e) => setGenreSearch(e.target.value)}
                className="w-full min-w-0 h-9 px-3 rounded-xl bg-[#080A18] text-xs text-[#CBD5E1] placeholder-[#64748B] border border-[#1E2442] focus:border-[#8B5CF6] outline-none"
              />
            )}

            <div className="max-h-56 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
              {filteredGenres.map((genre) => {
                const isSelected = filters.genres.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => handleToggleGenre(genre)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer text-left min-w-0 ${
                      isSelected
                        ? 'bg-[#151932] text-[#F8FAFC] border border-[#8B5CF6]/50 font-semibold'
                        : 'bg-[#080A18]/60 text-[#94A3B8] hover:text-white hover:bg-[#11152A] border border-transparent'
                    }`}
                  >
                    <span className="truncate pr-2">{genre}</span>
                    {isSelected && <Check className="w-4 h-4 text-[#A78BFA] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 6. Возрастной рейтинг & 18+ */}
      <div className="space-y-2.5 pt-3.5 border-t border-[#1E2442]/70">
        <button
          type="button"
          onClick={() => toggleSection('ageRating')}
          className="w-full flex items-center justify-between text-xs sm:text-sm font-bold text-[#E2E8F0] hover:text-white transition-colors cursor-pointer select-none"
        >
          <span className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" /> Возрастной рейтинг & 18+
          </span>
          {(filters.ageRatings || []).length > 0 && (
            <span className="text-xs font-mono font-bold text-rose-400 bg-[#151932] px-2 py-0.5 rounded-md">
              +{filters.ageRatings!.length}
            </span>
          )}
        </button>

        {expandedSections.ageRating && (
          <div className="space-y-3 pt-0.5">
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
              {AGE_RATING_OPTIONS.map((age) => {
                const isSelected = (filters.ageRatings || []).includes(age.id);
                return (
                  <button
                    key={age.id}
                    type="button"
                    onClick={() => handleToggleAgeRating(age.id)}
                    className={`px-2.5 py-2 rounded-xl text-xs font-mono transition-all cursor-pointer text-left truncate flex items-center justify-between ${
                      isSelected
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 font-bold'
                        : 'bg-[#080A18] text-[#94A3B8] hover:text-white border border-[#1E2442]'
                    }`}
                  >
                    <span className="truncate">{age.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-rose-400 shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>

            {/* 18+ режим */}
            <div className="space-y-1.5 pt-2 border-t border-[#1E2442]/40">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                Фильтр 18+
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'all', label: 'Все' },
                  { id: 'hide_adult', label: 'Без 18+' },
                  { id: 'only_adult', label: 'Только 18+' },
                ].map((opt) => {
                  const isSelected = (filters.adultFilter || 'all') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onFilterChange({ ...filters, adultFilter: opt.id as any })}
                      className={`py-2 px-1 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center truncate ${
                        isSelected
                          ? 'bg-rose-500/25 text-rose-300 border border-rose-500/50'
                          : 'bg-[#080A18] text-[#94A3B8] hover:text-white border border-[#1E2442]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 7. Страна производства */}
      <div className="space-y-2.5 pt-3.5 border-t border-[#1E2442]/70">
        <button
          type="button"
          onClick={() => toggleSection('countries')}
          className="w-full flex items-center justify-between text-xs sm:text-sm font-bold text-[#E2E8F0] hover:text-white transition-colors cursor-pointer select-none"
        >
          <span className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" /> Страна производства
          </span>
          {(filters.countries || []).length > 0 && (
            <span className="text-xs font-mono font-bold text-blue-400 bg-[#151932] px-2 py-0.5 rounded-md">
              +{filters.countries!.length}
            </span>
          )}
        </button>

        {expandedSections.countries && (
          <div className="space-y-1 pt-0.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
            {COMMON_COUNTRIES.map((country) => {
              const isSelected = (filters.countries || []).includes(country);
              return (
                <button
                  key={country}
                  type="button"
                  onClick={() => handleToggleCountry(country)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer text-left min-w-0 ${
                    isSelected
                      ? 'bg-blue-500/15 text-blue-300 border border-blue-500/40 font-semibold'
                      : 'bg-[#080A18]/60 text-[#94A3B8] hover:text-white hover:bg-[#11152A] border border-transparent'
                  }`}
                >
                  <span className="truncate pr-2">{country}</span>
                  {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 8. Игровые параметры (для GAME и ALL) */}
      {(type === 'GAME' || type === 'ALL') && (
        <div className="space-y-2.5 pt-3.5 border-t border-[#1E2442]/70">
          <button
            type="button"
            onClick={() => toggleSection('platform')}
            className="w-full flex items-center justify-between text-xs sm:text-sm font-bold text-[#E2E8F0] hover:text-white transition-colors cursor-pointer select-none"
          >
            <span className="flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-emerald-400" /> Игровые параметры
            </span>
            {(filters.platforms || []).length > 0 && (
              <span className="text-xs font-mono font-bold text-emerald-400 bg-[#151932] px-2 py-0.5 rounded-md">
                +{filters.platforms!.length}
              </span>
            )}
          </button>

          {expandedSections.platform && (
            <div className="space-y-2.5 pt-0.5">
              <div className="space-y-1 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                {GAME_PLATFORMS.map((p) => {
                  const isSelected = (filters.platforms || []).includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleTogglePlatform(p.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer text-left min-w-0 ${
                        isSelected
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-semibold'
                          : 'bg-[#080A18]/60 text-[#94A3B8] hover:text-white hover:bg-[#11152A] border border-transparent'
                      }`}
                    >
                      <span className="truncate pr-2">{p.label}</span>
                      {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 space-y-2 border-t border-[#1E2442]/40">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">Разработчик</span>
                  <input
                    type="text"
                    placeholder="Напр. CD Projekt Red"
                    value={filters.developer || ''}
                    onChange={(e) =>
                      onFilterChange({
                        ...filters,
                        developer: e.target.value ? e.target.value : undefined,
                      })
                    }
                    className="w-full min-w-0 h-9 px-3 mt-1 rounded-xl bg-[#080A18] text-xs text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] outline-none"
                  />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">Издатель</span>
                  <input
                    type="text"
                    placeholder="Напр. Sony, Nintendo"
                    value={filters.publisher || ''}
                    onChange={(e) =>
                      onFilterChange({
                        ...filters,
                        publisher: e.target.value ? e.target.value : undefined,
                      })
                    }
                    className="w-full min-w-0 h-9 px-3 mt-1 rounded-xl bg-[#080A18] text-xs text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 9. Создатели / Авторы (Книги, Комиксы, Музыка) */}
      {(type === 'BOOK' || type === 'COMIC' || type === 'MUSIC' || type === 'ALL') && (
        <div className="space-y-2.5 pt-3.5 border-t border-[#1E2442]/70">
          <button
            type="button"
            onClick={() => toggleSection('creators')}
            className="w-full flex items-center justify-between text-xs sm:text-sm font-bold text-[#E2E8F0] hover:text-white transition-colors cursor-pointer select-none"
          >
            <span className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" /> Создатели и Издатели
            </span>
            {(filters.author || filters.artist || filters.album) && (
              <span className="text-xs font-mono font-bold text-amber-400 bg-[#151932] px-2 py-0.5 rounded-md">
                1
              </span>
            )}
          </button>

          {expandedSections.creators && (
            <div className="space-y-2.5 pt-0.5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">Автор</span>
                <input
                  type="text"
                  placeholder="Напр. Стивен Кинг, Алан Мур"
                  value={filters.author || ''}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      author: e.target.value ? e.target.value : undefined,
                    })
                  }
                  className="w-full min-w-0 h-9 px-3 mt-1 rounded-xl bg-[#080A18] text-xs text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] outline-none"
                />
              </div>

              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">Художник / Музыкант</span>
                <input
                  type="text"
                  placeholder="Напр. Daft Punk, Radiohead"
                  value={filters.artist || ''}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      artist: e.target.value ? e.target.value : undefined,
                    })
                  }
                  className="w-full min-w-0 h-9 px-3 mt-1 rounded-xl bg-[#080A18] text-xs text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] outline-none"
                />
              </div>

              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">Альбом</span>
                <input
                  type="text"
                  placeholder="Напр. Discovery, OK Computer"
                  value={filters.album || ''}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      album: e.target.value ? e.target.value : undefined,
                    })
                  }
                  className="w-full min-w-0 h-9 px-3 mt-1 rounded-xl bg-[#080A18] text-xs text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] outline-none"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 10. Аниме статус и формат */}
      {(type === 'ANIME' || type === 'MANGA') && (
        <div className="space-y-2.5 pt-3.5 border-t border-[#1E2442]/70">
          <button
            type="button"
            onClick={() => toggleSection('status')}
            className="w-full flex items-center justify-between text-xs sm:text-sm font-bold text-[#E2E8F0] hover:text-white transition-colors cursor-pointer select-none"
          >
            <span className="flex items-center gap-2">
              <Tv className="w-4 h-4 text-fuchsia-400" /> Статус релиза
            </span>
            {filters.status && (
              <span className="text-xs font-mono font-bold text-fuchsia-400 bg-[#151932] px-2 py-0.5 rounded-md">
                1
              </span>
            )}
          </button>

          {expandedSections.status && (
            <div className="space-y-1 pt-0.5">
              {ANIME_STATUSES.map((st) => {
                const isSelected = filters.status === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() =>
                      onFilterChange({
                        ...filters,
                        status: isSelected ? undefined : st.id,
                      })
                    }
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer text-left min-w-0 ${
                      isSelected
                        ? 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/40 font-semibold'
                        : 'bg-[#080A18]/60 text-[#94A3B8] hover:text-white hover:bg-[#11152A] border border-transparent'
                    }`}
                  >
                    <span className="truncate pr-2">{st.label}</span>
                    {isSelected && <Check className="w-4 h-4 text-fuchsia-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpen && (
        <div
          onClick={onToggleOpen}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 lg:hidden"
        />
      )}

      {/* Filter Panel Container: 320px - 340px on Desktop, full responsive Drawer on Mobile */}
      <aside
        className={`
          fixed lg:static top-0 right-0 z-50 lg:z-auto
          w-[320px] sm:w-[340px] max-w-[85vw] lg:w-full lg:max-w-none
          h-full lg:h-auto lg:max-h-[calc(100vh-6.5rem)]
          bg-[#0B0D20] border-l lg:border border-[#1E2442] lg:rounded-2xl
          flex flex-col shrink-0 shadow-2xl lg:shadow-none
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          overflow-hidden
        `}
      >
        {/* Panel Header */}
        <div className="h-14 px-4 sm:px-5 border-b border-[#1E2442] flex items-center justify-between shrink-0 bg-[#0B0D20]">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-4.5 h-4.5 text-[#8B5CF6]" />
            <span className="font-bold text-sm sm:text-base text-[#F8FAFC]">Фильтры</span>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[#A78BFA] text-xs font-mono font-bold">
                {activeCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="p-1.5 rounded-xl text-xs text-[#94A3B8] hover:text-rose-400 hover:bg-[#151932] transition-colors cursor-pointer"
                title="Сбросить все фильтры"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleOpen}
              className="lg:hidden p-1.5 rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#151932] transition-colors cursor-pointer"
              title="Закрыть фильтры"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Filter Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar space-y-4">
          {/* Active Filter Chips */}
          {activeChips.length > 0 && (
            <div className="space-y-2 pb-3 border-b border-[#1E2442]/70">
              <div className="flex items-center justify-between text-xs font-semibold text-[#94A3B8]">
                <span>Активные ({activeChips.length})</span>
                <button
                  type="button"
                  onClick={onReset}
                  className="text-rose-400 hover:underline cursor-pointer"
                >
                  Сбросить всё
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                {activeChips.map((chip) => (
                  <span
                    key={chip.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#151932] text-xs font-medium text-[#CBD5E1] border border-[#1E2442]"
                  >
                    <span className="truncate max-w-[160px]">{chip.label}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveChip(chip)}
                      className="text-[#64748B] hover:text-rose-400 transition-colors ml-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Filter Sections */}
          {renderFilterSections()}
        </div>

        {/* Panel Footer */}
        <div className="p-3.5 sm:p-4 border-t border-[#1E2442] bg-[#080A18] flex items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onReset}
            disabled={activeCount === 0}
            className="flex-1 py-2.5 px-3 rounded-xl bg-[#151932] hover:bg-[#191D38] disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold text-[#CBD5E1] border border-[#1E2442] transition-colors cursor-pointer text-center"
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={onToggleOpen}
            className="lg:hidden flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-xs sm:text-sm font-bold text-white shadow-md shadow-[#7C3AED]/25 transition-all cursor-pointer text-center"
          >
            Применить
          </button>
        </div>
      </aside>
    </>
  );
};
