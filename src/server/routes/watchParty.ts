/**
 * Watch Party REST API Routes
 * Endpoints for room lifecycle management, access control, and membership.
 */

import { Router, Response } from 'express';
import { requireAuth, optionalAuth, AuthRequest } from '../../middleware/auth.ts';
import { watchPartyService } from '../services/watchParty/watchPartyService.ts';
import rateLimit from 'express-rate-limit';

import { torrentSearchService } from '../services/torrentSearch/torrentSearchService.ts';

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
      mediaMetadata,
      privacy,
      passcode,
      initialDuration,
    } = req.body;

    const room = await watchPartyService.createRoom(userId, {
      title,
      mediaId: mediaId ? Number(mediaId) : null,
      mediaType,
      seasonNumber: seasonNumber !== undefined && seasonNumber !== null ? Number(seasonNumber) : null,
      episodeNumber: episodeNumber !== undefined && episodeNumber !== null ? Number(episodeNumber) : null,
      sourceType,
      sourceUrl,
      sourceConfig,
      mediaMetadata,
      privacy,
      passcode,
      initialDuration: initialDuration ? Number(initialDuration) : undefined,
    });

    return res.status(201).json(room);
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
 * 10. POST /api/watch-party/torrents/discover
 * Automatically discovers ranked torrent candidates for a media item.
 */
watchPartyRouter.post('/torrents/discover', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { mediaId, title, originalTitle, year, seasonNumber, episodeNumber, mediaType } = req.body || {};

    if (mediaId && !isNaN(Number(mediaId))) {
      const result = await torrentSearchService.searchByMediaId(
        Number(mediaId),
        seasonNumber !== undefined ? Number(seasonNumber) : undefined,
        episodeNumber !== undefined ? Number(episodeNumber) : undefined
      );
      return res.json(result);
    }

    if (!title || !String(title).trim()) {
      return res.status(422).json({ error: 'Не указан mediaId или название произведения' });
    }

    const result = await torrentSearchService.search({
      title: String(title).trim(),
      originalTitle: originalTitle ? String(originalTitle).trim() : undefined,
      mediaType: mediaType || 'movie',
      year: year ? Number(year) : undefined,
      seasonNumber: seasonNumber !== undefined ? Number(seasonNumber) : undefined,
      episodeNumber: episodeNumber !== undefined ? Number(episodeNumber) : undefined,
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Ошибка автоматического поиска торрентов' });
  }
});

/**
 * 11. POST /api/watch-party/rooms/:code/auto-torrent
 * HOST triggers auto-discovery and applies the best candidate torrent source.
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

    const discoveryResult = await torrentSearchService.searchByMediaId(
      room.mediaId,
      room.seasonNumber || undefined,
      room.episodeNumber || undefined
    );

    if (!discoveryResult.bestCandidate || !discoveryResult.bestCandidate.magnetUri) {
      return res.status(404).json({
        error: 'Не удалось автоматически подобрать торрент-источник с активными раздачами',
        discoveryResult,
      });
    }

    const best = discoveryResult.bestCandidate;
    const updatedRoom = await watchPartyService.changeSource(
      code,
      hostUserId,
      {
        type: 'TORRENT',
        magnetUri: best.magnetUri,
        title: best.name,
      },
      room.mediaId,
      room.seasonNumber,
      room.episodeNumber
    );

    return res.json({
      success: true,
      selectedCandidate: best,
      room: updatedRoom,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Ошибка автонастройки торрента' });
  }
});
