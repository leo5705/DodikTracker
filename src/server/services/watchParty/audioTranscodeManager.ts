/**
 * AudioTranscodeManager & AudioTranscodeSession
 *
 * Stage 10.17: Server-side Audio Compatibility Layer for Watch Party.
 *
 * Invariants:
 * 1. ZERO VIDEO RE-ENCODING: Video stream is ALWAYS copied (-c:v copy).
 * 2. ONLY audio is transcoded to AAC (-c:a aac -b:a 192k -ac 2 -ar 48000) when unsupported.
 * 3. DIRECT_STREAM for already compatible codecs (AAC, MP3, Opus, etc.) with ZERO FFmpeg overhead.
 * 4. SESSION REUSE: Multiple HTTP requests / participants in the room attach to the same session;
 *    NEVER spawn an FFmpeg process per HTTP Range request.
 * 5. RESOURCE PROTECTION: Hard concurrency ceiling (WATCH_PARTY_MAX_AUDIO_TRANSCODE_SESSIONS),
 *    graceful inactivity cleanup (20s grace period), SIGTERM -> SIGKILL timeouts.
 * 6. CLEAR DIAGNOSTIC ERRORS: FFMPEG_NOT_INSTALLED, AUDIO_TRANSCODING_CAPACITY,
 *    AUDIO_TRANSCODE_FAILED, AUDIO_CODEC_UNSUPPORTED.
 */

