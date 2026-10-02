/**
 * TorrentMediaSourceAdapter: Browser-side WebTorrent P2P streaming adapter.
 * Handles single-client WebTorrent lifecycle, magnet validation, video file selection,
 * stream attachment, buffering detection, and peer statistics.
 */

import type {
  Torrent,
  TorrentFile,
} from 'webtorrent';
import { BaseMediaSourceAdapter, MediaSourceAdapterCallbacks } from './MediaSourceAdapter.ts';
import {
  WatchPartySourceType,
  MediaSourceConfig,
  TorrentLoadingState,
  TorrentMediaFile,
  TorrentPeerStats,
} from '../../types/watchParty.ts';
import {
  validateAndParseMagnet,
  formatByteSize,
  isVideoFile,
} from '../../utils/magnetValidator.ts';

const DEFAULT_WEBRTC_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.files.fm:7073/announce',
];

const METADATA_TIMEOUT_MS = 60000; // 60s timeout

function isMatchingMediaSrc(currentVideoSrc: string, targetUrl: string): boolean {
  if (!currentVideoSrc || !targetUrl) return false;
  if (currentVideoSrc === targetUrl) return true;
  if (currentVideoSrc.endsWith(targetUrl)) return true;
  try {
    const fullTarget = typeof window !== 'undefined' ? new URL(targetUrl, window.location.href).href : targetUrl;
    return currentVideoSrc === fullTarget;
  } catch {
    return false;
  }
}

export class TorrentMediaSourceAdapter extends BaseMediaSourceAdapter {
  readonly type: WatchPartySourceType = 'TORRENT';

  private client: any = null;
  private torrent: Torrent | null = null;
  private activeFile: TorrentFile | null = null;
  private discoveredFiles: TorrentMediaFile[] = [];

  private statsInterval: any = null;
  private metadataTimeoutTimer: any = null;
  private lastStats: TorrentPeerStats | null = null;
  private activeBlobUrl: string | null = null;
  private loadGeneration = 0;

  async initialize(callbacks: MediaSourceAdapterCallbacks): Promise<void> {
    await super.initialize(callbacks);
    this.discoveredFiles = [];
    this.lastStats = null;
  }

  getFiles(): TorrentMediaFile[] {
    return this.discoveredFiles;
  }

  getStats(): TorrentPeerStats | null {
    return this.lastStats;
  }

  async load(config: MediaSourceConfig): Promise<void> {
    this.currentConfig = config;
    const currentGen = ++this.loadGeneration;

    // 1. Resolve HTTP stream URL from config.url, infoHash, or parsed magnet URI
    let streamUrl = config.url;
    if ((!streamUrl || streamUrl.startsWith('magnet:?')) && config.infoHash) {
      const fileIndex = typeof config.torrentFileIndex === 'number' ? config.torrentFileIndex : 0;
      streamUrl = `/api/watch-party/torrents/stream?hash=${config.infoHash}&index=${fileIndex}`;
      this.currentConfig = { ...config, url: streamUrl };
    } else if ((!streamUrl || streamUrl.startsWith('magnet:?')) && (config.magnetUri || config.url)) {
      const rawMagnet = config.magnetUri || config.url || '';
      const parsed = validateAndParseMagnet(rawMagnet);
      if (parsed.isValid && parsed.infoHash) {
        const fileIndex = typeof config.torrentFileIndex === 'number' ? config.torrentFileIndex : 0;
        streamUrl = `/api/watch-party/torrents/stream?hash=${parsed.infoHash}&index=${fileIndex}`;
        this.currentConfig = { ...config, url: streamUrl, infoHash: parsed.infoHash };
      }
    }

    const isHttpStream = streamUrl && (streamUrl.startsWith('http://') || streamUrl.startsWith('https://') || streamUrl.startsWith('/'));
    if (isHttpStream) {
      // Direct TorrServer HTTP Streaming mode:
      // Clean up any lingering WebTorrent client
      await this.cleanupTorrent();
      if (currentGen !== this.loadGeneration || this.isDestroyed) return;

      this.setState('READY');
      if (this.attachedVideo) {
        if (!isMatchingMediaSrc(this.attachedVideo.src, streamUrl)) {
          this.attachedVideo.src = streamUrl;
          this.attachedVideo.load();
        }
        this.callbacks.onReady?.(this.attachedVideo);
      }
      return;
    }

    const magnet = config.magnetUri || config.url || '';

    // 1. Check browser WebRTC support
    try {
      const { default: WebTorrent } = await import('webtorrent');
      if (typeof window !== 'undefined') {
        const webrtcSupported = (WebTorrent as any).WEBRTC_SUPPORT;
        if (webrtcSupported === false) {
          this.notifyError(
            'Ваш браузер не поддерживает P2P-воспроизведение WebTorrent / WebRTC.',
            'WEBRTC_UNSUPPORTED'
          );
          return;
        }
      }

      // 2. Validate Magnet URI
      const parsed = validateAndParseMagnet(magnet);
      if (!parsed.isValid) {
        this.notifyError(parsed.error || 'Неверная magnet-ссылка', 'INVALID_MAGNET');
        return;
      }

      this.setState('PARSING');

      // 3. Clean up previous client/torrent before new load
      await this.cleanupTorrent();

      // Check if new load call or destroy happened while cleaning up
      if (currentGen !== this.loadGeneration || this.isDestroyed) return;

      // 4. Instantiate WebTorrent single client
      this.client = new WebTorrent({
        tracker: {
          rtcConfig: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
            ],
          },
        },
      });

