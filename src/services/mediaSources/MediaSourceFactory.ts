/**
 * MediaSourceFactory: Creates, manages and cleanly destroys MediaSourceAdapters.
 * Ensures a single active source adapter instance per Watch Party session.
 */

import { WatchPartySourceType, MediaSourceConfig, TorrentMediaFile } from '../../types/watchParty.ts';
import { IMediaSourceAdapter, MediaSourceAdapterCallbacks } from './MediaSourceAdapter.ts';
import { DirectMediaSourceAdapter } from './DirectMediaSourceAdapter.ts';
import { YouTubeMediaSourceAdapter } from './YouTubeMediaSourceAdapter.ts';
import { TorrentMediaSourceAdapter } from './TorrentMediaSourceAdapter.ts';
import { validateAndParseMagnet, formatByteSize, isVideoFile } from '../../utils/magnetValidator.ts';
import WebTorrent from 'webtorrent';

export class MediaSourceFactory {
  private static activeAdapter: IMediaSourceAdapter | null = null;

  /**
   * Create or transition to an adapter suitable for the given source type.
   */
  static async createAdapter(
    sourceType: WatchPartySourceType,
    callbacks: MediaSourceAdapterCallbacks
  ): Promise<IMediaSourceAdapter> {
    // If active adapter is already of matching type, re-use after cleaning state
    if (this.activeAdapter) {
      if (this.activeAdapter.type === sourceType) {
        await this.activeAdapter.initialize(callbacks);
        return this.activeAdapter;
      } else {
        await this.destroyActiveAdapter();
      }
    }

    let adapter: IMediaSourceAdapter;

    switch (sourceType) {
      case 'YOUTUBE':
        adapter = new YouTubeMediaSourceAdapter();
        break;

      case 'TORRENT':
        adapter = new TorrentMediaSourceAdapter();
        break;

      case 'DIRECT':
      case 'HLS':
      default:
        adapter = new DirectMediaSourceAdapter();
        break;
    }

    await adapter.initialize(callbacks);
    this.activeAdapter = adapter;
    return adapter;
  }

  static getActiveAdapter(): IMediaSourceAdapter | null {
    return this.activeAdapter;
  }

  static async destroyActiveAdapter(): Promise<void> {
    if (this.activeAdapter) {
      try {
        await this.activeAdapter.destroy();
      } catch (err) {
        console.warn('[MediaSourceFactory] Error destroying adapter:', err);
      }
      this.activeAdapter = null;
    }
  }

  /**
   * Temporary preview utility: inspects torrent metadata to list files without downloading full media.
   * Completely cleans up temporary WebTorrent client after metadata or timeout.
   */
  static async inspectTorrentMetadata(
    magnetUri: string,
    timeoutMs = 25000
  ): Promise<{ files: TorrentMediaFile[]; displayName?: string; infoHash?: string }> {
    const parsed = validateAndParseMagnet(magnetUri);
    if (!parsed.isValid) {
      throw new Error(parsed.error || 'Неверная magnet-ссылка');
    }

    if (typeof window !== 'undefined' && (WebTorrent as any).WEBRTC_SUPPORT === false) {
      throw new Error('Ваш браузер не поддерживает WebRTC/WebTorrent P2P');
    }

    return new Promise((resolve, reject) => {
      let client: WebTorrent | null = null;
      let timeoutTimer: any = null;
      let finished = false;

      const cleanup = () => {
        if (finished) return;
        finished = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (client) {
          try {
            client.destroy(() => {});
          } catch (_e) {}
          client = null;
        }
      };

      timeoutTimer = setTimeout(() => {
        cleanup();
        reject(new Error('Превышено время ожидания метаданных торрента. Проверьте активность раздачи.'));
      }, timeoutMs);

      try {
        client = new WebTorrent({
          tracker: {
            rtcConfig: {
              iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
            },
          },
        });

        const torrent = client.add(parsed.magnetUri, {
          announce: [
            'wss://tracker.openwebtorrent.com',
            'wss://tracker.btorrent.xyz',
            'wss://tracker.webtorrent.dev',
          ],
        });

        torrent.on('metadata', () => {
          const files = torrent.files || [];
          const discoveredFiles: TorrentMediaFile[] = files.map((file, idx) => {
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

          const result = {
            files: discoveredFiles,
            displayName: torrent.name || parsed.displayName,
            infoHash: torrent.infoHash || parsed.infoHash,
          };

          cleanup();
          resolve(result);
        });

        torrent.on('error', (err: any) => {
          cleanup();
          reject(new Error(`Ошибка инспекции торрента: ${err?.message || 'Не удалось прочитать торрент'}`));
        });
      } catch (err: any) {
        cleanup();
        reject(new Error(`Не удалось запустить клиент: ${err?.message || 'Ошибка'}`));
      }
    });
  }
}
