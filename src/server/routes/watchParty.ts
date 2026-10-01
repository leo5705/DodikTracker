/**
 * Watch Party REST API Routes
 * Endpoints for room lifecycle management, access control, and membership.
 */

import { Router, Response } from 'express';
import { requireAuth, optionalAuth, AuthRequest } from '../../middleware/auth.ts';
import { watchPartyService } from '../services/watchParty/watchPartyService.ts';
import rateLimit from 'express-rate-limit';

import { torrentSearchService } from '../services/torrentSearch/torrentSearchService.ts';
import { torrentSessionManager } from '../services/torrentSearch/torrentSessionManager.ts';
import { torrentCache } from '../services/torrentSearch/torrentCache.ts';
import { torrServerClient } from '../services/torrentSearch/torrServerClient.ts';
import { watchPartyWsServer } from '../services/watchParty/wsServer.ts';

export const watchPartyRouter = Router();

// Rate limiting for room creation to prevent spam
const createRoomLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Слишком много созданных комнат, попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for join attempts (protects private passcodes from brute-force)
const joinRoomLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Слишком много попыток входа, попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 1. POST /api/watch-party/rooms
 * Creates a new Watch Party room.
 */
watchPartyRouter.post('/rooms', requireAuth, createRoomLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    const {
      title,
      mediaId,
      mediaType,
      seasonNumber,
      episodeNumber,
      sourceType,
      sourceUrl,
      sourceConfig,
      source,
      mediaMetadata,
      privacy,
      passcode,
      initialDuration,
    } = req.body;

    const resolvedSourceConfig = sourceConfig || source || undefined;
    const resolvedSourceType = sourceType || resolvedSourceConfig?.type || (mediaId ? 'TORRENT' : 'DIRECT');
    const resolvedSourceUrl = sourceUrl || resolvedSourceConfig?.url || resolvedSourceConfig?.magnetUri || null;

    const room = await watchPartyService.createRoom(userId, {
      title,
      mediaId: mediaId ? Number(mediaId) : null,
      mediaType,
      seasonNumber: seasonNumber !== undefined && seasonNumber !== null ? Number(seasonNumber) : null,
      episodeNumber: episodeNumber !== undefined && episodeNumber !== null ? Number(episodeNumber) : null,
      sourceType: resolvedSourceType,
      sourceUrl: resolvedSourceUrl,
      sourceConfig: resolvedSourceConfig,
      mediaMetadata,
      privacy,
      passcode,
      initialDuration: initialDuration ? Number(initialDuration) : undefined,
    });

    return res.status(201).json({
      ...room,
      room,
      code: room.code,
    });
  } catch (error: any) {
    const status = error.message.includes('обязательн') || error.message.includes('минимум') ? 422 : 400;
    return res.status(status).json({ error: error.message || 'Ошибка создания комнаты' });
  }
});

/**
 * 2. GET /api/watch-party/rooms/:code
 * Retrieves room details and current playback state.
 */
watchPartyRouter.get('/rooms/:code', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code;
    const userId = req.dbUser?.id;

    const room = await watchPartyService.getRoom(code, userId);
    return res.json(room);
  } catch (error: any) {
    const status = error.message.includes('не найдена') ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Ошибка получения комнаты' });
  }
});

/**
 * 3. POST /api/watch-party/rooms/:code/join
 * Joins an active room (with passcode validation for private rooms).
 */
watchPartyRouter.post('/rooms/:code/join', requireAuth, joinRoomLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code;
    const userId = req.dbUser!.id;
    const { passcode } = req.body || {};

    const result = await watchPartyService.joinRoom(code, userId, passcode);
    return res.json(result);
  } catch (error: any) {
    let status = 400;
    if (error.message.includes('не найдена')) status = 404;
    else if (error.message.includes('заблокированы') || error.message.includes('Неверный пароль')) status = 403;
    else if (error.message.includes('закрыта')) status = 409;
    return res.status(status).json({ error: error.message || 'Ошибка входа в комнату' });
  }
});

/**
 * 4. POST /api/watch-party/rooms/:code/leave
 * Leaves the room. Handles host succession if host leaves.
 */
