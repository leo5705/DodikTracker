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
  Disc,
  X,
  Plus,
} from 'lucide-react';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';
import { getStableTrackKey } from '../../utils/musicIdentity.ts';
import { TrackInsightsPanel } from './TrackInsightsPanel.tsx';
import { ArtistLinks } from './ArtistLinks.tsx';
import { TrackActionsMenu } from './TrackActionsMenu.tsx';
import { AddToPlaylistModal } from '../modals/AddToPlaylistModal.tsx';

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const GlobalMusicPlayer: React.FC = () => {
  const { dbUser } = useAuth();
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
    queue,
    queueIndex,
    playQueueIndex,
    removeFromQueue,
  } = useMusicPlayer();

  const { navigate } = useRouter();

  const [isQueueDrawerOpen, setIsQueueDrawerOpen] = useState(false);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);

  const rawCover = currentTrack
    ? currentTrack.releaseCover || currentTrack.thumbnail || releaseInfo?.cover || null
    : null;
  const coverUrl = getBestMusicImageUrl(rawCover, 'medium');
  const artistName = currentTrack
    ? currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель'
    : 'Исполнитель';
  const releaseTitle = currentTrack?.releaseTitle || releaseInfo?.title || currentTrack?.album || null;
  const releaseSlug = currentTrack?.releaseSlug || releaseInfo?.slug;

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const handleReleaseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (releaseSlug) {
      navigate(`/music/release/${releaseSlug}`);
    } else if (currentTrack?.releaseId) {
      navigate(`/music/release/${currentTrack.releaseId}`);
    } else if (releaseTitle) {
      navigate(`/music/search?q=${encodeURIComponent(releaseTitle)}`);
    }
  };

  return (
    <div className="w-full bg-[#0B0D20]/95 backdrop-blur-xl border-b border-[#1E2442] px-3 sm:px-6 lg:px-8 py-2 text-white flex flex-col justify-center select-none sticky top-[72px] z-30 transition-colors">
      <div className="max-w-[1760px] 2xl:max-w-[1920px] mx-auto w-full">
        {!currentTrack ? (
          /* ==================== 1. INACTIVE / COMPACT PLACEHOLDER STATE ==================== */
          <div className="flex items-center justify-between gap-3 w-full py-0.5">
            <div
              onClick={() => navigate('/music')}
              className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-[#181436] border border-[#2D255E] flex items-center justify-center shrink-0 text-[#A78BFA] shadow-sm group-hover:scale-105 transition-transform">
                <Disc className="w-4 h-4 text-[#8B5CF6]" />
              </div>
              <div className="min-w-0 flex-1 leading-tight flex items-center gap-2">
                <span className="text-xs sm:text-sm font-extrabold text-[#F8FAFC] tracking-tight font-mono group-hover:text-[#A78BFA] transition-colors">
                  Музыкальный плеер
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#191D38] text-[#94A3B8] border border-[#1E2442]">
                  ГОТОВ
                </span>
                <span className="hidden md:inline text-xs text-[#64748B] truncate ml-2">
                  Выберите трек в каталоге или откройте музыкальный раздел
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/music')}
                className="px-3 py-1.5 rounded-xl bg-[#151932] hover:bg-[#1A1F3E] text-[#A78BFA] hover:text-white border border-[#1E2442] hover:border-[#8B5CF6]/40 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
                <span>К музыке</span>
              </button>
            </div>
          </div>
        ) : (
          /* ==================== 2. ACTIVE GLOBAL MINI PLAYER ==================== */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-1.5 w-full"
          >
            <div className="flex items-center justify-between gap-2 sm:gap-4 min-w-0">
              {/* 1. LEFT: COVER + TRACK INFO + HEART BUTTON */}
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 sm:max-w-[36%]">
                {/* Artwork -> Click opens Fullscreen player */}
                <div
                  onClick={() => setPlayerState('fullscreen')}
                  className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden bg-[#11152A] shrink-0 border border-[#1E2442] cursor-pointer group shadow-sm"
                  title="Открыть полноэкранный плеер"
                >
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-purple-950/50 flex items-center justify-center text-purple-300 font-bold text-xs">
                      ♪
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Maximize2 className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>

                {/* Metadata: Title, Artist, Release */}
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      onClick={() => setPlayerState('fullscreen')}
                      className="text-xs sm:text-sm font-extrabold text-white font-mono truncate hover:text-purple-300 transition-colors cursor-pointer"
                      title={currentTrack.title}
                    >
                      {currentTrack.title}
                    </span>
                    {currentTrack.explicit && (
                      <span className="px-1 py-0.2 text-[8px] font-black rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase shrink-0">
                        18+
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#94A3B8] truncate mt-0.5 font-mono flex items-center gap-1">
                    <ArtistLinks
                      artistName={artistName}
                      artistId={currentTrack.artistId}
                      artistSlug={currentTrack.artistSlug}
                      className="hover:underline hover:text-white transition-colors"
                    />
                    {releaseTitle && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span
                          onClick={handleReleaseClick}
                          className="truncate hover:text-purple-300 hover:underline cursor-pointer"
                          title={releaseTitle}
                        >
                          {releaseTitle}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* HEART (LIKE) BUTTON - PLACED IMMEDIATELY NEXT TO COVER & TRACK INFO */}
                <button
                  type="button"
                  onClick={() => toggleFavoriteTrack(currentTrack.id)}
                  className={`p-1.5 rounded-lg transition-all shrink-0 cursor-pointer ${
                    currentTrack.isFavorite
                      ? 'text-rose-400 bg-rose-500/15 border border-rose-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                  title={currentTrack.isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
                >
                  <Heart className={`w-4 h-4 ${currentTrack.isFavorite ? 'fill-current text-rose-500' : ''}`} />
                </button>
              </div>

              {/* 2. CENTER: PLAYBACK CONTROLS & DESKTOP PROGRESS SCRUBBER */}
              <div className="flex items-center gap-1 sm:gap-2 justify-center flex-1 max-w-xs sm:max-w-md">
                <button
                  type="button"
                  onClick={toggleShuffle}
                  className={`p-1.5 rounded-lg transition-all hidden sm:inline-flex cursor-pointer ${
                    isShuffle ? 'text-purple-400 bg-purple-500/20' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Перемешать"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={playPrev}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
                  title="Предыдущий трек"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={togglePlayPause}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-md shadow-purple-600/30 transition-all active:scale-95 cursor-pointer"
                  title={isPlaying ? 'Пауза' : 'Воспроизвести'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={playNext}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
                  title="Следующий трек"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={toggleRepeat}
                  className={`p-1.5 rounded-lg transition-all hidden sm:inline-flex cursor-pointer ${
                    repeatMode !== 'OFF' ? 'text-purple-400 bg-purple-500/20' : 'text-slate-400 hover:text-white'
                  }`}
                  title={`Повтор: ${repeatMode === 'OFF' ? 'Выкл' : repeatMode === 'ALL' ? 'Всей очереди' : 'Одного трека'}`}
                >
                  {repeatMode === 'ONE' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
                </button>

                {/* DESKTOP SCRUBBER + TIME INDICATOR */}
                <div className="hidden lg:flex items-center gap-2 ml-2 min-w-[140px] xl:min-w-[180px]">
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">{formatTime(currentTime)}</span>
                  <div
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const ratio = clickX / rect.width;
                      seek(ratio * duration);
                    }}
                    className="flex-1 h-1.5 hover:h-2 rounded-full bg-[#1B203E] cursor-pointer relative overflow-hidden group border border-[#2B325E] transition-all"
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full group-hover:brightness-125 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">{formatTime(duration)}</span>
                </div>
              </div>

              {/* 3. RIGHT ACTIONS (Queue, Lyrics, Genius/Insights, Add to Playlist, Volume, Fullscreen, ⋯ Menu) */}
              <div className="flex items-center justify-end gap-1 sm:gap-1.5 shrink-0 flex-1 sm:max-w-[36%]">
                {/* QUEUE DRAWER TOGGLE BUTTON */}
                <button
                  type="button"
                  onClick={() => setIsQueueDrawerOpen(!isQueueDrawerOpen)}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer relative ${
                    isQueueDrawerOpen
                      ? 'bg-purple-600/30 border-purple-500/60 text-purple-300'
                      : 'border-[#1E2442] bg-[#11152A] text-slate-400 hover:text-white hover:border-purple-500/30'
                  }`}
                  title={`Очередь воспроизведения (${queue.length})`}
                >
                  <ListMusic className="w-3.5 h-3.5" />
                  {queue.length > 0 && (
                    <span className="absolute -top-1 -right-1 text-[8px] font-bold font-mono px-1 rounded-full bg-purple-600 text-white">
                      {queue.length}
                    </span>
                  )}
                </button>

                {/* LYRICS BUTTON */}
                <button
                  type="button"
                  onClick={() => setPlayerState('lyrics')}
                  className="p-1.5 rounded-lg border border-[#1E2442] bg-[#11152A] text-slate-400 hover:text-white hover:border-purple-500/30 transition-all hidden sm:inline-flex cursor-pointer"
                  title="Текст песни"
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>

                {/* GENIUS / INSIGHTS BUTTON */}
                <button
                  type="button"
                  onClick={toggleInsights}
                  className={`p-1.5 rounded-lg border transition-all hidden xl:inline-flex cursor-pointer ${
                    isInsightsOpen
                      ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                      : 'border-[#1E2442] bg-[#11152A] text-slate-400 hover:text-white hover:border-purple-500/30'
                  }`}
                  title="Genius факты о треке"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                </button>

                {/* ADD TO PLAYLIST BUTTON */}
                {dbUser && (
                  <button
                    type="button"
                    onClick={() => setIsPlaylistModalOpen(true)}
                    className="p-1.5 rounded-lg border border-[#1E2442] bg-[#11152A] text-slate-400 hover:text-white hover:border-purple-500/30 transition-all hidden xl:inline-flex cursor-pointer"
                    title="Добавить в плейлист"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* VOLUME SLIDER */}
                <div className="relative hidden xl:flex items-center gap-1.5 group">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="p-1.5 rounded-lg border border-[#1E2442] bg-[#11152A] text-slate-400 hover:text-white hover:border-purple-500/30 transition-all cursor-pointer"
                    title={isMuted ? 'Включить звук' : 'Выключить звук'}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <div className="w-16">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-full accent-purple-500 h-1 bg-[#1B203E] rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* FULLSCREEN BUTTON */}
                <button
                  type="button"
                  onClick={() => setPlayerState('fullscreen')}
                  className="p-1.5 rounded-lg border border-[#1E2442] bg-[#11152A] text-slate-400 hover:text-white hover:border-purple-500/30 transition-all cursor-pointer"
                  title="Полноэкранный плеер"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>

                {/* TRACK ACTIONS MENU (⋯) */}
                <TrackActionsMenu
                  track={{
                    id: currentTrack.id,
                    source: currentTrack.source,
                    videoId: currentTrack.videoId,
                    title: currentTrack.title,
                    artistName: artistName,
                    releaseTitle: releaseTitle,
                    releaseCover: rawCover,
                    thumbnail: rawCover,
                    duration: duration,
                    isFavorite: currentTrack.isFavorite,
                  }}
                  btnClassName="p-1.5 rounded-lg border border-[#1E2442] bg-[#11152A] text-slate-400 hover:text-white hover:border-purple-500/30 transition-all cursor-pointer"
                />
              </div>
            </div>

            {/* MOBILE SCRUBBER PROGRESS BAR */}
            <div className="flex lg:hidden items-center gap-2 w-full pt-0.5">
              <span className="text-[9px] font-mono text-slate-400 shrink-0">{formatTime(currentTime)}</span>
              <div
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const ratio = clickX / rect.width;
                  seek(ratio * duration);
                }}
                className="flex-1 h-1.5 rounded-full bg-[#1B203E] cursor-pointer relative overflow-hidden group border border-[#2B325E]"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[9px] font-mono text-slate-400 shrink-0">{formatTime(duration)}</span>
            </div>

            {/* INLINE QUEUE DRAWER ATTACHED DIRECTLY BELOW MINI PLAYER */}
            <AnimatePresence>
              {isQueueDrawerOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-2 pt-2 border-t border-[#1E2442] space-y-1 max-h-64 overflow-y-auto custom-scrollbar"
                >
                  <div className="flex items-center justify-between pb-1 text-xs font-mono font-bold text-[#A78BFA]">
                    <span>Очередь воспроизведения ({queue.length})</span>
                    <button
                      type="button"
                      onClick={() => setIsQueueDrawerOpen(false)}
                      className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                      title="Закрыть очередь"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {queue.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-500">Очередь пуста</div>
                  ) : (
                    queue.map((t, idx) => {
                      const isCurrent = idx === queueIndex;
                      const itemCover = t.releaseCover || t.thumbnail;
                      return (
                        <div
                          key={`mini-queue-${getStableTrackKey(t, idx)}-${idx}`}
                          onClick={() => playQueueIndex(idx)}
                          className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer group ${
                            isCurrent
                              ? 'bg-purple-600/20 border border-purple-500/40 text-purple-300'
                              : 'hover:bg-[#11152A] text-slate-300 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="w-5 text-center text-xs font-mono font-bold text-slate-500 group-hover:text-purple-400 shrink-0">
                              {isCurrent ? '▶' : idx + 1}
                            </span>

                            <div className="w-7 h-7 rounded-lg overflow-hidden bg-[#151932] border border-[#1E2442] shrink-0">
                              {itemCover ? (
                                <img src={itemCover} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                                  ♪
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1 leading-tight">
                              <h5 className={`text-xs font-bold truncate ${isCurrent ? 'text-white' : 'text-slate-200'}`}>
                                {t.title}
                              </h5>
                              <p className="text-[10px] text-[#94A3B8] truncate mt-0.5">
                                {t.artistName || artistName}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] font-mono text-slate-500">
                              {t.duration ? formatTime(t.duration) : '—'}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFromQueue(t.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                              title="Удалить из очереди"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Track insights drawer panel */}
      {isInsightsOpen && currentTrack && (
        <TrackInsightsPanel onClose={() => toggleInsights()} />
      )}

      {/* Add to Playlist Modal */}
      {isPlaylistModalOpen && currentTrack && (
        <AddToPlaylistModal
          track={{
            id: currentTrack.id,
            title: currentTrack.title,
            artistName: artistName,
            releaseCover: coverUrl,
          }}
          isOpen={isPlaylistModalOpen}
          onClose={() => setIsPlaylistModalOpen(false)}
        />
      )}
    </div>
  );
};
