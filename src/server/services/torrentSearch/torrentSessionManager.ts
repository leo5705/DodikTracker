import { TorrentCandidate, TorrentSearchQuery } from './torrentSearchTypes.ts';
import { torznabClient } from './torznabClient.ts';
import { rankTorrentCandidates } from './torrentScorer.ts';
import { torrServerClient } from './torrServerClient.ts';
import { selectBestVideoFile } from './torrentFileSelector.ts';
import { torrentSearchService } from './torrentSearchService.ts';
import { watchPartyService } from '../watchParty/watchPartyService.ts';
import { watchPartyWsServer } from '../watchParty/wsServer.ts';
import { TorrentSourceState } from '../../../types/watchParty.ts';

export interface TorrentSession {
  roomCode: string;
  mediaId?: number | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  generation: number;
  candidateId?: string;
  infoHash?: string;
  selectedFile?: {
    index: number;
    name: string;
    path: string;
    sizeBytes?: number;
  };
  streamUrl?: string;
  state: TorrentSourceState;
  startedAt: string;
  updatedAt: string;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  fallbackCandidatesTried: string[]; // infoHashes tried
}

export class TorrentSessionManager {
  private sessions = new Map<string, TorrentSession>(); // roomCode -> TorrentSession
  private torrentReferences = new Map<string, Set<string>>(); // infoHash -> Set<roomCode>

  /**
   * Retrieves active torrent session for a room.
   */
  public getSession(roomCode: string): TorrentSession | undefined {
    return this.sessions.get(roomCode);
  }

  /**
   * Reference Counting: Registers a room code as using a specific infoHash.
   */
  public addReference(infoHash: string, roomCode: string): void {
    if (!this.torrentReferences.has(infoHash)) {
      this.torrentReferences.set(infoHash, new Set());
    }
    this.torrentReferences.get(infoHash)!.add(roomCode);
    console.log(`[TORRENT] Reference added: infoHash ${infoHash} for room ${roomCode}. Total references: ${this.torrentReferences.get(infoHash)!.size}`);
  }

  /**
   * Reference Counting: Unregisters a room from using an infoHash.
   * If references reach 0, the torrent is cleanly deleted from TorrServer.
   */
  public async removeReference(infoHash: string, roomCode: string): Promise<number> {
    const refs = this.torrentReferences.get(infoHash);
    if (!refs) return 0;

    refs.delete(roomCode);
    const count = refs.size;
    if (count === 0) {
      this.torrentReferences.delete(infoHash);
      console.log(`[TORRENT] References hit 0 for infoHash ${infoHash}. Cleaning up TorrServer...`);
      await torrServerClient.removeTorrent(infoHash);
    } else {
      console.log(`[TORRENT] Remaining references for infoHash ${infoHash}: ${count}`);
    }
    return count;
  }

  /**
   * Initiates atomic background auto-torrent pipeline.
   * Returns immediately after starting search job.
   */
  public async triggerAutoTorrent(
    roomCode: string,
    hostUserId: number,
    mediaId: number,
    seasonNumber?: number | null,
    episodeNumber?: number | null
  ): Promise<{ isNew: boolean; session: TorrentSession }> {
    const existing = this.sessions.get(roomCode);

    // If already searching or loading, return existing job
    if (existing && (existing.state === 'DISCOVERING' || existing.state === 'LOADING')) {
      return { isNew: false, session: existing };
    }

    const generation = (existing?.generation ?? 0) + 1;
    const nowIso = new Date().toISOString();

    const newSession: TorrentSession = {
      roomCode,
      mediaId,
      seasonNumber,
      episodeNumber,
      generation,
      state: 'DISCOVERING',
      startedAt: nowIso,
      updatedAt: nowIso,
      retryCount: 0,
      fallbackCandidatesTried: [],
    };

    this.sessions.set(roomCode, newSession);

    // Broadcast search started
    this.broadcastSessionState(newSession);
    console.log(`[TORRENT] Discovery started (roomCode: ${roomCode}, mediaId: ${mediaId}, generation: ${generation})`);

    // Fire-and-forget background pipeline
    this.runPipeline(newSession, hostUserId).catch((err) => {
      console.error(`[TORRENT] Critical pipeline error for room ${roomCode}:`, err);
    });

    return { isNew: true, session: newSession };
  }

