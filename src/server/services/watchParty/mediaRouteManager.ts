/**
 * MediaRouteManager & MediaRouteSession
 *
 * Stage 10.21: Stable Media Routing Layer for Watch Party.
 *
 * Invariants:
 * 1. ONE SOURCE -> ONE MEDIA ROUTE: For any specific media source (infoHash + fileIndex),
 *    the routing decision (DIRECT_STREAM vs AAC_TRANSCODE) is decided ONCE and remains
 *    strictly IMMUTABLE throughout the lifetime of the session.
 * 2. NO SILENT FALLBACK ON PROBE TIMEOUT: If media diagnostic (ffprobe) is still in progress,
 *    incoming stream requests receive HTTP 503 MEDIA_DIAGNOSTIC_PENDING with Retry-After: 1.
 *    The server NEVER silently falls back to DIRECT_STREAM while codec is undetermined.
 * 3. NO ROUTE SWITCHING: A source that began as DIRECT_STREAM can NEVER switch to AAC_TRANSCODE,
 *    and a source that began as AAC_TRANSCODE can NEVER switch to DIRECT_STREAM.
 * 4. BYTE RANGE ISOLATION: Range requests for DIRECT_STREAM are served against TorrServer source;
 *    Range requests for AAC_TRANSCODE are served strictly against the transcoded spool file.
 * 5. SINGLE IN-FLIGHT PROBE: Multiple concurrent requests for the same source share a single
 *    probe execution promise without redundant diagnostic spawning.
 * 6. LEAK-SAFE LIFECYCLE: Automatic inactivity cleanup of idle route sessions and associated
 *    transcode spools.
 */

export type MediaRoute = 'PROBING' | 'DIRECT' | 'TRANSCODE' | 'FAILED';

export interface MediaRouteSession {
  key: string;
  infoHash: string;
  fileIndex: number;
  route: MediaRoute;
  codec?: string;
  browserNativeAudio?: boolean;
  createdAt: number;
  lastAccess: number;
  probePromise?: Promise<{ route: 'DIRECT' | 'TRANSCODE' | 'FAILED'; codec: string }>;
}

export interface RouteResolution {
  status: 'READY' | 'PENDING' | 'FAILED';
  route?: 'DIRECT' | 'TRANSCODE' | 'FAILED';
  codec?: string;
  code?: string;
  retryAfter?: number;
}

export interface ResolveRouteOptions {
  forceDirect?: boolean;
  waitTimeoutMs?: number;
}

