/**
 * TorrServerClient: Interacts with TorrServer Matrix REST API.
 * Provides health checks, torrent adding, status polling, stream URL generation, and metadata readiness polling.
 */

import { TorrServerStatus, TorrServerStreamInfo } from './torrentSearchTypes.ts';
import { selectBestVideoFile, FileSelectionOptions, TorrentFileItem } from './torrentFileSelector.ts';

export interface TorrServerReadyResult {
  ready: boolean;
  status: 'READY' | 'METADATA_LOADING' | 'PENDING' | 'NOT_FOUND' | 'ERROR';
  files?: TorrentFileItem[];
  bestFileIndex?: number;
  bestFileName?: string;
  error?: string;
}

export class TorrServerClient {
  private cachedResolvedUrl: string | null = null;

  public get baseUrl(): string {
    if (this.cachedResolvedUrl) {
      return this.cachedResolvedUrl;
    }
    const envUrl = process.env.TORRSERVER_URL?.trim();
    if (envUrl) {
      return envUrl.replace(/\/+$/, '');
    }
    return 'http://127.0.0.1:8090';
  }

  /**
   * Health check for TorrServer with host probing.
   */
  public async healthCheck(): Promise<TorrServerStatus> {
    const rawEnvUrl = process.env.TORRSERVER_URL?.trim();
    const envUrl = rawEnvUrl ? rawEnvUrl.replace(/\/+$/, '') : null;

    const candidateUrls = [
      ...(envUrl ? [envUrl] : []),
      'http://127.0.0.1:8090',
      'http://localhost:8090',
    ].filter((v, i, a) => a.indexOf(v) === i);

    const primaryUrl = this.baseUrl;
    let lastError = `Не удалось подключиться к TorrServer (${primaryUrl}): служба не запущена или недоступна`;

    for (const url of candidateUrls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(`${url}/echo`, { signal: controller.signal });
        clearTimeout(timer);

        if (res.ok) {
          this.cachedResolvedUrl = url;
          const text = await res.text().catch(() => 'TorrServer');
          return { isAvailable: true, version: text };
        }
        lastError = `HTTP ${res.status}: TorrServer echo failed (${url})`;
      } catch (err: any) {
        // Continue probing next candidate
      }
    }