import { spawn, execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { Request, Response } from 'express';
import { assessAudioCodecCompatibility } from '../torrentSearch/mediaDiagnosticService.ts';

const execFileAsync = promisify(execFile);

export type TranscodeSessionStatus =
  | 'INITIALIZING'
  | 'READY'
  | 'STREAMING'
  | 'SEEKING'
  | 'ERROR'
  | 'STOPPED';

export interface AudioTranscodeOptions {
  infoHash: string;
  fileIndex: number;
  sourceStreamUrl: string;
  audioCodec: string;
  audioTrackIndex?: number;
  startOffsetSeconds?: number;
  resolvedFileName?: string;
}

export interface AudioTranscodeSessionInfo {
  sessionId: string;
  key: string;
  infoHash: string;
  fileIndex: number;
  audioCodec: string;
  status: TranscodeSessionStatus;
  createdAt: number;
  lastActivity: number;
  clientCount: number;
  startOffsetSeconds: number;
  bytesTranscoded: number;
  pid?: number;
}

interface AttachedClient {
  id: string;
  req: Request;
  res: Response;
  isClosed: boolean;
}

export class AudioTranscodeSession {
  public readonly sessionId: string;
  public readonly key: string;
  public readonly infoHash: string;
  public readonly fileIndex: number;
  public readonly sourceStreamUrl: string;
  public readonly audioCodec: string;
  public readonly audioTrackIndex: number;
  public startOffsetSeconds: number;
  public status: TranscodeSessionStatus = 'INITIALIZING';
  public readonly createdAt: number = Date.now();
  public lastActivity: number = Date.now();

  private process: ChildProcess | null = null;
  private clients: Map<string, AttachedClient> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private headerChunk: Buffer | null = null;
  private headerReadyResolvers: Array<() => void> = [];
  private totalBytesTranscoded: number = 0;
  private isFirstOutput: boolean = true;
  private lastStderr: string = '';
  private isDestroyed: boolean = false;

  private readonly GRACE_PERIOD_MS = 20000; // 20s grace period when 0 clients remain

  constructor(options: AudioTranscodeOptions) {
    this.infoHash = options.infoHash.toLowerCase().trim();
    this.fileIndex = options.fileIndex;
    this.key = `${this.infoHash}_${this.fileIndex}`;
    this.sourceStreamUrl = options.sourceStreamUrl;
    this.audioCodec = options.audioCodec;
    this.audioTrackIndex = options.audioTrackIndex ?? 0;
    this.startOffsetSeconds = options.startOffsetSeconds ?? 0;
    this.sessionId = `ats_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

    console.log(`[AUDIO_TRANSCODE] session created (id: ${this.sessionId}, key: ${this.key}, codec: ${this.audioCodec})`);
  }

  public get clientCount(): number {
    return this.clients.size;
  }

  public get pid(): number | undefined {
    return this.process?.pid;
  }

  public get bytesTranscoded(): number {
    return this.totalBytesTranscoded;
  }

  /**
   * Spawns FFmpeg for this session.
   * Invariant: -c:v copy (NEVER re-encode video!), -c:a aac (standard cross-browser AAC).
   */
  public async start(offsetSeconds: number = this.startOffsetSeconds): Promise<void> {
    if (this.isDestroyed) return;
    this.startOffsetSeconds = offsetSeconds;
    this.status = 'INITIALIZING';
    this.isFirstOutput = true;
    this.headerChunk = null;

    const ffmpegArgs: string[] = [
      '-hide_banner',
      '-loglevel', 'error',
    ];

    // Fast input seeking before input URL (utilizes HTTP Range in TorrServer)
    if (offsetSeconds > 0) {
      ffmpegArgs.push('-ss', offsetSeconds.toFixed(2));
    }

    ffmpegArgs.push(
      '-i', this.sourceStreamUrl,
      // Map first video track and selected audio track
      '-map', '0:v:0',
      '-map', `0:a:${this.audioTrackIndex}`,
      // STRICT REQUIREMENT: video = copy (zero video re-encoding!)
      '-c:v', 'copy',
      // Audio transcoding: high quality AAC stereo
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ac', '2',
      '-ar', '48000',
      // Fragmented MP4 for immediate, progressive browser streaming without full-file indexing
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1'
    );

    try {
      const proc = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.process = proc;
      this.status = 'READY';

      console.log(`[AUDIO_TRANSCODE] ffmpeg started (pid: ${proc.pid}, offset: ${offsetSeconds}s, codec: ${this.audioCodec})`);

      proc.stdout.on('data', (chunk: Buffer) => {
        this.totalBytesTranscoded += chunk.length;
        this.lastActivity = Date.now();

        if (this.isFirstOutput) {
          this.isFirstOutput = false;
          this.headerChunk = chunk;
          this.status = 'STREAMING';
          console.log(`[AUDIO_TRANSCODE] first output ready (${chunk.length} bytes, session: ${this.sessionId})`);

          // Notify any clients waiting for initial header
          const resolvers = [...this.headerReadyResolvers];
          this.headerReadyResolvers = [];
          for (const resolve of resolvers) {
            resolve();
          }
        }

        // Fan out data chunk to all attached clients
        this.broadcastChunk(chunk);
      });

      proc.stderr.on('data', (errChunk: Buffer) => {
        const text = errChunk.toString().trim();
        if (text) {
          this.lastStderr = text.slice(-500); // keep recent error tail
        }
      });

      proc.on('error', (err: any) => {
        console.error(`[AUDIO_TRANSCODE] ffmpeg error (session: ${this.sessionId}):`, err.message);
        this.status = 'ERROR';
      });

      proc.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        console.log(`[AUDIO_TRANSCODE] ffmpeg exited (code: ${code}, signal: ${signal}, session: ${this.sessionId})`);
        this.process = null;

        if (this.status !== 'STOPPED' && this.status !== 'SEEKING') {
          this.status = code === 0 ? 'READY' : 'ERROR';
        }

        // If no clients remain or stream ended normally, close client responses
        for (const client of this.clients.values()) {
          if (!client.res.writableEnded) {
            client.res.end();
          }
        }
      });
    } catch (spawnError: any) {
      this.status = 'ERROR';
      console.error(`[AUDIO_TRANSCODE] Failed to spawn ffmpeg:`, spawnError.message);
      throw spawnError;
    }
  }

  /**
   * Broadcasts a transcoded chunk to all connected clients with backpressure handling.
   */
  private broadcastChunk(chunk: Buffer): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.isClosed || client.res.writableEnded) {
        this.clients.delete(clientId);
        continue;
      }

      try {
        const canWrite = client.res.write(chunk);
        if (!canWrite) {
          client.res.once('drain', () => {});
        }
      } catch (_err) {
        client.isClosed = true;
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Attaches an incoming HTTP response client to this active transcoding session.
   * If initial header (ftyp+moov) is already buffered, writes it immediately.
   */
  public async attachClient(req: Request, res: Response): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('Transcode session is already destroyed');
    }

    // Cancel inactivity cleanup timer if active
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    const clientId = `cl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const client: AttachedClient = {
      id: clientId,
      req,
      res,
      isClosed: false,
    };

    this.clients.set(clientId, client);
    this.lastActivity = Date.now();

    console.log(`[AUDIO_TRANSCODE] client attached (clientId: ${clientId}, total clients: ${this.clients.size})`);

    // Clean up when client disconnects
    req.on('close', () => {
      this.detachClient(clientId);
    });

    // Set streaming HTTP headers
    res.status(200);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Audio-Transcode', 'ffmpeg-aac');
    res.setHeader('X-Transcode-Session', this.sessionId);

    // If initial header is not yet produced by FFmpeg, wait for it
    if (!this.headerChunk) {
      await new Promise<void>((resolve) => {
        this.headerReadyResolvers.push(resolve);
        // Safety timeout in case FFmpeg fails to produce output within 8s
        setTimeout(resolve, 8000);
      });
    }

    // Send the initialization segment to this client
    if (this.headerChunk && !res.writableEnded) {
      try {
        res.write(this.headerChunk);
      } catch (_e) {
        this.detachClient(clientId);
      }
    }
  }

  /**
   * Detaches a client when its HTTP request closes.
   */
  private detachClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.isClosed = true;
      this.clients.delete(clientId);
      console.log(`[AUDIO_TRANSCODE] client detached (clientId: ${clientId}, remaining clients: ${this.clients.size})`);
    }

    // If 0 clients remain, start cleanup timer
    if (this.clients.size === 0 && !this.cleanupTimer && !this.isDestroyed) {
      this.cleanupTimer = setTimeout(() => {
        if (this.clients.size === 0) {
          console.log(`[AUDIO_TRANSCODE] cleanup: inactivity timeout reached with 0 clients (session: ${this.sessionId})`);
          this.destroy();
        }
      }, this.GRACE_PERIOD_MS);
    }
  }

  /**
   * Repositions / seeks the session at a new offset in seconds.
   * Terminate current FFmpeg process gracefully and restart at target offset.
   */
  public async seek(offsetSeconds: number): Promise<void> {
    if (this.isDestroyed) return;
    this.status = 'SEEKING';
    console.log(`[AUDIO_TRANSCODE] seek requested (new offset: ${offsetSeconds}s, session: ${this.sessionId})`);

    // Terminate existing process
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch (_e) {}
    }

    await this.start(offsetSeconds);
  }

  /**
   * Gracefully terminates the FFmpeg process and tears down the session.
   */
  public async destroy(): Promise<void> {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.status = 'STOPPED';

    console.log(`[AUDIO_TRANSCODE] cleanup (session: ${this.sessionId}, key: ${this.key})`);

    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Close any lingering client HTTP responses
    for (const client of this.clients.values()) {
      if (!client.res.writableEnded) {
        try {
          client.res.end();
        } catch (_e) {}
      }
    }
    this.clients.clear();

    // Terminate FFmpeg with graceful SIGTERM, then forced SIGKILL
    const proc = this.process;
    if (proc && !proc.killed) {
      try {
        proc.kill('SIGTERM');
      } catch (_e) {}

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          try {
            if (proc && !proc.killed) {
              proc.kill('SIGKILL');
            }
          } catch (_k) {}
          resolve();
        }, 2000);

        proc.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    this.process = null;
  }

  public toInfo(): AudioTranscodeSessionInfo {
    return {
      sessionId: this.sessionId,
      key: this.key,
      infoHash: this.infoHash,
      fileIndex: this.fileIndex,
      audioCodec: this.audioCodec,
      status: this.status,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      clientCount: this.clients.size,
      startOffsetSeconds: this.startOffsetSeconds,
      bytesTranscoded: this.totalBytesTranscoded,
      pid: this.process?.pid,
    };
  }
}

