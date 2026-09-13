import React, { useState, useEffect } from 'react';
import {
  Code2,
  Calendar,
  Star,
  Search,
  Filter,
  ArrowUpDown,
  Loader2,
  Globe,
  ChevronLeft,
  Sparkles,
} from 'lucide-react';
import { UnifiedDeveloper, UnifiedGameSummary } from '../../types/unifiedGame.ts';
import { GameBreadcrumbs } from '../game/GameBreadcrumbs.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

interface GameDeveloperDetailViewProps {
  developerIdOrSlug: string;
}

export const GameDeveloperDetailView: React.FC<GameDeveloperDetailViewProps> = ({
  developerIdOrSlug,
}) => {
  const { navigate } = useRouter();

  const [developer, setDeveloper] = useState<UnifiedDeveloper | null>(null);
  const [games, setGames] = useState<UnifiedGameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalGames, setTotalGames] = useState(0);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('popularity');
  const [selectedGenre, setSelectedGenre] = useState('');

  const fetchDeveloperDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/games/developers/${encodeURIComponent(developerIdOrSlug)}`);
      if (res.ok) {
        const data = await res.json();
        setDeveloper(data);
      }
    } catch (err) {
      console.error('Error loading developer:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGames = async (targetPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '20',
        sort: sortBy,
      });
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedGenre) params.set('genre', selectedGenre);

      const res = await fetch(`/api/games/developers/${encodeURIComponent(developerIdOrSlug)}/games?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (append) {
          setGames((prev) => [...prev, ...(data.results || [])]);
        } else {
          setGames(data.results || []);
        }
        setHasMore(data.hasMore);
        setTotalGames(data.total || data.results?.length || 0);
        setPage(targetPage);
      }
    } catch (err) {
      console.error('Error loading games:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchDeveloperDetails();
    fetchGames(1, false);
  }, [developerIdOrSlug, sortBy, selectedGenre]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchGames(1, false);
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchGames(page + 1, true);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      <GameBreadcrumbs
        items={[
          { label: 'Разработчики', path: '/games/developers' },
          { label: developer?.name || developerIdOrSlug },
        ]}
      />

      {/* Developer Header Hero */}
      <div className="relative rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-2xl p-6 md:p-8">
        {developer?.backdropUrl && (
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <img
              src={developer.backdropUrl}
              alt={developer.name}
              className="w-full h-full object-cover opacity-15 filter blur-lg scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
          </div>
        )}

        <div className="relative z-10 flex flex-col md:flex-row items-start gap-6">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-purple-950/50 border border-purple-800/50 flex items-center justify-center text-purple-300 font-black text-2xl shrink-0 overflow-hidden shadow-xl">
            {developer?.image ? (
              <img src={developer.image} alt={developer.name} className="w-full h-full object-cover" />
            ) : (
              (developer?.name || developerIdOrSlug).charAt(0).toUpperCase()
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-100 tracking-tight">
                {developer?.name || developerIdOrSlug}
              </h1>
              <span className="px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800/40 text-purple-300 text-xs font-semibold">
                Студия-разработчик
              </span>
            </div>

            {developer?.description && (
              <p className="text-xs md:text-sm text-zinc-300 leading-relaxed max-w-3xl font-normal">
                {developer.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 pt-1">
              <div className="flex items-center gap-1.5 font-medium text-zinc-300">
                <Code2 className="w-4 h-4 text-purple-400" />
                <span>Всего проектов: {developer?.gamesCount || totalGames || games.length}</span>
              </div>
              {developer?.website && (
                <a
                  href={developer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-purple-400 hover:underline"
                >
                  <Globe className="w-4 h-4" />
                  <span>Веб-сайт студии</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по играм разработчика..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
          />
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
        </form>

        {/* Sort & Filter Selectors */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <ArrowUpDown className="w-3.5 h-3.5 text-purple-400" />
            <span>Сортировка:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="py-1.5 px-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
            >
              <option value="popularity">Популярность</option>
              <option value="rating">Рейтинг игроков</option>
              <option value="metacritic">Metacritic</option>
              <option value="release_date">Дата выхода</option>
              <option value="name">По алфавиту</option>
            </select>
          </div>
        </div>
      </div>

      {/* Games Catalog Grid */}
      {loading && games.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <span className="text-sm">Загрузка каталога игр...</span>
        </div>
      ) : games.length === 0 ? (
        <div className="py-16 text-center text-zinc-400 space-y-2">
          <p className="text-sm">Игры не найдены по заданным критериям.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {games.map((g) => (
              <button
                key={g.id}
                onClick={() => navigate(`/games/${encodeURIComponent(g.slug || String(g.id))}`)}
                className="group p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-purple-500/50 hover:bg-zinc-900 transition-all flex flex-col text-left shadow-lg"
              >
                <div className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-zinc-950 mb-3 border border-zinc-800">
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

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-2.5">
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

          {/* Load More Button */}
          {hasMore && (
            <div className="pt-4 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-3 rounded-2xl bg-zinc-800 hover:bg-purple-600 text-white font-semibold text-xs transition-all shadow-lg flex items-center gap-2"
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
