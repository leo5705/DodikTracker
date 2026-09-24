import React, { useState, useEffect, useMemo } from 'react';
import {
  Library,
  Star,
  Heart,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  Play,
  Clock,
  Ban,
  Film,
  Tv,
  Gamepad2,
  Book,
  BookOpen,
  Sparkles,
  Loader2,
  Download,
  Upload,
  Share2,
  Grid,
  List as ListIcon,
  LayoutGrid,
  SlidersHorizontal,
  ArrowUpDown,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Edit3,
  Flame,
  Music2,
  PauseCircle,
  Bookmark,
  FolderPlus,
  MessageSquarePlus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useShare } from '../../context/ShareContext.tsx';
import { formatMediaTypePath } from '../../utils/formatters.ts';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';
import { AddToLibraryModal } from '../modals/AddToLibraryModal.tsx';
import { AddToListModal } from '../modals/AddToListModal.tsx';
import { ContentReviewModal } from '../content/ContentReviewModal.tsx';
import {
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  EmptyState,
  StatusBadge,
  RatingBadge,
  CategoryBadge,
} from '../design-system/index.ts';

interface LibraryViewProps {
  onNavigateSearch: () => void;
  selectedCategory?: string;
  onSelectCategory?: (cat: string) => void;
  onSelectMedia?: (mediaId: number) => void;
}

type ViewMode = 'grid' | 'compact' | 'list';
type SortOption = 'updated_desc' | 'title_asc' | 'title_desc' | 'rating_desc' | 'year_desc' | 'progress_desc';

