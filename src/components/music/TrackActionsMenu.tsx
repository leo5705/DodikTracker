import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  MoreVertical,
  Play,
  Plus,
  Trash2,
  Heart,
  ListMusic,
  FileText,
  Sparkles,
  User,
  Disc,
  Mic2,
  Share2,
  Info,
} from 'lucide-react';
import { useMusicPlayer, Track } from '../../context/MusicPlayerContext.tsx';
import { useToast } from '../../context/NotificationContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { AddToPlaylistModal } from '../modals/AddToPlaylistModal.tsx';
import { SimilarTracksModal } from './SimilarTracksModal.tsx';
import { parseArtists } from './ArtistLinks.tsx';

export interface UnifiedTrackDTO {
  id: string | number;
  kind?: 'dodik' | 'external' | 'internal';
  source?: 'dodik' | 'youtube' | 'local' | string;
  audioFile?: string;
  youtubeUrl?: string;
  videoId?: string;
  providerTrackId?: string;
  title: string;
  artistName?: string;
  artist?: string;
  artists?: string[];
  artistSlug?: string;
  artistId?: string | number;
  releaseTitle?: string;
  album?: string | null;
  releaseCover?: string | null;
  thumbnail?: string | null;
  releaseId?: string | number;
  releaseSlug?: string;
  duration?: number | null;
  durationSeconds?: number | null;
  explicit?: boolean | null;
  isExplicit?: boolean | null;
  isFavorite?: boolean;
}

export interface TrackActionsMenuProps {
  track: UnifiedTrackDTO;
  isInQueue?: boolean;
  onRemoveFromQueue?: () => void;
  onRemoveFromPlaylist?: () => void;
  removeFromPlaylistLabel?: string;
  customTrigger?: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  btnClassName?: string;
}

