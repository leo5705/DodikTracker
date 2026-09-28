import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  UserPlus,
  Shield,
  Trash2,
  Check,
  Search,
  Loader2,
  AlertCircle,
  LogOut,
  UserCheck,
  Crown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export interface PlaylistMemberItem {
  id: number;
  userId: number;
  username: string;
  avatar: string | null;
  role: 'COLLABORATOR' | 'VIEWER' | string;
  canAddTracks: boolean;
  canRemoveTracks: boolean;
  addedAt: string;
}

interface PlaylistMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlistId: number;
  playlistTitle: string;
  isOwner: boolean;
  ownerUser: {
    id: number;
    username: string;
    avatar: string | null;
  };
  onMembersUpdated?: () => void;
}

export const PlaylistMembersModal: React.FC<PlaylistMembersModalProps> = ({
  isOpen,
  onClose,
  playlistId,
  playlistTitle,
  isOwner,
  ownerUser,
  onMembersUpdated,
}) => {
  const { authFetch, dbUser } = useAuth();

  const [members, setMembers] = useState<PlaylistMemberItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // User search & invite
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Array<{ id: number; username: string; avatar: string | null }>>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [invitingUserId, setInvitingUserId] = useState<number | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const fetchMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/music/playlists/${playlistId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Не удалось загрузить участников');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки участников');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen, playlistId]);

  // Search users with debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await authFetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          // Filter out existing members and owner
          const existingIds = new Set([ownerUser.id, ...members.map((m) => m.userId)]);
          const filtered = (data.users || data || []).filter((u: any) => !existingIds.has(u.id));
          setSearchResults(filtered.slice(0, 8));
        }
      } catch (err) {
        console.error('Failed to search users:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, members, ownerUser.id, authFetch]);

  if (!isOpen) return null;

  // Invite user as collaborator
  const handleInviteUser = async (targetUser: { id: number; username: string }) => {
    setInvitingUserId(targetUser.id);
    setError(null);
    try {
      const res = await authFetch(`/api/music/playlists/${playlistId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUser.id,
          role: 'COLLABORATOR',
          canAddTracks: true,
          canRemoveTracks: false,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Не удалось добавить участника');
      }

      setSearchQuery('');
      setSearchResults([]);
      await fetchMembers();
      onMembersUpdated?.();
    } catch (err: any) {
      setError(err.message || 'Ошибка при добавлении участника');
    } finally {
      setInvitingUserId(null);
    }
  };

  // Toggle member permission (canAddTracks / canRemoveTracks)
  const handleTogglePermission = async (member: PlaylistMemberItem, field: 'canAddTracks' | 'canRemoveTracks') => {
    if (!isOwner) return;
    setActionLoadingId(member.userId);
    try {
      const res = await authFetch(`/api/music/playlists/${playlistId}/members/${member.userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [field]: !member[field],
        }),
      });

      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) => (m.userId === member.userId ? { ...m, [field]: !member[field] } : m))
        );
        onMembersUpdated?.();
      }
    } catch (err) {
      console.error('Failed to update member permission:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Remove member or leave playlist
  const handleRemoveMember = async (targetUserId: number) => {
    setActionLoadingId(targetUserId);
    try {
      const res = await authFetch(`/api/music/playlists/${playlistId}/members/${targetUserId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
        onMembersUpdated?.();
        if (targetUserId === dbUser?.id) {
          onClose();
        }
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const isCurrentMember = dbUser && members.some((m) => m.userId === dbUser.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080A18]/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-3xl bg-[#0F1328] border border-[#232B54] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[#1E2442] flex items-center justify-between bg-[#131835]/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-tight">Участники плейлиста</h3>
              <p className="text-xs text-[#94A3B8] truncate max-w-[280px]">
                «{playlistTitle}» • {members.length + 1} чел.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Search & Invite User (Owner only) */}
          {isOwner && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-200">
                Пригласить участника по имени пользователя
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Введите имя пользователя..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#090C1B] border border-[#232B54] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                {searching && (
                  <Loader2 className="w-4 h-4 text-purple-400 animate-spin absolute right-3.5 top-3.5" />
                )}
              </div>

              {/* Search Dropdown Results */}
              {searchResults.length > 0 && (
                <div className="p-2 rounded-2xl bg-[#080A18] border border-[#232B54] space-y-1 shadow-xl animate-in fade-in">
                  {searchResults.map((user) => (
                    <div
                      key={`pl-invite-user-${user.id}`}
                      className="p-2 rounded-xl bg-[#121633]/60 hover:bg-[#1C224B] flex items-center justify-between transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                          {user.avatar ? (
                            <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-purple-300 bg-purple-950">
                              {user.username.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-bold text-white truncate">{user.username}</span>
                      </div>

                      <button
                        onClick={() => handleInviteUser(user)}
                        disabled={invitingUserId === user.id}
                        className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/20"
                      >
                        {invitingUserId === user.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <UserPlus className="w-3 h-3" />
                        )}
                        <span>Добавить</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Members List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
              Список участников
            </h4>

            {/* Owner Row */}
            <div className="p-3.5 rounded-2xl bg-purple-950/20 border border-purple-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative w-9 h-9 rounded-full overflow-hidden bg-slate-800 border border-purple-500/40 shrink-0">
                  {ownerUser.avatar ? (
                    <img src={ownerUser.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-purple-300 bg-purple-950">
                      {ownerUser.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white truncate">{ownerUser.username}</span>
                    <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-bold uppercase flex items-center gap-1">
                      <Crown className="w-3 h-3 text-purple-400" />
                      Владелец
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Полный доступ к настройкам и трекам</p>
                </div>
              </div>
            </div>

            {/* Collaborators Rows */}
            {loading ? (
              <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                <span className="text-xs font-medium">Загрузка участников...</span>
              </div>
            ) : members.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#090C1B] border border-[#1E2442] text-center space-y-1">
                <p className="text-xs font-semibold text-slate-300">Других участников пока нет</p>
                <p className="text-[11px] text-slate-500">
                  {isOwner
                    ? 'Пригласите друзей или соавторов с помощью поиска выше.'
                    : 'В этом совместном плейлисте пока только создатель.'}
                </p>
              </div>
            ) : (
              members.map((member) => {
                const isMe = dbUser?.id === member.userId;
                const isActing = actionLoadingId === member.userId;

                return (
                  <div
                    key={`pl-member-${member.id}`}
                    className="p-3.5 rounded-2xl bg-[#090C1B] border border-[#1E2442] space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                          {member.avatar ? (
                            <img src={member.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-300 bg-slate-800">
                              {member.username.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white truncate">{member.username}</span>
                            {isMe && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[9px] font-bold">
                                Вы
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] font-bold uppercase">
                              Участник
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isOwner && (
                          <button
                            onClick={() => handleRemoveMember(member.userId)}
                            disabled={isActing}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                            title="Удалить участника"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        {isMe && !isOwner && (
                          <button
                            onClick={() => handleRemoveMember(member.userId)}
                            disabled={isActing}
                            className="px-2.5 py-1 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Покинуть</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Permissions Badges / Toggles */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 flex-wrap text-[11px]">
                      {isOwner ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleTogglePermission(member, 'canAddTracks')}
                            disabled={isActing}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                              member.canAddTracks
                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                : 'bg-slate-800/80 border-slate-700 text-slate-400'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            <span>Добавление треков: {member.canAddTracks ? 'Разрешено' : 'Запрещено'}</span>
                          </button>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                            <Check className="w-3 h-3" /> Может добавлять треки
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0B0E20] border-t border-[#1E2442] flex justify-between items-center shrink-0">
          <div className="text-[11px] text-slate-400">
            {isOwner ? '💡 Участники могут добавлять треки в этот плейлист' : '💡 Вы можете добавлять свои треки в этот плейлист'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
