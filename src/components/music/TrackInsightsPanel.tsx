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

  const [expandedCredits, setExpandedCredits] = useState(true);
  const [expandedDescription, setExpandedDescription] = useState(true);
  const [expandedAnnotations, setExpandedAnnotations] = useState(true);

  if (!currentTrack) {
    return (
      <div className={`p-8 text-center text-slate-400 rounded-3xl bg-[#0B0D20]/95 border border-[#1E2442] shadow-2xl ${className}`}>
        <Music2 className="w-10 h-10 text-purple-400 mx-auto mb-3 opacity-60" />
        <p className="text-sm font-semibold">Включите трек, чтобы увидеть факты и разборы Genius</p>
      </div>
    );
  }

  const rawCover = currentTrack.releaseCover || releaseInfo?.cover || currentTrack.thumbnail;
  const cover = getBestMusicImageUrl(rawCover, 'large');
  const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';
  const albumTitle = currentTrack.releaseTitle || releaseInfo?.title || currentTrack.album;

  return (
    <div
      className={`flex flex-col bg-[#0B0D20]/95 backdrop-blur-2xl border border-[#232952] rounded-3xl shadow-2xl overflow-hidden custom-scrollbar ${
        isFloating ? 'max-h-[90vh] h-[750px] min-h-[550px]' : 'h-full min-h-[500px]'
      } ${className}`}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-6 py-4 sm:px-8 sm:py-5 border-b border-[#232952] bg-[#0F132A]/90 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-600/30 border border-purple-400/30 shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm sm:text-base font-black text-[#F8FAFC] tracking-wider uppercase font-mono">
                О ТРЕКЕ
              </span>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                GENIUS INSIGHTS
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {geniusInfo?.url && (
            <a
              href={geniusInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-[#151932] hover:bg-purple-600/30 text-purple-300 hover:text-white border border-[#232952] transition-colors text-xs sm:text-sm font-semibold flex items-center gap-1.5 font-mono cursor-pointer"
              title="Открыть на Genius.com"
            >
              <span>Genius</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-[#151932] hover:bg-[#1E2442] text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Закрыть панель"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Content with animated track change */}
      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-7 space-y-6 sm:space-y-7 custom-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={String(currentTrack.id)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="space-y-6 sm:space-y-7"
          >
            {/* Track Hero Banner */}
            <div className="relative rounded-3xl overflow-hidden border border-[#232952] bg-gradient-to-b from-[#151932] via-[#0E122A] to-[#0B0D20] p-5 sm:p-7 shadow-xl">
              {geniusInfo?.headerImageUrl && (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-20 blur-md pointer-events-none"
                  style={{ backgroundImage: `url(${geniusInfo.headerImageUrl})` }}
                />
              )}
              <div className="relative z-10 flex flex-col sm:flex-row gap-5 items-start">
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-[#0B0D20] border border-[#232952] shrink-0 shadow-lg">
                  {cover ? (
                    <img src={cover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-purple-400">
                      <Music2 className="w-10 h-10" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <h3 className="text-lg sm:text-2xl font-black text-[#F8FAFC] leading-snug">
                    {currentTrack.title}
                  </h3>
                  <div className="text-sm sm:text-base text-[#A78BFA] font-bold">
                    <ArtistLinks
                      artistName={artistName}
                      artists={(currentTrack as any).artists}
                      artistSlug={currentTrack.artistSlug}
                      artistId={currentTrack.artistId}
                    />
                  </div>
                  {albumTitle && (
                    <p className="text-xs sm:text-sm text-slate-300 truncate">
                      Альбом: <span className="text-white font-semibold">{albumTitle}</span>
                    </p>
                  )}
                  {geniusInfo?.releaseDate && (
                    <p className="text-xs font-mono text-slate-400">
                      Дата релиза: <span className="text-slate-200">{geniusInfo.releaseDate}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Verified badge / Hot metrics */}
              {geniusInfo && (
                <div className="mt-4 pt-4 border-t border-[#232952] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex items-center gap-2.5">
                    {geniusInfo.verified && (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-3 py-1 rounded-full font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Верифицировано
                      </span>
                    )}
                    {geniusInfo.stats?.hot && (
                      <span className="inline-flex items-center gap-1.5 text-amber-400 bg-amber-950/60 border border-amber-500/40 px-3 py-1 rounded-full font-bold">
                        <Flame className="w-3.5 h-3.5" />
                        Популярное на Genius
                      </span>
                    )}
                  </div>
                  {geniusInfo.stats?.pageviews && (
                    <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                      <Eye className="w-4 h-4 text-purple-400" />
                      {geniusInfo.stats.pageviews.toLocaleString()} просмотров
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Loading state skeleton */}
            {isLoadingGenius && (
              <div className="space-y-4 p-6 rounded-3xl bg-[#0F132A]/60 border border-[#232952] animate-pulse">
                <div className="h-5 w-40 bg-purple-900/40 rounded-lg" />
                <div className="space-y-3">
                  <div className="h-4 w-full bg-slate-800 rounded-lg" />
                  <div className="h-4 w-11/12 bg-slate-800 rounded-lg" />
                  <div className="h-4 w-4/5 bg-slate-800 rounded-lg" />
                </div>
                <div className="h-20 w-full bg-slate-900/60 rounded-2xl" />
              </div>
            )}

            {/* Focused annotation breakdown banner if user clicked a specific lyrics line */}
            {focusedAnnotation && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-purple-950/80 via-indigo-950/60 to-[#0F132A] border border-purple-500/50 shadow-2xl space-y-3.5 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-purple-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    Пояснение выбранной строки
                  </span>
                  <button
                    onClick={() => setFocusedAnnotation(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-purple-900/40 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-purple-950/40 border-l-4 border-purple-400 text-sm sm:text-base text-white font-serif italic">
                  «{focusedAnnotation.fragment}»
                </div>

                <p className="text-sm sm:text-base text-slate-100 leading-relaxed sm:leading-loose whitespace-pre-line font-sans">
                  {focusedAnnotation.bodyPlain}
                </p>

                {focusedAnnotation.author && (
                  <div className="pt-3 border-t border-purple-800/40 flex items-center justify-between text-xs font-mono text-purple-300">
                    <span>Автор пояснения: <strong className="text-white">{focusedAnnotation.author.name}</strong></span>
                    {focusedAnnotation.verified && (
                      <span className="text-emerald-400 font-bold">✓ Подтверждено</span>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* 1. Track Meaning & Description */}
            {geniusInfo?.description ? (
              <div className="rounded-3xl bg-[#0F132A]/80 border border-[#232952] overflow-hidden shadow-lg">
                <button
                  onClick={() => setExpandedDescription(!expandedDescription)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-[#151932] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-purple-400" />
                    <span className="text-sm sm:text-base font-extrabold text-[#F8FAFC] tracking-wider uppercase font-mono">
                      О чём этот трек
                    </span>
                  </div>
                  {expandedDescription ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </button>

                {expandedDescription && (
                  <div className="px-6 pb-6 pt-2 text-sm sm:text-base text-slate-200 leading-relaxed sm:leading-loose space-y-3 border-t border-[#232952] whitespace-pre-line">
                    {geniusInfo.description}
                  </div>
                )}
              </div>
            ) : null}

            {/* 2. Genius Annotations List */}
            {geniusInfo?.annotations && geniusInfo.annotations.length > 0 ? (
              <div className="rounded-3xl bg-[#0F132A]/80 border border-[#232952] overflow-hidden shadow-lg space-y-1">
                <button
                  onClick={() => setExpandedAnnotations(!expandedAnnotations)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-[#151932] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-amber-400" />
                    <div className="flex items-center gap-2">
                      <span className="text-sm sm:text-base font-extrabold text-[#F8FAFC] tracking-wider uppercase font-mono">
                        Аннотации строк
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        {geniusInfo.annotations.length}
                      </span>
                    </div>
                  </div>
                  {expandedAnnotations ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </button>

                {expandedAnnotations && (
                  <div className="px-4 pb-5 space-y-3.5 border-t border-[#232952]">
                    {geniusInfo.annotations.map((ann) => (
                      <div
                        key={ann.id}
                        onClick={() => setFocusedAnnotation(ann)}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer text-left space-y-2 ${
                          focusedAnnotation?.id === ann.id
                            ? 'bg-purple-950/70 border-purple-400/80 shadow-xl'
                            : 'bg-[#0B0D20] hover:bg-[#151932] border-[#232952]'
                        }`}
                      >
                        <div className="text-sm sm:text-base font-serif italic text-purple-200 font-medium">
                          «{ann.fragment}»
                        </div>
                        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed sm:leading-relaxed">
                          {ann.bodyPlain}
                        </p>
                        <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-2 border-t border-white/5">
                          {ann.author ? <span>Автор: @{ann.author.name}</span> : <span>Genius community</span>}
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
              <div className="rounded-3xl bg-[#0F132A]/80 border border-[#232952] overflow-hidden shadow-lg">
                <button
                  onClick={() => setExpandedCredits(!expandedCredits)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-[#151932] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-indigo-400" />
                    <span className="text-sm sm:text-base font-extrabold text-[#F8FAFC] tracking-wider uppercase font-mono">
                      Создатели и участники
                    </span>
                  </div>
                  {expandedCredits ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </button>

                {expandedCredits && (
                  <div className="p-5 sm:p-6 space-y-4 border-t border-[#232952]">
                    {geniusInfo.credits.map((cr, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
                          {cr.role}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {cr.artists.map((art, aIdx) => (
                            <span
                              key={aIdx}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0B0D20] border border-[#232952] text-xs sm:text-sm font-medium text-slate-100"
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
              <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#151035] to-[#0B0D20] border border-[#2E2263] space-y-3 shadow-xl">
                <span className="text-xs font-mono uppercase tracking-wider text-purple-300 font-bold">
                  Об исполнителе
                </span>
                <div className="flex items-center gap-4">
                  {geniusInfo.primaryArtist.imageUrl ? (
                    <img
                      src={geniusInfo.primaryArtist.imageUrl}
                      alt=""
                      className="w-14 h-14 rounded-full object-cover border-2 border-purple-500/50 shrink-0 shadow-lg"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-purple-900/50 border border-purple-500/50 flex items-center justify-center text-purple-200 shrink-0 font-bold text-base">
                      {geniusInfo.primaryArtist.name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h4 className="text-base sm:text-lg font-bold text-white truncate">
                      {geniusInfo.primaryArtist.name}
                    </h4>
                    {geniusInfo.primaryArtist.url && (
                      <a
                        href={geniusInfo.primaryArtist.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs sm:text-sm text-purple-400 hover:text-purple-300 font-semibold inline-flex items-center gap-1.5 mt-1"
                      >
                        Страница на Genius <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Fallback state when Genius has no extra insights or is unconfigured */}
            {!isLoadingGenius && !geniusInfo && (
              <div className="p-8 rounded-3xl bg-[#0F132A]/60 border border-[#232952] text-center space-y-3">
                <HelpCircle className="w-10 h-10 text-slate-500 mx-auto" />
                {!isGeniusConfigured ? (
                  <>
                    <h4 className="text-sm font-bold text-amber-300 font-mono">
                      API-токен Genius не настроен
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
                      Для интеграции Genius требуется Client Access Token. Вы можете указать токен в панели «Админ → Интеграции» или через переменную <code className="text-purple-300 bg-purple-950/60 px-1.5 py-0.5 rounded font-mono">GENIUS_ACCESS_TOKEN</code>.
                    </p>
                  </>
                ) : (
                  <>
                    <h4 className="text-sm font-bold text-slate-200 font-mono">
                      Информация Genius не найдена
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
                      Для этого трека пока нет подтверждённых описаний или комментариев авторов в базе Genius.
                    </p>
                  </>
                )}
                <div className="pt-2">
                  <button
                    onClick={openLyrics}
                    className="px-4 py-2 rounded-xl bg-[#151932] hover:bg-purple-600 text-purple-300 hover:text-white border border-[#232952] text-xs sm:text-sm font-semibold transition cursor-pointer"
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
      <div className="px-6 py-4 border-t border-[#232952] bg-[#080A18]/90 shrink-0 flex items-center justify-between text-xs sm:text-sm text-slate-300">
        <button
          onClick={openLyrics}
          className="px-4 py-2 rounded-xl bg-[#11152A] hover:bg-[#1A203F] hover:text-white border border-[#232952] transition flex items-center gap-2 cursor-pointer font-medium"
        >
          <FileText className="w-4 h-4 text-purple-400" />
          <span>Текст песни</span>
        </button>

        {geniusInfo?.url && (
          <a
            href={geniusInfo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1.5 font-mono text-xs sm:text-sm"
          >
            <span>Genius.com</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
};
