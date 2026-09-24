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
  Crown,
  LogOut,
  Clock,
  Mail,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { MediaCard } from '../common/MediaCard.tsx';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';
import {
  PrimaryButton,
  SecondaryButton,
  DestructiveButton,
  EmptyState,
} from '../design-system/index.ts';

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

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<number | null>(null);

  // Search in Add Media modal
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingMediaId, setAddingMediaId] = useState<number | null>(null);
  const [addMediaError, setAddMediaError] = useState<string | null>(null);

  // Invite member in Members modal
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<number | null>(null);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [memberActionSuccess, setMemberActionSuccess] = useState<string | null>(null);

  // Operations state
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [respondingToInvite, setRespondingToInvite] = useState(false);

  const fetchList = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/lists/${listId}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Этот список является приватным и доступен только автору');
        }
        if (res.status === 404) {
          throw new Error('Список не найден');
        }
        throw new Error('Ошибка загрузки списка');
      }
      const data = await res.json();
      setListData(data);
    } catch (err: any) {
      console.error('Failed to load list details:', err);
      setError(err.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [listId, dbUser?.id]);

  // Search users in member modal
  useEffect(() => {
    if (!memberSearchQuery.trim() || memberSearchQuery.trim().length < 2) {
      setMemberSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingMembers(true);
      try {
        const res = await authFetch(`/api/users/search?q=${encodeURIComponent(memberSearchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          const currentMemberIds = (listData?.members || []).map((m: any) => m.userId);
          const pendingInviteeIds = (listData?.invitations || []).map((i: any) => i.inviteeId);

          const filtered = (data.users || data || []).filter(
            (u: any) =>
              u.id !== dbUser?.id &&
              u.id !== listData?.ownerId &&
              !currentMemberIds.includes(u.id) &&
              !pendingInviteeIds.includes(u.id)
          );
          setMemberSearchResults(filtered);
        }
      } catch (err) {
        console.error('Search users error:', err);
      } finally {
        setSearchingMembers(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [memberSearchQuery, listData, dbUser?.id]);

  const handleSearchMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setAddMediaError(null);
    try {
      const categoryParam = listData?.category ? `&type=${listData.category}` : '';
      const res = await authFetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}${categoryParam}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || data || []);
      } else {
        const data = await res.json();
        setAddMediaError(data.error || 'Ошибка при поиске тайтлов');
      }
    } catch (err: any) {
      setAddMediaError(err.message || 'Не удалось выполнить поиск');
    } finally {
      setSearching(false);
    }
  };

  const handleAddMedia = async (mediaItem: any) => {
    const targetMediaId = mediaItem.id || mediaItem.mediaId;
    setAddingMediaId(targetMediaId);
    setAddMediaError(null);

    try {
      const res = await authFetch(`/api/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: targetMediaId,
          externalId: mediaItem.externalId,
          type: mediaItem.type,
          title: mediaItem.title,
          posterUrl: mediaItem.posterUrl,
        }),
      });

      if (res.ok) {
        await fetchList();
      } else {
        const data = await res.json();
        setAddMediaError(data.error || 'Не удалось добавить тайтл');
      }
    } catch (err: any) {
      setAddMediaError(err.message || 'Ошибка добавления тайтла');
    } finally {
      setAddingMediaId(null);
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
        await fetchList();
      } else {
        const data = await res.json();
        setActionError(data.error || 'Ошибка удаления');
      }
    } catch (err: any) {
      setActionError(err.message || 'Ошибка удаления тайтла');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setActionError(null);
    try {
      const res = await authFetch(`/api/lists/${listId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setShowDeleteModal(false);
        navigate('/lists');
      } else {
        const data = await res.json();
        setActionError(data.error || 'Ошибка при удалении списка');
      }
    } catch (err: any) {
      setActionError(err.message || 'Не удалось удалить список');
    } finally {
      setDeleting(false);
    }
  };

  const handleLeaveList = async () => {
    try {
      const res = await authFetch(`/api/lists/${listId}/leave`, {
        method: 'POST',
      });
      if (res.ok) {
        setShowLeaveModal(false);
        navigate('/lists');
      } else {
        const data = await res.json();
        setActionError(data.error || 'Ошибка при выходе из списка');
      }
    } catch (err: any) {
      setActionError(err.message || 'Не удалось покинуть список');
    }
  };

  const handleAddMember = async (user: any, role: 'EDITOR' | 'VIEWER' = 'EDITOR') => {
    setMemberActionError(null);
    setMemberActionSuccess(null);
    setUpdatingMemberId(user.id);
    try {
      const res = await authFetch(`/api/lists/${listId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, role }),
      });
      if (res.ok) {
        setMemberSearchQuery('');
        setMemberSearchResults([]);
        setMemberActionSuccess(`Приглашение отправлено пользователю @${user.username}`);
        setTimeout(() => setMemberActionSuccess(null), 4000);
        fetchList();
      } else {
        const data = await res.json();
        setMemberActionError(data.error || 'Ошибка отправки приглашения');
      }
    } catch (err: any) {
      setMemberActionError(err.message || 'Ошибка отправки приглашения');
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleAcceptInvitation = async () => {
    setRespondingToInvite(true);
    try {
      const res = await authFetch(`/api/lists/${listId}/invitations/accept`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchList();
      } else {
        const data = await res.json();
        setError(data.error || 'Ошибка принятия приглашения');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка принятия приглашения');
    } finally {
      setRespondingToInvite(false);
    }
  };

  const handleDeclineInvitation = async () => {
    setRespondingToInvite(true);
    try {
      const res = await authFetch(`/api/lists/${listId}/invitations/decline`, {
        method: 'POST',
      });
      if (res.ok) {
        navigate('/lists');
      } else {
        const data = await res.json();
        setError(data.error || 'Ошибка отклонения приглашения');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка отклонения приглашения');
    } finally {
      setRespondingToInvite(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: number) => {
    setMemberActionError(null);
    setMemberActionSuccess(null);
    setUpdatingMemberId(invitationId);
    try {
      const res = await authFetch(`/api/lists/${listId}/invitations/${invitationId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setMemberActionSuccess('Приглашение успешно отозвано');
        setTimeout(() => setMemberActionSuccess(null), 3000);
        fetchList();
      } else {
        const data = await res.json();
        setMemberActionError(data.error || 'Ошибка отмены приглашения');
      }
    } catch (err: any) {
      setMemberActionError(err.message || 'Ошибка отмены приглашения');
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
        setMemberActionError(data.error || 'Ошибка обновления роли');
      }
    } catch (err: any) {
      setMemberActionError(err.message || 'Ошибка обновления роли');
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
        setMemberActionError(data.error || 'Ошибка исключения участника');
      }
    } catch (err: any) {
      setMemberActionError(err.message || 'Ошибка исключения участника');
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const isOwner = dbUser && listData && dbUser.id === listData.ownerId;
  const userRole = listData?.currentUserRole || (isOwner ? 'OWNER' : null);
  const canEdit = isOwner || userRole === 'EDITOR';
  const isCollaborator = !isOwner && userRole && userRole !== 'OWNER';
  const members = listData?.members || [];
  const items = listData?.items || [];

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
        <Loader2 className="w-10 h-10 text-[#8B5CF6] animate-spin" />
        <p className="text-xs text-[#94A3B8] font-mono">Загрузка списка...</p>
      </div>
    );
  }

  if (error || !listData) {
    return (
      <div className="py-24 text-center space-y-4 max-w-lg mx-auto animate-fadeIn">
        <div className="w-14 h-14 rounded-2xl bg-rose-950/40 border border-rose-800/40 flex items-center justify-center mx-auto text-rose-400">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-[#F8FAFC] font-mono">Доступ ограничен</h2>
        <p className="text-xs text-[#94A3B8] leading-relaxed">{error}</p>
        <div className="pt-2">
          <PrimaryButton onClick={() => navigate('/lists')}>
            Все списки
          </PrimaryButton>
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
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад к спискам
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-medium text-[#CBD5E1] hover:text-[#F8FAFC] transition-colors cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-[#8B5CF6]" />
            <span>Участники ({members.length})</span>
          </button>

          {/* Add Title Button (enabled for both Owner and Editor) */}
          {canEdit && (
            <PrimaryButton
              onClick={() => {
                setAddMediaError(null);
                setShowAddModal(true);
              }}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Добавить тайтл
            </PrimaryButton>
          )}

          {/* Leave list button for collaborators */}
          {isCollaborator && (
            <button
              onClick={() => setShowLeaveModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#11152A] hover:bg-rose-950/40 border border-[#1E2442] hover:border-rose-800/40 text-xs font-medium text-[#94A3B8] hover:text-rose-300 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Покинуть список</span>
            </button>
          )}

          {/* Delete list button for Owner */}
          {isOwner && (
            <DestructiveButton
              onClick={() => setShowDeleteModal(true)}
              disabled={deleting}
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Удалить
            </DestructiveButton>
          )}
        </div>
      </div>

      {/* Pending Invitation Banner for Invitee */}
      {listData?.pendingInvitation && (
        <div className="p-5 rounded-3xl bg-[#11152A] border-2 border-[#8B5CF6] shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fadeIn">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center text-[#A78BFA] shrink-0 mt-0.5">
              <Mail className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#F8FAFC]">
                  Приглашение в совместный список
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[10px] font-mono font-medium text-[#A78BFA]">
                  {listData.pendingInvitation.permission === 'EDITOR' ? 'Редактор' : 'Читатель'}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                Пользователь <span className="text-[#A78BFA] font-semibold">@{listData.pendingInvitation.inviterUsername || listData.ownerUsername}</span> приглашает вас стать соавтором этого списка.
                {listData.pendingInvitation.permission === 'EDITOR'
                  ? ' После принятия вы сможете добавлять тайтлы и наполнять коллекцию.'
                  : ' После принятия список появится в вашей библиотеке коллекций.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto">
            <PrimaryButton
              onClick={handleAcceptInvitation}
              disabled={respondingToInvite}
              icon={respondingToInvite ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            >
              Принять приглашение
            </PrimaryButton>
            <SecondaryButton
              onClick={handleDeclineInvitation}
              disabled={respondingToInvite}
            >
              Отклонить
            </SecondaryButton>
          </div>
        </div>
      )}

      {/* Header Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Pill */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#151932] border border-[#1E2442] text-xs font-semibold text-[#A78BFA]">
            <ListOrdered className="w-3.5 h-3.5" />
            {CATEGORY_NAMES[listData.category] || listData.category || 'Коллекция'}
          </span>

          {/* Visibility Pill */}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#11152A] border border-[#1E2442] text-[11px] text-[#94A3B8] font-mono">
            {listData.visibility === 'PUBLIC' ? (
              <>
                <Globe className="w-3 h-3 text-emerald-400" />
                <span>Публичный</span>
              </>
            ) : listData.visibility === 'FRIENDS' ? (
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
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[11px] text-[#A78BFA] font-mono font-medium">
              {userRole === 'OWNER' ? 'Владелец' : userRole === 'EDITOR' ? 'Редактор' : 'Читатель'}
            </span>
          )}

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#11152A] border border-[#1E2442] text-[11px] text-[#94A3B8] font-mono">
            <Calendar className="w-3 h-3" />
            {new Date(listData.createdAt).toLocaleDateString('ru-RU')}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight">
          {listData.title}
        </h1>

        {listData.description && (
          <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed max-w-3xl">
            {listData.description}
          </p>
        )}

        {/* Creator and Collaborators preview avatars */}
        <div className="pt-2 flex flex-wrap items-center gap-3">
          {listData.ownerUsername && (
            <div
              onClick={() => navigate(`/u/${listData.ownerUsername}`)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/50 cursor-pointer transition-colors group"
            >
              <div className="w-6 h-6 rounded-full bg-[#151932] flex items-center justify-center text-[10px] font-bold text-[#A78BFA] overflow-hidden">
                {listData.ownerAvatar ? (
                  <img src={listData.ownerAvatar} alt={listData.ownerUsername} className="w-full h-full object-cover" />
                ) : (
                  (listData.ownerUsername?.[0] || 'U').toUpperCase()
                )}
              </div>
              <span className="text-xs text-[#94A3B8] group-hover:text-[#A78BFA] font-medium transition-colors flex items-center gap-1">
                <Crown className="w-3 h-3 text-amber-400" />
                @{listData.ownerUsername}
              </span>
            </div>
          )}

          {members.length > 1 && (
            <div
              onClick={() => setShowMembersModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/50 cursor-pointer transition-colors"
            >
              <Users className="w-3.5 h-3.5 text-[#8B5CF6]" />
              <span className="text-xs text-[#94A3B8] font-medium">
                {members.length} участников
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Media Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#1E2442] pb-3">
          <h2 className="text-base font-bold text-[#F8FAFC] tracking-tight">
            Содержимое списка ({items.length})
          </h2>
          {canEdit && (
            <button
              onClick={() => {
                setAddMediaError(null);
                setShowAddModal(true);
              }}
              className="text-xs text-[#A78BFA] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить тайтл
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={<Film className="w-10 h-10 text-[#8B5CF6]" />}
            title="Список пока пуст"
            description={
              canEdit
                ? 'Нажмите кнопку «Добавить тайтл», чтобы наполнить коллекцию.'
                : 'В этой коллекции пока нет добавленных тайтлов.'
            }
            actionLabel={canEdit ? 'Добавить тайтл' : undefined}
            onAction={
              canEdit
                ? () => {
                    setAddMediaError(null);
                    setShowAddModal(true);
                  }
                : undefined
            }
          />
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
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/80 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
                      title="Удалить из списка"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {item.addedByUsername && (
                    <div className="mt-1.5 px-1 flex items-center gap-1.5 text-[10px] text-[#94A3B8] truncate">
                      <div className="w-3.5 h-3.5 rounded-full bg-[#151932] overflow-hidden shrink-0 flex items-center justify-center text-[8px] text-[#A78BFA]">
                        {item.addedByAvatar ? (
                          <img src={item.addedByAvatar} alt={item.addedByUsername} className="w-full h-full object-cover" />
                        ) : (
                          item.addedByUsername[0]?.toUpperCase()
                        )}
                      </div>
                      <span className="truncate">
                        <span className="text-[#64748B]">Добавил </span>
                        <span className="text-[#A78BFA] font-medium">@{item.addedByUsername}</span>
                      </span>
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
          <div className="w-full max-w-lg rounded-3xl bg-[#0B0D20] border border-[#1E2442] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E2442] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#F8FAFC] font-mono flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#8B5CF6]" />
                  Добавить тайтл в список
                </h3>
                <p className="text-[11px] text-[#94A3B8]">
                  Категория списка: <span className="text-[#A78BFA] font-medium">{CATEGORY_NAMES[listData.category] || listData.category}</span>
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addMediaError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300">
                {addMediaError}
              </div>
            )}

            <form onSubmit={handleSearchMedia} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Поиск (${CATEGORY_NAMES[listData.category] || 'тайтлов'})...`}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] transition-colors"
                />
              </div>
              <PrimaryButton
                type="submit"
                disabled={searching}
                icon={searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
              >
                Искать
              </PrimaryButton>
            </form>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {searchResults.length === 0 && !searching && searchQuery && (
                <div className="py-8 text-center text-xs text-[#64748B] font-mono">
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
                    className="p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-12 rounded bg-[#151932] overflow-hidden shrink-0 border border-[#1E2442]">
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
                        <p className="text-xs font-bold text-[#F8FAFC] truncate">{resItem.title}</p>
                        <p className="text-[10px] text-[#64748B] font-mono">
                          {resItem.type} • {resItem.year || '—'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddMedia(resItem)}
                      disabled={isAdding || isAlreadyInList}
                      className="px-3 py-1.5 rounded-lg bg-[#8B5CF6]/15 hover:bg-[#8B5CF6] text-[#A78BFA] hover:text-white text-xs font-semibold border border-[#8B5CF6]/30 transition-all shrink-0 disabled:opacity-50 cursor-pointer"
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
          <div className="w-full max-w-lg rounded-3xl bg-[#0B0D20] border border-[#1E2442] p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1E2442] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#F8FAFC] font-mono flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#8B5CF6]" />
                  Участники и соавторы списка
                </h3>
                <p className="text-[11px] text-[#94A3B8]">
                  {isOwner
                    ? 'Управляйте правами редакторов и читателей списка'
                    : 'Список пользователей с доступом к совместному редактированию'}
                </p>
              </div>
              <button
                onClick={() => setShowMembersModal(false)}
                className="p-1.5 rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {memberActionError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300">
                {memberActionError}
              </div>
            )}

            {memberActionSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{memberActionSuccess}</span>
              </div>
            )}

            {/* If Owner: Search and Invite new collaborator */}
            {isOwner && (
              <div className="space-y-2 pt-1 pb-2 border-b border-[#1E2442]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#CBD5E1]">Пригласить соавтора</label>
                  <span className="text-[10px] text-[#64748B] font-mono">Требуется подтверждение</span>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    placeholder="Поиск пользователя по логину..."
                    className="w-full pl-8 pr-8 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] transition-colors"
                  />
                  {searchingMembers && (
                    <Loader2 className="w-3.5 h-3.5 text-[#8B5CF6] animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}

                  {/* Dropdown Results */}
                  {memberSearchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-20 rounded-2xl bg-[#11152A] border border-[#1E2442] shadow-2xl max-h-48 overflow-y-auto p-1.5 space-y-1">
                      {memberSearchResults.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-[#151932] transition-colors gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-[#151932] border border-[#1E2442] overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-[#A78BFA] font-bold">
                              {u.avatar ? (
                                <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                              ) : (
                                u.username?.[0]?.toUpperCase() || 'U'
                              )}
                            </div>
                            <span className="text-xs text-[#F8FAFC] font-medium truncate">@{u.username}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleAddMember(u, 'EDITOR')}
                              disabled={updatingMemberId === u.id}
                              className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-[11px] font-bold transition-all disabled:opacity-50 cursor-pointer"
                            >
                              + Редактор
                            </button>
                            <button
                              onClick={() => handleAddMember(u, 'VIEWER')}
                              disabled={updatingMemberId === u.id}
                              className="px-2.5 py-1 rounded-lg bg-[#151932] hover:bg-[#191D38] border border-[#1E2442] text-[#CBD5E1] text-[11px] font-medium transition-colors disabled:opacity-50 cursor-pointer"
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

            {/* Pending Invitations list (Owner Only) */}
            {isOwner && listData?.invitations && listData.invitations.length > 0 && (
              <div className="space-y-2 pt-1 pb-2 border-b border-[#1E2442]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#CBD5E1] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Ожидают подтверждения ({listData.invitations.length})
                  </label>
                  <span className="text-[10px] text-[#64748B] font-mono">Приглашение отправлено</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {listData.invitations.map((inv: any) => {
                    const isRevoking = updatingMemberId === inv.id;
                    return (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-2.5 rounded-2xl bg-[#11152A] border border-dashed border-[#1E2442] gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[#151932] flex items-center justify-center text-[10px] font-bold text-[#A78BFA] overflow-hidden shrink-0 border border-[#1E2442]">
                            {inv.inviteeAvatar ? (
                              <img src={inv.inviteeAvatar} alt={inv.inviteeUsername} className="w-full h-full object-cover" />
                            ) : (
                              (inv.inviteeUsername?.[0] || 'U').toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-[#F8FAFC] truncate">
                                @{inv.inviteeUsername}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[9px] font-mono flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                Ожидает ответа
                              </span>
                            </div>
                            <span className="text-[10px] text-[#64748B] font-mono">
                              Роль: {inv.permission === 'EDITOR' ? 'Редактор' : 'Читатель'}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRevokeInvitation(inv.id)}
                          disabled={isRevoking}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/30 hover:bg-rose-950/60 border border-rose-800/40 text-rose-300 text-[11px] font-medium transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                          title="Отозвать приглашение"
                        >
                          {isRevoking ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <X className="w-3 h-3" />
                          )}
                          <span>Отозвать</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* List of current members */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#CBD5E1]">Текущие участники ({members.length})</label>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {members.map((m: any) => {
                  const isThisOwner = m.role === 'OWNER';
                  const isCurrentSelf = dbUser && dbUser.id === m.userId;
                  const isModifying = updatingMemberId === m.userId;

                  return (
                    <div
                      key={m.userId || m.id}
                      className="flex items-center justify-between p-2.5 rounded-2xl bg-[#11152A] border border-[#1E2442] gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-[#151932] flex items-center justify-center text-[10px] font-bold text-[#A78BFA] overflow-hidden shrink-0 border border-[#1E2442]">
                          {m.avatar ? (
                            <img src={m.avatar} alt={m.username} className="w-full h-full object-cover" />
                          ) : (
                            (m.username?.[0] || 'U').toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#F8FAFC] truncate">@{m.username}</span>
                            {isThisOwner && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                            {isCurrentSelf && (
                              <span className="text-[10px] text-[#64748B] font-mono">(вы)</span>
                            )}
                          </div>
                          <span className="text-[10px] text-[#64748B] font-mono">
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
                              className="px-2 py-1 rounded-lg bg-[#0B0D20] border border-[#1E2442] text-xs text-[#A78BFA] focus:outline-none focus:border-[#8B5CF6] cursor-pointer disabled:opacity-50"
                            >
                              <option value="EDITOR">Редактор</option>
                              <option value="VIEWER">Читатель</option>
                            </select>
                            <button
                              onClick={() => handleRemoveMember(m.userId)}
                              disabled={isModifying}
                              className="p-1.5 rounded-lg text-[#64748B] hover:text-rose-400 hover:bg-rose-950/30 transition-colors disabled:opacity-50 cursor-pointer"
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
                          <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#151932] border border-[#1E2442] text-[#A78BFA] font-mono">
                            {isThisOwner ? 'Владелец' : m.role === 'EDITOR' ? 'Редактор' : 'Читатель'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-[#1E2442] flex justify-end">
              <SecondaryButton onClick={() => setShowMembersModal(false)}>
                Готово
              </SecondaryButton>
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
