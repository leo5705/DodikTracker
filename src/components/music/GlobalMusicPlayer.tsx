import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  Heart,
  Maximize2,
  Disc,
  X,
} from 'lucide-react';
import { useMusicPlayer, useMusicTime } from '../../context/MusicPlayerContext.tsx';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';
import { ArtistLinks } from './ArtistLinks.tsx';
import { TrackActionsMenu } from './TrackActionsMenu.tsx';

/**
 * 1. Desktop TopBar Mini Player
 * Rendered inline inside TopBar on the same horizontal row as Search.
 */
export const DesktopTopBarMusicPlayer: React.FC<{ className?: string }> = ({ className = '' }) => {
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    closePlayer,
    setPlayerState,
    toggleFavoriteTrack,
    isCurrentTrackFavorite,
    releaseInfo,
    artistInfo,
    seek,
  } = useMusicPlayer();

  const { currentTime, duration } = useMusicTime();

  if (!currentTrack) return null;

  const rawCover = currentTrack.releaseCover || currentTrack.thumbnail || releaseInfo?.cover || null;
  const coverUrl = getBestMusicImageUrl(rawCover, 'small');
  const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    seek(ratio * duration);
  };

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key="desktop-topbar-music-player"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className={`hidden md:flex items-center relative h-10 px-2.5 rounded-xl bg-[#0B0D20] hover:bg-[#0E1128] border border-[#1E2442] hover:border-[#8B5CF6]/50 transition-colors text-white select-none max-w-[240px] lg:max-w-[300px] xl:max-w-[360px] 2xl:max-w-[420px] shrink min-w-0 shadow-sm group/player overflow-hidden ${className}`}
      >
        {/* Left: Artwork + Title · Artists (click -> fullscreen player) */}
        <div
          onClick={() => setPlayerState('fullscreen')}
          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer group/info"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setPlayerState('fullscreen');
            }
          }}
          title="Открыть полноэкранный плеер"
          aria-label="Открыть полноэкранный плеер"
        >
          {/* 28-32px Thumbnail Cover */}
          <div className="relative w-7 h-7 rounded-lg overflow-hidden bg-[#151932] border border-[#1E2442] shrink-0 flex items-center justify-center">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Disc className="w-3.5 h-3.5 text-[#8B5CF6]" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/info:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 className="w-3 h-3 text-white" />
            </div>
          </div>

          {/* Single line info: [Title] · [Artists] */}
          <div className="min-w-0 flex-1 flex items-center gap-1 text-xs font-medium leading-none">
            <span className="font-bold text-[#F8FAFC] group-hover/info:text-[#A78BFA] transition-colors truncate shrink-0 max-w-[55%]">
              {currentTrack.title}
            </span>

            {currentTrack.explicit && (
              <span className="px-1 py-0.2 text-[8px] font-black rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0 uppercase leading-none">
                18+
              </span>
            )}

            <span className="text-[#64748B] select-none text-[11px] shrink-0">·</span>

            <div
              className="text-[11px] text-[#94A3B8] truncate min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              <ArtistLinks
                artistName={artistName}
                artists={(currentTrack as any).artists}
                artistSlug={currentTrack.artistSlug}
                artistId={currentTrack.artistId}
                linkClassName="hover:text-purple-300"
              />
            </div>
          </div>
        </div>

        {/* Right buttons: [❤️] [▶/⏸] [⋮] [×] */}
        <div className="flex items-center gap-0.5 lg:gap-1 shrink-0 ml-1.5" onClick={(e) => e.stopPropagation()}>
          {/* Heart button */}
          <button
            type="button"
            onClick={() => toggleFavoriteTrack(currentTrack.id, currentTrack.isFavorite)}
            className={`w-6.5 h-6.5 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              currentTrack.isFavorite || isCurrentTrackFavorite
                ? 'text-rose-400'
                : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932]'
            }`}
            title={currentTrack.isFavorite || isCurrentTrackFavorite ? 'Удалить из любимого' : 'Добавить в любимое'}
            aria-label={currentTrack.isFavorite || isCurrentTrackFavorite ? 'Удалить из любимого' : 'Добавить в любимое'}
          >
            <Heart className={`w-3.5 h-3.5 ${currentTrack.isFavorite || isCurrentTrackFavorite ? 'fill-current text-rose-500' : ''}`} />
          </button>

          {/* Play / Pause button */}
          <button
            type="button"
            onClick={togglePlayPause}
            className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] hover:brightness-110 active:scale-95 text-white flex items-center justify-center shadow-sm shadow-[#7C3AED]/30 transition-all cursor-pointer"
            title={isPlaying ? 'Пауза' : 'Воспроизведение'}
            aria-label={isPlaying ? 'Пауза' : 'Воспроизведение'}
          >
            {isPlaying ? (
              <Pause className="w-3 h-3 fill-current" />
            ) : (
              <Play className="w-3 h-3 fill-current ml-0.5" />
            )}
          </button>

          {/* TrackActionsMenu (⋮) */}
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
              isFavorite: currentTrack.isFavorite || isCurrentTrackFavorite,
            }}
            btnClassName="w-6.5 h-6.5 text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] rounded-lg transition-colors flex items-center justify-center cursor-pointer"
          />

          {/* Close button (×) */}
          <button
            type="button"
            onClick={closePlayer}
            className="w-6.5 h-6.5 text-[#64748B] hover:text-rose-400 hover:bg-[#151932] rounded-lg transition-colors flex items-center justify-center cursor-pointer"
            title="Закрыть плеер"
            aria-label="Закрыть плеер"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Integrated bottom progress line */}
        <div
          onClick={handleSeek}
          className="group/prog absolute bottom-0 left-0 right-0 h-[2px] hover:h-[3px] bg-[#151932] transition-all cursor-pointer"
          title={`Перемотка (${Math.round(progressPercent)}%)`}
        >
          <div
            className="h-full bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#A78BFA] relative transition-all duration-100 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

