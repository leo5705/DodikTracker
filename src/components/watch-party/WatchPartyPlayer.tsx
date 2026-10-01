import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useWatchParty } from '../../context/WatchPartyContext.tsx';
import { WatchPartyControls } from './WatchPartyControls.tsx';
import { TorrentStatsOverlay } from './TorrentStatsOverlay.tsx';
import { TorrentFilePickerModal } from '../modals/TorrentFilePickerModal.tsx';
import { Loader2, AlertCircle, Film, Sparkles, RefreshCw } from 'lucide-react';
import { MediaSourceFactory } from '../../services/mediaSources/MediaSourceFactory.ts';
import { IMediaSourceAdapter } from '../../services/mediaSources/MediaSourceAdapter.ts';
import {
  WatchPartySourceType,
  MediaSourceConfig,
  TorrentLoadingState,
  TorrentMediaFile,
  TorrentPeerStats,
} from '../../types/watchParty.ts';
import { parseVideo } from '../../utils/videoUtils.ts';

export const WatchPartyPlayer: React.FC = () => {
  const {
    room,
    isHost,
    authoritativePlayback,
    sendProgress,
    hostPlay,
    hostPause,
    hostSeek,
    forceSyncAll,
    hostChangeSource,
    syncNotification,
  } = useWatchParty();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<IMediaSourceAdapter | null>(null);

  // Synchronization and seek locking refs
  const isSeekingRef = useRef<boolean>(false);
  const isApplyingRemoteSyncRef = useRef<boolean>(false);
  const wasPlayingBeforeSeekRef = useRef<boolean>(false);
  const stallTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Torrent specific state
  const [torrentState, setTorrentState] = useState<TorrentLoadingState>('IDLE');
  const [torrentStats, setTorrentStats] = useState<TorrentPeerStats | null>(null);
  const [discoveredFiles, setDiscoveredFiles] = useState<TorrentMediaFile[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);

  const sourceType: WatchPartySourceType = room?.sourceType || 'DIRECT';
  const sourceConfig: MediaSourceConfig = room?.sourceConfig || {
    type: sourceType,
    url: room?.sourceUrl || undefined,
  };
  const sourceUrl = room?.sourceUrl || sourceConfig?.url || '';

  const parsedVideo = sourceUrl ? parseVideo(sourceUrl) : null;
  const isYouTube = parsedVideo?.site === 'YouTube' || sourceType === 'YOUTUBE';
  const isTorrent = sourceType === 'TORRENT';

  // Compute stable video stream URL for HTML5 video element
  const streamSrc = React.useMemo(() => {
    if (isYouTube) return undefined;
    if (isTorrent) {
      if (sourceConfig.url && !sourceConfig.url.startsWith('magnet:?')) {
        return sourceConfig.url;
      }
      if (sourceConfig.infoHash) {
        const fileIdx = typeof sourceConfig.torrentFileIndex === 'number' ? sourceConfig.torrentFileIndex : 0;
        return `/api/watch-party/torrents/stream?hash=${sourceConfig.infoHash}&index=${fileIdx}`;
      }
      return undefined;
    }
    return sourceUrl || undefined;
  }, [isYouTube, isTorrent, sourceConfig.url, sourceConfig.infoHash, sourceConfig.torrentFileIndex, sourceUrl]);

  // 1. Calculate Authoritative Target Position in seconds
  const calculateTargetPosition = useCallback((): number => {
    if (!authoritativePlayback) return 0;
    if (authoritativePlayback.state === 'PAUSED') {
      return authoritativePlayback.position;
    }
    const elapsedSeconds = Math.max(0, (Date.now() - authoritativePlayback.serverTimestamp) / 1000);
    const target = authoritativePlayback.position + elapsedSeconds;
    if (duration > 0 && target >= duration) {
      return duration;
    }
    return target;
  }, [authoritativePlayback, duration]);

  // 2. Authoritative Play / Pause Synchronization
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isYouTube || isSeekingRef.current) return;

    if (authoritativePlayback.state === 'PLAYING') {
      if (video.paused && !isBuffering && torrentState !== 'FETCHING_METADATA' && torrentState !== 'CONNECTING_PEERS') {
        video.play().catch(() => {
          // Autoplay blocked by browser policy
        });
      }
    } else if (authoritativePlayback.state === 'PAUSED') {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [authoritativePlayback.state, isYouTube, isBuffering, torrentState]);

  // 3. Drift Correction & Controlled Seek
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isYouTube || isSeekingRef.current || torrentState === 'FETCHING_METADATA') return;

    const targetPos = calculateTargetPosition();
    const currentLocal = video.currentTime;
    const drift = currentLocal - targetPos; // negative = lag, positive = ahead

    // Severe Lag (> 2.5s) -> Hard Seek
    if (Math.abs(drift) >= 2.5) {
      isApplyingRemoteSyncRef.current = true;
      video.currentTime = Math.max(0, targetPos);
      video.playbackRate = 1.0;
      setTimeout(() => {
        isApplyingRemoteSyncRef.current = false;
      }, 400);
    }
    // Moderate Lag (0.8s - 2.5s) -> Soft acceleration
    else if (drift < -0.8 && drift >= -2.5) {
      video.playbackRate = 1.05;
    }
    // Ahead of Host (0.8s - 2.5s) -> Soft deceleration
    else if (drift > 0.8 && drift <= 2.5) {
      video.playbackRate = 0.95;
    }
    // In Sync (< 0.8s)
    else {
      video.playbackRate = 1.0;
    }
  }, [authoritativePlayback.position, authoritativePlayback.serverTimestamp, isYouTube, torrentState, calculateTargetPosition]);

  // 4. Stable MediaSourceAdapter Loader & Lifecycle
  const stableSourceKey = `${sourceType}:${sourceConfig.infoHash || sourceConfig.url || sourceUrl}:${sourceConfig.torrentFileIndex ?? 0}`;

  const initMediaAdapter = useCallback(async () => {
    setVideoError(null);
    if (!sourceUrl && !sourceConfig.magnetUri && !sourceConfig.infoHash) {
      setTorrentState('IDLE');
      return;
    }

    try {
      const adapter = await MediaSourceFactory.createAdapter(sourceType, {
        onStateChange: (st) => setTorrentState(st),
        onStatsUpdate: (stats) => setTorrentStats(stats),
        onFilesDiscovered: (files) => setDiscoveredFiles(files),
        onBuffering: (buffering) => {
          setIsBuffering(buffering);
        },
        onError: (err) => {
          // If we have an active HTTP stream URL, don't immediately treat minor buffering/network hiccups as fatal
          if (!streamSrc) {
            setVideoError(err);
          }
        },
        onDurationChange: (dur) => setDuration(dur),
        onReady: (elem) => {
          if (elem) {
            const target = calculateTargetPosition();
            if (target > 0) elem.currentTime = target;
            if (authoritativePlayback.state === 'PLAYING') {
              elem.play().catch(() => {});
            }
          }
        },
      });

      adapterRef.current = adapter;
      await adapter.load({
        ...sourceConfig,
        url: streamSrc || sourceConfig.url,
      });

      if (videoRef.current && !isYouTube) {
        await adapter.attach(videoRef.current);
      }
    } catch (err: any) {
      console.warn('[WatchPartyPlayer] Media adapter init error:', err);
      if (!streamSrc) {
        setVideoError(err?.message || 'Не удалось инициализировать источник медиа');
      }
    }
  }, [sourceType, stableSourceKey, streamSrc, isYouTube, calculateTargetPosition, authoritativePlayback.state]);

  useEffect(() => {
    initMediaAdapter();

    return () => {
      MediaSourceFactory.destroyActiveAdapter();
      adapterRef.current = null;
    };
  }, [stableSourceKey]);

  // 5. Local HTML5 Video Event Listeners
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || isSeekingRef.current) return;

    const cur = video.currentTime;
    const dur = video.duration || duration || 0;
    setCurrentTime(cur);

    // Send telemetry to server context
    sendProgress(cur, dur, isBuffering || torrentState === 'BUFFERING');
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    const dur = video.duration || 0;
    setDuration(dur);
    setVideoError(null);

    // Align initial position
    const target = calculateTargetPosition();
    if (target > 0) {
      video.currentTime = target;
    }
  };

  const handleWaiting = () => {
    setIsBuffering(true);
    sendProgress(currentTime, duration, true);

    // Set 12-second stall timer before reporting fatal error
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    stallTimerRef.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && video.readyState < 2) {
        console.warn('[WatchPartyPlayer] Playback stalled prolonged');
      }
    }, 12000);
  };

  const handlePlaying = () => {
    setIsBuffering(false);
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  };

  const handleCanPlay = () => {
    setIsBuffering(false);
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  };

  const handleSeeked = () => {
    setIsBuffering(false);
    isSeekingRef.current = false;
    const video = videoRef.current;
    if (video) {
      setCurrentTime(video.currentTime);
      if (wasPlayingBeforeSeekRef.current && video.paused && authoritativePlayback.state === 'PLAYING') {
        video.play().catch(() => {});
      }
    }
  };

  const handleTogglePlay = () => {
    if (!isHost) return;
    const video = videoRef.current;
    const curPos = video?.currentTime ?? currentTime;

    if (authoritativePlayback.state === 'PLAYING') {
      hostPause(curPos);
    } else {
      hostPlay(curPos);
    }
  };

  // Dedicated Seek Handler
  const handleSeek = (seconds: number) => {
    if (!isHost) return;
    const video = videoRef.current;
    if (video) {
      wasPlayingBeforeSeekRef.current = !video.paused;
      isSeekingRef.current = true;
      setIsBuffering(true);
      video.currentTime = seconds;
      setCurrentTime(seconds);
    }

    // Send single authoritative seek to room
    hostSeek(seconds);
  };

  // Dedicated Force Sync All Handler
  const handleForceSyncAll = () => {
    const video = videoRef.current;
    const pos = video ? video.currentTime : currentTime;
    const isPlaying = video ? !video.paused : authoritativePlayback.state === 'PLAYING';
    forceSyncAll(pos, isPlaying ? 'PLAYING' : 'PAUSED');
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    setIsMuted(vol === 0);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  const handleToggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleSelectTorrentFile = (fileName: string) => {
    if (!isHost) return;
    hostChangeSource(
      {
        ...sourceConfig,
        type: 'TORRENT',
        fileName,
      },
      room?.mediaId || undefined,
      room?.seasonNumber || undefined,
      room?.episodeNumber || undefined
    );
  };

  // Keyboard shortcut listener (Space, ArrowLeft, ArrowRight, M, F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (isHost) handleTogglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (isHost) handleSeek(Math.max(0, currentTime - 5));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (isHost) handleSeek(Math.min(duration, currentTime + 5));
      } else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') {
        e.preventDefault();
        handleToggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHost, authoritativePlayback.state, currentTime, duration, isMuted]);

  return (
    <div ref={containerRef} className="flex flex-col space-y-3 relative group">
      {/* Video Viewport Container */}
      <div className="aspect-video w-full rounded-3xl bg-[#05060E] border border-[#1E2442] overflow-hidden relative shadow-2xl flex items-center justify-center">
        {/* Render Source: YouTube Iframe or HTML5 Video */}
        {isYouTube && parsedVideo?.embedUrl ? (
          <iframe
            src={parsedVideo.embedUrl}
            title={room?.title || 'Watch Party Video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0"
          />
        ) : streamSrc || isTorrent ? (
          <video
            ref={videoRef}
            src={streamSrc}
            poster={room?.mediaMetadata?.posterUrl || undefined}
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onWaiting={handleWaiting}
            onPlaying={handlePlaying}
            onCanPlay={handleCanPlay}
            onSeeked={handleSeeked}
            onError={() => {
              // Non-blocking: only show error if no stream src or fatal
              if (!streamSrc) setVideoError('Не удалось загрузить видеопоток');
            }}
            className="w-full h-full object-contain cursor-pointer"
            onClick={isHost ? handleTogglePlay : undefined}
          />
        ) : (
          /* Empty source state */
          <div className="flex flex-col items-center justify-center p-8 text-center text-[#64748B] space-y-2">
            <Film className="w-12 h-12 text-[#8B5CF6]/50 mb-1" />
            <p className="text-sm font-semibold text-[#F8FAFC]">Ожидание источника медиа...</p>
            <p className="text-xs max-w-sm text-[#94A3B8]">
              {isHost
                ? 'Вы можете настроить видеопоток, ссылку или торрент в настройках комнаты.'
                : 'Создатель комнаты настраивает видеопоток.'}
            </p>
          </div>
        )}

        {/* Generic Buffering Spinner Overlay during seek / buffering */}
        {isBuffering && (
          <div className="absolute inset-0 bg-[#080A18]/50 backdrop-blur-xs flex items-center justify-center pointer-events-none z-20 animate-fade-in">
            <div className="p-4 rounded-2xl bg-[#0B0D20]/90 border border-[#1E2442] flex items-center gap-3 shadow-xl">
              <Loader2 className="w-5 h-5 animate-spin text-[#8B5CF6]" />
              <span className="text-xs font-semibold text-[#F8FAFC]">Буферизация...</span>
            </div>
          </div>
        )}

        {/* Torrent Live Overlay / File Picker banner */}
        {isTorrent && (
          <TorrentStatsOverlay
            state={torrentState}
            stats={torrentStats}
            errorMessage={videoError}
            onRetry={initMediaAdapter}
            fileName={sourceConfig.fileName}
            isHost={isHost}
            onOpenPicker={() => setShowFilePicker(true)}
            availableFilesCount={discoveredFiles.filter((f) => f.isVideo).length}
          />
        )}
      </div>

      {/* Media Player Controls */}
      <WatchPartyControls
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        isMuted={isMuted}
        isFullscreen={isFullscreen}
        onSeek={handleSeek}
        onTogglePlay={handleTogglePlay}
        onVolumeChange={handleVolumeChange}
        onToggleMute={handleToggleMute}
        onToggleFullscreen={handleToggleFullscreen}
        onForceSyncAll={handleForceSyncAll}
      />

      {/* Multi-file selector modal */}
      {showFilePicker && (
        <TorrentFilePickerModal
          isOpen={showFilePicker}
          onClose={() => setShowFilePicker(false)}
          files={discoveredFiles}
          selectedFileName={sourceConfig.fileName}
          onSelectFile={handleSelectTorrentFile}
          isHost={isHost}
        />
      )}
    </div>
  );
};
