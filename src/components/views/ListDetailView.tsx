import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ListOrdered,
  Globe,
  Lock,
  Calendar,
  Loader2,
  Trash2,
  Share2,
  Check,
  Film,
  Plus,
  Search,
  Users,
  AlertTriangle,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { MediaCard } from '../common/MediaCard.tsx';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';

interface ListDetailViewProps {
  listId: number;
}

export const ListDetailView: React.FC<ListDetailViewProps> = ({ listId }) => {
  const { authFetch, dbUser } = useAuth();
  const { navigate, goBack } = useRouter();

  const [listData, setListData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add Item to List search state
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingMediaId, setAddingMediaId] = useState<number | null>(null);

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/lists/${listId}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Этот список является приватным и доступен только автору или друзьям');
        }
        if (res.status === 404) {
          throw new Error('Список не найден в базе данных');
        }
        throw new Error('Не удалось загрузить список');
      }
      const data = await res.json();
      setListData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (listId) {
      fetchList();
    }
  }, [listId, dbUser]);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setActionError(null);
    try {
      const res = await authFetch(`/api/lists/${listId}`, { method: 'DELETE' });
      if (res.ok) {
        setShowDeleteModal(false);
        navigate('/lists');
      } else {
        const data = await res.json();
        setActionError(data.error || 'Ошибка удаления списка');
      }
    } catch (err) {
      setActionError('Ошибка при удалении списка');
    } finally {
      setDeleting(false);
    }
  };

  const handleRemoveItem = async () => {
    if (!itemToRemove) return;
    try {
      const res = await authFetch(`/api/lists/${listId}/items/${itemToRemove}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setItemToRemove(null);
        fetchList();
      }
    } catch (err) {
      console.error('Failed to remove item:', err);
    }
  };

  const handleSearchMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await authFetch(`/api/search?q=${encodeURIComponent(searchQuery)}&type=ALL`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || data || []);
      }
    } catch (err) {
      console.error('Failed to search media:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleAddMedia = async (mediaItem: any) => {
    const mId = mediaItem.id || mediaItem.mediaId;
    setAddingMediaId(mId);
    try {
      const res = await authFetch(`/api/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: mId,
          mediaPayload: mediaItem,
        }),
      });
      if (res.ok) {
        fetchList();
      }
    } catch (err) {
      console.error('Failed to add item to list:', err);
    } finally {
      setAddingMediaId(null);
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="py-32 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-10 h-10 text-[#AC82FF] animate-spin" />
        <p className="text-xs text-[#9A94AA] font-mono">Загрузка списка...</p>
      </div>
    );
  }

  if (error || !listData) {
    return (
      <div className="py-24 text-center space-y-4 max-w-lg mx-auto animate-fadeIn">
        <div className="w-14 h-14 rounded-2xl bg-rose-950/40 border border-rose-800/40 flex items-center justify-center mx-auto text-rose-400">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-[#F3F1F8] font-mono">Доступ ограничен</h2>
        <p className="text-xs text-[#9A94AA] leading-relaxed">{error}</p>
        <div className="pt-2">
          <button
            onClick={() => navigate('/lists')}
            className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-semibold shadow transition-all"
          >
            Все списки
          </button>
        </div>
      </div>
    );
  }

  const isOwner = dbUser && (dbUser.id === listData.userId || dbUser.role === 'ADMIN');
  const items = Array.isArray(listData.items) ? listData.items : [];

  return (
    <div className="space-y-8 pb-16 animate-fadeIn">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => goBack()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#14131A] hover:bg-[#1F1C2E] border border-[#252233] text-xs font-medium text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад к спискам
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14131A] hover:bg-[#1F1C2E] border border-[#252233] text-xs font-medium text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Ссылка скопирована</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Поделиться</span>
              </>
            )}
          </button>

          {isOwner && (
            <>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-semibold shadow transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить тайтл</span>
              </button>

              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-xs font-medium text-rose-300 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Header Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1F1C2E] border border-[#3A344E] text-xs font-semibold text-[#AC82FF]">
            <ListOrdered className="w-3.5 h-3.5" />
            Коллекция ({items.length} тайтлов)
          </span>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 font-mono">
            {listData.visibility === 'PUBLIC' ? (
              <>
                <Globe className="w-3 h-3 text-emerald-400" />
                <span>Публичный</span>
              </>
            ) : listData.visibility === 'FRIENDS_ONLY' ? (
              <>
                <Users className="w-3 h-3 text-amber-400" />
                <span>Для друзей</span>
              </>
            ) : (
              <>
                <Lock className="w-3 h-3 text-rose-400" />
                <span>Приватный</span>
              </>
            )}
          </span>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 font-mono">
            <Calendar className="w-3 h-3" />
            {new Date(listData.createdAt).toLocaleDateString('ru-RU')}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-[#F3F1F8] font-mono tracking-tight">
          {listData.title}
        </h1>

        {listData.description && (
          <p className="text-xs sm:text-sm text-[#9A94AA] leading-relaxed max-w-3xl">
            {listData.description}
          </p>
        )}

        {listData.ownerUsername && (
          <div className="pt-2">
            <div
              onClick={() => navigate(`/u/${listData.ownerUsername}`)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#191724] border border-[#252233] hover:border-[#AC82FF]/50 cursor-pointer transition-colors group"
            >
              <div className="w-6 h-6 rounded-full bg-[#1F1C2E] flex items-center justify-center text-[10px] font-bold text-[#AC82FF] overflow-hidden">
                {listData.ownerAvatar ? (
                  <img src={listData.ownerAvatar} alt={listData.ownerUsername || 'User'} className="w-full h-full object-cover" />
                ) : (
                  (listData.ownerUsername?.[0] || 'U').toUpperCase()
                )}
              </div>
              <span className="text-xs text-[#9A94AA] group-hover:text-[#AC82FF] font-medium transition-colors">
                Создатель: @{listData.ownerUsername || 'anonymous'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Media Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#F3F1F8] font-mono">
            Содержимое списка ({items.length})
          </h2>
          {isOwner && (
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs text-[#AC82FF] hover:underline flex items-center gap-1 font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить тайтл
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-[#14131A] rounded-3xl border border-[#252233] p-6">
            <Film className="w-10 h-10 text-zinc-600 mx-auto" />
            <h3 className="text-sm font-semibold text-[#F3F1F8]">Список пока пуст</h3>
            <p className="text-xs text-[#9A94AA]">
              {isOwner ? 'Нажмите кнопку «Добавить тайтл», чтобы наполнить список.' : 'В этой коллекции пока нет добавленных тайтлов.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {items.map((item: any) => {
              const mObj = item.media || item;
              return (
                <div key={item.id || item.mediaId} className="relative group">
                  <MediaCard media={mObj} />
                  {isOwner && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemToRemove(item.mediaId || item.id);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/80 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Удалить из списка"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Media Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-[#14131A] border border-[#252233] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#252233] pb-3">
              <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#AC82FF]" />
                Добавить тайтл в список
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-xs text-[#9A94AA] hover:text-white"
              >
                Закрыть
              </button>
            </div>

            <form onSubmit={handleSearchMedia} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск фильма, аниме, игры, книги..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#191724] border border-[#252233] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#9B6BFF]"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Искать'}
              </button>
            </form>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {searchResults.map((resItem) => {
                const isAdding = addingMediaId === resItem.id;
                return (
                  <div
                    key={resItem.id}
                    className="p-2.5 rounded-xl bg-[#191724] border border-[#252233] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-12 rounded bg-zinc-800 overflow-hidden shrink-0">
                        {resItem.posterUrl && (
                          <img
                            src={resItem.posterUrl}
                            alt={resItem.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#F3F1F8] truncate">{resItem.title}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">
                          {resItem.type} • {resItem.year || '—'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddMedia(resItem)}
                      disabled={isAdding}
                      className="px-3 py-1.5 rounded-lg bg-[#9B6BFF]/20 hover:bg-[#9B6BFF] text-[#AC82FF] hover:text-white text-xs font-medium border border-[#9B6BFF]/40 transition-colors shrink-0 disabled:opacity-50"
                    >
                      {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Добавить'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Delete List Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        title="Удалить список?"
        message="Вы уверены, что хотите безвозвратно удалить этот список?"
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          setShowDeleteModal(false);
          setActionError(null);
        }}
      />

      {/* Remove Item Modal */}
      <ConfirmModal
        isOpen={itemToRemove !== null}
        title="Удалить тайтл?"
        message="Удалить этот тайтл из коллекции?"
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
        onConfirm={handleRemoveItem}
        onCancel={() => setItemToRemove(null)}
      />
    </div>
  );
};