    return { isAvailable: false, error: lastError };
  }

  /**
   * Adds or preloads a magnet / torrent link in TorrServer.
   */
  public async addTorrent(magnetOrUrl: string, title?: string): Promise<{ success: boolean; hash?: string; error?: string }> {
    const health = await this.healthCheck();
    if (!health.isAvailable) {
      return { success: false, error: health.error || 'TorrServer недоступен' };
    }

    try {
      const payload = {
        action: 'add',
        link: magnetOrUrl,
        title: title || 'WatchParty Media',
        save: true,
      };

      const res = await fetch(`${this.baseUrl}/torrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        return { success: false, error: `TorrServer HTTP ${res.status}` };
      }

      const data = await res.json();
      const hash = data.hash || data.info_hash || data.Hash;

      return { success: true, hash };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Ошибка добавления торрента в TorrServer' };
    }
  }

  /**
   * Waits for a torrent to finish loading metadata and have streamable video files.
   * Polls with short intervals (300-400ms) up to timeoutMs without blocking room creation.
   */
  public async waitForTorrentReady(
    infoHash: string,
    magnetUri?: string,
    options: { timeoutMs?: number; pollIntervalMs?: number; fileSelectionOptions?: FileSelectionOptions } = {}
  ): Promise<TorrServerReadyResult> {
    const timeoutMs = options.timeoutMs ?? 12000;
    const pollIntervalMs = options.pollIntervalMs ?? 350;
    const startTime = Date.now();
    const hashStr = infoHash.toLowerCase().trim();

    let registrationAttempted = false;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const payload = { action: 'get', hash: hashStr };
        const res = await fetch(`${this.baseUrl}/torrents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          const rawFiles = data.file_stats || data.files || [];

          if (Array.isArray(rawFiles) && rawFiles.length > 0) {
            const mappedFiles: TorrentFileItem[] = rawFiles.map((f: any, idx: number) => ({
              index: typeof f.id === 'number' ? f.id : idx,
              name: f.path || f.name || `file_${idx}`,
              path: f.path || f.name || `file_${idx}`,
              sizeBytes: f.length || f.size || 0,
            }));

            const selection = selectBestVideoFile(mappedFiles, options.fileSelectionOptions);
            return {
              ready: true,
              status: 'READY',
              files: mappedFiles,
              bestFileIndex: selection.selectedIndex,
              bestFileName: selection.selectedFile?.name,
            };
          }
          // If in db but files not yet populated, keep polling
        } else if (res.status === 404 && !registrationAttempted && magnetUri) {
          registrationAttempted = true;
          await this.addTorrent(magnetUri).catch(() => {});
        }
      } catch (_err) {
        // Continue polling
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return {
      ready: false,
      status: 'METADATA_LOADING',
      error: 'Торрент подготавливается к воспроизведению. Пожалуйста, подождите...',
    };
  }

  /**
   * Generates direct stream HTTP URL from TorrServer for a specific file index.
   */
  public getStreamUrl(infoHash: string, fileIndex: number = 0): string {
    return `${this.baseUrl}/stream?link=${infoHash}&index=${fileIndex}&play=1`;
  }

  /**
   * Automatically resolves the best video file index and stream URL for a torrent in TorrServer.
   */
  public async resolveBestStreamUrl(
    infoHash: string,
    options: FileSelectionOptions = {}
  ): Promise<{ streamUrl: string; selectedIndex: number; selectedFileName?: string; reason: string }> {
    try {
      const payload = { action: 'get', hash: infoHash };
      const res = await fetch(`${this.baseUrl}/torrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const rawFiles = data.file_stats || data.files || [];

        if (Array.isArray(rawFiles) && rawFiles.length > 0) {
          const mappedFiles: TorrentFileItem[] = rawFiles.map((f: any, idx: number) => ({
            index: typeof f.id === 'number' ? f.id : idx,
            name: f.path || f.name || `file_${idx}`,
            path: f.path || f.name || `file_${idx}`,
            sizeBytes: f.length || f.size || 0,
          }));

          const selection = selectBestVideoFile(mappedFiles, options);
          const idx = selection.selectedIndex;
          const url = this.getStreamUrl(infoHash, idx);

          return {
            streamUrl: url,
            selectedIndex: idx,
            selectedFileName: selection.selectedFile?.name,
            reason: selection.reason,
          };
        }
      }
    } catch (_e) {
      // Fallback on error
    }

    return {
      streamUrl: this.getStreamUrl(infoHash, 0),
      selectedIndex: 0,
      reason: 'Файлы торрента недоступны для опроса, применён индекс 0 по умолчанию',
    };
  }

  /**
   * Retrieves live torrent preloading / streaming stats from TorrServer.
   */
  public async getTorrentStats(infoHash: string): Promise<TorrServerStreamInfo | null> {
    try {
      const payload = { action: 'get', hash: infoHash };
      const res = await fetch(`${this.baseUrl}/torrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const streamUrl = this.getStreamUrl(infoHash);

      return {
        streamUrl,
        infoHash,
        title: data.title || 'TorrServer Stream',
        status: data.stat === 2 || data.stat === 3 ? 'READY' : data.stat === 1 ? 'PRELOADING' : 'PENDING',
        bytesDownloaded: data.downloaded || 0,
        downloadSpeed: data.download_speed || 0,
        numPeers: data.active_peers || 0,
      };
    } catch (_e) {
      return null;
    }
  }

  /**
   * Removes a torrent from TorrServer.
   */
  public async removeTorrent(infoHash: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/torrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rem', hash: infoHash }),
      });
      return res.ok;
    } catch (_e) {
      return false;
    }
  }
}

export const torrServerClient = new TorrServerClient();