watchPartyRouter.post('/rooms/:code/leave', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code;
    const userId = req.dbUser!.id;

    const result = await watchPartyService.leaveRoom(code, userId);
    return res.json(result);
  } catch (error: any) {
    const status = error.message.includes('не найдена') ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Ошибка выхода из комнаты' });
  }
});

/**
 * 5. GET /api/watch-party/rooms/:code/members
 * Lists room members.
 */
watchPartyRouter.get('/rooms/:code/members', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code;
    const userId = req.dbUser?.id;

    const members = await watchPartyService.getMembers(code, userId);
    return res.json(members);
  } catch (error: any) {
    const status = error.message.includes('не найдена') ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Ошибка получения участников' });
  }
});

/**
 * 6. POST /api/watch-party/rooms/:code/host
 * Transfers HOST role to another active member.
 */
watchPartyRouter.post('/rooms/:code/host', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code;
    const currentHostUserId = req.dbUser!.id;
    const { userId: targetUserId } = req.body;

    if (!targetUserId || isNaN(Number(targetUserId))) {
      return res.status(422).json({ error: 'Не указан целевой пользователь для передачи роли HOST' });
    }

    const updatedRoom = await watchPartyService.transferHost(code, currentHostUserId, Number(targetUserId));
    return res.json(updatedRoom);
  } catch (error: any) {
    let status = 400;
    if (error.message.includes('не найдена')) status = 404;
    else if (error.message.includes('Только текущий HOST')) status = 403;
    return res.status(status).json({ error: error.message || 'Ошибка передачи роли HOST' });
  }
});

/**
 * 7. POST /api/watch-party/rooms/:code/kick
 * Kicks or bans an active member from the room (HOST only).
 */
watchPartyRouter.post('/rooms/:code/kick', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code;
    const hostUserId = req.dbUser!.id;
    const { userId: targetUserId, ban } = req.body;

    if (!targetUserId || isNaN(Number(targetUserId))) {
      return res.status(422).json({ error: 'Не указан пользователь для исключения' });
    }

    await watchPartyService.kickMember(code, hostUserId, Number(targetUserId), Boolean(ban));
    return res.json({ success: true, kickedUserId: Number(targetUserId), isBanned: Boolean(ban) });
  } catch (error: any) {
    let status = 400;
    if (error.message.includes('не найдена') || error.message.includes('не найден')) status = 404;
    else if (error.message.includes('Только HOST')) status = 403;
    return res.status(status).json({ error: error.message || 'Ошибка исключения участника' });
  }
});

/**
 * 8. DELETE /api/watch-party/rooms/:code
 * Closes the room (HOST only).
 */
watchPartyRouter.delete('/rooms/:code', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code;
    const hostUserId = req.dbUser!.id;

    const closedRoom = await watchPartyService.closeRoom(code, hostUserId);
    return res.json({ success: true, room: closedRoom });
  } catch (error: any) {
    let status = 400;
    if (error.message.includes('не найдена')) status = 404;
    else if (error.message.includes('Только HOST')) status = 403;
    return res.status(status).json({ error: error.message || 'Ошибка закрытия комнаты' });
  }
});

/**
 * 8.5. PATCH /api/watch-party/rooms/:code/source
 * Updates room media source (HOST only).
 */
watchPartyRouter.patch('/rooms/:code/source', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code;
    const hostUserId = req.dbUser!.id;
    const { source, mediaId, seasonNumber, episodeNumber } = req.body || {};

    if (!source || !source.type) {
      return res.status(400).json({ error: 'Не указана конфигурация источника' });
    }

    const updatedRoom = await watchPartyService.changeSource(
      code,
      hostUserId,
      source,
      mediaId !== undefined ? mediaId : null,
      seasonNumber !== undefined ? seasonNumber : null,
      episodeNumber !== undefined ? episodeNumber : null
    );

    // Broadcast SOURCE_CHANGED via wsServer
    watchPartyWsServer.broadcastToRoom(code, {
      type: 'SOURCE_CHANGED',
      source,
      mediaId: mediaId ?? updatedRoom.mediaId,
      seasonNumber: seasonNumber ?? updatedRoom.seasonNumber,
      episodeNumber: episodeNumber ?? updatedRoom.episodeNumber,
      updatedByUserId: hostUserId,
    });

    return res.json({ success: true, room: updatedRoom });
  } catch (error: any) {
    let status = 400;
    if (error.message.includes('не найдена')) status = 404;
    else if (error.message.includes('Только HOST')) status = 403;
    return res.status(status).json({ error: error.message || 'Ошибка обновления источника' });
  }
});

