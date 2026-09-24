import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Sparkles,
  Check,
  X,
  Loader2,
  AlertCircle,
  MessageSquare,
  Search,
  UserCheck,
  Flame,
  Radio,
  Clock,
  ExternalLink,
  Shield,
  Star,
  Layers,
  HeartHandshake,
  UserMinus,
} from 'lucide-react';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { TasteComparisonModal } from '../modals/TasteComparisonModal.tsx';
import { usePresence } from '../../hooks/usePresence.ts';
import { PresenceIndicator } from '../ui/PresenceIndicator.tsx';

interface FriendUser {
  id: number;
  username: string;
  avatar: string | null;
  bio: string | null;
  role?: string;
  createdAt?: string;
}

interface FriendRequestItem {
  id: number;
  status: string;
  createdAt: string;
  senderId?: number;
  receiverId?: number;
  username: string;
  avatar: string | null;
}

type FriendsTab = 'ALL' | 'ONLINE' | 'REQUESTS' | 'SEARCH' | 'RECOMMENDATIONS';

export const FriendsView: React.FC = () => {
  const { authFetch, dbUser, login } = useAuth();
  const { navigate } = useRouter();

  const [activeTab, setActiveTab] = useState<FriendsTab>('ALL');
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [requests, setRequests] = useState<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }>({
    incoming: [],
    outgoing: [],
  });
  const [recommendations, setRecommendations] = useState<FriendUser[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Send request by input state
  const [targetUsername, setTargetUsername] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [compareFriend, setCompareFriend] = useState<string | null>(null);
  const [friendToDelete, setFriendToDelete] = useState<FriendUser | null>(null);

  const handleRemoveFriend = async () => {
    if (!friendToDelete) return;
    setActionLoading(true);
    try {
      const res = await authFetch(`/api/friends/${friendToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`@${friendToDelete.username} удален из друзей`, 'success');
        setFriendToDelete(null);
        fetchFriendsAndRequests();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Ошибка удаления', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Presence map for all friends & recommendations
  const allUserIds = useMemo(() => {
    const set = new Set<number>();
    friends.forEach((f) => set.add(f.id));
    recommendations.forEach((r) => set.add(r.id));
    requests.incoming.forEach((req) => req.senderId && set.add(req.senderId));
    requests.outgoing.forEach((req) => req.receiverId && set.add(req.receiverId));
    return Array.from(set);
  }, [friends, recommendations, requests]);

  const presenceMap = usePresence(allUserIds);

  const fetchFriendsAndRequests = async () => {
    if (!dbUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [friendsRes, requestsRes, recRes] = await Promise.all([
        authFetch('/api/friends'),
        authFetch('/api/friends/requests'),
        authFetch('/api/friends/recommendations').catch(() => null),
      ]);

      if (friendsRes.ok) {
        const fData = await friendsRes.json();
        setFriends(fData);
      }
      if (requestsRes.ok) {
        const rData = await requestsRes.json();
        setRequests(rData);
      }
      if (recRes && recRes.ok) {
        const recData = await recRes.json();
        setRecommendations(recData);
      }
    } catch (err) {
      console.error('Failed to load friends:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFriendsAndRequests();
  }, [dbUser]);

  // Live user search debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await authFetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          // Exclude self
          setSearchResults(data.filter((u: any) => u.id !== dbUser?.id));
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, dbUser?.id]);

  const showToast = (text: string, type: 'success' | 'error') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const sendFriendRequest = async (usernameToSend: string) => {
    if (!usernameToSend.trim()) return;
    setActionLoading(true);
    try {
      const res = await authFetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUsername: usernameToSend.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Не удалось отправить заявку');
      }

      showToast(`Заявка отправлена пользователю @${usernameToSend.trim()}`, 'success');
      setTargetUsername('');
      setSearchQuery('');
      setSearchResults([]);
      fetchFriendsAndRequests();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestAction = async (requestId: number, action: 'ACCEPT' | 'DECLINE') => {
    try {
      const res = await authFetch(`/api/friends/request/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        showToast(action === 'ACCEPT' ? 'Заявка принята!' : 'Заявка отклонена', 'success');
        fetchFriendsAndRequests();
      }
    } catch (err) {
      console.error('Failed to handle friend request:', err);
      showToast('Ошибка обработки запроса', 'error');
    }
  };

  const openUserChat = (user: FriendUser | { id: number; username: string; avatar: string | null }) => {
    window.dispatchEvent(
      new CustomEvent('open_chat', {
        detail: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
        },
      })
    );
  };

  const onlineFriends = useMemo(() => {
    return friends.filter((f) => presenceMap[f.id]?.status === 'online');
  }, [friends, presenceMap]);

  if (!dbUser) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-6 animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-2xl bg-[#151932] border border-[#8B5CF6]/30 flex items-center justify-center mx-auto text-[#A78BFA] shadow-xl">
          <Users className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-[#F8FAFC]">Сообщество и друзья</h2>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Войдите в аккаунт, чтобы находить единомышленников, отслеживать прогресс друзей,
            сопоставлять вкусы и общаться в чате.
          </p>
        </div>
        <button
          onClick={() => login()}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-[#7C3AED]/25 transition-all cursor-pointer"
        >
          Войти в аккаунт
        </button>
      </div>
    );
  }

  const totalRequestsCount = requests.incoming.length + requests.outgoing.length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl border shadow-2xl flex items-center gap-2 text-xs font-medium animate-in slide-in-from-top-4 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header & Fast Add */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E2442] pb-6">
        <div>
          <h1 className="text-2xl font-black text-[#F8FAFC] tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-[#A78BFA]" />
            <span>Друзья & Сообщество</span>
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            Отслеживайте совместный прогресс, сравнивайте совпадение вкусов и общайтесь
          </p>
        </div>

        {/* Quick Add Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendFriendRequest(targetUsername);
          }}
          className="flex items-center gap-2 w-full sm:w-auto"
        >
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              placeholder="Добавить по @username..."
              value={targetUsername}
              onChange={(e) => setTargetUsername(e.target.value)}
              className="w-full pl-3.5 pr-8 py-2 rounded-xl bg-[#0B0D20] border border-[#1E2442] focus:border-[#8B5CF6] text-xs text-white placeholder-[#64748B] focus:outline-none transition-colors"
            />
            {targetUsername && (
              <button
                type="button"
                onClick={() => setTargetUsername('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!targetUsername.trim() || actionLoading}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-md shadow-[#7C3AED]/20"
          >
            {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            <span>Заявка</span>
          </button>
        </form>
      </div>

      {/* 1. Global Live Search Bar */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <input
            type="text"
            placeholder="Поиск пользователей по всей платформе..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] focus:border-[#8B5CF6]/60 text-xs text-white placeholder-[#64748B] focus:outline-none transition-colors shadow-inner"
          />
          {searchLoading && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B5CF6] animate-spin" />
          )}
        </div>

        {/* Live Search Results Dropdown */}
        {searchQuery.trim().length > 0 && (
          <div className="mt-2 p-3 rounded-2xl bg-[#0B0D20] border border-[#1E2442] shadow-2xl space-y-2">
            <div className="text-[11px] font-bold text-[#94A3B8] px-2 uppercase tracking-wider font-mono">
              Результаты поиска ({searchResults.length})
            </div>
            {searchResults.length === 0 && !searchLoading ? (
              <div className="p-4 text-center text-xs text-[#64748B]">
                Пользователи с таким именем не найдены
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {searchResults.map((usr) => {
                  const isAlreadyFriend = friends.some((f) => f.id === usr.id);
                  const isPendingSent = requests.outgoing.some((r) => r.username === usr.username);

                  return (
                    <div
                      key={usr.id}
                      className="p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/40 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div
                        onClick={() => navigate(`/u/${usr.username}`)}
                        className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                      >
                        <div className="relative">
                          {usr.avatar ? (
                            <img
                              src={usr.avatar}
                              alt={usr.username}
                              className="w-8 h-8 rounded-full object-cover bg-[#151932] border border-[#1E2442]"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[#A78BFA] text-xs font-bold">
                              {usr.username[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="absolute -bottom-0.5 -right-0.5">
                            <PresenceIndicator presence={presenceMap[usr.id]} size="sm" />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate hover:underline">
                            @{usr.username}
                          </div>
                          {usr.bio && (
                            <div className="text-[10px] text-[#94A3B8] truncate max-w-[140px]">
                              {usr.bio}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {isAlreadyFriend ? (
                          <span className="px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                            В друзьях
                          </span>
                        ) : isPendingSent ? (
                          <span className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                            Заявка отправлена
                          </span>
                        ) : (
                          <button
                            onClick={() => sendFriendRequest(usr.username)}
                            className="px-2.5 py-1 rounded-lg bg-[#151932] hover:bg-[#8B5CF6]/20 border border-[#1E2442] hover:border-[#8B5CF6]/40 text-[11px] font-semibold text-[#A78BFA] transition-colors cursor-pointer"
                          >
                            + Добавить
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-[#1E2442] pb-2">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeTab === 'ALL'
              ? 'bg-[#151932] text-white border border-[#8B5CF6]/40 shadow-md'
              : 'text-[#94A3B8] hover:text-white hover:bg-[#11152A]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Все</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#0B0D20] text-[#CBD5E1] font-mono">
            {friends.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('ONLINE')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeTab === 'ONLINE'
              ? 'bg-[#151932] text-white border border-[#8B5CF6]/40 shadow-md'
              : 'text-[#94A3B8] hover:text-white hover:bg-[#11152A]'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span>Онлайн</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#0B0D20] text-emerald-400 font-mono">
            {onlineFriends.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('REQUESTS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeTab === 'REQUESTS'
              ? 'bg-[#151932] text-white border border-[#8B5CF6]/40 shadow-md'
              : 'text-[#94A3B8] hover:text-white hover:bg-[#11152A]'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Запросы</span>
          {totalRequestsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-bold">
              {totalRequestsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('SEARCH')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeTab === 'SEARCH'
              ? 'bg-[#151932] text-white border border-[#8B5CF6]/40 shadow-md'
              : 'text-[#94A3B8] hover:text-white hover:bg-[#11152A]'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Поиск пользователей</span>
        </button>

        <button
          onClick={() => setActiveTab('RECOMMENDATIONS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeTab === 'RECOMMENDATIONS'
              ? 'bg-[#151932] text-white border border-[#8B5CF6]/40 shadow-md'
              : 'text-[#94A3B8] hover:text-white hover:bg-[#11152A]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-[#A78BFA]" />
          <span>Рекомендации</span>
          {recommendations.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#0B0D20] text-[#A78BFA] font-mono">
              {recommendations.length}
            </span>
          )}
        </button>
      </div>

      {/* 3. Tab Content */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#8B5CF6] mx-auto" />
          <span className="text-xs text-[#94A3B8]">Загрузка списка друзей...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* TAB: ALL FRIENDS */}
          {activeTab === 'ALL' && (
            <div>
              {friends.length === 0 ? (
                <div className="p-10 rounded-3xl bg-[#11152A] border border-[#1E2442] text-center space-y-3">
                  <Users className="w-10 h-10 text-[#64748B] mx-auto stroke-1" />
                  <h3 className="text-sm font-bold text-white">Список друзей пуст</h3>
                  <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
                    Используйте поиск выше или вкладку «Рекомендации», чтобы найти знакомых и делиться впечатлениями.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {friends.map((friend) => {
                    const isOnline = presenceMap[friend.id]?.status === 'online';
                    return (
                      <div
                        key={friend.id}
                        className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-all flex flex-col justify-between gap-3 shadow-lg group"
                      >
                        {/* Top: Avatar, Name, Status */}
                        <div className="flex items-start justify-between gap-3">
                          <div
                            onClick={() => navigate(`/u/${friend.username}`)}
                            className="flex items-center gap-3 cursor-pointer min-w-0"
                          >
                            <div className="relative">
                              {friend.avatar ? (
                                <img
                                  src={friend.avatar}
                                  alt={friend.username}
                                  className="w-11 h-11 rounded-2xl object-cover bg-[#151932] border border-[#1E2442]"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#7C3AED]/20 to-[#6366F1]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[#A78BFA] font-bold text-sm">
                                  {friend.username[0]?.toUpperCase()}
                                </div>
                              )}
                              {/* Small discreet dot indicator */}
                              <div className="absolute -bottom-0.5 -right-0.5">
                                <PresenceIndicator presence={presenceMap[friend.id]} size="sm" />
                              </div>
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-white group-hover:text-[#A78BFA] transition-colors truncate">
                                  @{friend.username}
                                </span>
                                {friend.role === 'SUPER_ADMIN' && (
                                  <Shield className="w-3 h-3 text-amber-400 shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] font-medium ${isOnline ? 'text-emerald-400' : 'text-[#64748B]'}`}>
                                  {isOnline ? 'В сети' : 'Не в сети'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => navigate(`/u/${friend.username}`)}
                            className="text-[#64748B] hover:text-white p-1 rounded-lg hover:bg-[#151932] transition-colors cursor-pointer"
                            title="Открыть профиль"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Bio if exists */}
                        {friend.bio && (
                          <p className="text-[11px] text-[#94A3B8] line-clamp-1 italic">
                            «{friend.bio}»
                          </p>
                        )}

                        {/* Actions bar */}
                        <div className="pt-2 border-t border-[#1E2442]/80 flex items-center gap-2">
                          <button
                            onClick={() => openUserChat(friend)}
                            className="flex-1 py-1.5 px-3 rounded-xl bg-[#151932] hover:bg-[#8B5CF6]/20 border border-[#1E2442] hover:border-[#8B5CF6]/40 text-xs font-semibold text-[#CBD5E1] hover:text-white inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-[#A78BFA]" />
                            <span>Чат</span>
                          </button>

                          <button
                            onClick={() => setCompareFriend(friend.username)}
                            className="py-1.5 px-3 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-semibold text-[#94A3B8] hover:text-white inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            title="Сравнить вкусы"
                          >
                            <HeartHandshake className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="hidden sm:inline">Вкусы</span>
                          </button>

                          <button
                            onClick={() => setFriendToDelete(friend)}
                            className="p-1.5 rounded-xl bg-[#11152A] hover:bg-rose-500/20 border border-[#1E2442] hover:border-rose-500/40 text-xs font-semibold text-[#64748B] hover:text-rose-400 inline-flex items-center justify-center transition-colors cursor-pointer"
                            title="Удалить из друзей"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: ONLINE FRIENDS */}
          {activeTab === 'ONLINE' && (
            <div>
              {onlineFriends.length === 0 ? (
                <div className="p-10 rounded-3xl bg-[#11152A] border border-[#1E2442] text-center space-y-3">
                  <span className="w-3 h-3 rounded-full bg-zinc-600 inline-block mx-auto" />
                  <h3 className="text-sm font-bold text-white">Сейчас никого нет в сети</h3>
                  <p className="text-xs text-[#94A3B8]">
                    Как только ваши друзья появятся на платформе, они отобразятся здесь.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {onlineFriends.map((friend) => (
                    <div
                      key={friend.id}
                      className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-emerald-500/40 transition-all flex flex-col justify-between gap-3 shadow-lg"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div
                          onClick={() => navigate(`/u/${friend.username}`)}
                          className="flex items-center gap-3 cursor-pointer min-w-0"
                        >
                          <div className="relative">
                            {friend.avatar ? (
                              <img
                                src={friend.avatar}
                                alt={friend.username}
                                className="w-11 h-11 rounded-2xl object-cover bg-[#151932] border border-[#1E2442]"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-2xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[#A78BFA] font-bold text-sm">
                                {friend.username[0]?.toUpperCase()}
                              </div>
                            )}
                            <div className="absolute -bottom-0.5 -right-0.5">
                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0B0D20] shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                            </div>
                          </div>

                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white truncate block">
                              @{friend.username}
                            </span>
                            <span className="text-[10px] font-medium text-emerald-400">В сети сейчас</span>
                          </div>
                        </div>

                        <button
                          onClick={() => openUserChat(friend)}
                          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-md shadow-[#7C3AED]/20"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Написать</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: SEARCH */}
          {activeTab === 'SEARCH' && (
            <div className="space-y-4">
              <div className="p-6 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                      <Search className="w-4 h-4 text-[#8B5CF6]" />
                      <span>Поиск пользователей</span>
                    </h3>
                    <p className="text-xs text-[#94A3B8]">Находите друзей по логину и отправляйте запросы</p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                    <input
                      type="text"
                      placeholder="Введите username..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] focus:border-[#8B5CF6] text-xs text-white placeholder-[#64748B] focus:outline-none transition-colors"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {searchLoading && (
                  <div className="py-8 text-center text-xs text-[#94A3B8] flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[#8B5CF6]" />
                    <span>Поиск...</span>
                  </div>
                )}

                {!searchLoading && searchResults.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                    {searchResults.map((usr) => {
                      const isAlreadyFriend = friends.some((f) => f.id === usr.id);
                      const isPendingSent = requests.outgoing.some((r) => r.username === usr.username);
                      const isOnline = presenceMap[usr.id]?.status === 'online';

                      return (
                        <div
                          key={usr.id}
                          className="p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/40 flex flex-col justify-between gap-3 transition-all"
                        >
                          <div
                            onClick={() => navigate(`/u/${usr.username}`)}
                            className="flex items-center gap-3 cursor-pointer min-w-0"
                          >
                            <div className="relative">
                              {usr.avatar ? (
                                <img
                                  src={usr.avatar}
                                  alt={usr.username}
                                  className="w-10 h-10 rounded-xl object-cover bg-[#151932] border border-[#1E2442]"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED]/20 to-[#6366F1]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[#A78BFA] font-bold text-sm">
                                  {usr.username[0]?.toUpperCase()}
                                </div>
                              )}
                              <div className="absolute -bottom-0.5 -right-0.5">
                                <PresenceIndicator presence={presenceMap[usr.id]} size="sm" />
                              </div>
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-white truncate block hover:text-[#A78BFA] transition-colors">
                                @{usr.username}
                              </span>
                              <span className={`text-[10px] ${isOnline ? 'text-emerald-400 font-medium' : 'text-[#64748B]'}`}>
                                {isOnline ? 'В сети' : 'Не в сети'}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-[#1E2442]/60 flex items-center justify-between gap-2">
                            <button
                              onClick={() => navigate(`/u/${usr.username}`)}
                              className="text-[11px] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
                            >
                              Профиль
                            </button>

                            {isAlreadyFriend ? (
                              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
                                В друзьях
                              </span>
                            ) : isPendingSent ? (
                              <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                                Заявка отправлена
                              </span>
                            ) : (
                              <button
                                onClick={() => sendFriendRequest(usr.username)}
                                disabled={actionLoading}
                                className="px-3 py-1 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white text-[11px] font-bold shadow-md cursor-pointer transition-all hover:brightness-110"
                              >
                                + Добавить
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!searchLoading && searchQuery && searchResults.length === 0 && (
                  <div className="py-8 text-center text-xs text-[#64748B]">
                    Пользователи с таким именем не найдены
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: REQUESTS */}
          {activeTab === 'REQUESTS' && (
            <div className="space-y-6">
              {/* Incoming Requests */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#F8FAFC] uppercase tracking-wider font-mono flex items-center gap-2">
                  <span>Входящие заявки</span>
                  <span className="px-2 py-0.2 rounded-full text-[10px] bg-[#151932] text-[#A78BFA]">
                    {requests.incoming.length}
                  </span>
                </h3>

                {requests.incoming.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-[#0B0D20] border border-[#1E2442] text-xs text-[#64748B] text-center">
                    Нет новых входящих запросов в друзья
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {requests.incoming.map((req) => (
                      <div
                        key={req.id}
                        className="p-3.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex items-center justify-between gap-3 shadow-md"
                      >
                        <div
                          onClick={() => navigate(`/u/${req.username}`)}
                          className="flex items-center gap-3 cursor-pointer min-w-0"
                        >
                          {req.avatar ? (
                            <img
                              src={req.avatar}
                              alt={req.username}
                              className="w-10 h-10 rounded-xl object-cover bg-[#151932] border border-[#1E2442]"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[#A78BFA] font-bold text-xs">
                              {req.username[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white truncate block hover:underline">
                              @{req.username}
                            </span>
                            <span className="text-[10px] text-[#64748B]">Хочет дружить</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleRequestAction(req.id, 'ACCEPT')}
                            className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                            title="Принять"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRequestAction(req.id, 'DECLINE')}
                            className="p-2 rounded-xl bg-[#151932] hover:bg-rose-500/20 border border-[#1E2442] hover:border-rose-500/30 text-[#94A3B8] hover:text-rose-400 transition-colors cursor-pointer"
                            title="Отклонить"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Outgoing Requests */}
              <div className="space-y-3 pt-4 border-t border-[#1E2442]">
                <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider font-mono flex items-center gap-2">
                  <span>Исходящие заявки</span>
                  <span className="px-2 py-0.2 rounded-full text-[10px] bg-[#151932] text-[#CBD5E1]">
                    {requests.outgoing.length}
                  </span>
                </h3>

                {requests.outgoing.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-[#0B0D20] border border-[#1E2442] text-xs text-[#64748B] text-center">
                    Нет ожидающих исходящих запросов
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {requests.outgoing.map((req) => (
                      <div
                        key={req.id}
                        className="p-3.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex items-center justify-between gap-3"
                      >
                        <div
                          onClick={() => navigate(`/u/${req.username}`)}
                          className="flex items-center gap-3 cursor-pointer min-w-0"
                        >
                          {req.avatar ? (
                            <img
                              src={req.avatar}
                              alt={req.username}
                              className="w-9 h-9 rounded-xl object-cover bg-[#151932] border border-[#1E2442]"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[#A78BFA] font-bold text-xs">
                              {req.username[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white truncate block">
                              @{req.username}
                            </span>
                            <span className="text-[10px] text-amber-400/80">Ожидает ответа</span>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono text-[#64748B]">В ожидании</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: RECOMMENDATIONS */}
          {activeTab === 'RECOMMENDATIONS' && (
            <div className="space-y-4">
              <div className="text-xs text-[#94A3B8]">
                Пользователи с активными медиа-коллекциями, оценками и списками:
              </div>

              {recommendations.length === 0 ? (
                <div className="p-8 rounded-3xl bg-[#11152A] border border-[#1E2442] text-center space-y-2">
                  <Sparkles className="w-8 h-8 text-[#64748B] mx-auto stroke-1" />
                  <p className="text-xs text-[#94A3B8]">Пока нет новых рекомендаций</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {recommendations.map((recUser) => (
                    <div
                      key={recUser.id}
                      className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-all flex flex-col justify-between gap-3 shadow-lg"
                    >
                      <div
                        onClick={() => navigate(`/u/${recUser.username}`)}
                        className="flex items-center gap-3 cursor-pointer min-w-0"
                      >
                        <div className="relative">
                          {recUser.avatar ? (
                            <img
                              src={recUser.avatar}
                              alt={recUser.username}
                              className="w-10 h-10 rounded-xl object-cover bg-[#151932] border border-[#1E2442]"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[#A78BFA] font-bold text-xs">
                              {recUser.username[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="absolute -bottom-0.5 -right-0.5">
                            <PresenceIndicator presence={presenceMap[recUser.id]} size="sm" />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <span className="text-xs font-bold text-white truncate block hover:underline">
                            @{recUser.username}
                          </span>
                          {recUser.bio ? (
                            <span className="text-[10px] text-[#94A3B8] truncate block">
                              {recUser.bio}
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#64748B]">Участник Dodik Tracker</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#1E2442] flex items-center justify-between gap-2">
                        <button
                          onClick={() => setCompareFriend(recUser.username)}
                          className="text-[11px] font-semibold text-[#A78BFA] hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <HeartHandshake className="w-3.5 h-3.5" />
                          <span>Сравнить</span>
                        </button>

                        <button
                          onClick={() => sendFriendRequest(recUser.username)}
                          className="px-3 py-1.5 rounded-xl bg-[#151932] hover:bg-[#8B5CF6]/20 border border-[#1E2442] hover:border-[#8B5CF6]/40 text-xs font-semibold text-[#CBD5E1] hover:text-white transition-colors cursor-pointer"
                        >
                          + Добавить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Taste Comparison Modal */}
      {compareFriend && (
        <TasteComparisonModal
          friendUsername={compareFriend}
          onClose={() => setCompareFriend(null)}
        />
      )}

      {/* Delete Friend Confirmation Modal */}
      {friendToDelete && (
        <ConfirmModal
          isOpen={Boolean(friendToDelete)}
          title="Удалить из друзей"
          message={`Вы уверены, что хотите удалить @${friendToDelete.username} из списка друзей?`}
          confirmText="Удалить"
          cancelText="Отмена"
          variant="danger"
          loading={actionLoading}
          onConfirm={handleRemoveFriend}
          onCancel={() => setFriendToDelete(null)}
        />
      )}
    </div>
  );
};
