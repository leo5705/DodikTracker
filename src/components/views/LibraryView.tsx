import React, { useState, useEffect } from 'react';
import {
  Library,
  Star,
  Heart,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  PlayCircle,
  Clock,
  Ban,
  Film,
  Tv,
  Gamepad2,
  Book,
  Sparkles,
  Loader2,
  Download,
  Upload,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { formatMediaTypePath } from '../../utils/formatters.ts';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';

interface LibraryViewProps {
  onNavigateSearch: () => void;
  selectedCategory?: string;
  onSelectCategory?: (cat: string) => void;
  onSelectMedia?: (mediaId: number) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  onNavigateSearch,
  selectedCategory = 'ALL',
  onSelectCategory,
  onSelectMedia,
}) => {
  const { authFetch, dbUser, login } = useAuth();
  const { navigate } = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState(selectedCategory);
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  useEffect(() => {
    if (selectedCategory) {
      setSelectedType(selectedCategory);
    }
  }, [selectedCategory]);

  const categories = [
    { id: 'ALL', label: 'Все' },
    { id: 'MOVIE', label: 'Фильмы' },
    { id: 'TV', label: 'Сериалы' },
    { id: 'ANIME', label: 'Аниме' },
    { id: 'GAME', label: 'Игры' },
    { id: 'BOOK', label: 'Книги' },
    { id: 'MANGA', label: 'Манга' },
    { id: 'COMIC', label: 'Комиксы' },
  ];

  const statusFilters = [
    { id: 'ALL', label: 'Все статусы' },
    { id: 'WATCHING', label: 'В процессе' },
    { id: 'PLAN_TO_WATCH', label: 'В планах' },
    { id: 'COMPLETED', label: 'Завершено' },
    { id: 'DROPPED', label: 'Дропнуто' },
    { id: 'FAVORITES', label: 'Избранное' },
  ];

  const fetchLibrary = async () => {
    if (!dbUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let url = '/api/library?';
      if (selectedType !== 'ALL') url += `type=${selectedType}&`;
      if (selectedStatus === 'FAVORITES') {
        url += `favorite=true&`;
      } else if (selectedStatus !== 'ALL') {
        // Map simplified filter to possible actual statuses
        url += `status=${selectedStatus}&`;
      }

      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [dbUser, selectedType, selectedStatus]);

  const updateItemStatus = async (userMediaId: number, newStatus: string) => {
    try {
      const res = await authFetch(`/api/library/${userMediaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((it) => (it.userMediaId === userMediaId ? { ...it, status: newStatus } : it))
        );
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const incrementProgress = async (userMediaId: number, currentProgress: number) => {
    const nextVal = (currentProgress || 0) + 1;
    try {
      const res = await authFetch(`/api/library/${userMediaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: nextVal }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((it) => (it.userMediaId === userMediaId ? { ...it, progress: nextVal } : it))
        );
      }
    } catch (err) {
      console.error('Failed to increment progress:', err);
    }
  };

  const updateRating = async (userMediaId: number, rating: number) => {
    try {
      const res = await authFetch(`/api/library/${userMediaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((it) => (it.userMediaId === userMediaId ? { ...it, rating } : it))
        );
      }
    } catch (err) {
      console.error('Failed to update rating:', err);
    }
  };

  const toggleFavorite = async (userMediaId: number, currentFav: boolean) => {
    try {
      const res = await authFetch(`/api/library/${userMediaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: !currentFav }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((it) =>
            it.userMediaId === userMediaId ? { ...it, isFavorite: !currentFav } : it
          )
        );
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      const res = await authFetch(`/api/library/${itemToDelete}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setItems((prev) => prev.filter((it) => it.userMediaId !== itemToDelete));
        setItemToDelete(null);
      }
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return { label: 'Завершено', color: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40' };
      case 'WATCHING':
      case 'PLAYING':
      case 'READING':
        return { label: 'В процессе', color: 'bg-purple-950/60 text-purple-400 border-purple-800/40' };
      case 'DROPPED':
        return { label: 'Дропнуто', color: 'bg-red-950/60 text-red-400 border-red-800/40' };
      default:
        return { label: 'В планах', color: 'bg-zinc-800/80 text-zinc-300 border-zinc-700' };
    }
  };

  if (!dbUser) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-purple-950/60 border border-purple-800/40 flex items-center justify-center mx-auto text-purple-400 shadow-xl">
          <Library className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-zinc-100 font-mono">МОЯ БИБЛИОТЕКА</h2>
        <p className="text-xs text-zinc-400">
          Войдите через Google аккаунт, чтобы отслеживать просмотренные фильмы, серии, игры и книги.
        </p>
        <button
          onClick={() => login()}
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/30 transition-all"
        >
          Войти в аккаунт
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Controls */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-zinc-100 font-mono tracking-tight flex items-center gap-2">
              <Library className="w-6 h-6 text-purple-400" />
              МОЯ БИБЛИОТЕКА
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Все ваши медиафайлы, статус просмотра, серии и оценки
            </p>
          </div>

          <div className="flex gap-2 self-start sm:self-auto">
            <button
              onClick={() => navigate('/library/import')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold shadow-lg transition-all"
            >
              <Download className="w-4 h-4" />
              Импорт
            </button>
            <button
              onClick={() => navigate('/library/export')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold shadow-lg transition-all"
            >
              <Upload className="w-4 h-4" />
              Экспорт
            </button>
            <button
              onClick={onNavigateSearch}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-950/30 transition-all"
            >
              <Plus className="w-4 h-4" />
              Добавить тайтл
            </button>
          </div>
        </div>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedType(cat.id);
                onSelectCategory?.(cat.id);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedType === cat.id
                  ? 'bg-[#9B6BFF] text-white shadow-md shadow-purple-950/40'
                  : 'bg-[#14131A] text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#191724] border border-[#252233]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Status filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {statusFilters.map((st) => (
            <button
              key={st.id}
              onClick={() => setSelectedStatus(st.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedStatus === st.id
                  ? 'bg-zinc-800 text-purple-300 border border-purple-500/40'
                  : 'bg-zinc-900/60 text-zinc-400 hover:text-zinc-300 border border-zinc-800/80'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Library Cards */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-xs text-zinc-400">Загрузка вашей библиотеки...</p>
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => {
            const badge = getStatusBadge(item.status);
            return (
              <div
                key={item.userMediaId}
                className="rounded-2xl bg-zinc-900 border border-zinc-800/80 overflow-hidden flex flex-col justify-between hover:border-zinc-700 transition-all shadow-lg"
              >
                {/* Top Section */}
                <div className="p-3 flex gap-3">
                  {/* Poster */}
                  <div
                    onClick={() => navigate(`/media/${formatMediaTypePath(item.type)}/${item.mediaId}`)}
                    className="w-20 h-28 rounded-xl bg-zinc-950 overflow-hidden shrink-0 relative cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    {item.posterUrl ? (
                      <img
                        src={item.posterUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400 p-1 text-center">
                        Нет постера
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(item.userMediaId, item.isFavorite);
                      }}
                      className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/60 backdrop-blur-md"
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          item.isFavorite ? 'text-red-400 fill-red-400' : 'text-zinc-400'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-1">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                      <button
                        onClick={() => setItemToDelete(item.userMediaId)}
                        className="text-zinc-400 hover:text-red-400 p-1 transition-colors"
                        title="Удалить из библиотеки"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h3
                      onClick={() => navigate(`/media/${formatMediaTypePath(item.type)}/${item.mediaId}`)}
                      className="text-xs font-bold text-zinc-100 line-clamp-1 leading-snug cursor-pointer hover:text-purple-400 transition-colors"
                    >
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      {item.year || ''} {item.type}
                    </p>

                    {/* Rating stars */}
                    <div className="flex items-center gap-1 pt-1">
                      {[2, 4, 6, 8, 10].map((starVal) => {
                        const isFilled = item.rating && item.rating >= starVal;
                        return (
                          <button
                            key={starVal}
                            onClick={() => updateRating(item.userMediaId, starVal)}
                            className="text-zinc-600 hover:text-amber-400 transition-colors"
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                isFilled ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'
                              }`}
                            />
                          </button>
                        );
                      })}
                      {item.rating && (
                        <span className="text-[10px] font-bold text-amber-400 ml-1">
                          {item.rating}/10
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress / Episodes tracker (for series, anime, manga, books) */}
                <div className="px-3 py-2 bg-zinc-950/40 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>
                      Прогресс: <strong className="text-zinc-200">{item.progress || 0}</strong>
                      {item.totalEpisodes ? ` / ${item.totalEpisodes}` : ''}
                    </span>
                  </div>

                  <button
                    onClick={() => incrementProgress(item.userMediaId, item.progress || 0)}
                    className="px-2 py-0.5 rounded bg-purple-950/80 hover:bg-purple-900 border border-purple-800/50 text-purple-300 font-mono text-[11px] transition-colors"
                    title="+1 эпизод / глава"
                  >
                    +1
                  </button>
                </div>

                {/* Status Switcher Footer */}
                <div className="p-2 bg-zinc-950/80 border-t border-zinc-800/80 grid grid-cols-4 gap-1 text-[10px]">
                  {[
                    { id: 'PLAN_TO_WATCH', label: 'В план' },
                    { id: 'WATCHING', label: 'Смотрю' },
                    { id: 'COMPLETED', label: 'Готово' },
                    { id: 'DROPPED', label: 'Дроп' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => updateItemStatus(item.userMediaId, s.id)}
                      className={`py-1 rounded text-center font-medium transition-colors ${
                        item.status === s.id
                          ? 'bg-purple-600 text-white font-bold'
                          : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="py-20 text-center space-y-3 bg-zinc-900/30 rounded-2xl border border-zinc-800/60 p-8 max-w-xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-400">
            <Library className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-zinc-200 font-mono">Ваша библиотека пуста</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
            Найдите фильм, сериал, аниме или игру в каталоге, чтобы добавить их и отслеживать свой прогресс.
          </p>
          <div className="pt-2">
            <button
              onClick={onNavigateSearch}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-950/30 transition-all"
            >
              <Search className="w-4 h-4" />
              Искать медиа в каталоге
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={itemToDelete !== null}
        title="Удалить из библиотеки?"
        message="Вы действительно хотите удалить этот тайтл из своей библиотеки?"
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
        onConfirm={confirmDeleteItem}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
};