/**
 * AudioTranscodeManager: Central orchestrator for on-the-fly audio transcoding.
 * Controls maximum concurrency, codec resolution cache, and session lifecycle.
 */
export class AudioTranscodeManager {
  private sessions: Map<string, AudioTranscodeSession> = new Map();
  private codecCache: Map<string, { codec: string; nativeSupport: boolean; checkedAt: number }> = new Map();
  private ffmpegAvailableCache: boolean | null = null;
  private ffmpegVersionCache: string | null = null;

  public get maxSessions(): number {
    const raw = process.env.WATCH_PARTY_MAX_AUDIO_TRANSCODE_SESSIONS?.trim();
    const val = raw ? parseInt(raw, 10) : 3;
    return isNaN(val) || val < 1 ? 3 : val;
  }

  /**
   * Verifies if FFmpeg binary is installed and executable on the host system.
   */
  public async isFFmpegAvailable(): Promise<{ available: boolean; version?: string; error?: string }> {
    if (this.ffmpegAvailableCache !== null) {
      return { available: this.ffmpegAvailableCache, version: this.ffmpegVersionCache || undefined };
    }

    try {
      const { stdout } = await execFileAsync('ffmpeg', ['-version'], { timeout: 3000 });
      const firstLine = stdout.split('\n')[0] || 'ffmpeg';
      this.ffmpegAvailableCache = true;
      this.ffmpegVersionCache = firstLine;
      return { available: true, version: firstLine };
    } catch (err: any) {
      this.ffmpegAvailableCache = false;
      this.ffmpegVersionCache = null;
      return {
        available: false,
        error: `FFmpeg binary is not available on PATH: ${err.message}`,
      };
    }
  }

  /**
   * Inspects and returns active non-stopped sessions.
   */
  public getActiveSessions(): AudioTranscodeSession[] {
    const active: AudioTranscodeSession[] = [];
    for (const [key, session] of this.sessions.entries()) {
      if (session.status === 'STOPPED') {
        this.sessions.delete(key);
      } else {
        active.push(session);
      }
    }
    return active;
  }

  public getActiveSessionsCount(): number {
    return this.getActiveSessions().length;
  }

