import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { useRouter } from './RouterContext.tsx';
import { useAuth } from './AuthContext.tsx';
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
  ChevronDown,
  X,
  ListMusic,
  FileText,
  Info,
  Music2,
  Disc,
  Sparkles,
  ExternalLink,
  Heart,
} from 'lucide-react';

export interface Track {
  id: number;
  releaseId: number;
  releaseTitle?: string;
  releaseCover?: string | null;
  releaseSlug?: string;
  artistId?: number;
  artistName?: string;
  artistSlug?: string;
  title: string;
  slug?: string;
  trackNumber: number;
  audioFile: string;
  duration?: number | null;
  explicit?: boolean;
  lyrics?: string | null;
  authorNote?: string | null;
  listenCount?: number;
  isFavorite?: boolean;
}

export interface ReleaseInfo {
  id?: number;
  title: string;
  cover?: string | null;
  slug: string;
  artistName: string;
  artistSlug: string;
}

export interface ArtistInfo {
  id?: number;
  stageName: string;
  slug: string;
}

type RepeatMode = 'OFF' | 'ONE' | 'ALL';
type PlayerTab = 'queue' | 'lyrics' | 'note';

interface MusicPlayerContextType {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  releaseInfo: ReleaseInfo | null;
  artistInfo: ArtistInfo | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isExpanded: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  activeTab: PlayerTab;
  setActiveTab: (tab: PlayerTab) => void;
  playTrack: (track: Track, newQueue?: Track[], newRelease?: ReleaseInfo | null) => void;
  togglePlayPause: () => void;
  playNext: () => void;
  playPrev: () => void;
  playQueueIndex: (index: number) => void;
  seek: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  closePlayer: () => void;
  isCurrentTrackFavorite: boolean;
  toggleFavoriteTrack: (trackId?: number) => Promise<boolean>;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

export const MusicPlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { dbUser, authFetch } = useAuth();
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState<number>(-1);
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [artistInfo, setArtistInfo] = useState<ArtistInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('OFF');
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<PlayerTab>('queue');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackRef = useRef<Track | null>(null);
  const playbackSessionRef = useRef<{
    sessionId: string;
    trackId: number;
    accumulatedSeconds: number;
    lastTick: number;
    reported: boolean;
  } | null>(null);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  // Initialize single global audio element
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const generateSessionId = () => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      return 'sess_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    };

