import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Sparkles,
  Music2,
  Type,
  Copy,
  Check,
  ArrowDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Heart,
  Maximize2,
  ListMusic,
  AlertTriangle,
  Disc,
  Info,
  X,
  ExternalLink,
} from 'lucide-react';
import { parseLyrics, findActiveLineIndex, LyricsData, LyricsLine } from '../../utils/lyricsParser.ts';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { TrackActionsMenu } from './TrackActionsMenu.tsx';
import { ArtistLinks } from './ArtistLinks.tsx';
import { TrackInsightsPanel } from './TrackInsightsPanel.tsx';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const FullscreenLyricsOverlay: React.FC = () => {
  const {
    currentTrack,
    releaseInfo,
    artistInfo,
    geniusInfo,
    playerState,
    closeLyrics,
    openFullscreen,
    currentTime,
    duration,
    isPlaying,
    playbackStatus,
    playbackError,
    volume,
    isMuted,
    repeatMode,
    isShuffle,
    queue,
    queueIndex,
    togglePlayPause,
    playNext,
    playPrev,
    seek,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    toggleFavoriteTrack,
    updateTrackLyrics,
    setFocusedAnnotation,
  } = useMusicPlayer();

  const modalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimer = useRef<any>(null);
  const lastActiveIndexRef = useRef<number>(-1);

  // Prevent outer modal container from scrolling
  const handleModalScroll = () => {
    if (modalRef.current && modalRef.current.scrollTop !== 0) {
      modalRef.current.scrollTop = 0;
    }
  };

  const [autoFollow, setAutoFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('large');
  const [isLoading, setIsLoading] = useState(false);
  const [showInsightsOverlay, setShowInsightsOverlay] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<any | null>(null);

  const isVisible = playerState === 'lyrics' && Boolean(currentTrack);

  // Fetch lyrics if missing when opening Fullscreen Lyrics
  useEffect(() => {
    if (isVisible && currentTrack && !currentTrack.lyrics && !isLoading) {
      setIsLoading(true);
      const qParams = new URLSearchParams();
      if (currentTrack.title) qParams.set('title', currentTrack.title);
      if (currentTrack.artistName) qParams.set('artist', currentTrack.artistName);

      fetch(`/api/music/tracks/${encodeURIComponent(currentTrack.id)}/lyrics?${qParams.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data.lyrics === 'string') {
            updateTrackLyrics(data.lyrics);
          }
        })
        .finally(() => setIsLoading(false));
    }
  }, [isVisible, currentTrack?.id, currentTrack?.lyrics]);

  // Parse lyrics safely
  const lyricsData = useMemo<LyricsData>(() => {
    if (!currentTrack?.lyrics) {
      return { mode: 'plain', text: '', lines: [] };
    }
    return parseLyrics(currentTrack.lyrics);
  }, [currentTrack?.lyrics]);

  const { mode, text, lines } = lyricsData;

  // Map each lyric line to matching Genius Annotation
  const lineAnnotationMap = useMemo(() => {
    const map = new Map<number, any>();
    if (!geniusInfo?.annotations || geniusInfo.annotations.length === 0 || lines.length === 0) {
      return map;
    }

    const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim();

    lines.forEach((l, idx) => {
      const cleanLine = clean(l.text);
      if (!cleanLine || cleanLine.length < 3) return;

      for (const ann of geniusInfo.annotations!) {
        const cleanFrag = clean(ann.fragment);
        if (cleanFrag && (cleanLine.includes(cleanFrag) || cleanFrag.includes(cleanLine))) {
          map.set(idx, ann);
          break;
        }
      }
    });

    return map;
  }, [geniusInfo?.annotations, lines]);

  // Strict active line calculation using binary search
  const activeIndex = useMemo(() => {
    if (mode !== 'synced' || lines.length === 0) return -1;
    return findActiveLineIndex(lines, currentTime);
  }, [lines, currentTime, mode]);

  const scrollToActiveLine = (immediate = false) => {
    const container = containerRef.current;
    const activeLine = activeLineRef.current;
    if (!container || !activeLine) return;

    isProgrammaticScroll.current = true;
    if (programmaticScrollTimer.current) {
      clearTimeout(programmaticScrollTimer.current);
    }

    // Center active line in visible area
    const containerRect = container.getBoundingClientRect();
    const lineRect = activeLine.getBoundingClientRect();
    const delta = (lineRect.top - containerRect.top) - (container.clientHeight - lineRect.height) / 2.3;
    const targetScrollTop = container.scrollTop + delta;

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: immediate ? 'auto' : 'smooth',
    });

    programmaticScrollTimer.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 600);
  };

  // Scroll to active line when activeIndex changes and autoFollow is true
  useEffect(() => {
    if (mode !== 'synced' || lines.length === 0 || activeIndex === -1) return;

    if (activeIndex !== lastActiveIndexRef.current) {
      lastActiveIndexRef.current = activeIndex;
      if (autoFollow) {
        scrollToActiveLine(false);
      }
    }
  }, [activeIndex, autoFollow, mode, lines.length]);

  // Reset autoFollow and scroll on track or visibility change
  useEffect(() => {
    lastActiveIndexRef.current = -1;
    setAutoFollow(true);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [currentTrack?.id, isVisible]);

  const handleUserScroll = () => {
    if (!isProgrammaticScroll.current && autoFollow) {
      setAutoFollow(false);
    }
  };

  const handleReturnToCurrent = () => {
    setAutoFollow(true);
    setTimeout(() => {
      scrollToActiveLine(false);
    }, 30);
  };

  const handleLineClick = (line: LyricsLine, index: number) => {
    seek(line.startTime);
    lastActiveIndexRef.current = index;
    setAutoFollow(true);
    setTimeout(() => {
      scrollToActiveLine(false);
    }, 30);
  };

  const handleAnnotationClick = (e: React.MouseEvent, ann: any) => {
    e.stopPropagation();
    setSelectedAnnotation(ann);
    setFocusedAnnotation(ann);
  };

  const handleCopy = () => {
    if (!text) return;
    const cleanText = text.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
    navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!currentTrack) return null;

  const rawCover = currentTrack.releaseCover || releaseInfo?.cover || currentTrack.thumbnail;
  const cover = getBestMusicImageUrl(rawCover, 'large');
  const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="fullscreen-lyrics-overlay"
          ref={modalRef}
          onScroll={handleModalScroll}
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 25 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 bg-[#060814] text-white flex flex-col justify-between overflow-hidden select-none isolate"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            touchAction: 'none',
          }}
        >
          {/* Animated Background Ambience */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            {cover && (
              <div
                className="absolute inset-0 bg-cover bg-center opacity-25 filter blur-3xl scale-125 transform-gpu transition-all duration-1000"
                style={{ backgroundImage: `url(${cover})` }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-[#080A18]/90 via-[#0B0D20]/95 to-[#060814]" />
          </div>

          {/* ========================================================================= */}
          {/* TOP CONTROLS & HEADER - z-20 */}
          {/* ========================================================================= */}
          <header className="relative z-20 h-16 sm:h-20 px-4 sm:px-8 flex items-center justify-between gap-4 border-b border-white/5 bg-[#080A18]/40 backdrop-blur-md shrink-0">
            {/* Header Left: Back Button & Track Title */}
            <div className="flex items-center gap-3 min-w-0">
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={closeLyrics}
                className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition cursor-pointer flex items-center gap-2 text-xs font-bold shrink-0 shadow-lg"
                title="Вернуться к плееру"
                aria-label="Вернуться к плееру"
              >
                <ArrowLeft className="w-4 h-4 text-purple-400" />
                <span className="hidden sm:inline">Вернуться к плееру</span>
              </motion.button>

              <div className="flex items-center gap-2.5 min-w-0">
                <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold uppercase font-mono tracking-wider">
                  Live Lyrics
                </span>
                <h3 className="text-xs sm:text-sm font-bold text-white truncate max-w-[160px] sm:max-w-xs md:max-w-md">
                  {currentTrack.title}
                </h3>
              </div>
            </div>

            {/* Header Right Tools */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Track Insights button */}
              <button
                onClick={() => setShowInsightsOverlay(!showInsightsOverlay)}
                className={`px-3 py-2 rounded-xl border text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  showInsightsOverlay
                    ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/30'
                    : 'bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border-purple-500/40'
                }`}
                title="Genius информация о треке"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">О треке</span>
              </button>

              <button
                onClick={() => setFontSize(fontSize === 'normal' ? 'large' : 'normal')}
                className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs transition cursor-pointer"
                title={fontSize === 'normal' ? 'Крупный шрифт' : 'Обычный шрифт'}
                aria-label="Переключить размер шрифта"
              >
                <Type className="w-4 h-4" />
              </button>

              <button
                onClick={handleCopy}
                className="px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs font-mono transition cursor-pointer hidden sm:flex items-center gap-1.5"
                title="Скопировать текст"
                aria-label="Скопировать текст песни"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Скопировано</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Копировать</span>
                  </>
                )}
              </button>

              <button
                onClick={openFullscreen}
                className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition cursor-pointer hidden sm:flex items-center gap-1.5 text-xs font-semibold"
                title="Открыть полноэкранный плеер"
                aria-label="Полноэкранный плеер"
              >
                <Maximize2 className="w-4 h-4 text-purple-400" />
                <span className="hidden md:inline">Плеер</span>
              </button>

              <button
                onClick={closeLyrics}
                className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
                title="Закрыть"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* ========================================================================= */}
          {/* MAIN LYRICS SCROLLABLE CONTAINER & INSIGHTS SIDEBAR - z-10 */}
          {/* ========================================================================= */}
          <div className="relative z-10 flex-1 flex min-h-0 overflow-hidden">
            <div
              ref={containerRef}
              onWheel={handleUserScroll}
              onTouchMove={handleUserScroll}
              onScroll={handleUserScroll}
              className="flex-1 overflow-y-auto px-4 sm:px-10 md:px-16 lg:px-24 custom-scrollbar scroll-smooth outline-none"
              style={{
                paddingBottom: 'calc(120px + max(1rem, env(safe-area-inset-bottom, 16px)))',
                maskImage: 'linear-gradient(to bottom, transparent, white 6%, white 92%, transparent)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent, white 6%, white 92%, transparent)',
              }}
            >
              <div className="h-10 shrink-0" />

              {isLoading ? (
                <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-3">
                  <Sparkles className="w-8 h-8 animate-spin text-purple-400" />
                  <span className="text-sm font-mono text-purple-300">Загрузка синхронизированного текста...</span>
                </div>
              ) : !text || (mode === 'synced' && lines.length === 0) ? (
                <div className="py-24 text-center text-slate-400 max-w-md mx-auto space-y-3 bg-slate-900/40 p-8 rounded-3xl border border-slate-800">
                  <Music2 className="w-12 h-12 text-purple-400 mx-auto opacity-70" />
                  <h3 className="text-base font-bold text-white font-mono">Текст песни пока не добавлен</h3>
                  <p className="text-xs text-slate-400">
                    Исполнитель или редактор может добавить слова песни в Студии.
                  </p>
                </div>
              ) : mode === 'plain' ? (
                <div className="max-w-3xl mx-auto text-center leading-relaxed text-slate-200 font-medium whitespace-pre-line py-4">
                  <p className={fontSize === 'large' ? 'text-2xl sm:text-3xl md:text-4xl space-y-6' : 'text-lg sm:text-xl md:text-2xl space-y-4'}>
                    {text}
                  </p>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-5 py-4">
                  {lines.map((line, idx) => {
                    const isActive = idx === activeIndex;
                    const isPast = idx < activeIndex;
                    const matchingAnn = lineAnnotationMap.get(idx);

                    return (
                      <div
                        key={`fs-line-${line.id || idx}-${idx}`}
                        ref={isActive ? activeLineRef : null}
                        onClick={() => handleLineClick(line, idx)}
                        className={`group relative py-3.5 px-6 rounded-3xl transition-all origin-left cursor-pointer flex items-center justify-between gap-4 ${
                          isActive
                            ? 'text-white font-black bg-gradient-to-r from-purple-600/35 via-indigo-600/25 to-transparent border border-purple-500/50 shadow-2xl shadow-purple-950/50 scale-[1.02]'
                            : 'text-slate-400 border border-transparent hover:opacity-80 scale-[0.99]'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p
                            className={`leading-snug select-text transition-all ${
                              fontSize === 'large' ? 'text-2xl sm:text-3xl md:text-4xl' : 'text-xl sm:text-2xl md:text-3xl'
                            } ${
                              isActive
                                ? 'text-white font-extrabold drop-shadow-[0_0_24px_rgba(168,85,247,0.6)]'
                                : isPast
                                ? 'opacity-50 text-slate-400'
                                : 'opacity-35 text-slate-500'
                            }`}
                          >
                            {line.text}
                          </p>
                        </div>

                        {matchingAnn && (
                          <button
                            onClick={(e) => handleAnnotationClick(e, matchingAnn)}
                            className="p-2 sm:px-3 sm:py-1.5 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-mono font-bold shrink-0 cursor-pointer shadow-lg hover:scale-105"
                            title="Посмотреть пояснение Genius для этой строки"
                          >
                            <Info className="w-4 h-4 text-amber-400" />
                            <span className="hidden sm:inline">Смысл</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="h-32 shrink-0" />
            </div>

            {/* Optional Side Panel or Mobile Modal for Genius Insights in Lyrics Overlay */}
            {showInsightsOverlay && (
              <>
                {/* Desktop spacious side panel */}
                <aside className="hidden lg:block w-[480px] xl:w-[560px] 2xl:w-[640px] max-w-[45vw] border-l border-white/10 bg-[#0B0D20]/95 backdrop-blur-2xl p-4 sm:p-6 overflow-y-auto custom-scrollbar z-20 shrink-0">
                  <TrackInsightsPanel onClose={() => setShowInsightsOverlay(false)} />
                </aside>

                {/* Mobile / Tablet Slide-over modal */}
                <div className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-md p-4 flex items-center justify-center">
                  <div className="w-full max-w-xl h-[85vh] my-auto">
                    <TrackInsightsPanel isFloating onClose={() => setShowInsightsOverlay(false)} />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Floating Return Button - z-20 */}
          {mode === 'synced' && !autoFollow && activeIndex !== -1 && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="absolute left-1/2 -translate-x-1/2 bottom-28 z-30 pointer-events-auto"
            >
              <button
                onClick={handleReturnToCurrent}
                aria-label="Вернуться к текущей строке"
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold shadow-2xl shadow-purple-950/80 border border-purple-400/40 transition-all cursor-pointer transform hover:scale-105 active:scale-95"
              >
                <ArrowDown className="w-4 h-4 animate-bounce" />
                <span>К текущей строке</span>
              </button>
            </motion.div>
          )}

          {/* Annotation Detail Popover / Sheet */}
          <AnimatePresence>
            {selectedAnnotation && (
              <div
                className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
                onClick={() => setSelectedAnnotation(null)}
              >
                <motion.div
                  initial={{ scale: 0.95, y: 16 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 16 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-lg bg-[#0F132A] border border-purple-500/40 rounded-3xl p-6 shadow-2xl space-y-4 text-left relative"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-mono font-extrabold uppercase tracking-wider text-amber-300">
                        Genius Аннотация
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedAnnotation(null)}
                      className="p-1.5 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-slate-400 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-purple-950/40 border-l-4 border-purple-400 text-sm font-serif italic text-purple-200">
                    «{selectedAnnotation.fragment}»
                  </div>

                  <div className="max-h-64 overflow-y-auto custom-scrollbar pr-2">
                    <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                      {selectedAnnotation.bodyPlain}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[#1E2442] flex items-center justify-between text-xs text-slate-400 font-mono">
                    {selectedAnnotation.author ? (
                      <span>Автор: {selectedAnnotation.author.name}</span>
                    ) : (
                      <span>Genius</span>
                    )}
                    {geniusInfo?.url && (
                      <a
                        href={geniusInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:text-purple-300 flex items-center gap-1 font-bold"
                      >
                        Genius.com <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* ========================================================================= */}
          {/* PERSISTENT FIXED BOTTOM MUSIC PLAYER - z-40 */}
          {/* ========================================================================= */}
          <motion.div
            key="fullscreen-lyrics-bottom-player"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="relative z-40 bg-[#0B0D20]/95 backdrop-blur-2xl border-t border-purple-500/20 shadow-[0_-12px_40px_rgba(0,0,0,0.7)] px-4 sm:px-8 py-3.5 shrink-0"
            style={{
              paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom, 14px))',
            }}
          >
            {/* Scrubber Progress Bar */}
            <div className="w-full max-w-4xl mx-auto flex items-center gap-3 mb-2">
              <span className="text-[11px] font-mono text-purple-300 font-semibold w-10 text-right">
                {formatTime(currentTime)}
              </span>
              <div
                onClick={(e) => {
                  if (!duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  seek(ratio * duration);
                }}
                className="flex-1 h-1.5 hover:h-2.5 bg-slate-800 rounded-full overflow-hidden cursor-pointer relative transition-all group"
              >
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full relative"
                  style={{ width: `${progressPercent}%` }}
                >
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow-md transition-opacity" />
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-400 w-10">
                {formatTime(duration)}
              </span>
            </div>

            {/* Controls Row */}
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
              {/* Left: Track Info */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-11 h-11 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0 shadow-md">
                  {cover ? (
                    <img src={cover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-purple-400">
                      <Music2 className="w-5 h-5" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 leading-tight space-y-0.5">
                  <h4 className="text-xs sm:text-sm font-extrabold text-white truncate">
                    {currentTrack.title}
                  </h4>
                  <div className="text-[11px] text-purple-300 font-medium truncate">
                    <ArtistLinks
                      artistName={artistName}
                      artists={(currentTrack as any).artists}
                      artistSlug={currentTrack.artistSlug}
                      artistId={currentTrack.artistId}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleFavoriteTrack(currentTrack.id, currentTrack.isFavorite)}
                  className={`p-2 rounded-xl transition cursor-pointer shrink-0 hidden sm:inline-flex ${
                    currentTrack.isFavorite
                      ? 'bg-rose-500/20 text-rose-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title={currentTrack.isFavorite ? 'Удалить из любимых' : 'Добавить в любимые'}
                >
                  <Heart className={`w-4 h-4 ${currentTrack.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                </button>
              </div>

              {/* Center: Controls */}
              <div className="flex items-center gap-1 sm:gap-3 shrink-0">
                <button
                  type="button"
                  onClick={toggleShuffle}
                  className={`p-2 rounded-xl transition cursor-pointer hidden md:inline-flex ${
                    isShuffle ? 'text-purple-400 bg-purple-500/20' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Случайный порядок"
                >
                  <Shuffle className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={playPrev}
                  className="p-2 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Предыдущий трек"
                >
                  <SkipBack className="w-5 h-5 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={togglePlayPause}
                  className="w-11 h-11 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/40 transition cursor-pointer"
                  title={isPlaying ? 'Пауза' : 'Воспроизведение'}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={playNext}
                  className="p-2 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Следующий трек"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={toggleRepeat}
                  className={`p-2 rounded-xl transition cursor-pointer hidden md:inline-flex ${
                    repeatMode !== 'OFF' ? 'text-purple-400 bg-purple-500/20' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Повтор"
                >
                  <Repeat className="w-4 h-4" />
                </button>
              </div>

              {/* Right: Volume & Expand */}
              <div className="flex items-center justify-end gap-2 shrink-0 flex-1">
                <div className="hidden lg:flex items-center gap-2">
                  <button type="button" onClick={toggleMute} className="text-slate-400 hover:text-white transition cursor-pointer">
                    {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-20 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>

                <TrackActionsMenu
                  track={{
                    id: currentTrack.id,
                    source: currentTrack.source,
                    videoId: currentTrack.videoId,
                    title: currentTrack.title,
                    artistName: artistName,
                    releaseTitle: currentTrack.releaseTitle || null,
                    releaseCover: rawCover,
                    thumbnail: rawCover,
                    duration: duration,
                    isFavorite: currentTrack.isFavorite,
                  }}
                  btnClassName="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
