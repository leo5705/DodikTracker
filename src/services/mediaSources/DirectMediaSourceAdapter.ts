/**
 * Direct & HLS Media Source Adapter.
 * Bridges standard HTTP/HTTPS/HLS media URLs directly to HTML5 video elements.
 */

import { BaseMediaSourceAdapter } from './MediaSourceAdapter.ts';
import { WatchPartySourceType, MediaSourceConfig } from '../../types/watchParty.ts';

export class DirectMediaSourceAdapter extends BaseMediaSourceAdapter {
  readonly type: WatchPartySourceType = 'DIRECT';

  async load(config: MediaSourceConfig): Promise<void> {
    this.currentConfig = config;
    const url = config.url?.trim() || '';

    if (!url) {
      this.notifyError('URL видеоисточника не указан', 'INVALID_URL');
      return;
    }

    this.setState('READY');
  }

  async attach(videoElement: HTMLVideoElement): Promise<void> {
    await super.attach(videoElement);
    if (!this.currentConfig?.url) return;

    if (videoElement.src !== this.currentConfig.url) {
      videoElement.src = this.currentConfig.url;
      videoElement.load();
    }
  }

  detach(): void {
    if (this.attachedVideo) {
      this.attachedVideo.removeAttribute('src');
      this.attachedVideo.load();
    }
    super.detach();
  }

  async destroy(): Promise<void> {
    this.detach();
    await super.destroy();
  }
}
