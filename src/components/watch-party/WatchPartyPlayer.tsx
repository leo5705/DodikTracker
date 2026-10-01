import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useWatchParty } from '../../context/WatchPartyContext.tsx';
import { WatchPartyControls } from './WatchPartyControls.tsx';
import { TorrentStatsOverlay } from './TorrentStatsOverlay.tsx';
import { TorrentFilePickerModal } from '../modals/TorrentFilePickerModal.tsx';
import { Loader2, AlertCircle, Film, Sparkles } from 'lucide-react';
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
    hostChangeSource,
    syncNotification,
  } = useWatchParty();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<IMediaSourceAdapter | null>(null);

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

  // 2. Play / Pause Synchronization
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isYouTube) return;

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

  // 3. Soft Drift Correction & Controlled Seek
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isYouTube || torrentState === 'FETCHING_METADATA') return;

    const targetPos = calculateTargetPosition();
    const currentLocal = video.currentTime;
    const drift = currentLocal - targetPos; // negative = lag, positive = ahead

    // A. Severe Lag or State Reset (Controlled Seek)
    if (Math.abs(drift) >= 4.0) {
      video.currentTime = Math.max(0, targetPos);
      video.playbackRate = 1.0;
    }
    // B. Moderate Lag (Soft Acceleration)
    else if (drift < -1.5 && drift >= -4.0) {
      video.playbackRate = 1.06;
    }
    // C. Ahead of Host (Soft Deceleration)
    else if (drift > 1.5) {
      video.playbackRate = 0.94;
    }
    // D. In Sync
    else {
      video.playbackRate = 1.0;
    }
  }, [authoritativePlayback.position, authoritativePlayback.serverTimestamp, isYouTube, torrentState, calculateTargetPosition]);

  // 4. MediaSourceAdapter Loader & Lifecycle
  const initMediaAdapter = useCallback(async () => {
    setVideoError(null);
    if (!sourceUrl && !sourceConfig.magnetUri) {
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
          sendProgress(currentTime, duration, buffering);
        },
        onError: (err) => setVideoError(err),
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
      await adapter.load(sourceConfig);

      if (videoRef.current && !isYouTube) {
        await adapter.attach(videoRef.current);
      }
    } catch (err: any) {
      setVideoError(err?.message || 'Не удалось инициализировать источник медиа');
    }
  }, [sourceType, sourceUrl, sourceConfig, isYouTube, calculateTargetPosition, authoritativePlayback.state, currentTime, duration, sendProgress]);

  useEffect(() => {
    initMediaAdapter();

    return () => {
      // Clean up adapter on source transition or component unmount
      MediaSourceFactory.destroyActiveAdapter();
      adapterRef.current = null;
    };
  }, [
    sourceType,
    sourceConfig.url,
    sourceConfig.magnetUri,
    sourceConfig.fileName,
    room?.seasonNumber,
    room?.episodeNumber,
  ]);

  // 5. Local HTML5 Video Event Listeners
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

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
  };

  const handlePlaying = () => {
    setIsBuffering(false);
  };

  const handleTogglePlay = () => {
    if (!isHost) return;
    if (authoritativePlayback.state === 'PLAYING') {
      hostPause(currentTime);
    } else {
      hostPlay(currentTime);
    }
  };

  const handleSeek = (seconds: number) => {
    if (!isHost) return;
    hostSeek(seconds);
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

  // Keyboard shortcut listener (Space for Play/Pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (isHost) handleTogglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHost, authoritativePlayback.state, currentTime]);

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
        ) : sourceUrl || isTorrent ? (
          <video
            ref={videoRef}
            src={isTorrent ? undefined : sourceUrl}
            poster={room?.mediaMetadata?.posterUrl || undefined}
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onWaiting={handleWaiting}
            onPlaying={handlePlaying}
            onError={() => {
              if (!isTorrent) setVideoError('Не удалось загрузить видеопоток');
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

        {/* Torrent Live Overlay / Loading Banner */}
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

        {/* Generic Buffering Spinner Overlay for Direct streams */}
        {!isTorrent && isBuffering && (
          <div className="absolute inset-0 bg-[#080A18]/60 backdrop-blur-xs flex items-center justify-center pointer-events-none z-20 animate-fade-in">
            <div className="p-4 rounded-2xl bg-[#0B0D20]/90 border border-[#1E2442] flex items-center gap-3 shadow-xl">
              <Loader2 className="w-5 h-5 animate-spin text-[#8B5CF6]" />
              <span className="text-xs font-semibold text-[#F8FAFC]">Буферизация...</span>
            </div>
          </div>
        )}

        {/* Sync Toast Notification Overlay */}
        {syncNotification && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 animate-fade-in pointer-events-none">
            <div className="px-4 py-2 rounded-xl bg-[#8B5CF6] text-white text-xs font-bold shadow-2xl flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>{syncNotification}</span>
            </div>
          </div>
        )}

        {/* Generic Video Error Overlay for Non-Torrent */}
        {!isTorrent && videoError && (
          <div className="absolute inset-0 bg-[#080A18]/85 flex items-center justify-center p-6 text-center z-20">
            <div className="max-w-md p-6 rounded-3xl bg-[#11152A] border border-rose-500/40 text-rose-300 space-y-2">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
              <h3 className="text-sm font-bold text-white">Ошибка воспроизведения</h3>
              <p className="text-xs text-[#94A3B8]">{videoError}</p>
            </div>
          </div>
        )}
      </div>

      {/* Synchronized Player Controls */}
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
      />

      {/* Torrent File Picker Modal */}
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