  /**
   * Retrieves or establishes an audio transcode session.
   * If a session already exists for this (infoHash, fileIndex), reuses it.
   */
  public async getOrCreateSession(options: AudioTranscodeOptions): Promise<AudioTranscodeSession> {
    const key = `${options.infoHash.toLowerCase().trim()}_${options.fileIndex}`;

    // Clean up dead sessions first
    const existing = this.sessions.get(key);
    if (existing && existing.status !== 'STOPPED' && existing.status !== 'ERROR') {
      // If user requested a major time seek (> 5 seconds difference from current start offset)
      if (
        typeof options.startOffsetSeconds === 'number' &&
        Math.abs(options.startOffsetSeconds - existing.startOffsetSeconds) > 5
      ) {
        await existing.seek(options.startOffsetSeconds);
      }
      return existing;
    }

    // Check concurrency limit
    const activeCount = this.getActiveSessionsCount();
    if (activeCount >= this.maxSessions) {
      console.warn(`[AUDIO_TRANSCODE] Capacity limit reached: ${activeCount}/${this.maxSessions} active sessions`);
      const err: any = new Error(`Превышен лимит сессий транскодирования аудио (${activeCount}/${this.maxSessions})`);
      err.code = 'AUDIO_TRANSCODING_CAPACITY';
      err.statusCode = 503;
      throw err;
    }

    const session = new AudioTranscodeSession(options);
    this.sessions.set(key, session);
    await session.start();
    return session;
  }

  /**
   * Handles incoming HTTP streaming request for a media file that requires audio transcoding.
   */
  public async handleTranscodeRequest(
    req: Request,
    res: Response,
    options: AudioTranscodeOptions
  ): Promise<void> {
    console.log(`[AUDIO_TRANSCODE] codec=${options.audioCodec} -> routing to AAC_TRANSCODE session (hash: ${options.infoHash.slice(0, 8)}..., file: ${options.fileIndex})`);

    // 1. Check if FFmpeg is installed on server
    const ffmpegCheck = await this.isFFmpegAvailable();
    if (!ffmpegCheck.available) {
      console.error('[AUDIO_TRANSCODE] FFmpeg not installed on host machine');
      if (!res.headersSent) {
        res.status(503).json({
          error: 'FFmpeg не установлен на сервере для выполнения аудио-транскодирования',
          code: 'FFMPEG_NOT_INSTALLED',
          detail: ffmpegCheck.error,
        });
      }
      return;
    }

    // 2. Check compatibility status
    const codecCompat = assessAudioCodecCompatibility(options.audioCodec);
    if (codecCompat.support === 'NATIVE') {
      console.warn(`[AUDIO_TRANSCODE] Unexpected transcode request for native codec ${options.audioCodec}`);
    }

    // 3. Obtain or create session with capacity control
    let session: AudioTranscodeSession;
    try {
      session = await this.getOrCreateSession(options);
    } catch (err: any) {
      if (!res.headersSent) {
        const status = err.statusCode || (err.code === 'AUDIO_TRANSCODING_CAPACITY' ? 503 : 500);
        res.status(status).json({
          error: err.message || 'Ошибка запуска транскодирования аудио',
          code: err.code || 'AUDIO_TRANSCODE_FAILED',
        });
      }
      return;
    }

    // 4. Attach client response to session
    try {
      await session.attachClient(req, res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Не удалось подключить клиент к потоку транскодирования',
          code: 'AUDIO_TRANSCODE_FAILED',
          detail: err.message,
        });
      }
    }
  }

  /**
   * Codec cache helper to avoid repeated probing of the same media file on every HTTP request.
   */
  public getCachedCodec(infoHash: string, fileIndex: number): { codec: string; nativeSupport: boolean } | null {
    const key = `${infoHash.toLowerCase().trim()}_${fileIndex}`;
    const cached = this.codecCache.get(key);
    if (!cached) return null;
    // Cache valid for 30 minutes
    if (Date.now() - cached.checkedAt > 30 * 60 * 1000) {
      this.codecCache.delete(key);
      return null;
    }
    return { codec: cached.codec, nativeSupport: cached.nativeSupport };
  }

  public setCachedCodec(infoHash: string, fileIndex: number, codec: string, nativeSupport: boolean): void {
    const key = `${infoHash.toLowerCase().trim()}_${fileIndex}`;
    this.codecCache.set(key, { codec, nativeSupport, checkedAt: Date.now() });
  }

  /**
   * Teardown all active sessions (e.g. on server graceful exit).
   */
  public async shutdown(): Promise<void> {
    const sessions = Array.from(this.sessions.values());
    await Promise.all(sessions.map((s) => s.destroy()));
    this.sessions.clear();
  }
}

export const audioTranscodeManager = new AudioTranscodeManager();
