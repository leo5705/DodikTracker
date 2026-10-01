/**
 * YouTube Media Source Adapter.
 * Bridges YouTube embeds to the Watch Party player architecture.
 */

import { BaseMediaSourceAdapter } from './MediaSourceAdapter.ts';
import { WatchPartySourceType, MediaSourceConfig } from '../../types/watchParty.ts';
import { parseVideo } from '../../utils/videoUtils.ts';

export class YouTubeMediaSourceAdapter extends BaseMediaSourceAdapter {
  readonly type: WatchPartySourceType = 'YOUTUBE';
  private embedUrl: string | null = null;

  getYouTubeEmbedUrl(): string | null {
    return this.embedUrl;
  }

  async load(config: MediaSourceConfig): Promise<void> {
    this.currentConfig = config;
    const url = config.url?.trim() || '';

    if (!url) {
      this.notifyError('Ссылка на YouTube не указана', 'INVALID_URL');
      return;
    }

    const parsed = parseVideo(url);
    if (!parsed || !parsed.embedUrl) {
      this.notifyError('Не удалось распознать ссылку YouTube', 'INVALID_YOUTUBE_URL');
      return;
    }

    this.embedUrl = parsed.embedUrl;
    this.setState('READY');
  }

  async destroy(): Promise<void> {
    this.embedUrl = null;
    await super.destroy();
  }
}