  /**
   * Asynchronously coordinates search, ranking, TorrServer loading, stream validation, and fallback loops.
   */
  private async runPipeline(session: TorrentSession, hostUserId: number): Promise<void> {
    const { roomCode, mediaId, seasonNumber, episodeNumber, generation } = session;

    try {
      // 1. Resolve Media Metadata and Normalise Search Query
      const query = await torrentSearchService.normalizeQueryFromMediaId(mediaId!, seasonNumber || undefined, episodeNumber || undefined);
      if (!query) {
        this.failSession(session, 'NO_TORRENT_RESULTS', 'Не удалось нормализовать метаданные медиафайла.');
        return;
      }

      // Check race condition / generation switch
      if (this.isGenerationStale(roomCode, generation)) return;

      // 2. Query Prowlarr/Torznab
      const searchResult = await torznabClient.search(query);
      if (this.isGenerationStale(roomCode, generation)) return;

      if (!searchResult.candidates || searchResult.candidates.length === 0) {
        this.failSession(session, 'NO_TORRENT_RESULTS', 'Торрент-раздачи не найдены в Prowlarr.');
        return;
      }

      // 3. Rank candidates using standard scoring algorithm
      const ranked = rankTorrentCandidates(searchResult.candidates, query);
      const candidatesToTry = ranked.slice(0, 3); // Max 3 candidates for fallback loop

      if (candidatesToTry.length === 0) {
        this.failSession(session, 'NO_TORRENT_RESULTS', 'Ни один торрент не прошел скоринг качества.');
        return;
      }

      let activeInfoHash: string | null = null;
      let activeStreamUrl: string | null = null;
      let activeFile: { index: number; name: string; path: string; sizeBytes?: number } | null = null;
      let successCandidate: TorrentCandidate | null = null;

      // 4. Fallback Loop (Candidate #1 -> Candidate #2 -> Candidate #3)
      for (let i = 0; i < candidatesToTry.length; i++) {
        const candidate = candidatesToTry[i];
        const magnet = candidate.magnetUri || candidate.downloadUrl;

        if (!magnet) {
          session.fallbackCandidatesTried.push(candidate.id || `unidentified_${i}`);
          continue;
        }

        console.log(`[TORRENT] Trying candidate #${i + 1}: ${candidate.name} (Score: ${candidate.score})`);
        session.fallbackCandidatesTried.push(candidate.infoHash || candidate.id || `cand_${i}`);
        session.state = 'FOUND';
        this.broadcastSessionState(session);

        if (this.isGenerationStale(roomCode, generation)) return;

        // 5. TorrServer loading with bounded retries
        session.state = 'LOADING';
        this.broadcastSessionState(session);

        let loadResult = await this.tryLoadTorrentInTorrServer(magnet, candidate.name, session);
        if (this.isGenerationStale(roomCode, generation)) {
          if (loadResult.infoHash) await torrServerClient.removeTorrent(loadResult.infoHash);
          return;
        }

        if (!loadResult.success || !loadResult.infoHash) {
          console.warn(`[TORRENT] TorrServer load failed for candidate: ${candidate.name}. Error: ${loadResult.error}`);
          continue; // Try next candidate
        }

        const infoHash = loadResult.infoHash;
        activeInfoHash = infoHash;
        console.log(`[TORRENT] TorrServer loading metadata succeeded for hash: ${infoHash}`);

        // 6. Select Best File Deterministically
        const mediaType = query.mediaType;
        const resolution = await torrServerClient.resolveBestStreamUrl(infoHash, {
          seasonNumber: seasonNumber || undefined,
          episodeNumber: episodeNumber || undefined,
          mediaType: mediaType,
        });

        if (!resolution || !resolution.streamUrl) {
          console.warn(`[TORRENT] File selection or stream URL resolution failed for infoHash: ${infoHash}`);
          await torrServerClient.removeTorrent(infoHash);
          activeInfoHash = null;
          continue;
        }

        activeFile = {
          index: resolution.selectedIndex,
          name: resolution.selectedFileName || `Файл #${resolution.selectedIndex}`,
          path: resolution.selectedFileName || `Файл #${resolution.selectedIndex}`,
        };

        // Construct safe proxied stream URL
        // We replace internal hostname or provide a proxied route to prevent SSRF and internal hostname leakage
        activeStreamUrl = `/api/watch-party/rooms/${roomCode}/torrent-stream?hash=${infoHash}&index=${resolution.selectedIndex}`;
        console.log(`[TORRENT] File selected: ${activeFile.name} (Index: ${activeFile.index})`);

        // 7. Stream Validation
        session.state = 'BUFFERING';
        this.broadcastSessionState(session);

        // We validate the direct stream from TorrServer (not our proxy route, to avoid infinite request recursion)
        const directStreamUrl = resolution.streamUrl;
        const streamValid = await this.validateStream(directStreamUrl);
        if (this.isGenerationStale(roomCode, generation)) {
          await torrServerClient.removeTorrent(infoHash);
          return;
        }

        if (!streamValid.valid) {
          console.warn(`[TORRENT] Stream validation failed for ${candidate.name}: ${streamValid.error} (potentially low speed or no seeders)`);
          await torrServerClient.removeTorrent(infoHash);
          activeInfoHash = null;
          activeStreamUrl = null;
          activeFile = null;
          continue; // Try next candidate
        }

        // Succeeded! Break fallback loop
        successCandidate = candidate;
        break;
      }

      // If no candidates succeeded
      if (!successCandidate || !activeInfoHash || !activeStreamUrl) {
        this.failSession(session, 'TORRENT_SOURCE_FAILED', 'Не удалось подготовить видеопоток ни из одного найденного торрента.');
        return;
      }

      // 8. Atomic Source Switch
      if (this.isGenerationStale(roomCode, generation)) {
        await torrServerClient.removeTorrent(activeInfoHash);
        return;
      }

      // Register shared reference
      this.addReference(activeInfoHash, roomCode);

      // Persist safe sourceType TORRENT change in the room database
      const safeConfig = {
        type: 'TORRENT' as const,
        url: activeStreamUrl,
        magnetUri: successCandidate.magnetUri,
        fileName: activeFile?.name,
        infoHash: activeInfoHash,
        title: successCandidate.name,
      };

      await watchPartyService.changeSource(
        roomCode,
        hostUserId,
        safeConfig,
        mediaId,
        seasonNumber,
        episodeNumber
      );

      // Update session status
      session.state = 'READY';
      session.infoHash = activeInfoHash;
      session.streamUrl = activeStreamUrl;
      session.selectedFile = activeFile || undefined;
      session.errorCode = undefined;
      session.errorMessage = undefined;
      session.updatedAt = new Date().toISOString();

      console.log(`[TORRENT] Source ready (room: ${roomCode}, hash: ${activeInfoHash})`);

      // Broadcast success events
      this.broadcastSessionState(session);

      watchPartyWsServer.broadcastToRoom(roomCode, {
        type: 'TORRENT_SOURCE_READY',
        roomCode,
        sourceType: 'TORRENT',
        state: 'READY',
      });

    } catch (err: any) {
      console.error(`[TORRENT] Session pipeline crash for room ${roomCode}:`, err);
      this.failSession(session, 'TORRENT_SOURCE_FAILED', err?.message || 'Произошла критическая ошибка в видеоконвейере.');
    }
  }

