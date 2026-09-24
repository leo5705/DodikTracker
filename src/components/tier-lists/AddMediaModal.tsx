import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Search,
  Plus,
  Check,
  Loader2,
  Film,
  Gamepad2,
  BookOpen,
  Sparkles,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { PrimaryButton, SecondaryButton } from '../design-system/index.ts';

interface AddMediaModalProps {
  category: string;
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

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'search') return;

    const trimmed = searchQuery.trim();

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
        const res = await authFetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&type=${encodeURIComponent(category)}`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || data || []);
        } else {
          setErrorMessage('Ошибка при поиске');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setErrorMessage('Не удалось выполнить поиск');
        }
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, category, activeTab]);

  useEffect(() => {
    if (activeTab !== 'library') return;

    const loadLibrary = async () => {
      setLoadingLibrary(true);
      try {
        const res = await authFetch(`/api/library?category=${encodeURIComponent(category)}`);
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : data.items || [];
          setLibraryItems(items);
        }
      } catch (err) {
        console.error('Failed to load library items:', err);
      } finally {
        setLoadingLibrary(false);
      }
    };

    loadLibrary();
  }, [activeTab, category]);

  const handleSelectMedia = async (mediaItem: any) => {
    const targetId = mediaItem.mediaId || mediaItem.id;
    setAddingId(targetId);

    try {
      onAddMedia({
        id: targetId,
        title: mediaItem.title,
        type: mediaItem.type,
        posterUrl: mediaItem.posterUrl,
        year: mediaItem.year,
      });
      setAddedIds((prev) => new Set([...prev, targetId]));
    } catch (err) {
      console.error('Add media error:', err);
    } finally {
      setAddingId(null);
    }
  };

  const getMediaIcon = (type?: string) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl rounded-3xl bg-[#0B0D20] border border-[#1E2442] p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#1E2442]">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#151932] border border-[#1E2442] text-[11px] font-semibold text-[#A78BFA] font-mono">
                <Layers className="w-3 h-3 text-[#8B5CF6]" />
                {categoryLabel}
              </span>
              <span className="text-[11px] text-[#64748B]">Категория тир-листа</span>
            </div>
            <h2 className="text-xl font-bold text-[#F8FAFC] tracking-tight mt-1">
              Добавить медиа в тир-лист
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-[#1E2442] pb-3">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'search'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
                : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] border border-[#1E2442]'
            }`}
          >
            🔍 Поиск по базе
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'library'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
                : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] border border-[#1E2442]'
            }`}
          >
            📚 Из моей библиотеки ({categoryLabel})
          </button>
        </div>

        {/* Search Bar (if search tab) */}
        {activeTab === 'search' && (
          <div className="relative">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Поиск в категории "${categoryLabel}"...`}
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] transition-colors"
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
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar min-h-[260px]">
          {activeTab === 'search' ? (
            searching ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-2 text-[#94A3B8]">
                <Loader2 className="w-7 h-7 text-[#8B5CF6] animate-spin" />
                <span className="text-xs font-mono">Поиск в категории {categoryLabel}...</span>
              </div>
            ) : searchQuery.trim() && searchResults.length === 0 ? (
              <div className="py-16 text-center space-y-2 text-[#94A3B8]">
                <p className="text-xs font-mono">Ничего не найдено в категории «{categoryLabel}»</p>
                <p className="text-[11px] text-[#64748B]">
                  Убедитесь, что название написано правильно
                </p>
              </div>
            ) : !searchQuery.trim() ? (
              <div className="py-16 text-center space-y-2 text-[#64748B]">
                <Search className="w-8 h-8 mx-auto text-[#1E2442]" />
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
                      className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-colors group"
                    >
                      <div className="w-12 h-16 rounded-xl overflow-hidden bg-[#151932] shrink-0 border border-[#1E2442]">
                        {item.posterUrl ? (
                          <img
                            src={item.posterUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#64748B]">
                            {getMediaIcon(item.type)}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-[#F8FAFC] truncate group-hover:text-[#A78BFA] transition-colors">
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-[#94A3B8] mt-0.5">
                          <span>{item.year || '—'}</span>
                          <span>•</span>
                          <span className="uppercase text-[10px] text-[#A78BFA] font-mono">
                            {item.type}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleSelectMedia(item)}
                        disabled={isAlreadyAdded || isCurrentlyAdding}
                        className={`p-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                          isAlreadyAdded
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 cursor-default'
                            : 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white shadow-md'
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
            <div className="py-16 flex flex-col items-center justify-center space-y-2 text-[#94A3B8]">
              <Loader2 className="w-7 h-7 text-[#8B5CF6] animate-spin" />
              <span className="text-xs font-mono">Загрузка библиотеки...</span>
            </div>
          ) : libraryItems.length === 0 ? (
            <div className="py-16 text-center space-y-2 text-[#94A3B8]">
              <p className="text-xs font-mono">В вашей библиотеке нет тайтлов категории «{categoryLabel}»</p>
              <p className="text-[11px] text-[#64748B]">
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
                    className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-colors group"
                  >
                    <div className="w-12 h-16 rounded-xl overflow-hidden bg-[#151932] shrink-0 border border-[#1E2442]">
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#64748B]">
                          {getMediaIcon(item.type)}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-[#F8FAFC] truncate group-hover:text-[#A78BFA] transition-colors">
                        {item.title}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] text-[#94A3B8] mt-0.5">
                        <span>{item.year || '—'}</span>
                        <span>•</span>
                        <span className="uppercase text-[10px] text-[#A78BFA] font-mono">
                          {item.type}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectMedia(item)}
                      disabled={isAlreadyAdded || isCurrentlyAdding}
                      className={`p-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                        isAlreadyAdded
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 cursor-default'
                          : 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white shadow-md'
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
        <div className="flex items-center justify-between pt-3 border-t border-[#1E2442]">
          <span className="text-xs text-[#94A3B8] font-mono">
            Добавлено в тир-лист: {addedIds.size}
          </span>
          <PrimaryButton onClick={onClose}>
            Готово
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
};
