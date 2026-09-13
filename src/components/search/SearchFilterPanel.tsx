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
  Sparkles,
  ArrowUpDown,
} from 'lucide-react';
import {
  SearchFilters,
  SearchSort,
  MediaTypeCategory,
  ActiveFilterChip,
  CATEGORY_GENRES,
  GAME_PLATFORMS,
  ANIME_STATUSES,
  ANIME_SEASONS,
  ANIME_FORMATS,
  QUICK_YEAR_PRESETS,
  RATING_PRESETS,
  SORT_OPTIONS,
  hasActiveFilters,
  getActiveFilterChips,
} from '../../types/search.ts';

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
  const [genreSearch, setGenreSearch] = useState('');

  // Determine available genres based on active media category
  const availableGenres =
    type !== 'ALL' && CATEGORY_GENRES[type]
      ? CATEGORY_GENRES[type]
      : Array.from(new Set(Object.values(CATEGORY_GENRES).flat())).sort();

  const filteredGenres = availableGenres.filter((g) =>
    g.toLowerCase().includes(genreSearch.toLowerCase().trim())
  );

  const activeChips = getActiveFilterChips(filters, sort, type);
  const activeCount =
    filters.genres.length +
    (filters.year || filters.yearFrom || filters.yearTo ? 1 : 0) +
    (filters.ratingFrom !== undefined || filters.ratingTo !== undefined ? 1 : 0) +
    (filters.platforms && filters.platforms.length > 0 ? filters.platforms.length : 0) +
    (filters.status ? 1 : 0) +
    (filters.season ? 1 : 0) +
    (filters.animeFormat ? 1 : 0) +
    (sort.sortBy !== 'popularity' || sort.sortOrder !== 'desc' ? 1 : 0);

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

  const handleRemoveChip = (chip: ActiveFilterChip) => {
    if (chip.field === 'genres') {
      onFilterChange({
        ...filters,
        genres: filters.genres.filter((g) => g !== chip.value),
      });
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
    } else if (chip.field === 'platforms') {
      onFilterChange({
        ...filters,
        platforms: (filters.platforms || []).filter((p) => p !== chip.value),
      });
    } else if (chip.field === 'status') {
      onFilterChange({ ...filters, status: undefined });
    } else if (chip.field === 'season') {
      onFilterChange({ ...filters, season: undefined, seasonYear: undefined });
    } else if (chip.field === 'animeFormat') {
      onFilterChange({ ...filters, animeFormat: undefined });
    } else if (chip.field === 'sort') {
      onSortChange({ sortBy: 'popularity', sortOrder: 'desc' });
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Top Filter Bar Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleOpen}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border ${
              isOpen || activeCount > 0
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/40 shadow-sm shadow-purple-900/20'
                : 'bg-zinc-900/90 text-zinc-300 hover:text-white border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-purple-400" />
            <span>Фильтры и сортировка</span>
            {activeCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-purple-500 text-white text-[10px] font-bold leading-none">
                {activeCount}
              </span>
            )}
            {isOpen ? (
              <ChevronUp className="w-3.5 h-3.5 ml-0.5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-0.5 text-zinc-400" />
            )}
          </button>

          {/* Quick Sort Dropdown */}
          <div className="inline-flex items-center bg-zinc-900/90 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-300">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
            <select
              value={sort.sortBy}
              onChange={(e) =>
                onSortChange({ ...sort, sortBy: e.target.value as any })
              }
              aria-label="Сортировка"
              className="bg-transparent text-zinc-200 border-none outline-none cursor-pointer pr-1 text-xs"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-zinc-900 text-zinc-200">
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              title={sort.sortOrder === 'desc' ? 'По убыванию' : 'По возрастанию'}
              onClick={() =>
                onSortChange({
                  ...sort,
                  sortOrder: sort.sortOrder === 'desc' ? 'asc' : 'desc',
                })
              }
              className="ml-1 px-1.5 py-0.5 rounded hover:bg-zinc-800 text-[11px] text-zinc-400 hover:text-white font-mono"
            >
              {sort.sortOrder === 'desc' ? '▼ Убыв.' : '▲ Возр.'}
            </button>
          </div>
        </div>

        {/* Clear Filters Button */}
        {(hasActiveFilters(filters) || sort.sortBy !== 'popularity' || sort.sortOrder !== 'desc') && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900/60 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-900/50 text-xs transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Сбросить всё</span>
          </button>
        )}
      </div>

      {/* Active Filter Chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-zinc-500 font-medium mr-1">Активно:</span>
          {activeChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-950/40 border border-purple-800/50 text-purple-200 text-xs font-medium animate-fadeIn"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={() => handleRemoveChip(chip)}
                aria-label={`Удалить фильтр ${chip.label}`}
                className="p-0.5 rounded hover:bg-purple-800/40 text-purple-300 hover:text-white transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] text-purple-400 hover:text-purple-300 underline ml-1 cursor-pointer"
          >
            очистить
          </button>
        </div>
      )}

      {/* Expanded Filter Panel */}
      {isOpen && (
        <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/95 border border-zinc-800/90 shadow-xl backdrop-blur-md space-y-5 animate-fadeIn">
          {/* 1. Rating Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                <span>Минимальный рейтинг</span>
              </label>
              <span className="text-xs font-mono text-zinc-400">
                {filters.ratingFrom !== undefined ? `от ${filters.ratingFrom}.0★` : 'Любой'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {RATING_PRESETS.map((preset) => {
                const isSelected = filters.ratingFrom === preset.value;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      onFilterChange({ ...filters, ratingFrom: preset.value })
                    }
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                      isSelected
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                        : 'bg-zinc-800/70 text-zinc-400 hover:text-zinc-200 border-zinc-700/60 hover:bg-zinc-800'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Year Range */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <span>Год выпуска / Период</span>
              </label>
            </div>

            {/* Quick Year Presets */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_YEAR_PRESETS.map((p) => {
                const isSelected =
                  filters.yearFrom === p.from && filters.yearTo === p.to;
                return (
                  <button
                    key={p.label}
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
                          year: p.from === p.to ? p.from : undefined,
                          yearFrom: p.from,
                          yearTo: p.to,
                        });
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-all border ${
                      isSelected
                        ? 'bg-blue-600/20 text-blue-300 border-blue-500/50 font-medium'
                        : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border-zinc-700/50'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Year Inputs */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div>
                <span className="text-[11px] text-zinc-500 block mb-1">С года:</span>
                <input
                  type="number"
                  placeholder="напр. 2000"
                  min="1900"
                  max="2030"
                  value={filters.yearFrom || ''}
                  onChange={(e) => {
                    const v = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    onFilterChange({ ...filters, year: undefined, yearFrom: v });
                  }}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800/80 border border-zinc-700/70 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <span className="text-[11px] text-zinc-500 block mb-1">По год:</span>
                <input
                  type="number"
                  placeholder="напр. 2025"
                  min="1900"
                  max="2030"
                  value={filters.yearTo || ''}
                  onChange={(e) => {
                    const v = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    onFilterChange({ ...filters, year: undefined, yearTo: v });
                  }}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800/80 border border-zinc-700/70 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>

          {/* 3. Category-Specific Fields */}
          {/* Game Platforms */}
          {(type === 'GAME' || type === 'ALL') && (
            <div className="space-y-2 pt-1 border-t border-zinc-800/80">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Игровые платформы</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {GAME_PLATFORMS.map((platform) => {
                  const isSelected = (filters.platforms || []).includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => handleTogglePlatform(platform.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all border ${
                        isSelected
                          ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50 font-medium'
                          : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border-zinc-700/50'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                      <span>{platform.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Anime Specifics: Status, Season, Format */}
          {(type === 'ANIME' || type === 'MANGA' || type === 'TV') && (
            <div className="space-y-3 pt-1 border-t border-zinc-800/80">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 text-cyan-400" />
                <span>Статус релиза</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onFilterChange({ ...filters, status: undefined })}
                  className={`px-2.5 py-1 rounded-lg text-xs border ${
                    !filters.status
                      ? 'bg-cyan-600/20 text-cyan-300 border-cyan-500/50 font-medium'
                      : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50'
                  }`}
                >
                  Любой статус
                </button>
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
                      className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${
                        isSelected
                          ? 'bg-cyan-600/20 text-cyan-300 border-cyan-500/50 font-medium'
                          : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border-zinc-700/50'
                      }`}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>

              {type === 'ANIME' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Season */}
                  <div>
                    <span className="text-[11px] text-zinc-400 block mb-1">Сезон аниме:</span>
                    <div className="flex flex-wrap gap-1">
                      {ANIME_SEASONS.map((s) => {
                        const isSelected = filters.season === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() =>
                              onFilterChange({
                                ...filters,
                                season: isSelected ? undefined : s.id,
                              })
                            }
                            className={`px-2 py-0.5 rounded text-xs border ${
                              isSelected
                                ? 'bg-purple-600/30 text-purple-300 border-purple-500/50'
                                : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/50'
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Format */}
                  <div>
                    <span className="text-[11px] text-zinc-400 block mb-1">Формат:</span>
                    <div className="flex flex-wrap gap-1">
                      {ANIME_FORMATS.map((f) => {
                        const isSelected = filters.animeFormat === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() =>
                              onFilterChange({
                                ...filters,
                                animeFormat: isSelected ? undefined : f.id,
                              })
                            }
                            className={`px-2 py-0.5 rounded text-xs border ${
                              isSelected
                                ? 'bg-purple-600/30 text-purple-300 border-purple-500/50'
                                : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/50'
                            }`}
                          >
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. Genres */}
          <div className="space-y-2 pt-1 border-t border-zinc-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Жанры ({filters.genres.length} выбрано)</span>
              </label>
              {filters.genres.length > 0 && (
                <button
                  type="button"
                  onClick={() => onFilterChange({ ...filters, genres: [] })}
                  className="text-[11px] text-zinc-400 hover:text-white"
                >
                  Снять все
                </button>
              )}
            </div>

            {availableGenres.length > 12 && (
              <input
                type="text"
                placeholder="Фильтр по названию жанра..."
                value={genreSearch}
                onChange={(e) => setGenreSearch(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
            )}

            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1 py-0.5">
              {filteredGenres.map((genre) => {
                const isSelected = filters.genres.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => handleToggleGenre(genre)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all border ${
                      isSelected
                        ? 'bg-purple-600/30 text-purple-200 border-purple-500/60 font-medium'
                        : 'bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 border-zinc-700/40 hover:bg-zinc-800'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-purple-400" />}
                    <span>{genre}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Action Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
            <span className="text-xs text-zinc-400">
              {resultCount !== undefined
                ? `Показано ${resultCount} тайтлов`
                : 'Фильтры применяются автоматически'}
            </span>
            <button
              type="button"
              onClick={onToggleOpen}
              className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-900/30 transition-all"
            >
              Применить
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
