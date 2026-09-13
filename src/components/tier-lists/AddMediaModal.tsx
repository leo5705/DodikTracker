import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Search,
  Plus,
  Check,
  Loader2,
  Film,
  Gamepad2,
  Tv,
  BookOpen,
  Sparkles,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface AddMediaModalProps {
  category: string; // 'MOVIES_TV' | 'GAME' | 'ANIME' | 'MANGA' | 'BOOK' | 'COMIC' | 'ALL'
  existingMediaIds: number[];
  onClose: () => void;
  onAddMedia: (media: {
    id: number;
    title: string;
    type: string;
    posterUrl?: string;
    year?: number;
  }) => void;
}

const CATEGORY_NAMES: Record<string, string> = {
  MOVIES_TV: 'Фильмы и сериалы',
  MOVIE_TV: 'Фильмы и сериалы',
  FILMS_SERIES: 'Фильмы и сериалы',
  GAME: 'Игры',
  GAMES: 'Игры',
  ANIME: 'Аниме',
  MANGA: 'Манга',
  BOOK: 'Книги',
  BOOKS: 'Книги',
  COMIC: 'Комиксы',
  COMICS: 'Комиксы',
};

export const AddMediaModal: React.FC<AddMediaModalProps> = ({
  category,
  existingMediaIds,
  onClose,
  onAddMedia,
}) => {
  const { authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<'search' | 'library'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [libraryItems, setLibraryItems] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [addingId, setAddingId] = useState<string | number | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set(existingMediaIds));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const categoryLabel = CATEGORY_NAMES[category.toUpperCase()] || category;

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Debounced search with AbortController
  useEffect(() => {
    if (activeTab !== 'search') return;

    const trimmed = searchQuery.trim();

    // Abort previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      setErrorMessage(null);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(async () => {
      setSearching(true);
      setErrorMessage(null);

      try {
        const queryParams = new URLSearchParams({
          q: trimmed,
          category: category,
          limit: '25',
        });

        const res = await authFetch(`/api/search?${queryParams.toString()}`, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (res.ok) {
          const data = await res.json();
          if (!controller.signal.aborted) {
            setSearchResults(Array.isArray(data) ? data : []);
          }
        } else {
          if (!controller.signal.aborted) {
            setSearchResults([]);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          // Expected on abort; do not show error
          return;
        }
        console.error('Search error in AddMediaModal:', err);
        setErrorMessage('Ошибка при выполнении поиска');
        setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, category, activeTab, authFetch]);

  // Load User Library for this category
  useEffect(() => {
    if (activeTab !== 'library') return;

    const loadLibrary = async () => {
      setLoadingLibrary(true);
      setErrorMessage(null);
      try {
        const res = await authFetch('/api/library');
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];

          // Filter library items by category
          const filtered = list.filter((item: any) => {
            const itemType = (item.type || '').toUpperCase();
            const cat = category.toUpperCase();
            if (cat === 'MOVIES_TV' || cat === 'MOVIE_TV' || cat === 'FILMS_SERIES') {
              return itemType === 'MOVIE' || itemType === 'TV';
            }
            if (cat === 'GAME' || cat === 'GAMES') return itemType === 'GAME';
            if (cat === 'ANIME') return itemType === 'ANIME';
            if (cat === 'MANGA') return itemType === 'MANGA';
            if (cat === 'BOOK' || cat === 'BOOKS') return itemType === 'BOOK';
            if (cat === 'COMIC' || cat === 'COMICS') return itemType === 'COMIC';
            return itemType === cat;
          });

          setLibraryItems(filtered);
        }
      } catch (err: any) {
        console.error('Failed to load library:', err);
        setErrorMessage('Не удалось загрузить библиотеку');
      } finally {
        setLoadingLibrary(false);
      }
    };

    loadLibrary();
  }, [activeTab, category]);

  // Handle adding an item to the tier list
  const handleSelectMedia = async (item: any) => {
    setErrorMessage(null);
    const key = item.mediaId || item.id || item.externalId;
    setAddingId(key);

    try {
      let resolvedId = item.mediaId || (typeof item.id === 'number' ? item.id : null);

      // If item is from external provider, ensure it in DB
      if (!resolvedId || resolvedId < 0 || item.provider !== 'DODIK_DB') {
        const ensureRes = await authFetch('/api/media/ensure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaId: resolvedId || undefined,
            mediaPayload: {
              title: item.title,
              originalTitle: item.originalTitle,
              type: item.type,
              posterUrl: item.posterUrl,
              backdropUrl: item.backdropUrl,
              year: item.year,
              rating: item.rating,
              provider: item.provider,
              externalId: item.externalId,
              description: item.description,
            },
          }),
        });

        if (ensureRes.ok) {
          const data = await ensureRes.json();
          if (data.media?.id) {
            resolvedId = data.media.id;
          }
        }
      }

      if (!resolvedId) {
        throw new Error('Не удалось подготовить запись медиа');
      }

      onAddMedia({
        id: resolvedId,
        title: item.title,
        type: item.type,
        posterUrl: item.posterUrl,
        year: item.year,
      });

      setAddedIds((prev) => new Set([...prev, resolvedId]));
    } catch (err: any) {
      console.error('Error selecting media:', err);
      setErrorMessage(err.message || 'Ошибка при добавлении медиа');
    } finally {
      setAddingId(null);
    }
  };

  const getMediaIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'MOVIE':
      case 'TV':
        return <Film className="w-3.5 h-3.5" />;
      case 'GAME':
        return <Gamepad2 className="w-3.5 h-3.5" />;
      case 'BOOK':
      case 'COMIC':
      case 'MANGA':
        return <BookOpen className="w-3.5 h-3.5" />;
      default:
        return <Sparkles className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl rounded-3xl bg-[#14131A] border border-[#252233] p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#252233]">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-fuchsia-950/80 border border-fuchsia-800/50 text-[11px] font-semibold text-fuchsia-300 font-mono">
                <Layers className="w-3 h-3" />
                {categoryLabel}
              </span>
              <span className="text-[11px] text-[#9A94AA]">Категория заблокирована</span>
            </div>
            <h2 className="text-xl font-bold text-[#F3F1F8] font-mono mt-1">
              Добавить медиа в тир-лист
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#1E1C29] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-[#252233] pb-3">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold font-mono transition-all ${
              activeTab === 'search'
                ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-950/40'
                : 'bg-[#191724] text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#1F1C2E]'
            }`}
          >
            🔍 Поиск по базе
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold font-mono transition-all ${
              activeTab === 'library'
                ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-950/40'
                : 'bg-[#191724] text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#1F1C2E]'
            }`}
          >
            📚 Из моей библиотеки ({categoryLabel})
          </button>
        </div>

        {/* Search Bar (if search tab) */}
        {activeTab === 'search' && (
          <div className="relative">
            <Search className="w-4 h-4 text-[#9A94AA] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Поиск в категории "${categoryLabel}"...`}
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#191724] border border-[#252233] text-sm text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-fuchsia-500 transition-colors"
            />
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content Container */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-[260px]">
          {activeTab === 'search' ? (
            searching ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-2 text-[#9A94AA]">
                <Loader2 className="w-7 h-7 text-fuchsia-400 animate-spin" />
                <span className="text-xs font-mono">Поиск в категории {categoryLabel}...</span>
              </div>
            ) : searchQuery.trim() && searchResults.length === 0 ? (
              <div className="py-16 text-center space-y-2 text-[#9A94AA]">
                <p className="text-xs font-mono">Ничего не найдено в категории «{categoryLabel}»</p>
                <p className="text-[11px] text-[#6B667B]">
                  Убедитесь, что название написано правильно
                </p>
              </div>
            ) : !searchQuery.trim() ? (
              <div className="py-16 text-center space-y-2 text-[#6B667B]">
                <Search className="w-8 h-8 mx-auto text-[#2E2A40]" />
                <p className="text-xs font-mono">
                  Введите название для поиска в категории «{categoryLabel}»
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {searchResults.map((item, idx) => {
                  const itemKey = item.mediaId || item.id || `${item.provider}-${item.externalId}` || idx;
                  const isAlreadyAdded =
                    (item.mediaId && addedIds.has(item.mediaId)) ||
                    (item.id && typeof item.id === 'number' && addedIds.has(item.id));
                  const isCurrentlyAdding = addingId === (item.mediaId || item.id || item.externalId);

                  return (
                    <div
                      key={itemKey}
                      className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#191724] border border-[#252233] hover:border-[#38334D] transition-colors group"
                    >
                      <div className="w-12 h-16 rounded-lg overflow-hidden bg-[#201D2C] shrink-0 border border-[#2E2A40]">
                        {item.posterUrl ? (
                          <img
                            src={item.posterUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#6B667B]">
                            {getMediaIcon(item.type)}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-[#F3F1F8] truncate group-hover:text-fuchsia-300 transition-colors">
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-[#9A94AA] mt-0.5">
                          <span>{item.year || '—'}</span>
                          <span>•</span>
                          <span className="uppercase text-[10px] text-fuchsia-400 font-mono">
                            {item.type}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleSelectMedia(item)}
                        disabled={isAlreadyAdded || isCurrentlyAdding}
                        className={`p-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                          isAlreadyAdded
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 cursor-default'
                            : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-md'
                        } disabled:opacity-60`}
                      >
                        {isCurrentlyAdding ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isAlreadyAdded ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : loadingLibrary ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-2 text-[#9A94AA]">
              <Loader2 className="w-7 h-7 text-fuchsia-400 animate-spin" />
              <span className="text-xs font-mono">Загрузка библиотеки...</span>
            </div>
          ) : libraryItems.length === 0 ? (
            <div className="py-16 text-center space-y-2 text-[#9A94AA]">
              <p className="text-xs font-mono">В вашей библиотеке нет тайтлов категории «{categoryLabel}»</p>
              <p className="text-[11px] text-[#6B667B]">
                Воспользуйтесь вкладкой «Поиск по базе», чтобы найти нужный тайтл
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {libraryItems.map((item) => {
                const isAlreadyAdded = addedIds.has(item.mediaId);
                const isCurrentlyAdding = addingId === item.mediaId;

                return (
                  <div
                    key={item.mediaId}
                    className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#191724] border border-[#252233] hover:border-[#38334D] transition-colors group"
                  >
                    <div className="w-12 h-16 rounded-lg overflow-hidden bg-[#201D2C] shrink-0 border border-[#2E2A40]">
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#6B667B]">
                          {getMediaIcon(item.type)}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-[#F3F1F8] truncate group-hover:text-fuchsia-300 transition-colors">
                        {item.title}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] text-[#9A94AA] mt-0.5">
                        <span>{item.year || '—'}</span>
                        <span>•</span>
                        <span className="uppercase text-[10px] text-fuchsia-400 font-mono">
                          {item.type}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectMedia(item)}
                      disabled={isAlreadyAdded || isCurrentlyAdding}
                      className={`p-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                        isAlreadyAdded
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 cursor-default'
                          : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-md'
                      } disabled:opacity-60`}
                    >
                      {isCurrentlyAdding ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isAlreadyAdded ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[#252233]">
          <span className="text-xs text-[#9A94AA] font-mono">
            Добавлено в тир-лист: {addedIds.size}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-semibold font-mono shadow-md transition-all"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
