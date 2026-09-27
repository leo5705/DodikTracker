import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
  Disc,
  Music2,
  Maximize2,
  AlertTriangle,
} from 'lucide-react';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';
import { TrackActionsMenu } from './TrackActionsMenu.tsx';
import { ArtistLinks } from './ArtistLinks.tsx';

export const CompactMusicPlayer: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  const { navigate } = useRouter();
  const {
    currentTrack,
    releaseInfo,
    artistInfo,
    isPlaying,
    playbackStatus,
    currentTime,
    duration,
    togglePlayPause,
    playNext,
    playPrev,
    seek,
    openExpanded,
    closeExpanded,
    isExpanded,
    queue,
    queueIndex,
    repeatMode,
    isShuffle,
  } = useMusicPlayer();

  const handleToggleExpanded = (e: React.MouseEvent) => {
    if (isExpanded) {
      closeExpanded();
    } else {
      openExpanded();
    }
  };

  // 1. Idle state: No track is playing
  if (!currentTrack) {
    return (
      <div className={`shrink-0 ${className}`}>
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/music')}
          className="flex items-center gap-2 h-10 px-3.5 rounded-xl bg-[#0B0D20] hover:bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/50 text-xs font-bold text-[#CBD5E1] hover:text-[#F8FAFC] transition-all cursor-pointer group shadow-sm"
          title="Открыть музыкальный раздел"
        >
          <div className="w-5 h-5 rounded-lg bg-[#181436] flex items-center justify-center text-[#A78BFA] group-hover:scale-110 transition-transform">
            <Disc className="w-3.5 h-3.5" />
          </div>
          <span className="tracking-wide">🎵 Музыка</span>
        </motion.button>
      </div>
    );
  }

  // 2. Active playback state
  const rawCover = currentTrack.releaseCover || releaseInfo?.cover || currentTrack.thumbnail;
  const cover = getBestMusicImageUrl(rawCover, 'medium');
  const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const handleSeekFromProgressBar = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    seek(ratio * duration);
  };

  return (
    <motion.div
      layoutId="global-music-player"
      initial={{ opacity: 0, y: -20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.96 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      onClick={handleToggleExpanded}
      className={`relative shrink-0 flex items-center justify-between bg-[#0B0D20]/95 hover:bg-[#0E1128] border border-[#1E2442] hover:border-[#8B5CF6]/50 rounded-xl px-2.5 py-1.5 h-11 sm:h-12 w-full max-w-[320px] sm:max-w-[360px] md:max-w-[390px] lg:max-w-[420px] transition-all shadow-lg overflow-hidden group select-none cursor-pointer z-30 ${className}`}
    >
      {/* Clickable Area: Artwork & Metadata -> Toggles EXPANDED Player */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-1">
        {/* Track Artwork */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="w-8 h-8 rounded-lg overflow-hidden bg-[#151932] border border-[#1E2442] shrink-0 flex items-center justify-center relative group/cover shadow-sm"
        >
          {cover ? (
            <AnimatePresence mode="wait">
              <motion.img
                key={cover}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.4 }}
                transition={{ duration: 0.2 }}
                src={cover}
                alt=""
                className="w-full h-full object-cover"
              />
            </AnimatePresence>
          ) : (
            <Music2 className="w-4 h-4 text-[#A78BFA]" />
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center transition-opacity">
            <ChevronDown className={`w-3.5 h-3.5 text-white transform transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
          </div>
        </motion.div>

        {/* Title & Artist */}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-[#F8FAFC] truncate group-hover:text-[#A78BFA] transition-colors">
              {currentTrack.title}
            </span>
            {currentTrack.explicit && (
              <span className="px-1 py-0.2 text-[8px] font-black rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0 leading-none">
                18+
              </span>
            )}
            {(playbackStatus === 'blocked' || playbackStatus === 'error') && (
              <span
                className="inline-flex items-center px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] shrink-0"
                title={playbackStatus === 'blocked' ? 'Встроенное воспроизведение ограничено' : 'Ошибка воспроизведения источника'}
              >
                <AlertTriangle className="w-2.5 h-2.5 mr-0.5 text-amber-400" />
                {playbackStatus === 'blocked' ? 'Ограничен' : 'Ошибка'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-0.5 truncate text-[11px] text-[#94A3B8]">
            <ArtistLinks
              artistName={artistName}
              artistSlug={currentTrack.artistSlug}
              artistId={currentTrack.artistId}
              linkClassName="hover:text-purple-300"
            />
          </div>
        </div>
      </div>

      {/* Playback Controls & Expand Button */}
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            playPrev();
          }}
          className="p-1.5 text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] rounded-lg transition-colors cursor-pointer"
          title="Предыдущий трек"
        >
          <SkipBack className="w-3.5 h-3.5 fill-current" />
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={(e) => {
            e.stopPropagation();
            togglePlayPause();
          }}
          className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] hover:brightness-110 active:scale-95 text-white flex items-center justify-center shadow-md shadow-[#7C3AED]/30 transition-all cursor-pointer relative overflow-hidden"
          title={isPlaying ? 'Пауза' : 'Воспроизведение'}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={isPlaying ? 'pause' : 'play'}
              initial={{ scale: 0.5, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0, rotate: 30 }}
              transition={{ duration: 0.15 }}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            playNext();
          }}
          disabled={queueIndex >= queue.length - 1 && repeatMode === 'OFF' && !isShuffle}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            queueIndex >= queue.length - 1 && repeatMode === 'OFF' && !isShuffle
              ? 'text-[#334155] cursor-not-allowed'
              : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932]'
          }`}
          title="Следующий трек"
        >
          <SkipForward className="w-3.5 h-3.5 fill-current" />
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            if (isExpanded) {
              closeExpanded();
            } else {
              openExpanded();
            }
          }}
          className="p-1.5 text-[#64748B] hover:text-[#A78BFA] hover:bg-[#151932] rounded-lg transition-colors cursor-pointer hidden sm:inline-flex"
          title={isExpanded ? 'Свернуть плеер' : 'Развернуть панель плеера'}
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </motion.button>

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
          btnClassName="p-1.5 text-[#64748B] hover:text-[#A78BFA] hover:bg-[#151932] rounded-lg transition-colors cursor-pointer"
        />
      </div>

      {/* Mini Progress Bar at bottom */}
      <div
        onClick={handleSeekFromProgressBar}
        className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#151932] group-hover:h-[4px] transition-all cursor-pointer"
        title={`Перемотка (${Math.round(progressPercent)}%)`}
      >
        <div
          className="h-full bg-gradient-to-r from-[#7C3AED] to-[#6366F1] transition-all duration-150 relative"
          style={{ width: `${progressPercent}%` }}
        >
          <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white opacity-0 group-hover:opacity-100 shadow-sm transition-opacity" />
        </div>
      </div>
    </motion.div>
  );
};