/**
 * 9. GET /api/watch-party/rooms/:code/messages
 * Retrieves paginated room chat history.
 */
watchPartyRouter.get('/rooms/:code/messages', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code;
    const userId = req.dbUser!.id;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const result = await watchPartyService.getRoomMessages(code, userId, { limit, offset });
    return res.json(result);
  } catch (error: any) {
    const status = error.message.includes('не найдена') ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Ошибка загрузки сообщений' });
  }
});

/**
 * 9.5. GET /api/watch-party/availability/:mediaId
 * Lightweight cached check for movie/episode playback availability.
 */
watchPartyRouter.get('/availability/:mediaId', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const mediaId = Number(req.params.mediaId);
    if (!mediaId || isNaN(mediaId)) {
      return res.status(400).json({ error: 'Некорректный mediaId' });
    }

    const seasonNum = req.query.season !== undefined ? Number(req.query.season) : req.query.seasonNumber !== undefined ? Number(req.query.seasonNumber) : undefined;
    const episodeNum = req.query.episode !== undefined ? Number(req.query.episode) : req.query.episodeNumber !== undefined ? Number(req.query.episodeNumber) : undefined;
    const forceCheck = req.query.check === 'true' || req.query.refresh === 'true';

    // 1. Normalize query
    const query = await torrentSearchService.normalizeQueryFromMediaId(mediaId, seasonNum, episodeNum);
    if (!query) {
      return res.json({
        available: false,
        status: 'WATCH_UNAVAILABLE',
        totalSources: 0,
        mediaId,
        seasonNumber: seasonNum,
        episodeNumber: episodeNum,
      });
    }

    // 2. Check cache first to avoid indexer spam
    let searchResult = torrentCache.get(query);
    let wasCached = true;

    if (!searchResult && forceCheck) {
      searchResult = await torrentSearchService.search(query);
      wasCached = false;
    }

    if (!searchResult) {
      return res.json({
        available: null,
        status: 'WATCH_CHECKING',
        totalSources: 0,
        mediaId,
        seasonNumber: seasonNum,
        episodeNumber: episodeNum,
        cached: false,
      });
    }

    const hasPlayable = searchResult.candidates && searchResult.candidates.length > 0;
    return res.json({
      available: hasPlayable,
      status: hasPlayable ? 'WATCH_AVAILABLE' : 'WATCH_UNAVAILABLE',
      totalSources: searchResult.candidates?.length || 0,
      bestQuality: searchResult.bestCandidate?.quality?.resolution || null,
      mediaId,
      seasonNumber: seasonNum,
      episodeNumber: episodeNum,
      cached: wasCached,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Ошибка проверки доступности' });
  }
});

/**
 * 10. POST /api/watch-party/torrents/discover
 * Automatically discovers ranked torrent candidates for a media item.
 */
