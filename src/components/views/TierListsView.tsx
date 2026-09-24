import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Loader2,
  Globe,
  Users,
  Lock,
  X,
  Sparkles,
  Film,
  Gamepad2,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { PrimaryButton, SecondaryButton, EmptyState } from '../design-system/index.ts';

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
      if (selectedTab !== 'ALL') {
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
      color: 'text-[#94A3B8] bg-[#151932] border-[#1E2442]',
    };
  };

  return (
    <div className="space-y-8 pb-16 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E2442] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#A78BFA] uppercase tracking-wider font-mono">
            <Layers className="w-4 h-4 text-[#8B5CF6]" />
            <span>Ранжирование контента</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight mt-1">
            Тир-листы
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            Ваши персональные тир-листы и ранжирование тайтлов по категориям
          </p>
        </div>

        <PrimaryButton
          onClick={handleOpenCreateModal}
          icon={<Plus className="w-4 h-4" />}
        >
          Создать Tier List
        </PrimaryButton>
      </div>

      {/* Categories Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
        <button
          onClick={() => setSelectedTab('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            selectedTab === 'ALL'
              ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
              : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] border border-[#1E2442]'
          }`}
        >
          Все категории
        </button>

        {TIER_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isSelected = selectedTab === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedTab(cat.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
                  : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] border border-[#1E2442]'
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
          <Loader2 className="w-8 h-8 text-[#8B5CF6] animate-spin" />
          <p className="text-xs text-[#94A3B8] font-mono">Загрузка тир-листов...</p>
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
                className="flex flex-col justify-between p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 transition-all shadow-xl hover:-translate-y-1 group text-left cursor-pointer space-y-4"
              >
                <div className="space-y-3">
                  {/* Top metadata */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold font-mono border ${catMeta.color}`}
                    >
                      <CatIcon className="w-3 h-3" />
                      {catMeta.label}
                    </span>

                    <span className="flex items-center gap-1 text-[11px] text-[#64748B] font-mono">
                      {tl.visibility === 'PUBLIC' ? (
                        <Globe className="w-3 h-3 text-emerald-400" />
                      ) : tl.visibility === 'FRIENDS' ? (
                        <Users className="w-3 h-3 text-amber-400" />
                      ) : (
                        <Lock className="w-3 h-3 text-rose-400" />
                      )}
                      <span>{new Date(tl.createdAt).toLocaleDateString('ru-RU')}</span>
                    </span>
                  </div>

                  {/* Title & description */}
                  <div>
                    <h3 className="text-base font-bold text-[#F8FAFC] group-hover:text-[#A78BFA] transition-colors line-clamp-1">
                      {tl.title}
                    </h3>
                    {tl.description ? (
                      <p className="text-xs text-[#94A3B8] line-clamp-2 mt-1 leading-relaxed">
                        {tl.description}
                      </p>
                    ) : (
                      <p className="text-xs text-[#64748B] italic mt-1">Без описания</p>
                    )}
                  </div>
                </div>

                {/* Preview Posters Strip */}
                <div className="space-y-3 pt-2 border-t border-[#1E2442]">
                  {tl.previewPosters && tl.previewPosters.length > 0 ? (
                    <div className="flex items-center gap-1.5 overflow-hidden h-14">
                      {tl.previewPosters.slice(0, 5).map((posterUrl: string, pIdx: number) => (
                        <div
                          key={pIdx}
                          className="w-10 h-14 rounded-lg overflow-hidden bg-[#151932] border border-[#1E2442] shrink-0"
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
                        <div className="w-10 h-14 rounded-lg bg-[#11152A] border border-[#1E2442] flex items-center justify-center text-[10px] font-mono text-[#94A3B8] shrink-0">
                          +{tl.itemCount - 5}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-14 flex items-center justify-center rounded-xl bg-[#11152A] border border-dashed border-[#1E2442] text-[11px] text-[#64748B] font-mono">
                      Тайтлы еще не добавлены
                    </div>
                  )}

                  {/* Bottom Footer */}
                  <div className="flex items-center justify-between text-xs text-[#94A3B8] pt-1">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[9px] font-bold text-[#A78BFA] overflow-hidden">
                        {tl.ownerAvatar ? (
                          <img src={tl.ownerAvatar} alt={tl.ownerUsername} className="w-full h-full object-cover" />
                        ) : (
                          (tl.ownerUsername?.[0] || 'U').toUpperCase()
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-[#64748B]">@{tl.ownerUsername}</span>
                    </div>

                    <div className="flex items-center gap-1 text-[#A78BFA] font-mono text-[11px] font-semibold group-hover:translate-x-1 transition-transform">
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
        <EmptyState
          icon={<Layers className="w-10 h-10 text-[#8B5CF6]" />}
          title="Тир-листов пока нет"
          description="Создайте свой первый тир-лист и расставьте тайтлы по рангам от S до D!"
          actionLabel="Создать первый Tier List"
          onAction={handleOpenCreateModal}
        />
      )}

      {/* Create Tier List Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-xl rounded-3xl bg-[#0B0D20] border border-[#1E2442] p-6 sm:p-7 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto no-scrollbar">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#1E2442]">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#A78BFA] font-mono">
                  <Plus className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  <span>НОВЫЙ ТИР-ЛИСТ</span>
                </div>
                <h2 className="text-xl font-bold text-[#F8FAFC] tracking-tight mt-1">
                  Создать Tier List
                </h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateTierList} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#CBD5E1]">Название тир-листа *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Лучшие тайтлы киновселенной Marvel или Топ аниме 2025"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6] transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#CBD5E1]">Категория контента</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TIER_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = category === cat.id;
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all text-left cursor-pointer ${
                          isSelected
                            ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white border-transparent shadow-md shadow-[#7C3AED]/25 font-bold'
                            : 'bg-[#11152A] border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932]'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#CBD5E1]">Описание (необязательно)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Поясните критерии ранжирования или тему тир-листа..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6] resize-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#CBD5E1]">Видимость</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility('PUBLIC')}
                    className={`py-2 px-2 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                      visibility === 'PUBLIC'
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white border-transparent font-bold shadow-md shadow-[#7C3AED]/25'
                        : 'bg-[#11152A] text-[#94A3B8] border-[#1E2442] hover:text-[#F8FAFC] hover:bg-[#151932]'
                    }`}
                  >
                    Публичный
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('FRIENDS')}
                    className={`py-2 px-2 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                      visibility === 'FRIENDS'
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white border-transparent font-bold shadow-md shadow-[#7C3AED]/25'
                        : 'bg-[#11152A] text-[#94A3B8] border-[#1E2442] hover:text-[#F8FAFC] hover:bg-[#151932]'
                    }`}
                  >
                    Для друзей
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('PRIVATE')}
                    className={`py-2 px-2 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                      visibility === 'PRIVATE'
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white border-transparent font-bold shadow-md shadow-[#7C3AED]/25'
                        : 'bg-[#11152A] text-[#94A3B8] border-[#1E2442] hover:text-[#F8FAFC] hover:bg-[#151932]'
                    }`}
                  >
                    Только мне
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#1E2442]">
                <SecondaryButton type="button" onClick={() => setShowCreateModal(false)}>
                  Отмена
                </SecondaryButton>
                <PrimaryButton type="submit" disabled={creating}>
                  {creating ? 'Создание...' : 'Создать Tier List'}
                </PrimaryButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
