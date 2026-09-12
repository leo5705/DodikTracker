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
  ArrowRight,
  SlidersHorizontal,
  Layers,
  Flame,
  Dices,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { AddToListModal } from '../modals/AddToListModal.tsx';
import { formatMediaTypePath } from '../common/MediaCard.tsx';

interface RouletteViewProps {
  onSelectMedia?: (mediaId: number) => void;
}

export const RouletteView: React.FC<RouletteViewProps> = () => {
  const { authFetch, dbUser } = useAuth();
  const { navigate } = useRouter();

  // Mode: 'REEL' (Horizontal Reel) or 'WHEEL' (Roulette Wheel)
  const [rouletteMode, setRouletteMode] = useState<'REEL' | 'WHEEL'>('REEL');

  // Filters
  const [category, setCategory] = useState('ALL');
  const [source, setSource] = useState('ALL');
  const [minRating, setMinRating] = useState('0');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Pool count
  const [poolSize, setPoolSize] = useState<number | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);

  // Reel State
  const [reelItems, setReelItems] = useState<any[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [offset, setOffset] = useState(0);
  const [chosenItem, setChosenItem] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showAddToList, setShowAddToList] = useState(false);

  // Wheel State
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelCandidates, setWheelCandidates] = useState<any[]>([]);

  const reelContainerRef = useRef<HTMLDivElement>(null);
  const ITEM_WIDTH = 180;
  const ITEM_GAP = 14;
  const TOTAL_STEP = ITEM_WIDTH + ITEM_GAP; // 194px

  // Subtle Web Audio synthesizer for ticks and result chime
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
    { id: 'MOVIE', label: 'Фильмы', icon: Film },
    { id: 'TV', label: 'Сериалы', icon: Tv },
    { id: 'ANIME', label: 'Аниме', icon: Sparkles },
    { id: 'GAME', label: 'Игры', icon: Gamepad2 },
    { id: 'BOOK', label: 'Книги', icon: Book },
    { id: 'MANGA', label: 'Манга', icon: BookOpen },
  ];

  const sources = [
    { id: 'ALL', label: 'Вся база тайтлов' },
    { id: 'MY_PLANNED', label: 'Мой список «В планах»' },
    { id: 'MY_LIBRARY', label: 'Вся моя библиотека' },
    { id: 'MY_FAVORITES', label: 'Мое избранное' },
  ];

  // Fetch pool counter
  const fetchPoolCount = async () => {
    setPoolLoading(true);
    try {
      const res = await authFetch(
        `/api/roulette/pool?category=${category}&source=${source}&minRating=${minRating}`
      );
      if (res.ok) {
        const data = await res.json();
        setPoolSize(data.count);
      }
    } catch (_err) {
    } finally {
      setPoolLoading(false);
    }
  };

  useEffect(() => {
    fetchPoolCount();
  }, [category, source, minRating, dbUser]);

  // Handle spin
  const handleSpin = async () => {
    if (isSpinning) return;
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
      setWheelCandidates(items.slice(0, 10));

      if (rouletteMode === 'REEL') {
        // Compute precise scroll target to center the winning item
        const containerWidth = reelContainerRef.current?.offsetWidth || 800;
        const centerOffset = containerWidth / 2 - ITEM_WIDTH / 2;
        // Add random natural jitter (+/- 25px) within the card
        const jitter = Math.floor(Math.random() * 50) - 25;
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
      } else {
        // Wheel of Fortune Mode
        const extraRotations = 5 + Math.floor(Math.random() * 3);
        const randomDegree = extraRotations * 360 + Math.floor(Math.random() * 360);
        setWheelRotation((prev) => prev + randomDegree);

        setTimeout(() => {
          setIsSpinning(false);
          setChosenItem(winner);
          playChime();
        }, 4000);
      }
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
      default:
        return <Film className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

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
            Не знаете, что посмотреть или во что поиграть сегодня вечером? Доверьтесь случайному выбору!
          </p>
        </div>

        {/* View Mode Toggle & Sound */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border transition-colors ${
              soundEnabled
                ? 'bg-[#191724] border-[#252233] text-[#AC82FF]'
                : 'bg-[#191724] border-[#252233] text-zinc-600'
            }`}
            title={soundEnabled ? 'Звук включен' : 'Звук выключен'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <div className="p-1 rounded-xl bg-[#14131A] border border-[#252233] flex items-center gap-1">
            <button
              onClick={() => setRouletteMode('REEL')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                rouletteMode === 'REEL'
                  ? 'bg-[#9B6BFF] text-white'
                  : 'text-[#9A94AA] hover:text-[#F3F1F8]'
              }`}
            >
              Лента
            </button>
            <button
              onClick={() => setRouletteMode('WHEEL')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                rouletteMode === 'WHEEL'
                  ? 'bg-[#9B6BFF] text-white'
                  : 'text-[#9A94AA] hover:text-[#F3F1F8]'
              }`}
            >
              Колесо
            </button>
          </div>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-5 shadow-xl">
        {/* Category Pills */}
        <div>
          <label className="text-xs font-bold text-[#9A94AA] uppercase tracking-wider block mb-2 font-mono">
            1. Категория медиа
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.id}
                  disabled={isSpinning}
                  onClick={() => setCategory(c.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    category === c.id
                      ? 'bg-[#9B6BFF] text-white border-[#9B6BFF] shadow-md shadow-[#9B6BFF]/25'
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

        {/* Source Pool & Rating */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#252233]/60">
          <div>
            <label className="text-xs font-bold text-[#9A94AA] uppercase tracking-wider block mb-2 font-mono">
              2. Откуда выбирать тайтлы
            </label>
            <div className="grid grid-cols-2 gap-2">
              {sources.map((s) => (
                <button
                  key={s.id}
                  disabled={isSpinning}
                  onClick={() => setSource(s.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all text-left truncate ${
                    source === s.id
                      ? 'bg-[#1F1C2E] text-[#AC82FF] border-[#9B6BFF]/60 font-semibold'
                      : 'bg-[#191724] text-[#9A94AA] border-[#252233] hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

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
        </div>

        {/* Pool count feedback */}
        <div className="flex items-center justify-between pt-2 border-t border-[#252233]/60 text-xs text-[#9A94AA]">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#AC82FF]" />
            В выбранной выборке:
            <strong className="text-white font-mono ml-1">
              {poolLoading ? 'подсчет...' : poolSize !== null ? `${poolSize} тайтлов` : 'доступно'}
            </strong>
          </span>
          {poolSize === 0 && (
            <span className="text-amber-400 font-medium">
              По выбранным фильтрам нет тайтлов. Попробуйте выбрать «Вся база».
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-800/50 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Visual Spin Area */}
      {rouletteMode === 'REEL' ? (
        <div className="relative p-6 sm:p-8 rounded-3xl bg-[#14131A] border border-[#252233] shadow-2xl overflow-hidden">
          {/* Target Center Indicator Needle */}
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-1 z-20 pointer-events-none flex flex-col items-center justify-between py-2">
            <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-[#AC82FF] drop-shadow-[0_0_8px_rgba(172,130,255,0.8)]" />
            <div className="w-0.5 h-full bg-[#AC82FF]/80 shadow-[0_0_8px_rgba(172,130,255,0.7)]" />
            <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[10px] border-b-[#AC82FF] drop-shadow-[0_0_8px_rgba(172,130,255,0.8)]" />
          </div>

          {/* Vignette shadows at left and right */}
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#14131A] to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#14131A] to-transparent z-10 pointer-events-none" />

          {/* Scrolling Reel Container */}
          <div ref={reelContainerRef} className="overflow-hidden py-4">
            <div
              className="flex items-center transition-transform"
              style={{
                gap: `${ITEM_GAP}px`,
                transform: `translateX(-${offset}px)`,
                transitionDuration: isSpinning ? '4800ms' : '0ms',
                transitionTimingFunction: 'cubic-bezier(0.12, 0.8, 0.2, 1)',
              }}
            >
              {(reelItems.length > 0
                ? reelItems
                : Array.from({ length: 15 }).map((_, i) => ({
                    id: i,
                    title: 'Случайный тайтл',
                    type: category === 'ALL' ? 'MEDIA' : category,
                  }))
              ).map((item, idx) => (
                <div
                  key={idx}
                  style={{ width: `${ITEM_WIDTH}px` }}
                  className="shrink-0 aspect-[2/3] rounded-2xl overflow-hidden bg-[#191724] border border-[#252233] relative flex flex-col justify-between shadow-lg"
                >
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-[#191724]">
                      <Film className="w-8 h-8 text-zinc-600 mb-2" />
                      <span className="text-xs text-[#9A94AA] line-clamp-2">{item.title}</span>
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
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-2.5 pt-6 text-left">
                    <p className="text-xs font-bold text-white line-clamp-1">{item.title}</p>
                    <p className="text-[10px] text-zinc-400 font-mono">{item.year || item.type}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Wheel of Fortune Mode */
        <div className="p-8 rounded-3xl bg-[#14131A] border border-[#252233] flex flex-col items-center justify-center space-y-6 shadow-2xl">
          <div className="relative w-64 h-64 sm:w-80 sm:h-80">
            {/* Pointer */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[18px] border-t-[#AC82FF] z-20 drop-shadow-[0_0_8px_rgba(172,130,255,0.8)]" />

            {/* Rotating Wheel Plate */}
            <div
              className="w-full h-full rounded-full border-4 border-[#252233] bg-[#191724] shadow-2xl overflow-hidden relative transition-transform"
              style={{
                transform: `rotate(${wheelRotation}deg)`,
                transitionDuration: isSpinning ? '4000ms' : '0ms',
                transitionTimingFunction: 'cubic-bezier(0.15, 0.9, 0.25, 1)',
              }}
            >
              {/* Segments */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
                <div
                  key={i}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ transform: `rotate(${deg}deg)` }}
                >
                  <div className="h-full w-0.5 bg-[#252233]" />
                  <span className="absolute top-4 text-[10px] font-bold text-zinc-400 font-mono">
                    #{i + 1}
                  </span>
                </div>
              ))}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-16 h-16 rounded-full bg-[#14131A] border-2 border-[#AC82FF] flex items-center justify-center text-[#AC82FF]">
                  <Dice5 className="w-7 h-7" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Spin Button */}
      <div className="flex justify-center">
        <button
          onClick={handleSpin}
          disabled={isSpinning || poolSize === 0}
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
            <span className="text-xs text-zinc-400">Нажмите «Перейти к тайтлу», чтобы открыть детали</span>
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
                  <Film className="w-8 h-8 mb-2 text-zinc-600" />
                  <span>{chosenItem.title}</span>
                </div>
              )}
            </div>

            {/* Info and Actions */}
            <div className="flex-1 space-y-3 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#1F1C2E] border border-[#3A344E] text-xs font-medium text-[#AC82FF]">
                  {getTypeIcon(chosenItem.type)}
                  {chosenItem.type || 'МЕДИА'}
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
                  <span>Перейти к тайтлу</span>
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