      this.setState('FETCHING_METADATA');

      // 5. Setup metadata timeout
      this.metadataTimeoutTimer = setTimeout(() => {
        if (currentGen !== this.loadGeneration || this.isDestroyed) return;
        if (this._state === 'FETCHING_METADATA' || this._state === 'PARSING') {
          this.notifyError(
            'Превышено время ожидания метаданных торрента. Проверьте активность раздачи (сидов).',
            'TORRENT_TIMEOUT'
          );
        }
      }, METADATA_TIMEOUT_MS);

      // Trackers combination
      const announceTrackers = Array.from(
        new Set([...(parsed.trackers || []), ...DEFAULT_WEBRTC_TRACKERS])
      );

      // 6. Add torrent
      this.torrent = this.client.add(parsed.magnetUri, {
        announce: announceTrackers,
      });

      this.setupTorrentListeners(this.torrent, currentGen);
      this.startStatsLoop(currentGen);
    } catch (err: any) {
      if (currentGen !== this.loadGeneration || this.isDestroyed) return;
      this.notifyError(
        `Ошибка запуска торрент-клиента: ${err?.message || 'Неизвестная ошибка'}`,
        'TORRENT_INIT_FAILED'
      );
    }
  }

  private setupTorrentListeners(torrent: Torrent, currentGen: number): void {
    torrent.on('metadata', () => {
      if (currentGen !== this.loadGeneration || this.isDestroyed) return;
      if (this.metadataTimeoutTimer) {
        clearTimeout(this.metadataTimeoutTimer);
        this.metadataTimeoutTimer = null;
      }

      this.handleMetadataLoaded(torrent, currentGen);
    });

    torrent.on('ready', () => {
      if (currentGen !== this.loadGeneration || this.isDestroyed) return;
      this.handleMetadataLoaded(torrent, currentGen);
    });

    torrent.on('wire', () => {
      if (currentGen !== this.loadGeneration || this.isDestroyed) return;
      if (this._state === 'CONNECTING_PEERS') {
        this.setState('BUFFERING');
      }
    });

    torrent.on('noPeers', () => {
      if (currentGen !== this.loadGeneration || this.isDestroyed) return;
      if (torrent.numPeers === 0 && this._state === 'CONNECTING_PEERS') {
        // Keep in connecting peers state
      }
    });

    torrent.on('error', (err: any) => {
      if (currentGen !== this.loadGeneration || this.isDestroyed) return;
      const msg = typeof err === 'string' ? err : err?.message || 'Ошибка торрента';
      this.notifyError(`Ошибка загрузки торрента: ${msg}`, 'TORRENT_ERROR');
    });

    torrent.on('warning', (warn: any) => {
      if (currentGen !== this.loadGeneration || this.isDestroyed) return;
      console.warn('[WebTorrent Warning]:', warn);
    });
  }

  private handleMetadataLoaded(torrent: Torrent, currentGen: number): void {
    if (currentGen !== this.loadGeneration || this.isDestroyed) return;
    if (this.discoveredFiles.length > 0) return; // already processed

    const files = torrent.files || [];
    if (files.length === 0) {
      this.notifyError('В торренте отсутствуют файлы', 'NO_FILES');
      return;
    }

    // Inspect files & check playable video formats
    this.discoveredFiles = files.map((file, idx) => {
      const ext = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
      const isVideo = isVideoFile(file.name);
      return {
        name: file.name,
        length: file.length,
        formattedSize: formatByteSize(file.length),
        extension: ext,
        isVideo,
        canPlay: isVideo,
        index: idx,
      };
    });

    this.callbacks.onFilesDiscovered?.(this.discoveredFiles);

    // Pick configured or best video file
    let targetFile: TorrentFile | undefined;

    if (this.currentConfig?.fileName) {
      targetFile = files.find(
        (f) =>
          f.name === this.currentConfig?.fileName ||
          (f as any).path === this.currentConfig?.fileName ||
          (f as any).relativePath === this.currentConfig?.fileName
      );
    }

    if (!targetFile) {
      const videoFiles = files.filter((f) => isVideoFile(f.name));
      if (videoFiles.length > 0) {
        // Exclude sample / preview / promo / trailer files if main video files exist
        const nonSampleVideoFiles = videoFiles.filter(
          (f) => !/sample|preview|trailer|promo|bonus/i.test(f.name)
        );
        const candidates = nonSampleVideoFiles.length > 0 ? nonSampleVideoFiles : videoFiles;
        targetFile = candidates.reduce((prev, cur) => (cur.length > prev.length ? cur : prev));
      }
    }

    if (!targetFile) {
      this.notifyError(
        'В торренте не найден поддерживаемый видеофайл (.mp4, .webm, .mkv, etc.)',
        'NO_VIDEO_FILE'
      );
      return;
    }

    this.activeFile = targetFile;
    this.setState(torrent.numPeers > 0 ? 'BUFFERING' : 'CONNECTING_PEERS');

    if (this.attachedVideo) {
      this.renderActiveFile(this.attachedVideo, currentGen);
    }
  }

  private renderActiveFile(videoElement: HTMLVideoElement, currentGen: number): void {
    if (currentGen !== this.loadGeneration || !this.activeFile || this.isDestroyed) return;

    // Check video element format support
    const ext = this.activeFile.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'mkv' && typeof videoElement.canPlayType === 'function') {
      const canPlayMkv = videoElement.canPlayType('video/x-matroska') || videoElement.canPlayType('video/mkv');
      if (canPlayMkv === '') {
        console.info('[TorrentMediaSourceAdapter] Browser may need MSE for MKV container');
      }
    }

    try {
      this.setState('BUFFERING');

      // Use WebTorrent renderTo / streamTo
      if (typeof (this.activeFile as any).renderTo === 'function') {
        (this.activeFile as any).renderTo(
          videoElement,
          { autoplay: false, controls: false },
          (err: any) => {
            if (currentGen !== this.loadGeneration || this.isDestroyed) return;
            if (err) {
              console.warn('[TorrentAdapter] renderTo fallback warning:', err);
              // Try blob URL fallback if direct streaming throws
              this.fallbackBlobRender(this.activeFile!, videoElement, currentGen);
            } else {
              this.setState('READY');
              this.callbacks.onReady?.(videoElement);
            }
          }
        );
      } else {
        this.fallbackBlobRender(this.activeFile, videoElement, currentGen);
      }
    } catch (err: any) {
      if (currentGen !== this.loadGeneration || this.isDestroyed) return;
      this.notifyError(
        `Не удалось подключить видеопоток: ${err?.message || 'Ошибка рендера'}`,
        'MEDIA_ATTACH_FAILED'
      );
    }
  }

  private fallbackBlobRender(file: TorrentFile, videoElement: HTMLVideoElement, currentGen: number): void {
    if (typeof (file as any).getBlobURL === 'function') {
      (file as any).getBlobURL((err: any, url: string) => {
        if (currentGen !== this.loadGeneration || this.isDestroyed) return;
        if (err || !url) {
          this.notifyError(
            'Браузер не смог создать медиапоток из выбранного торрент-файла',
            'BLOB_CREATION_FAILED'
          );
        } else {
          this.activeBlobUrl = url;
          videoElement.src = url;
          this.setState('READY');
          this.callbacks.onReady?.(videoElement);
        }
      });
    } else {
      if (currentGen !== this.loadGeneration || this.isDestroyed) return;
      this.notifyError('Метод потокового воспроизведения недоступен в браузере', 'UNSUPPORTED_STREAM_API');
    }
  }

  async attach(videoElement: HTMLVideoElement): Promise<void> {
    await super.attach(videoElement);

    // Attach buffering event listeners
    videoElement.addEventListener('waiting', this.handleVideoWaiting);
    videoElement.addEventListener('playing', this.handleVideoPlaying);
    videoElement.addEventListener('durationchange', this.handleDurationChange);

    const isHttpStream = this.currentConfig?.url && (this.currentConfig.url.startsWith('http://') || this.currentConfig.url.startsWith('https://') || this.currentConfig.url.startsWith('/'));
    if (isHttpStream && this.currentConfig?.url) {
      if (!isMatchingMediaSrc(videoElement.src, this.currentConfig.url)) {
        videoElement.src = this.currentConfig.url;
        videoElement.load();
      }
      this.setState('READY');
      this.callbacks.onReady?.(videoElement);
      return;
    }

    if (this.activeFile && this._state !== 'ERROR' && this._state !== 'DESTROYING') {
      this.renderActiveFile(videoElement, this.loadGeneration);
    }
  }

  detach(): void {
    if (this.attachedVideo) {
      this.attachedVideo.removeEventListener('waiting', this.handleVideoWaiting);
      this.attachedVideo.removeEventListener('playing', this.handleVideoPlaying);
      this.attachedVideo.removeEventListener('durationchange', this.handleDurationChange);
      try {
        this.attachedVideo.pause();
        this.attachedVideo.removeAttribute('src');
        this.attachedVideo.load();
      } catch (_e) {}
    }
    super.detach();
  }

  private handleVideoWaiting = () => {
    if (!this.isDestroyed && this.callbacks.onBuffering) {
      this.callbacks.onBuffering(true);
    }
  };

  private handleVideoPlaying = () => {
    if (!this.isDestroyed && this.callbacks.onBuffering) {
      this.callbacks.onBuffering(false);
    }
  };

  private handleDurationChange = () => {
    if (this.attachedVideo && !isNaN(this.attachedVideo.duration)) {
      this.callbacks.onDurationChange?.(this.attachedVideo.duration);
    }
  };

  async selectFile(fileName: string): Promise<void> {
    if (!this.torrent) return;

    const file = this.torrent.files.find(
      (f) =>
        f.name === fileName ||
        (f as any).path === fileName ||
        (f as any).relativePath === fileName
    );
    if (!file) {
      this.notifyError(`Файл «${fileName}» не найден в торренте`, 'FILE_NOT_FOUND');
      return;
    }

    this.activeFile = file;
    if (this.currentConfig) {
      this.currentConfig.fileName = fileName;
    }

    if (this.attachedVideo) {
      this.renderActiveFile(this.attachedVideo, this.loadGeneration);
    }
  }

  private startStatsLoop(currentGen: number): void {
    if (this.statsInterval) clearInterval(this.statsInterval);

    this.statsInterval = setInterval(() => {
      if (currentGen !== this.loadGeneration || !this.torrent || this.isDestroyed) return;

      const stats: TorrentPeerStats = {
        numPeers: this.torrent.numPeers || 0,
        downloadSpeed: this.torrent.downloadSpeed || 0,
        uploadSpeed: this.torrent.uploadSpeed || 0,
        downloaded: this.torrent.downloaded || 0,
        total: this.torrent.length || 0,
        progress: this.torrent.progress || 0,
        ratio: this.torrent.ratio || 0,
        timeRemaining: this.torrent.timeRemaining,
      };

      this.lastStats = stats;
      this.callbacks.onStatsUpdate?.(stats);
    }, 1000);
  }

  async retry(): Promise<void> {
    if (this.currentConfig) {
      await this.load(this.currentConfig);
    }
  }

  private async cleanupTorrent(): Promise<void> {
    if (this.metadataTimeoutTimer) {
      clearTimeout(this.metadataTimeoutTimer);
      this.metadataTimeoutTimer = null;
    }

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    if (this.activeBlobUrl) {
      try {
        URL.revokeObjectURL(this.activeBlobUrl);
      } catch (_e) {}
      this.activeBlobUrl = null;
    }

    if (this.torrent) {
      try {
        this.torrent.destroy({ destroyStore: true }, () => {});
      } catch (_e) {}
      this.torrent = null;
    }

    if (this.client) {
      try {
        this.client.destroy(() => {});
      } catch (_e) {}
      this.client = null;
    }

    this.activeFile = null;
  }

  async destroy(): Promise<void> {
    await super.destroy();
    await this.cleanupTorrent();
    this.discoveredFiles = [];
    this.lastStats = null;
  }
}
