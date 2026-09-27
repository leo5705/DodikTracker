import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Heart,
  ListMusic,
  Maximize2,
  FileText,
  Sparkles,
  Shuffle,
  Repeat,
  Repeat1,
  ExternalLink,
} from 'lucide-react';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';
import { TrackInsightsPanel } from './TrackInsightsPanel.tsx';
import { ArtistLinks } from './ArtistLinks.tsx';

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const GlobalMusicPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    currentTime,
    duration,
    seek,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    playNext,
    playPrev,
    isShuffle,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    toggleFavoriteTrack,
    setPlayerState,
    isInsightsOpen,
    toggleInsights,
    releaseInfo,
    artistInfo,
  } = useMusicPlayer();

  const { route, navigate } = useRouter();
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  if (!currentTrack) {
    return null;
  }

  const isMusicSection = route.name.startsWith('music') || route.name.startsWith('music-');
  const coverUrl = getBestMusicImageUrl(
    currentTrack.releaseCover || currentTrack.thumbnail || releaseInfo?.cover || null,
    'medium'
  );
  const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <>
      <motion.div
        layout
        layoutId="global-music-player-shared-container"
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
          mass: 0.8,
        }}
        className={
          isMusicSection
            ? 'fixed bottom-3 left-3 right-3 sm:bottom-4 sm:left-6 sm:right-6 md:left-[280px] md:right-8 z-40 rounded-2xl bg-[#0F1328]/95 backdrop-blur-2xl border border-[#23294E] shadow-2xl p-3 sm:p-4 text-white flex flex-col gap-2 selection:bg-purple-500/30'
            : 'fixed top-3.5 right-4 sm:right-48 z-40 rounded-xl bg-[#0B0D20]/95 backdrop-blur-xl border border-[#1E2442] shadow-xl p-2 sm:px-3 text-white flex items-center gap-2.5 max-w-[320px] sm:max-w-[360px] cursor-pointer hover:border-purple-500/40 transition-colors'
        }
      >
        {isMusicSection ? (
          /* ==================== BOTTOM DOCKED FULL PLAYER ==================== */
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center justify-between gap-3 min-w-0">
              {/* TRACK INFO */}
              <div className="flex items-center gap-3 min-w-0 flex-1 sm:max-w-[30%]">
                <motion.div
                  layoutId="global-player-cover"
                  onClick={() => setPlayerState('fullscreen')}
                  className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-[#11152A] shrink-0 border border-[#1E2442] cursor-pointer group shadow-lg"
                >
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-purple-950/50 flex items-center justify-center text-purple-300 font-bold text-base">
                      ♪
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Maximize2 className="w-4 h-4 text-white" />
                  </div>
                </motion.div>

                <div className="min-w-0 flex-1">
                  <motion.div
                    layoutId="global-player-title"
                    onClick={() => setPlayerState('fullscreen')}
                    className="text-sm sm:text-base font-bold text-white font-mono truncate hover:text-purple-300 transition-colors cursor-pointer"
                  >
                    {currentTrack.title}
                  </motion.div>
                  <motion.div layoutId="global-player-artist" className="text-xs text-[#94A3B8] truncate mt-0.5 font-mono">
                    <ArtistLinks
                      artistName={artistName}
                      artistId={currentTrack.artistId}
                      artistSlug={currentTrack.artistSlug}
                      className="hover:underline hover:text-white transition-colors"
                    />
                  </motion.div>
                </div>

                <button
                  onClick={() => toggleFavoriteTrack(currentTrack.id)}
                  className={`p-2 rounded-xl transition-all shrink-0 ${
                    currentTrack.isFavorite
                      ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                  title={currentTrack.isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
                >
                  <Heart className={`w-4 h-4 ${currentTrack.isFavorite ? 'fill-current' : ''}`} />
                </button>
              </div>

              {/* CENTER PLAYBACK CONTROLS */}
              <div className="flex flex-col items-center gap-1 flex-1 max-w-md">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={toggleShuffle}
                    className={`p-2 rounded-lg transition-all ${
                      isShuffle ? 'text-purple-400 bg-purple-500/20' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Перемешать"
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>

                  <button
                    onClick={playPrev}
                    className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/5 transition-all active:scale-95"
                    title="Предыдущий трек"
                  >
                    <SkipBack className="w-5 h-5" />
                  </button>

                  <button
                    onClick={togglePlayPause}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-purple-600/30 transition-all active:scale-95"
                    title={isPlaying ? 'Пауза' : 'Воспроизвести'}
                  >
                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                  </button>

                  <button
                    onClick={playNext}
                    className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/5 transition-all active:scale-95"
                    title="Следующий трек"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>

                  <button
                    onClick={toggleRepeat}
                    className={`p-2 rounded-lg transition-all ${
                      repeatMode !== 'OFF' ? 'text-purple-400 bg-purple-500/20' : 'text-slate-400 hover:text-white'
                    }`}
                    title={`Повтор: ${repeatMode === 'OFF' ? 'Выкл' : repeatMode === 'ALL' ? 'Всей очереди' : 'Одного трека'}`}
                  >
                    {repeatMode === 'ONE' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* RIGHT ACTIONS & VOLUME */}
              <div className="hidden lg:flex items-center justify-end gap-2 shrink-0 flex-1 max-w-[30%]">
                <button
                  onClick={toggleInsights}
                  className={`p-2 rounded-xl border transition-all ${
                    isInsightsOpen
                      ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                      : 'border-[#1E2442] bg-[#11152A] text-slate-400 hover:text-white hover:border-purple-500/30'
                  }`}
                  title="Аналитика и факты о треке"
                >
                  <Sparkles className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setPlayerState('lyrics')}
                  className="p-2 rounded-xl border border-[#1E2442] bg-[#11152A] text-slate-400 hover:text-white hover:border-purple-500/30 transition-all"
                  title="Текст песни"
                >
                  <FileText className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setPlayerState('expanded')}
                  className="p-2 rounded-xl border border-[#1E2442] bg-[#11152A] text-slate-400 hover:text-white hover:border-purple-500/30 transition-all"
                  title="Очередь воспроизведения"
                >
                  <ListMusic className="w-4 h-4" />
                </button>

                {/* VOLUME SLIDER */}
                <div className="relative flex items-center gap-2 group">
                  <button
                    onClick={toggleMute}
                    onMouseEnter={() => setShowVolumeSlider(true)}
                    className="p-2 rounded-xl border border-[#1E2442] bg-[#11152A] text-slate-400 hover:text-white hover:border-purple-500/30 transition-all"
                    title={isMuted ? 'Включить звук' : 'Выключить звук'}
                  >
                    {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  <div className="w-20 hidden sm:block">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1.5 bg-[#1B203E] rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                <button
                  onClick={() => setPlayerState('fullscreen')}
                  className="p-2 rounded-xl border border-[#1E2442] bg-[#11152A] text-slate-400 hover:text-white hover:border-purple-500/30 transition-all"
                  title="Полноэкранный плеер"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* INTERACTIVE SEEK PROGRESS BAR */}
            <div className="flex items-center gap-3 w-full px-1">
              <span className="text-[11px] font-mono text-slate-400 shrink-0 w-9 text-right">{formatTime(currentTime)}</span>
              <div
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const ratio = clickX / rect.width;
                  seek(ratio * duration);
                }}
                className="flex-1 h-2 rounded-full bg-[#1B203E] cursor-pointer relative overflow-hidden group border border-[#2B325E]"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full group-hover:brightness-125 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[11px] font-mono text-slate-400 shrink-0 w-9">{formatTime(duration)}</span>
            </div>
          </div>
        ) : (
          /* ==================== TOP COMPACT HEADER PLAYER ==================== */
          <div className="flex items-center gap-2.5 w-full min-w-0" onClick={() => navigate('/music')}>
            <motion.div
              layoutId="global-player-cover"
              className="relative w-9 h-9 rounded-lg overflow-hidden bg-[#11152A] shrink-0 border border-[#1E2442]"
            >
              {coverUrl ? (
                <img src={coverUrl} alt={currentTrack.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-purple-950/50 flex items-center justify-center text-purple-300 font-bold text-xs">
                  ♪
                </div>
              )}
            </motion.div>

            <div className="min-w-0 flex-1">
              <motion.div layoutId="global-player-title" className="text-xs font-bold text-white font-mono truncate">
                {currentTrack.title}
              </motion.div>
              <motion.div layoutId="global-player-artist" className="text-[10px] text-[#94A3B8] font-mono truncate">
                {artistName}
              </motion.div>
            </div>

            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={togglePlayPause}
                className="w-7 h-7 rounded-lg bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow transition-transform active:scale-95"
                title={isPlaying ? 'Пауза' : 'Воспроизвести'}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
              </button>
              <button
                onClick={playNext}
                className="p-1.5 text-slate-400 hover:text-white transition-colors"
                title="Следующий трек"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Track insights drawer panel */}
      {isMusicSection && isInsightsOpen && <TrackInsightsPanel onClose={() => toggleInsights()} />}
    </>
  );
};