watchPartyRouter.post('/torrents/discover', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { mediaId, title, originalTitle, year, seasonNumber, episodeNumber, mediaType, verify } = req.body || {};
    const shouldVerify = verify === true || req.query.verify === 'true';

    console.log('[WatchSources] discovery requested');
    console.log(`[WatchSources] mediaId=${mediaId ?? 'none'}, mediaType=${mediaType ?? 'none'}, season=${seasonNumber ?? 'none'}, episode=${episodeNumber ?? 'none'}`);

    let result: any = null;

    if (mediaId && !isNaN(Number(mediaId))) {
      result = await torrentSearchService.searchByMediaId(
        Number(mediaId),
        seasonNumber !== undefined ? Number(seasonNumber) : undefined,
        episodeNumber !== undefined ? Number(episodeNumber) : undefined,
        shouldVerify
      );

      // If database lookup failed to find metadata, but client supplied title, fallback to searching by title
      if ((result.status === 'INVALID_MEDIA_METADATA' || result.status === 'METADATA_INCOMPLETE') && title && String(title).trim()) {
        console.log(`[WatchSources] Falling back to search by title: "${title}"`);
        result = await torrentSearchService.search(
          {
            title: String(title).trim(),
            originalTitle: originalTitle ? String(originalTitle).trim() : undefined,
            mediaType: mediaType || 'movie',
            year: year ? Number(year) : undefined,
            seasonNumber: seasonNumber !== undefined ? Number(seasonNumber) : undefined,
            episodeNumber: episodeNumber !== undefined ? Number(episodeNumber) : undefined,
          },
          shouldVerify
        );
      }
    } else if (title && String(title).trim()) {
      result = await torrentSearchService.search(
        {
          title: String(title).trim(),
          originalTitle: originalTitle ? String(originalTitle).trim() : undefined,
          mediaType: mediaType || 'movie',
          year: year ? Number(year) : undefined,
          seasonNumber: seasonNumber !== undefined ? Number(seasonNumber) : undefined,
          episodeNumber: episodeNumber !== undefined ? Number(episodeNumber) : undefined,
        },
        shouldVerify
      );
    } else {
      return res.status(422).json({
        available: false,
        status: 'INVALID_MEDIA_METADATA',
        reason: 'INVALID_MEDIA_METADATA',
        error: 'Не указан mediaId или название произведения',
        candidates: [],
        totalFound: 0,
      });
    }

    const candList = result.candidates || [];
    return res.json({
      ...result,
      available: candList.length > 0,
      reason: result.reason || result.status || (candList.length > 0 ? 'SUCCESS' : 'NO_RESULTS'),
      candidates: candList,
    });
  } catch (error: any) {
    console.error('[WatchSources] Discovery route error:', error?.message || error);
    return res.status(500).json({
      available: false,
      status: 'ERROR',
      reason: 'ERROR',
      error: error.message || 'Ошибка автоматического поиска торрентов',
      candidates: [],
      totalFound: 0,
    });
  }
});

/**
 * 11. POST /api/watch-party/rooms/:code/auto-torrent
 * HOST triggers async auto-discovery and applies the best candidate torrent source.
 */
watchPartyRouter.post('/rooms/:code/auto-torrent', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code;
    const hostUserId = req.dbUser!.id;

    const room = await watchPartyService.getRoom(code, hostUserId);
    if (room.hostUserId !== hostUserId) {
      return res.status(403).json({ error: 'Только HOST комнаты может автоматически изменять источник' });
    }

    if (!room.mediaId) {
      return res.status(400).json({ error: 'К этой комнате не привязано медиапроизведение для автопоиска' });
    }

    const triggerResult = await torrentSessionManager.triggerAutoTorrent(
      code,
      hostUserId,
      room.mediaId,
      room.seasonNumber,
      room.episodeNumber
    );

    return res.json({
      success: true,
      message: triggerResult.isNew ? 'Поиск торрент-источника запущен в фоновом режиме' : 'Поиск торрент-источника уже выполняется',
      session: triggerResult.session,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Ошибка автонастройки торрента' });
  }
});

/**
 * 12. GET /api/watch-party/rooms/:code/torrent-state
 * Retrieves the current in-memory torrent discovery & preparation session.
 */
watchPartyRouter.get('/rooms/:code/torrent-state', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code;
    const userId = req.dbUser!.id;

    // Verify membership / existence of the room
    await watchPartyService.getRoom(code, userId);

    const session = torrentSessionManager.getSession(code);
    return res.json({
      success: true,
      session: session || null,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Ошибка получения состояния торрента' });
  }
});

/**
 * 13. POST /api/watch-party/rooms/:code/cancel-torrent
 * HOST stops / cancels any active torrent discovery session.
 */
