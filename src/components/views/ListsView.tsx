import React, { useState, useEffect } from 'react';
import { ListOrdered, Plus, Lock, Globe, X, Film, Check, Loader2, Sparkles, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

export const ListsView: React.FC = () => {
  const { authFetch, dbUser, login } = useAuth();
  const { navigate } = useRouter();
  const [lists, setLists] = useState<any[]>([]);
  const [selectedList, setSelectedList] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [creating, setCreating] = useState(false);

  // Search items inside list
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchLists = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/lists');
      if (res.ok) {
        const data = await res.json();
        setLists(data);
      }
    } catch (err) {
      console.error('Failed to load lists:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLists();
  }, [dbUser]);

  const openList = async (id: number) => {
    try {
      const res = await authFetch(`/api/lists/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedList(data);
      }
    } catch (err) {
      console.error('Failed to fetch list detail:', err);
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    try {
      const res = await authFetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, visibility }),
      });
      if (res.ok) {
        setTitle('');
        setDescription('');
        setShowCreateModal(false);
        fetchLists();
      }
    } catch (err) {
      console.error('Failed to create list:', err);
    } finally {
      setCreating(false);
    }
  };

  const searchMediaForItem = async (q: string) => {
    setItemSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await authFetch(`/api/media/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.error('Search in list failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const addItemToList = async (mediaItem: any) => {
    if (!selectedList) return;
    try {
      // First ensure media is in library or db
      const addMediaRes = await authFetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaPayload: mediaItem, status: 'PLAN_TO_WATCH' }),
      });
      const userMediaData = await addMediaRes.json();

      await authFetch(`/api/lists/${selectedList.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: userMediaData.mediaId }),
      });

      // Refresh list
      openList(selectedList.id);
      setItemSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      console.error('Failed to add item to list:', err);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-100 font-mono tracking-tight flex items-center gap-2">
            <ListOrdered className="w-6 h-6 text-purple-400" />
            СПИСКИ & КОЛЛЕКЦИИ
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Тематические подборки, совместные списки для просмотра и персональные марафоны
          </p>
        </div>

        <button
          onClick={() => {
            if (!dbUser) login();
            else setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-950/30 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Создать коллекцию
        </button>
      </div>

      {/* Main content: list cards or active list detail */}
      {selectedList ? (
        <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-6 shadow-xl">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <button
                onClick={() => setSelectedList(null)}
                className="text-xs text-purple-400 hover:text-purple-300 font-medium mb-2 inline-block"
              >
                ← Вернуться ко всем спискам
              </button>
              <h2 className="text-xl font-black text-zinc-100 font-mono">{selectedList.title}</h2>
              {selectedList.description && (
                <p className="text-xs text-zinc-400 max-w-xl">{selectedList.description}</p>
              )}
              <p className="text-[11px] text-zinc-400 font-mono pt-1">
                Автор: @{selectedList.ownerUsername}
              </p>
            </div>
          </div>

          {/* Add item to list search box */}
          {dbUser && (
            <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
              <label className="text-xs font-semibold text-zinc-300">
                Добавить фильм, игру или сериал в этот список
              </label>
              <input
                type="text"
                value={itemSearchQuery}
                onChange={(e) => searchMediaForItem(e.target.value)}
                placeholder="Поиск по названию для добавления..."
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />

              {searchResults.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {searchResults.map((it, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-100 truncate">{it.title}</p>
                        <p className="text-[10px] text-zinc-400">{it.type} {it.year || ''}</p>
                      </div>
                      <button
                        onClick={() => addItemToList(it)}
                        className="p-1.5 rounded-lg bg-purple-600/20 text-purple-300 hover:bg-purple-600 hover:text-white transition-colors shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Items in list */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
              Тайтлы в списке ({selectedList.items?.length || 0})
            </h3>
            {selectedList.items && selectedList.items.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {selectedList.items.map((it: any) => (
                  <div
                    key={it.id}
                    className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2"
                  >
                    <div className="aspect-[2/3] rounded-lg bg-zinc-900 overflow-hidden">
                      {it.posterUrl ? (
                        <img
                          src={it.posterUrl}
                          alt={it.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">
                          Нет постера
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-bold text-zinc-100 truncate">{it.title}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-zinc-400 bg-zinc-950/40 rounded-2xl border border-zinc-800/60 p-6">
                В этом списке пока нет тайтлов. Добавьте первый фильм или игру через форму выше!
              </div>
            )}
          </div>
        </div>
      ) : loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-xs text-zinc-400">Загрузка списков...</p>
        </div>
      ) : lists.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((lst) => (
            <div
              key={lst.id}
              onClick={() => navigate(`/lists/${lst.id}`)}
              role="link"
              tabIndex={0}
              className="group p-5 rounded-3xl bg-[#14131A] border border-[#252233] hover:border-[#AC82FF]/60 cursor-pointer transition-all shadow-lg hover:-translate-y-1 space-y-3 text-left"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1F1C2E] text-[#AC82FF] border border-[#3A344E] font-mono flex items-center gap-1">
                  {lst.visibility === 'PUBLIC' ? (
                    <Globe className="w-3 h-3 text-emerald-400" />
                  ) : lst.visibility === 'FRIENDS_ONLY' ? (
                    <Users className="w-3 h-3 text-amber-400" />
                  ) : (
                    <Lock className="w-3 h-3 text-rose-400" />
                  )}
                  {lst.visibility === 'PUBLIC' ? 'Публичный' : lst.visibility === 'FRIENDS_ONLY' ? 'Для друзей' : 'Приватный'}
                </span>
                <span className="text-[11px] text-[#9A94AA]">@{lst.ownerUsername}</span>
              </div>

              <h3 className="text-sm font-bold text-[#F3F1F8] group-hover:text-[#AC82FF] transition-colors">
                {lst.title}
              </h3>
              {lst.description && (
                <p className="text-xs text-[#9A94AA] line-clamp-2 leading-relaxed">{lst.description}</p>
              )}
              <div className="pt-2 flex items-center justify-between text-[11px] text-[#AC82FF] font-medium border-t border-[#252233]/60">
                <span>Коллекция</span>
                <span className="group-hover:translate-x-0.5 transition-transform">Открыть список →</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center space-y-3 bg-zinc-900/30 rounded-2xl border border-zinc-800 p-8 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
            <ListOrdered className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-200 font-mono">У вас пока нет списков</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Создайте свою первую коллекцию или совместный список для просмотра с друзьями!
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                if (!dbUser) login();
                else setShowCreateModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md"
            >
              Создать первый список
            </button>
          </div>
        </div>
      )}

      {/* Create List Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateList}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-100 font-mono">НОВАЯ КОЛЛЕКЦИЯ</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Название списка</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Любимый киберпанк или Лучшие игры 2026"
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Описание (необязательно)</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Для чего этот список..."
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Видимость</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility('PUBLIC')}
                  className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition-all ${
                    visibility === 'PUBLIC'
                      ? 'bg-purple-600 text-white border-purple-500'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                  }`}
                >
                  Публичный
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('PRIVATE')}
                  className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition-all ${
                    visibility === 'PRIVATE'
                      ? 'bg-purple-600 text-white border-purple-500'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                  }`}
                >
                  Только для меня
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-zinc-200"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md"
              >
                {creating ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