export const LibraryView: React.FC<LibraryViewProps> = ({
  onNavigateSearch,
  selectedCategory = 'ALL',
  onSelectCategory,
  onSelectMedia,
}) => {
  const { authFetch, dbUser, login } = useAuth();
  const { navigate } = useRouter();
  const { openCompletionModal, openShareModal } = useShare();

  // Core Data
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Controls
  const [selectedType, setSelectedType] = useState(selectedCategory);
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated_desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = viewMode === 'list' ? 30 : 24;

  // Modals
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [listModalItem, setListModalItem] = useState<any | null>(null);
  const [reviewModalItem, setReviewModalItem] = useState<any | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedCategory) {
      setSelectedType(selectedCategory);
    }
  }, [selectedCategory]);

  // Categories list with icons
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

  // Dynamic Status Filters based on Category
  const getStatusFiltersForCategory = (type: string) => {
    if (type === 'GAME') {
      return [
        { id: 'ALL', label: 'Все' },
        { id: 'PLAN_TO_PLAY', label: 'Хочу сыграть' },
        { id: 'PLAYING', label: 'Играю / Прохожу' },
        { id: 'COMPLETED', label: 'Пройдено' },
        { id: 'ON_HOLD', label: 'На паузе' },
        { id: 'DROPPED', label: 'Дропнул' },
        { id: 'FAVORITES', label: 'Избранное' },
      ];
    }
    if (type === 'BOOK' || type === 'MANGA' || type === 'COMIC') {
      return [
        { id: 'ALL', label: 'Все' },
        { id: 'PLAN_TO_READ', label: 'Хочу прочитать' },
        { id: 'READING', label: 'Читаю' },
        { id: 'COMPLETED', label: 'Прочитано' },
        { id: 'ON_HOLD', label: 'На паузе' },
        { id: 'DROPPED', label: 'Дропнул' },
        { id: 'FAVORITES', label: 'Избранное' },
      ];
    }
    if (type === 'MOVIE' || type === 'TV' || type === 'ANIME') {
      return [
        { id: 'ALL', label: 'Все' },
        { id: 'PLAN_TO_WATCH', label: 'Хочу посмотреть' },
        { id: 'WATCHING', label: 'Смотрю' },
        { id: 'COMPLETED', label: 'Посмотрел' },
        { id: 'ON_HOLD', label: 'На паузе' },
        { id: 'DROPPED', label: 'Дропнул' },
        { id: 'FAVORITES', label: 'Избранное' },
      ];
    }
    if (type === 'MUSIC') {
      return [
        { id: 'ALL', label: 'Все' },
        { id: 'PLAN_TO_LISTEN', label: 'Хочу послушать' },
        { id: 'LISTENING', label: 'Слушаю' },
        { id: 'COMPLETED', label: 'Прослушано' },
        { id: 'ON_HOLD', label: 'На паузе' },
        { id: 'DROPPED', label: 'Дропнул' },
        { id: 'FAVORITES', label: 'Избранное' },
      ];
    }
    // Default for ALL
    return [
      { id: 'ALL', label: 'Все статусы' },
      { id: 'IN_PROGRESS', label: 'В процессе' },
      { id: 'PLANNED', label: 'В планах' },
      { id: 'COMPLETED', label: 'Завершено' },
      { id: 'ON_HOLD', label: 'На паузе' },
      { id: 'DROPPED', label: 'Дропнуто' },
      { id: 'FAVORITES', label: 'Избранное' },
    ];
  };

  const handleReviewSubmit = async (data: {
    title: string | null;
    content: string;
    score: number | null;
    containsSpoilers: boolean;
  }) => {
    if (!reviewModalItem) return;
    try {
      await authFetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: reviewModalItem.mediaId || reviewModalItem.id,
          title: data.title,
          content: data.content,
          score: data.score,
          containsSpoilers: data.containsSpoilers,
        }),
      });
      setReviewModalItem(null);
    } catch (err) {
      console.error('Failed to submit review:', err);
    }
  };

  const statusFilters = useMemo(
    () => getStatusFiltersForCategory(selectedType),
    [selectedType]
  );

  // Fetch Full Library Data
  const fetchLibrary = async () => {
    if (!dbUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch('/api/library');
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [dbUser]);

  // Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedType, selectedStatus, searchQuery, sortBy]);

  // Update Status
  const updateItemStatus = async (userMediaId: number, newStatus: string) => {
    setUpdatingId(userMediaId);
    try {
      const res = await authFetch(`/api/library/${userMediaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const itemObj = items.find((it) => it.userMediaId === userMediaId);
        setItems((prev) =>
          prev.map((it) => (it.userMediaId === userMediaId ? { ...it, status: newStatus } : it))
        );

        if (newStatus === 'COMPLETED' && itemObj) {
          openCompletionModal({
            mediaId: itemObj.mediaId,
            title: itemObj.title,
            type: itemObj.type,
            posterUrl: itemObj.posterUrl,
            rating: itemObj.rating || null,
          });
        }
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Increment Progress
  const incrementProgress = async (userMediaId: number, currentProgress: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nextVal = (currentProgress || 0) + 1;
    setUpdatingId(userMediaId);
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
    } finally {
      setUpdatingId(null);
    }
  };

  // Update Rating
  const updateRating = async (userMediaId: number, rating: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  // Toggle Favorite
  const toggleFavorite = async (userMediaId: number, currentFav: boolean, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  // Confirm Delete
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

  // Overall Statistics calculated from real library items
  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((it) => it.status === 'COMPLETED').length;
    const inProgress = items.filter((it) =>
      ['WATCHING', 'PLAYING', 'READING'].includes(it.status)
    ).length;
    const planned = items.filter((it) =>
      ['PLAN_TO_WATCH', 'PLAN_TO_PLAY', 'PLAN_TO_READ', 'PLANNED'].includes(it.status)
    ).length;
    const dropped = items.filter((it) => it.status === 'DROPPED').length;
    const favorites = items.filter((it) => it.isFavorite).length;

    // Counts per category
    const categoryCounts: Record<string, number> = {};
    for (const it of items) {
      const t = it.type || 'MOVIE';
      categoryCounts[t] = (categoryCounts[t] || 0) + 1;
    }

    return { total, completed, inProgress, planned, dropped, favorites, categoryCounts };
  }, [items]);

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Category filter
      if (selectedType !== 'ALL' && item.type !== selectedType) {
        return false;
      }

      // Status filter
      if (selectedStatus === 'FAVORITES') {
        if (!item.isFavorite) return false;
      } else if (selectedStatus === 'IN_PROGRESS') {
        if (!['WATCHING', 'PLAYING', 'READING'].includes(item.status)) return false;
      } else if (selectedStatus === 'PLANNED') {
        if (!['PLAN_TO_WATCH', 'PLAN_TO_PLAY', 'PLAN_TO_READ', 'PLANNED'].includes(item.status)) return false;
      } else if (selectedStatus !== 'ALL') {
        if (item.status !== selectedStatus) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = (item.title || '').toLowerCase().includes(q);
        const matchOrig = (item.originalTitle || '').toLowerCase().includes(q);
        if (!matchTitle && !matchOrig) return false;
      }

      return true;
    }).sort((a, b) => {
      switch (sortBy) {
        case 'title_asc':
          return (a.title || '').localeCompare(b.title || '');
        case 'title_desc':
          return (b.title || '').localeCompare(a.title || '');
        case 'rating_desc':
          return (b.rating || 0) - (a.rating || 0);
        case 'year_desc':
          return (b.year || 0) - (a.year || 0);
        case 'progress_desc':
          return (b.progress || 0) - (a.progress || 0);
        case 'updated_desc':
        default:
          return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      }
    });
  }, [items, selectedType, selectedStatus, searchQuery, sortBy]);

  // Paginated chunk
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  if (!dbUser) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-center mx-auto text-[#8B5CF6] shadow-xl">
          <Library className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[#F8FAFC]">МОЯ БИБЛИОТЕКА</h2>
        <p className="text-xs text-[#94A3B8]">
          Войдите через аккаунт, чтобы отслеживать прогресс фильмов, сериалов, аниме, игр, книг и манги.
        </p>
        <PrimaryButton onClick={() => login()} size="md">
          Войти в аккаунт
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* 1. TOP HEADER & BREAKDOWN STATS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#1E2442]">
        <div className="space-y-2.5">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#F8FAFC]">
            Моя библиотека
          </h1>
          {/* Subtitle stats: Всего, В процессе, Завершено, Дропнуто */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <div className="px-3 py-1 rounded-xl bg-[#0B0D20] border border-[#1E2442] flex items-center gap-1.5 font-mono">
              <span className="text-[#94A3B8]">Всего:</span>
              <strong className="text-[#F8FAFC] font-bold tabular-nums">{stats.total}</strong>
            </div>
            <div className="px-3 py-1 rounded-xl bg-[#0B0D20] border border-[#1E2442] flex items-center gap-1.5 font-mono">
              <span className="text-[#A78BFA]">В процессе:</span>
              <strong className="text-[#F8FAFC] font-bold tabular-nums">{stats.inProgress}</strong>
            </div>
            <div className="px-3 py-1 rounded-xl bg-[#0B0D20] border border-[#1E2442] flex items-center gap-1.5 font-mono">
              <span className="text-emerald-400">Завершено:</span>
              <strong className="text-[#F8FAFC] font-bold tabular-nums">{stats.completed}</strong>
            </div>
            <div className="px-3 py-1 rounded-xl bg-[#0B0D20] border border-[#1E2442] flex items-center gap-1.5 font-mono">
              <span className="text-rose-400">Дропнуто:</span>
              <strong className="text-[#F8FAFC] font-bold tabular-nums">{stats.dropped}</strong>
            </div>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <SecondaryButton
            onClick={() => navigate('/library/import')}
            size="sm"
            icon={<Download className="w-3.5 h-3.5 text-[#A78BFA]" />}
          >
            Импорт
          </SecondaryButton>
          <SecondaryButton
            onClick={() => navigate('/library/export')}
            size="sm"
            icon={<Upload className="w-3.5 h-3.5 text-[#A78BFA]" />}
          >
            Экспорт
          </SecondaryButton>
          <PrimaryButton
            onClick={onNavigateSearch}
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Добавить тайтл
          </PrimaryButton>
        </div>
      </div>

      {/* 2. CATEGORY NAVIGATION (Dark Pills / Cards) */}
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const count = cat.id === 'ALL' ? stats.total : (stats.categoryCounts[cat.id] || 0);
            const isSelected = selectedType === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedType(cat.id);
                  onSelectCategory?.(cat.id);
                  setSelectedStatus('ALL');
                }}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-lg shadow-[#7C3AED]/25 border border-violet-400/30'
                    : 'bg-[#0B0D20] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#11152A] border border-[#1E2442]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-[#8B5CF6]'}`} />
                <span>{cat.label}</span>
                {count > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-md font-mono text-xs tabular-nums ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-[#151932] text-[#94A3B8] border border-[#1E2442]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 3. STATUS FILTERS (Category-Aware) */}
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {statusFilters.map((st) => {
            const isSelected = selectedStatus === st.id;
            return (
              <button
                key={st.id}
                onClick={() => setSelectedStatus(st.id)}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-[#151932] text-[#F8FAFC] border border-[#8B5CF6]/60 shadow-sm'
                    : 'bg-[#080A18] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B0D20] border border-[#1E2442]'
                }`}
              >
                {st.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. CONTROLS BAR: SEARCH, SORT & VIEW MODE SWITCH */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5 p-3.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#64748B]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию в библиотеке..."
            className="w-full h-11 pl-10 pr-9 rounded-xl bg-[#080A18] hover:bg-[#11152A] focus:bg-[#080A18] text-sm text-[#F8FAFC] placeholder-[#64748B] border border-[#1E2442] focus:border-[#8B5CF6] transition-colors outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#64748B] hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Right side: Sort & View Mode Switches */}
        <div className="flex items-center gap-3 justify-end">
          {/* Sort Selector */}
          <div className="relative flex items-center">
            <ArrowUpDown className="absolute left-3 w-4 h-4 text-[#64748B] pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Сортировка библиотеки"
              className="h-11 pl-9 pr-8 rounded-xl bg-[#080A18] hover:bg-[#11152A] text-xs sm:text-sm text-[#CBD5E1] border border-[#1E2442] focus:border-[#8B5CF6] transition-colors outline-none cursor-pointer appearance-none font-medium"
            >
              <option value="updated_desc">Недавно обновлённые</option>
              <option value="title_asc">По названию (А–Я)</option>
              <option value="title_desc">По названию (Я–А)</option>
              <option value="rating_desc">По оценке (сначала высокие)</option>
              <option value="year_desc">По году выпуска</option>
              <option value="progress_desc">По прогрессу</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-[#080A18] border border-[#1E2442]">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[#7C3AED] text-white'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
              title="Сетка (Grid)"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('compact')}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'compact'
                  ? 'bg-[#7C3AED] text-white'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
              title="Компактная сетка"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[#7C3AED] text-white'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
              title="Список (List)"
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. MAIN CONTENT AREA */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#8B5CF6] animate-spin" />
          <p className="text-xs text-[#94A3B8]">Загрузка библиотеки...</p>
        </div>
      ) : paginatedItems.length > 0 ? (
        <div className="space-y-6">
          {/* VIEW MODE 1: STANDARD GRID (5-7 cards on desktop) */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 sm:gap-5">
              {paginatedItems.map((item) => {
                const targetUrl = `/media/${formatMediaTypePath(item.type)}/${item.mediaId}`;

                return (
                  <div
                    key={item.userMediaId}
                    className="group relative rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 shadow-lg"
                  >
                    {/* Poster with Hover Overlay */}
                    <div className="relative aspect-[2/3] w-full bg-[#11152A] overflow-hidden">
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#64748B] p-2 text-center text-xs">
                          {item.title}
                        </div>
                      )}

                      {/* Top Badges */}
                      <div className="absolute top-1.5 left-1.5 z-10">
                        <CategoryBadge type={item.type || 'MOVIE'} size="sm" />
                      </div>

                      <button
                        onClick={(e) => toggleFavorite(item.userMediaId, item.isFavorite, e)}
                        className="absolute top-1.5 right-1.5 z-10 p-1.5 rounded-lg bg-[#080A18]/80 backdrop-blur-md border border-[#1E2442] text-[#94A3B8] hover:text-rose-400 transition-colors"
                        title={item.isFavorite ? 'Убрать из избранного' : 'В избранное'}
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${
                            item.isFavorite ? 'text-rose-500 fill-rose-500' : 'text-[#94A3B8]'
                          }`}
                        />
                      </button>

                      {/* Bottom Public Rating / Score */}
                      {item.publicRating && (
                        <div className="absolute bottom-1.5 right-1.5 z-10">
                          <RatingBadge rating={item.publicRating} size="sm" />
                        </div>
                      )}

                      {/* HOVER OVERLAY: Quick Actions */}
                      <div className="absolute inset-0 bg-[#080A18]/90 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2.5 z-20">
                        <div className="flex items-center justify-between">
                          <StatusBadge status={item.status} size="sm" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToDelete(item.userMediaId);
                            }}
                            className="p-1 rounded-md text-[#94A3B8] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Удалить из библиотеки"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Middle Quick Actions */}
                        <div className="space-y-1.5">
                          <button
                            onClick={() => setEditingItem(item)}
                            className="w-full py-1.5 px-2 rounded-lg bg-[#151932] hover:bg-[#7C3AED] text-[#F8FAFC] text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-[#1E2442]"
                          >
                            <Edit3 className="w-3 h-3 text-[#A78BFA]" />
                            <span>Изменить</span>
                          </button>

                          <button
                            onClick={() => navigate(targetUrl)}
                            className="w-full py-1.5 px-2 rounded-lg bg-[#11152A] hover:bg-[#151932] text-[#94A3B8] hover:text-[#F8FAFC] text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-[#1E2442]"
                          >
                            <ExternalLink className="w-3 h-3 text-[#8B5CF6]" />
                            <span>Подробнее</span>
                          </button>
                        </div>

                        {/* Bottom Actions */}
                        <div className="flex items-center justify-between text-[10px] text-[#94A3B8] pt-1 border-t border-[#1E2442]/60">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setListModalItem(item);
                              }}
                              className="p-1 hover:text-[#A78BFA] transition-colors cursor-pointer"
                              title="В список"
                            >
                              <FolderPlus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReviewModalItem(item);
                              }}
                              className="p-1 hover:text-[#A78BFA] transition-colors cursor-pointer"
                              title="Отзыв"
                            >
                              <MessageSquarePlus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openShareModal(
                                {
                                  id: item.mediaId,
                                  title: item.title,
                                  type: item.type,
                                  posterUrl: item.posterUrl,
                                  rating: item.rating,
                                },
                                item.status === 'COMPLETED'
                              );
                            }}
                            className="flex items-center gap-1 hover:text-[#A78BFA] transition-colors cursor-pointer"
                            title="Поделиться"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Card Meta Content */}
                    <div className="p-2.5 space-y-1.5 flex-1 flex flex-col justify-between">
                      <div>
                        <h3
                          onClick={() => navigate(targetUrl)}
                          className="font-bold text-xs text-[#F8FAFC] hover:text-[#A78BFA] transition-colors line-clamp-1 cursor-pointer"
                          title={item.title}
                        >
                          {item.title}
                        </h3>
                        <div className="flex items-center justify-between text-[10px] text-[#94A3B8] font-mono mt-0.5">
                          <span>{item.year || '—'}</span>
                          <StatusBadge status={item.status} size="sm" />
                        </div>
                      </div>

                      {/* User Rating & Progress */}
                      <div className="pt-1 border-t border-[#1E2442]/60 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px]">
                          {/* User Star rating */}
                          <div className="flex items-center gap-0.5">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="font-mono font-bold text-amber-300 tabular-nums">
                              {item.rating ? `${item.rating}/10` : '—'}
                            </span>
                          </div>

                          {/* Progress text */}
                          {item.progress !== undefined && (
                            <span className="font-mono text-[#CBD5E1] tabular-nums">
                              {item.progress}
                              {item.totalEpisodes ? `/${item.totalEpisodes}` : ''}
                            </span>
                          )}
                        </div>

                        {/* Progress Bar + +1 increment */}
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-[#151932] overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#7C3AED] to-[#6366F1] rounded-full"
                              style={{
                                width: item.totalEpisodes
                                  ? `${Math.min(100, Math.round((item.progress / item.totalEpisodes) * 100))}%`
                                  : item.progress
                                  ? '60%'
                                  : '0%',
                              }}
                            />
                          </div>
                          <button
                            onClick={(e) => incrementProgress(item.userMediaId, item.progress || 0, e)}
                            disabled={updatingId === item.userMediaId}
                            className="px-1.5 py-0.5 rounded-md bg-[#151932] hover:bg-[#7C3AED] text-[#A78BFA] hover:text-white border border-[#1E2442] text-[10px] font-mono font-bold transition-colors cursor-pointer"
                            title="+1 прогресс"
                          >
                            +1
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 2: COMPACT GRID (High density poster wall) */}
          {viewMode === 'compact' && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2.5">
              {paginatedItems.map((item) => {
                const targetUrl = `/media/${formatMediaTypePath(item.type)}/${item.mediaId}`;

                return (
                  <div
                    key={item.userMediaId}
                    onClick={() => navigate(targetUrl)}
                    className="group relative rounded-xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 overflow-hidden cursor-pointer transition-all duration-150 hover:-translate-y-0.5 shadow-md"
                  >
                    <div className="relative aspect-[2/3] w-full bg-[#11152A] overflow-hidden">
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-[#64748B] p-1 text-center">
                          {item.title}
                        </div>
                      )}

                      {/* Status dot indicator */}
                      <div className="absolute top-1.5 left-1.5">
                        <StatusBadge status={item.status} size="sm" />
                      </div>

                      {/* User score / dodik score */}
                      {item.rating ? (
                        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-[#080A18]/85 border border-amber-400/40 text-amber-300 font-mono text-[10px] font-bold flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                          <span>{item.rating}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="p-1.5 bg-[#0B0D20]">
                      <h4 className="text-[11px] font-semibold text-[#F8FAFC] truncate group-hover:text-[#A78BFA] transition-colors">
                        {item.title}
                      </h4>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 3: STRUCTURED LIST TABLE (Ideal for massive libraries) */}
          {viewMode === 'list' && (
            <div className="rounded-2xl bg-[#0B0D20] border border-[#1E2442] overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#080A18] text-[#94A3B8] border-b border-[#1E2442] font-semibold text-[11px]">
                    <tr>
                      <th className="py-3 px-4 w-12">Постер</th>
                      <th className="py-3 px-4">Название</th>
                      <th className="py-3 px-3">Тип</th>
                      <th className="py-3 px-3">Статус</th>
                      <th className="py-3 px-3">Прогресс</th>
                      <th className="py-3 px-3">Оценка</th>
                      <th className="py-3 px-4 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2442]/60">
                    {paginatedItems.map((item) => {
                      const targetUrl = `/media/${formatMediaTypePath(item.type)}/${item.mediaId}`;

                      return (
                        <tr
                          key={item.userMediaId}
                          className="hover:bg-[#11152A]/50 transition-colors group"
                        >
                          {/* Poster Thumbnail */}
                          <td className="py-2 px-4">
                            <div
                              onClick={() => navigate(targetUrl)}
                              className="w-9 h-12 rounded-lg bg-[#11152A] overflow-hidden border border-[#1E2442] cursor-pointer shrink-0"
                            >
                              {item.posterUrl ? (
                                <img
                                  src={item.posterUrl}
                                  alt={item.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[8px] text-[#64748B]">
                                  —
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Title & Year */}
                          <td className="py-2 px-4">
                            <div className="min-w-[180px]">
                              <span
                                onClick={() => navigate(targetUrl)}
                                className="font-bold text-[#F8FAFC] hover:text-[#A78BFA] transition-colors cursor-pointer line-clamp-1 block text-xs sm:text-sm"
                              >
                                {item.title}
                              </span>
                              <div className="flex items-center gap-2 text-[10px] text-[#64748B] font-mono mt-0.5">
                                <span>{item.year || '—'}</span>
                                {item.originalTitle && (
                                  <span className="truncate max-w-[200px]">{item.originalTitle}</span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Category Badge */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            <CategoryBadge type={item.type || 'MOVIE'} size="sm" />
                          </td>

                          {/* Status Badge */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            <StatusBadge status={item.status} size="sm" />
                          </td>

                          {/* Progress Controls */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-[#CBD5E1] tabular-nums font-semibold">
                                {item.progress || 0}
                                {item.totalEpisodes ? ` / ${item.totalEpisodes}` : ''}
                              </span>
                              <button
                                onClick={(e) => incrementProgress(item.userMediaId, item.progress || 0, e)}
                                disabled={updatingId === item.userMediaId}
                                className="px-2 py-0.5 rounded-md bg-[#151932] hover:bg-[#7C3AED] text-[#A78BFA] hover:text-white border border-[#1E2442] text-[10px] font-mono font-bold transition-colors cursor-pointer"
                                title="+1 прогресс"
                              >
                                +1
                              </button>
                            </div>
                          </td>

                          {/* Rating Stars Picker */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              {[2, 4, 6, 8, 10].map((starVal) => {
                                const isFilled = item.rating && item.rating >= starVal;
                                return (
                                  <button
                                    key={starVal}
                                    onClick={(e) => updateRating(item.userMediaId, starVal, e)}
                                    className="text-[#334155] hover:text-amber-400 transition-colors cursor-pointer"
                                    title={`Оценка: ${starVal}/10`}
                                  >
                                    <Star
                                      className={`w-3.5 h-3.5 ${
                                        isFilled ? 'text-amber-400 fill-amber-400' : 'text-[#334155]'
                                      }`}
                                    />
                                  </button>
                                );
                              })}
                              {item.rating ? (
                                <span className="text-[11px] font-bold text-amber-300 ml-1 font-mono tabular-nums">
                                  {item.rating}
                                </span>
                              ) : null}
                            </div>
                          </td>

                          {/* Action Buttons */}
                          <td className="py-2 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={(e) => toggleFavorite(item.userMediaId, item.isFavorite, e)}
                                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-rose-400 hover:bg-[#151932] transition-colors"
                                title="Избранное"
                              >
                                <Heart
                                  className={`w-3.5 h-3.5 ${
                                    item.isFavorite ? 'text-rose-500 fill-rose-500' : ''
                                  }`}
                                />
                              </button>
                              <button
                                onClick={() => setEditingItem(item)}
                                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#A78BFA] hover:bg-[#151932] transition-colors"
                                title="Редактировать статус и заметки"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setListModalItem(item)}
                                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#A78BFA] hover:bg-[#151932] transition-colors"
                                title="Добавить в список"
                              >
                                <FolderPlus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setReviewModalItem(item)}
                                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#A78BFA] hover:bg-[#151932] transition-colors"
                                title="Написать отзыв"
                              >
                                <MessageSquarePlus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  openShareModal(
                                    {
                                      id: item.mediaId,
                                      title: item.title,
                                      type: item.type,
                                      posterUrl: item.posterUrl,
                                      rating: item.rating,
                                    },
                                    item.status === 'COMPLETED'
                                  )
                                }
                                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#A78BFA] hover:bg-[#151932] transition-colors"
                                title="Поделиться"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setItemToDelete(item.userMediaId)}
                                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Удалить из библиотеки"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. PAGINATION CONTROLS */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#1E2442]">
              <div className="text-xs text-[#94A3B8] font-mono">
                Показано{' '}
                <strong className="text-[#F8FAFC]">
                  {(currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, filteredItems.length)}
                </strong>{' '}
                из <strong className="text-[#F8FAFC]">{filteredItems.length}</strong> тайтлов
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-[#94A3B8] hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="Предыдущая страница"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    return (
                      p === 1 ||
                      p === totalPages ||
                      Math.abs(p - currentPage) <= 1
                    );
                  })
                  .map((page, idx, arr) => {
                    const prev = arr[idx - 1];
                    const hasGap = prev && page - prev > 1;

                    return (
                      <React.Fragment key={page}>
                        {hasGap && <span className="text-[#64748B] px-1">…</span>}
                        <button
                          onClick={() => setCurrentPage(page)}
                          className={`min-w-[32px] h-8 px-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                            currentPage === page
                              ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md'
                              : 'bg-[#0B0D20] text-[#94A3B8] hover:text-white hover:bg-[#151932] border border-[#1E2442]'
                          }`}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    );
                  })}

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-[#94A3B8] hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="Следующая страница"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <EmptyState
          icon={<Library className="w-8 h-8 text-[#8B5CF6]" />}
          title={
            searchQuery
              ? 'Ничего не найдено по вашему запросу'
              : selectedStatus !== 'ALL' || selectedType !== 'ALL'
              ? 'В выбранной категории или статусе пока нет тайтлов'
              : 'Ваша библиотека пуста'
          }
          description={
            searchQuery
              ? 'Попробуйте изменить поисковый запрос или сбросить фильтры.'
              : 'Найдите фильмы, сериалы, аниме, игры или книги в каталоге, чтобы отслеживать свой прогресс.'
          }
          actionText="Искать медиа в каталоге"
          onAction={onNavigateSearch}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={itemToDelete !== null}
        title="Удалить из библиотеки?"
        message="Вы действительно хотите удалить этот тайтл из своей библиотеки? Его статус и оценка будут очищены."
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
        onConfirm={confirmDeleteItem}
        onCancel={() => setItemToDelete(null)}
      />

      {/* Edit / Add Status Modal */}
      {editingItem && (
        <AddToLibraryModal
          mediaItem={{
            mediaId: editingItem.mediaId,
            title: editingItem.title,
            originalTitle: editingItem.originalTitle,
            type: editingItem.type,
            posterUrl: editingItem.posterUrl,
            backdropUrl: editingItem.backdropUrl,
            year: editingItem.year,
            rating: editingItem.publicRating,
          }}
          onClose={() => setEditingItem(null)}
          onAdded={() => {
            setEditingItem(null);
            fetchLibrary();
          }}
        />
      )}

      {/* Add To List Modal */}
      {listModalItem && (
        <AddToListModal
          media={{
            id: listModalItem.mediaId,
            mediaId: listModalItem.mediaId,
            title: listModalItem.title,
            type: listModalItem.type,
            posterUrl: listModalItem.posterUrl,
            year: listModalItem.year,
            rating: listModalItem.rating,
          }}
          onClose={() => setListModalItem(null)}
        />
      )}

      {/* Content Review Modal */}
      {reviewModalItem && (
        <ContentReviewModal
          isOpen={true}
          itemTitle={reviewModalItem.title}
          onClose={() => setReviewModalItem(null)}
          onSubmit={handleReviewSubmit}
        />
      )}
    </div>
  );
};
