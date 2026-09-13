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
  ShieldCheck,
  Crown,
  Eye,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { MediaCard } from '../common/MediaCard.tsx';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';

const CATEGORY_NAMES: Record<string, string> = {
  MOVIES_TV: 'Фильмы и сериалы',
  GAMES: 'Игры',
  ANIME: 'Аниме',
  MANGA: 'Манга',
  BOOKS: 'Книги',
  COMICS: 'Комиксы',
};

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
  const [addMediaError, setAddMediaError] = useState<string | null>(null);

  // Manage Members / Collaborators state
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<number | null>(null);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);

  // Delete modals state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/lists/${listId}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Этот список является приватным и доступен только создателю или соавторам');
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

  // Debounced member search
  useEffect(() => {
    if (!memberSearchQuery.trim() || memberSearchQuery.trim().length < 1) {
      setMemberSearchResults([]);
      setSearchingMembers(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingMembers(true);
      try {
        const res = await authFetch(`/api/users/search?q=${encodeURIComponent(memberSearchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          const existingMemberIds = new Set((listData?.members || []).map((m: any) => m.userId));
          const filtered = (Array.isArray(data) ? data : []).filter(
            (u: any) => u.id !== dbUser?.id && !existingMemberIds.has(u.id) && u.id !== listData?.ownerId
          );
          setMemberSearchResults(filtered);
        }
      } catch (err) {
        console.error('Member search error:', err);
      } finally {
        setSearchingMembers(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [memberSearchQuery, listData, dbUser]);

  const canEdit = Boolean(listData?.canEdit);
  const isOwner = Boolean(listData?.isOwner);
  const userRole = listData?.userRole || null;
  const isCollaborator = !isOwner && (userRole === 'EDITOR' || userRole === 'VIEWER');
  const items = Array.isArray(listData?.items) ? listData.items : [];
  const members = Array.isArray(listData?.members) ? listData.members : [];

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

  const handleLeaveList = async () => {
    if (!dbUser) return;
    try {
      const res = await authFetch(`/api/lists/${listId}/members/${dbUser.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setShowLeaveModal(false);
        navigate('/lists');
      } else {
        const data = await res.json();
        setActionError(data.error || 'Ошибка выхода из списка');
      }
    } catch (err) {
      setActionError('Не удалось покинуть список');
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
    setAddMediaError(null);
    try {
      const res = await authFetch(
        `/api/media/search?q=${encodeURIComponent(searchQuery.trim())}&listCategory=${listData?.category || 'ALL'}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : (data.results || []));
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
    setAddMediaError(null);
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
      } else {
        const data = await res.json();
        setAddMediaError(data.error || 'Ошибка добавления тайтла');
      }
    } catch (err: any) {
      console.error('Failed to add item to list:', err);
      setAddMediaError(err.message || 'Ошибка добавления тайтла');
    } finally {
      setAddingMediaId(null);
    }
  };

  const handleAddMember = async (user: any, role: 'EDITOR' | 'VIEWER' = 'EDITOR') => {
    setMemberActionError(null);
    setUpdatingMemberId(user.id);
    try {
      const res = await authFetch(`/api/lists/${listId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, role }),
      });
      if (res.ok) {
        setMemberSearchQuery('');
        setMemberSearchResults([]);
        fetchList();
      } else {
        const data = await res.json();
        setMemberActionError(data.error || 'Ошибка добавления участника');
      }
    } catch (err: any) {
      setMemberActionError(err.message || 'Ошибка добавления');
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleUpdateMemberRole = async (targetUserId: number, newRole: 'EDITOR' | 'VIEWER') => {
    setMemberActionError(null);
    setUpdatingMemberId(targetUserId);
    try {
      const res = await authFetch(`/api/lists/${listId}/members/${targetUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        fetchList();
      } else {
        const data = await res.json();
        setMemberActionError(data.error || 'Ошибка изменения роли');
      }
    } catch (err: any) {
      setMemberActionError(err.message || 'Ошибка изменения роли');
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleRemoveMember = async (targetUserId: number) => {
    setMemberActionError(null);
    setUpdatingMemberId(targetUserId);
    try {
      const res = await authFetch(`/api/lists/${listId}/members/${targetUserId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchList();
      } else {
        const data = await res.json();
        setMemberActionError(data.error || 'Ошибка удаления участника');
      }
    } catch (err: any) {
      setMemberActionError(err.message || 'Ошибка удаления участника');
    } finally {
      setUpdatingMemberId(null);
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

  return (
    <div className="space-y-8 pb-16 animate-fadeIn">
      {/* Top Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={() => goBack()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#14131A] hover:bg-[#1F1C2E] border border-[#252233] text-xs font-medium text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад к спискам
        </button>

        <div className="flex flex-wrap items-center gap-2">
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

          {/* Members / Collaborators Button */}
          <button
            onClick={() => {
              setMemberActionError(null);
              setShowMembersModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#191724] hover:bg-[#1F1C2E] border border-[#252233] text-xs font-medium text-[#D5D0E3] hover:text-[#F3F1F8] transition-colors"
          >
            <Users className="w-3.5 h-3.5 text-[#AC82FF]" />
            <span>Участники ({members.length})</span>
          </button>

          {/* Add Title Button (enabled for both Owner and Editor) */}
          {canEdit && (
            <button
              onClick={() => {
                setAddMediaError(null);
                setShowAddModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-semibold shadow transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить тайтл</span>
            </button>
          )}

          {/* Leave list button for collaborators */}
          {isCollaborator && (
            <button
              onClick={() => setShowLeaveModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-rose-950/40 border border-zinc-800 hover:border-rose-800/40 text-xs font-medium text-zinc-400 hover:text-rose-300 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Покинуть список</span>
            </button>
          )}

          {/* Delete list button for Owner */}
          {isOwner && (
            <button
              onClick={() => setShowDeleteModal(true)}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-xs font-medium text-rose-300 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить</span>
            </button>
          )}
        </div>
      </div>

      {/* Header Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Pill */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1F1C2E] border border-[#3A344E] text-xs font-semibold text-[#AC82FF]">
            <ListOrdered className="w-3.5 h-3.5" />
            {CATEGORY_NAMES[listData.category] || listData.category || 'Коллекция'}
          </span>

          {/* Visibility Pill */}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 font-mono">
            {listData.visibility === 'PUBLIC' ? (
              <>
                <Globe className="w-3 h-3 text-emerald-400" />
                <span>Публичный</span>
              </>
            ) : listData.visibility === 'FRIENDS' || listData.visibility === 'FRIENDS_ONLY' ? (
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

          {/* User Role Badge */}
          {userRole && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#9B6BFF]/20 border border-[#9B6BFF]/40 text-[11px] text-[#AC82FF] font-mono font-medium">
              {userRole === 'OWNER' ? 'Владелец' : userRole === 'EDITOR' ? 'Редактор' : 'Читатель'}
            </span>
          )}

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

        {/* Creator and Collaborators preview avatars */}
        <div className="pt-2 flex flex-wrap items-center gap-3">
          {listData.ownerUsername && (
            <div
              onClick={() => navigate(`/u/${listData.ownerUsername}`)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#191724] border border-[#252233] hover:border-[#AC82FF]/50 cursor-pointer transition-colors group"
            >
              <div className="w-6 h-6 rounded-full bg-[#1F1C2E] flex items-center justify-center text-[10px] font-bold text-[#AC82FF] overflow-hidden">
                {listData.ownerAvatar ? (
                  <img src={listData.ownerAvatar} alt={listData.ownerUsername} className="w-full h-full object-cover" />
                ) : (
                  (listData.ownerUsername?.[0] || 'U').toUpperCase()
                )}
              </div>
              <span className="text-xs text-[#9A94AA] group-hover:text-[#AC82FF] font-medium transition-colors flex items-center gap-1">
                <Crown className="w-3 h-3 text-amber-400" />
                @{listData.ownerUsername}
              </span>
            </div>
          )}

          {members.length > 1 && (
            <div
              onClick={() => setShowMembersModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#191724] border border-[#252233] hover:border-[#AC82FF]/50 cursor-pointer transition-colors"
            >
              <Users className="w-3.5 h-3.5 text-[#AC82FF]" />
              <span className="text-xs text-[#9A94AA] font-medium">
                {members.length} участников
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Media Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#F3F1F8] font-mono">
            Содержимое списка ({items.length})
          </h2>
          {canEdit && (
            <button
              onClick={() => {
                setAddMediaError(null);
                setShowAddModal(true);
              }}
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
              {canEdit
                ? 'Нажмите кнопку «Добавить тайтл», чтобы наполнить список.'
                : 'В этой коллекции пока нет добавленных тайтлов.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {items.map((item: any) => {
              const mObj = item.media || item;
              return (
                <div key={item.id || item.mediaId} className="relative group">
                  <MediaCard media={mObj} />
                  {canEdit && (
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
                  {item.addedByUsername && item.addedByUsername !== listData.ownerUsername && (
                    <div className="mt-1 px-1 flex items-center gap-1 text-[10px] text-[#9A94AA] truncate">
                      <span>Добавил:</span>
                      <span className="text-[#AC82FF] font-medium truncate">@{item.addedByUsername}</span>
                    </div>
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
              <div>
                <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#AC82FF]" />
                  Добавить тайтл в список
                </h3>
                <p className="text-[11px] text-[#9A94AA]">
                  Категория списка: <span className="text-[#AC82FF] font-medium">{CATEGORY_NAMES[listData.category] || listData.category}</span>
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-xs text-[#9A94AA] hover:text-white"
              >
                Закрыть
              </button>
            </div>

            {addMediaError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300">
                {addMediaError}
              </div>
            )}

            <form onSubmit={handleSearchMedia} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Поиск (${CATEGORY_NAMES[listData.category] || 'тайтлов'})...`}
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
              {searchResults.length === 0 && !searching && searchQuery && (
                <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                  Ничего не найдено в категории {CATEGORY_NAMES[listData.category] || listData.category}
                </div>
              )}
              {searchResults.map((resItem) => {
                const isAdding = addingMediaId === (resItem.id || resItem.mediaId);
                const isAlreadyInList = items.some(
                  (i: any) => (i.mediaId && i.mediaId === (resItem.id || resItem.mediaId)) || (i.id && i.id === (resItem.id || resItem.mediaId))
                );

                return (
                  <div
                    key={resItem.id || resItem.mediaId || resItem.externalId}
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
                      disabled={isAdding || isAlreadyInList}
                      className="px-3 py-1.5 rounded-lg bg-[#9B6BFF]/20 hover:bg-[#9B6BFF] text-[#AC82FF] hover:text-white text-xs font-medium border border-[#9B6BFF]/40 transition-colors shrink-0 disabled:opacity-50"
                    >
                      {isAdding ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isAlreadyInList ? (
                        'В списке'
                      ) : (
                        'Добавить'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Manage Members / Collaborators Modal */}
      {showMembersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-[#14131A] border border-[#252233] p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#252233] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#AC82FF]" />
                  Участники и соавторы списка
                </h3>
                <p className="text-[11px] text-[#9A94AA]">
                  {isOwner
                    ? 'Управляйте правами редакторов и читателей списка'
                    : 'Список пользователей с доступом к совместному редактированию'}
                </p>
              </div>
              <button
                onClick={() => setShowMembersModal(false)}
                className="text-xs text-[#9A94AA] hover:text-white"
              >
                Закрыть
              </button>
            </div>

            {memberActionError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300">
                {memberActionError}
              </div>
            )}

            {/* If Owner: Search and Invite new collaborator */}
            {isOwner && (
              <div className="space-y-2 pt-1 pb-2 border-b border-[#252233]">
                <label className="text-xs font-semibold text-[#D5D0E3]">Добавить соавтора</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    placeholder="Поиск пользователя по логину..."
                    className="w-full pl-8 pr-8 py-2 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-zinc-600 focus:outline-none focus:border-[#9B6BFF]"
                  />
                  {searchingMembers && (
                    <Loader2 className="w-3.5 h-3.5 text-[#AC82FF] animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}

                  {/* Dropdown Results */}
                  {memberSearchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-20 rounded-xl bg-[#191724] border border-[#2E2A40] shadow-2xl max-h-48 overflow-y-auto p-1.5 space-y-1">
                      {memberSearchResults.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-[#252233] transition-colors gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-[#2E2A40] overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-[#AC82FF] font-bold">
                              {u.avatar ? (
                                <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                              ) : (
                                u.username?.[0]?.toUpperCase() || 'U'
                              )}
                            </div>
                            <span className="text-xs text-[#F3F1F8] font-medium truncate">@{u.username}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleAddMember(u, 'EDITOR')}
                              disabled={updatingMemberId === u.id}
                              className="px-2.5 py-1 rounded-lg bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-[11px] font-medium transition-colors disabled:opacity-50"
                            >
                              + Редактор
                            </button>
                            <button
                              onClick={() => handleAddMember(u, 'VIEWER')}
                              disabled={updatingMemberId === u.id}
                              className="px-2.5 py-1 rounded-lg bg-[#191724] hover:bg-[#252233] border border-[#2E2A40] text-[#D5D0E3] text-[11px] font-medium transition-colors disabled:opacity-50"
                            >
                              + Читатель
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* List of current members */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#D5D0E3]">Текущие участники ({members.length})</label>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {members.map((m: any) => {
                  const isThisOwner = m.role === 'OWNER';
                  const isCurrentSelf = dbUser && dbUser.id === m.userId;
                  const isModifying = updatingMemberId === m.userId;

                  return (
                    <div
                      key={m.userId || m.id}
                      className="flex items-center justify-between p-2.5 rounded-2xl bg-[#191724] border border-[#252233] gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-[#1F1C2E] flex items-center justify-center text-[10px] font-bold text-[#AC82FF] overflow-hidden shrink-0">
                          {m.avatar ? (
                            <img src={m.avatar} alt={m.username} className="w-full h-full object-cover" />
                          ) : (
                            (m.username?.[0] || 'U').toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#F3F1F8] truncate">@{m.username}</span>
                            {isThisOwner && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                            {isCurrentSelf && (
                              <span className="text-[10px] text-zinc-500 font-mono">(вы)</span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {isThisOwner ? 'Создатель списка' : m.role === 'EDITOR' ? 'Редактор' : 'Читатель'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isOwner && !isThisOwner ? (
                          <>
                            <select
                              value={m.role}
                              disabled={isModifying}
                              onChange={(e) => handleUpdateMemberRole(m.userId, e.target.value as any)}
                              className="px-2 py-1 rounded-lg bg-[#14131A] border border-[#2E2A40] text-xs text-[#AC82FF] focus:outline-none focus:border-[#9B6BFF] cursor-pointer disabled:opacity-50"
                            >
                              <option value="EDITOR">Редактор</option>
                              <option value="VIEWER">Читатель</option>
                            </select>
                            <button
                              onClick={() => handleRemoveMember(m.userId)}
                              disabled={isModifying}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors disabled:opacity-50"
                              title="Исключить из списка"
                            >
                              {isModifying ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#1F1C2E] border border-[#2E2A40] text-[#AC82FF] font-mono">
                            {isThisOwner ? 'Владелец' : m.role === 'EDITOR' ? 'Редактор' : 'Читатель'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-[#252233] flex justify-end">
              <button
                onClick={() => setShowMembersModal(false)}
                className="px-4 py-2 rounded-xl bg-[#191724] hover:bg-[#252233] text-xs text-[#F3F1F8] font-medium transition-colors"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete List Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        title="Удалить список?"
        message="Вы уверены, что хотите безвозвратно удалить этот список со всем содержимым?"
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

      {/* Leave List Modal */}
      <ConfirmModal
        isOpen={showLeaveModal}
        title="Покинуть список?"
        message="Вы уверены, что хотите покинуть этот совместный список? Вы больше не сможете его редактировать."
        confirmText="Покинуть"
        cancelText="Отмена"
        variant="danger"
        onConfirm={handleLeaveList}
        onCancel={() => setShowLeaveModal(false)}
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
