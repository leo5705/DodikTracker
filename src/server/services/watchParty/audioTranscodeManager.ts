/**
 * AudioTranscodeManager & AudioTranscodeSession
 *
 * Stage 10.20: Stable AAC Transcoding with HTTP Range & Spool File Architecture.
 *
 * Invariants:
 * 1. ZERO VIDEO RE-ENCODING: Video stream is ALWAYS copied (-c:v copy).
 * 2. ONLY audio is transcoded to AAC (-c:a aac -b:a 192k -ac 2 -ar 48000) when unsupported.
 * 3. DIRECT_STREAM for already compatible codecs (AAC, MP3, Opus, etc.) with ZERO FFmpeg overhead.
 * 4. PERSISTENT TEMPORARY SPOOL FILE: FFmpeg writes fragmented MP4 to disk (/tmp/watch-party-transcode/...),
 *    enabling true HTTP 206 Partial Content, Content-Range, Content-Length, and Accept-Ranges support.
 * 5. SESSION REUSE: Multiple HTTP Range requests and concurrent room participants reuse the same FFmpeg process
 *    and read from the single growing spool file via independent file read streams.
 * 6. BOUNDED BYTE POLLING: If a browser Range request asks for bytes beyond current file size while FFmpeg
 *    is actively running, the server polls for bytes with a bounded timeout before responding.
 * 7. DISK & CONCURRENCY SAFETY: Hard ceiling on concurrent sessions and total spool disk usage;
 *    automatic file cleanup on session destruction and server shutdown.
 */

import { spawn, execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { assessAudioCodecCompatibility } from '../torrentSearch/mediaDiagnosticService.ts';

const execFileAsync = promisify(execFile);

export const DEFAULT_TRANSCODE_SPOOL_DIR = process.env.WATCH_PARTY_TRANSCODE_DIR || '/tmp/watch-party-transcode';

export type TranscodeSessionStatus =
  | 'INITIALIZING'
  | 'STARTING'
  | 'RUNNING'
  | 'READY'
  | 'STREAMING'
  | 'COMPLETED'
  | 'FAILED'
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
  filePath?: string;
  totalSize?: number;
  pid?: number;
}

interface AttachedClient {
  id: string;
  req: Request;
  res: Response;
  isClosed: boolean;
  startedAt: number;
}

export class AudioTranscodeSession {
  public readonly sessionId: string;
  public readonly key: string;
  public readonly infoHash: string;
  public readonly fileIndex: number;
  public readonly sourceStreamUrl: string;
  public readonly audioCodec: string;
  public readonly audioTrackIndex: number;
  public readonly spoolFilePath: string;
  public startOffsetSeconds: number;
  public status: TranscodeSessionStatus = 'STARTING';
  public readonly createdAt: number = Date.now();
  public lastActivity: number = Date.now();
  public totalSize: number = 0;

  private process: ChildProcess | null = null;
  private lastPid?: number;
  private clients: Map<string, AttachedClient> = new Map();
  private lastStderr: string = '';
  private isDestroyed: boolean = false;

