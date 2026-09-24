import React, { useState, useEffect, useRef } from 'react';
import {
  Dice5,
  Sparkles,
  Star,
  Film,
  Play,
  RotateCcw,
  AlertCircle,
  Volume2,
  VolumeX,
  Bookmark,
  Tv,
  Gamepad2,
  Book,
  BookOpen,
  Flame,
  ArrowRight,
  Layers,
  ListPlus,
  Check,
  FolderOpen,
  Plus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { AddToListModal } from '../modals/AddToListModal.tsx';
import { formatMediaTypePath } from '../common/MediaCard.tsx';

interface UserListOption {
  id: number;
  title: string;
  description?: string;
  category: string;
  itemCount?: number;
  visibility?: string;
}

interface RouletteViewProps {
  onSelectMedia?: (mediaId: number) => void;
}

export const RouletteView: React.FC<RouletteViewProps> = () => {
  const { authFetch, dbUser } = useAuth();
  const { navigate } = useRouter();

  // Filters
  const [category, setCategory] = useState('ALL');
  const [source, setSource] = useState<'MY_PLANNED' | 'MY_LIBRARY' | 'MY_FAVORITES' | 'USER_LIST'>('MY_PLANNED');
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [minRating, setMinRating] = useState('0');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // User lists
  const [userLists, setUserLists] = useState<UserListOption[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  // Pool state & candidate items for preview
  const [poolSize, setPoolSize] = useState<number | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [activeListInfo, setActiveListInfo] = useState<{ id: number; title: string; category: string } | null>(null);

  // Reel State
  const [reelItems, setReelItems] = useState<any[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [offset, setOffset] = useState(0);
  const [chosenItem, setChosenItem] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showAddToList, setShowAddToList] = useState(false);

  const reelContainerRef = useRef<HTMLDivElement>(null);
  const ITEM_WIDTH = 180;
  const ITEM_GAP = 14;
  const TOTAL_STEP = ITEM_WIDTH + ITEM_GAP; // 194px

  // Web Audio synthesizer for ticks and result chime
  const audioContextRef = useRef<AudioContext | null>(null);

  const playTick = () => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (_e) {}
  };

  const playChime = () => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const freqs = [523.25, 659.25, 783.99, 1046.5]; // C E G C
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
        gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.45);
      });
    } catch (_e) {}
  };

  const categories = [
    { id: 'ALL', label: 'Всё подряд', icon: Sparkles },
    { id: 'MOVIES_TV', label: 'Фильмы и сериалы', icon: Film },
    { id: 'MOVIE', label: 'Фильмы', icon: Film },
    { id: 'TV', label: 'Сериалы', icon: Tv },
    { id: 'GAME', label: 'Игры', icon: Gamepad2 },
    { id: 'ANIME', label: 'Аниме', icon: Sparkles },
    { id: 'MANGA', label: 'Манга', icon: BookOpen },
    { id: 'BOOK', label: 'Книги', icon: Book },
    { id: 'COMIC', label: 'Комиксы', icon: Flame },
  ];

  const sources = [
    { id: 'MY_PLANNED', label: '«В планах»' },
    { id: 'MY_LIBRARY', label: 'Моя библиотека' },
    { id: 'MY_FAVORITES', label: 'Избранное' },
    { id: 'USER_LIST', label: 'Пользовательский список' },
  ];

  // Load user's lists when source is USER_LIST or on initial load if user is logged in
  useEffect(() => {
    if (!dbUser) return;
    const fetchUserLists = async () => {
      setLoadingLists(true);
      try {
        const res = await authFetch('/api/lists/my');
        if (res.ok) {
          const data = await res.json();
          setUserLists(data);
          if (data.length > 0 && !selectedListId) {
            setSelectedListId(data[0].id);
          }
        }
      } catch (_err) {
      } finally {
        setLoadingLists(false);
      }
    };
    fetchUserLists();
  }, [dbUser]);

  // Fetch pool counter and real candidate items for preview
  const fetchPoolData = async () => {
    if (source === 'USER_LIST' && !selectedListId) {
      setPoolSize(0);
      setReelItems([]);
      return;
    }

    setPoolLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('category', category);
      queryParams.set('source', source);
      if (source === 'USER_LIST' && selectedListId) {
        queryParams.set('listId', String(selectedListId));
      }
      if (parseFloat(minRating) > 0) {
        queryParams.set('minRating', minRating);
      }

      const res = await authFetch(`/api/roulette/pool?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPoolSize(data.count);
        setActiveListInfo(data.listInfo || null);

        // Build initial preview reel from real candidate items!
        const candidates = data.candidates || [];
        if (candidates.length > 0) {
          const REEL_PREVIEW_COUNT = 45;
          const previewReel: any[] = [];
          for (let i = 0; i < REEL_PREVIEW_COUNT; i++) {
            previewReel.push(candidates[i % candidates.length]);
          }
          setReelItems(previewReel);
          setOffset(0);
        } else {
          setReelItems([]);
          setOffset(0);
        }
      } else {
        const errData = await res.json();
        setPoolSize(0);
        setReelItems([]);
        if (res.status === 403) {
          setError(errData.error || 'У вас нет доступа к выбранному списку');
        }
      }
    } catch (_err) {
      setPoolSize(0);
      setReelItems([]);
    } finally {
      setPoolLoading(false);
    }
  };

  useEffect(() => {
    fetchPoolData();
  }, [category, source, selectedListId, minRating, dbUser]);

  // Handle spin
  const handleSpin = async () => {
    if (isSpinning) return;
    if (source === 'USER_LIST' && !selectedListId) {
      setError('Пожалуйста, выберите пользовательский список для выбора тайтла');
      return;
    }

    setError(null);
    setChosenItem(null);
    setIsSpinning(true);

    try {
      const res = await authFetch('/api/roulette/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          source,
          listId: source === 'USER_LIST' ? selectedListId : undefined,
          minRating: parseFloat(minRating) > 0 ? minRating : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Не удалось выбрать тайтл. Попробуйте изменить фильтры.');
      }

      const data = await res.json();
      const items = data.reelItems || [];
      const targetIdx = data.targetIndex || 35;
      const winner = data.chosen;

      setReelItems(items);

      // Compute scroll target to center the winning item
      const containerWidth = reelContainerRef.current?.offsetWidth || 800;
      const centerOffset = containerWidth / 2 - ITEM_WIDTH / 2;
      // Add subtle natural jitter (+/- 18px) within the card
      const jitter = Math.floor(Math.random() * 36) - 18;
      const targetOffset = targetIdx * TOTAL_STEP - centerOffset + jitter;

      // Reset offset
      setOffset(0);

      // Tick sounds timer during spin
      let tickCount = 0;
      const tickInterval = setInterval(() => {
        tickCount++;
        playTick();
        if (tickCount > 35) clearInterval(tickInterval);
      }, 110);

      // Start animation next tick
      setTimeout(() => {
        setOffset(targetOffset);
      }, 50);

      // Animation finishes in ~4.8s
      setTimeout(() => {
        clearInterval(tickInterval);
        setIsSpinning(false);
        setChosenItem(winner);
        playChime();
      }, 4900);
    } catch (err: any) {
      setError(err.message || 'Ошибка выбора');
      setIsSpinning(false);
    }
  };

  const getTypeIcon = (t?: string) => {
    switch (t) {
      case 'MOVIE':
        return <Film className="w-3.5 h-3.5 text-purple-400" />;
      case 'TV':
        return <Tv className="w-3.5 h-3.5 text-indigo-400" />;
      case 'ANIME':
        return <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />;
      case 'MANGA':
        return <BookOpen className="w-3.5 h-3.5 text-pink-400" />;
      case 'GAME':
        return <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'BOOK':
        return <Book className="w-3.5 h-3.5 text-amber-400" />;
      case 'COMIC':
        return <Flame className="w-3.5 h-3.5 text-orange-400" />;
      default:
        return <Film className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'MOVIES_TV':
        return 'Фильмы и сериалы';
      case 'MOVIE':
        return 'Фильмы';
      case 'TV':
        return 'Сериалы';
      case 'GAME':
        return 'Игры';
      case 'ANIME':
        return 'Аниме';
      case 'MANGA':
        return 'Манга';
      case 'BOOK':
        return 'Книги';
      case 'COMIC':
        return 'Комиксы';
      default:
        return cat;
    }
  };

  const selectedList = userLists.find((l) => l.id === selectedListId);

  return (
    <div className="space-y-6 pb-16 animate-fadeIn max-w-6xl mx-auto">
      {/* Top Title & Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#1E2442] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#A78BFA] uppercase tracking-wider font-mono">
            <Dice5 className="w-4 h-4 text-[#8B5CF6]" />
            <span>Рандомайзер контента</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight mt-1">
            Рулетка выбора
          </h1>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Случайный выбор фильма, сериала, игры, книги или аниме из вашей библиотеки или личных списков.
          </p>
        </div>

        {/* Sound toggle */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
              soundEnabled
                ? 'bg-[#151932] border-[#8B5CF6]/40 text-[#A78BFA]'
                : 'bg-[#11152A] border-[#1E2442] text-[#64748B]'
            }`}
            title={soundEnabled ? 'Звук включен' : 'Звук выключен'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-[#8B5CF6]" /> : <VolumeX className="w-4 h-4" />}
            <span>{soundEnabled ? 'Звук включен' : 'Без звука'}</span>
          </button>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#11152A] border border-[#1E2442] space-y-5 shadow-xl">
        {/* 1. Source Pool */}
        <div>
          <label className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider block mb-2 font-mono">
            1. Источник выбора
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {sources.map((s) => (
              <button
                key={s.id}
                disabled={isSpinning}
                onClick={() => setSource(s.id as any)}
                className={`py-2.5 px-3 rounded-xl text-xs font-medium border transition-all text-center truncate cursor-pointer ${
                  source === s.id
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white border-transparent shadow-md shadow-[#7C3AED]/25 font-bold'
                    : 'bg-[#0B0D20] text-[#94A3B8] border-[#1E2442] hover:text-[#F8FAFC] hover:bg-[#151932]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 1b. User List Selector (Visible when USER_LIST is selected) */}
        {source === 'USER_LIST' && (
          <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#A78BFA] uppercase tracking-wider font-mono flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4 text-[#8B5CF6]" />
                Выберите ваш список
              </label>
              <button
                onClick={() => navigate('/lists')}
                className="text-[11px] text-[#94A3B8] hover:text-[#F8FAFC] flex items-center gap-1 transition-colors cursor-pointer"
              >
                <ListPlus className="w-3.5 h-3.5" />
                <span>Управление списками</span>
              </button>
            </div>

            {loadingLists ? (
              <p className="text-xs text-[#94A3B8] py-2">Загрузка ваших списков...</p>
            ) : userLists.length === 0 ? (
              <div className="py-4 text-center space-y-2">
                <p className="text-xs text-[#94A3B8]">У вас пока нет созданных списков.</p>
                <button
                  onClick={() => navigate('/lists')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#7C3AED] text-white text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Создать первый список</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {userLists.map((list) => {
                  const isSelected = selectedListId === list.id;
                  return (
                    <button
                      key={list.id}
                      disabled={isSpinning}
                      onClick={() => {
                        setSelectedListId(list.id);
                        if (list.category && list.category !== 'ALL') {
                          if (list.category === 'MOVIES_TV') {
                            setCategory('ALL');
                          } else {
                            setCategory(list.category);
                          }
                        }
                      }}
                      className={`p-3 rounded-xl border text-left transition-all relative cursor-pointer ${
                        isSelected
                          ? 'bg-[#151932] border-[#8B5CF6] text-white shadow-md'
                          : 'bg-[#11152A] border-[#1E2442] text-[#94A3B8] hover:text-white hover:bg-[#151932]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-xs truncate flex-1">{list.title}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0" />}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-[#64748B] mt-1 font-mono">
                        <span>{list.itemCount || 0} тайтлов</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. Category Pills */}
        <div>
          <label className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider block mb-2 font-mono">
            2. Категория медиа
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const Icon = c.icon;
              const isSelected = category === c.id;
              return (
                <button
                  key={c.id}
                  disabled={isSpinning}
                  onClick={() => setCategory(c.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white border-transparent shadow-md shadow-[#7C3AED]/25 font-bold'
                      : 'bg-[#0B0D20] text-[#94A3B8] border-[#1E2442] hover:text-white hover:bg-[#151932]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Rating & Pool count info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#1E2442]">
          <div>
            <label className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider block mb-2 font-mono">
              3. Минимальный рейтинг: {parseFloat(minRating) > 0 ? `${minRating}★+` : 'Любой'}
            </label>
            <div className="flex gap-2">
              {[
                { val: '0', label: 'Любой' },
                { val: '6.0', label: '6.0★+' },
                { val: '7.0', label: '7.0★+' },
                { val: '8.0', label: '8.0★+' },
              ].map((r) => (
                <button
                  key={r.val}
                  disabled={isSpinning}
                  onClick={() => setMinRating(r.val)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all text-center cursor-pointer ${
                    minRating === r.val
                      ? 'bg-[#151932] text-amber-300 border-amber-500/60 font-semibold'
                      : 'bg-[#0B0D20] text-[#94A3B8] border-[#1E2442] hover:text-white hover:bg-[#151932]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <div className="p-3 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex items-center justify-between text-xs text-[#94A3B8]">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#8B5CF6]" />
                В текущей выборке:
                <strong className="text-white font-mono ml-1">
                  {poolLoading ? 'подсчет...' : poolSize !== null ? `${poolSize} тайтлов` : 'доступно'}
                </strong>
              </span>
              {selectedList && source === 'USER_LIST' && (
                <span className="text-[11px] text-[#A78BFA] font-medium truncate max-w-[140px]">
                  Список: {selectedList.title}
                </span>
              )}
            </div>
          </div>
        </div>

        {poolSize === 0 && !poolLoading && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>В этом источнике пока нет тайтлов.</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-800/50 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Visual Spin Reel Area */}
      <div className="relative p-6 sm:p-8 rounded-3xl bg-[#11152A] border border-[#1E2442] shadow-2xl overflow-hidden">
        {/* Target Center Indicator Needle */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-1 z-20 pointer-events-none flex flex-col items-center justify-between py-2">
          <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-[#8B5CF6] drop-shadow-[0_0_8px_rgba(139,92,246,0.9)]" />
          <div className="w-0.5 h-full bg-[#8B5CF6]/90 shadow-[0_0_10px_rgba(139,92,246,0.8)]" />
          <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[10px] border-b-[#8B5CF6] drop-shadow-[0_0_8px_rgba(139,92,246,0.9)]" />
        </div>

        {/* Vignette shadows at left and right */}
        <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-[#11152A] to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-[#11152A] to-transparent z-10 pointer-events-none" />

        {/* Scrolling Reel Container */}
        <div ref={reelContainerRef} className="overflow-hidden py-4">
          {reelItems.length > 0 ? (
            <div
              className="flex items-center transition-transform"
              style={{
                gap: `${ITEM_GAP}px`,
                transform: `translateX(-${offset}px)`,
                transitionDuration: isSpinning ? '4800ms' : '0ms',
                transitionTimingFunction: 'cubic-bezier(0.12, 0.8, 0.2, 1)',
              }}
            >
              {reelItems.map((item, idx) => (
                <div
                  key={`${item.id || idx}-${idx}`}
                  style={{ width: `${ITEM_WIDTH}px` }}
                  className="shrink-0 aspect-[2/3] rounded-2xl overflow-hidden bg-[#151932] border border-[#1E2442] relative flex flex-col justify-between shadow-lg group select-none"
                >
                  {/* Real poster or neutral dark placeholder */}
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-[#151932]">
                      {getTypeIcon(item.type)}
                      <span className="text-xs text-[#94A3B8] line-clamp-2 mt-2 font-medium">
                        {item.title}
                      </span>
                    </div>
                  )}

                  {/* Rating tag */}
                  {item.rating && (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-amber-500/30 text-amber-400 text-[10px] font-bold flex items-center gap-1 shadow">
                      <Star className="w-3 h-3 fill-amber-400" />
                      {typeof item.rating === 'number' ? item.rating.toFixed(1) : item.rating}
                    </div>
                  )}

                  {/* Title overlay at bottom */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-2.5 pt-7 text-left">
                    <p className="text-xs font-bold text-white line-clamp-1">{item.title}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono mt-0.5">
                      <span>{item.type || 'МЕДИА'}</span>
                      {item.year && <span>• {item.year}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <Dice5 className="w-10 h-10 text-[#64748B] mb-1" />
              <p className="text-sm font-semibold text-[#F8FAFC]">В этом источнике пока нет тайтлов.</p>
              <p className="text-xs text-[#94A3B8] max-w-sm">
                Добавьте тайтлы в «В планах», библиотеку, избранное или выберите другой список.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Spin Button */}
      <div className="flex justify-center">
        <button
          onClick={handleSpin}
          disabled={isSpinning || poolSize === 0 || poolLoading}
          className="px-8 sm:px-12 py-3.5 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-sm sm:text-base font-black uppercase tracking-wider flex items-center gap-2.5 shadow-xl shadow-[#7C3AED]/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {isSpinning ? (
            <>
              <RotateCcw className="w-5 h-5 animate-spin" />
              <span>Выбираем тайтл...</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-white" />
              <span>Крутить рулетку</span>
            </>
          )}
        </button>
      </div>

      {/* Result Card (Once chosen) */}
      {chosenItem && (
        <div className="p-6 sm:p-8 rounded-3xl bg-[#11152A] border-2 border-[#8B5CF6] shadow-2xl shadow-[#7C3AED]/25 space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-[#1E2442] pb-3">
            <span className="text-xs font-bold text-[#A78BFA] uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
              Рулетка выбрала для вас:
            </span>
            <span className="text-xs text-[#94A3B8]">Нажмите «Открыть страницу», чтобы перейти к деталям</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Poster */}
            <div className="w-36 sm:w-44 aspect-[2/3] rounded-2xl bg-[#080A18] border border-[#1E2442] overflow-hidden shrink-0 shadow-xl">
              {chosenItem.posterUrl ? (
                <img
                  src={chosenItem.posterUrl}
                  alt={chosenItem.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-[#64748B] text-xs">
                  {getTypeIcon(chosenItem.type)}
                  <span className="mt-2 line-clamp-2">{chosenItem.title}</span>
                </div>
              )}
            </div>

            {/* Info and Actions */}
            <div className="flex-1 space-y-3 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-[#151932] border border-[#1E2442] text-xs font-medium text-[#A78BFA]">
                  {getTypeIcon(chosenItem.type)}
                  {getCategoryLabel(chosenItem.type) || 'МЕДИА'}
                </span>

                {chosenItem.year && (
                  <span className="px-2.5 py-1 rounded-md bg-[#0B0D20] border border-[#1E2442] text-xs text-[#94A3B8] font-mono">
                    {chosenItem.year}
                  </span>
                )}

                {chosenItem.rating && (
                  <span className="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold font-mono flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    {typeof chosenItem.rating === 'number' ? chosenItem.rating.toFixed(1) : chosenItem.rating}
                  </span>
                )}
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight">
                {chosenItem.title}
              </h2>

              {chosenItem.originalTitle && chosenItem.originalTitle !== chosenItem.title && (
                <p className="text-xs sm:text-sm text-[#94A3B8] italic">
                  {chosenItem.originalTitle}
                </p>
              )}

              {chosenItem.description && (
                <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed line-clamp-3">
                  {chosenItem.description}
                </p>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-3">
                <button
                  onClick={() =>
                    navigate(
                      `/media/${formatMediaTypePath(chosenItem.type)}/${chosenItem.id}`
                    )
                  }
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#7C3AED]/25 transition-all cursor-pointer"
                >
                  <span>Открыть страницу</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={handleSpin}
                  className="px-4 py-2.5 rounded-xl bg-[#151932] hover:bg-[#191D38] border border-[#1E2442] text-xs font-semibold text-[#F8FAFC] flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Крутить еще раз</span>
                </button>

                <button
                  onClick={() => setShowAddToList(true)}
                  className="px-4 py-2.5 rounded-xl bg-[#151932] hover:bg-[#191D38] border border-[#1E2442] text-xs font-semibold text-[#A78BFA] flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Bookmark className="w-4 h-4" />
                  <span>В список</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add To List Modal if chosen */}
      {showAddToList && chosenItem && (
        <AddToListModal
          media={chosenItem}
          onClose={() => setShowAddToList(false)}
        />
      )}
    </div>
  );
};