  /**
   * Helper to load torrent in TorrServer with transient error retry logic.
   */
  private async tryLoadTorrentInTorrServer(
    magnet: string,
    title: string,
    session: TorrentSession
  ): Promise<{ success: boolean; infoHash?: string; error?: string }> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt <= maxRetries) {
      if (attempt > 0) {
        console.log(`[TORRENT] Retrying TorrServer load for ${title} (Attempt ${attempt}/${maxRetries})...`);
        session.retryCount++;
        session.updatedAt = new Date().toISOString();
        this.broadcastSessionState(session);
        await new Promise((r) => setTimeout(r, 2000));
      }

      attempt++;

      const addResult = await torrServerClient.addTorrent(magnet, title);
      if (!addResult.success || !addResult.hash) {
        const errType = this.classifyLoadError(addResult.error);
        if (errType === 'TRANSIENT' && attempt <= maxRetries) {
          continue;
        }
        return { success: false, error: addResult.error || 'TorrServer rejected the torrent' };
      }

      const infoHash = addResult.hash;

      // Poll metadata (bounded polling, max 30 attempts, 1.5s interval -> ~45 seconds timeout)
      let loaded = false;
      for (let poll = 1; poll <= 30; poll++) {
        if (this.isGenerationStale(session.roomCode, session.generation)) {
          return { success: false, infoHash, error: 'Generation updated' };
        }
        await new Promise((r) => setTimeout(r, 1500));
        const stats = await torrServerClient.getTorrentStats(infoHash);
        if (stats && stats.status === 'READY') {
          loaded = true;
          break;
        }
      }

      if (loaded) {
        return { success: true, infoHash };
      }

      // If polling metadata timed out, classify as transient/recoverable
      console.warn(`[TORRENT] TorrServer metadata polling timed out for hash ${infoHash}`);
      await torrServerClient.removeTorrent(infoHash);

      if (attempt <= maxRetries) {
        continue;
      }

      return { success: false, error: 'Превышено время ожидания метаданных TorrServer' };
    }

    return { success: false, error: 'Превышено число попыток загрузки торрента' };
  }

  /**
   * Safe stream validator checking headers and reading a small chunk of bytes.
   */
  private async validateStream(url: string): Promise<{ valid: boolean; error?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        headers: { Range: 'bytes=0-1048575' },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status >= 400) {
        return { valid: false, error: `TorrServer returned HTTP Status ${res.status}` };
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        return { valid: false, error: `Stream returned invalid content-type: ${contentType}` };
      }

      // Read small byte range chunk
      const reader = res.body?.getReader();
      if (reader) {
        await reader.read().catch(() => {});
        reader.cancel().catch(() => {});
      }

      return { valid: true };
    } catch (err: any) {
      clearTimeout(timer);
      return { valid: false, error: err?.message || 'HTTP Stream request failed' };
    }
  }

  private classifyLoadError(error?: string): 'TRANSIENT' | 'FATAL' {
    if (!error) return 'TRANSIENT';
    const errLower = error.toLowerCase();
    if (errLower.includes('timeout') || errLower.includes('temporary') || errLower.includes('connect') || errLower.includes('unavailable') || errLower.includes('502') || errLower.includes('503') || errLower.includes('504')) {
      return 'TRANSIENT';
    }
    return 'FATAL';
  }

  private failSession(session: TorrentSession, code: string, message: string): void {
    session.state = 'FAILED';
    session.errorCode = code;
    session.errorMessage = message;
    session.updatedAt = new Date().toISOString();
    this.broadcastSessionState(session);
    console.error(`[TORRENT] Source failed (roomCode: ${session.roomCode}, errorCode: ${code}, error: ${message})`);
  }

  private isGenerationStale(roomCode: string, generation: number): boolean {
    const active = this.sessions.get(roomCode);
    return !active || active.generation !== generation;
  }

  /**
   * Broadcasts the current session state via WebSocket real-time updates.
   */
  private broadcastSessionState(session: TorrentSession): void {
    watchPartyWsServer.broadcastToRoom(session.roomCode, {
      type: 'TORRENT_STATE_UPDATE' as any,
      roomCode: session.roomCode,
      state: session.state,
      infoHash: session.infoHash,
      selectedFile: session.selectedFile,
      errorCode: session.errorCode,
      errorMessage: session.errorMessage,
      fallbackCount: session.fallbackCandidatesTried.length,
      retryCount: session.retryCount,
    });
  }

  /**
   * Returns the current reference count for a specific infoHash.
   */
  public getReferenceCount(infoHash: string): number {
    return this.torrentReferences.get(infoHash)?.size ?? 0;
  }

  /**
   * Alias for removeReference to cleanly release a torrent reference.
   */
  public async releaseTorrent(infoHash: string, roomCode: string): Promise<number> {
    return this.removeReference(infoHash, roomCode);
  }

  /**
   * Safely updates source-specific live playback state (e.g. PLAYING, BUFFERING) for an active session.
   */
  public updatePlaybackState(roomCode: string, state: TorrentSourceState): void {
    const session = this.sessions.get(roomCode);
    if (!session) return;

    const allowedStates: TorrentSourceState[] = ['READY', 'PLAYING', 'BUFFERING'];
    if (allowedStates.includes(session.state) && allowedStates.includes(state)) {
      if (session.state !== state) {
        session.state = state;
        session.updatedAt = new Date().toISOString();
        this.broadcastSessionState(session);
      }
    }
  }

  /**
   * Cleanly cancels / stops any active torrent search/loading session.
   */
  public async cancelSession(roomCode: string): Promise<void> {
    const session = this.sessions.get(roomCode);
    if (!session) return;

    console.log(`[TORRENT] Stopping active torrent session for room: ${roomCode}`);
    const originalState = session.state;
    session.state = 'STOPPING';
    session.generation++; // invalidates any background running pipelines immediately

    if (session.infoHash) {
      await this.removeReference(session.infoHash, roomCode);
    }

    session.state = 'STOPPED';
    session.updatedAt = new Date().toISOString();
    this.broadcastSessionState(session);
    this.sessions.delete(roomCode);
  }
}

export const torrentSessionManager = new TorrentSessionManager();