  constructor(options: AudioTranscodeOptions, spoolDir: string = DEFAULT_TRANSCODE_SPOOL_DIR) {
    this.infoHash = options.infoHash.toLowerCase().trim();
    this.fileIndex = options.fileIndex;
    this.audioTrackIndex = options.audioTrackIndex ?? 0;
    this.startOffsetSeconds = options.startOffsetSeconds ?? 0;
    this.key = `${this.infoHash}_${this.fileIndex}_${this.audioTrackIndex}_${Math.round(this.startOffsetSeconds)}`;
    this.sourceStreamUrl = options.sourceStreamUrl;
    this.audioCodec = options.audioCodec;
    this.sessionId = `ats_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

    // Build safe file name: never expose raw input or unvalidated strings
    const safeHash = this.infoHash.replace(/[^a-f0-9]/g, '').slice(0, 40) || 'unknown';
    const safeFileName = `transcode_${safeHash}_f${this.fileIndex}_t${this.audioTrackIndex}_s${Math.round(this.startOffsetSeconds)}.mp4`;
    this.spoolFilePath = path.join(spoolDir, safeFileName);

    console.log(`[AUDIO_TRANSCODE] session created (id: ${this.sessionId}, key: ${this.key}, codec: ${this.audioCodec})`);
    console.log(`[TRANSCODE_SPOOL] session created (id: ${this.sessionId}, file: ${this.spoolFilePath})`);
  }

  public get clientCount(): number {
    return this.clients.size;
  }

  public get pid(): number | undefined {
    return this.process?.pid || this.lastPid;
  }

  public getCurrentFileSize(): number {
    if (!fs.existsSync(this.spoolFilePath)) return 0;
    try {
      return fs.statSync(this.spoolFilePath).size;
    } catch (_e) {
      return 0;
    }
  }

  public get bytesTranscoded(): number {
    return this.getCurrentFileSize();
  }

  /**
   * Spawns FFmpeg for this session and writes fragmented MP4 directly to the spool file.
   * Invariant: -c:v copy (NEVER re-encode video!), -c:a aac (standard cross-browser AAC).
   */
  public async start(offsetSeconds: number = this.startOffsetSeconds): Promise<void> {
    if (this.isDestroyed) return;
    this.startOffsetSeconds = offsetSeconds;
    this.status = 'STARTING';

    const spoolDir = path.dirname(this.spoolFilePath);
    if (!fs.existsSync(spoolDir)) {
      fs.mkdirSync(spoolDir, { recursive: true });
    }

    if (fs.existsSync(this.spoolFilePath)) {
      try {
        fs.unlinkSync(this.spoolFilePath);
      } catch (_e) {}
    }

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
      // Fragmented MP4 for immediate progressive browser streaming & random range reads
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      '-y',
      this.spoolFilePath
    );

    try {
      const proc = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      this.process = proc;
      this.lastPid = proc.pid;
      this.status = 'RUNNING';

      console.log(`[AUDIO_TRANSCODE] ffmpeg started (pid: ${proc.pid}, offset: ${offsetSeconds}s, codec: ${this.audioCodec})`);
      console.log(`[WATCH_DIAG] FFmpeg process started: PID=${proc.pid}, inputCodec=${this.audioCodec}, output=aac/fmp4, offset=${offsetSeconds}s, sourceUrl=${this.sourceStreamUrl}`);
      console.log(`[TRANSCODE_SPOOL] ffmpeg started (pid: ${proc.pid}, file: ${this.spoolFilePath})`);

      proc.stderr.on('data', (errChunk: Buffer) => {
        const text = errChunk.toString().trim();
        if (text) {
          this.lastStderr = text.slice(-500);
          console.log(`[WATCH_DIAG] FFmpeg stderr (PID ${proc.pid}): ${text.slice(-200)}`);
        }
      });

      proc.on('error', (err: any) => {
        console.error(`[AUDIO_TRANSCODE] ffmpeg error (session: ${this.sessionId}):`, err.message);
        this.status = 'FAILED';
      });

      proc.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        this.process = null;

        if (code === 0) {
          this.status = 'COMPLETED';
          this.totalSize = this.getCurrentFileSize();
          console.log(`[TRANSCODE_SPOOL] ffmpeg completed (total: ${(this.totalSize / 1024 / 1024).toFixed(2)} MB, session: ${this.sessionId})`);
        } else if (this.status !== 'STOPPED' && this.status !== 'SEEKING') {
          this.status = 'FAILED';
          console.log(`[AUDIO_TRANSCODE] ffmpeg exited (code: ${code}, signal: ${signal}, session: ${this.sessionId})`);
        }
      });
    } catch (spawnError: any) {
      this.status = 'FAILED';
      console.error(`[AUDIO_TRANSCODE] Failed to spawn ffmpeg:`, spawnError.message);
      throw spawnError;
    }
  }

  /**
   * Polls until the spool file has at least minBytes (initial fMP4 headers), or timeout expires.
   */
  public async waitForMinBytes(minBytes: number = 1024, timeoutMs: number = 8000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.isDestroyed || this.status === 'FAILED' || this.status === 'STOPPED') {
        return false;
      }
      const currentSize = this.getCurrentFileSize();
      if (currentSize >= minBytes) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    return false;
  }

  /**
   * Polls until the spool file has at least targetBytes available, or timeout expires.
   * Useful when browser asks for a range that FFmpeg is currently generating.
   */
  public async waitForOffset(targetBytes: number, timeoutMs: number = 6000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.isDestroyed || this.status === 'FAILED' || this.status === 'STOPPED') {
        return false;
      }
      const currentSize = this.getCurrentFileSize();
      if (currentSize >= targetBytes) {
        return true;
      }
      if (this.status === 'COMPLETED') {
        return false; // stream finished, file will not grow any further
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    return false;
  }

  /**
   * Attaches an incoming HTTP response client with full HTTP 206 Range support reading from the spool file.
   */
  public async attachClient(req: Request, res: Response): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('Transcode session is already destroyed');
    }

    this.lastActivity = Date.now();

    // 1. Wait for initial bytes (ftyp+moov headers) to exist on disk
    const isReady = await this.waitForMinBytes(1024, 8000);
    if (!isReady && (this.status === 'FAILED' || this.isDestroyed)) {
      throw new Error('FFmpeg transcode process failed before producing initial data');
    }

    const clientId = `cl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const client: AttachedClient = {
      id: clientId,
      req,
      res,
      isClosed: false,
      startedAt: Date.now(),
    };

    this.clients.set(clientId, client);

    console.log(`[AUDIO_TRANSCODE] client attached (clientId: ${clientId}, total clients: ${this.clients.size})`);
    console.log(`[WATCH_DIAG] Transcode client attached: clientId=${clientId}, totalClients=${this.clients.size}, Range=${req.headers?.range || 'none'}`);

    const rangeHeader = req.headers?.range;
    let currentSize = this.getCurrentFileSize();

    let activeReadStream: fs.ReadStream | null = null;
    const cleanupClient = () => {
      if (activeReadStream) {
        try { activeReadStream.destroy(); } catch (_e) {}
      }
      if (this.clients.has(clientId)) {
        this.clients.delete(clientId);
        this.lastActivity = Date.now();
        console.log(`[AUDIO_TRANSCODE] client detached (clientId: ${clientId}, remaining clients: ${this.clients.size})`);
        console.log(`[WATCH_DIAG] Transcode client detached: clientId=${clientId}, remainingClients=${this.clients.size}`);
      }
    };

    if (typeof req.on === 'function') {
      req.on('close', cleanupClient);
    }
    if (typeof res.on === 'function') {
      res.on('finish', cleanupClient);
    }

    // -------------------------------------------------------------------------
    // CASE 1: No Range header (Full stream requested)
    // -------------------------------------------------------------------------
    if (!rangeHeader) {
      res.status(200);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Audio-Transcode', 'ffmpeg-aac');
      res.setHeader('X-Transcode-Session', this.sessionId);
      if (this.status === 'COMPLETED') {
        res.setHeader('Content-Length', this.totalSize || currentSize);
      }

      const readStream = fs.createReadStream(this.spoolFilePath);
      activeReadStream = readStream;
      readStream.on('data', (chunk: Buffer) => {
        try { res.write(chunk); } catch (_e) {}
      });
      readStream.on('end', () => {
        try { res.end(); } catch (_e) {}
      });
      readStream.on('error', (err) => {
        console.warn(`[TRANSCODE_SPOOL] read error: ${err.message}`);
        if (!res.headersSent && typeof res.status === 'function') {
          try { res.status(500).end(); } catch (_e) {}
        }
      });
      return;
    }

    // -------------------------------------------------------------------------
    // CASE 2: HTTP Range Request (e.g. Range: bytes=0-, Range: bytes=1277952-)
    // -------------------------------------------------------------------------
    const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
    if (!match) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${this.totalSize || currentSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.end();
      return;
    }

    const requestedStart = parseInt(match[1], 10);
    const requestedEnd = match[2] ? parseInt(match[2], 10) : undefined;

    console.log(`[TRANSCODE_SPOOL] range request: Range=${rangeHeader} from client ${clientId}`);

    // If requested offset is ahead of what FFmpeg has currently written:
    if (requestedStart >= currentSize) {
      if (this.status === 'COMPLETED') {
        // Stream is fully encoded and requested offset is out of bounds
        res.status(416);
        res.setHeader('Content-Range', `bytes */${this.totalSize || currentSize}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.end();
        return;
      }

      // FFmpeg is still actively encoding: wait/poll for requested bytes
      console.log(`[TRANSCODE_SPOOL] waiting for bytes: requested ${requestedStart}, current ${currentSize}`);
      const available = await this.waitForOffset(requestedStart + 1, 6000);
      currentSize = this.getCurrentFileSize();

      if (!available || requestedStart >= currentSize) {
        if ((this.status as TranscodeSessionStatus) === 'COMPLETED') {
          res.status(416);
          res.setHeader('Content-Range', `bytes */${this.totalSize || currentSize}`);
          res.setHeader('Accept-Ranges', 'bytes');
          res.end();
          return;
        }

        // Bounded window elapsed, still generating: 503 Retry-After for smooth client retry
        res.status(503);
        res.setHeader('Retry-After', '1');
        res.setHeader('Content-Type', 'application/json');
        res.json({
          error: 'Данные подготавливаются, повторите запрос',
          code: 'TRANSCODE_BYTE_PENDING',
          retryAfter: 1,
        });
        return;
      }
    }

    // Calculate effective end offset
    let effectiveEnd: number;
    if (requestedEnd !== undefined) {
      effectiveEnd = Math.min(requestedEnd, currentSize - 1);
    } else {
      effectiveEnd = currentSize - 1;
    }

    if (effectiveEnd < requestedStart) {
      effectiveEnd = requestedStart;
    }

    const contentLength = effectiveEnd - requestedStart + 1;

    // Send HTTP 206 Partial Content with accurate range headers
    res.status(206);
    if (this.status === 'COMPLETED') {
      res.setHeader('Content-Range', `bytes ${requestedStart}-${effectiveEnd}/${this.totalSize || currentSize}`);
    } else {
      res.setHeader('Content-Range', `bytes ${requestedStart}-${effectiveEnd}/*`);
    }
    res.setHeader('Content-Length', contentLength);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Audio-Transcode', 'ffmpeg-aac');
    res.setHeader('X-Transcode-Session', this.sessionId);

    console.log(`[TRANSCODE_SPOOL] range served: 206 bytes ${requestedStart}-${effectiveEnd}/${this.status === 'COMPLETED' ? (this.totalSize || currentSize) : '*'} (len: ${contentLength})`);

    const readStream = fs.createReadStream(this.spoolFilePath, {
      start: requestedStart,
      end: effectiveEnd,
    });
    activeReadStream = readStream;

    readStream.on('data', (chunk: Buffer) => {
      try { res.write(chunk); } catch (_e) {}
    });

    readStream.on('end', () => {
      try { res.end(); } catch (_e) {}
    });

    readStream.on('error', (err) => {
      console.warn(`[TRANSCODE_SPOOL] range read error: ${err.message}`);
      if (!res.headersSent && typeof res.status === 'function') {
        try { res.status(500).end(); } catch (_e) {}
      }
    });
  }

  /**
   * Repositions / seeks the session at a new temporal offset in seconds.
   */
  public async seek(offsetSeconds: number): Promise<void> {
    if (this.isDestroyed) return;
    this.status = 'SEEKING';
    console.log(`[AUDIO_TRANSCODE] seek requested (new offset: ${offsetSeconds}s, session: ${this.sessionId})`);

    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch (_e) {}
    }

    await this.start(offsetSeconds);
  }

  /**
   * Gracefully terminates the FFmpeg process, closes open client streams, and deletes the spool file.
   */
  public async destroy(): Promise<void> {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.status = 'STOPPED';

    console.log(`[AUDIO_TRANSCODE] cleanup (session: ${this.sessionId}, key: ${this.key})`);

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
        }, 1500);

        proc.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    this.process = null;

    // Delete the persistent temporary spool file from disk
    if (fs.existsSync(this.spoolFilePath)) {
      try {
        fs.unlinkSync(this.spoolFilePath);
        console.log(`[TRANSCODE_SPOOL] cleanup (file removed: ${this.spoolFilePath})`);
      } catch (err: any) {
        console.warn(`[TRANSCODE_SPOOL] cleanup error unlinking ${this.spoolFilePath}: ${err.message}`);
      }
    }
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
      bytesTranscoded: this.bytesTranscoded,
      filePath: this.spoolFilePath,
      totalSize: this.totalSize || this.getCurrentFileSize(),
      pid: this.process?.pid,
    };
  }
}

