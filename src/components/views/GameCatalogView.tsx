import React, { useState, useEffect } from 'react';
import {
  Gamepad2,
  Search,
  Calendar,
  Star,
  ArrowUpDown,
  Loader2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { UnifiedGameSummary } from '../../types/unifiedGame.ts';
import { GameBreadcrumbs } from '../game/GameBreadcrumbs.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { PrimaryButton, SecondaryButton, EmptyState } from '../design-system/index.ts';

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
  const [sortBy, setSortBy] = useState<string>(route.params?.sortBy || 'trending');
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fadeIn">
      <GameBreadcrumbs items={[{ label: 'Каталог игр' }]} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#F8FAFC] flex items-center gap-2.5 tracking-tight">
            <Gamepad2 className="w-6 h-6 text-[#8B5CF6]" />
            <span>Каталог игр</span>
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1">
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
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] transition-colors"
          />
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
        </form>
      </div>

      {/* Genre Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
        {GENRES.map((g) => {
          const isSelected = (selectedGenre === '' && g === 'Все') || selectedGenre === g;
          return (
            <button
              key={g}
              onClick={() => setSelectedGenre(g === 'Все' ? '' : g)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] border-transparent text-white shadow-md shadow-[#7C3AED]/25'
                  : 'bg-[#0B0D20] border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#8B5CF6]/50'
              }`}
            >
              {g}
            </button>
          );
        })}
      </div>

      {/* Controls Bar */}
      <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex flex-wrap items-center justify-between gap-3 text-xs shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          {/* Platform Selector */}
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="py-1.5 px-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6] transition-colors cursor-pointer max-w-full truncate text-xs"
          >
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 text-[#94A3B8] max-w-full min-w-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="py-1.5 px-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6] transition-colors cursor-pointer max-w-full truncate text-xs"
            >
              <option value="trending">Тренды (горячие новинки)</option>
              <option value="popularity">Все время (популярные)</option>
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
          className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
            showFilters
              ? 'bg-[#151932] border-[#8B5CF6] text-[#A78BFA]'
              : 'bg-[#11152A] border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC]'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Фильтры</span>
        </button>
      </div>

      {/* Advanced Filter Panel */}
      {showFilters && (
        <div className="p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-4 text-xs animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Year Range */}
            <div>
              <label className="block text-[#94A3B8] mb-1.5 font-medium">Год выхода</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="От"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#11152A] border border-[#1E2442] text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
                />
                <span className="text-[#64748B]">—</span>
                <input
                  type="number"
                  placeholder="До"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#11152A] border border-[#1E2442] text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
            </div>

            {/* Min Rating */}
            <div>
              <label className="block text-[#94A3B8] mb-1.5 font-medium">Мин. рейтинг (1-10)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="10"
                placeholder="Напр. 7.5"
                value={ratingFrom}
                onChange={(e) => setRatingFrom(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#11152A] border border-[#1E2442] text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            {/* Min Metacritic */}
            <div>
              <label className="block text-[#94A3B8] mb-1.5 font-medium">Мин. Metacritic (1-100)</label>
              <input
                type="number"
                min="0"
                max="100"
                placeholder="Напр. 80"
                value={metacriticFrom}
                onChange={(e) => setMetacriticFrom(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#11152A] border border-[#1E2442] text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-end gap-2">
              <PrimaryButton onClick={handleApplyAdvancedFilters} className="flex-1">
                Применить
              </PrimaryButton>
              <button
                onClick={handleResetFilters}
                className="px-3 py-2 rounded-xl bg-[#11152A] hover:bg-[#151932] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2442] transition-colors cursor-pointer"
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
        <div className="py-24 flex flex-col items-center justify-center text-[#94A3B8] gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#8B5CF6]" />
          <span className="text-xs font-mono">Загрузка каталога игр...</span>
        </div>
      ) : games.length === 0 ? (
        <EmptyState
          icon={<Gamepad2 className="w-8 h-8 text-[#8B5CF6]" />}
          title="Игры не найдены"
          description="Попробуйте изменить параметры поиска или сбросить фильтры"
          action={
            <SecondaryButton onClick={handleResetFilters}>
              Сбросить фильтры
            </SecondaryButton>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            {games.map((g) => (
              <button
                key={g.id}
                onClick={() => navigate(`/games/${encodeURIComponent(g.slug || String(g.id))}`)}
                className="group p-2.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 hover:bg-[#11152A] transition-all flex flex-col text-left shadow-lg cursor-pointer"
              >
                <div className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-[#151932] mb-2.5 border border-[#1E2442]">
                  {g.posterUrl || g.coverUrl ? (
                    <img
                      src={g.posterUrl || g.coverUrl}
                      alt={g.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#64748B] text-xs">
                      Нет обложки
                    </div>
                  )}
                </div>

                <div className="flex-1 flex flex-col justify-between">
                  <div className="text-xs font-bold text-[#F8FAFC] group-hover:text-[#A78BFA] transition-colors line-clamp-2">
                    {g.title}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#94A3B8] mt-2">
                    {g.year && (
                      <span className="flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3 text-[#64748B]" />
                        <span>{g.year}</span>
                      </span>
                    )}
                    {g.rating && (
                      <span className="flex items-center gap-1 text-amber-400 font-bold font-mono">
                        <Star className="w-3 h-3 fill-amber-400/20" />
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
              <SecondaryButton
                onClick={() => fetchCatalog(page + 1, true)}
                disabled={loadingMore}
                icon={loadingMore ? <Loader2 className="w-4 h-4 animate-spin text-[#8B5CF6]" /> : undefined}
              >
                {loadingMore ? 'Загрузка...' : 'Загрузить ещё игры'}
              </SecondaryButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