watchPartyRouter.post('/rooms/:code/cancel-torrent', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code;
    const hostUserId = req.dbUser!.id;

    const room = await watchPartyService.getRoom(code, hostUserId);
    if (room.hostUserId !== hostUserId) {
      return res.status(403).json({ error: 'Только HOST комнаты может остановить поиск торрента' });
    }

    await torrentSessionManager.cancelSession(code);

    return res.json({
      success: true,
      message: 'Сессия поиска торрента успешно остановлена',
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Ошибка остановки поиска торрента' });
  }
});

/**
 * 14. GET /api/watch-party/rooms/:code/torrent-stream
 * Secure, authenticated streaming proxy that forwards requests to internal TorrServer without credentials leakage.
 */
/**
 * Helper to infer media MIME type from file name / extension
 */
function inferMediaMimeType(fileName?: string, defaultType: string = 'video/mp4'): string {
  if (!fileName) return defaultType;
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    case 'mov':
      return 'video/quicktime';
    case 'ts':
      return 'video/mp2t';
    case 'flv':
      return 'video/x-flv';
    case 'mp3':
      return 'audio/mpeg';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    case 'ogg':
      return 'audio/ogg';
    default:
      return defaultType;
  }
}

/**
 * Helper function to safely stream TorrServer video content with readiness polling and Range support
 */
async function proxyTorrServerStream(
  req: AuthRequest,
  res: Response,
  hashStr: string,
  requestedFileIndex: number
): Promise<void> {
  const torrServerUrl = torrServerClient.baseUrl;
  let targetIndex = requestedFileIndex;
  let targetStreamUrl = `${torrServerUrl}/stream?link=${encodeURIComponent(hashStr)}&index=${targetIndex}&play=1`;
  let resolvedFileName: string | undefined;

  const controller = new AbortController();
  req.on('close', () => {
    controller.abort();
  });

  const headers: Record<string, string> = {};
  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }

  let torrRes: globalThis.Response | null = null;
  try {
    torrRes = await fetch(targetStreamUrl, {
      headers,
      signal: controller.signal,
    });
  } catch (_e) {
    torrRes = null;
  }

  const contentType = torrRes ? torrRes.headers.get('content-type') || '' : '';
  const isMediaStream =
    torrRes &&
    (torrRes.status === 200 || torrRes.status === 206) &&
    !contentType.includes('text/html') &&
    !contentType.includes('application/json');

  if (!isMediaStream) {
    // Check if TorrServer is alive
    const health = await torrServerClient.healthCheck();
    if (!health.isAvailable) {
      if (!res.headersSent) {
        res.status(503).json({
          error: 'Видео-сервер временно недоступен',
          code: 'TORRSERVER_UNAVAILABLE',
        });
      }
      return;
    }

    // Torrent may still be registering or fetching metadata from swarm
    const readyResult = await torrServerClient.waitForTorrentReady(hashStr, undefined, {
      timeoutMs: 10000,
      pollIntervalMs: 350,
    });

    if (readyResult.ready) {
      // If requested file index is not valid or was generic fallback 0, resolve to best video file index
      if (readyResult.files && readyResult.files.length > 0) {
        const hasRequested = readyResult.files.some((f) => f.index === requestedFileIndex && f.sizeBytes > 10 * 1024 * 1024);
        if (!hasRequested && typeof readyResult.bestFileIndex === 'number') {
          targetIndex = readyResult.bestFileIndex;
        }
        const matched = readyResult.files.find((f) => f.index === targetIndex);
        resolvedFileName = matched?.name || matched?.path || readyResult.bestFileName;
      }

      targetStreamUrl = `${torrServerUrl}/stream?link=${encodeURIComponent(hashStr)}&index=${targetIndex}&play=1`;

      try {
        torrRes = await fetch(targetStreamUrl, {
          headers,
          signal: controller.signal,
        });
      } catch (_e) {
        torrRes = null;
      }
    } else {
      if (!res.headersSent) {
        res.status(503).setHeader('Retry-After', '2').json({
          error: 'Торрент подготавливается к воспроизведению. Пожалуйста, подождите...',
          code: 'TORRENT_NOT_READY',
          retryAfter: 2,
        });
      }
      return;
    }
  }

  if (!torrRes || (!torrRes.ok && torrRes.status !== 206)) {
    if (!res.headersSent) {
      res.status(503).setHeader('Retry-After', '2').json({
        error: 'Торрент подготавливается к воспроизведению. Пожалуйста, подождите...',
        code: 'TORRENT_NOT_READY',
        retryAfter: 2,
      });
    }
    return;
  }

  const rawContentType = torrRes.headers.get('content-type') || '';
  if (rawContentType.includes('text/html') || rawContentType.includes('application/json')) {
    if (!res.headersSent) {
      res.status(503).setHeader('Retry-After', '2').json({
        error: 'Торрент подготавливается к воспроизведению. Пожалуйста, подождите...',
        code: 'TORRENT_NOT_READY',
        retryAfter: 2,
      });
    }
    return;
  }

  res.status(torrRes.status);

  // Content-Type normalization for audio/video browser pipelines
  let finalContentType = rawContentType;
  if (!finalContentType || finalContentType === 'application/octet-stream' || finalContentType === 'binary/octet-stream') {
    finalContentType = inferMediaMimeType(resolvedFileName, 'video/mp4');
  }
  res.setHeader('Content-Type', finalContentType);

  const contentLength = torrRes.headers.get('content-length');
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }

  const contentRange = torrRes.headers.get('content-range');
  if (contentRange) {
    res.setHeader('Content-Range', contentRange);
  }

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (!torrRes.body) {
    res.end();
    return;
  }

  const reader = torrRes.body.getReader();
  const pushStream = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (!res.writableEnded) res.end();
          break;
        }
        const canWrite = res.write(value);
        if (!canWrite) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
    } catch (_err) {
      try {
        await reader.cancel();
      } catch (_c) {}
      if (!res.writableEnded) res.end();
    }
  };

  pushStream();
}