/**
 * AudioTranscodeManager: Central orchestrator for persistent spool transcoding.
 * Controls maximum concurrency, disk space ceilings, codec resolution cache, and session lifecycle.
 */
export class AudioTranscodeManager {
  private sessions: Map<string, AudioTranscodeSession> = new Map();
  private codecCache: Map<string, { codec: string; nativeSupport: boolean; checkedAt: number }> = new Map();
  private ffmpegAvailableCache: boolean | null = null;
  private ffmpegVersionCache: string | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Startup safety: clean up any stale temporary files from previous server runs
    this.cleanupStaleSpoolFiles();

    // Start background inactivity sweep every 15 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanInactiveSessions().catch(() => {});
    }, 15000);
    this.cleanupInterval.unref();
  }

  public get maxSessions(): number {
    const raw = process.env.WATCH_PARTY_MAX_AUDIO_TRANSCODE_SESSIONS?.trim();
    const val = raw ? parseInt(raw, 10) : 3;
    return isNaN(val) || val < 1 ? 3 : val;
  }

  public get maxSpoolDiskBytes(): number {
    const raw = process.env.WATCH_PARTY_MAX_SPOOL_DISK_MB?.trim();
    const mb = raw ? parseInt(raw, 10) : 15360; // 15 GB default
    return (isNaN(mb) || mb < 500 ? 15360 : mb) * 1024 * 1024;
  }

  public getSpoolDirectorySizeBytes(): number {
    if (!fs.existsSync(DEFAULT_TRANSCODE_SPOOL_DIR)) return 0;
    try {
      const files = fs.readdirSync(DEFAULT_TRANSCODE_SPOOL_DIR);
      let total = 0;
      for (const f of files) {
        try {
          const st = fs.statSync(path.join(DEFAULT_TRANSCODE_SPOOL_DIR, f));
          total += st.size;
        } catch (_e) {}
      }
      return total;
    } catch (_e) {
      return 0;
    }
  }

  private cleanupStaleSpoolFiles(): void {
    try {
      if (fs.existsSync(DEFAULT_TRANSCODE_SPOOL_DIR)) {
        const files = fs.readdirSync(DEFAULT_TRANSCODE_SPOOL_DIR);
        for (const file of files) {
          if (file.endsWith('.mp4')) {
            try {
              fs.unlinkSync(path.join(DEFAULT_TRANSCODE_SPOOL_DIR, file));
            } catch (_e) {}
          }
        }
      }
    } catch (_e) {}
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
   * Periodic garbage collection for sessions that finished or went idle.
   */
  public async cleanInactiveSessions(): Promise<void> {
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      if (session.status === 'STOPPED') {
        this.sessions.delete(key);
        continue;
      }

      if (session.clientCount === 0) {
        const inactiveMs = now - session.lastActivity;
        // Completed files kept for 60s of complete client inactivity before deletion
        if (session.status === 'COMPLETED' && inactiveMs > 60000) {
          console.log(`[TRANSCODE_SPOOL] cleanup completed session inactive for 60s: ${session.sessionId}`);
          await session.destroy();
          this.sessions.delete(key);
        }
        // Failed sessions cleaned after 15s
        else if ((session.status === 'FAILED' || session.status === 'ERROR') && inactiveMs > 15000) {
          await session.destroy();
          this.sessions.delete(key);
        }
        // Running sessions with no requests for 3 minutes (e.g. user closed tab)
        else if (session.status === 'RUNNING' && inactiveMs > 180000) {
          console.log(`[TRANSCODE_SPOOL] cleanup abandoned running session: ${session.sessionId}`);
          await session.destroy();
          this.sessions.delete(key);
        }
      }
    }
  }

  /**
   * Retrieves or establishes an audio transcode session.
   * If a session already exists for this (infoHash, fileIndex, trackIndex, offset), reuses it.
   */
  public async getOrCreateSession(options: AudioTranscodeOptions): Promise<AudioTranscodeSession> {
    const safeHash = options.infoHash.toLowerCase().trim();
    const trackIndex = options.audioTrackIndex ?? 0;
    const startSec = Math.round(options.startOffsetSeconds ?? 0);
    const key = `${safeHash}_${options.fileIndex}_${trackIndex}_${startSec}`;

    // Clean up dead sessions first
    const existing = this.sessions.get(key);
    if (existing && existing.status !== 'STOPPED' && existing.status !== 'FAILED') {
      // If client requests a temporal seek > 5s on an active session
      if (
        typeof options.startOffsetSeconds === 'number' &&
        Math.abs(options.startOffsetSeconds - existing.startOffsetSeconds) > 5
      ) {
        await existing.seek(options.startOffsetSeconds);
      }
      return existing;
    }

    // 1. Check disk capacity limit
    const currentDiskUsage = this.getSpoolDirectorySizeBytes();
    if (currentDiskUsage >= this.maxSpoolDiskBytes) {
      console.warn(`[TRANSCODE_SPOOL] Disk capacity reached: ${(currentDiskUsage / 1024 / 1024).toFixed(1)}MB / ${(this.maxSpoolDiskBytes / 1024 / 1024).toFixed(1)}MB`);
      const err: any = new Error(`Превышен лимит дискового пространства для транскодирования аудио (${Math.round(currentDiskUsage / 1024 / 1024)}MB)`);
      err.code = 'AUDIO_TRANSCODING_CAPACITY';
      err.statusCode = 503;
      throw err;
    }

    // 2. Check concurrency limit
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
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    const sessions = Array.from(this.sessions.values());
    await Promise.all(sessions.map((s) => s.destroy()));
    this.sessions.clear();
    this.cleanupStaleSpoolFiles();
  }
}

export const audioTranscodeManager = new AudioTranscodeManager();
