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
  const [source, setSource] = useState<'ALL' | 'MY_PLANNED' | 'MY_LIBRARY' | 'MY_FAVORITES' | 'USER_LIST'>('ALL');
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
    { id: 'ALL', label: 'Вся база тайтлов' },
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
    <div className="space-y-8 pb-16 animate-fadeIn max-w-6xl mx-auto">
      {/* Top Title & Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#252233] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#AC82FF] uppercase tracking-wider font-mono">
            <Dice5 className="w-4 h-4" />
            <span>Рандомайзер контента</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#F3F1F8] font-mono tracking-tight mt-1">
            Рулетка выбора
          </h1>
          <p className="text-xs text-[#9A94AA] mt-0.5">
            Случайный выбор фильма, сериала, игры, книги или аниме из общей базы или вашего личного списка.
          </p>
        </div>

        {/* Sound toggle */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
              soundEnabled
                ? 'bg-[#191724] border-[#252233] text-[#AC82FF]'
                : 'bg-[#191724] border-[#252233] text-zinc-600'
            }`}
            title={soundEnabled ? 'Звук включен' : 'Звук выключен'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>{soundEnabled ? 'Звук включен' : 'Без звука'}</span>
          </button>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-6 shadow-xl">
        {/* 1. Source Pool */}
        <div>
          <label className="text-xs font-bold text-[#9A94AA] uppercase tracking-wider block mb-2.5 font-mono">
            1. Источник выбора
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {sources.map((s) => (
              <button
                key={s.id}
                disabled={isSpinning}
                onClick={() => setSource(s.id as any)}
                className={`py-2.5 px-3 rounded-xl text-xs font-medium border transition-all text-center truncate ${
                  source === s.id
                    ? 'bg-[#1F1C2E] text-[#AC82FF] border-[#9B6BFF] shadow-sm font-semibold'
                    : 'bg-[#191724] text-[#9A94AA] border-[#252233] hover:text-white hover:border-[#3A344E]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 1b. User List Selector (Visible when USER_LIST is selected) */}
        {source === 'USER_LIST' && (
          <div className="p-4 rounded-2xl bg-[#191724] border border-[#252233] space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#AC82FF] uppercase tracking-wider font-mono flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4" />
                Выберите ваш список
              </label>
              <button
                onClick={() => navigate('/lists')}
                className="text-[11px] text-[#9A94AA] hover:text-white flex items-center gap-1 transition-colors"
              >
                <ListPlus className="w-3.5 h-3.5" />
                <span>Управление списками</span>
              </button>
            </div>

            {loadingLists ? (
              <p className="text-xs text-[#9A94AA] py-2">Загрузка ваших списков...</p>
            ) : userLists.length === 0 ? (
              <div className="py-4 text-center space-y-2">
                <p className="text-xs text-[#9A94AA]">У вас пока нет созданных списков.</p>
                <button
                  onClick={() => navigate('/lists')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#9B6BFF] text-white text-xs font-semibold"
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
                        // If list has specific category, automatically adapt
                        if (list.category && list.category !== 'ALL') {
                          if (list.category === 'MOVIES_TV') {
                            setCategory('ALL');
                          } else {
                            setCategory(list.category);
                          }
                        }
                      }}
                      className={`p-3 rounded-xl border text-left transition-all relative ${
                        isSelected
                          ? 'bg-[#252233] border-[#9B6BFF] text-white shadow-md'
                          : 'bg-[#14131A] border-[#252233] text-[#9A94AA] hover:text-white hover:border-[#3A344E]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold truncate block">{list.title}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#AC82FF] shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-zinc-400">
                        <span className="px-1.5 py-0.5 rounded bg-black/40 border border-white/5 font-mono">
                          {getCategoryLabel(list.category)}
                        </span>
                        {list.itemCount !== undefined && <span>{list.itemCount} тайтлов</span>}
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
          <label className="text-xs font-bold text-[#9A94AA] uppercase tracking-wider block mb-2 font-mono">
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
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    isSelected
                      ? 'bg-[#9B6BFF] text-white border-[#9B6BFF] shadow-md shadow-[#9B6BFF]/25 font-semibold'
                      : 'bg-[#191724] text-[#9A94AA] border-[#252233] hover:text-white hover:border-[#3A344E]'
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#252233]/60">
          <div>
            <label className="text-xs font-bold text-[#9A94AA] uppercase tracking-wider block mb-2 font-mono">
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
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all text-center ${
                    minRating === r.val
                      ? 'bg-[#1F1C2E] text-amber-400 border-amber-500/60 font-semibold'
                      : 'bg-[#191724] text-[#9A94AA] border-[#252233] hover:text-white'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <div className="p-3 rounded-2xl bg-[#191724] border border-[#252233] flex items-center justify-between text-xs text-[#9A94AA]">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#AC82FF]" />
                В текущей выборке:
                <strong className="text-white font-mono ml-1">
                  {poolLoading ? 'подсчет...' : poolSize !== null ? `${poolSize} тайтлов` : 'доступно'}
                </strong>
              </span>
              {selectedList && source === 'USER_LIST' && (
                <span className="text-[11px] text-[#AC82FF] font-medium truncate max-w-[140px]">
                  Список: {selectedList.title}
                </span>
              )}
            </div>
          </div>
        </div>

        {poolSize === 0 && !poolLoading && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            По выбранным фильтрам нет подходящих тайтлов. Попробуйте сбросить минимальный рейтинг или выбрать другой источник.
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
      <div className="relative p-6 sm:p-8 rounded-3xl bg-[#14131A] border border-[#252233] shadow-2xl overflow-hidden">
        {/* Target Center Indicator Needle */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-1 z-20 pointer-events-none flex flex-col items-center justify-between py-2">
          <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-[#AC82FF] drop-shadow-[0_0_8px_rgba(172,130,255,0.8)]" />
          <div className="w-0.5 h-full bg-[#AC82FF]/80 shadow-[0_0_8px_rgba(172,130,255,0.7)]" />
          <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[10px] border-b-[#AC82FF] drop-shadow-[0_0_8px_rgba(172,130,255,0.8)]" />
        </div>

        {/* Vignette shadows at left and right */}
        <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-[#14131A] to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-[#14131A] to-transparent z-10 pointer-events-none" />

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
                  className="shrink-0 aspect-[2/3] rounded-2xl overflow-hidden bg-[#191724] border border-[#252233] relative flex flex-col justify-between shadow-lg group select-none"
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
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-[#191724]">
                      {getTypeIcon(item.type)}
                      <span className="text-xs text-[#9A94AA] line-clamp-2 mt-2 font-medium">
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
              <Dice5 className="w-10 h-10 text-zinc-600 mb-1" />
              <p className="text-sm font-semibold text-zinc-300">Нет доступных тайтлов для ленты</p>
              <p className="text-xs text-[#9A94AA] max-w-sm">
                Измените фильтры или выберите другой источник, чтобы наполнить рулетку.
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
          className="px-8 sm:px-12 py-3.5 rounded-2xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-sm sm:text-base font-black uppercase tracking-wider flex items-center gap-2.5 shadow-xl shadow-[#9B6BFF]/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
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
        <div className="p-6 sm:p-8 rounded-3xl bg-[#14131A] border-2 border-[#AC82FF] shadow-2xl shadow-[#9B6BFF]/20 space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-[#252233] pb-3">
            <span className="text-xs font-bold text-[#AC82FF] uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              Рулетка выбрала для вас:
            </span>
            <span className="text-xs text-zinc-400">Нажмите «Открыть страницу», чтобы перейти к деталям</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Poster */}
            <div className="w-36 sm:w-44 aspect-[2/3] rounded-2xl bg-[#191724] border border-[#252233] overflow-hidden shrink-0 shadow-xl">
              {chosenItem.posterUrl ? (
                <img
                  src={chosenItem.posterUrl}
                  alt={chosenItem.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-[#9A94AA] text-xs">
                  {getTypeIcon(chosenItem.type)}
                  <span className="mt-2 line-clamp-2">{chosenItem.title}</span>
                </div>
              )}
            </div>

            {/* Info and Actions */}
            <div className="flex-1 space-y-3 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#1F1C2E] border border-[#3A344E] text-xs font-medium text-[#AC82FF]">
                  {getTypeIcon(chosenItem.type)}
                  {getCategoryLabel(chosenItem.type) || 'МЕДИА'}
                </span>

                {chosenItem.year && (
                  <span className="px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-mono">
                    {chosenItem.year}
                  </span>
                )}

                {chosenItem.rating && (
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold font-mono flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    {typeof chosenItem.rating === 'number' ? chosenItem.rating.toFixed(1) : chosenItem.rating}
                  </span>
                )}
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
                {chosenItem.title}
              </h2>

              {chosenItem.originalTitle && chosenItem.originalTitle !== chosenItem.title && (
                <p className="text-xs sm:text-sm text-[#9A94AA] italic">
                  {chosenItem.originalTitle}
                </p>
              )}

              {chosenItem.description && (
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed line-clamp-3">
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
                  className="px-5 py-2.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#9B6BFF]/25 transition-all"
                >
                  <span>Открыть страницу</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={handleSpin}
                  className="px-4 py-2.5 rounded-xl bg-[#191724] hover:bg-[#1F1C2E] border border-[#252233] text-xs font-semibold text-zinc-200 flex items-center gap-2 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Крутить еще раз</span>
                </button>

                <button
                  onClick={() => setShowAddToList(true)}
                  className="px-4 py-2.5 rounded-xl bg-[#191724] hover:bg-[#1F1C2E] border border-[#252233] text-xs font-semibold text-[#AC82FF] flex items-center gap-2 transition-colors"
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