/**
 * 14. GET /api/watch-party/rooms/:code/torrent-stream
 * Secure, authenticated streaming proxy that forwards requests to internal TorrServer without credentials leakage.
 */
watchPartyRouter.get('/rooms/:code/torrent-stream', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { hash, index } = req.query;

    if (!hash || index === undefined) {
      return res.status(400).json({ error: 'Не указаны hash торрента или index файла' });
    }

    const hashStr = String(hash).trim();
    if (!/^[0-9a-fA-F]{40}$/.test(hashStr) && !/^[2-7a-zA-Z]{32}$/.test(hashStr)) {
      return res.status(400).json({ error: 'Некорректный формат хэша торрента' });
    }

    const fileIndex = Number(index);
    if (isNaN(fileIndex) || fileIndex < 0 || fileIndex > 99999) {
      return res.status(400).json({ error: 'Некорректный индекс файла' });
    }

    await proxyTorrServerStream(req, res, hashStr, fileIndex);
  } catch (error: any) {
    if (error.name === 'AbortError') return;
    console.error('[TORRENT-PROXY] Room stream proxy error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Критическая ошибка трансляции видеопотока' });
    }
  }
});

/**
 * 15. GET /api/watch-party/torrents/stream
 * General streaming proxy by infoHash and index for TorrServer streams.
 */
watchPartyRouter.get('/torrents/stream', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { hash, index } = req.query;

    if (!hash || index === undefined) {
      return res.status(400).json({ error: 'Не указаны hash торрента или index файла' });
    }

    const hashStr = String(hash).trim();
    if (!/^[0-9a-fA-F]{40}$/.test(hashStr) && !/^[2-7a-zA-Z]{32}$/.test(hashStr)) {
      return res.status(400).json({ error: 'Некорректный формат хэша торрента' });
    }

    const fileIndex = Number(index);
    if (isNaN(fileIndex) || fileIndex < 0 || fileIndex > 99999) {
      return res.status(400).json({ error: 'Некорректный индекс файла' });
    }

    await proxyTorrServerStream(req, res, hashStr, fileIndex);
  } catch (error: any) {
    if (error.name === 'AbortError') return;
    console.error('[TORRENT-PROXY] Torrent stream proxy error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Критическая ошибка трансляции видеопотока' });
    }
  }
});
