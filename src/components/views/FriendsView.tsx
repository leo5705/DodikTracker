import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Sparkles, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { TasteComparisonModal } from '../modals/TasteComparisonModal.tsx';

export const FriendsView: React.FC = () => {
  const { authFetch, dbUser, login } = useAuth();
  const { navigate } = useRouter();
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<{ incoming: any[]; outgoing: any[] }>({
    incoming: [],
    outgoing: [],
  });
  const [activeTab, setActiveTab] = useState<'friends' | 'incoming' | 'outgoing'>('friends');
  const [targetUsername, setTargetUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [compareFriend, setCompareFriend] = useState<string | null>(null);

  const fetchFriendsAndRequests = async () => {
    if (!dbUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        authFetch('/api/friends'),
        authFetch('/api/friends/requests'),
      ]);

      if (friendsRes.ok) {
        const fData = await friendsRes.json();
        setFriends(fData);
      }
      if (requestsRes.ok) {
        const rData = await requestsRes.json();
        setRequests(rData);
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

  const sendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUsername.trim()) return;

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authFetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUsername: targetUsername.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Не удалось отправить заявку');
      }

      setSuccess(`Заявка отправлена пользователю @${targetUsername.trim()}`);
      setTargetUsername('');
      fetchFriendsAndRequests();
    } catch (err: any) {
      setError(err.message);
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
        fetchFriendsAndRequests();
      }
    } catch (err) {
      console.error('Failed to handle friend request:', err);
    }
  };

  if (!dbUser) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-purple-950/60 border border-purple-800/40 flex items-center justify-center mx-auto text-purple-400">
          <Users className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-zinc-100 font-mono">ДРУЗЬЯ</h2>
        <p className="text-xs text-zinc-400">
          Войдите в аккаунт, чтобы находить друзей, сравнивать кинематографические и игровые вкусы.
        </p>
        <button
          onClick={() => login()}
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/30"
        >
          Войти в аккаунт
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-zinc-100 font-mono tracking-tight flex items-center gap-2">
          <Users className="w-6 h-6 text-purple-400" />
          ДРУЗЬЯ & ЗНАКОМЫЕ
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Отслеживайте активность друзей, сопоставляйте вкусы и делитесь находками
        </p>
      </div>

      {/* Add Friend Input Box */}
      <form
        onSubmit={sendRequest}
        className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-lg"
      >
        <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
          <UserPlus className="w-4 h-4 text-purple-400" />
          Добавить в друзья по никнейму
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={targetUsername}
            onChange={(e) => setTargetUsername(e.target.value)}
            placeholder="Введите никнейм друга..."
            className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
          />
          <button
            type="submit"
            disabled={actionLoading || !targetUsername.trim()}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md transition-all disabled:opacity-50"
          >
            {actionLoading ? 'Отправка...' : 'Отправить заявку'}
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/40 text-xs text-red-300 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-300">
            {success}
          </div>
        )}
      </form>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('friends')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'friends'
              ? 'bg-purple-600 text-white shadow'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Мои друзья ({friends.length})
        </button>
        <button
          onClick={() => setActiveTab('incoming')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'incoming'
              ? 'bg-purple-600 text-white shadow'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Входящие ({requests.incoming.length})
          {requests.incoming.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('outgoing')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'outgoing'
              ? 'bg-purple-600 text-white shadow'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Исходящие ({requests.outgoing.length})
        </button>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-xs text-zinc-400">Загрузка друзей...</p>
        </div>
      ) : activeTab === 'friends' ? (
        friends.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {friends.map((f) => (
              <div
                key={f.id}
                className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3 shadow-md"
              >
                <div
                  onClick={() => navigate(`/u/${f.username}`)}
                  className="flex items-center gap-3 min-w-0 cursor-pointer group"
                >
                  {f.avatar ? (
                    <img
                      src={f.avatar}
                      alt={f.username}
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-full object-cover ring-2 ring-purple-500/30 shrink-0 group-hover:ring-purple-400 transition-all"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-purple-900/80 flex items-center justify-center text-sm font-bold text-purple-200 shrink-0 group-hover:bg-purple-800 transition-colors">
                      {f.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-100 group-hover:text-purple-300 transition-colors truncate">@{f.username}</p>
                    {f.bio && <p className="text-xs text-zinc-400 truncate">{f.bio}</p>}
                  </div>
                </div>

                <button
                  onClick={() => setCompareFriend(f.username)}
                  className="px-3 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-800/50 text-purple-300 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Сравнить вкусы
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center space-y-3 bg-zinc-900/30 rounded-2xl border border-zinc-800 p-8">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-200 font-mono">
              У вас пока нет друзей
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Найдите других участников или отправьте заявку по никнейму через форму выше!
            </p>
          </div>
        )
      ) : activeTab === 'incoming' ? (
        requests.incoming.length > 0 ? (
          <div className="space-y-3">
            {requests.incoming.map((req) => (
              <div
                key={req.id}
                className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  {req.avatar ? (
                    <img
                      src={req.avatar}
                      alt={req.username}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-purple-900 flex items-center justify-center text-xs font-bold text-purple-200">
                      {req.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-zinc-100">@{req.username}</p>
                    <p className="text-[11px] text-zinc-400">Хочет добавить вас в друзья</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleRequestAction(req.id, 'ACCEPT')}
                    className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/40 transition-colors"
                    title="Принять"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRequestAction(req.id, 'DECLINE')}
                    className="p-2 rounded-xl bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/40 transition-colors"
                    title="Отклонить"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-zinc-400 bg-zinc-900/30 rounded-2xl border border-zinc-800 p-6">
            Входящих заявок нет.
          </div>
        )
      ) : requests.outgoing.length > 0 ? (
        <div className="space-y-3">
          {requests.outgoing.map((req) => (
            <div
              key={req.id}
              className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 font-bold">
                  {req.username.charAt(0).toUpperCase()}
                </div>
                <p className="text-xs font-semibold text-zinc-200">@{req.username}</p>
              </div>
              <span className="text-[11px] text-zinc-400">Ожидает ответа</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-12 text-center text-xs text-zinc-400 bg-zinc-900/30 rounded-2xl border border-zinc-800 p-6">
          Исходящих заявок нет.
        </div>
      )}

      {/* Comparison Modal */}
      {compareFriend && (
        <TasteComparisonModal
          friendUsername={compareFriend}
          onClose={() => setCompareFriend(null)}
        />
      )}
    </div>
  );
};
