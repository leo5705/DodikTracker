import React, { useState, useEffect } from 'react';
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
  Dices,
  Bookmark,
} from 'lucide-react';
import { AddToLibraryModal } from '../modals/AddToLibraryModal.tsx';
import { AddToListModal } from '../modals/AddToListModal.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { formatMediaTypePath } from '../../utils/formatters.ts';

interface SearchViewProps {
  onSelectMedia?: (mediaId?: number, mediaData?: any) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({ onSelectMedia }) => {
  const { navigate } = useRouter();
  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [results, setResults] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [activeModalItem, setActiveModalItem] = useState<any | null>(null);
  const [addToListMedia, setAddToListMedia] = useState<any | null>(null);

  const categories = [
    { id: 'ALL', label: 'Все категории', icon: Sparkles },
    { id: 'MOVIE', label: 'Фильмы', icon: Film },
    { id: 'TV', label: 'Сериалы', icon: Tv },
    { id: 'ANIME', label: 'Аниме', icon: Sparkles },
    { id: 'MANGA', label: 'Манга', icon: BookOpen },
    { id: 'GAME', label: 'Игры', icon: Gamepad2 },
    { id: 'BOOK', label: 'Книги', icon: Book },
    { id: 'COMIC', label: 'Комиксы', icon: Flame },
    { id: 'BOARD_GAME', label: 'Настолки', icon: Dices },
  ];

  // Fetch trending on mount
  useEffect(() => {
    const fetchTrending = async () => {
      setTrendingLoading(true);
      try {
        const type = selectedType === 'ALL' ? 'MOVIE' : selectedType;
        const res = await fetch(`/api/media/trending?type=${type}`);
        if (res.ok) {
          const data = await res.json();
          setTrending(data);
        }
      } catch (err) {
        console.error('Failed to fetch trending:', err);
      } finally {
        setTrendingLoading(false);
      }
    };
    fetchTrending();
  }, [selectedType]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const typeParam = selectedType !== 'ALL' ? `&type=${selectedType}` : '';
        const res = await fetch(`/api/media/search?q=${encodeURIComponent(query)}${typeParam}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, selectedType]);

  const displayList = query.trim() ? results : trending;

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

  return (
    <div className="space-y-6 pb-12">
      {/* Search Header & Input */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-100 font-mono tracking-tight">
            ПОИСК И КАТАЛОГ
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Поиск фильмов, сериалов, аниме, игр и книг через официальные провайдеры (TMDB, AniList, RAWG, OpenLibrary)
          </p>
        </div>

        {/* Input bar */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            id="global-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Введите название фильма, сериала, игры, аниме или книги..."
            className="w-full pl-12 pr-10 py-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500/80 focus:ring-2 focus:ring-purple-500/20 transition-all shadow-inner"
          />
          {loading && (
            <Loader2 className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-purple-400 animate-spin" />
          )}
        </div>

        {/* Categories Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedType === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedType(cat.id)}
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
      </div>

      {/* Results Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 font-mono">
            {query.trim() ? (
              <>
                <span>Результаты поиска</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                  {results.length}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Популярное & Тренды</span>
              </>
            )}
          </h2>
        </div>

        {/* Loading state */}
        {loading || (trendingLoading && !query.trim()) ? (
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
        ) : displayList.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {displayList.map((item, idx) => (
              <div
                key={`${item.provider || 'ext'}-${item.externalId || idx}`}
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
                      {item.rating}
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
        ) : (
          /* Empty state */
          <div className="py-16 text-center space-y-3 bg-zinc-900/30 rounded-2xl border border-zinc-800/60 p-8">
            <div className="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-400">
              <Film className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-200">Ничего не найдено</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              По запросу «{query}» не найдено результатов. Проверьте правильность написания или статус подключения API в админ-панели.
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {activeModalItem && (
        <AddToLibraryModal
          mediaItem={activeModalItem}
          onClose={() => setActiveModalItem(null)}
          onAdded={() => {
            // Optional callback
          }}
        />
      )}

      {/* Add To List Modal */}
      {addToListMedia && (
        <AddToListModal
          media={addToListMedia}
          onClose={() => setAddToListMedia(null)}
        />
      )}
    </div>
  );
};
