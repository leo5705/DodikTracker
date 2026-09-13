import React, { useState, useEffect } from 'react';
import {
  Gamepad2,
  Search,
  Filter,
  Calendar,
  Star,
  ArrowUpDown,
  Loader2,
  Sparkles,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { UnifiedGameSummary, GameCatalogFilters } from '../../types/unifiedGame.ts';
import { GameBreadcrumbs } from '../game/GameBreadcrumbs.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

const GENRES = [
  'Все',
  'Action',
  'RPG',
  'Shooter',
  'Adventure',
  'Indie',
  'Strategy',
  'Simulation',
  'Sports',
  'Racing',
  'Fighting',
  'Puzzle',
  'Platformer',
  'Horror',
];

const PLATFORMS = [
  { id: '', name: 'Все платформы' },
  { id: 'pc', name: 'PC (Windows)' },
  { id: 'playstation5', name: 'PlayStation 5' },
  { id: 'playstation4', name: 'PlayStation 4' },
  { id: 'xbox-series-x', name: 'Xbox Series X/S' },
  { id: 'xbox-one', name: 'Xbox One' },
  { id: 'nintendo-switch', name: 'Nintendo Switch' },
  { id: 'ios', name: 'iOS' },
  { id: 'android', name: 'Android' },
];

export const GameCatalogView: React.FC = () => {
  const { navigate, route } = useRouter();

  const [games, setGames] = useState<UnifiedGameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  // Filter States
  const [search, setSearch] = useState(route.params?.search || route.params?.q || '');
  const [selectedGenre, setSelectedGenre] = useState(route.params?.genre || '');
  const [selectedPlatform, setSelectedPlatform] = useState(route.params?.platform || '');
  const [yearFrom, setYearFrom] = useState<string>('');
  const [yearTo, setYearTo] = useState<string>('');
  const [ratingFrom, setRatingFrom] = useState<string>('');
  const [metacriticFrom, setMetacriticFrom] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('popularity');
  const [sortOrder, setSortOrder] = useState<string>('desc');
  const [showFilters, setShowFilters] = useState(false);

  const fetchCatalog = async (targetPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '24',
        sortBy,
        sortOrder,
      });

      if (search.trim()) params.set('q', search.trim());
      if (selectedGenre && selectedGenre !== 'Все') params.set('genre', selectedGenre);
      if (selectedPlatform) params.set('platform', selectedPlatform);
      if (yearFrom) params.set('yearFrom', yearFrom);
      if (yearTo) params.set('yearTo', yearTo);
      if (ratingFrom) params.set('ratingFrom', ratingFrom);
      if (metacriticFrom) params.set('metacriticFrom', metacriticFrom);

      const endpoint = search.trim() ? '/api/games/search' : '/api/games/catalog';
      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (append) {
          setGames((prev) => [...prev, ...(data.results || [])]);
        } else {
          setGames(data.results || []);
        }
        setHasMore(data.hasMore);
        setTotal(data.total || data.results?.length || 0);
        setPage(targetPage);
      }
    } catch (err) {
      console.error('Error fetching game catalog:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchCatalog(1, false);
  }, [selectedGenre, selectedPlatform, sortBy, sortOrder]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCatalog(1, false);
  };

  const handleApplyAdvancedFilters = () => {
    fetchCatalog(1, false);
  };

  const handleResetFilters = () => {
    setSelectedGenre('');
    setSelectedPlatform('');
    setYearFrom('');
    setYearTo('');
    setRatingFrom('');
    setMetacriticFrom('');
    setSortBy('popularity');
    setSortOrder('desc');
    setSearch('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <GameBreadcrumbs items={[{ label: 'Каталог игр' }]} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-100 flex items-center gap-2.5">
            <Gamepad2 className="w-6 h-6 text-purple-400" />
            <span>Каталог игр Dodik Tracker</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Единая база видеоигр с объединением данных RAWG и TheGamesDB ({total > 0 ? `${total} игр` : 'Тысячи проектов'})
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию игры..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
          />
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
        </form>
      </div>

      {/* Genre Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {GENRES.map((g) => {
          const isSelected = (selectedGenre === '' && g === 'Все') || selectedGenre === g;
          return (
            <button
              key={g}
              onClick={() => setSelectedGenre(g === 'Все' ? '' : g)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all ${
                isSelected
                  ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
              }`}
            >
              {g}
            </button>
          );
        })}
      </div>

      {/* Controls Bar: Sort, Platform, Toggle Advanced Filters */}
      <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Platform Selector */}
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="py-1.5 px-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-purple-500"
          >
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 text-zinc-400">
            <ArrowUpDown className="w-3.5 h-3.5 text-purple-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="py-1.5 px-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-purple-500"
            >
              <option value="popularity">Популярность</option>
              <option value="rating">Рейтинг игроков</option>
              <option value="metacritic">Metacritic</option>
              <option value="release_date">Дата выхода</option>
              <option value="name">По алфавиту</option>
            </select>
          </div>
        </div>

        {/* Toggle Filters Button */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all ${
            showFilters
              ? 'bg-purple-950/60 border-purple-500 text-purple-300'
              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Фильтры</span>
        </button>
      </div>

      {/* Advanced Filter Panel */}
      {showFilters && (
        <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Year Range */}
            <div>
              <label className="block text-zinc-400 mb-1.5 font-medium">Год выхода</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="От"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200"
                />
                <span className="text-zinc-600">—</span>
                <input
                  type="number"
                  placeholder="До"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200"
                />
              </div>
            </div>

            {/* Min Rating */}
            <div>
              <label className="block text-zinc-400 mb-1.5 font-medium">Мин. рейтинг (1-10)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="10"
                placeholder="Напр. 7.5"
                value={ratingFrom}
                onChange={(e) => setRatingFrom(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200"
              />
            </div>

            {/* Min Metacritic */}
            <div>
              <label className="block text-zinc-400 mb-1.5 font-medium">Мин. Metacritic (1-100)</label>
              <input
                type="number"
                min="0"
                max="100"
                placeholder="Напр. 80"
                value={metacriticFrom}
                onChange={(e) => setMetacriticFrom(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-end gap-2">
              <button
                onClick={handleApplyAdvancedFilters}
                className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors"
              >
                Применить
              </button>
              <button
                onClick={handleResetFilters}
                className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
                title="Сбросить все фильтры"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Catalog Grid */}
      {loading && games.length === 0 ? (
        <div className="py-24 flex flex-col items-center justify-center text-zinc-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <span className="text-sm">Загрузка каталога игр...</span>
        </div>
      ) : games.length === 0 ? (
        <div className="py-16 text-center text-zinc-400 space-y-2">
          <p className="text-sm">Игры не найдены по выбранным фильтрам.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            {games.map((g) => (
              <button
                key={g.id}
                onClick={() => navigate(`/games/${encodeURIComponent(g.slug || String(g.id))}`)}
                className="group p-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-purple-500/50 hover:bg-zinc-900 transition-all flex flex-col text-left shadow-lg"
              >
                <div className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-zinc-950 mb-2.5 border border-zinc-800">
                  {g.posterUrl || g.coverUrl ? (
                    <img
                      src={g.posterUrl || g.coverUrl}
                      alt={g.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                      Нет обложки
                    </div>
                  )}
                </div>

                <div className="flex-1 flex flex-col justify-between">
                  <div className="text-xs font-bold text-zinc-200 group-hover:text-purple-300 transition-colors line-clamp-2">
                    {g.title}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-2">
                    {g.year && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-500" />
                        <span>{g.year}</span>
                      </span>
                    )}
                    {g.rating && (
                      <span className="flex items-center gap-1 text-purple-400 font-semibold">
                        <Star className="w-3 h-3 fill-purple-400/20" />
                        <span>{g.rating.toFixed(1)}</span>
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Pagination / Load more */}
          {hasMore && (
            <div className="pt-4 flex justify-center">
              <button
                onClick={() => fetchCatalog(page + 1, true)}
                disabled={loadingMore}
                className="px-6 py-2.5 rounded-2xl bg-zinc-800 hover:bg-purple-600 text-white font-semibold text-xs transition-all shadow-lg flex items-center gap-2"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Загрузка...</span>
                  </>
                ) : (
                  <span>Загрузить ещё игры</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
