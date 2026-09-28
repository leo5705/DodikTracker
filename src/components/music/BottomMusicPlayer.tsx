import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useMusicPlayer, useMusicTime } from '../../context/MusicPlayerContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';
import { ArtistLinks } from './ArtistLinks.tsx';
import { TrackActionsMenu } from './TrackActionsMenu.tsx';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Volume1,
  Maximize2,
  Minimize2,
  FileText,
  ListMusic,
  Sparkles,
  Heart,
  Music2,
  AlertTriangle,
  Info,
  ChevronUp,
} from 'lucide-react';

export const BottomMusicPlayer: React.FC<{
  className?: string;
  onOpenMobileInsights?: () => void;
}> = ({ className = '', onOpenMobileInsights }) => {
  const { navigate } = useRouter();
  const { currentTime, duration } = useMusicTime();
  const {
    currentTrack,
    releaseInfo,
    artistInfo,
    isPlaying,
    playbackStatus,
    playbackError,
    volume,
    isMuted,
    setVolume,
    toggleMute,
    togglePlayPause,
    playNext,
    playPrev,
    seek,
    repeatMode,
    toggleRepeat,
    isShuffle,
    toggleShuffle,
    openExpanded,
    openFullscreen,
    openLyrics,
    isLyricsOpen,
    activeTab,
    setActiveTab,
    isCurrentTrackFavorite,
    toggleFavoriteTrack,
    isInsightsOpen,
    toggleInsights,
  } = useMusicPlayer();

  const [isHoveringBar, setIsHoveringBar] = useState(false);
  const [hoverPositionSec, setHoverPositionSec] = useState<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  if (!currentTrack) return null;

  const rawCover = currentTrack.releaseCover || releaseInfo?.cover || currentTrack.thumbnail;
  const cover = getBestMusicImageUrl(rawCover, 'medium');
  const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    setHoverPositionSec(ratio * duration);
  };

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    seek(ratio * duration);
  };

  return (
    <motion.aside
      layoutId="global-music-player"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed bottom-0 left-0 right-0 z-40 bg-[#0B0D20]/95 backdrop-blur-2xl border-t border-[#1E2442] shadow-[0_-10px_30px_rgba(0,0,0,0.5)] select-none ${className}`}
    >
      {/* Top Scrubber Progress Bar for smooth scrub across entire top edge */}
      <div
        ref={progressBarRef}
        onClick={handleSeekClick}
        onMouseEnter={() => setIsHoveringBar(true)}
        onMouseLeave={() => {
          setIsHoveringBar(false);
          setHoverPositionSec(null);
        }}
        onMouseMove={handleProgressBarMouseMove}
        className="group relative w-full h-1.5 bg-[#151932] hover:h-2.5 transition-all cursor-pointer"
      >
        {/* Fill */}
        <div
          className="h-full bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#A78BFA] relative transition-[width] duration-100 ease-linear"
          style={{ width: `${progressPercent}%` }}
        >
          {/* Thumb indicator on hover */}
          <span className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white opacity-0 group-hover:opacity-100 shadow-md transition-opacity pointer-events-none" />
        </div>

        {/* Hover preview tooltip */}
        {isHoveringBar && hoverPositionSec !== null && (
          <div
            className="absolute -top-7 px-2 py-0.5 rounded-md bg-[#191D38] border border-[#8B5CF6]/40 text-[10px] font-mono font-bold text-white shadow-lg pointer-events-none transform -translate-x-1/2"
            style={{
              left: `${(hoverPositionSec / duration) * 100}%`,
            }}
          >
            {formatTime(hoverPositionSec)}
          </div>
        )}
      </div>

      <div className="h-20 max-w-[1920px] mx-auto px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-6">
        {/* 1. Left: Track Metadata & Favorite */}
        <div className="flex items-center gap-3 min-w-0 flex-1 sm:flex-initial sm:w-[280px] lg:w-[320px]">
          {/* Artwork with expand button */}
          <motion.div
            layoutId="global-player-cover"
            onClick={openFullscreen}
            className="relative w-12 h-12 rounded-xl overflow-hidden bg-[#151932] border border-[#1E2442] shrink-0 cursor-pointer group/art shadow-md"
            title="Открыть полноэкранный плеер"
          >
            {cover ? (
              <img src={cover} alt="" className="w-full h-full object-cover group-hover/art:scale-105 transition-transform" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-purple-400">
                <Music2 className="w-5 h-5" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/art:opacity-100 flex items-center justify-center transition-opacity">
              <Maximize2 className="w-4 h-4 text-white" />
            </div>
          </motion.div>

          <div className="min-w-0 flex-1 leading-tight space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span
                onClick={openFullscreen}
                className="text-xs sm:text-sm font-bold text-[#F8FAFC] truncate hover:text-[#A78BFA] transition-colors cursor-pointer"
              >
                {currentTrack.title}
              </span>
              {currentTrack.explicit && (
                <span className="px-1 py-0.2 text-[8px] font-black rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0 leading-none">
                  18+
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#94A3B8] truncate">
              <ArtistLinks
                artistName={artistName}
                artists={(currentTrack as any).artists}
                artistSlug={currentTrack.artistSlug}
                artistId={currentTrack.artistId}
                linkClassName="hover:text-purple-300 transition-colors"
              />
            </div>
          </div>

          {/* Favorite button */}
          <button
            onClick={() => toggleFavoriteTrack(currentTrack.id, currentTrack.isFavorite)}
            className={`p-2 rounded-xl transition-colors cursor-pointer shrink-0 ${
              isCurrentTrackFavorite
                ? 'text-rose-400 hover:text-rose-300'
                : 'text-slate-500 hover:text-white hover:bg-[#151932]'
            }`}
            title={isCurrentTrackFavorite ? 'Удалить из любимых' : 'Добавить в любимые'}
          >
            <Heart className={`w-4 h-4 ${isCurrentTrackFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* 2. Center: Playback Controls & Time */}
        <div className="flex flex-col items-center justify-center flex-1 max-w-xl">
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Shuffle */}
            <button
              onClick={toggleShuffle}
              className={`p-2 rounded-xl transition-colors cursor-pointer hidden sm:inline-flex ${
                isShuffle
                  ? 'text-[#8B5CF6] bg-[#191D38] border border-[#8B5CF6]/30'
                  : 'text-slate-400 hover:text-white hover:bg-[#151932]'
              }`}
              title={isShuffle ? 'Случайный порядок включен' : 'Включить случайный порядок'}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            {/* Prev */}
            <button
              onClick={playPrev}
              className="p-2 text-slate-300 hover:text-white hover:bg-[#151932] rounded-xl transition-colors cursor-pointer"
              title="Предыдущий трек"
            >
              <SkipBack className="w-4.5 h-4.5 fill-current" />
            </button>

            {/* Play / Pause */}
            <button
              onClick={togglePlayPause}
              className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] hover:brightness-110 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-[#7C3AED]/30 transition-all cursor-pointer"
              title={isPlaying ? 'Пауза' : 'Воспроизведение'}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={isPlaying ? 'pause' : 'play'}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </motion.div>
              </AnimatePresence>
            </button>

            {/* Next */}
            <button
              onClick={playNext}
              className="p-2 text-slate-300 hover:text-white hover:bg-[#151932] rounded-xl transition-colors cursor-pointer"
              title="Следующий трек"
            >
              <SkipForward className="w-4.5 h-4.5 fill-current" />
            </button>

            {/* Repeat */}
            <button
              onClick={toggleRepeat}
              className={`p-2 rounded-xl transition-colors cursor-pointer hidden sm:inline-flex ${
                repeatMode !== 'OFF'
                  ? 'text-[#8B5CF6] bg-[#191D38] border border-[#8B5CF6]/30'
                  : 'text-slate-400 hover:text-white hover:bg-[#151932]'
              }`}
              title={
                repeatMode === 'ONE'
                  ? 'Повтор одного трека'
                  : repeatMode === 'ALL'
                  ? 'Повтор очереди'
                  : 'Повтор выключен'
              }
            >
              {repeatMode === 'ONE' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>
          </div>

          {/* Time display */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* 3. Right: Insights, Lyrics, Queue, Volume, Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 sm:w-[280px] lg:w-[320px] justify-end">
          {/* Genius Track Insights Toggle Button */}
          <button
            onClick={() => {
              if (window.innerWidth < 1024 && onOpenMobileInsights) {
                onOpenMobileInsights();
              } else {
                toggleInsights();
              }
            }}
            className={`p-2 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer text-xs font-mono font-bold ${
              isInsightsOpen
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-purple-300 hover:text-white bg-[#15122E] hover:bg-[#20184E] border border-purple-500/30'
            }`}
            title="Genius информация о треке"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden lg:inline">О треке</span>
          </button>

          {/* Lyrics Button */}
          <button
            onClick={openLyrics}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              isLyricsOpen
                ? 'bg-[#181436] text-[#A78BFA] border border-[#8B5CF6]/40'
                : 'text-slate-400 hover:text-white hover:bg-[#151932]'
            }`}
            title="Открыть текст песни (Караоке)"
          >
            <FileText className="w-4 h-4" />
          </button>

          {/* Queue Button */}
          <button
            onClick={() => {
              setActiveTab('queue');
              openFullscreen();
            }}
            className="p-2 text-slate-400 hover:text-white hover:bg-[#151932] rounded-xl transition-colors cursor-pointer hidden md:inline-flex"
            title="Очередь воспроизведения"
          >
            <ListMusic className="w-4 h-4" />
          </button>

          {/* Volume Control */}
          <div className="hidden lg:flex items-center gap-1.5 pl-1">
            <button
              onClick={toggleMute}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title={isMuted ? 'Включить звук' : 'Выключить звук'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : volume < 0.5 ? (
                <Volume1 className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-18 h-1 bg-[#1E2442] rounded-lg appearance-none cursor-pointer accent-purple-500"
              title={`Громкость: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            />
          </div>

          {/* Fullscreen Player trigger */}
          <button
            onClick={openFullscreen}
            className="p-2 text-slate-400 hover:text-white hover:bg-[#151932] rounded-xl transition-colors cursor-pointer hidden sm:inline-flex"
            title="Полноэкранный режим"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Actions Context Menu */}
          <TrackActionsMenu
            track={{
              id: currentTrack.id,
              source: currentTrack.source,
              videoId: currentTrack.videoId,
              title: currentTrack.title,
              artistName: artistName,
              releaseTitle: currentTrack.releaseTitle || releaseInfo?.title || null,
              releaseCover: rawCover,
              thumbnail: rawCover,
              duration: duration,
              isFavorite: currentTrack.isFavorite,
            }}
            btnClassName="p-2 text-slate-400 hover:text-white hover:bg-[#151932] rounded-xl transition-colors cursor-pointer"
          />
        </div>
      </div>
    </motion.aside>
  );
};