/**
 * 2. Mobile Fixed Bottom Mini Player
 * Rendered at the bottom of the mobile viewport right above MobileBottomNav.
 */
export const MobileBottomMusicPlayer: React.FC<{ className?: string }> = ({ className = '' }) => {
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    closePlayer,
    setPlayerState,
    toggleFavoriteTrack,
    isCurrentTrackFavorite,
    releaseInfo,
    artistInfo,
    seek,
  } = useMusicPlayer();

  const { currentTime, duration } = useMusicTime();

  if (!currentTrack) return null;

  const rawCover = currentTrack.releaseCover || currentTrack.thumbnail || releaseInfo?.cover || null;
  const coverUrl = getBestMusicImageUrl(rawCover, 'small');
  const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    seek(ratio * duration);
  };

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key="mobile-bottom-music-player"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={`md:hidden fixed left-0 right-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-40 bg-[#0B0D20]/95 backdrop-blur-xl border-t border-[#1E2442] shadow-2xl text-white select-none ${className}`}
      >
        {/* Top edge progress line on mobile */}
        <div
          onClick={handleSeek}
          className="absolute top-0 left-0 right-0 h-[2px] bg-[#151932] transition-all cursor-pointer"
          title={`Перемотка (${Math.round(progressPercent)}%)`}
        >
          <div
            className="h-full bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#A78BFA] transition-all duration-100 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="px-3.5 h-13 flex items-center justify-between gap-2.5">
          {/* Cover + Title · Artists (click -> fullscreen player) */}
          <div
            onClick={() => setPlayerState('fullscreen')}
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setPlayerState('fullscreen');
              }
            }}
            aria-label="Открыть полноэкранный плеер"
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#151932] border border-[#1E2442] shrink-0 flex items-center justify-center">
              {coverUrl ? (
                <img src={coverUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <Disc className="w-4 h-4 text-[#8B5CF6]" />
              )}
            </div>

            <div className="min-w-0 flex-1 flex items-center gap-1 text-xs font-medium leading-none">
              <span className="font-bold text-[#F8FAFC] truncate shrink-0 max-w-[60%]">
                {currentTrack.title}
              </span>

              {currentTrack.explicit && (
                <span className="px-1 py-0.2 text-[8px] font-black rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0 uppercase leading-none">
                  18+
                </span>
              )}

              <span className="text-[#64748B] text-[11px] shrink-0 select-none">·</span>

              <div
                className="text-[11px] text-[#94A3B8] truncate min-w-0"
                onClick={(e) => e.stopPropagation()}
              >
                <ArtistLinks
                  artistName={artistName}
                  artists={(currentTrack as any).artists}
                  artistSlug={currentTrack.artistSlug}
                  artistId={currentTrack.artistId}
                  linkClassName="hover:text-purple-300"
                />
              </div>
            </div>
          </div>

          {/* Right Mobile Actions: [❤️] [▶/⏸] [⋮] [×] */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => toggleFavoriteTrack(currentTrack.id, currentTrack.isFavorite)}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                currentTrack.isFavorite || isCurrentTrackFavorite
                  ? 'text-rose-400'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
              title={currentTrack.isFavorite || isCurrentTrackFavorite ? 'Удалить из любимого' : 'Добавить в любимое'}
              aria-label={currentTrack.isFavorite || isCurrentTrackFavorite ? 'Удалить из любимого' : 'Добавить в любимое'}
            >
              <Heart className={`w-4 h-4 ${currentTrack.isFavorite || isCurrentTrackFavorite ? 'fill-current text-rose-500' : ''}`} />
            </button>

            <button
              type="button"
              onClick={togglePlayPause}
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] active:scale-95 text-white flex items-center justify-center shadow-md shadow-[#7C3AED]/30 transition-all cursor-pointer"
              title={isPlaying ? 'Пауза' : 'Воспроизведение'}
              aria-label={isPlaying ? 'Пауза' : 'Воспроизведение'}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </button>

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
                isFavorite: currentTrack.isFavorite || isCurrentTrackFavorite,
              }}
              btnClassName="p-1.5 text-[#94A3B8] hover:text-[#F8FAFC] rounded-lg transition-colors flex items-center justify-center cursor-pointer"
            />

            <button
              type="button"
              onClick={closePlayer}
              className="p-1.5 text-[#64748B] hover:text-rose-400 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
              title="Закрыть плеер"
              aria-label="Закрыть плеер"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

/**
 * Global wrapper that renders Desktop in TopBar or Mobile fixed at bottom.
 */
export const GlobalMusicPlayer: React.FC = () => {
  return (
    <>
      <MobileBottomMusicPlayer />
    </>
  );
};
