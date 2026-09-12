import React, { useState, useEffect } from 'react';
import { Layers, Plus, Save, Film, Check, Loader2, Sparkles, Trash2, Globe, Lock, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

interface TierItem {
  id: number;
  title: string;
  posterUrl?: string;
  tierId: string; // 's' | 'a' | 'b' | 'c' | 'd' | 'f' | 'unranked'
}

export const TierListsView: React.FC = () => {
  const { authFetch, dbUser, login } = useAuth();
  const { navigate } = useRouter();
  const [tierLists, setTierLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTierList, setActiveTierList] = useState<any | null>(null);

  // Editor states
  const [title, setTitle] = useState('Мой персональный топ');
  const [items, setItems] = useState<TierItem[]>([]);
  const [userLibrary, setUserLibrary] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const defaultTiers = [
    { id: 's', label: 'S', color: 'bg-red-600 text-white' },
    { id: 'a', label: 'A', color: 'bg-orange-600 text-white' },
    { id: 'b', label: 'B', color: 'bg-amber-500 text-black' },
    { id: 'c', label: 'C', color: 'bg-emerald-600 text-white' },
    { id: 'd', label: 'D', color: 'bg-blue-600 text-white' },
    { id: 'f', label: 'F', color: 'bg-zinc-600 text-white' },
  ];

  const fetchTierLists = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/tier-lists');
      if (res.ok) {
        const data = await res.json();
        setTierLists(data);
      }
    } catch (err) {
      console.error('Failed to load tier lists:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUserLibraryForPicker = async () => {
    if (!dbUser) return;
    try {
      const res = await authFetch('/api/library');
      if (res.ok) {
        const data = await res.json();
        setUserLibrary(data);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    }
  };

  useEffect(() => {
    fetchTierLists();
    loadUserLibraryForPicker();
  }, [dbUser]);

  const createNewTierList = () => {
    if (!dbUser) {
      login();
      return;
    }
    setTitle('Мой персональный топ');
    // Preload top items from library
    const initialItems: TierItem[] = userLibrary.slice(0, 10).map((m) => ({
      id: m.mediaId,
      title: m.title,
      posterUrl: m.posterUrl,
      tierId: 'unranked',
    }));
    setItems(initialItems);
    setActiveTierList({ isNew: true });
  };

  const addMediaToEditor = (m: any) => {
    if (items.some((i) => i.id === m.mediaId)) return;
    setItems((prev) => [
      ...prev,
      {
        id: m.mediaId,
        title: m.title,
        posterUrl: m.posterUrl,
        tierId: 'unranked',
      },
    ]);
  };

  const moveItem = (itemId: number, targetTierId: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, tierId: targetTierId } : i))
    );
  };

  const removeItem = (itemId: number) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const saveTierList = async () => {
    if (!dbUser) return;
    setSaving(true);
    setSavedSuccess(false);

    try {
      const res = await authFetch('/api/tier-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category: 'ALL',
          tiersJson: JSON.stringify(defaultTiers),
          itemsJson: JSON.stringify(items),
          visibility: 'PUBLIC',
        }),
      });

      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
        fetchTierLists();
      }
    } catch (err) {
      console.error('Save tier list error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-100 font-mono tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-purple-400" />
            TIER LISTS & ТОПЫ
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Ранжируйте любимые фильмы, франшизы и игры от S-ранга до F-ранга
          </p>
        </div>

        <button
          onClick={createNewTierList}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-950/30 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Создать Tier List
        </button>
      </div>

      {/* Interactive Tier List Editor */}
      {activeTierList ? (
        <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-6 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-lg font-black font-mono text-zinc-100 bg-transparent border-b border-zinc-700 focus:outline-none focus:border-purple-500 pb-1"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTierList(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-zinc-200"
              >
                Закрыть
              </button>
              <button
                onClick={saveTierList}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md transition-all"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    Сохранено!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {saving ? 'Сохранение...' : 'Опубликовать'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Tiers Rows */}
          <div className="space-y-2 rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950/80 p-2">
            {defaultTiers.map((tier) => {
              const tierItems = items.filter((i) => i.tierId === tier.id);
              return (
                <div
                  key={tier.id}
                  className="flex items-stretch min-h-24 rounded-xl bg-zinc-900/60 border border-zinc-800/80 overflow-hidden"
                >
                  {/* Tier label badge */}
                  <div
                    className={`w-20 shrink-0 flex items-center justify-center font-black text-xl font-mono ${tier.color}`}
                  >
                    {tier.label}
                  </div>

                  {/* Items row */}
                  <div className="flex-1 p-2.5 flex flex-wrap items-center gap-2">
                    {tierItems.map((it) => (
                      <div
                        key={it.id}
                        className="group relative w-16 h-22 rounded-lg bg-zinc-950 overflow-hidden border border-zinc-700 shadow shrink-0"
                      >
                        {it.posterUrl ? (
                          <img
                            src={it.posterUrl}
                            alt={it.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 text-center p-1">
                            {it.title}
                          </div>
                        )}

                        {/* Quick move dropdown overlay */}
                        <div className="absolute inset-0 bg-black/90 opacity-0 group-hover:opacity-100 flex flex-col justify-between p-1 transition-opacity">
                          <button
                            onClick={() => removeItem(it.id)}
                            className="text-red-400 self-end p-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <div className="grid grid-cols-3 gap-0.5">
                            {['s', 'a', 'b', 'c', 'd', 'f'].map((tid) => (
                              <button
                                key={tid}
                                onClick={() => moveItem(it.id, tid)}
                                className="text-[9px] font-bold uppercase rounded bg-zinc-800 text-zinc-200 hover:bg-purple-600"
                              >
                                {tid}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                    {tierItems.length === 0 && (
                      <span className="text-[11px] text-zinc-400 italic">
                        Переместите тайтлы сюда
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Unranked Tray */}
          <div className="p-4 rounded-2xl bg-zinc-950/90 border border-zinc-800 space-y-3">
            <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
              Пул тайтлов для ранжирования ({items.filter((i) => i.tierId === 'unranked').length})
            </h4>

            <div className="flex flex-wrap gap-2.5 min-h-20 p-2 rounded-xl bg-zinc-900/40 border border-zinc-800/60">
              {items
                .filter((i) => i.tierId === 'unranked')
                .map((it) => (
                  <div
                    key={it.id}
                    className="w-16 h-22 rounded-lg bg-zinc-950 border border-zinc-700 overflow-hidden relative group shrink-0"
                  >
                    {it.posterUrl ? (
                      <img
                        src={it.posterUrl}
                        alt={it.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 p-1 text-center">
                        {it.title}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/85 opacity-0 group-hover:opacity-100 flex flex-col justify-center gap-1 p-1 transition-opacity">
                      <div className="grid grid-cols-3 gap-1">
                        {['s', 'a', 'b', 'c', 'd', 'f'].map((tid) => (
                          <button
                            key={tid}
                            onClick={() => moveItem(it.id, tid)}
                            className="text-[10px] font-bold uppercase py-0.5 rounded bg-zinc-800 text-zinc-200 hover:bg-purple-600"
                          >
                            {tid}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {/* Quick add from library */}
            {userLibrary.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <p className="text-[11px] text-zinc-400">Добавить из библиотеки:</p>
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {userLibrary.map((m) => (
                    <button
                      key={m.mediaId}
                      onClick={() => addMediaToEditor(m)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800/70 hover:bg-purple-900/60 border border-zinc-700 text-xs text-zinc-200 whitespace-nowrap transition-colors"
                    >
                      + {m.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-xs text-zinc-400">Загрузка Tier Lists...</p>
        </div>
      ) : tierLists.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tierLists.map((tl) => (
            <div
              key={tl.id}
              onClick={() => navigate(`/tier-lists/${tl.id}`)}
              role="link"
              tabIndex={0}
              className="p-5 rounded-3xl bg-[#14131A] border border-[#252233] hover:border-fuchsia-500/50 transition-all shadow-lg space-y-3 cursor-pointer hover:-translate-y-1 group text-left"
            >
              <div className="flex items-center justify-between text-xs text-[#9A94AA] font-mono">
                <span className="group-hover:text-fuchsia-300 transition-colors">@{tl.ownerUsername}</span>
                <span className="flex items-center gap-1">
                  {tl.visibility === 'PUBLIC' ? (
                    <Globe className="w-3 h-3 text-emerald-400" />
                  ) : tl.visibility === 'FRIENDS_ONLY' ? (
                    <Users className="w-3 h-3 text-amber-400" />
                  ) : (
                    <Lock className="w-3 h-3 text-rose-400" />
                  )}
                  {new Date(tl.createdAt).toLocaleDateString('ru-RU')}
                </span>
              </div>
              <h3 className="text-base font-bold text-[#F3F1F8] font-mono group-hover:text-fuchsia-300 transition-colors">
                {tl.title}
              </h3>
              {tl.description && (
                <p className="text-xs text-[#9A94AA] line-clamp-2 leading-relaxed">
                  {tl.description}
                </p>
              )}
              <div className="pt-2 flex items-center justify-between text-[11px] text-[#AC82FF] font-medium border-t border-[#252233]/60">
                <span>{tl.category || 'МЕДИА'}</span>
                <span className="group-hover:translate-x-0.5 transition-transform">Открыть тир-лист →</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center space-y-3 bg-zinc-900/30 rounded-2xl border border-zinc-800 p-8 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-200 font-mono">Tier Lists пока нет</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Создайте свой первый персональный рейтинг фильмов, аниме или игр!
          </p>
          <div className="pt-2">
            <button
              onClick={createNewTierList}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md"
            >
              Создать первый Tier List
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
