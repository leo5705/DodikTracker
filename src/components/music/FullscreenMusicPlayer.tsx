import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  ChevronDown,
  X,
  ListMusic,
  FileText,
  Info,
  Music2,
  Disc,
  Sparkles,
  Heart,
  Maximize2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';
import { LiveLyrics } from './LiveLyrics.tsx';
import { TrackActionsMenu } from './TrackActionsMenu.tsx';
import { ArtistLinks } from './ArtistLinks.tsx';
import { TrackInsightsPanel } from './TrackInsightsPanel.tsx';

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const overlayVariants: any = {
  hidden: {
    opacity: 0,
    backdropFilter: 'blur(0px)',
  },
  visible: {
    opacity: 1,
    backdropFilter: 'blur(24px)',
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1],
      when: 'beforeChildren',
      staggerChildren: 0.08,
    },
  },
  exit: {
    opacity: 0,
    backdropFilter: 'blur(0px)',
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
      when: 'afterChildren',
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
};

const topBarVariants: any = {
  hidden: { y: -20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { y: -20, opacity: 0, transition: { duration: 0.3, ease: 'easeIn' } },
};

const playerContainerVariants: any = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.3, ease: 'easeIn' } },
};

const leftColumnVariants: any = {
  hidden: { scale: 0.95, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { duration: 0.5, ease: 'easeOut' } },
  exit: { scale: 0.95, opacity: 0, transition: { duration: 0.3, ease: 'easeIn' } },
};

const controlsVariants: any = {
  hidden: { y: 15, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { y: 15, opacity: 0, transition: { duration: 0.3, ease: 'easeIn' } },
};

const rightColumnVariants: any = {
  hidden: { x: 20, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.5, ease: 'easeOut' } },
  exit: { x: 20, opacity: 0, transition: { duration: 0.3, ease: 'easeIn' } },
};