    const handlePlay = () => {
      const track = currentTrackRef.current;
      if (!track) return;

      if (!playbackSessionRef.current || playbackSessionRef.current.trackId !== track.id) {
        const sessionId = generateSessionId();
        playbackSessionRef.current = {
          sessionId,
          trackId: track.id,
          accumulatedSeconds: 0,
          lastTick: Date.now(),
          reported: false,
        };

        // Notify backend of session start
        fetch(`/api/music/tracks/${track.id}/playback-start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playbackSessionId: sessionId }),
        }).catch(() => {});
      } else {
        playbackSessionRef.current.lastTick = Date.now();
      }
    };

    const handlePause = () => {
      if (playbackSessionRef.current) {
        playbackSessionRef.current.lastTick = 0;
      }
    };

    const handleSeeking = () => {
      if (playbackSessionRef.current) {
        playbackSessionRef.current.lastTick = 0;
      }
    };

    const handleSeeked = () => {
      if (playbackSessionRef.current && !audio.paused) {
        playbackSessionRef.current.lastTick = Date.now();
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration || 0);

      const session = playbackSessionRef.current;
      const track = currentTrackRef.current;

      if (!audio.paused && !audio.ended && session && track && session.trackId === track.id) {
        const now = Date.now();
        if (session.lastTick > 0) {
          const delta = (now - session.lastTick) / 1000;
          if (delta > 0 && delta < 2) {
            session.accumulatedSeconds += delta;
          }
        }
        session.lastTick = now;

        // Check if listen threshold is reached
        if (!session.reported) {
          const dur = audio.duration || track.duration || 180;
          let threshold = 30;
          if (dur < 30) {
            threshold = Math.max(5, Math.floor(dur * 0.5));
          } else {
            threshold = Math.min(30, Math.max(10, Math.floor(dur * 0.5)));
          }

          if (session.accumulatedSeconds >= threshold) {
            session.reported = true;
            const tId = track.id;
            const sId = session.sessionId;
            const playedSec = Math.round(session.accumulatedSeconds);

            fetch(`/api/music/tracks/${tId}/listen`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playbackSessionId: sId, playedSeconds: playedSec }),
            })
              .then((res) => res.json())
              .then((data) => {
                if (data && data.counted) {
                  window.dispatchEvent(
                    new CustomEvent('music:listen_recorded', {
                      detail: {
                        trackId: tId,
                        trackListenCount: data.trackListenCount,
                        releaseListenCount: data.releaseListenCount,
                      },
                    })
                  );
                }
              })
              .catch(() => {});
          }
        }
      }
    };

    const handleEnded = () => {
      handleAutoAdvance();
    };

    const handleError = (e: Event) => {
      console.error("Global Music Player error:", e);
      setIsPlaying(false);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('seeking', handleSeeking);
    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('seeking', handleSeeking);
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
    };
  }, []);

  // Keyboard shortcut listener (Space for play/pause, ESC to collapse expanded player)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.code === 'Space' && currentTrack) {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTrack, isPlaying, isExpanded]);

  const handleAutoAdvance = () => {
    if (repeatMode === 'ONE' && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
      return;
    }

    setQueue((latestQueue) => {
      setQueueIndex((prevIndex) => {
        if (latestQueue.length === 0) {
          setIsPlaying(false);
          return prevIndex;
        }

        let nextIdx = -1;
        if (isShuffle && latestQueue.length > 1) {
          do {
            nextIdx = Math.floor(Math.random() * latestQueue.length);
          } while (nextIdx === prevIndex);
        } else if (prevIndex + 1 < latestQueue.length) {
          nextIdx = prevIndex + 1;
        } else if (repeatMode === 'ALL') {
          nextIdx = 0;
        }

        if (nextIdx >= 0 && audioRef.current) {
          const nextTrack = latestQueue[nextIdx];
          setCurrentTrack(nextTrack);
          audioRef.current.src = nextTrack.audioFile;
          audioRef.current.currentTime = 0;
          audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
          return nextIdx;
        } else {
          setIsPlaying(false);
          return prevIndex;
        }
      });
      return latestQueue;
    });
  };

  const playTrackInternal = (track: Track, newQueue?: Track[], newRelease?: ReleaseInfo | null) => {
    if (!audioRef.current) return;

    const finalQueue = newQueue && newQueue.length > 0 ? newQueue : [track];
    const trackIdx = finalQueue.findIndex((t) => t.id === track.id);

    setQueue(finalQueue);
    setQueueIndex(trackIdx >= 0 ? trackIdx : 0);

    if (newRelease !== undefined) {
      setReleaseInfo(newRelease);
    }
    if (track.artistName && track.artistSlug) {
      setArtistInfo({ stageName: track.artistName, slug: track.artistSlug });
    } else if (newRelease?.artistName && newRelease?.artistSlug) {
      setArtistInfo({ stageName: newRelease.artistName, slug: newRelease.artistSlug });
    }

    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
      }
    } else {
      setCurrentTrack(track);
      audioRef.current.src = track.audioFile;
      audioRef.current.currentTime = 0;
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          console.error("Playback failed:", e);
          setIsPlaying(false);
        });
    }
  };

  const playQueueIndex = (index: number) => {
    if (!audioRef.current || index < 0 || index >= queue.length) return;
    const targetTrack = queue[index];
    setQueueIndex(index);
    setCurrentTrack(targetTrack);
    audioRef.current.src = targetTrack.audioFile;
    audioRef.current.currentTime = 0;
    audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
  };

  const playNext = () => {
    handleAutoAdvance();
  };

  const playPrev = () => {
    if (!audioRef.current) return;
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }

    if (queue.length > 0 && queueIndex > 0) {
      const prevIdx = queueIndex - 1;
      const prevTrack = queue[prevIdx];
      setCurrentTrack(prevTrack);
      setQueueIndex(prevIdx);
      audioRef.current.src = prevTrack.audioFile;
      audioRef.current.currentTime = 0;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    } else {
      audioRef.current.currentTime = 0;
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const seek = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const setVolume = (vol: number) => {
    setVolumeState(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
      setIsMuted(vol === 0);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume || 0.8;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const toggleRepeat = () => {
    setRepeatMode((prev) => (prev === 'OFF' ? 'ALL' : prev === 'ALL' ? 'ONE' : 'OFF'));
  };

  const toggleShuffle = () => {
    setIsShuffle((prev) => !prev);
  };

  const closePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setCurrentTrack(null);
    setIsExpanded(false);
  };

  // Fetch favorite status if undefined on current track
  useEffect(() => {
    if (!currentTrack || !dbUser) return;
    if (currentTrack.isFavorite !== undefined) return;

    authFetch(`/api/music/my/tracks/${currentTrack.id}/status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.isFavorite === 'boolean') {
          setCurrentTrack((prev) => (prev && prev.id === currentTrack.id ? { ...prev, isFavorite: data.isFavorite } : prev));
        }
      })
      .catch(() => {});
  }, [currentTrack?.id, dbUser, authFetch]);

  // Sync with global custom event
  useEffect(() => {
    const handleFavChange = (e: any) => {
      const { trackId, isFavorite } = e.detail || {};
      if (trackId) {
        setCurrentTrack((prev) => (prev && prev.id === trackId ? { ...prev, isFavorite } : prev));
        setQueue((prev) => prev.map((t) => (t.id === trackId ? { ...t, isFavorite } : t)));
      }
    };
    window.addEventListener('music:favorite_track_changed', handleFavChange);
    return () => window.removeEventListener('music:favorite_track_changed', handleFavChange);
  }, []);

  const toggleFavoriteTrack = async (trackId?: number): Promise<boolean> => {
    const targetId = trackId || currentTrack?.id;
    if (!targetId || !dbUser) return false;

    const targetTrack = targetId === currentTrack?.id ? currentTrack : queue.find((t) => t.id === targetId);
    const currentlyFav = Boolean(targetTrack?.isFavorite);
    const nextFav = !currentlyFav;

    if (currentTrack && currentTrack.id === targetId) {
      setCurrentTrack((prev) => (prev ? { ...prev, isFavorite: nextFav } : prev));
    }
    setQueue((prev) => prev.map((t) => (t.id === targetId ? { ...t, isFavorite: nextFav } : t)));

    window.dispatchEvent(
      new CustomEvent('music:favorite_track_changed', {
        detail: { trackId: targetId, isFavorite: nextFav },
      })
    );

    try {
      const res = await authFetch(`/api/music/my/tracks/${targetId}`, {
        method: nextFav ? 'POST' : 'DELETE',
      });
      if (!res.ok) {
        if (currentTrack && currentTrack.id === targetId) {
          setCurrentTrack((prev) => (prev ? { ...prev, isFavorite: currentlyFav } : prev));
        }
        setQueue((prev) => prev.map((t) => (t.id === targetId ? { ...t, isFavorite: currentlyFav } : t)));
        window.dispatchEvent(
          new CustomEvent('music:favorite_track_changed', {
            detail: { trackId: targetId, isFavorite: currentlyFav },
          })
        );
        return currentlyFav;
      }
      return nextFav;
    } catch {
      if (currentTrack && currentTrack.id === targetId) {
        setCurrentTrack((prev) => (prev ? { ...prev, isFavorite: currentlyFav } : prev));
      }
      setQueue((prev) => prev.map((t) => (t.id === targetId ? { ...t, isFavorite: currentlyFav } : t)));
      return currentlyFav;
    }
  };

  return (
    <MusicPlayerContext.Provider
      value={{
        currentTrack,
        queue,
        queueIndex,
        releaseInfo,
        artistInfo,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        isExpanded,
        repeatMode,
        isShuffle,
        activeTab,
        setActiveTab,
        playTrack: playTrackInternal,
        togglePlayPause,
        playNext,
        playPrev,
        playQueueIndex,
        seek,
        setVolume,
        toggleMute,
        toggleRepeat,
        toggleShuffle,
        setIsExpanded,
        closePlayer,
        isCurrentTrackFavorite: Boolean(currentTrack?.isFavorite),
        toggleFavoriteTrack,
      }}
    >
      {children}
      <GlobalPlayerBar />
      <ExpandedMusicPlayer />
    </MusicPlayerContext.Provider>
  );
};

