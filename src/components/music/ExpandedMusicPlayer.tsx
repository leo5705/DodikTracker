import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { getStableTrackKey } from '../../utils/musicIdentity.ts';
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
  ChevronUp,
  Maximize2,
  ListMusic,
  FileText,
  Heart,
  Plus,
  Music2,
  Sparkles,
  Info,
  AlertTriangle,
  ExternalLink,
  Search,
  Loader2,
  X,
} from 'lucide-react';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';
import { LiveLyrics } from './LiveLyrics.tsx';
import { AddToPlaylistModal } from '../modals/AddToPlaylistModal.tsx';
import { TrackActionsMenu } from './TrackActionsMenu.tsx';
import { ArtistLinks } from './ArtistLinks.tsx';
import { AnyTrackItem, normalizeToPlayerTrack, MusicTrackRow } from './MusicTrackCard.tsx';

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const ExpandedMusicPlayer: React.FC = () => {
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
    queue,
    queueIndex,
    closeExpanded,
    openFullscreen,
    openLyrics,
    playTrack,
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

  const [activeInlineTab, setActiveInlineTab] = useState<'none' | 'queue' | 'lyrics' | 'search'>('none');
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  // Search inside Expanded Player state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AnyTrackItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchHasSearched, setSearchHasSearched] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  // Debounced music search inside Expanded Player (300ms)
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchHasSearched(false);
      return;
    }

    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortControllerRef.current = controller;

    const timer = setTimeout(() => {
      setIsSearching(true);
      setSearchHasSearched(true);

      fetch(`/api/music/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) {
            setSearchResults([]);
            return;
          }
          const dodik: AnyTrackItem[] = (data.tracks || []).map((t: any) => ({
            ...t,
            kind: 'dodik',
            source: 'dodik',
          }));
          const external: AnyTrackItem[] = (data.externalTracks || []).map((t: any) => ({
            ...t,
            kind: 'external',
            source: 'youtube',
          }));
          setSearchResults([...dodik, ...external]);
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            console.warn('[ExpandedPlayer] Search error:', err);
            setSearchResults([]);
          }
        })
        .finally(() => {
          setIsSearching(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  const handlePlaySearchResult = (item: AnyTrackItem) => {
    const playerTrack = normalizeToPlayerTrack(item);
    // Keep existing queue intact and add or select track
    const updatedQueue = queue.some((t) => t.id === playerTrack.id) ? queue : [...queue, playerTrack];
    playTrack(playerTrack, updatedQueue, {
      id: playerTrack.releaseId,
      title: playerTrack.releaseTitle || 'Поиск',
      cover: playerTrack.releaseCover || playerTrack.thumbnail,
      slug: playerTrack.releaseSlug || '',
      artistName: playerTrack.artistName || 'Исполнитель',
      artistSlug: playerTrack.artistSlug || '',
    });
  };

  if (!currentTrack) return null;

  const isVisible = playerState === 'expanded';

  const rawCover = currentTrack.releaseCover || releaseInfo?.cover || currentTrack.thumbnail;
  const cover = getBestMusicImageUrl(rawCover, 'large');
  const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';
  const artistSlug = currentTrack.artistSlug || releaseInfo?.artistSlug || artistInfo?.slug;
  const releaseTitle = currentTrack.releaseTitle || releaseInfo?.title || currentTrack.album;
  const releaseSlug = currentTrack.releaseSlug || releaseInfo?.slug;

  const handleArtistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeExpanded();
    if (artistSlug) {
      navigate(`/music/artist/${artistSlug}`);
    } else if (currentTrack.artistId) {
      navigate(`/music/external/artist/youtube/${currentTrack.artistId}`);
    } else if (artistName && artistName !== 'Исполнитель') {
      navigate(`/music/search?q=${encodeURIComponent(artistName)}`);
    }
  };

  const handleReleaseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeExpanded();
    if (releaseSlug) {
      navigate(`/music/release/${releaseSlug}`);
    } else if (currentTrack.releaseId) {
      navigate(`/music/release/${currentTrack.releaseId}`);
    } else if (releaseTitle) {
      navigate(`/music/search?q=${encodeURIComponent(releaseTitle)}`);
    }
  };

  const toggleLyrics = () => {
    if (activeInlineTab === 'lyrics') {
      setActiveInlineTab('none');
      return;
    }
    setActiveInlineTab('lyrics');

    if (!currentTrack.lyrics && !lyricsLoading) {
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
  };

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-14 sm:top-16 inset-x-0 z-40 px-2 sm:px-6 pointer-events-none"
          >
            <div className="pointer-events-auto max-w-4xl mx-auto bg-[#0B0D20]/95 border border-[#1E2442] shadow-2xl shadow-purple-950/40 rounded-2xl p-3 sm:p-5 backdrop-blur-2xl text-white">
              {/* Header Row: Clicking header collapses Expanded -> Mini */}
              <div
                onClick={closeExpanded}
                className="flex items-center justify-between pb-3 mb-3 border-b border-[#1E2442] cursor-pointer group/header"
                title="Нажмите, чтобы свернуть плеер"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Artwork */}
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-[#151932] border border-[#1E2442] shrink-0 relative group">
                    {cover ? (
                      <img src={cover} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-purple-400">
                        <Music2 className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Title & Artist */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-extrabold text-white truncate leading-snug group-hover/header:text-purple-300 transition-colors">
                        {currentTrack.title}
                      </h3>
                      {currentTrack.explicit && (
                        <span className="px-1.5 py-0.5 text-[9px] font-black rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase shrink-0">
                          18+
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#94A3B8] truncate mt-0.5">
                      <ArtistLinks
                        artistName={artistName}
                        artistSlug={currentTrack.artistSlug}
                        artistId={currentTrack.artistId}
                        linkClassName="hover:text-purple-300"
                      />
                      {releaseTitle && (
                        <>
                          <span className="mx-1 text-[#475569]">•</span>
                          <span onClick={handleReleaseClick} className="hover:text-purple-300 hover:underline cursor-pointer">
                            {releaseTitle}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Header Right Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                  {dbUser && (
                    <button
                      type="button"
                      onClick={() => toggleFavoriteTrack()}
                      className={`p-2 rounded-xl transition cursor-pointer ${
                        currentTrack.isFavorite
                          ? 'text-rose-400 bg-rose-500/15 border border-rose-500/30'
                          : 'text-[#94A3B8] hover:text-white hover:bg-[#151932] border border-transparent'
                      }`}
                      title={currentTrack.isFavorite ? 'Удалить из любимых' : 'В любимые'}
                    >
                      <Heart className={`w-4 h-4 ${currentTrack.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </button>
                  )}

                  {dbUser && (
                    <button
                      type="button"
                      onClick={() => setPlaylistModalOpen(true)}
                      className="p-2 text-[#94A3B8] hover:text-white hover:bg-[#151932] rounded-xl transition cursor-pointer"
                      title="Добавить в плейлист"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={openLyrics}
                    className="p-2 text-[#94A3B8] hover:text-purple-300 hover:bg-[#151932] rounded-xl transition cursor-pointer"
                    title="Текст песни на весь экран"
                  >
                    <FileText className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={openFullscreen}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-bold transition cursor-pointer"
                    title="На весь экран"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">На весь экран</span>
                  </button>

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
                    btnClassName="p-2 text-[#94A3B8] hover:text-white hover:bg-[#151932] rounded-xl transition cursor-pointer"
                  />

                  <button
                    type="button"
                    onClick={closeExpanded}
                    className="p-2 text-[#94A3B8] hover:text-white hover:bg-[#151932] rounded-xl transition cursor-pointer"
                    title="Свернуть"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Playback Error / Blocked Notice Banner */}
              {(playbackError || playbackStatus === 'blocked' || playbackStatus === 'error') && (
                <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-200">
                  <div className="flex items-center gap-2 min-w-0">
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
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40 font-semibold transition"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>YouTube</span>
                      </a>
                    )}
                    {queue.length > 1 && (
                      <button
                        type="button"
                        onClick={playNext}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition cursor-pointer"
                      >
                        Следующий
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Timeline & Scrubber */}
              <div className="space-y-1.5 mb-3">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => seek(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-[#151932] rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-all"
                />
                <div className="flex items-center justify-between text-[11px] font-mono text-[#64748B]">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Main Controls & Toolbar Grid */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {/* Playback Buttons */}
                <div className="flex items-center gap-2">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={toggleShuffle}
                    className={`p-2 rounded-xl transition cursor-pointer ${
                      isShuffle ? 'text-purple-400 bg-purple-500/20 border border-purple-500/40' : 'text-[#94A3B8] hover:text-white'
                    }`}
                    title="Перемешать"
                  >
                    <Shuffle className="w-4 h-4" />
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={playPrev}
                    className="p-2 text-[#CBD5E1] hover:text-white hover:bg-[#151932] rounded-xl transition cursor-pointer"
                    title="Предыдущий трек"
                  >
                    <SkipBack className="w-5 h-5 fill-current" />
                  </motion.button>

                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.93 }}
                    onClick={togglePlayPause}
                    className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/30 transition cursor-pointer relative overflow-hidden"
                    title={isPlaying ? 'Пауза' : 'Играть'}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={isPlaying ? 'pause' : 'play'}
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                      </motion.div>
                    </AnimatePresence>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={playNext}
                    className="p-2 text-[#CBD5E1] hover:text-white hover:bg-[#151932] rounded-xl transition cursor-pointer"
                    title="Следующий трек"
                  >
                    <SkipForward className="w-5 h-5 fill-current" />
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={toggleRepeat}
                    className={`p-2 rounded-xl transition relative cursor-pointer ${
                      repeatMode !== 'OFF' ? 'text-purple-400 bg-purple-500/20 border border-purple-500/40' : 'text-[#94A3B8] hover:text-white'
                    }`}
                    title="Повтор"
                  >
                    <Repeat className="w-4 h-4" />
                    {repeatMode === 'ONE' && (
                      <span className="absolute -top-1 -right-1 text-[8px] font-black bg-purple-500 text-slate-950 rounded-full w-3.5 h-3.5 flex items-center justify-center">
                        1
                      </span>
                    )}
                  </motion.button>
                </div>

                {/* Volume Control */}
                <div className="flex items-center gap-2 max-w-[150px] w-full">
                  <button type="button" onClick={toggleMute} className="text-[#94A3B8] hover:text-white transition cursor-pointer">
                    {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-[#151932] rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>

                {/* Inline Panel Toggles */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveInlineTab(activeInlineTab === 'queue' ? 'none' : 'queue')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      activeInlineTab === 'queue'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-[#151932] text-[#94A3B8] hover:text-white hover:bg-[#1A2040]'
                    }`}
                  >
                    <ListMusic className="w-3.5 h-3.5" />
                    <span>Очередь ({queue.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleLyrics}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      activeInlineTab === 'lyrics'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-[#151932] text-[#94A3B8] hover:text-white hover:bg-[#1A2040]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Текст</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const nextTab = activeInlineTab === 'search' ? 'none' : 'search';
                      setActiveInlineTab(nextTab);
                      if (nextTab === 'search') {
                        setTimeout(() => searchInputRef.current?.focus(), 80);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      activeInlineTab === 'search'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-[#151932] text-[#94A3B8] hover:text-white hover:bg-[#1A2040]'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Поиск</span>
                  </button>
                </div>
              </div>

              {/* Inline Content Drawer (Queue / Lyrics / Search) */}
              {activeInlineTab !== 'none' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-4 pt-3 border-t border-[#1E2442] max-h-[60vh] sm:max-h-[380px] overflow-y-auto custom-scrollbar"
                >
                  {activeInlineTab === 'queue' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-[#A78BFA] font-mono">Очередь треков</span>
                        <span className="text-[10px] text-[#64748B] font-mono">
                          {queueIndex + 1} из {queue.length}
                        </span>
                      </div>
                      {queue.map((t, idx) => (
                        <MusicTrackRow
                          key={`queue-${getStableTrackKey(t, idx)}-${idx}`}
                          track={t as AnyTrackItem}
                          index={idx + 1}
                          showIndex={true}
                          showCover={true}
                          showArtist={true}
                          showAlbum={false}
                          showDuration={true}
                          showPlayCount={false}
                          onPlay={() => playQueueIndex(idx)}
                          onRemove={() => removeFromQueue(t.id)}
                          removeLabel="Удалить из очереди"
                          className={idx === queueIndex ? 'border-purple-500/60 bg-purple-950/30' : ''}
                        />
                      ))}
                    </div>
                  )}

                  {activeInlineTab === 'lyrics' && (
                    <div className="h-56">
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
                  )}

                  {activeInlineTab === 'search' && (
                    <div className="space-y-3 pb-1">
                      {/* Search Bar Input */}
                      <div className="relative">
                        <Search className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Найти трек или исполнителя в каталоге..."
                          className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] focus:border-purple-500 text-xs sm:text-sm text-white placeholder-[#64748B] focus:outline-none transition-all shadow-inner"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery('');
                              searchInputRef.current?.focus();
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#64748B] hover:text-white rounded-lg transition cursor-pointer"
                            title="Очистить"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Search Results Content */}
                      <div className="space-y-1">
                        {isSearching ? (
                          <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                            <span className="text-xs">Поиск треков...</span>
                          </div>
                        ) : searchHasSearched && searchResults.length === 0 ? (
                          <div className="py-8 text-center text-slate-400 space-y-1">
                            <Music2 className="w-6 h-6 text-slate-500 mx-auto" />
                            <p className="text-xs font-semibold text-slate-300">Ничего не найдено</p>
                            <p className="text-[11px] text-slate-500">Попробуйте изменить поисковый запрос</p>
                          </div>
                        ) : searchResults.length > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between pb-1 text-[11px] font-mono text-[#64748B]">
                              <span>Результаты поиска ({searchResults.length})</span>
                            </div>
                            {searchResults.map((item, idx) => {
                              const isCurrent = currentTrack?.id === item.id;
                              const isCurrentPlaying = isCurrent && isPlaying;
                              const rawItemCover = item.releaseCover || item.thumbnail;
                              const itemCover = getBestMusicImageUrl(rawItemCover, 'small');
                              const itemArtist =
                                item.artistName ||
                                item.artist ||
                                item.stageName ||
                                (item.artists && item.artists[0]) ||
                                'Исполнитель';

                              return (
                                <div
                                  key={`search-result-${item.id}-${idx}`}
                                  onClick={() => handlePlaySearchResult(item)}
                                  className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer group/item ${
                                    isCurrent
                                      ? 'bg-purple-600/20 border border-purple-500/40 text-purple-200'
                                      : 'hover:bg-[#151932] text-slate-200 border border-transparent'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                                    {/* Artwork & Play overlay */}
                                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#151932] shrink-0 relative flex items-center justify-center border border-[#1E2442]">
                                      {itemCover ? (
                                        <img src={itemCover} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <Music2 className="w-4 h-4 text-slate-500" />
                                      )}
                                      <div
                                        className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${
                                          isCurrent ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'
                                        }`}
                                      >
                                        {isCurrentPlaying ? (
                                          <Pause className="w-3.5 h-3.5 fill-current text-purple-400" />
                                        ) : (
                                          <Play className="w-3.5 h-3.5 fill-current text-white ml-0.5" />
                                        )}
                                      </div>
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className={`text-xs font-semibold truncate ${
                                            isCurrent
                                              ? 'text-purple-300 font-bold'
                                              : 'text-slate-100 group-hover/item:text-purple-300'
                                          }`}
                                        >
                                          {item.title}
                                        </span>
                                        {(item.explicit || item.isExplicit) && (
                                          <span className="px-1 py-0.2 text-[8px] font-black rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                                            18+
                                          </span>
                                        )}
                                      </div>
                                      <div
                                        className="text-[11px] text-[#94A3B8] truncate mt-0.5"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ArtistLinks
                                          artistName={itemArtist}
                                          artists={item.artists}
                                          artistSlug={item.artistSlug}
                                          artistId={item.artistId}
                                          linkClassName="hover:text-purple-300"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div
                                    className="flex items-center gap-1.5 sm:gap-2 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span className="text-[11px] text-slate-500 font-mono">
                                      {item.duration || item.durationSeconds
                                        ? formatTime(item.duration || item.durationSeconds || 0)
                                        : '—'}
                                    </span>

                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const next = await toggleFavoriteTrack(item.id);
                                        item.isFavorite = next;
                                      }}
                                      className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                        item.isFavorite
                                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                                          : 'bg-[#11152A] border-[#1E2442] text-slate-400 hover:text-white hover:bg-[#1A2040]'
                                      }`}
                                      title={item.isFavorite ? 'Удалить из любимых' : 'Добавить в любимые'}
                                      aria-label={item.isFavorite ? 'Удалить из любимых' : 'Добавить в любимые'}
                                    >
                                      <Heart className={`w-3.5 h-3.5 ${item.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                                    </button>

                                    <TrackActionsMenu
                                      track={{
                                        id: item.id,
                                        source: item.source,
                                        videoId: item.videoId,
                                        title: item.title,
                                        artistName: itemArtist,
                                        artists: item.artists,
                                        releaseTitle: item.releaseTitle || item.album || null,
                                        releaseCover: rawItemCover,
                                        thumbnail: rawItemCover,
                                        duration: item.duration || item.durationSeconds || null,
                                        isFavorite: item.isFavorite,
                                      }}
                                      btnClassName="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-6 text-center text-slate-500 text-xs">
                            Введите название трека или имя исполнителя для поиска в каталоге
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {playlistModalOpen && (
        <AddToPlaylistModal
          track={{
            id: currentTrack.id,
            title: currentTrack.title,
            artistName: artistName,
            releaseCover: cover,
          }}
          isOpen={playlistModalOpen}
          onClose={() => setPlaylistModalOpen(false)}
        />
      )}
    </>
  );
};