export const TrackActionsMenu: React.FC<TrackActionsMenuProps> = ({
  track,
  isInQueue = false,
  onRemoveFromQueue,
  onRemoveFromPlaylist,
  removeFromPlaylistLabel = 'Удалить из плейлиста',
  customTrigger,
  align = 'right',
  className = '',
  btnClassName = '',
}) => {
  const {
    playTrack,
    addToQueue,
    removeFromQueue,
    toggleFavoriteTrack,
    openLyrics,
    setIsInsightsOpen,
    currentTrack,
  } = useMusicPlayer();
  const { showToast } = useToast();
  const { navigate } = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; position: 'top' | 'bottom' }>({
    top: 0,
    left: 0,
    position: 'bottom',
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Modals state
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [similarModalOpen, setSimilarTracksOpen] = useState(false);
  const [isFav, setIsFav] = useState<boolean>(Boolean(track.isFavorite));

  useEffect(() => {
    setIsFav(Boolean(track.isFavorite));
  }, [track.isFavorite]);

  // Sync with favorite custom event
  useEffect(() => {
    const handleFavChange = (e: any) => {
      const { trackId, isFavorite } = e.detail || {};
      if (String(trackId) === String(track.id)) {
        setIsFav(isFavorite);
      }
    };
    window.addEventListener('music:favorite_track_changed', handleFavChange);
    return () => window.removeEventListener('music:favorite_track_changed', handleFavChange);
  }, [track.id]);

  const calculateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = 390; // Max estimated height
    const position = spaceBelow < menuHeight && rect.top > menuHeight ? 'top' : 'bottom';

    let left = align === 'right' ? rect.right - 240 : rect.left;
    if (left < 10) left = 10;
    if (left + 240 > window.innerWidth - 10) {
      left = window.innerWidth - 250;
    }

    const top = position === 'bottom' ? rect.bottom + 6 : rect.top - menuHeight - 6;
    setCoords({ top, left, position });
  };

  const handleToggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      calculateCoords();
    }
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('scroll', calculateCoords, true);
    window.addEventListener('resize', calculateCoords);
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', calculateCoords, true);
      window.removeEventListener('resize', calculateCoords);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const normalizeToPlayerTrack = (): Track => {
    const hasAudioFile = Boolean(track.audioFile && String(track.audioFile).trim() !== '');
    const isExplicitDodik = (track.source as string) === 'dodik' || (track.source as string) === 'local' || track.kind === 'dodik';

    const isYt =
      track.source === 'youtube' ||
      track.kind === 'external' ||
      (typeof track.id === 'string' && String(track.id).startsWith('yt_')) ||
      (!isExplicitDodik && !hasAudioFile && Boolean(track.videoId || track.providerTrackId));

    const videoId =
      track.videoId ||
      track.providerTrackId ||
      (typeof track.id === 'string' && String(track.id).startsWith('yt_') ? String(track.id).replace(/^yt_/, '') : undefined);

    const title = track.title;
    const artistName = track.artistName || track.artist || 'Исполнитель';
    const releaseTitle = track.releaseTitle || track.album || null;
    const cover = track.releaseCover || track.thumbnail || null;

    if (isYt && videoId) {
      return {
        id: typeof track.id === 'string' && String(track.id).startsWith('yt_') ? track.id : `yt_${videoId}`,
        source: 'youtube',
        videoId,
        youtubeUrl: track.youtubeUrl || `https://www.youtube.com/watch?v=${videoId}`,
        title,
        artistName,
        artistId: track.artistId ? String(track.artistId) : undefined,
        releaseTitle,
        releaseCover: cover,
        thumbnail: cover,
        album: releaseTitle,
        duration: track.durationSeconds || track.duration || null,
        explicit: Boolean(track.explicit || track.isExplicit),
        isFavorite: isFav,
      };
    }

    let audioFile = track.audioFile || '';
    if (audioFile && !audioFile.startsWith('/') && !audioFile.startsWith('http://') && !audioFile.startsWith('https://')) {
      audioFile = '/' + audioFile;
    }

    return {
      id: track.id,
      source: 'dodik',
      title,
      artistName,
      artistSlug: track.artistSlug || '',
      releaseId: typeof track.releaseId === 'number' ? track.releaseId : undefined,
      releaseTitle: releaseTitle || '',
      releaseCover: cover,
      releaseSlug: track.releaseSlug || '',
      audioFile,
      videoId: track.videoId || track.providerTrackId,
      youtubeUrl: track.youtubeUrl,
      duration: track.duration || track.durationSeconds || null,
      explicit: Boolean(track.explicit || track.isExplicit),
      isFavorite: isFav,
    };
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    const pTrack = normalizeToPlayerTrack();
    playTrack(pTrack, [pTrack]);
  };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    const pTrack = normalizeToPlayerTrack();
    addToQueue(pTrack);
  };

  const handleRemoveFromQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (onRemoveFromQueue) {
      onRemoveFromQueue();
    } else {
      removeFromQueue(track.id);
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    const newFavState = await toggleFavoriteTrack(track.id, isFav);
    setIsFav(newFavState);
    if (newFavState) {
      showToast('Трек добавлен в любимое', 'success');
    } else {
      showToast('Трек удалён из любимого', 'info');
    }
  };

  const handleOpenPlaylist = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    setPlaylistModalOpen(true);
  };

  const handleOpenLyrics = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    const pTrack = normalizeToPlayerTrack();
    if (currentTrack && String(currentTrack.id) === String(pTrack.id)) {
      openLyrics();
    } else {
      playTrack(pTrack, [pTrack]);
      openLyrics();
    }
  };

  const handleOpenInsights = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    const pTrack = normalizeToPlayerTrack();
    if (!currentTrack || String(currentTrack.id) !== String(pTrack.id)) {
      playTrack(pTrack, [pTrack]);
    }
    setIsInsightsOpen(true);
  };

  const handleOpenSimilar = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    setSimilarTracksOpen(true);
    showToast('Открываем похожие треки', 'info');
  };

  const handleGoToArtist = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (track.artistSlug) {
      navigate(`/music/artist/${encodeURIComponent(track.artistSlug)}`);
    } else if (track.artistId) {
      const idStr = String(track.artistId);
      if (idStr.startsWith('yt_') || idStr.startsWith('UC')) {
        navigate(`/music/external/artist/youtube/${idStr.replace(/^yt_/, '')}`);
      } else {
        navigate(`/music/artist/${encodeURIComponent(idStr)}`);
      }
    } else if (track.artistName || track.artist) {
      navigate(`/music/artist/${encodeURIComponent(track.artistName || track.artist || '')}`);
    }
  };

  const handleGoToRelease = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (track.releaseSlug) {
      navigate(`/music/release/${track.releaseSlug}`);
    } else if (track.releaseId) {
      navigate(`/music/release/${track.releaseId}`);
    } else if (track.releaseTitle || track.album) {
      navigate(`/music/search?q=${encodeURIComponent(track.releaseTitle || track.album || '')}`);
    }
  };

  const handleAllArtistTracks = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    const artist = track.artistName || track.artist || '';
    if (artist) {
      navigate(`/music/search?q=${encodeURIComponent(artist)}`);
    }
  };

  const handleShareTrack = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    const trackUrl = `${window.location.origin}/music?track=${encodeURIComponent(String(track.id))}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(trackUrl);
      showToast('Ссылка на трек скопирована', 'success');
    }
  };

  const parsedArtists = parseArtists(track.artistName || track.artist, track.artists);
  const artistDisplay = parsedArtists.map((a) => a.name).join(' · ') || 'Исполнитель';
  const titleDisplay = track.title;
  const coverDisplay = track.releaseCover || track.thumbnail || null;

  return (
    <>
      <div className={`relative inline-block ${className}`}>
        <button
          ref={triggerRef}
          onClick={handleToggleOpen}
          className={
            btnClassName ||
            'w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500'
          }
          title="Действия с треком"
          aria-label="Действия с треком"
        >
          {customTrigger || <MoreVertical className="w-4 h-4 sm:w-5 sm:h-5" />}
        </button>
      </div>

      {/* PORTAL DROPDOWN / BOTTOM SHEET */}
      {isOpen &&
        createPortal(
          <AnimatePresence>
            {/* Desktop Dropdown */}
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -6 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{
                top: `${coords.top}px`,
                left: `${coords.left}px`,
              }}
              className="hidden sm:block fixed z-[80] w-64 p-1.5 rounded-2xl bg-[#0B0D20]/95 backdrop-blur-xl border border-[#1E2442] shadow-2xl text-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-2.5 border-b border-[#1E2442]/80 mb-1 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#151932] shrink-0 border border-[#1E2442]">
                  {coverDisplay ? (
                    <img src={coverDisplay} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-purple-400 font-mono text-xs">
                      ♪
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">{titleDisplay}</div>
                  <div className="text-[11px] text-slate-400 truncate">{artistDisplay}</div>
                </div>
              </div>

              <div className="space-y-0.5 font-mono text-xs max-h-[360px] overflow-y-auto">
                <button
                  onClick={handlePlay}
                  className="w-full px-3 py-2 rounded-xl hover:bg-purple-600/20 hover:text-purple-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Play className="w-4 h-4 text-purple-400 fill-purple-400/20" />
                  <span>Воспроизвести</span>
                </button>

                <button
                  onClick={handleAddToQueue}
                  className="w-full px-3 py-2 rounded-xl hover:bg-purple-600/20 hover:text-purple-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-indigo-400" />
                  <span>Добавить в очередь</span>
                </button>

                {isInQueue && (
                  <button
                    onClick={handleRemoveFromQueue}
                    className="w-full px-3 py-2 rounded-xl hover:bg-rose-500/20 text-rose-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>Удалить из очереди</span>
                  </button>
                )}

                {onRemoveFromPlaylist && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                      onRemoveFromPlaylist();
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-rose-500/20 text-rose-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>{removeFromPlaylistLabel}</span>
                  </button>
                )}

                <button
                  onClick={handleToggleFavorite}
                  className="w-full px-3 py-2 rounded-xl hover:bg-rose-500/20 hover:text-rose-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-500 text-rose-500' : 'text-rose-400'}`} />
                  <span>{isFav ? 'Удалить из любимого' : 'Добавить в любимое'}</span>
                </button>

                <button
                  onClick={handleOpenPlaylist}
                  className="w-full px-3 py-2 rounded-xl hover:bg-purple-600/20 hover:text-purple-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <ListMusic className="w-4 h-4 text-emerald-400" />
                  <span>Добавить в плейлист</span>
                </button>

                <button
                  onClick={handleOpenLyrics}
                  className="w-full px-3 py-2 rounded-xl hover:bg-purple-600/20 hover:text-purple-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-purple-400" />
                  <span>Текст песни / Lyrics</span>
                </button>

                <button
                  onClick={handleOpenInsights}
                  className="w-full px-3 py-2 rounded-xl hover:bg-purple-600/20 hover:text-purple-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Info className="w-4 h-4 text-amber-400" />
                  <span>О треке (Genius)</span>
                </button>

                <button
                  onClick={handleShareTrack}
                  className="w-full px-3 py-2 rounded-xl hover:bg-purple-600/20 hover:text-purple-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-sky-400" />
                  <span>Поделиться треком</span>
                </button>

                <div className="h-px bg-[#1E2442]/80 my-1" />

                <button
                  onClick={handleOpenSimilar}
                  className="w-full px-3 py-2 rounded-xl hover:bg-purple-600/20 hover:text-purple-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Похожие треки</span>
                </button>

                <button
                  onClick={handleGoToArtist}
                  className="w-full px-3 py-2 rounded-xl hover:bg-purple-600/20 hover:text-purple-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <User className="w-4 h-4 text-cyan-400" />
                  <span>Перейти к исполнителю</span>
                </button>

                <button
                  onClick={handleGoToRelease}
                  className="w-full px-3 py-2 rounded-xl hover:bg-purple-600/20 hover:text-purple-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Disc className="w-4 h-4 text-violet-400" />
                  <span>Перейти к релизу</span>
                </button>

                <button
                  onClick={handleAllArtistTracks}
                  className="w-full px-3 py-2 rounded-xl hover:bg-purple-600/20 hover:text-purple-300 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Mic2 className="w-4 h-4 text-pink-400" />
                  <span>Все треки исполнителя</span>
                </button>
              </div>
            </motion.div>

            {/* Mobile Bottom Sheet Backdrop & Sheet */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="sm:hidden fixed inset-0 z-[80] bg-black/70 backdrop-blur-md flex flex-col justify-end"
              onClick={() => setIsOpen(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                className="w-full bg-[#0B0D20] border-t border-[#1E2442] rounded-t-3xl p-5 space-y-4 shadow-2xl text-slate-200 max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-12 h-1.5 rounded-full bg-slate-800 mx-auto" />

                <div className="flex items-center gap-3 border-b border-[#1E2442] pb-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#151932] border border-[#1E2442] shrink-0">
                    {coverDisplay ? (
                      <img src={coverDisplay} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-purple-400 font-mono">
                        ♪
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-white truncate">{titleDisplay}</h4>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{artistDisplay}</p>
                  </div>
                </div>

                <div className="space-y-1 font-mono text-sm">
                  <button
                    onClick={handlePlay}
                    className="w-full p-3 rounded-2xl hover:bg-purple-600/20 flex items-center gap-3 text-left transition"
                  >
                    <Play className="w-5 h-5 text-purple-400" />
                    <span>Воспроизвести</span>
                  </button>

                  <button
                    onClick={handleAddToQueue}
                    className="w-full p-3 rounded-2xl hover:bg-purple-600/20 flex items-center gap-3 text-left transition"
                  >
                    <Plus className="w-5 h-5 text-indigo-400" />
                    <span>Добавить в очередь</span>
                  </button>

                  {isInQueue && (
                    <button
                      onClick={handleRemoveFromQueue}
                      className="w-full p-3 rounded-2xl hover:bg-rose-500/20 text-rose-300 flex items-center gap-3 text-left transition"
                    >
                      <Trash2 className="w-5 h-5 text-rose-400" />
                      <span>Удалить из очереди</span>
                    </button>
                  )}

                  {onRemoveFromPlaylist && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                        onRemoveFromPlaylist();
                      }}
                      className="w-full p-3 rounded-2xl hover:bg-rose-500/20 text-rose-300 flex items-center gap-3 text-left transition"
                    >
                      <Trash2 className="w-5 h-5 text-rose-400" />
                      <span>{removeFromPlaylistLabel}</span>
                    </button>
                  )}

                  <button
                    onClick={handleToggleFavorite}
                    className="w-full p-3 rounded-2xl hover:bg-rose-500/20 flex items-center gap-3 text-left transition"
                  >
                    <Heart className={`w-5 h-5 ${isFav ? 'fill-rose-500 text-rose-500' : 'text-rose-400'}`} />
                    <span>{isFav ? 'Удалить из любимого' : 'Добавить в любимое'}</span>
                  </button>

                  <button
                    onClick={handleOpenPlaylist}
                    className="w-full p-3 rounded-2xl hover:bg-purple-600/20 flex items-center gap-3 text-left transition"
                  >
                    <ListMusic className="w-5 h-5 text-emerald-400" />
                    <span>Добавить в плейлист</span>
                  </button>

                  <button
                    onClick={handleOpenLyrics}
                    className="w-full p-3 rounded-2xl hover:bg-purple-600/20 flex items-center gap-3 text-left transition"
                  >
                    <FileText className="w-5 h-5 text-purple-400" />
                    <span>Текст песни / Lyrics</span>
                  </button>

                  <button
                    onClick={handleOpenInsights}
                    className="w-full p-3 rounded-2xl hover:bg-purple-600/20 flex items-center gap-3 text-left transition"
                  >
                    <Info className="w-5 h-5 text-amber-400" />
                    <span>О треке (Genius)</span>
                  </button>

                  <button
                    onClick={handleShareTrack}
                    className="w-full p-3 rounded-2xl hover:bg-purple-600/20 flex items-center gap-3 text-left transition"
                  >
                    <Share2 className="w-5 h-5 text-sky-400" />
                    <span>Поделиться треком</span>
                  </button>

                  <div className="h-px bg-[#1E2442] my-2" />

                  <button
                    onClick={handleOpenSimilar}
                    className="w-full p-3 rounded-2xl hover:bg-purple-600/20 flex items-center gap-3 text-left transition"
                  >
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <span>Похожие треки</span>
                  </button>

                  <button
                    onClick={handleGoToArtist}
                    className="w-full p-3 rounded-2xl hover:bg-purple-600/20 flex items-center gap-3 text-left transition"
                  >
                    <User className="w-5 h-5 text-cyan-400" />
                    <span>Перейти к исполнителю</span>
                  </button>

                  <button
                    onClick={handleGoToRelease}
                    className="w-full p-3 rounded-2xl hover:bg-purple-600/20 flex items-center gap-3 text-left transition"
                  >
                    <Disc className="w-5 h-5 text-violet-400" />
                    <span>Перейти к релизу</span>
                  </button>

                  <button
                    onClick={handleAllArtistTracks}
                    className="w-full p-3 rounded-2xl hover:bg-purple-600/20 flex items-center gap-3 text-left transition"
                  >
                    <Mic2 className="w-5 h-5 text-pink-400" />
                    <span>Все треки исполнителя</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>,
          document.body
        )}

      {/* Playlist & Similar Modals */}
      {playlistModalOpen && (
        <AddToPlaylistModal
          track={{
            id: track.id,
            title: titleDisplay,
            artistName: artistDisplay,
            releaseCover: coverDisplay,
          }}
          isOpen={playlistModalOpen}
          onClose={() => setPlaylistModalOpen(false)}
        />
      )}

      {similarModalOpen && (
        <SimilarTracksModal
          isOpen={similarModalOpen}
          onClose={() => setSimilarTracksOpen(false)}
          trackId={track.id}
          artistName={artistDisplay}
          trackTitle={titleDisplay}
          coverUrl={coverDisplay}
        />
      )}
    </>
  );
};