export const useMusicPlayer = () => {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) {
    throw new Error('useMusicPlayer must be used within MusicPlayerProvider');
  }
  return ctx;
};

// Format helper
const formatTime = (secs: number) => {
  if (isNaN(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

// UI component for persistent mini-player bar
const GlobalPlayerBar: React.FC = () => {
  const { navigate } = useRouter();
  const { dbUser } = useAuth();
  const {
    currentTrack,
    releaseInfo,
    artistInfo,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isExpanded,
    repeatMode,
    isShuffle,
    togglePlayPause,
    playNext,
    playPrev,
    seek,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    setIsExpanded,
    closePlayer,
    queue,
    queueIndex,
    toggleFavoriteTrack,
  } = useMusicPlayer();

  if (!currentTrack) return null;

  const cover = currentTrack.releaseCover || releaseInfo?.cover;
  const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';
  const artistSlug = currentTrack.artistSlug || releaseInfo?.artistSlug || artistInfo?.slug;
  const releaseTitle = currentTrack.releaseTitle || releaseInfo?.title;
  const releaseSlug = currentTrack.releaseSlug || releaseInfo?.slug;

  const handleArtistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (artistSlug) {
      navigate(`/music/artist/${artistSlug}`);
    }
  };

  const handleReleaseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (releaseSlug) {
      navigate(`/music/release/${releaseSlug}`);
    } else if (currentTrack.releaseId) {
      navigate(`/music/release/${currentTrack.releaseId}`);
    }
  };

  return (
    <div className="fixed bottom-[calc(3.8rem+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 right-0 z-40 bg-[#0B0D20]/95 backdrop-blur-2xl border-t border-[#1E2442] px-3 sm:px-5 py-2.5 shadow-2xl transition-all">
      <div className="max-w-[1760px] mx-auto flex items-center justify-between gap-3 sm:gap-4">
        {/* Track Info & Artwork */}
        <div className="flex items-center gap-3 min-w-0 w-1/3 md:w-1/4">
          <div
            onClick={() => setIsExpanded((prev) => !prev)}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-900/50 to-slate-900 border border-purple-500/20 overflow-hidden shrink-0 flex items-center justify-center relative group cursor-pointer shadow-md"
            title="Развернуть плеер"
          >
            {cover ? (
              <img src={cover} alt={currentTrack.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            ) : (
              <Music2 className="w-6 h-6 text-purple-400" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <ChevronUp className="w-5 h-5 text-white" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h4
                onClick={() => setIsExpanded(true)}
                className="text-xs sm:text-sm font-bold text-white truncate cursor-pointer hover:text-purple-300 transition-colors"
                title={currentTrack.title}
              >
                {currentTrack.title}
              </h4>
              {currentTrack.explicit && (
                <span className="px-1 py-0.2 text-[9px] font-black rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                  18+
                </span>
              )}
            </div>

            <p className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5">
              <span
                onClick={handleArtistClick}
                className="hover:text-purple-300 hover:underline cursor-pointer transition-colors"
              >
                {artistName}
              </span>
              {releaseTitle && (
                <>
                  <span className="text-slate-600 mx-1">·</span>
                  <span
                    onClick={handleReleaseClick}
                    className="text-slate-400 hover:text-purple-300 hover:underline cursor-pointer transition-colors"
                  >
                    {releaseTitle}
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Favorite button in mini player */}
          {dbUser && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFavoriteTrack();
              }}
              className={`p-1.5 rounded-xl transition-all cursor-pointer shrink-0 ${
                currentTrack.isFavorite
                  ? 'text-rose-400 bg-rose-500/15 border border-rose-500/30 shadow-sm'
                  : 'text-slate-500 hover:text-rose-400 hover:bg-slate-800'
              }`}
              title={currentTrack.isFavorite ? 'Удалить из любимых треков' : 'Добавить в любимые треки'}
            >
              <Heart className={`w-4 h-4 ${currentTrack.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>
          )}
        </div>

        {/* Playback Controls & Progress Scrubber */}
        <div className="flex flex-col items-center gap-1 flex-1 max-w-xl">
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Shuffle Toggle */}
            <button
              onClick={toggleShuffle}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer hidden sm:block ${
                isShuffle ? 'text-purple-400 bg-purple-500/15' : 'text-slate-500 hover:text-slate-300'
              }`}
              title={isShuffle ? 'Случайный порядок включен' : 'Включить случайный порядок'}
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            {/* Prev Track */}
            <button
              onClick={playPrev}
              className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Предыдущий трек"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            {/* Play/Pause */}
            <button
              onClick={togglePlayPause}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/25 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
              title={isPlaying ? 'Пауза' : 'Воспроизведение'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              ) : (
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
              )}
            </button>

            {/* Next Track */}
            <button
              onClick={playNext}
              disabled={queueIndex >= queue.length - 1 && repeatMode === 'OFF' && !isShuffle}
              className={`p-1.5 transition-colors cursor-pointer ${
                queueIndex >= queue.length - 1 && repeatMode === 'OFF' && !isShuffle
                  ? 'text-slate-700 cursor-not-allowed'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Следующий трек"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            {/* Repeat Toggle */}
            <button
              onClick={toggleRepeat}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer relative hidden sm:block ${
                repeatMode !== 'OFF' ? 'text-purple-400 bg-purple-500/15' : 'text-slate-500 hover:text-slate-300'
              }`}
              title={`Повтор: ${repeatMode === 'OFF' ? 'выкл' : repeatMode === 'ONE' ? 'трек' : 'очередь'}`}
            >
              <Repeat className="w-3.5 h-3.5" />
              {repeatMode === 'ONE' && (
                <span className="absolute -top-1 -right-1 text-[8px] font-black bg-purple-500 text-slate-950 rounded-full w-3 h-3 flex items-center justify-center">
                  1
                </span>
              )}
            </button>
          </div>

          {/* Timeline Scrubber */}
          <div className="w-full flex items-center gap-2 text-[10px] sm:text-[11px] font-mono text-slate-400">
            <span className="w-8 text-right select-none">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-all"
            />
            <span className="w-8 text-left select-none">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume & Actions */}
        <div className="flex items-center justify-end gap-2 sm:gap-3 w-1/3 md:w-1/4">
          <div className="hidden md:flex items-center gap-2">
            <button onClick={toggleMute} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 lg:w-20 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          {/* Expand Fullscreen Button */}
          <button
            onClick={() => setIsExpanded(true)}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-purple-600/30 text-slate-300 hover:text-purple-300 border border-slate-700/50 hover:border-purple-500/40 transition-colors cursor-pointer"
            title="Развернуть"
          >
            <ChevronUp className="w-4 h-4" />
          </button>

          {/* Close Player Button */}
          <button
            onClick={closePlayer}
            className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
            title="Закрыть плеер"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// UI component for Full Expanded Player Modal
const ExpandedMusicPlayer: React.FC = () => {
  const { navigate } = useRouter();
  const { dbUser } = useAuth();
  const {
    currentTrack,
    queue,
    queueIndex,
    releaseInfo,
    artistInfo,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isExpanded,
    repeatMode,
    isShuffle,
    activeTab,
    setActiveTab,
    togglePlayPause,
    playNext,
    playPrev,
    playQueueIndex,
    seek,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    setIsExpanded,
    closePlayer,
    toggleFavoriteTrack,
  } = useMusicPlayer();

  if (!isExpanded || !currentTrack) return null;

  const cover = currentTrack.releaseCover || releaseInfo?.cover;
  const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';
  const artistSlug = currentTrack.artistSlug || releaseInfo?.artistSlug || artistInfo?.slug;
  const releaseTitle = currentTrack.releaseTitle || releaseInfo?.title;
  const releaseSlug = currentTrack.releaseSlug || releaseInfo?.slug;

  const handleArtistClick = () => {
    setIsExpanded(false);
    if (artistSlug) {
      navigate(`/music/artist/${artistSlug}`);
    }
  };

  const handleReleaseClick = () => {
    setIsExpanded(false);
    if (releaseSlug) {
      navigate(`/music/release/${releaseSlug}`);
    } else if (currentTrack.releaseId) {
      navigate(`/music/release/${currentTrack.releaseId}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#080A18]/95 backdrop-blur-3xl flex flex-col justify-between overflow-y-auto animate-in fade-in duration-200">
      {/* Dynamic Background Glow */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none blur-3xl scale-125"
        style={{
          backgroundImage: cover ? `url(${cover})` : undefined,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      />

      {/* Header */}
      <div className="relative z-10 max-w-6xl mx-auto w-full px-4 sm:px-8 pt-6 pb-4 flex items-center justify-between border-b border-slate-800/60 shrink-0">
        <button
          onClick={() => setIsExpanded(false)}
          className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition flex items-center gap-2 text-xs font-bold cursor-pointer"
        >
          <ChevronDown className="w-5 h-5" />
          <span className="hidden sm:inline">Свернуть</span>
        </button>

        <div className="text-center">
          <span className="text-[10px] font-mono uppercase tracking-widest text-purple-400 font-bold block">
            СЕЙЧАС ВОСПРОИЗВОДИТСЯ
          </span>
          <h3 className="text-sm font-bold text-white max-w-xs truncate">{releaseTitle || 'Музыкальный плеер'}</h3>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'queue'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Очередь ({queue.length})</span>
          </button>

          {currentTrack.lyrics && (
            <button
              onClick={() => setActiveTab('lyrics')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'lyrics'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Текст</span>
            </button>
          )}

          {currentTrack.authorNote && (
            <button
              onClick={() => setActiveTab('note')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'note'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Заметка</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Body Grid */}
      <div className="relative z-10 max-w-6xl mx-auto w-full px-4 sm:px-8 py-6 flex-1 grid grid-cols-1 md:grid-cols-12 gap-8 items-center min-h-0">
        {/* Left Column: Big Cover Artwork & Info & Controls */}
        <div className="md:col-span-6 lg:col-span-5 flex flex-col items-center text-center space-y-6">
          <div className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-3xl overflow-hidden bg-slate-950 border border-purple-500/30 shadow-[0_0_60px_rgba(147,51,234,0.25)] group">
            {cover ? (
              <img src={cover} alt={currentTrack.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/40 to-slate-950">
                <Disc className="w-24 h-24 text-purple-400 opacity-60 animate-spin-slow" />
              </div>
            )}
            {isPlaying && (
              <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-purple-600/90 backdrop-blur-md text-white text-[10px] font-bold tracking-wider flex items-center gap-1.5 shadow-lg border border-purple-400/30">
                <Sparkles className="w-3 h-3 animate-spin" />
                <span>ИГРАЕТ</span>
              </div>
            )}
          </div>

          <div className="space-y-2 w-full">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
                {currentTrack.title}
              </h2>
              {currentTrack.explicit && (
                <span className="px-2 py-0.5 text-xs font-black rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase">
                  18+
                </span>
              )}
            </div>

            <p className="text-sm sm:text-base font-medium text-slate-300 flex items-center justify-center gap-2">
              <span onClick={handleArtistClick} className="hover:text-purple-300 hover:underline cursor-pointer">
                {artistName}
              </span>
              {releaseTitle && (
                <>
                  <span className="text-slate-600">•</span>
                  <span onClick={handleReleaseClick} className="text-slate-400 hover:text-purple-300 hover:underline cursor-pointer">
                    {releaseTitle}
                  </span>
                </>
              )}
            </p>

            {/* Favorite Track Button */}
            {dbUser && (
              <div className="pt-1 flex items-center justify-center">
                <button
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
                </button>
              </div>
            )}
          </div>

          {/* Timeline Scrubber */}
          <div className="w-full space-y-2">
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
          <div className="flex items-center justify-center gap-6 w-full pt-2">
            <button
              onClick={toggleShuffle}
              className={`p-2.5 rounded-xl transition ${
                isShuffle ? 'text-purple-400 bg-purple-500/20 border border-purple-500/40' : 'text-slate-400 hover:text-white'
              }`}
              title="Случайный порядок"
            >
              <Shuffle className="w-5 h-5" />
            </button>

            <button
              onClick={playPrev}
              className="p-3 text-slate-300 hover:text-white transition cursor-pointer"
              title="Предыдущий"
            >
              <SkipBack className="w-7 h-7 fill-current" />
            </button>

            <button
              onClick={togglePlayPause}
              className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-2xl shadow-purple-500/40 hover:scale-105 active:scale-95 transition cursor-pointer"
              title={isPlaying ? 'Пауза' : 'Играть'}
            >
              {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
            </button>

            <button
              onClick={playNext}
              className="p-3 text-slate-300 hover:text-white transition cursor-pointer"
              title="Следующий"
            >
              <SkipForward className="w-7 h-7 fill-current" />
            </button>

            <button
              onClick={toggleRepeat}
              className={`p-2.5 rounded-xl transition relative ${
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
            </button>
          </div>

          {/* Volume control */}
          <div className="flex items-center justify-center gap-3 w-full max-w-xs pt-2">
            <button onClick={toggleMute} className="text-slate-400 hover:text-white transition">
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
        </div>

        {/* Right Column: Tab Content Panel (Queue / Lyrics / Note) */}
        <div className="md:col-span-6 lg:col-span-7 h-full flex flex-col bg-slate-900/50 border border-slate-800/80 rounded-3xl p-5 backdrop-blur-xl max-h-[500px] overflow-hidden">
          {/* TAB 1: Queue */}
          {activeTab === 'queue' && (
            <div className="flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between mb-4 shrink-0 pb-3 border-b border-slate-800">
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
                          {t.releaseCover ? (
                            <img src={t.releaseCover} alt="" className="w-full h-full object-cover" />
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
                          <p className="text-xs text-slate-400 truncate">
                            {t.artistName || artistName}
                          </p>
                        </div>
                      </div>

                      <span className="text-xs font-mono text-slate-500 shrink-0 ml-3">
                        {t.duration ? `${Math.floor(t.duration / 60)}:${Math.floor(t.duration % 60).toString().padStart(2, '0')}` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Lyrics */}
          {activeTab === 'lyrics' && (
            <div className="flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between mb-4 shrink-0 pb-3 border-b border-slate-800">
                <h4 className="font-bold text-base text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-400" />
                  <span>Текст песни «{currentTrack.title}»</span>
                </h4>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80">
                {currentTrack.lyrics ? (
                  <p className="text-sm sm:text-base leading-relaxed text-slate-200 font-sans whitespace-pre-line">
                    {currentTrack.lyrics}
                  </p>
                ) : (
                  <p className="text-slate-500 text-sm italic">Текст песни отсутствует</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Author Note */}
          {activeTab === 'note' && (
            <div className="flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between mb-4 shrink-0 pb-3 border-b border-slate-800">
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
        </div>
      </div>
    </div>
  );
};