export const FullscreenMusicPlayer: React.FC = () => {
  const { navigate } = useRouter();
  const { dbUser } = useAuth();
  const {
    currentTrack,
    releaseInfo,
    artistInfo,
    isPlaying,
    playbackStatus,
    playbackError,
    currentTime,
    duration,
    volume,
    isMuted,
    playerState,
    repeatMode,
    isShuffle,
    activeTab,
    setActiveTab,
    queue,
    queueIndex,
    setPlayerState,
    closePlayer,
    openLyrics,
    togglePlayPause,
    playNext,
    playPrev,
    playQueueIndex,
    seek,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    toggleFavoriteTrack,
    removeFromQueue,
    updateTrackLyrics,
  } = useMusicPlayer();

  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [showLyricsSection, setShowLyricsSection] = useState(true);
  const [showGeniusSection, setShowGeniusSection] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);

  // Prevent outer modal container from scrolling
  const handleModalScroll = () => {
    if (modalRef.current && modalRef.current.scrollTop !== 0) {
      modalRef.current.scrollTop = 0;
    }
  };

  // Load lyrics when lyrics or insights tab is open
  useEffect(() => {
    if (playerState === 'fullscreen' && (activeTab === 'lyrics' || (activeTab as any) === 'insights') && currentTrack && !currentTrack.lyrics && !lyricsLoading) {
      setLyricsLoading(true);
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
        .catch(() => {})
        .finally(() => setLyricsLoading(false));
    }
  }, [playerState, activeTab, currentTrack?.id]);

  if (!currentTrack) return null;

  const isVisible = playerState === 'fullscreen';

  const rawCover = currentTrack.releaseCover || releaseInfo?.cover || currentTrack.thumbnail;
  const cover = getBestMusicImageUrl(rawCover, 'large');
  const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';
  const artistSlug = currentTrack.artistSlug || releaseInfo?.artistSlug || artistInfo?.slug;
  const releaseTitle = currentTrack.releaseTitle || releaseInfo?.title || currentTrack.album;
  const releaseSlug = currentTrack.releaseSlug || releaseInfo?.slug;

  const handleArtistClick = () => {
    closePlayer();
    if (artistSlug) {
      navigate(`/music/artist/${artistSlug}`);
    } else if (currentTrack.artistId) {
      navigate(`/music/external/artist/youtube/${currentTrack.artistId}`);
    } else if (artistName && artistName !== 'Исполнитель') {
      navigate(`/music/search?q=${encodeURIComponent(artistName)}`);
    }
  };

  const handleReleaseClick = () => {
    closePlayer();
    if (releaseSlug) {
      navigate(`/music/release/${releaseSlug}`);
    } else if (currentTrack.releaseId) {
      navigate(`/music/release/${currentTrack.releaseId}`);
    } else if (releaseTitle) {
      navigate(`/music/search?q=${encodeURIComponent(releaseTitle)}`);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="fullscreen-music-player-overlay"
          ref={modalRef}
          onScroll={handleModalScroll}
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-50 bg-[#080A18]/98 backdrop-blur-3xl flex flex-col justify-between overflow-hidden select-none w-[100vw] h-[100dvh]"
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top, 16px))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 16px))',
            paddingLeft: 'max(1rem, env(safe-area-inset-left, 16px))',
            paddingRight: 'max(1rem, env(safe-area-inset-right, 16px))',
          }}
        >
          {/* Dynamic Ambient Background Glow - z-0 */}
          <div
            className="absolute inset-0 z-0 opacity-20 pointer-events-none blur-3xl scale-125 transition-all duration-700"
            style={{
              backgroundImage: cover ? `url(${cover})` : undefined,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }}
          />

          {/* Top Bar - Dedicated z-30 layer, persistent sticky header */}
          <motion.header
            variants={topBarVariants}
            className="sticky top-0 z-30 max-w-6xl mx-auto w-full px-2 sm:px-6 pb-3 flex items-center justify-between border-b border-slate-800/60 shrink-0 pointer-events-auto bg-[#080A18]/90 backdrop-blur-md"
          >
            <div className="flex items-center gap-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => setPlayerState('mini')}
                className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition flex items-center gap-1.5 text-xs font-bold cursor-pointer shadow-lg"
                title="Свернуть в мини-плеер"
              >
                <ChevronDown className="w-4 h-4" />
                <span className="hidden sm:inline">Свернуть</span>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={closePlayer}
                className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition flex items-center gap-1.5 text-xs font-bold cursor-pointer shadow-lg"
                title="Закрыть плеер"
              >
                <X className="w-4 h-4" />
              </motion.button>

              <TrackActionsMenu
                track={{
                  id: currentTrack.id,
                  source: currentTrack.source,
                  videoId: currentTrack.videoId,
                  title: currentTrack.title,
                  artistName: artistName,
                  releaseTitle: releaseTitle || null,
                  releaseCover: rawCover,
                  thumbnail: rawCover,
                  duration: duration,
                  isFavorite: currentTrack.isFavorite,
                }}
                btnClassName="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition cursor-pointer shadow-lg"
              />
            </div>

            <div className="text-center min-w-0 px-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-purple-400 font-bold block flex items-center justify-center gap-1">
                СЕЙЧАС ВОСПРОИЗВОДИТСЯ
              </span>
              <h3 className="text-xs sm:text-sm font-bold text-white max-w-xs truncate">{releaseTitle || 'Музыкальный плеер'}</h3>
            </div>

            {/* Tab Switchers & Fullscreen Lyrics trigger */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 shrink-0 shadow-lg">
              <button
                type="button"
                onClick={() => setActiveTab('queue')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'queue' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Очередь ({queue.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('lyrics')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'lyrics' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Текст</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('insights' as any)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  (activeTab as any) === 'insights' ? 'bg-purple-600 text-white shadow-md' : 'text-purple-300 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">О треке</span>
              </button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={openLyrics}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 transition flex items-center gap-1.5 cursor-pointer"
                title="Текст на весь экран"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Иммерсивный текст</span>
              </motion.button>
            </div>
          </motion.header>

          {/* Main Grid Content */}
          <motion.div
            variants={playerContainerVariants}
            className="relative z-10 max-w-6xl mx-auto w-full px-2 sm:px-6 py-3 sm:py-6 flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 items-center min-h-0 overflow-y-auto custom-scrollbar"
          >
            {/* Left Column: Artwork & Main Playback controls */}
            <motion.div
              variants={leftColumnVariants}
              className="md:col-span-6 lg:col-span-5 flex flex-col items-center text-center space-y-4 sm:space-y-5"
            >
              {/* Cover Art */}
              <motion.div
                layoutId="global-player-cover"
                className="relative w-48 h-48 sm:w-72 sm:h-72 rounded-3xl overflow-hidden bg-slate-950 border border-purple-500/30 shadow-[0_0_60px_rgba(147,51,234,0.25)] group shrink-0"
              >
                {cover ? (
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={cover}
                      initial={{ opacity: 0.3, scale: 1.05 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0.3, scale: 1.05 }}
                      transition={{ duration: 0.3 }}
                      src={cover}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover"
                    />
                  </AnimatePresence>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/40 to-slate-950">
                    <Disc className="w-20 h-20 text-purple-400 opacity-60 animate-spin-slow" />
                  </div>
                )}
                {isPlaying && (
                  <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-purple-600/90 backdrop-blur-md text-white text-[10px] font-bold tracking-wider flex items-center gap-1.5 shadow-lg border border-purple-400/30">
                    <Sparkles className="w-3 h-3 animate-spin" />
                    <span>ИГРАЕТ</span>
                  </div>
                )}
              </motion.div>

              {/* Title & Artist Details */}
              <div className="space-y-1.5 w-full">
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-2xl font-extrabold text-white tracking-tight leading-snug">
                    {currentTrack.title}
                  </h2>
                  {currentTrack.explicit && (
                    <span className="px-2 py-0.5 text-xs font-black rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase">
                      18+
                    </span>
                  )}
                </div>

                <div className="text-xs sm:text-sm font-medium text-slate-300 flex items-center justify-center flex-wrap gap-2">
                  <ArtistLinks
                    artistName={artistName}
                    artists={(currentTrack as any).artists}
                    artistSlug={artistSlug}
                    artistId={currentTrack.artistId}
                    linkClassName="hover:text-purple-300"
                  />
                  {releaseTitle && (
                    <>
                      <span className="text-slate-600">•</span>
                      <span onClick={handleReleaseClick} className={releaseSlug || currentTrack.releaseId ? 'text-slate-400 hover:text-purple-300 hover:underline cursor-pointer' : 'text-slate-400'}>
                        {releaseTitle}
                      </span>
                    </>
                  )}
                </div>

                {dbUser && (
                  <div className="pt-1 flex items-center justify-center">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleFavoriteTrack()}
                      className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer inline-flex items-center gap-2 text-xs font-bold ${
                        currentTrack.isFavorite
                          ? 'text-rose-400 bg-rose-500/15 border border-rose-500/30 shadow-lg shadow-rose-500/10'
                          : 'text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-800'
                      }`}
                      title={currentTrack.isFavorite ? 'Удалить из любимых' : 'Добавить в любимые'}
                    >
                      <Heart className={`w-3.5 h-3.5 ${currentTrack.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                      <span>{currentTrack.isFavorite ? 'В любимых треках' : 'В любимые'}</span>
                    </motion.button>
                  </div>
                )}
              </div>

              {/* Playback Error / Blocked Notice Banner */}
              {(playbackError || playbackStatus === 'blocked' || playbackStatus === 'error') && (
                <div className="w-full px-4 py-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-200">
                  <div className="flex items-center gap-2.5 min-w-0 text-left">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="truncate">
                      {playbackError?.message ||
                        (playbackStatus === 'blocked'
                          ? 'Встроенное воспроизведение запрещено правообладателем.'
                          : 'Не удалось воспроизвести данный источник.')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {playbackError?.canOpenExternal && playbackError?.youtubeUrl && (
                      <a
                        href={playbackError.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40 font-semibold transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>YouTube</span>
                      </a>
                    )}
                    {queue.length > 1 && (
                      <button
                        type="button"
                        onClick={playNext}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition cursor-pointer"
                      >
                        Следующий
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Timeline Scrubber */}
              <div className="w-full space-y-1.5">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => seek(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-all"
                />
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Primary Controls */}
              <div className="flex items-center justify-center gap-4 sm:gap-6 w-full pt-1">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={toggleShuffle}
                  className={`p-2.5 rounded-xl transition cursor-pointer ${
                    isShuffle ? 'text-purple-400 bg-purple-500/20 border border-purple-500/40' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Случайный порядок"
                >
                  <Shuffle className="w-5 h-5" />
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={playPrev}
                  className="p-2.5 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Предыдущий"
                >
                  <SkipBack className="w-6 h-6 fill-current" />
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.93 }}
                  onClick={togglePlayPause}
                  className="w-14 h-14 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-xl shadow-purple-500/40 transition cursor-pointer relative overflow-hidden"
                  title={isPlaying ? 'Пауза' : 'Играть'}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={isPlaying ? 'pause' : 'play'}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-0.5" />}
                    </motion.div>
                  </AnimatePresence>
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={playNext}
                  className="p-2.5 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Следующий"
                >
                  <SkipForward className="w-6 h-6 fill-current" />
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={toggleRepeat}
                  className={`p-2.5 rounded-xl transition relative cursor-pointer ${
                    repeatMode !== 'OFF' ? 'text-purple-400 bg-purple-500/20 border border-purple-500/40' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Повтор"
                >
                  <Repeat className="w-5 h-5" />
                  {repeatMode === 'ONE' && (
                    <span className="absolute -top-1 -right-1 text-[9px] font-black bg-purple-500 text-slate-950 rounded-full w-3.5 h-3.5 flex items-center justify-center">
                      1
                    </span>
                  )}
                </motion.button>
              </div>

              {/* Volume Control */}
              <div className="flex items-center justify-center gap-3 w-full max-w-xs pt-1">
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
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
            </motion.div>

            {/* Right Column: Tab Content Panel (Queue / LiveLyrics / Author Note / Genius Insights) */}
            <motion.div
              variants={rightColumnVariants}
              className="md:col-span-6 lg:col-span-7 h-full flex flex-col bg-slate-900/50 border border-slate-800/80 rounded-3xl p-5 sm:p-6 backdrop-blur-xl min-h-[480px] h-[580px] sm:h-[680px] max-h-[80vh] overflow-hidden"
            >
              {activeTab === 'queue' && (
                <div className="flex flex-col h-full min-h-0">
                  <div className="flex items-center justify-between mb-3 shrink-0 pb-2 border-b border-slate-800">
                    <h4 className="font-bold text-base text-white flex items-center gap-2">
                      <ListMusic className="w-5 h-5 text-purple-400" />
                      <span>Очередь воспроизведения</span>
                    </h4>
                    <span className="text-xs text-slate-400 font-mono font-semibold">
                      {queueIndex + 1} из {queue.length}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                    {queue.map((t, idx) => {
                      const isCurrent = idx === queueIndex;
                      const itemCover = t.releaseCover || t.thumbnail;
                      return (
                        <div
                          key={`${t.id}-${idx}`}
                          onClick={() => playQueueIndex(idx)}
                          className={`flex items-center justify-between p-3 rounded-2xl transition cursor-pointer group ${
                            isCurrent
                              ? 'bg-purple-600/20 border border-purple-500/40 text-purple-300'
                              : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-6 text-center text-xs font-mono font-bold text-slate-500 group-hover:text-purple-400 shrink-0">
                              {isCurrent ? '▶' : idx + 1}
                            </span>

                            <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-950 border border-slate-800 shrink-0">
                              {itemCover ? (
                                <img src={itemCover} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-600">
                                  <Music2 className="w-4 h-4" />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h5 className={`text-sm font-bold truncate ${isCurrent ? 'text-white' : 'text-slate-200'}`}>
                                  {t.title}
                                </h5>
                                {t.explicit && (
                                  <span className="px-1 py-0.2 text-[9px] font-black rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                    18+
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 truncate mt-0.5">
                                <ArtistLinks
                                  artistName={t.artistName || artistName}
                                  artists={(t as any).artists}
                                  artistSlug={t.artistSlug}
                                  artistId={t.artistId}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-2">
                            <span className="text-xs font-mono text-slate-500 hidden sm:inline mr-1">
                              {t.duration ? formatTime(t.duration) : '—'}
                            </span>

                            <button
                              type="button"
                              onClick={async () => {
                                await toggleFavoriteTrack(t.id, t.isFavorite);
                              }}
                              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                t.isFavorite
                                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                              }`}
                              title={t.isFavorite ? 'Удалить из любимых' : 'Добавить в любимые'}
                              aria-label={t.isFavorite ? 'Удалить из любимых' : 'Добавить в любимые'}
                            >
                              <Heart className={`w-3.5 h-3.5 ${t.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                            </button>

                            <TrackActionsMenu
                              track={{
                                id: t.id,
                                source: t.source,
                                videoId: t.videoId,
                                title: t.title,
                                artistName: t.artistName || artistName,
                                artists: (t as any).artists,
                                releaseTitle: t.releaseTitle || null,
                                releaseCover: t.releaseCover || t.thumbnail,
                                thumbnail: t.thumbnail || t.releaseCover,
                                duration: t.duration,
                                explicit: t.explicit,
                                isFavorite: t.isFavorite,
                              }}
                              isInQueue={true}
                              onRemoveFromQueue={() => removeFromQueue(t.id)}
                              btnClassName="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(activeTab === 'lyrics' || (activeTab as any) === 'insights') && (
                <div className="flex flex-col h-full min-h-0">
                  {/* Top Independent Toggle Row */}
                  <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span className="text-xs sm:text-sm font-bold text-slate-200">Панели информации</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Lyrics toggle */}
                      <button
                        onClick={() => setShowLyricsSection(!showLyricsSection)}
                        className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer border ${
                          showLyricsSection
                            ? 'bg-purple-600/30 text-purple-300 border-purple-500/40 hover:bg-purple-600/50'
                            : 'bg-slate-800 text-slate-400 border-slate-700/50 hover:bg-slate-700'
                        }`}
                        title={showLyricsSection ? 'Скрыть текст песни' : 'Показать текст песни'}
                      >
                        <FileText className="w-3 h-3 text-purple-400" />
                        <span className="hidden sm:inline">Текст:</span>
                        <span className="font-extrabold uppercase">{showLyricsSection ? 'Вкл' : 'Выкл'}</span>
                      </button>

                      {/* Genius toggle */}
                      <button
                        onClick={() => setShowGeniusSection(!showGeniusSection)}
                        className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer border ${
                          showGeniusSection
                            ? 'bg-amber-500/25 text-amber-300 border-amber-500/45 hover:bg-amber-500/35'
                            : 'bg-slate-800 text-slate-400 border-slate-700/50 hover:bg-slate-700'
                        }`}
                        title={showGeniusSection ? 'Скрыть факты Genius' : 'Показать факты Genius'}
                      >
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span className="hidden sm:inline">Genius:</span>
                        <span className="font-extrabold uppercase">{showGeniusSection ? 'Вкл' : 'Выкл'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Split Layout Container */}
                  <div className="flex-1 min-h-0 h-full overflow-hidden">
                    <div className={`grid gap-4 h-full min-h-0 w-full overflow-hidden ${
                      showLyricsSection && showGeniusSection ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
                    }`}>
                      {/* Lyrics Panel */}
                      {showLyricsSection && (
                        <motion.div
                          key="lyrics-pane"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.2 }}
                          className="flex flex-col min-h-0 h-full bg-slate-950/40 rounded-2xl border border-slate-800/80 overflow-hidden"
                        >
                          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/50 shrink-0 bg-slate-900/40">
                            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-purple-400" />
                              Текст песни
                            </span>
                            <motion.button
                              type="button"
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={openLyrics}
                              className="px-2 py-0.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                              title="Иммерсивный полноэкранный текст"
                            >
                              <Maximize2 className="w-3 h-3" />
                              <span>Иммерсивный</span>
                            </motion.button>
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <LiveLyrics
                              lyrics={currentTrack.lyrics}
                              currentTime={currentTime}
                              isPlaying={isPlaying}
                              onSeekToLine={seek}
                              isLoading={lyricsLoading}
                              trackInfo={{
                                title: currentTrack.title,
                                artist: currentTrack.artistName,
                                cover: cover,
                                source: currentTrack.source,
                              }}
                            />
                          </div>
                        </motion.div>
                      )}

                      {/* Genius Panel */}
                      {showGeniusSection && (
                        <motion.div
                          key="genius-pane"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.2 }}
                          className="flex flex-col min-h-0 h-full overflow-hidden"
                        >
                          <TrackInsightsPanel className="h-full" />
                        </motion.div>
                      )}

                      {/* Both Hidden Placeholder */}
                      {!showLyricsSection && !showGeniusSection && (
                        <motion.div
                          key="hidden-pane"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500 bg-slate-950/20 border border-slate-800/40 rounded-2xl"
                        >
                          <Info className="w-9 h-9 text-slate-600 mb-2" />
                          <h5 className="text-xs sm:text-sm font-bold text-slate-400 font-mono">Все панели информационной вкладки скрыты</h5>
                          <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed">
                            Используйте переключатели вверху, чтобы вернуть отображение слов песни или деталей Genius.
                          </p>
                          <div className="flex gap-2 mt-4">
                            <button
                              onClick={() => setShowLyricsSection(true)}
                              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition cursor-pointer"
                            >
                              Показать Текст
                            </button>
                            <button
                              onClick={() => setShowGeniusSection(true)}
                              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer"
                            >
                              Показать Genius
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'note' && (
                <div className="flex flex-col h-full min-h-0">
                  <div className="flex items-center justify-between mb-3 shrink-0 pb-2 border-b border-slate-800">
                    <h4 className="font-bold text-base text-amber-300 flex items-center gap-2">
                      <Info className="w-5 h-5 text-amber-400" />
                      <span>Заметка автора</span>
                    </h4>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-5 bg-amber-950/20 border border-amber-500/30 rounded-2xl text-amber-100">
                    {currentTrack.authorNote ? (
                      <p className="text-sm leading-relaxed whitespace-pre-line font-medium">
                        {currentTrack.authorNote}
                      </p>
                    ) : (
                      <p className="text-slate-500 text-sm italic">Заметка от исполнителя отсутствует</p>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
