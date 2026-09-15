import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { ListOrdered, Plus, Loader2, Globe, Users, Lock, X, Search, ShieldCheck, Eye, Trash2, Clock, UserCheck, UserX, Check } from 'lucide-react';

const LIST_CATEGORIES = [
  { id: 'MOVIES_TV', label: 'Фильмы и сериалы' },
  { id: 'GAMES', label: 'Игры' },
  { id: 'ANIME', label: 'Аниме' },
  { id: 'MANGA', label: 'Манга' },
  { id: 'BOOKS', label: 'Книги' },
  { id: 'COMICS', label: 'Комиксы' },
];

interface SelectedCollaborator {
  id: number;
  username: string;
  avatar?: string | null;
  role: 'EDITOR' | 'VIEWER';
}

export const ListsView: React.FC = () => {
  const { dbUser, authFetch, login } = useAuth();
  const { navigate } = useRouter();

  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [respondingInviteId, setRespondingInviteId] = useState<number | null>(null);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [category, setCategory] = useState('MOVIES_TV');
  const [collaborators, setCollaborators] = useState<SelectedCollaborator[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchInvitations = async () => {
    if (!dbUser) return;
    try {
      const res = await authFetch('/api/user/list-invitations');
      if (res.ok) {
        const data = await res.json();
        setPendingInvitations(data);
      }
    } catch (err) {
      console.error('Failed to fetch list invitations:', err);
    }
  };

  const fetchLists = async () => {
    if (!dbUser) return;
    try {
      const res = await authFetch('/api/lists/my');
      if (res.ok) {
        const data = await res.json();
        setLists(data);
      }
    } catch (err) {
      console.error('Failed to fetch lists:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dbUser) {
      fetchLists();
      fetchInvitations();
    } else {
      setLoading(false);
    }
  }, [dbUser]);

  const handleAcceptInvitation = async (invId: number, listId: number) => {
    setRespondingInviteId(invId);
    try {
      const res = await authFetch(`/api/list-invitations/${invId}/accept`, { method: 'POST' });
      if (res.ok) {
        await Promise.all([fetchInvitations(), fetchLists()]);
        navigate(`/lists/${listId}`);
      }
    } catch (err) {
      console.error('Failed to accept invitation:', err);
    } finally {
      setRespondingInviteId(null);
    }
  };

  const handleDeclineInvitation = async (invId: number) => {
    setRespondingInviteId(invId);
    try {
      const res = await authFetch(`/api/list-invitations/${invId}/decline`, { method: 'POST' });
      if (res.ok) {
        await fetchInvitations();
      }
    } catch (err) {
      console.error('Failed to decline invitation:', err);
    } finally {
      setRespondingInviteId(null);
    }
  };

  // Debounced search for users
  useEffect(() => {
    if (!userSearchQuery.trim() || userSearchQuery.trim().length < 1) {
      setUserSearchResults([]);
      setSearchingUsers(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const res = await authFetch(`/api/users/search?q=${encodeURIComponent(userSearchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          // Filter out current user and already selected collaborators
          const filtered = (Array.isArray(data) ? data : []).filter(
            (u: any) => u.id !== dbUser?.id && !collaborators.some((c) => c.id === u.id)
          );
          setUserSearchResults(filtered);
        }
      } catch (err) {
        console.error('User search failed:', err);
      } finally {
        setSearchingUsers(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [userSearchQuery, collaborators, dbUser]);

  const handleAddCollaborator = (user: any) => {
    setCollaborators((prev) => [
      ...prev,
      {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        role: 'EDITOR',
      },
    ]);
    setUserSearchQuery('');
    setUserSearchResults([]);
  };

  const handleRemoveCollaborator = (userId: number) => {
    setCollaborators((prev) => prev.filter((c) => c.id !== userId));
  };

  const handleUpdateCollaboratorRole = (userId: number, role: 'EDITOR' | 'VIEWER') => {
    setCollaborators((prev) =>
      prev.map((c) => (c.id === userId ? { ...c, role } : c))
    );
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    setCreateError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description ? description.trim() : null,
        visibility,
        category,
        members: collaborators.map((c) => ({
          userId: c.id,
          role: c.role,
        })),
      };

      const res = await authFetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        setTitle('');
        setDescription('');
        setCategory('MOVIES_TV');
        setVisibility('PUBLIC');
        setCollaborators([]);
        setUserSearchQuery('');
        setUserSearchResults([]);
        setShowCreateModal(false);
        fetchLists();
        if (created?.id) {
          navigate(`/lists/${created.id}`);
        }
      } else {
        const data = await res.json();
        setCreateError(data.error || 'Не удалось создать список');
      }
    } catch (err: any) {
      console.error('Failed to create list:', err);
      setCreateError(err.message || 'Ошибка создания списка');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#F3F1F8] font-mono tracking-tight flex items-center gap-2">
            <ListOrdered className="w-6 h-6 text-[#AC82FF]" />
            СПИСКИ & КОЛЛЕКЦИИ
          </h1>
          <p className="text-xs text-[#9A94AA] mt-1">
            Тематические подборки, совместные списки для просмотра и персональные коллекции
          </p>
        </div>
        <button
          onClick={() => {
            if (!dbUser) login();
            else {
              setCreateError(null);
              setShowCreateModal(true);
            }
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-semibold shadow-lg transition-all"
        >
          <Plus className="w-4 h-4" />
          Создать коллекцию
        </button>
      </div>

      {/* Incoming Invitations Banner */}
      {pendingInvitations.length > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-[#191724] border border-[#9B6BFF]/40 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#F3F1F8] flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Приглашения в совместные списки ({pendingInvitations.length})
            </h2>
            <span className="text-[11px] text-zinc-400 font-mono">Требуется ваше решение</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingInvitations.map((inv) => {
              const isResponding = respondingInviteId === inv.id;
              return (
                <div
                  key={inv.id}
                  className="p-3.5 rounded-2xl bg-[#14131A] border border-[#2E2A40] space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#9B6BFF]/20 text-[#AC82FF] border border-[#9B6BFF]/30 font-mono font-medium">
                        {inv.permission === 'EDITOR' ? 'Редактор' : 'Читатель'}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">от @{inv.inviterUsername}</span>
                    </div>
                    <h3 className="text-xs font-bold text-white line-clamp-1">{inv.listTitle}</h3>
                    {inv.listDescription && (
                      <p className="text-[11px] text-zinc-400 line-clamp-2">{inv.listDescription}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleAcceptInvitation(inv.id, inv.listId)}
                      disabled={isResponding}
                      className="flex-1 py-1.5 px-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {isResponding ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                      <span>Принять</span>
                    </button>
                    <button
                      onClick={() => handleDeclineInvitation(inv.id)}
                      disabled={isResponding}
                      className="py-1.5 px-2.5 rounded-xl bg-[#1F1C2E] hover:bg-rose-950/40 border border-[#2E2A40] hover:border-rose-800/50 text-zinc-400 hover:text-rose-300 text-xs font-semibold flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>Отклонить</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#AC82FF] animate-spin" />
          <p className="text-xs text-[#9A94AA]">Загрузка списков...</p>
        </div>
      ) : lists.length > 0 ? (
        <div className="space-y-10">
          {LIST_CATEGORIES.map(cat => {
            const catLists = lists.filter(l => l.category === cat.id);
            if (catLists.length === 0) return null;
            
            return (
              <div key={cat.id} className="space-y-4">
                <h2 className="text-lg font-bold text-[#F3F1F8] border-b border-[#252233] pb-2">
                  {cat.label}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {catLists.map((lst) => {
                    const isOwner = dbUser?.id === lst.ownerId;
                    const userRole = lst.role || lst.userRole;
                    const isCollaborator = !isOwner && userRole && userRole !== 'OWNER';

                    return (
                      <div
                        key={lst.id}
                        onClick={() => navigate(`/lists/${lst.id}`)}
                        role="link"
                        tabIndex={0}
                        className="group p-5 rounded-3xl bg-[#14131A] border border-[#252233] hover:border-[#AC82FF]/60 cursor-pointer transition-all shadow-lg hover:-translate-y-1 space-y-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1F1C2E] text-[#AC82FF] border border-[#3A344E] font-mono flex items-center gap-1">
                            {lst.visibility === 'PUBLIC' ? (
                              <Globe className="w-3 h-3 text-emerald-400" />
                            ) : lst.visibility === 'FRIENDS' || lst.visibility === 'FRIENDS' ? (
                              <Users className="w-3 h-3 text-amber-400" />
                            ) : (
                              <Lock className="w-3 h-3 text-rose-400" />
                            )}
                            {lst.visibility === 'PUBLIC' ? 'Публичный' : (lst.visibility === 'FRIENDS' || lst.visibility === 'FRIENDS') ? 'Для друзей' : 'Приватный'}
                          </span>

                          {isCollaborator && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#9B6BFF]/20 text-[#AC82FF] border border-[#9B6BFF]/40 font-mono">
                              {userRole === 'EDITOR' ? 'Соавтор (Редактор)' : 'Читатель'}
                            </span>
                          )}

                          <span className="text-[11px] text-[#9A94AA] truncate max-w-[120px]">@{lst.ownerUsername}</span>
                        </div>
                        <h3 className="text-sm font-bold text-[#F3F1F8] group-hover:text-[#AC82FF] transition-colors">
                          {lst.title}
                        </h3>
                        {lst.description && (
                          <p className="text-xs text-[#9A94AA] line-clamp-2 leading-relaxed">{lst.description}</p>
                        )}
                        <div className="pt-2 flex items-center justify-between text-[11px] text-[#AC82FF] font-medium border-t border-[#252233]/60">
                          <span>{lst.itemsCount ? `${lst.itemsCount} тайтлов` : 'Коллекция'}</span>
                          <span className="group-hover:translate-x-0.5 transition-transform">Открыть список →</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-20 text-center space-y-3 bg-[#14131A] rounded-2xl border border-[#252233] p-8 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-full bg-[#191724] border border-[#2E2A40] flex items-center justify-center mx-auto text-[#9A94AA]">
            <ListOrdered className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-[#F3F1F8] font-mono">У вас пока нет списков</h3>
          <p className="text-xs text-[#9A94AA] max-w-sm mx-auto">
            Создайте свою первую коллекцию или совместный список для совместного наполнения с друзьями!
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                if (!dbUser) login();
                else setShowCreateModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-semibold shadow-md"
            >
              Создать первый список
            </button>
          </div>
        </div>
      )}

      {/* Create List Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
          <form
            onSubmit={handleCreateList}
            className="bg-[#14131A] border border-[#252233] rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 my-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#252233]">
              <h3 className="text-sm font-bold text-[#F3F1F8] font-mono tracking-wider flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-[#AC82FF]" />
                НОВАЯ КОЛЛЕКЦИЯ
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#252233]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300">
                {createError}
              </div>
            )}
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#D5D0E3]">Название списка *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Любимый киберпанк или Лучшие игры 2026"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-sm text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#D5D0E3]">Категория медиа</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-sm text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF] cursor-pointer appearance-none"
                >
                  {LIST_CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-[#9A94AA] pt-0.5">В этот список можно будет добавлять медиа только выбранной категории.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#D5D0E3]">Описание (необязательно)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Для чего этот список..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-sm text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF] resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#D5D0E3]">Видимость</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility('PUBLIC')}
                    className={`py-2 px-2 rounded-xl text-xs font-medium border text-center transition-all ${
                      visibility === 'PUBLIC'
                        ? 'bg-[#9B6BFF] text-white border-[#9B6BFF]'
                        : 'bg-[#191724] text-[#9A94AA] border-[#2E2A40] hover:text-[#F3F1F8]'
                    }`}
                  >
                    Публичный
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('FRIENDS')}
                    className={`py-2 px-2 rounded-xl text-xs font-medium border text-center transition-all ${
                      visibility === 'FRIENDS'
                        ? 'bg-[#9B6BFF] text-white border-[#9B6BFF]'
                        : 'bg-[#191724] text-[#9A94AA] border-[#2E2A40] hover:text-[#F3F1F8]'
                    }`}
                  >
                    Для друзей
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('PRIVATE')}
                    className={`py-2 px-2 rounded-xl text-xs font-medium border text-center transition-all ${
                      visibility === 'PRIVATE'
                        ? 'bg-[#9B6BFF] text-white border-[#9B6BFF]'
                        : 'bg-[#191724] text-[#9A94AA] border-[#2E2A40] hover:text-[#F3F1F8]'
                    }`}
                  >
                    Только мне
                  </button>
                </div>
              </div>

              {/* Соавторы / Участники совместного списка */}
              <div className="space-y-2 pt-2 border-t border-[#252233]">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-[#D5D0E3] flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#AC82FF]" />
                      Пригласить соавторов
                    </label>
                    <p className="text-[10px] text-[#9A94AA] mt-0.5">
                      Пользователи получат приглашение и смогут принять участие
                    </p>
                  </div>
                  <span className="text-[10px] text-[#AC82FF] font-mono">
                    {collaborators.length > 0 ? `${collaborators.length} в списке` : 'Необязательно'}
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Найти пользователя по логину..."
                    className="w-full pl-8 pr-8 py-2 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-zinc-600 focus:outline-none focus:border-[#9B6BFF]"
                  />
                  {searchingUsers && (
                    <Loader2 className="w-3.5 h-3.5 text-[#AC82FF] animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}

                  {/* Dropdown with search results */}
                  {userSearchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-20 rounded-xl bg-[#191724] border border-[#2E2A40] shadow-2xl max-h-48 overflow-y-auto p-1.5 space-y-1">
                      {userSearchResults.map((u) => (
                        <div
                          key={u.id}
                          onClick={() => handleAddCollaborator(u)}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-[#252233] cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#2E2A40] overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-[#AC82FF] font-bold">
                              {u.avatar ? (
                                <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                              ) : (
                                u.username?.[0]?.toUpperCase() || 'U'
                              )}
                            </div>
                            <span className="text-xs text-[#F3F1F8] font-medium">@{u.username}</span>
                          </div>
                          <span className="text-[10px] text-[#AC82FF] font-medium">+ Добавить</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected collaborators list */}
                {collaborators.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {collaborators.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-[#191724] border border-[#252233] gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-[#2E2A40] overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-[#AC82FF] font-bold">
                            {c.avatar ? (
                              <img src={c.avatar} alt={c.username} className="w-full h-full object-cover" />
                            ) : (
                              c.username?.[0]?.toUpperCase() || 'U'
                            )}
                          </div>
                          <span className="text-xs text-[#F3F1F8] font-medium truncate">@{c.username}</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={c.role}
                            onChange={(e) => handleUpdateCollaboratorRole(c.id, e.target.value as any)}
                            className="px-2 py-1 rounded-lg bg-[#14131A] border border-[#2E2A40] text-[11px] text-[#AC82FF] focus:outline-none focus:border-[#9B6BFF] cursor-pointer"
                          >
                            <option value="EDITOR">Редактор</option>
                            <option value="VIEWER">Читатель</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveCollaborator(c.id)}
                            className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                            title="Удалить"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#252233]">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-[#9A94AA] hover:text-[#F3F1F8]"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2 rounded-xl bg-[#F3F1F8] hover:bg-white text-[#0F0E12] text-xs font-bold shadow-md transition-colors disabled:opacity-50"
              >
                {creating ? 'Создание...' : 'Создать список'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

