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
  Music2,
  X,
  TrendingUp,
  Calendar,
  Heart,
  Check,
  SlidersHorizontal,
} from 'lucide-react';
import { AddToLibraryModal } from '../modals/AddToLibraryModal.tsx';
import { AddToListModal } from '../modals/AddToListModal.tsx';
import { QuickRatingModal } from '../modals/QuickRatingModal.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatMediaTypePath } from '../../utils/formatters.ts';
import { SearchFilterPanel } from '../search/SearchFilterPanel.tsx';
import {
  SearchFilters,
  SearchSort,
  MediaTypeCategory,
  INITIAL_SEARCH_FILTERS,
  hasActiveFilters,
  stateToQueryString,
  parseQueryStringToState,
  sanitizeFiltersForCategory,
} from '../../types/search.ts';
import {
  MediaCard,
  EmptyState,
  SecondaryButton,
  CategoryBadge,
  RatingBadge,
} from '../design-system/index.ts';

interface SearchViewProps {
  onSelectMedia?: (mediaId?: number, mediaData?: any) => void;
}

type DiscoveryTab = 'TRENDING' | 'POPULAR' | 'NEW_RELEASES' | 'TOP_RATED' | 'FOR_YOU';

export const SearchView: React.FC<SearchViewProps> = ({ onSelectMedia }) => {
  const { navigate } = useRouter();
  const { authFetch } = useAuth();

  // Parse initial state from URL query params
  const initialFromUrl = parseQueryStringToState(window.location.search || '');

  // Core Search State
  const [queryInput, setQueryInput] = useState<string>(initialFromUrl.query || '');
  const [appliedQuery, setAppliedQuery] = useState<string>(initialFromUrl.query || '');
  const [selectedType, setSelectedType] = useState<MediaTypeCategory>(
    initialFromUrl.type || 'ALL'
  );
  const [discoveryTab, setDiscoveryTab] = useState<DiscoveryTab>('TRENDING');
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

  // Filter Panel Drawer State
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(false);

  // Modals
  const [activeModalItem, setActiveModalItem] = useState<any | null>(null);
  const [addToListMedia, setAddToListMedia] = useState<any | null>(null);
  const [quickRateItem, setQuickRateItem] = useState<any | null>(null);

  // Abort and concurrency control
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRequestInFlightRef = useRef<boolean>(false);
  const lastFetchTimeRef = useRef<number>(0);

  const categories = [
    { id: 'ALL', label: 'Все', icon: Sparkles },
    { id: 'MOVIE', label: 'Фильмы', icon: Film },
    { id: 'TV', label: 'Сериалы', icon: Tv },
    { id: 'ANIME', label: 'Аниме', icon: Sparkles },
    { id: 'GAME', label: 'Игры', icon: Gamepad2 },
    { id: 'MANGA', label: 'Манга', icon: BookOpen },
    { id: 'BOOK', label: 'Книги', icon: Book },
    { id: 'COMIC', label: 'Комиксы', icon: Flame },
    { id: 'MUSIC', label: 'Музыка', icon: Music2 },
  ];

  const discoveryTabs: { id: DiscoveryTab; label: string; icon: React.FC<any>; sortOption?: SearchSort }[] = [
    { id: 'TRENDING', label: 'Тренды', icon: Flame, sortOption: { sortBy: 'popularity', sortOrder: 'desc' } },
    { id: 'POPULAR', label: 'Популярное', icon: TrendingUp, sortOption: { sortBy: 'popularity', sortOrder: 'desc' } },
    { id: 'NEW_RELEASES', label: 'Новые релизы', icon: Calendar, sortOption: { sortBy: 'release_date', sortOrder: 'desc' } },
    { id: 'TOP_RATED', label: 'Высокие оценки', icon: Star, sortOption: { sortBy: 'rating', sortOrder: 'desc' } },
    { id: 'FOR_YOU', label: 'Для тебя', icon: Sparkles, sortOption: { sortBy: 'popularity', sortOrder: 'desc' } },
  ];

  // Deduplication helper
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
  const isSearchOrCatalogMode = hasTextQuery || isFilterActive;

  // Debounce query input changes (350ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setAppliedQuery(queryInput.trim());
    }, 350);
    return () => clearTimeout(handler);
  }, [queryInput]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAppliedQuery(queryInput.trim());
  };

  // Sync state with URL query parameters for sharing and back/forward navigation
  useEffect(() => {
    const qs = stateToQueryString({
      query: appliedQuery,
      type: selectedType,
      filters,
      sort,
    });
    const newUrl = qs ? `/search?${qs}` : '/search';
    if (window.location.search !== `?${qs}` && !(window.location.search === '' && qs === '')) {
      window.history.replaceState(null, '', newUrl);
    }
  }, [appliedQuery, selectedType, filters, sort]);

  // Main API runner
  const executeFetch = useCallback(
    async (targetPage: number = 1, append: boolean = false) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (append) {
        setIsLoadingMore(true);
        setLoadMoreError(null);
      } else {
        setIsLoading(true);
        setError(null);
      }
      isRequestInFlightRef.current = true;

      try {
        let endpoint = '';
        if (isSearchOrCatalogMode || discoveryTab !== 'TRENDING') {
          const params = new URLSearchParams();
          if (hasTextQuery) params.set('q', appliedQuery.trim());
          if (selectedType !== 'ALL') params.set('type', selectedType);
          params.set('page', targetPage.toString());
          params.set('limit', '24');

          if (sort.sortBy) params.set('sortBy', sort.sortBy);
          if (sort.sortOrder) params.set('sortOrder', sort.sortOrder);

          if (filters.genres && filters.genres.length > 0) {
            params.set('genres', filters.genres.join(','));
          }
          if (filters.countries && filters.countries.length > 0) {
            params.set('countries', filters.countries.join(','));
          }
          if (filters.ageRatings && filters.ageRatings.length > 0) {
            params.set('age_ratings', filters.ageRatings.join(','));
          }
          if (filters.adultFilter && filters.adultFilter !== 'all') {
            params.set('adult_filter', filters.adultFilter);
          }
          if (filters.year) params.set('year', filters.year.toString());
          if (filters.yearFrom) params.set('yearFrom', filters.yearFrom.toString());
          if (filters.yearTo) params.set('yearTo', filters.yearTo.toString());
          if (filters.ratingFrom !== undefined) params.set('ratingFrom', filters.ratingFrom.toString());
          if (filters.ratingTo !== undefined) params.set('ratingTo', filters.ratingTo.toString());
          if (filters.dodikRatingFrom !== undefined) params.set('dodikRatingFrom', filters.dodikRatingFrom.toString());
          if (filters.dodikRatingTo !== undefined) params.set('dodikRatingTo', filters.dodikRatingTo.toString());
          if (filters.dodikRatingCountFrom !== undefined) params.set('dodikRatingCountFrom', filters.dodikRatingCountFrom.toString());
          if (filters.platforms && filters.platforms.length > 0) {
            params.set('platforms', filters.platforms.join(','));
          }
          if (filters.developer) params.set('developer', filters.developer);
          if (filters.publisher) params.set('publisher', filters.publisher);
          if (filters.author) params.set('author', filters.author);
          if (filters.artist) params.set('artist', filters.artist);
          if (filters.album) params.set('album', filters.album);
          if (filters.language) params.set('language', filters.language);
          if (filters.status) params.set('status', filters.status);
          if (filters.season) params.set('season', filters.season);
          if (filters.seasonYear) params.set('seasonYear', filters.seasonYear.toString());
          if (filters.animeFormat) params.set('animeFormat', filters.animeFormat);
          if (filters.myStatus) params.set('my_status', filters.myStatus);
          if (filters.inLibrary && filters.inLibrary !== 'any') params.set('in_library', filters.inLibrary);
          if (filters.myRatingState && filters.myRatingState !== 'any') params.set('my_rating_state', filters.myRatingState);
          if (filters.myRating !== undefined) params.set('my_rating', filters.myRating.toString());
          if (filters.myRatingFrom !== undefined) params.set('my_rating_from', filters.myRatingFrom.toString());
          if (filters.myRatingTo !== undefined) params.set('my_rating_to', filters.myRatingTo.toString());
          if (filters.hasReview && filters.hasReview !== 'any') params.set('has_review', filters.hasReview);
          if (filters.hideAdult) params.set('hideAdult', 'true');
          if (filters.hideNudity) params.set('hideNudity', 'true');
          if (filters.hideSexualContent) params.set('hideSexualContent', 'true');
          if (filters.hideViolence) params.set('hideViolence', 'true');
          if (filters.hideExplicitLanguage) params.set('hideExplicitLanguage', 'true');

          endpoint = `/api/media/catalog?${params.toString()}`;
        } else {
          const targetCategory = selectedType === 'ALL' ? 'ALL' : selectedType;
          endpoint = `/api/media/trending?type=${targetCategory}&page=${targetPage}&limit=24`;
        }

        const res = await authFetch(endpoint, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) {
          throw new Error(`Ошибка загрузки данных (${res.status})`);
        }

        const data = await res.json();
        const incomingResults = Array.isArray(data) ? data : data.results || [];
        const hasMoreIncoming =
          data.hasMore !== undefined
            ? data.hasMore
            : incomingResults.length >= 24;

        if (append) {
          setResults((prev) => deduplicateMedia([...prev, ...incomingResults]));
          setPage(targetPage);
          setHasMore(hasMoreIncoming);
        } else {
          setResults(deduplicateMedia(incomingResults));
          setPage(1);
          setHasMore(hasMoreIncoming);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Search fetch failed:', err);
        if (append) {
          setLoadMoreError(err.message || 'Не удалось подгрузить следующие результаты');
        } else {
          setError(err.message || 'Ошибка выполнения запроса');
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsLoadingMore(false);
          isRequestInFlightRef.current = false;
        }
      }
    },
    [appliedQuery, selectedType, filters, sort, isSearchOrCatalogMode, hasTextQuery, discoveryTab]
  );

  // Trigger search execution when applied parameters change
  useEffect(() => {
    executeFetch(1, false);
  }, [appliedQuery, selectedType, filters, sort, discoveryTab]);

  // Infinite Scroll Intersection Observer
  const observerTarget = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isRequestInFlightRef.current) {
          const now = Date.now();
          if (now - lastFetchTimeRef.current > 600) {
            lastFetchTimeRef.current = now;
            executeFetch(page + 1, true);
          }
        }
      },
      { threshold: 0.1, rootMargin: '500px' }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) observer.observe(currentTarget);

    return () => {
      if (currentTarget) observer.unobserve(currentTarget);
    };
  }, [hasMore, isLoading, isLoadingMore, page, executeFetch]);

  const handleSelectCategory = (category: MediaTypeCategory) => {
    setSelectedType(category);
    // Automatically sanitize incompatible filter parameters
    const sanitized = sanitizeFiltersForCategory(filters, category);
    setFilters(sanitized);
  };

  const handleItemClick = async (item: any) => {
    if (onSelectMedia) {
      onSelectMedia(item.id || item.mediaId, item);
      return;
    }

    if (item.mediaId || (typeof item.id === 'number' && !item.provider)) {
      const id = item.mediaId || item.id;
      navigate(`/media/${formatMediaTypePath(item.type)}/${id}`);
      return;
    }

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
      console.error('Failed to ensure media in DB:', err);
    }
  };

  const handleResetFilters = () => {
    setFilters(INITIAL_SEARCH_FILTERS);
    setSort({ sortBy: 'popularity', sortOrder: 'desc' });
  };

  const handleDiscoveryTabChange = (tab: (typeof discoveryTabs)[0]) => {
    setDiscoveryTab(tab.id);
    if (tab.sortOption) {
      setSort(tab.sortOption);
    }
  };

  const handleRatingSuccess = (item: any, newRating: number, dodikData?: any) => {
    setResults((prev) =>
      prev.map((r) => {
        const isMatch =
          (item.mediaId && r.mediaId === item.mediaId) ||
          (item.id && r.id === item.id) ||
          (item.externalId && r.externalId === item.externalId);
        if (isMatch) {
          return {
            ...r,
            userRating: newRating > 0 ? newRating : null,
            dodikRating: dodikData?.averageRating ?? r.dodikRating,
            dodikRatingCount: dodikData?.ratingCount ?? r.dodikRatingCount,
          };
        }
        return r;
      })
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-20">
      {/* 1. TOP HEADER & GLOBAL SEARCH BAR */}
      <div className="space-y-4 sm:space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F8FAFC]">
              Каталог и Поиск
            </h1>
            <p className="text-sm text-[#94A3B8] mt-1">
              Полноценный поиск по медиакаталогу: фильмы, сериалы, аниме, игры, книги, манга и музыка
            </p>
          </div>
        </div>

        {/* Global Catalog Search Form */}
        <form onSubmit={handleSearchSubmit} className="flex gap-3 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 w-5.5 h-5.5 text-[#8B5CF6]" />
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Найти фильм, игру, книгу, аниме, сериал, комикс..."
              className="w-full h-14 pl-13 pr-12 rounded-2xl bg-[#0B0D20] hover:bg-[#11152A] focus:bg-[#080A18] text-sm sm:text-base text-[#F8FAFC] placeholder-[#64748B] border border-[#1E2442] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/30 shadow-xl transition-all outline-none"
            />
            {queryInput && (
              <button
                type="button"
                onClick={() => {
                  setQueryInput('');
                  setAppliedQuery('');
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-[#64748B] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-7 h-14 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:from-[#6D28D9] hover:to-[#4F46E5] text-white text-sm sm:text-base font-bold flex items-center gap-2.5 shadow-lg shadow-[#7C3AED]/25 hover:shadow-[#7C3AED]/40 transition-all cursor-pointer shrink-0"
          >
            <Search className="w-4.5 h-4.5" />
            <span>Найти</span>
          </button>
        </form>

        {/* 2. CATEGORY TABS */}
        <div className="flex gap-2.5 overflow-x-auto pb-1.5 custom-scrollbar">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedType === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat.id as MediaTypeCategory)}
                className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-lg shadow-[#7C3AED]/30 border border-violet-400/40 scale-102'
                    : 'bg-[#0B0D20] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#11152A] border border-[#1E2442]'
                }`}
              >
                <Icon className={`w-4.5 h-4.5 ${isSelected ? 'text-white' : 'text-[#8B5CF6]'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* 3. DISCOVERY TABS (Тренды, Популярное, Новые релизы, Высокие оценки, Для тебя) */}
        {!hasTextQuery && (
          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] overflow-x-auto custom-scrollbar">
            {discoveryTabs.map((tab) => {
              const TabIcon = tab.icon;
              const isSelected = discoveryTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleDiscoveryTabChange(tab)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#151932] text-[#F8FAFC] border border-[#8B5CF6]/60 shadow-sm font-bold'
                      : 'text-[#94A3B8] hover:text-[#CBD5E1] hover:bg-[#11152A]'
                  }`}
                >
                  <TabIcon
                    className={`w-4 h-4 ${
                      isSelected ? 'text-[#A78BFA]' : 'text-[#64748B]'
                    }`}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. MAIN LAYOUT: LEFT SIDEBAR FILTERS + RIGHT MEDIA GRID */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        {/* LEFT: Spacious Filter Sidebar */}
        <div className="w-full lg:w-[320px] xl:w-[340px] shrink-0 lg:sticky lg:top-4 z-10">
          <SearchFilterPanel
            type={selectedType}
            filters={filters}
            sort={sort}
            onFilterChange={setFilters}
            onSortChange={setSort}
            onReset={handleResetFilters}
            resultCount={results.length}
            isOpen={isFilterPanelOpen}
            onToggleOpen={() => setIsFilterPanelOpen((prev) => !prev)}
          />
        </div>

        {/* RIGHT: Media Catalog Grid */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Active search summary */}
          <div className="flex items-center justify-between text-xs sm:text-sm text-[#94A3B8] px-1 font-mono">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsFilterPanelOpen(true)}
                className="lg:hidden inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#151932] hover:bg-[#191D38] border border-[#1E2442] text-xs font-sans font-semibold text-[#CBD5E1] hover:text-white transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4 text-[#8B5CF6]" />
                <span>Фильтры</span>
                {hasActiveFilters(filters) && (
                  <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
                )}
              </button>
              <span>
                {isLoading
                  ? 'Поиск тайтлов в каталоге...'
                  : `Найдено ${results.length} ${
                      results.length === 1
                        ? 'тайтл'
                        : results.length < 5
                        ? 'тайтла'
                        : 'тайтлов'
                    }`}
              </span>
            </div>

            {isLoading && (
              <span className="flex items-center gap-2 text-[#A78BFA]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Загрузка</span>
              </span>
            )}
          </div>

          {/* Results Grid: generous card sizes across 1024, 1280, 1440, 1920 resolutions */}
          {results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 sm:gap-5">
              {results.map((item, idx) => {
                const itemKey = `${item.provider || 'm'}-${item.externalId || item.mediaId || item.id || idx}`;
                const dodikRating = item.dodikRating ?? (item.provider === 'DODIK_DB' ? item.rating : null);
                const dodikVotes = item.dodikRatingCount || 0;
                const userRating = item.userRating;

                return (
                  <div
                    key={itemKey}
                    className="group relative rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#7C3AED]/15 cursor-pointer"
                  >
                    {/* Poster Thumbnail */}
                    <div
                      onClick={() => handleItemClick(item)}
                      className="relative aspect-[2/3] w-full bg-[#11152A] overflow-hidden"
                    >
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-xs text-[#64748B]">
                          <Film className="w-8 h-8 text-[#8B5CF6]/40 mb-1.5" />
                          <span className="line-clamp-2 text-xs">{item.title}</span>
                        </div>
                      )}

                      {/* Category Badge (Top-left) */}
                      <div className="absolute top-2 left-2 z-10">
                        <CategoryBadge type={item.type || selectedType} size="sm" />
                      </div>

                      {/* External Rating Badge (Top-right) */}
                      {item.rating ? (
                        <div className="absolute top-2 right-2 z-10">
                          <RatingBadge rating={item.rating} size="sm" />
                        </div>
                      ) : null}

                      {/* Hover Action Overlay */}
                      <div className="absolute inset-0 bg-[#080A18]/85 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2.5 z-20">
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveModalItem(item);
                            }}
                            className="w-full py-2 px-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:from-[#6D28D9] hover:to-[#4F46E5] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            <span>В библиотеку</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAddToListMedia(item);
                            }}
                            className="w-full py-2 px-2.5 rounded-xl bg-[#151932] hover:bg-[#191D38] text-[#CBD5E1] hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 border border-[#1E2442] transition-colors cursor-pointer"
                          >
                            <Bookmark className="w-3.5 h-3.5 text-[#A78BFA]" />
                            <span>В список</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Card Meta & Ratings Block */}
                    <div
                      onClick={() => handleItemClick(item)}
                      className="p-3 space-y-2 bg-[#0B0D20] flex-1 flex flex-col justify-between"
                    >
                      <div>
                        <h3
                          className="font-bold text-sm text-[#F8FAFC] group-hover:text-[#A78BFA] transition-colors line-clamp-2 min-h-[2.5rem] leading-snug"
                          title={item.title}
                        >
                          {item.title}
                        </h3>

                        <div className="flex items-center justify-between text-xs text-[#94A3B8] font-mono mt-1.5">
                          <span>{item.year || '—'}</span>
                          {item.genres && item.genres[0] && (
                            <span className="truncate max-w-[90px] text-[#64748B]">
                              {item.genres[0]}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Dodik Tracker Rating & User Rating Display */}
                      <div className="pt-2 border-t border-[#1E2442]/60 space-y-1.5">
                        {/* Dodik Tracker Rating (⭐ 8.7 124 оценки) */}
                        {dodikRating && dodikRating > 0 ? (
                          <div className="flex items-center justify-between text-xs font-mono text-[#CBD5E1]">
                            <span className="text-amber-400 font-bold flex items-center gap-1">
                              ⭐ {typeof dodikRating === 'number' ? dodikRating.toFixed(1) : dodikRating}
                            </span>
                            {dodikVotes > 0 && (
                              <span className="text-[10px] text-[#64748B]">
                                {dodikVotes} {dodikVotes === 1 ? 'оценка' : dodikVotes < 5 ? 'оценки' : 'оценок'}
                              </span>
                            )}
                          </div>
                        ) : null}

                        {/* My Rating / Rate Action */}
                        <div>
                          {userRating ? (
                            <div className="w-full py-1 px-2 rounded-lg bg-amber-400/10 border border-amber-400/30 text-xs font-mono font-bold text-amber-300 flex items-center justify-between">
                              <span>Моя оценка:</span>
                              <span className="text-amber-400">{userRating}/10</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setQuickRateItem(item);
                              }}
                              className="w-full py-1.5 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-xs font-semibold text-[#A78BFA] hover:text-white border border-[#1E2442] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Star className="w-3.5 h-3.5 text-amber-400" />
                              <span>Оценить</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !isLoading && (
            <EmptyState
              icon={<Search className="w-8 h-8 text-[#8B5CF6]" />}
              title="Ничего не найдено в каталоге"
              description="Попробуйте изменить поисковый запрос, сбросить фильтры или выбрать другую категорию."
              actionText="Сбросить фильтры"
              onAction={handleResetFilters}
            />
          )}

          {/* Infinite Scroll trigger element */}
          <div ref={observerTarget} className="h-6 w-full" />

          {/* Loading More Indicator */}
          {isLoadingMore && (
            <div className="py-6 flex items-center justify-center gap-2 text-xs text-[#94A3B8] font-mono">
              <Loader2 className="w-4 h-4 text-[#8B5CF6] animate-spin" />
              <span>Загрузка следующей страницы...</span>
            </div>
          )}

          {/* Manual Load More Button fallback */}
          {hasMore && !isLoading && !isLoadingMore && (
            <div className="pt-4 flex justify-center">
              <SecondaryButton
                onClick={() => executeFetch(page + 1, true)}
                size="md"
                icon={<Plus className="w-4 h-4 text-[#A78BFA]" />}
              >
                Загрузить ещё тайтлы
              </SecondaryButton>
            </div>
          )}
        </div>
      </div>

      {/* Add To Library Modal */}
      {activeModalItem && (
        <AddToLibraryModal
          mediaItem={activeModalItem}
          onClose={() => setActiveModalItem(null)}
        />
      )}

      {/* Add To Custom List Modal */}
      {addToListMedia && (
        <AddToListModal
          media={{
            id: addToListMedia.mediaId || addToListMedia.id,
            mediaId: addToListMedia.mediaId || addToListMedia.id,
            title: addToListMedia.title,
            type: addToListMedia.type || selectedType,
            posterUrl: addToListMedia.posterUrl,
            year: addToListMedia.year,
            rating: addToListMedia.rating,
            provider: addToListMedia.provider,
            externalId: addToListMedia.externalId,
          }}
          onClose={() => setAddToListMedia(null)}
          onAdded={() => setAddToListMedia(null)}
        />
      )}

      {/* Quick Rating Modal */}
      {quickRateItem && (
        <QuickRatingModal
          mediaItem={quickRateItem}
          onClose={() => setQuickRateItem(null)}
          onSuccess={(rating, dodikData) => handleRatingSuccess(quickRateItem, rating, dodikData)}
        />
      )}
    </div>
  );
};
