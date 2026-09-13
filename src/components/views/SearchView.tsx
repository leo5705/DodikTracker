import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Film,
  Tv,
  Gamepad2,
  Book,
  BookOpen,
  Sparkles,
  Plus,
  Star,
  Loader2,
  Flame,
  Bookmark,
  Music,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { AddToLibraryModal } from '../modals/AddToLibraryModal.tsx';
import { AddToListModal } from '../modals/AddToListModal.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { formatMediaTypePath } from '../../utils/formatters.ts';
import { SearchFilterPanel } from '../search/SearchFilterPanel.tsx';
import {
  SearchFilters,
  SearchSort,
  MediaTypeCategory,
  INITIAL_SEARCH_FILTERS,
  INITIAL_SEARCH_STATE,
  hasActiveFilters,
  stateToQueryString,
  parseQueryStringToState,
} from '../../types/search.ts';

interface SearchViewProps {
  onSelectMedia?: (mediaId?: number, mediaData?: any) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({ onSelectMedia }) => {
  const { pathname, route, navigate } = useRouter();

  // Parse initial state from URL
  const initialFromUrl = parseQueryStringToState(window.location.search || '');

  // Core Search State
  const [queryInput, setQueryInput] = useState<string>(initialFromUrl.query || '');
  const [appliedQuery, setAppliedQuery] = useState<string>(initialFromUrl.query || '');
  const [selectedType, setSelectedType] = useState<MediaTypeCategory>(
    initialFromUrl.type || 'ALL'
  );
  const [filters, setFilters] = useState<SearchFilters>(
    initialFromUrl.filters || INITIAL_SEARCH_FILTERS
  );
  const [sort, setSort] = useState<SearchSort>(
    initialFromUrl.sort || { sortBy: 'popularity', sortOrder: 'desc' }
  );

  // Results & Pagination State
  const [results, setResults] = useState<any[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Filter Panel visibility
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(() =>
    hasActiveFilters(initialFromUrl.filters || INITIAL_SEARCH_FILTERS)
  );

  // Modals
  const [activeModalItem, setActiveModalItem] = useState<any | null>(null);
  const [addToListMedia, setAddToListMedia] = useState<any | null>(null);

  // Concurrency & debounce guards
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRequestInFlightRef = useRef<boolean>(false);
  const lastFetchTimeRef = useRef<number>(0);

  const categories = [
    { id: 'ALL', label: 'Все категории', icon: Sparkles },
    { id: 'MOVIE', label: 'Фильмы', icon: Film },
    { id: 'TV', label: 'Сериалы', icon: Tv },
    { id: 'ANIME', label: 'Аниме', icon: Sparkles },
    { id: 'MANGA', label: 'Манга', icon: BookOpen },
    { id: 'GAME', label: 'Игры', icon: Gamepad2 },
    { id: 'BOOK', label: 'Книги', icon: Book },
    { id: 'COMIC', label: 'Комиксы', icon: Flame },
    { id: 'MUSIC', label: 'Музыка', icon: Music },
  ];

  // Helper deduplicator
  const deduplicateMedia = (items: any[]) => {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const item of items) {
      if (!item) continue;
      const idKey = `${item.provider || 'db'}-${item.externalId || item.mediaId || item.id}`;
      const titleKey = `${item.type || ''}-${(item.title || '').trim().toLowerCase()}-${item.year || ''}`;
      if (seen.has(idKey) || (titleKey.length > 5 && seen.has(titleKey))) {
        continue;
      }
      seen.add(idKey);
      seen.add(titleKey);
      result.push(item);
    }
    return result;
  };

  const isFilterActive = hasActiveFilters(filters);
  const hasTextQuery = appliedQuery.trim().length >= 2;
  // If user searched text OR specified any deep filter, we run in Search/Catalog mode.
  // Otherwise, if completely empty, we run in Trending mode.
  const isSearchOrCatalogMode = hasTextQuery || isFilterActive;

  // Sync state to URL (debounced for query)
  useEffect(() => {
    const qs = stateToQueryString({
      query: appliedQuery,
      type: selectedType,
      filters,
      sort,
    });
    const currentSearch = window.location.search.replace(/^\?/, '');
    if (qs !== currentSearch) {
      navigate(qs ? `/search?${qs}` : '/search', { replace: true, scroll: false });
    }
  }, [appliedQuery, selectedType, filters, sort, navigate]);

  // Debounce query input to appliedQuery
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedQuery(queryInput);
    }, 380);
    return () => clearTimeout(timer);
  }, [queryInput]);

  // Primary Data Fetcher
  const executeFetch = useCallback(
    async (pageToFetch: number, append: boolean) => {
      // Cooldown prevention: at least 400ms between calls
      const now = Date.now();
      if (now - lastFetchTimeRef.current < 400 && append) {
        return;
      }
      lastFetchTimeRef.current = now;

      if (isRequestInFlightRef.current && append) {
        return;
      }

      // Abort previous in-flight request if starting a new query
      if (!append && abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      isRequestInFlightRef.current = true;

      if (!append) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
        setLoadMoreError(null);
      }

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', String(pageToFetch));
        queryParams.set('limit', '20');

        if (selectedType !== 'ALL') {
          queryParams.set('type', selectedType);
        }

        if (appliedQuery.trim()) {
          queryParams.set('q', appliedQuery.trim());
        }

        // Add filters
        if (filters.genres && filters.genres.length > 0) {
          queryParams.set('genres', filters.genres.join(','));
        }
        if (filters.year) queryParams.set('year', String(filters.year));
        if (filters.yearFrom) queryParams.set('year_from', String(filters.yearFrom));
        if (filters.yearTo) queryParams.set('year_to', String(filters.yearTo));
        if (filters.ratingFrom !== undefined) queryParams.set('rating_from', String(filters.ratingFrom));
        if (filters.ratingTo !== undefined) queryParams.set('rating_to', String(filters.ratingTo));
        if (filters.status) queryParams.set('status', filters.status);
        if (filters.platforms && filters.platforms.length > 0) {
          queryParams.set('platforms', filters.platforms.join(','));
        }
        if (filters.season) queryParams.set('season', filters.season);
        if (filters.seasonYear) queryParams.set('season_year', String(filters.seasonYear));
        if (filters.animeFormat) queryParams.set('anime_format', filters.animeFormat);

        // Sorting
        if (sort.sortBy) queryParams.set('sort_by', sort.sortBy);
        if (sort.sortOrder) queryParams.set('sort_order', sort.sortOrder);

        const endpoint = isSearchOrCatalogMode
          ? `/api/media/search?${queryParams.toString()}`
          : `/api/media/trending?${queryParams.toString()}`;

        const res = await fetch(endpoint, { signal: controller.signal });

        if (controller.signal.aborted) return;

        if (!res.ok) {
          throw new Error(`Ошибка сервера: ${res.status}`);
        }

        const data = await res.json();
        const incoming = Array.isArray(data.results)
          ? data.results
          : Array.isArray(data)
          ? data
          : [];

        if (append) {
          setResults((prev) => deduplicateMedia([...prev, ...incoming]));
        } else {
          setResults(deduplicateMedia(incoming));
        }

        setHasMore(Boolean(data.hasMore) || incoming.length >= 20);
        setPage(pageToFetch);
        setLoadMoreError(null);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Search / trending fetch error:', err);
        if (append) {
          setLoadMoreError('Не удалось загрузить следующие элементы.');
        } else {
          setError('Ошибка загрузки данных. Проверьте сеть или повторите попытку.');
        }
      } finally {
        isRequestInFlightRef.current = false;
        if (!append) setIsLoading(false);
        else setIsLoadingMore(false);
      }
    },
    [appliedQuery, selectedType, filters, sort, isSearchOrCatalogMode]
  );

  // Trigger search when query, category, filters, or sort change
  useEffect(() => {
    setPage(1);
    setResults([]);
    setHasMore(false);
    executeFetch(1, false);
  }, [appliedQuery, selectedType, filters, sort, executeFetch]);

  // Handle Load More
  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || isLoading || !hasMore || isRequestInFlightRef.current) {
      return;
    }
    executeFetch(page + 1, true);
  }, [isLoadingMore, isLoading, hasMore, page, executeFetch]);

  // Sentinel IntersectionObserver
  const observerTarget = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;

    if (!hasMore || isLoading || isLoadingMore || loadMoreError) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMore &&
          !isLoadingMore &&
          !isLoading &&
          !loadMoreError &&
          !isRequestInFlightRef.current
        ) {
          handleLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '300px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isLoading, loadMoreError, handleLoadMore]);

  // Media item click handler
  const handleItemClick = async (item: any) => {
    if (item.mediaId || (typeof item.id === 'number' && !item.provider)) {
      const id = item.mediaId || item.id;
      navigate(`/media/${formatMediaTypePath(item.type)}/${id}`);
      return;
    }

    // External item - ensure it exists in DB
    try {
      const res = await fetch('/api/media/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaPayload: item }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.media?.id) {
          navigate(`/media/${formatMediaTypePath(data.media.type)}/${data.media.id}`);
        }
      }
    } catch (err) {
      console.error('Failed to resolve media:', err);
    }
  };

  const handleResetFilters = () => {
    setFilters(INITIAL_SEARCH_FILTERS);
    setSort({ sortBy: 'popularity', sortOrder: 'desc' });
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Search Header & Input */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-100 font-mono tracking-tight flex items-center gap-2">
            <span>ПОИСК И КАТАЛОГ</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-800/50 font-sans font-medium">
              v2 Deep Search
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Глубокий поиск и каталог по реальным базам TMDB, Кинопоиск, AniList, RAWG, OpenLibrary и локальной БД Dodik Tracker
          </p>
        </div>

        {/* Input Bar with clear button */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            id="global-search-input"
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Поиск по названию, оригиналу (напр. Interstellar, Атака титанов, Cyberpunk)..."
            className="w-full pl-12 pr-20 py-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500/80 focus:ring-2 focus:ring-purple-500/20 transition-all shadow-inner"
          />
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {queryInput && (
              <button
                type="button"
                onClick={() => setQueryInput('')}
                className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="Очистить поиск"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {isLoading && (
              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
            )}
          </div>
        </div>

        {/* Categories Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedType === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedType(cat.id as MediaTypeCategory)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-950 border border-purple-500'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border border-zinc-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Unified Search Filter & Sorting Panel */}
        <SearchFilterPanel
          type={selectedType}
          filters={filters}
          sort={sort}
          onFilterChange={(newFilters) => setFilters(newFilters)}
          onSortChange={(newSort) => setSort(newSort)}
          onReset={handleResetFilters}
          resultCount={results.length}
          isOpen={isFilterPanelOpen}
          onToggleOpen={() => setIsFilterPanelOpen((prev) => !prev)}
        />
      </div>

      {/* Results Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 font-mono">
            {isSearchOrCatalogMode ? (
              <>
                <span>Каталог & Результаты</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-purple-300 font-sans">
                  {results.length} найдено
                </span>
                {hasActiveFilters(filters) && (
                  <span className="text-[11px] text-zinc-500 font-sans font-normal">
                    (фильтры применены)
                  </span>
                )}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Популярное & Тренды</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-800/50 font-sans">
                  {selectedType === 'ALL'
                    ? 'Все категории'
                    : categories.find((c) => c.id === selectedType)?.label}
                </span>
              </>
            )}
          </h2>
        </div>

        {/* Error state with retry */}
        {error && !isLoading && (
          <div className="p-6 mb-6 rounded-2xl bg-rose-950/20 border border-rose-800/40 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-rose-900/30 flex items-center justify-center mx-auto text-rose-400">
              <AlertCircle className="w-5 h-5" />
            </div>
            <p className="text-sm text-rose-200 font-medium">{error}</p>
            <button
              onClick={() => executeFetch(1, false)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all shadow-md shadow-rose-950/40"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Повторить попытку
            </button>
          </div>
        )}

        {/* Initial loading state skeleton */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-2 space-y-2 animate-pulse"
              >
                <div className="aspect-[2/3] w-full rounded-xl bg-zinc-800/60" />
                <div className="h-3 bg-zinc-800/80 rounded w-3/4" />
                <div className="h-2.5 bg-zinc-800/60 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {results.map((item, idx) => (
              <div
                key={`${item.provider || 'db'}-${item.externalId || item.mediaId || item.id || idx}`}
                className="group relative rounded-2xl bg-zinc-900 border border-zinc-800/80 hover:border-purple-500/50 overflow-hidden flex flex-col transition-all duration-300 hover:shadow-xl hover:shadow-purple-950/20 hover:-translate-y-1"
              >
                {/* Poster container */}
                <div
                  onClick={() => handleItemClick(item)}
                  className="aspect-[2/3] w-full relative bg-zinc-950 overflow-hidden cursor-pointer"
                >
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-zinc-400 text-xs">
                      <Film className="w-6 h-6 mb-1 text-zinc-600" />
                      <span>Нет постера</span>
                    </div>
                  )}

                  {/* Rating badge */}
                  {item.rating ? (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-amber-500/30 text-amber-400 text-[10px] font-bold flex items-center gap-1 shadow">
                      <Star className="w-3 h-3 fill-amber-400" />
                      {typeof item.rating === 'number' ? item.rating.toFixed(1) : item.rating}
                    </div>
                  ) : null}

                  {/* Provider tag */}
                  {item.provider && (
                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md text-[9px] font-mono text-zinc-300 border border-zinc-700">
                      {item.provider}
                    </div>
                  )}
                </div>

                {/* Info & Add Action */}
                <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                  <div
                    className="cursor-pointer"
                    onClick={() => handleItemClick(item)}
                  >
                    <h3 className="text-xs font-bold text-[#F3F1F8] line-clamp-1 group-hover:text-[#AC82FF] transition-colors">
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#9A94AA]">
                      {item.year && <span>{item.year}</span>}
                      <span className="text-zinc-600">•</span>
                      <span className="text-[#AC82FF] font-medium text-[10px]">{item.type}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => setActiveModalItem(item)}
                      className="flex-1 py-1.5 px-2 rounded-xl bg-[#9B6BFF]/15 hover:bg-[#9B6BFF] text-[#AC82FF] hover:text-white border border-[#9B6BFF]/30 hover:border-[#9B6BFF] text-xs font-medium flex items-center justify-center gap-1 transition-all shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Библиотека
                    </button>
                    <button
                      title="Добавить в пользовательский список"
                      onClick={() => setAddToListMedia(item)}
                      className="p-1.5 rounded-xl bg-[#191724] hover:bg-[#9B6BFF] text-[#9A94AA] hover:text-white border border-[#252233] hover:border-[#9B6BFF] transition-colors"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !error ? (
          /* Empty state */
          <div className="py-16 text-center space-y-3 bg-zinc-900/30 rounded-2xl border border-zinc-800/60 p-8">
            <div className="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-400">
              <Film className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-200">Ничего не найдено</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              {isSearchOrCatalogMode
                ? 'По вашему запросу и выбранным фильтрам ничего не найдено. Попробуйте смягчить критерии поиска или сбросить фильтры.'
                : 'В этой категории пока нет доступных тайтлов.'}
            </p>
            {hasActiveFilters(filters) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-semibold"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Infinite Scroll Sentinel & Load More Status */}
      {results.length > 0 && (
        <div ref={observerTarget} className="py-6 flex flex-col items-center justify-center text-center">
          {isLoadingMore && (
            <div className="flex flex-col items-center gap-2 text-zinc-400 py-2">
              <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
              <span className="text-xs">Загрузка следующих результатов...</span>
            </div>
          )}

          {/* Load More Error with Retry */}
          {loadMoreError && !isLoadingMore && (
            <div className="flex flex-col items-center gap-2 text-rose-400 py-2">
              <span className="text-xs">{loadMoreError}</span>
              <button
                onClick={handleLoadMore}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-200 border border-rose-500/30 text-xs font-semibold transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Повторить
              </button>
            </div>
          )}

          {/* Manual load more fallback button if user prefers */}
          {hasMore && !isLoadingMore && !isLoading && !loadMoreError && (
            <button
              type="button"
              onClick={handleLoadMore}
              className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-semibold transition-all shadow-sm"
            >
              Загрузить ещё
            </button>
          )}

          {/* End of results message */}
          {!hasMore && !isLoadingMore && !isLoading && !loadMoreError && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium py-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-500/70" />
              <span>Вы просмотрели все доступные результаты</span>
            </div>
          )}
        </div>
      )}

      {/* Modal: Add to Library */}
      {activeModalItem && (
        <AddToLibraryModal
          mediaItem={activeModalItem}
          onClose={() => setActiveModalItem(null)}
          onAdded={() => {
            // Optional callback
          }}
        />
      )}

      {/* Modal: Add to List */}
      {addToListMedia && (
        <AddToListModal
          media={addToListMedia}
          onClose={() => setAddToListMedia(null)}
        />
      )}
    </div>
  );
};
