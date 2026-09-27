import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';
import { ArtistLinks } from './ArtistLinks.tsx';
import {
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Users,
  FileText,
  Music2,
  X,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  Heart,
  Eye,
  Flame,
  MessageSquare,
  HelpCircle,
} from 'lucide-react';

export const TrackInsightsPanel: React.FC<{
  onClose?: () => void;
  className?: string;
  isFloating?: boolean;
}> = ({ onClose, className = '', isFloating = false }) => {
  const { navigate } = useRouter();
  const {
    currentTrack,
    releaseInfo,
    artistInfo,
    geniusInfo,
    isLoadingGenius,
    isGeniusConfigured,
    focusedAnnotation,
    setFocusedAnnotation,
    openLyrics,
  } = useMusicPlayer();

  const [activeSection, setActiveSection] = useState<'all' | 'description' | 'annotations' | 'credits'>('all');
  const [expandedCredits, setExpandedCredits] = useState(true);
  const [expandedDescription, setExpandedDescription] = useState(true);
  const [expandedAnnotations, setExpandedAnnotations] = useState(true);

  if (!currentTrack) {
    return (
      <div className={`p-6 text-center text-slate-500 rounded-3xl bg-[#0B0D20]/90 border border-[#1E2442] ${className}`}>
        <Music2 className="w-8 h-8 text-purple-400 mx-auto mb-2 opacity-50" />
        <p className="text-xs font-semibold">Включите трек, чтобы увидеть информацию о нём</p>
      </div>
    );
  }

  const rawCover = currentTrack.releaseCover || releaseInfo?.cover || currentTrack.thumbnail;
  const cover = getBestMusicImageUrl(rawCover, 'large');
  const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';
  const albumTitle = currentTrack.releaseTitle || releaseInfo?.title || currentTrack.album;

  return (
    <div
      className={`flex flex-col bg-[#0B0D20]/95 backdrop-blur-xl border border-[#1E2442] rounded-3xl shadow-2xl overflow-hidden custom-scrollbar ${
        isFloating ? 'max-h-[85vh] h-[650px]' : 'h-full'
      } ${className}`}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2442]/80 bg-[#0F132A]/80 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-md shadow-purple-600/30 border border-purple-400/30">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-[#F8FAFC] tracking-wider uppercase font-mono">
                О ТРЕКЕ
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30">
                GENIUS INSIGHTS
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {geniusInfo?.url && (
            <a
              href={geniusInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg bg-[#151932] hover:bg-purple-600/30 text-purple-300 hover:text-white border border-[#1E2442] transition-colors text-xs flex items-center gap-1 font-mono cursor-pointer"
              title="Открыть на Genius"
            >
              <span className="text-[10px] font-bold hidden sm:inline">Genius</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Закрыть панель"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Content with animated track change */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 custom-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={String(currentTrack.id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="space-y-5"
          >
            {/* Track Hero Banner */}
            <div className="relative rounded-2xl overflow-hidden border border-[#1E2442] bg-gradient-to-b from-[#151932] to-[#0D1024] p-4 shadow-lg">
              {geniusInfo?.headerImageUrl && (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-15 blur-sm pointer-events-none"
                  style={{ backgroundImage: `url(${geniusInfo.headerImageUrl})` }}
                />
              )}
              <div className="relative z-10 flex gap-3.5 items-start">
                <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-[#0B0D20] border border-[#1E2442] shrink-0 shadow-md">
                  {cover ? (
                    <img src={cover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-purple-400">
                      <Music2 className="w-7 h-7" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="text-base sm:text-lg font-black text-[#F8FAFC] leading-snug truncate">
                    {currentTrack.title}
                  </h3>
                  <div className="text-xs text-[#A78BFA] font-bold truncate">
                    <ArtistLinks
                      artistName={artistName}
                      artists={(currentTrack as any).artists}
                      artistSlug={currentTrack.artistSlug}
                      artistId={currentTrack.artistId}
                    />
                  </div>
                  {albumTitle && (
                    <p className="text-[11px] text-slate-400 truncate">
                      Альбом: <span className="text-slate-300 font-medium">{albumTitle}</span>
                    </p>
                  )}
                  {geniusInfo?.releaseDate && (
                    <p className="text-[10px] font-mono text-slate-500">
                      Релиз: {geniusInfo.releaseDate}
                    </p>
                  )}
                </div>
              </div>

              {/* Verified badge / Hot metrics */}
              {geniusInfo && (
                <div className="mt-3 pt-3 border-t border-[#1E2442]/60 flex items-center justify-between gap-2 text-[10px] font-mono">
                  <div className="flex items-center gap-2">
                    {geniusInfo.verified && (
                      <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        Верифицировано
                      </span>
                    )}
                    {geniusInfo.stats?.hot && (
                      <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                        <Flame className="w-3 h-3" />
                        Популярное
                      </span>
                    )}
                  </div>
                  {geniusInfo.stats?.pageviews && (
                    <span className="text-slate-400 flex items-center gap-1">
                      <Eye className="w-3 h-3 text-slate-500" />
                      {geniusInfo.stats.pageviews.toLocaleString()} просмотров
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Loading state skeleton */}
            {isLoadingGenius && (
              <div className="space-y-3 p-4 rounded-2xl bg-[#0F132A]/50 border border-[#1E2442] animate-pulse">
                <div className="h-4 w-32 bg-purple-900/40 rounded" />
                <div className="space-y-2">
                  <div className="h-3 w-full bg-slate-800 rounded" />
                  <div className="h-3 w-5/6 bg-slate-800 rounded" />
                  <div className="h-3 w-4/6 bg-slate-800 rounded" />
                </div>
                <div className="h-16 w-full bg-slate-900/60 rounded-xl" />
              </div>
            )}

            {/* Focused annotation breakdown banner if user clicked a specific lyrics line */}
            {focusedAnnotation && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-2xl bg-gradient-to-br from-purple-950/70 via-indigo-950/50 to-[#0F132A] border border-purple-500/40 shadow-xl space-y-2.5 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    Пояснение выбранной строки
                  </span>
                  <button
                    onClick={() => setFocusedAnnotation(null)}
                    className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-purple-900/40"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-purple-900/20 border-l-4 border-purple-400 text-xs text-white font-serif italic">
                  «{focusedAnnotation.fragment}»
                </div>

                <p className="text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-line">
                  {focusedAnnotation.bodyPlain}
                </p>

                {focusedAnnotation.author && (
                  <div className="pt-2 border-t border-purple-800/30 flex items-center justify-between text-[10px] font-mono text-purple-300">
                    <span>Автор пояснения: {focusedAnnotation.author.name}</span>
                    {focusedAnnotation.verified && (
                      <span className="text-emerald-400 font-bold">✓ Подтверждено</span>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* 1. Track Meaning & Description */}
            {geniusInfo?.description ? (
              <div className="rounded-2xl bg-[#0F132A]/70 border border-[#1E2442] overflow-hidden">
                <button
                  onClick={() => setExpandedDescription(!expandedDescription)}
                  className="w-full flex items-center justify-between p-3.5 text-left hover:bg-[#151932] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-extrabold text-[#F8FAFC] tracking-wider uppercase font-mono">
                      О чём этот трек
                    </span>
                  </div>
                  {expandedDescription ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {expandedDescription && (
                  <div className="px-4 pb-4 pt-1 text-xs text-slate-300 leading-relaxed space-y-2 border-t border-[#1E2442]/40 whitespace-pre-line">
                    {geniusInfo.description}
                  </div>
                )}
              </div>
            ) : null}

            {/* 2. Genius Annotations List */}
            {geniusInfo?.annotations && geniusInfo.annotations.length > 0 ? (
              <div className="rounded-2xl bg-[#0F132A]/70 border border-[#1E2442] overflow-hidden space-y-1">
                <button
                  onClick={() => setExpandedAnnotations(!expandedAnnotations)}
                  className="w-full flex items-center justify-between p-3.5 text-left hover:bg-[#151932] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-amber-400" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-[#F8FAFC] tracking-wider uppercase font-mono">
                        Аннотации строк
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                        {geniusInfo.annotations.length}
                      </span>
                    </div>
                  </div>
                  {expandedAnnotations ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {expandedAnnotations && (
                  <div className="px-3 pb-3 space-y-2.5 border-t border-[#1E2442]/40">
                    {geniusInfo.annotations.map((ann) => (
                      <div
                        key={ann.id}
                        onClick={() => setFocusedAnnotation(ann)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer text-left space-y-1.5 ${
                          focusedAnnotation?.id === ann.id
                            ? 'bg-purple-950/60 border-purple-400/60 shadow-md'
                            : 'bg-[#0B0D20] hover:bg-[#151932] border-[#1E2442]'
                        }`}
                      >
                        <div className="text-xs font-serif italic text-purple-300 font-medium line-clamp-2">
                          «{ann.fragment}»
                        </div>
                        <p className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed">
                          {ann.bodyPlain}
                        </p>
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                          {ann.author ? <span>@{ann.author.name}</span> : <span>Genius community</span>}
                          {ann.verified && <span className="text-emerald-400 font-bold">✓ Верифицировано</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* 3. Credits and Contributors */}
            {geniusInfo?.credits && geniusInfo.credits.length > 0 ? (
              <div className="rounded-2xl bg-[#0F132A]/70 border border-[#1E2442] overflow-hidden">
                <button
                  onClick={() => setExpandedCredits(!expandedCredits)}
                  className="w-full flex items-center justify-between p-3.5 text-left hover:bg-[#151932] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-extrabold text-[#F8FAFC] tracking-wider uppercase font-mono">
                      Создатели и участники
                    </span>
                  </div>
                  {expandedCredits ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {expandedCredits && (
                  <div className="p-3.5 space-y-3 border-t border-[#1E2442]/40">
                    {geniusInfo.credits.map((cr, idx) => (
                      <div key={idx} className="space-y-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                          {cr.role}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {cr.artists.map((art, aIdx) => (
                            <span
                              key={aIdx}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0B0D20] border border-[#1E2442] text-xs font-medium text-slate-200"
                            >
                              {art.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* 4. Primary Artist Profile Summary */}
            {geniusInfo?.primaryArtist ? (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#120F2C] to-[#0B0D20] border border-[#231A52] space-y-2.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-purple-300 font-bold">
                  Об исполнителе
                </span>
                <div className="flex items-center gap-3">
                  {geniusInfo.primaryArtist.imageUrl ? (
                    <img
                      src={geniusInfo.primaryArtist.imageUrl}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover border-2 border-purple-500/40 shrink-0 shadow-md"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-purple-900/40 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0 font-bold text-sm">
                      {geniusInfo.primaryArtist.name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-white truncate">
                      {geniusInfo.primaryArtist.name}
                    </h4>
                    {geniusInfo.primaryArtist.url && (
                      <a
                        href={geniusInfo.primaryArtist.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-purple-400 hover:text-purple-300 font-medium inline-flex items-center gap-1 mt-0.5"
                      >
                        Страница на Genius <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Fallback state when Genius has no extra insights or is unconfigured */}
            {!isLoadingGenius && !geniusInfo && (
              <div className="p-6 rounded-2xl bg-[#0F132A]/50 border border-[#1E2442] text-center space-y-2">
                <HelpCircle className="w-8 h-8 text-slate-500 mx-auto" />
                {!isGeniusConfigured ? (
                  <>
                    <h4 className="text-xs font-bold text-amber-300 font-mono">
                      API-токен Genius не настроен
                    </h4>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      Для интеграции Genius требуется Client Access Token. Вы можете указать токен в панели «Админ → Интеграции» или через переменную <code className="text-purple-300 bg-purple-950/60 px-1 py-0.5 rounded">GENIUS_ACCESS_TOKEN</code>.
                    </p>
                  </>
                ) : (
                  <>
                    <h4 className="text-xs font-bold text-slate-300 font-mono">
                      Информация Genius не найдена
                    </h4>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      Для этого трека пока нет подтверждённых описаний или комментариев авторов в базе Genius.
                    </p>
                  </>
                )}
                <div className="pt-2">
                  <button
                    onClick={openLyrics}
                    className="px-3.5 py-1.5 rounded-xl bg-[#151932] hover:bg-purple-600 text-purple-300 hover:text-white border border-[#1E2442] text-xs font-medium transition cursor-pointer"
                  >
                    Посмотреть текст песни
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-[#1E2442] bg-[#080A18]/80 shrink-0 flex items-center justify-between text-xs text-slate-400">
        <button
          onClick={openLyrics}
          className="px-3 py-1.5 rounded-xl bg-[#11152A] hover:bg-[#1A203F] hover:text-white border border-[#1E2442] transition flex items-center gap-1.5 cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5 text-purple-400" />
          <span>Текст песни</span>
        </button>

        {geniusInfo?.url && (
          <a
            href={geniusInfo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 font-mono text-[11px]"
          >
            <span>Genius.com</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
};
