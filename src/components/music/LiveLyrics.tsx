import React, { useEffect, useRef, useState, useMemo } from 'react';
import { parseLyrics, findActiveLineIndex, LyricsData, LyricsLine } from '../../utils/lyricsParser.ts';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { FileText, Loader2, ArrowDown, Copy, Check, Sparkles, Music2, Type, Info, X, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LiveLyricsProps {
  lyrics: string | LyricsData | null | undefined;
  currentTime: number;
  isPlaying: boolean;
  onSeekToLine?: (seconds: number) => void;
  isLoading?: boolean;
  trackInfo?: {
    title?: string;
    artist?: string;
    cover?: string;
    source?: string;
  };
}

export const LiveLyrics: React.FC<LiveLyricsProps> = ({
  lyrics,
  currentTime,
  isPlaying,
  onSeekToLine,
  isLoading = false,
  trackInfo,
}) => {
  const {
    geniusInfo,
    focusedAnnotation,
    setFocusedAnnotation,
    setIsInsightsOpen,
  } = useMusicPlayer();

  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimer = useRef<any>(null);
  const lastActiveIndexRef = useRef<number>(-1);

  const [autoFollow, setAutoFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  const [localModalAnnotation, setLocalModalAnnotation] = useState<any | null>(null);

  // Normalize lyrics to LyricsData object
  const lyricsData = useMemo<LyricsData>(() => {
    if (!lyrics) {
      return { mode: 'plain', text: '', lines: [] };
    }
    if (typeof lyrics === 'string') {
      return parseLyrics(lyrics);
    }
    return lyrics;
  }, [lyrics]);

  const { mode, text, lines } = lyricsData;

  // Map each lyric line to matching Genius Annotation if available
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

  // Determine active lyric line index using binary search
  const activeIndex = useMemo(() => {
    if (mode !== 'synced' || lines.length === 0) return -1;
    return findActiveLineIndex(lines, currentTime);
  }, [lines, currentTime, mode]);

  // Handle automatic scrolling to active line
  useEffect(() => {
    if (mode !== 'synced' || lines.length === 0 || activeIndex === -1) {
      return;
    }

    if (activeIndex !== lastActiveIndexRef.current) {
      lastActiveIndexRef.current = activeIndex;

      if (autoFollow) {
        scrollToActiveLine(false);
      }
    }
  }, [activeIndex, autoFollow, mode, lines.length]);

  // Reset state on lyrics change
  useEffect(() => {
    lastActiveIndexRef.current = -1;
    setAutoFollow(true);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [lyrics]);

  const scrollToActiveLine = (immediate = false) => {
    const container = containerRef.current;
    const activeLine = activeLineRef.current;
    if (!container || !activeLine) return;

    isProgrammaticScroll.current = true;
    if (programmaticScrollTimer.current) {
      clearTimeout(programmaticScrollTimer.current);
    }

    const containerRect = container.getBoundingClientRect();
    const lineRect = activeLine.getBoundingClientRect();
    const delta = (lineRect.top - containerRect.top) - (container.clientHeight - lineRect.height) / 2;
    const targetScrollTop = container.scrollTop + delta;

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: immediate ? 'auto' : 'smooth',
    });

    programmaticScrollTimer.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 600);
  };

  const handleUserInteraction = () => {
    if (autoFollow) {
      setAutoFollow(false);
    }
  };

  const handleScroll = () => {
    if (isProgrammaticScroll.current) {
      return;
    }
    if (autoFollow) {
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
    if (onSeekToLine) {
      onSeekToLine(line.startTime);
    }
    lastActiveIndexRef.current = index;
    setAutoFollow(true);
    setTimeout(() => {
      scrollToActiveLine(false);
    }, 30);
  };

  const handleAnnotationClick = (e: React.MouseEvent, ann: any) => {
    e.stopPropagation();
    setFocusedAnnotation(ann);
    setLocalModalAnnotation(ann);
    setIsInsightsOpen(true);
  };

  const handleCopy = () => {
    if (!text) return;
    const cleanText = text.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
    navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        <span className="text-xs font-mono tracking-wider animate-pulse text-purple-300">
          Поиск текста и синхронизации...
        </span>
      </div>
    );
  }

  if (!text || (mode === 'synced' && lines.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2 border border-[#1E2442] rounded-3xl bg-[#080A18]/60 p-8 text-center max-w-md mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-purple-950/40 border border-purple-800/30 flex items-center justify-center text-purple-400 mb-2">
          <FileText className="w-6 h-6" />
        </div>
        <p className="text-sm font-bold text-slate-200 font-mono">Текст песни пока недоступен</p>
        <p className="text-xs text-slate-400">
          Текст песни пока не добавлен. Исполнитель или редактор может добавить слова в Студии.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full min-h-0 w-full select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-[#1E2442]/60 px-2">
        <div className="flex items-center gap-2">
          {mode === 'synced' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Караоке (Синхронизировано)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300">
              <Music2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Текст песни (Текстовый режим)</span>
            </span>
          )}

          {geniusInfo?.annotations && geniusInfo.annotations.length > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <Info className="w-3 h-3 text-amber-400" />
              <span>{geniusInfo.annotations.length} пояснений Genius</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFontSize(fontSize === 'normal' ? 'large' : 'normal')}
            className="p-1.5 rounded-lg bg-[#11152A] hover:bg-[#1A203F] text-slate-400 hover:text-white border border-[#1E2442] text-xs transition cursor-pointer"
            title={fontSize === 'normal' ? 'Увеличить шрифт' : 'Обычный шрифт'}
          >
            <Type className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#11152A] hover:bg-[#1A203F] text-slate-400 hover:text-white border border-[#1E2442] text-xs font-mono transition cursor-pointer"
            title="Скопировать текст песни"
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
        </div>
      </div>

      {/* Scrollable Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onWheel={handleUserInteraction}
        onTouchMove={handleUserInteraction}
        onMouseDown={handleUserInteraction}
        onKeyDown={handleUserInteraction}
        tabIndex={0}
        className="flex-1 overflow-y-auto custom-scrollbar px-2 sm:px-6 py-6 space-y-5 scroll-smooth outline-none"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent, white 8%, white 92%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, white 8%, white 92%, transparent)',
        }}
      >
        <div className="h-16 shrink-0" />

        {mode === 'plain' ? (
          <div className="max-w-2xl mx-auto py-2">
            <div className={`leading-relaxed text-slate-300 font-medium whitespace-pre-line text-left px-4 ${
              fontSize === 'large' ? 'text-lg sm:text-xl space-y-4' : 'text-sm sm:text-base space-y-3'
            }`}>
              {text}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4 py-2">
            {lines.map((line, idx) => {
              const isActive = idx === activeIndex;
              const isPast = idx < activeIndex;
              const matchingAnn = lineAnnotationMap.get(idx);

              return (
                <div
                  key={`live-line-${line.id || idx}-${idx}`}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => handleLineClick(line, idx)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`group relative py-2.5 px-4 rounded-2xl transition-all duration-300 transform origin-left cursor-pointer flex items-center justify-between gap-3 ${
                    isActive
                      ? 'text-white scale-102 font-bold opacity-100 bg-gradient-to-r from-purple-600/30 via-indigo-600/20 to-transparent border border-purple-500/40 shadow-xl shadow-purple-950/30'
                      : isPast
                      ? 'text-slate-400 opacity-60 hover:opacity-95 hover:scale-101 border border-transparent'
                      : 'text-slate-500 opacity-40 hover:opacity-90 hover:scale-101 border border-transparent'
                  }`}
                >
                  {/* Lyrics line */}
                  <div className="flex-1 min-w-0">
                    <p className={`leading-relaxed tracking-normal select-text transition-all duration-300 ${
                      fontSize === 'large' ? 'text-xl sm:text-2xl md:text-3xl' : 'text-base sm:text-lg md:text-xl'
                    } ${
                      isActive
                        ? 'text-white font-extrabold drop-shadow-[0_0_16px_rgba(168,85,247,0.45)]'
                        : ''
                    }`}>
                      {line.text}
                    </p>
                  </div>

                  {/* Genius Annotation Indicator Badge */}
                  {matchingAnn && (
                    <button
                      onClick={(e) => handleAnnotationClick(e, matchingAnn)}
                      className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-white transition-all flex items-center gap-1.5 text-[11px] font-mono font-bold shrink-0 cursor-pointer shadow-sm hover:scale-105"
                      title="Посмотреть аннотацию Genius для этой строки"
                    >
                      <Info className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline">Смысл</span>
                    </button>
                  )}

                  {/* Timestamp on hover */}
                  <span className="absolute -left-12 top-1/2 -translate-y-1/2 text-[10px] font-mono text-purple-400/0 group-hover:text-purple-400/60 transition-all duration-300 hidden md:inline">
                    {Math.floor(line.startTime / 60)}:
                    {Math.floor(line.startTime % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="h-28 shrink-0" />
      </div>

      {/* Floating return to current line button */}
      {mode === 'synced' && !autoFollow && activeIndex !== -1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <button
            onClick={handleReturnToCurrent}
            aria-label="Вернуться к текущей строке"
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold shadow-xl shadow-purple-950/60 border border-purple-400/40 transition-all cursor-pointer scale-100 hover:scale-105 active:scale-95"
          >
            <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
            <span>К текущей строке</span>
          </button>
        </div>
      )}

      {/* Modal / Popup for clicked Annotation within Lyrics Overlay */}
      <AnimatePresence>
        {localModalAnnotation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setLocalModalAnnotation(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-[#0F132A] border border-purple-500/40 rounded-3xl p-6 shadow-2xl space-y-4 text-left relative"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-mono font-extrabold uppercase tracking-wider text-amber-300">
                    Аннотация Genius
                  </span>
                </div>
                <button
                  onClick={() => setLocalModalAnnotation(null)}
                  className="p-1.5 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-purple-950/40 border-l-4 border-purple-400 text-sm font-serif italic text-purple-200">
                «{localModalAnnotation.fragment}»
              </div>

              <div className="max-h-60 overflow-y-auto custom-scrollbar pr-2">
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                  {localModalAnnotation.bodyPlain}
                </p>
              </div>

              <div className="pt-3 border-t border-[#1E2442] flex items-center justify-between text-xs text-slate-400 font-mono">
                {localModalAnnotation.author ? (
                  <span>Автор: {localModalAnnotation.author.name}</span>
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
                    Открыть на Genius <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