export class MediaRouteManager {
  private sessions: Map<string, MediaRouteSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Background garbage collection every 30 seconds for idle route sessions
    this.cleanupInterval = setInterval(() => {
      this.cleanInactiveRoutes(15 * 60 * 1000);
    }, 30000);
    this.cleanupInterval.unref();
  }

  public get canonicalKey(): (infoHash: string, fileIndex: number) => string {
    return (infoHash: string, fileIndex: number) =>
      `${infoHash.toLowerCase().trim()}_${fileIndex}`;
  }

  private mask(infoHash: string): string {
    return `${infoHash.toLowerCase().trim().slice(0, 8)}...`;
  }

  public getSession(infoHash: string, fileIndex: number): MediaRouteSession | undefined {
    return this.sessions.get(this.canonicalKey(infoHash, fileIndex));
  }

  public getActiveSessionsCount(): number {
    return this.sessions.size;
  }

  /**
   * Sets or locks a route explicitly.
   * Throws an error if an attempt is made to switch an already established route (DIRECT <-> TRANSCODE).
   */
  public setRoute(
    infoHash: string,
    fileIndex: number,
    route: 'DIRECT' | 'TRANSCODE',
    codec?: string
  ): void {
    const key = this.canonicalKey(infoHash, fileIndex);
    const existing = this.sessions.get(key);

    if (
      existing &&
      (existing.route === 'DIRECT' || existing.route === 'TRANSCODE') &&
      existing.route !== route
    ) {
      console.warn(
        `[MEDIA_ROUTE] route transition rejected from=${existing.route === 'TRANSCODE' ? 'AAC_TRANSCODE' : 'DIRECT_STREAM'} to=${route === 'TRANSCODE' ? 'AAC_TRANSCODE' : 'DIRECT_STREAM'} key=${key}`
      );
      throw new Error(
        `[MEDIA_ROUTE] Forbidden route switch: cannot change route from ${existing.route} to ${route} for source ${key}`
      );
    }

    if (existing) {
      existing.route = route;
      existing.lastAccess = Date.now();
      if (codec) existing.codec = codec;
      console.log(`[MEDIA_ROUTE] route locked route=${route === 'TRANSCODE' ? 'AAC_TRANSCODE' : 'DIRECT_STREAM'} key=${key}`);
    } else {
      this.sessions.set(key, {
        key,
        infoHash: infoHash.toLowerCase().trim(),
        fileIndex,
        route,
        codec,
        createdAt: Date.now(),
        lastAccess: Date.now(),
      });
      console.log(`[MEDIA_ROUTE] session created key=${key}`);
      console.log(`[MEDIA_ROUTE] route locked route=${route === 'TRANSCODE' ? 'AAC_TRANSCODE' : 'DIRECT_STREAM'} key=${key}`);
    }
  }

  /**
   * Resolves the stable media route for a given torrent file stream.
   * If a route was already determined, reuses it immediately with ZERO ffprobe overhead.
   * If probing is in progress, waits up to waitTimeoutMs. If still pending, returns PENDING.
   */
  public async resolveRoute(
    infoHash: string,
    fileIndex: number,
    targetStreamUrl: string,
    options: ResolveRouteOptions = {}
  ): Promise<RouteResolution> {
    const key = this.canonicalKey(infoHash, fileIndex);
    const masked = this.mask(infoHash);
    const waitTimeoutMs = options.waitTimeoutMs ?? 4500;

    // Manual override if explicitly requested by query (?direct=1)
    if (options.forceDirect) {
      return { status: 'READY', route: 'DIRECT', codec: 'forced_direct' };
    }

    // 1. Check existing session
    let session = this.sessions.get(key);

    if (session) {
      session.lastAccess = Date.now();

      // If route is already locked: IMMUTABLE REUSE
      if (session.route === 'DIRECT') {
        console.log(`[MEDIA_ROUTE] route reuse route=DIRECT_STREAM key=${key}`);
        return { status: 'READY', route: 'DIRECT', codec: session.codec || 'unknown' };
      }

      if (session.route === 'TRANSCODE') {
        console.log(`[MEDIA_ROUTE] route reuse route=AAC_TRANSCODE key=${key}`);
        return { status: 'READY', route: 'TRANSCODE', codec: session.codec || 'ac3' };
      }

      // If currently PROBING: await existing in-flight probe promise with bounded wait
      if (session.route === 'PROBING' && session.probePromise) {
        console.log(`[MEDIA_ROUTE] state PROBING key=${key} (awaiting existing probe)`);
        await Promise.race([
          session.probePromise.catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, waitTimeoutMs)),
        ]);

        const currentRoute = session.route as MediaRoute;
        if (currentRoute === 'DIRECT' || currentRoute === 'TRANSCODE') {
          return { status: 'READY', route: currentRoute, codec: session.codec };
        }

        console.log(`[MEDIA_ROUTE] state PROBING key=${key}`);
        return {
          status: 'PENDING',
          code: 'MEDIA_DIAGNOSTIC_PENDING',
          retryAfter: 1,
        };
      }
    }

    // 2. No session exists: establish new PROBING session
    session = {
      key,
      infoHash: infoHash.toLowerCase().trim(),
      fileIndex,
      route: 'PROBING',
      createdAt: Date.now(),
      lastAccess: Date.now(),
    };
    this.sessions.set(key, session);
    console.log(`[MEDIA_ROUTE] session created key=${key}`);
    console.log(`[MEDIA_ROUTE] state PROBING key=${key}`);

    // Launch single in-flight probe promise
    session.probePromise = (async () => {
      try {
        const { mediaDiagnosticService } = await import('../torrentSearch/mediaDiagnosticService.ts');
        const probeReport = await mediaDiagnosticService.probeMedia(targetStreamUrl, 5000);
        const primaryAudio = probeReport.audio;
        const codec = primaryAudio?.codec || 'none';
        const nativeSupport = primaryAudio ? primaryAudio.browserNativeSupport === 'NATIVE' : true;

        session!.codec = codec;
        session!.browserNativeAudio = nativeSupport;

        if (!nativeSupport && codec !== 'none') {
          session!.route = 'TRANSCODE';
          console.log(`[MEDIA_ROUTE] probe success codec=${codec} key=${key}`);
          console.log(`[MEDIA_ROUTE] route locked route=AAC_TRANSCODE key=${key}`);
          return { route: 'TRANSCODE' as const, codec };
        } else {
          session!.route = 'DIRECT';
          console.log(`[MEDIA_ROUTE] probe success codec=${codec} key=${key}`);
          console.log(`[MEDIA_ROUTE] route locked route=DIRECT_STREAM key=${key}`);
          return { route: 'DIRECT' as const, codec };
        }
      } catch (err: any) {
        console.warn(`[MEDIA_ROUTE] source=${masked} probe=ERROR (${err.message})`);
        session!.probePromise = undefined;
        return { route: 'FAILED' as const, codec: 'unknown' };
      }
    })();

    // Bounded wait for initial probe completion
    await Promise.race([
      session.probePromise?.catch(() => {}) || Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, waitTimeoutMs)),
    ]);

    const initialRoute = session.route as MediaRoute;
    if (initialRoute === 'DIRECT' || initialRoute === 'TRANSCODE') {
      return { status: 'READY', route: initialRoute, codec: session.codec };
    }

    // Still pending or error during probe: return 503 MEDIA_DIAGNOSTIC_PENDING so client retries
    console.log(`[MEDIA_ROUTE] state PROBING key=${key}`);
    return {
      status: 'PENDING',
      code: 'MEDIA_DIAGNOSTIC_PENDING',
      retryAfter: 1,
    };
  }

  /**
   * Cleans inactive route sessions that have had no Range requests for maxIdleMs.
   */
  public cleanInactiveRoutes(maxIdleMs: number = 15 * 60 * 1000): void {
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastAccess > maxIdleMs) {
        this.sessions.delete(key);
        console.log(`[MEDIA_ROUTE] cleanup idle route session: ${key}`);
      }
    }
  }

  /**
   * Resets / deletes a route session (e.g. when room closes or source is explicitly discarded).
   */
  public removeSession(infoHash: string, fileIndex: number): void {
    const key = this.canonicalKey(infoHash, fileIndex);
    this.sessions.delete(key);
  }

  public shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
  }
}

export const mediaRouteManager = new MediaRouteManager();
