import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Loader2,
  Globe,
  Users,
  Lock,
  X,
  Search,
  Sparkles,
  Calendar,
  Film,
  Gamepad2,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

export const TIER_CATEGORIES = [
  { id: 'MOVIES_TV', label: 'Фильмы и сериалы', icon: Film, color: 'text-sky-400 bg-sky-950/40 border-sky-800/40' },
  { id: 'GAME', label: 'Игры', icon: Gamepad2, color: 'text-purple-400 bg-purple-950/40 border-purple-800/40' },
  { id: 'ANIME', label: 'Аниме', icon: Sparkles, color: 'text-pink-400 bg-pink-950/40 border-pink-800/40' },
  { id: 'MANGA', label: 'Манга', icon: BookOpen, color: 'text-amber-400 bg-amber-950/40 border-amber-800/40' },
  { id: 'BOOK', label: 'Книги', icon: BookOpen, color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40' },
  { id: 'COMIC', label: 'Комиксы', icon: Sparkles, color: 'text-rose-400 bg-rose-950/40 border-rose-800/40' },
];

export const TierListsView: React.FC = () => {
  const { authFetch, dbUser, login } = useAuth();
  const { navigate } = useRouter();

  const [tierLists, setTierLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<string>('ALL');

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('MOVIES_TV');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchTierLists = async () => {
    setLoading(true);
    try {
      let endpoint = '/api/tier-lists';
      if (selectedTab === 'MY') {
        endpoint = '/api/tier-lists/my';
      } else if (selectedTab !== 'ALL') {
        endpoint = `/api/tier-lists?category=${encodeURIComponent(selectedTab)}`;
      }

      const res = await authFetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setTierLists(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load tier lists:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTierLists();
  }, [selectedTab, dbUser]);

  const handleOpenCreateModal = () => {
    if (!dbUser) {
      login();
      return;
    }
    setTitle('');
    setDescription('');
    setCategory('MOVIES_TV');
    setVisibility('PUBLIC');
    setCreateError(null);
    setShowCreateModal(true);
  };

  const handleCreateTierList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    setCreateError(null);

    const defaultTiers = [
      { id: 's', label: 'S', color: 'bg-red-600 text-white' },
      { id: 'a', label: 'A', color: 'bg-orange-600 text-white' },
      { id: 'b', label: 'B', color: 'bg-amber-500 text-black' },
      { id: 'c', label: 'C', color: 'bg-emerald-600 text-white' },
      { id: 'd', label: 'D', color: 'bg-blue-600 text-white' },
    ];

    try {
      const res = await authFetch('/api/tier-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description ? description.trim() : null,
          category,
          visibility,
          tiersJson: JSON.stringify(defaultTiers),
          itemsJson: JSON.stringify([]),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Ошибка при создании тир-листа');
      }

      const created = await res.json();
      setShowCreateModal(false);
      navigate(`/tier-lists/${created.id}`);
    } catch (err: any) {
      console.error('Create tier list error:', err);
      setCreateError(err.message || 'Не удалось создать тир-лист');
    } finally {
      setCreating(false);
    }
  };

  const getCategoryMeta = (catId: string) => {
    const found = TIER_CATEGORIES.find((c) => c.id === catId || c.id === catId?.toUpperCase());
    if (found) return found;
    return {
      id: catId,
      label: catId || 'МЕДИА',
      icon: Layers,
      color: 'text-zinc-400 bg-zinc-900 border-zinc-800',
    };
  };

  return (
    <div className="space-y-8 pb-16 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#F3F1F8] font-mono tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-fuchsia-950/60 border border-fuchsia-800/40 flex items-center justify-center text-fuchsia-400">
              <Layers className="w-5 h-5" />
            </div>
            TIER LISTS
          </h1>
          <p className="text-xs sm:text-sm text-[#9A94AA] mt-1">
            Ранжируйте любимые тайтлы по категориям от S-ранга до D-ранга
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold font-mono shadow-lg shadow-fuchsia-950/40 transition-all self-start sm:self-auto active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Создать Tier List
        </button>
      </div>

      {/* Categories Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
        <button
          onClick={() => setSelectedTab('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold font-mono whitespace-nowrap transition-all ${
            selectedTab === 'ALL'
              ? 'bg-fuchsia-600 text-white shadow-md shadow-fuchsia-950/30'
              : 'bg-[#14131A] text-[#9A94AA] hover:text-[#F3F1F8] border border-[#252233]'
          }`}
        >
          Все тир-листы
        </button>

        {dbUser && (
          <button
            onClick={() => setSelectedTab('MY')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold font-mono whitespace-nowrap transition-all ${
              selectedTab === 'MY'
                ? 'bg-fuchsia-600 text-white shadow-md shadow-fuchsia-950/30'
                : 'bg-[#14131A] text-[#9A94AA] hover:text-[#F3F1F8] border border-[#252233]'
            }`}
          >
            👤 Мои тир-листы
          </button>
        )}

        {TIER_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isSelected = selectedTab === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedTab(cat.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold font-mono whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-fuchsia-600 text-white shadow-md shadow-fuchsia-950/30'
                  : 'bg-[#14131A] text-[#9A94AA] hover:text-[#F3F1F8] border border-[#252233]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tier Lists Grid */}
      {loading ? (
        <div className="py-28 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-fuchsia-400 animate-spin" />
          <p className="text-xs text-[#9A94AA] font-mono">Загрузка тир-листов...</p>
        </div>
      ) : tierLists.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tierLists.map((tl) => {
            const catMeta = getCategoryMeta(tl.category);
            const CatIcon = catMeta.icon;

            return (
              <div
                key={tl.id}
                onClick={() => navigate(`/tier-lists/${tl.id}`)}
                role="link"
                tabIndex={0}
                className="flex flex-col justify-between p-5 rounded-3xl bg-[#14131A] border border-[#252233] hover:border-fuchsia-500/50 transition-all shadow-xl hover:-translate-y-1 group text-left cursor-pointer space-y-4"
              >
                <div className="space-y-3">
                  {/* Top metadata */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold font-mono border ${catMeta.color}`}
                    >
                      <CatIcon className="w-3 h-3" />
                      {catMeta.label}
                    </span>

                    <span className="flex items-center gap-1 text-[11px] text-[#9A94AA] font-mono">
                      {tl.visibility === 'PUBLIC' ? (
                        <Globe className="w-3 h-3 text-emerald-400" />
                      ) : tl.visibility === 'FRIENDS_ONLY' ? (
                        <Users className="w-3 h-3 text-amber-400" />
                      ) : (
                        <Lock className="w-3 h-3 text-rose-400" />
                      )}
                      <span>{new Date(tl.createdAt).toLocaleDateString('ru-RU')}</span>
                    </span>
                  </div>

                  {/* Title & description */}
                  <div>
                    <h3 className="text-base font-bold text-[#F3F1F8] font-mono group-hover:text-fuchsia-300 transition-colors line-clamp-1">
                      {tl.title}
                    </h3>
                    {tl.description ? (
                      <p className="text-xs text-[#9A94AA] line-clamp-2 mt-1 leading-relaxed">
                        {tl.description}
                      </p>
                    ) : (
                      <p className="text-xs text-[#6B667B] italic mt-1">Без описания</p>
                    )}
                  </div>
                </div>

                {/* Preview Posters Strip */}
                <div className="space-y-3 pt-2 border-t border-[#252233]/70">
                  {tl.previewPosters && tl.previewPosters.length > 0 ? (
                    <div className="flex items-center gap-1.5 overflow-hidden h-14">
                      {tl.previewPosters.slice(0, 5).map((posterUrl: string, pIdx: number) => (
                        <div
                          key={pIdx}
                          className="w-10 h-14 rounded-lg overflow-hidden bg-[#201D2C] border border-[#2E2A40] shrink-0"
                        >
                          <img
                            src={posterUrl}
                            alt="Media poster"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                      {tl.itemCount > 5 && (
                        <div className="w-10 h-14 rounded-lg bg-[#191724] border border-[#252233] flex items-center justify-center text-[10px] font-mono text-[#9A94AA] shrink-0">
                          +{tl.itemCount - 5}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-14 flex items-center justify-center rounded-xl bg-[#191724]/40 border border-dashed border-[#252233] text-[11px] text-[#6B667B] font-mono">
                      Тайтлы еще не добавлены
                    </div>
                  )}

                  {/* Bottom Footer */}
                  <div className="flex items-center justify-between text-xs text-[#9A94AA] pt-1">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-fuchsia-950 flex items-center justify-center text-[9px] font-bold text-fuchsia-300 overflow-hidden">
                        {tl.ownerAvatar ? (
                          <img src={tl.ownerAvatar} alt={tl.ownerUsername} className="w-full h-full object-cover" />
                        ) : (
                          (tl.ownerUsername?.[0] || 'U').toUpperCase()
                        )}
                      </div>
                      <span className="font-mono text-[11px]">@{tl.ownerUsername}</span>
                    </div>

                    <div className="flex items-center gap-1 text-fuchsia-400 font-mono text-[11px] font-semibold group-hover:translate-x-1 transition-transform">
                      <span>{tl.itemCount || 0} тайтлов</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-20 text-center space-y-4 bg-[#14131A] rounded-3xl border border-[#252233] p-8 max-w-lg mx-auto animate-fadeIn">
          <div className="w-14 h-14 rounded-2xl bg-fuchsia-950/40 border border-fuchsia-800/40 flex items-center justify-center mx-auto text-fuchsia-400">
            <Layers className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#F3F1F8] font-mono">Тир-листов пока нет</h3>
          <p className="text-xs text-[#9A94AA] max-w-sm mx-auto leading-relaxed">
            Создайте свой первый тир-лист и расставьте тайтлы по рангам от S до D!
          </p>
          <div className="pt-2">
            <button
              onClick={handleOpenCreateModal}
              className="px-5 py-2.5 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold font-mono shadow-lg transition-all"
            >
              Создать первый Tier List
            </button>
          </div>
        </div>
      )}

      {/* Create Tier List Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-xl rounded-3xl bg-[#14131A] border border-[#252233] p-6 sm:p-7 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto custom-scrollbar">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#252233]">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-fuchsia-400 font-mono">
                  <Plus className="w-3.5 h-3.5" />
                  <span>НОВЫЙ ТИР-ЛИСТ</span>
                </div>
                <h2 className="text-xl font-bold text-[#F3F1F8] font-mono mt-1">
                  Создать Tier List
                </h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-xl text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#1E1C29] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateTierList} className="space-y-5">
              {/* Title */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#9A94AA] font-mono uppercase tracking-wider">
                  Название тир-листа <span className="text-fuchsia-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Мои любимые игры 2020-х"
                  required
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-xl bg-[#191724] border border-[#252233] text-sm text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-fuchsia-500 transition-colors"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#9A94AA] font-mono uppercase tracking-wider">
                  Описание (необязательно)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Краткое описание критериев ранжирования..."
                  className="w-full px-4 py-2.5 rounded-xl bg-[#191724] border border-[#252233] text-sm text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-fuchsia-500 transition-colors resize-none"
                />
              </div>

              {/* Category Selector (Strictly 6 categories, no board games) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#9A94AA] font-mono uppercase tracking-wider">
                  Категория тир-листа <span className="text-fuchsia-400">*</span>
                </label>
                <p className="text-[11px] text-[#6B667B]">
                  В тир-лист можно будет добавлять только медиа выбранной категории
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {TIER_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = category === cat.id;

                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'bg-fuchsia-950/60 border-fuchsia-500 text-white shadow-md shadow-fuchsia-950/50'
                            : 'bg-[#191724] border-[#252233] text-[#9A94AA] hover:text-[#F3F1F8] hover:border-[#38334D]'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-fuchsia-600 text-white' : 'bg-[#201D2C] text-[#9A94AA]'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold font-mono leading-tight">
                          {cat.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Visibility Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#9A94AA] font-mono uppercase tracking-wider">
                  Видимость
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility('PUBLIC')}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                      visibility === 'PUBLIC'
                        ? 'bg-fuchsia-950/60 border-fuchsia-500 text-white shadow-md'
                        : 'bg-[#191724] border-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]'
                    }`}
                  >
                    <Globe className="w-4 h-4 mb-1 text-emerald-400" />
                    <span className="text-xs font-bold font-mono">Публичный</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVisibility('FRIENDS_ONLY')}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                      visibility === 'FRIENDS_ONLY'
                        ? 'bg-fuchsia-950/60 border-fuchsia-500 text-white shadow-md'
                        : 'bg-[#191724] border-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]'
                    }`}
                  >
                    <Users className="w-4 h-4 mb-1 text-amber-400" />
                    <span className="text-xs font-bold font-mono">Для друзей</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVisibility('PRIVATE')}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                      visibility === 'PRIVATE'
                        ? 'bg-fuchsia-950/60 border-fuchsia-500 text-white shadow-md'
                        : 'bg-[#191724] border-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]'
                    }`}
                  >
                    <Lock className="w-4 h-4 mb-1 text-rose-400" />
                    <span className="text-xs font-bold font-mono">Приватный</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#252233]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={creating || !title.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold font-mono shadow-lg shadow-fuchsia-950/50 transition-all disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Создание...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Создать и перейти к редактору</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
