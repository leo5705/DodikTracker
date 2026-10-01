/**
 * Base contracts and interface for Watch Party Media Source Adapters.
 * Decouples video retrieval (Direct, YouTube, Torrent, etc.) from Watch Party synchronization.
 */

import {
  WatchPartySourceType,
  MediaSourceConfig,
  TorrentLoadingState,
  TorrentMediaFile,
  TorrentPeerStats,
} from '../../types/watchParty.ts';

export interface MediaSourceAdapterCallbacks {
  onStateChange: (state: TorrentLoadingState) => void;
  onStatsUpdate?: (stats: TorrentPeerStats) => void;
  onFilesDiscovered?: (files: TorrentMediaFile[]) => void;
  onBuffering?: (isBuffering: boolean) => void;
  onError?: (error: string, code?: string) => void;
  onDurationChange?: (duration: number) => void;
  onReady?: (videoElement: HTMLVideoElement | null) => void;
}

export interface IMediaSourceAdapter {
  readonly type: WatchPartySourceType;
  readonly state: TorrentLoadingState;

  initialize(callbacks: MediaSourceAdapterCallbacks): Promise<void>;
  load(config: MediaSourceConfig): Promise<void>;
  attach(videoElement: HTMLVideoElement): Promise<void>;
  detach(): void;
  getDuration(): number;
  selectFile?(fileName: string): Promise<void>;
  getFiles?(): TorrentMediaFile[];
  retry?(): Promise<void>;
  destroy(): Promise<void>;
}

export abstract class BaseMediaSourceAdapter implements IMediaSourceAdapter {
  abstract readonly type: WatchPartySourceType;
  protected _state: TorrentLoadingState = 'IDLE';
  protected callbacks: MediaSourceAdapterCallbacks = {
    onStateChange: () => {},
  };
  protected currentConfig: MediaSourceConfig | null = null;
  protected attachedVideo: HTMLVideoElement | null = null;
  protected isDestroyed = false;

  get state(): TorrentLoadingState {
    return this._state;
  }

  async initialize(callbacks: MediaSourceAdapterCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.isDestroyed = false;
    this.setState('IDLE');
  }

  abstract load(config: MediaSourceConfig): Promise<void>;

  async attach(videoElement: HTMLVideoElement): Promise<void> {
    this.attachedVideo = videoElement;
  }

  detach(): void {
    this.attachedVideo = null;
  }

  getDuration(): number {
    return this.attachedVideo?.duration || 0;
  }

  protected setState(state: TorrentLoadingState): void {
    this._state = state;
    if (!this.isDestroyed && this.callbacks.onStateChange) {
      this.callbacks.onStateChange(state);
    }
  }

  protected notifyError(error: string, code?: string): void {
    this.setState('ERROR');
    if (!this.isDestroyed && this.callbacks.onError) {
      this.callbacks.onError(error, code);
    }
  }

  async destroy(): Promise<void> {
    this.isDestroyed = true;
    this.detach();
    this._state = 'DESTROYING';
  }
}
