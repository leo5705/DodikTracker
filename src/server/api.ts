import { Router, Response } from 'express';
import { requireAuth, requireAdmin, requireStaff, isStaffRole, optionalAuth, AuthRequest, JWT_SECRET } from '../middleware/auth.ts';
import { ContentVisibilityService } from './services/contentVisibilityService.ts';
import { logAdminAction } from './routes/admin/auditHelper.ts';
import { db } from '../db/index.ts';
import {
  users,
  media,
  mediaExternalIds,
  userMedia,
  mediaHistory,
  activities,
  friendRequests,
  likes,
  comments,
  lists,
  listItems,
  listMembers,
  listFollowers,
  listInvitations,
  tierLists,
  notifications,
  systemIntegrations,
  systemSettings,
  adminAuditLogs,
  apiLogs,
  seasons,
  episodes,
  userEpisodes,
  reviews,
  reviewReactions,
  inviteCodes,
  passwordResetTokens,
  directMessages,
  achievements,
  userAchievements,
  mediaRatings,
  newsComments,
  newsReactions,
  ptsTransactions,
} from '../db/schema.ts';
import { eq, and, or, desc, asc, sql, inArray, not, isNull, ilike, gte, lte, count } from 'drizzle-orm';
import { providerManager } from './providers/index.ts';
import { UnifiedSearchFilters } from './providers/types.ts';
import { encryptCredentials, decryptCredentials, maskApiKey } from '../lib/crypto.ts';
import { GameTranslator } from './services/gameTranslator.ts';
import { telegramAuthCodes, telegramBot } from './telegram.ts';
import { achievementService } from './achievements/service.ts';
import { achievementsRouter } from './routes/achievements.ts';
import { notificationService } from './services/notificationService.ts';
import { releaseService } from './services/releaseService.ts';
import { presenceService } from "./services/presenceService.ts";
import { getCleanupStatus, runMessageCleanupJob } from "./services/messageCleanup.ts";
import { normalizeNotificationPreferences } from '../types/notification.ts';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import dns from 'dns';
import { promisify } from 'util';

const lookupAsync = promisify(dns.lookup);

export const apiRouter = Router();

// ==========================================
// SYSTEM & HEALTH (No auth required)
// ==========================================
import fs from 'fs';
import path from 'path';

apiRouter.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

apiRouter.get('/health/ready', async (req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.status(200).json({ status: 'UP', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'DOWN', database: 'disconnected', error: String(error) });
  }
});

apiRouter.get('/system/version', async (req, res) => {
  try {
    const manifestPath = path.resolve('release-manifest.json');
    let manifest = null;
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }

    const { rows: tableExists } = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '__drizzle_migrations'
      );
    `);

    let appliedMigrations = 0;
    let latestMigration: string | null = null;
    if (tableExists[0]?.exists) {
      const countRes: any = await db.execute(sql`SELECT count(*) as count FROM "__drizzle_migrations"`);
      appliedMigrations = parseInt(countRes[0]?.count || countRes.rows?.[0]?.count || '0', 10);
      
      const latestRes: any = await db.execute(sql`SELECT hash FROM "__drizzle_migrations" ORDER BY id DESC LIMIT 1`);
      latestMigration = latestRes[0]?.hash || latestRes.rows?.[0]?.hash || null;
    }

    let pendingMigrations = 0;
    const journalPath = path.resolve('drizzle/meta/_journal.json');
    if (fs.existsSync(journalPath)) {
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      pendingMigrations = Math.max(0, (journal.entries?.length || 0) - appliedMigrations);
    }

    res.status(200).json({
      appVersion: process.env.APP_VERSION || manifest?.version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      manifest,
      database: {
        appliedMigrations,
        pendingMigrations,
        latestMigration,
      }
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  message: { error: 'Слишком много попыток входа/регистрации. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false,
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
});

const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 messages per minute
  message: { error: 'Слишком частая отправка сообщений. Подождите немного.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false,
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
});

export function setSessionCookie(res: Response, token: string) {
  res.cookie('dodik_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie('dodik_session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export function sanitizeUser(user: any) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return {
    ...safe,
    displayName: safe.username || safe.name,
  };
}

// ==========================================
// UNIFIED IMAGE PROXY (CORS / Hotlinking bypass)
// ==========================================
function isSafeIp(ip: string): boolean {
  if (ip === '0.0.0.0' || ip === '255.255.255.255' || ip === '127.0.0.1' || ip === '::1') return false;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return false;
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length > 1) {
      const second = parseInt(parts[1], 10);
      if (second >= 16 && second <= 31) return false;
    }
  }
  // IPv6 simplified checks
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('fd') || lower.startsWith('fc') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return false;
    // Check IPv6-mapped IPv4
    if (lower.startsWith('::ffff:')) {
      const v4Part = lower.substring(7);
      return isSafeIp(v4Part);
    }
  }
  return true;
}

async function fetchSafeImage(url: string, depth = 0): Promise<globalThis.Response> {
  if (depth > 3) throw new Error('Слишком много редиректов');
  
  const urlObj = new URL(url);
  const ips = await lookupAsync(urlObj.hostname, { all: true });
  for (const record of ips) {
    if (!isSafeIp(record.address)) {
      throw new Error('Forbidden IP Address');
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  const res = await fetch(url, {
    signal: controller.signal,
    redirect: 'manual',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      Referer: urlObj.origin,
    },
  });
  clearTimeout(timeout);

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (!location) throw new Error('Redirect without location');
    const nextUrl = new URL(location, url).toString();
    return fetchSafeImage(nextUrl, depth + 1);
  }

  return res;
}

apiRouter.get('/proxy/image', async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).send('Некорректный URL изображения');
  }
  
  try {
    const upstreamRes = await fetchSafeImage(imageUrl);

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send('Ошибка загрузки удаленного изображения');
    }

    const contentType = upstreamRes.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return res.status(400).send('URL не указывает на изображение');
    }

    const contentLengthStr = upstreamRes.headers.get('content-length');
    if (contentLengthStr) {
      const len = parseInt(contentLengthStr, 10);
      if (len > 15 * 1024 * 1024) { // 15MB limit
        return res.status(400).send('Изображение слишком большое (лимит 15МБ)');
      }
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

    const arrayBuffer = await upstreamRes.arrayBuffer();
    if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
      return res.status(400).send('Изображение слишком большое');
    }

    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    return res.status(400).send(err.message || 'Ошибка обработки изображения');
  }
});

// Helper to create in-app notification and push real-time SSE + Telegram queue
export async function sendAppNotification(
  userId: number,
  notif: {
    type: string;
    title: string;
    body?: string;
    message?: string;
    content?: string;
    relatedEntity?: string;
    entityType?: string;
    relatedEntityId?: string;
    entityId?: string;
    link?: string;
    senderId?: number;
    actorUserId?: number;
    senderAvatar?: string;
    senderUsername?: string;
    metadata?: Record<string, any>;
    dedupKey?: string;
  }
) {
  try {
    await notificationService.create({
      recipientUserId: userId,
      type: notif.type,
      title: notif.title,
      message: notif.message || notif.body || '',
      content: notif.content,
      entityType: notif.entityType || notif.relatedEntity,
      entityId: notif.entityId || notif.relatedEntityId,
      link: notif.link,
      actorUserId: notif.actorUserId !== undefined ? notif.actorUserId : notif.senderId,
      senderAvatar: notif.senderAvatar,
      senderUsername: notif.senderUsername,
      metadata: notif.metadata,
      dedupKey: notif.dedupKey,
    });
  } catch (err) {
    console.error('Failed to create notification via notificationService:', err);
  }
}

// Helper to ensure media exists in database
export async function ensureMediaRecord(mediaId?: number, mediaPayload?: any): Promise<number | null> {
  if (mediaId) {
    const existing = await db.select({ id: media.id }).from(media).where(eq(media.id, mediaId)).limit(1);
    if (existing.length > 0) return existing[0].id;
  }

  if (mediaPayload) {
    if (mediaPayload.externalId) {
      const conditions = [eq(mediaExternalIds.externalId, String(mediaPayload.externalId))];
      if (mediaPayload.provider) {
        conditions.push(eq(mediaExternalIds.provider, mediaPayload.provider));
      }
      const foundExt = await db
        .select({ mediaId: mediaExternalIds.mediaId })
        .from(mediaExternalIds)
        .where(and(...conditions))
        .limit(1);

      if (foundExt.length > 0) {
        return foundExt[0].mediaId;
      }
    }

    const isAdult = ContentVisibilityService.isAdultContent(mediaPayload);
    const ageRating = mediaPayload.ageRating || mediaPayload.age_rating || mediaPayload.ratingAgeLimits || (isAdult ? '18+' : null);

    const [createdMedia] = await db
      .insert(media)
      .values({
        type: mediaPayload.type || 'MOVIE',
        title: mediaPayload.title || 'Без названия',
        originalTitle: mediaPayload.originalTitle,
        description: mediaPayload.description,
        posterUrl: mediaPayload.posterUrl,
        backdropUrl: mediaPayload.backdropUrl,
        releaseDate: mediaPayload.releaseDate,
        year: mediaPayload.year,
        genres: Array.isArray(mediaPayload.genres) ? JSON.stringify(mediaPayload.genres) : (mediaPayload.genres || null),
        rating: mediaPayload.rating,
        totalEpisodes: mediaPayload.totalEpisodes || 0,
        isAdult,
        ageRating,
      })
      .returning();

    if (mediaPayload.provider && mediaPayload.externalId) {
      await db.insert(mediaExternalIds).values({
        mediaId: createdMedia.id,
        provider: mediaPayload.provider,
        externalId: String(mediaPayload.externalId),
      }).catch(() => {});
    }

    return createdMedia.id;
  }

  return null;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length));
    part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `DODIK-${part1}-${part2}`;
}

// ==========================================
// 0. AUTHENTICATION & ACCESS CONTROL
// ==========================================

// Check public registration status & mode
const getRegistrationStatusHandler = async (_req: any, res: any) => {
  try {
    const setting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'site_access_mode'))
      .limit(1);

    const botSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'telegram_bot_username'))
      .limit(1);

    const mode = setting.length > 0 && setting[0].value ? setting[0].value : 'OPEN'; // 'OPEN' | 'INVITE_ONLY' | 'CLOSED' | 'MAINTENANCE'
    const botUsername = botSetting.length > 0 && botSetting[0].value ? botSetting[0].value : 'DodikTrackerBot';

    res.json({
      mode,
      allowsRegistration: mode === 'OPEN' || mode === 'INVITE_ONLY',
      requiresInvite: mode === 'INVITE_ONLY',
      isClosed: mode === 'CLOSED',
      isMaintenance: mode === 'MAINTENANCE',
      botUsername,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

apiRouter.get('/auth/registration-status', getRegistrationStatusHandler);
apiRouter.get('/auth/registration-mode', getRegistrationStatusHandler);
apiRouter.get('/admin/registration-mode', getRegistrationStatusHandler);

apiRouter.put('/admin/registration-mode', requireAuth, requireStaff('MANAGE_SETTINGS'), async (req: AuthRequest, res: Response) => {
  try {
    const { mode } = req.body;
    if (!['OPEN', 'INVITE_ONLY', 'CLOSED', 'MAINTENANCE'].includes(mode)) {
      return res.status(400).json({ error: 'Неверный режим регистрации (OPEN, INVITE_ONLY, CLOSED, MAINTENANCE)' });
    }

    const [existing] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'site_access_mode'))
      .limit(1);

    if (existing) {
      await db
        .update(systemSettings)
        .set({ value: mode, updatedAt: new Date() })
        .where(eq(systemSettings.key, 'site_access_mode'));
    } else {
      await db.insert(systemSettings).values({
        key: 'site_access_mode',
        value: mode,
        description: 'Режим доступа к регистрации в проекте',
      });
    }

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'UPDATE_REGISTRATION_MODE',
      details: `Изменен режим доступа сайта на: ${mode}`,
      ip: req.ip,
    });

    res.json({
      success: true,
      mode,
      allowsRegistration: mode === 'OPEN' || mode === 'INVITE_ONLY',
      requiresInvite: mode === 'INVITE_ONLY',
      isClosed: mode === 'CLOSED',
      isMaintenance: mode === 'MAINTENANCE',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Register with username & password (+ optional or required invite code)
// Email is NOT required (Requirements 14)
apiRouter.post('/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, password, inviteCode } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    const cleanUsername = String(username).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Имя пользователя должно содержать не менее 3 символов' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    }

    // 1. Check Registration Mode
    const regModeSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'site_access_mode'))
      .limit(1);
    const mode = regModeSetting.length > 0 ? regModeSetting[0].value : 'OPEN';

    const allUsers = await db.select({ id: users.id }).from(users);
    const isFirstUser = allUsers.length === 0;
    let validatedInvite: typeof inviteCodes.$inferSelect | null = null;

    if (!isFirstUser) {
      if (mode === 'CLOSED') {
        return res.status(403).json({ error: 'Регистрация новых пользователей закрыта администратором' });
      }
      
      if (mode === 'MAINTENANCE') {
        return res.status(503).json({ error: 'Сайт находится на техническом обслуживании' });
      }

      // Check invite code
      const cleanCode = inviteCode && String(inviteCode).trim() ? String(inviteCode).trim().toUpperCase() : null;

      if (cleanCode) {
        const foundCode = await db
          .select()
          .from(inviteCodes)
          .where(eq(inviteCodes.code, cleanCode))
          .limit(1);

        if (foundCode.length === 0) {
          return res.status(400).json({ error: 'Инвайт-код не существует' });
        }
        if (foundCode[0].isUsed) {
          return res.status(400).json({ error: 'Инвайт-код уже был использован' });
        }
        if (foundCode[0].isActive === false) {
          return res.status(400).json({ error: 'Инвайт-код отключен администратором' });
        }
        validatedInvite = foundCode[0];
      } else if (mode === 'INVITE_ONLY') {
        return res.status(400).json({ error: 'Проект закрытый. Для регистрации необходим инвайт-код' });
      }
    }

    // 2. Check if username already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(409).json({ error: 'Имя пользователя уже занято' });
    }

    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const customUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const targetAdminUser = (process.env.INITIAL_ADMIN_USERNAME || process.env.ADMIN_USERNAME || '').trim().toLowerCase();
    const shouldBeAdmin = (targetAdminUser && targetAdminUser === cleanUsername) || (isFirstUser && !targetAdminUser && process.env.ALLOW_FIRST_USER_ADMIN !== 'false');

    const [newUser] = await db
      .insert(users)
      .values({
        uid: customUid,
        username: cleanUsername,
        passwordHash,
        role: shouldBeAdmin ? 'SUPER_ADMIN' : 'USER',
        invitesLeft: 3,
      })
      .returning();

    // 4. If an invite code was used, mark it and link user
    if (validatedInvite) {
      await db
        .update(inviteCodes)
        .set({ isUsed: true, usedById: newUser.id, usedAt: new Date() })
        .where(eq(inviteCodes.id, validatedInvite.id))
        .catch(() => {});

      if (validatedInvite.creatorId) {
        await notificationService.create({
          recipientUserId: validatedInvite.creatorId,
          type: 'SYSTEM',
          title: 'Инвайт использован',
          message: `Пользователь @${newUser.username} успешно зарегистрировался по вашему инвайт-коду!`,
          actorUserId: newUser.id,
          senderUsername: newUser.username,
          link: `/u/${newUser.username}`,
          entityType: 'INVITE_CODE',
          entityId: String(validatedInvite.id),
        }).catch(() => {});
      }
    }

    // 5. Generate JWT Token
    const token = jwt.sign(
      { userId: newUser.id, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Trigger registration achievement
    achievementService.checkAndUnlock(newUser.id, 'USER_REGISTERED').catch(() => {});

    setSessionCookie(res, token);
    res.json({ token, user: sanitizeUser(newUser) });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Login with username ONLY & password (Requirement 15)
apiRouter.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: 'Укажите логин и пароль' });
    }

    const cleanUsername = String(login).trim().toLowerCase();
    const found = await db
      .select()
      .from(users)
      .where(or(eq(users.username, cleanUsername), eq(users.email, cleanUsername)))
      .limit(1);

    if (found.length === 0) {
      return res.status(401).json({ error: 'Пользователь с таким логином не найден' });
    }

    const user = found[0];

    // Check account block status
    if (user.isBlocked) {
      return res.status(403).json({ error: 'Ваш аккаунт заблокирован администратором' });
    }

    if (!user.passwordHash) {
      return res.status(401).json({
        error: 'Для данного аккаунта не задан пароль. Войдите через Telegram или обратитесь к администратору.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }

    // Check maintenance mode for non-staff
    const regModeSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'site_access_mode'))
      .limit(1);
    const mode = regModeSetting.length > 0 && regModeSetting[0].value ? regModeSetting[0].value : 'OPEN';

    if (mode === 'MAINTENANCE' && !isStaffRole(user.role)) {
      return res.status(503).json({
        error: 'Сайт находится на техническом обслуживании. Вход доступен только для администрации.',
      });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    setSessionCookie(res, token);
    achievementService.checkAndUnlock(user.id, 'DAYS_STREAK').catch(() => {});
    res.json({ token, user: sanitizeUser(user) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PASSWORD RESET (Requirements 16 & 17)
// ==========================================

// Validate reset token
apiRouter.get('/auth/reset-password/validate', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ valid: false, error: 'Токен обязателен' });
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const records = await db
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        expiresAt: passwordResetTokens.expiresAt,
        usedAt: passwordResetTokens.usedAt,
        username: users.username,
      })
      .from(passwordResetTokens)
      .innerJoin(users, eq(passwordResetTokens.userId, users.id))
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)))
      .limit(1);

    if (records.length === 0) {
      return res.status(400).json({
        valid: false,
        error: 'Ссылка для сброса пароля недействительна или уже была использована',
      });
    }

    const record = records[0];
    if (new Date() > new Date(record.expiresAt)) {
      return res.status(400).json({
        valid: false,
        error: 'Срок действия ссылки истек (24 часа). Запросите новую ссылку у администратора.',
      });
    }

    res.json({ valid: true, username: record.username });
  } catch (err: any) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// Execute password reset
apiRouter.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Токен и новый пароль обязательны' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    }

    const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
    const records = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)))
      .limit(1);

    if (records.length === 0) {
      return res.status(400).json({ error: 'Ссылка для сброса пароля недействительна или уже была использована' });
    }

    const record = records[0];
    if (new Date() > new Date(record.expiresAt)) {
      return res.status(400).json({ error: 'Срок действия ссылки истек. Запросите новую у администратора.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user's password
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, record.userId));

    // Invalidate token (mark used)
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, record.id));

    res.json({ success: true, message: 'Пароль успешно обновлен. Теперь вы можете войти в систему.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check Telegram bot status or code verification status
apiRouter.get('/auth/telegram/status', async (req, res) => {
  try {
    const botToken = await telegramBot.getBotToken();
    const botSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'telegram_bot_username'))
      .limit(1);
    const botUsername =
      botSetting.length > 0 && botSetting[0].value?.trim()
        ? botSetting[0].value.trim()
        : telegramBot.getUsername();

    const code = req.query.code ? String(req.query.code).trim() : null;
    let isCodeVerified = false;
    if (code) {
      const stored = telegramAuthCodes.get(code);
      if (stored && stored.type === 'LOGIN' && stored.isVerified && Date.now() <= stored.expiresAt) {
        isCodeVerified = true;
      }
    }

    res.json({
      configured: !!botToken,
      botUsername,
      botUrl: `https://t.me/${botUsername}`,
      verified: isCodeVerified,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Request Telegram Auth code
apiRouter.post('/auth/telegram/request-code', async (req, res) => {
  try {
    const botToken = await telegramBot.getBotToken();
    const botSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'telegram_bot_username'))
      .limit(1);
    const botUsername =
      botSetting.length > 0 && botSetting[0].value?.trim()
        ? botSetting[0].value.trim()
        : telegramBot.getUsername();

    if (!botToken) {
      return res.status(503).json({
        configured: false,
        botUsername,
        error: 'Telegram-бот ещё не подключен или не настроен администратором. Пожалуйста, используйте вход по логину/паролю или Google.',
      });
    }

    const { telegramUsername } = req.body;
    const cleanTg = telegramUsername ? String(telegramUsername).replace('@', '').trim().toLowerCase() : undefined;

    // Generate 6-digit code for LOGIN
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    telegramAuthCodes.set(code, {
      code,
      type: 'LOGIN',
      createdAt: Date.now(),
      expiresAt,
      telegramUsername: cleanTg,
      isVerified: false,
      attempts: 0,
    });

    res.json({
      configured: true,
      code,
      expiresAt,
      botUsername,
      botUrl: `https://t.me/${botUsername}?start=login_${code}`,
      message: `Код подтверждения: ${code}. Отправьте команду /login ${code} боту @${botUsername}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate link code for logged-in user in Settings
apiRouter.post('/auth/telegram/link-code', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const botToken = await telegramBot.getBotToken();
    const botSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'telegram_bot_username'))
      .limit(1);
    const botUsername =
      botSetting.length > 0 && botSetting[0].value?.trim()
        ? botSetting[0].value.trim()
        : telegramBot.getUsername();

    if (!botToken) {
      return res.status(503).json({
        configured: false,
        error: 'Telegram-бот не настроен администратором (токен не задан).',
      });
    }

    // Invalidate any existing LINK codes for this user
    for (const [existingCode, entry] of telegramAuthCodes.entries()) {
      if (entry.userId === user.id && entry.type === 'LINK') {
        telegramAuthCodes.delete(existingCode);
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 15 * 60 * 1000;

    telegramAuthCodes.set(code, {
      code,
      type: 'LINK',
      createdAt: Date.now(),
      expiresAt,
      userId: user.id, // Strictly determined by server session!
      isVerified: false,
      attempts: 0,
    });

    res.json({
      configured: true,
      code,
      expiresAt,
      botUsername,
      botUrl: `https://t.me/${botUsername}?start=link_${code}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check status of linking process from Settings
apiRouter.get('/auth/telegram/link-status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const code = req.query.code ? String(req.query.code).trim() : null;

    // Check if user is already linked in DB
    const currentUser = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
    if (currentUser?.telegramId) {
      if (code) telegramAuthCodes.delete(code);
      return res.json({
        status: 'LINKED',
        user: sanitizeUser(currentUser),
        telegramUsername: currentUser.telegramUsername,
        telegramId: currentUser.telegramId,
      });
    }

    if (!code) {
      return res.json({ status: 'NOT_LINKED' });
    }

    const stored = telegramAuthCodes.get(code);
    if (!stored || Date.now() > stored.expiresAt) {
      return res.status(400).json({
        status: 'EXPIRED',
        error: 'Срок действия кода истек или код не найден. Запросите новый код.',
      });
    }

    if (stored.userId !== user.id) {
      return res.status(403).json({ error: 'Доступ запрещен. Код принадлежит другому пользователю.' });
    }

    if (stored.error === 'ALREADY_LINKED') {
      telegramAuthCodes.delete(code);
      return res.status(409).json({
        status: 'ALREADY_LINKED',
        error: 'Этот Telegram уже привязан к другому аккаунту.',
        alreadyLinkedUsername: stored.alreadyLinkedUsername,
      });
    }

    if (stored.isVerified) {
      telegramAuthCodes.delete(code);
      const updatedUser = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
      return res.json({
        status: 'LINKED',
        user: sanitizeUser(updatedUser),
        telegramUsername: updatedUser.telegramUsername,
        telegramId: updatedUser.telegramId,
      });
    }

    res.json({ status: 'PENDING' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manual confirm link button from Settings
apiRouter.post('/auth/telegram/confirm-link', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { code } = req.body;

    if (!code || !String(code).trim()) {
      return res.status(400).json({ error: 'Укажите 6-значный код привязки' });
    }

    const cleanCode = String(code).trim();
    const stored = telegramAuthCodes.get(cleanCode);

    if (!stored || Date.now() > stored.expiresAt) {
      return res.status(400).json({
        error: 'Недействительный или истекший код привязки. Запросите новый код.',
      });
    }

    if (stored.userId !== user.id) {
      return res.status(403).json({ error: 'Код привязки принадлежит другому пользователю.' });
    }

    if (stored.error === 'ALREADY_LINKED') {
      telegramAuthCodes.delete(cleanCode);
      return res.status(409).json({
        error: 'Этот Telegram уже привязан к другому аккаунту.',
        alreadyLinkedUsername: stored.alreadyLinkedUsername,
      });
    }

    if (!stored.isVerified) {
      const botSetting = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'telegram_bot_username'))
        .limit(1);
      const botUsername =
        botSetting.length > 0 && botSetting[0].value?.trim()
          ? botSetting[0].value.trim()
          : telegramBot.getUsername();

      return res.status(400).json({
        verified: false,
        error: `Привязка ещё не подтверждена. Перейдите в бот @${botUsername} в Telegram и отправьте команду /link ${cleanCode}`,
      });
    }

    telegramAuthCodes.delete(cleanCode);
    const updatedUser = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
    res.json({
      success: true,
      message: 'Telegram успешно привязан!',
      user: sanitizeUser(updatedUser),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Unlink Telegram from profile in Settings
apiRouter.post('/auth/telegram/unlink', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;

    await db
      .update(users)
      .set({
        telegramId: null,
        telegramChatId: null,
        telegramUsername: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const updatedUser = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
    res.json({
      success: true,
      message: 'Telegram успешно отвязан от вашего аккаунта.',
      user: sanitizeUser(updatedUser),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Verify Telegram code and log in / register
apiRouter.post('/auth/telegram/verify', async (req, res) => {
  try {
    const { code, inviteCode } = req.body;

    if (!code || !String(code).trim()) {
      return res.status(400).json({ error: 'Укажите 6-значный код авторизации' });
    }

    const cleanCode = String(code).trim();
    const stored = telegramAuthCodes.get(cleanCode);

    if (!stored || Date.now() > stored.expiresAt) {
      return res.status(400).json({
        error: 'Недействительный или истекший код авторизации. Запросите новый код.',
      });
    }

    // Rate limiting: max 5 verification attempts per code
    stored.attempts = (stored.attempts || 0) + 1;
    if (stored.attempts > 5) {
      telegramAuthCodes.delete(cleanCode);
      return res.status(429).json({
        error: 'Превышено максимальное количество попыток проверки кода. Запросите новый код.',
      });
    }

    // STRICT SEPARATION: LINK codes generated from Settings CANNOT be used for site login
    if (stored.type === 'LINK' || stored.userId) {
      return res.status(400).json({
        error: 'Этот код предназначен для привязки Telegram в настройках профиля, а не для входа на сайт.',
      });
    }

    const botSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'telegram_bot_username'))
      .limit(1);
    const botUsername =
      botSetting.length > 0 && botSetting[0].value?.trim()
        ? botSetting[0].value.trim()
        : telegramBot.getUsername();

    // Check that Telegram bot actually verified this login code
    if (!stored.isVerified || !stored.telegramId) {
      return res.status(400).json({
        verified: false,
        error: `Авторизация ещё не подтверждена. Перейдите в бот @${botUsername} в Telegram и отправьте команду /login ${cleanCode}`,
      });
    }

    // ONE-TIME USE: Invalidate code immediately upon successful attempt to prevent replay
    const tgId = stored.telegramId;
    const tgChatId = stored.telegramChatId;
    const tgUsername = stored.telegramUsername;
    telegramAuthCodes.delete(cleanCode);

    // Primary Identity Check: Look up user strictly by stable telegramId
    let userRecord: any = null;
    const foundById = await db.select().from(users).where(eq(users.telegramId, tgId)).limit(1);
    if (foundById.length > 0) {
      userRecord = foundById[0];
    }

    if (!userRecord) {
      // Must register new user -> check registration mode
      const regModeSetting = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'site_access_mode'))
        .limit(1);
      const mode = regModeSetting.length > 0 && regModeSetting[0].value ? regModeSetting[0].value : 'OPEN';

      const allUsers = await db.select({ id: users.id }).from(users);
      const isFirst = allUsers.length === 0;

      let validatedTgInvite: typeof inviteCodes.$inferSelect | null = null;
      const cleanInvite = inviteCode && String(inviteCode).trim() ? String(inviteCode).trim().toUpperCase() : null;

      if (!isFirst) {
        if (mode === 'CLOSED') {
          return res.status(403).json({ error: 'Регистрация закрыта администратором' });
        }
        if (mode === 'MAINTENANCE') {
          return res.status(503).json({ error: 'Сайт находится на техническом обслуживании. Регистрация временно отключена.' });
        }

        if (cleanInvite) {
          const foundInvite = await db
            .select()
            .from(inviteCodes)
            .where(eq(inviteCodes.code, cleanInvite))
            .limit(1);

          if (foundInvite.length === 0) {
            return res.status(400).json({ error: 'Инвайт-код не существует' });
          }
          if (foundInvite[0].isUsed) {
            return res.status(400).json({ error: 'Инвайт-код уже был использован' });
          }
          if (foundInvite[0].isActive === false) {
            return res.status(400).json({ error: 'Инвайт-код отключен администратором' });
          }
          validatedTgInvite = foundInvite[0];
        } else if (mode === 'INVITE_ONLY') {
          return res.status(400).json({
            requireInvite: true,
            error: 'Для новой регистрации через Telegram необходим инвайт-код. Пожалуйста, введите инвайт-код.',
          });
        }
      }

      const rawPrefix = tgUsername ? tgUsername.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 14) : `tg_${tgId.slice(-4)}`;
      const generatedUsername = `tg_${rawPrefix || 'user'}_${Math.floor(Math.random() * 899 + 100)}`;
      const customUid = `tg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      const targetAdminUser = (process.env.INITIAL_ADMIN_USERNAME || process.env.ADMIN_USERNAME || '').trim().toLowerCase();
      const shouldBeAdmin = (targetAdminUser && (targetAdminUser === generatedUsername.toLowerCase() || targetAdminUser === tgUsername?.toLowerCase())) || (isFirst && !targetAdminUser && process.env.ALLOW_FIRST_USER_ADMIN !== 'false');

      const [created] = await db
        .insert(users)
        .values({
          uid: customUid,
          username: generatedUsername,
          email: `${generatedUsername}@dodik.telegram`,
          telegramUsername: tgUsername || null,
          telegramId: tgId,
          telegramChatId: tgChatId || null,
          role: shouldBeAdmin ? 'SUPER_ADMIN' : 'USER',
          invitesLeft: 3,
        })
        .returning();

      // If invite used, link it and notify
      if (validatedTgInvite) {
        await db
          .update(inviteCodes)
          .set({ isUsed: true, usedById: created.id, usedAt: new Date() })
          .where(eq(inviteCodes.id, validatedTgInvite.id))
          .catch(() => {});

        if (validatedTgInvite.creatorId) {
          await notificationService.create({
            recipientUserId: validatedTgInvite.creatorId,
            type: 'SYSTEM',
            title: 'Инвайт использован',
            message: `Пользователь @${created.username} успешно зарегистрировался по вашему инвайт-коду через Telegram!`,
            actorUserId: created.id,
            senderUsername: created.username,
            link: `/u/${created.username}`,
            entityType: 'INVITE_CODE',
            entityId: String(validatedTgInvite.id),
          }).catch(() => {});
        }
      }

      userRecord = created;
    } else {
      // User exists -> check maintenance mode
      const regModeSetting = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'site_access_mode'))
        .limit(1);
      const mode = regModeSetting.length > 0 && regModeSetting[0].value ? regModeSetting[0].value : 'OPEN';

      if (mode === 'MAINTENANCE' && !isStaffRole(userRecord.role)) {
        return res.status(503).json({
          error: 'Сайт находится на техническом обслуживании. Вход доступен только для администрации.',
        });
      }

      // Check blocked or banned
      if (userRecord.isBlocked) {
        return res.status(403).json({ error: 'Ваш аккаунт заблокирован администратором.' });
      }

      if (userRecord.bannedUntil && new Date(userRecord.bannedUntil) > new Date()) {
        return res.status(403).json({
          error: `Ваш аккаунт временно заблокирован до ${new Date(userRecord.bannedUntil).toLocaleString('ru-RU')}.${userRecord.banReason ? ` Причина: ${userRecord.banReason}` : ''}`,
        });
      }

      // Refresh chat ID and username if changed
      if (tgChatId || tgUsername) {
        await db
          .update(users)
          .set({
            telegramChatId: tgChatId || userRecord.telegramChatId,
            telegramUsername: tgUsername || userRecord.telegramUsername,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userRecord.id));
      }
    }

    const token = jwt.sign(
      { userId: userRecord.id, username: userRecord.username, email: userRecord.email, role: userRecord.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    setSessionCookie(res, token);
    res.json({ token, user: sanitizeUser(userRecord) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Session sync endpoint (e.g. for Google OAuth / Firebase or token exchange)
apiRouter.post('/auth/session', async (req, res) => {
  try {
    const { idToken } = req.body;
    const authHeader = req.headers.authorization;
    const rawToken = idToken || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null);

    if (!rawToken) {
      return res.status(400).json({ error: 'Токен обязателен' });
    }

    let payload: any = null;
    try {
      payload = jwt.verify(rawToken, JWT_SECRET);
    } catch (_e) {
      payload = jwt.decode(rawToken);
    }

    if (!payload || (!payload.sub && !payload.user_id && !payload.userId && !payload.uid)) {
      return res.status(401).json({ error: 'Недействительный токен сессии' });
    }

    const uid = payload.sub || payload.user_id || payload.uid || (payload.userId ? String(payload.userId) : null);
    const email = payload.email || `${uid}@firebase.user`;
    const name = payload.name || payload.displayName || email.split('@')[0];

    let user: any = null;
    if (payload.userId) {
      const found = await db.select().from(users).where(eq(users.id, Number(payload.userId))).limit(1);
      if (found.length > 0) user = found[0];
    }

    if (!user && uid) {
      const found = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
      if (found.length > 0) user = found[0];
    }

    if (!user && email) {
      const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (found.length > 0) {
        user = found[0];
        if (uid && user.uid !== uid) {
          await db.update(users).set({ uid }).where(eq(users.id, user.id));
        }
      }
    }

    const regModeSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'site_access_mode'))
      .limit(1);
    const mode = regModeSetting.length > 0 && regModeSetting[0].value ? regModeSetting[0].value : 'OPEN';

    if (!user) {
      const allUsers = await db.select({ id: users.id }).from(users).limit(1);
      const isFirst = allUsers.length === 0;

      if (!isFirst) {
        if (mode === 'CLOSED') {
          return res.status(403).json({ error: 'Регистрация новых пользователей закрыта администратором' });
        }
        if (mode === 'MAINTENANCE') {
          return res.status(503).json({ error: 'Сайт находится на техническом обслуживании. Регистрация недоступна.' });
        }
        if (mode === 'INVITE_ONLY') {
          return res.status(403).json({
            error: 'Регистрация разрешена только по инвайт-кодам. Пожалуйста, воспользуйтесь формой регистрации с инвайт-кодом.',
          });
        }
      }

      let baseUsername = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase().slice(0, 16);
      if (!baseUsername) baseUsername = 'user';
      let candidate = baseUsername;
      let counter = 1;
      while (true) {
        const exist = await db.select().from(users).where(eq(users.username, candidate)).limit(1);
        if (exist.length === 0) break;
        candidate = `${baseUsername}${counter++}`;
      }

      const targetAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const targetAdminUser = (process.env.INITIAL_ADMIN_USERNAME || process.env.ADMIN_USERNAME || '').trim().toLowerCase();
      const shouldBeAdmin = (targetAdminEmail && targetAdminEmail === email.toLowerCase()) ||
                            (targetAdminUser && targetAdminUser === candidate.toLowerCase()) ||
                            (isFirst && !targetAdminEmail && !targetAdminUser && process.env.ALLOW_FIRST_USER_ADMIN !== 'false');

      const [created] = await db
        .insert(users)
        .values({
          uid: uid || `usr_${Date.now()}`,
          email,
          username: candidate,
          avatar: payload.picture || null,
          role: shouldBeAdmin ? 'SUPER_ADMIN' : 'USER',
          invitesLeft: 3,
        })
        .returning();
      user = created;
    } else {
      // Existing user -> check maintenance mode
      if (mode === 'MAINTENANCE' && !isStaffRole(user.role)) {
        return res.status(503).json({
          error: 'Сайт находится на техническом обслуживании. Вход доступен только для администрации.',
        });
      }
    }

    if (user.isBlocked) {
      return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    }

    const sessionToken = jwt.sign(
      { userId: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    setSessionCookie(res, sessionToken);
    res.json({ token: sessionToken, user: sanitizeUser(user) });
  } catch (err: any) {
    console.error('Session error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Logout endpoint (clears session cookie)
apiRouter.post('/auth/logout', async (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ==========================================
// 0.1 INVITES SYSTEM
// ==========================================

// Get current user's invite statistics and list of generated codes
apiRouter.get('/invites/my', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const [freshUser] = await db
      .select({
        id: users.id,
        role: users.role,
        invitesLeft: users.invitesLeft,
      })
      .from(users)
      .where(eq(users.id, user.id));

    const effectiveUser = freshUser || user;
    const isSuperAdmin = effectiveUser.role === 'SUPER_ADMIN';
    const isAdmin = effectiveUser.role === 'ADMIN' || isSuperAdmin;

    const myCodes = await db
      .select({
        id: inviteCodes.id,
        code: inviteCodes.code,
        isUsed: inviteCodes.isUsed,
        isActive: inviteCodes.isActive,
        createdAt: inviteCodes.createdAt,
        usedAt: inviteCodes.usedAt,
        usedById: inviteCodes.usedById,
        usedByUsername: sql<string | null>`(SELECT username FROM users WHERE users.id = ${inviteCodes.usedById})`,
        usedByAvatar: sql<string | null>`(SELECT avatar FROM users WHERE users.id = ${inviteCodes.usedById})`,
      })
      .from(inviteCodes)
      .where(eq(inviteCodes.creatorId, effectiveUser.id))
      .orderBy(desc(inviteCodes.createdAt));

    const totalCreated = myCodes.length;
    const activeCount = myCodes.filter((c) => !c.isUsed && c.isActive !== false).length;
    const usedCount = myCodes.filter((c) => c.isUsed).length;
    const totalLimit = isAdmin ? 999999 : 3;
    const invitesLeft = isAdmin ? 999999 : Math.max(0, effectiveUser.invitesLeft);

    res.json({
      invitesLeft,
      totalLimit,
      totalCreated,
      activeCount,
      usedCount,
      canGenerate: isAdmin || (invitesLeft > 0 && totalCreated < 3),
      isUnlimited: isAdmin,
      codes: myCodes,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate new invite code with atomic limit validation
apiRouter.post('/invites/generate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    
    // Always fetch fresh user state from DB
    const [freshUser] = await db
      .select({
        id: users.id,
        role: users.role,
        invitesLeft: users.invitesLeft,
      })
      .from(users)
      .where(eq(users.id, user.id));

    if (!freshUser) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    const isAdmin = freshUser.role === 'ADMIN' || freshUser.role === 'SUPER_ADMIN';

    if (!isAdmin) {
      // Check total created invites by this user
      const [countRes] = await db
        .select({ val: count() })
        .from(inviteCodes)
        .where(eq(inviteCodes.creatorId, freshUser.id));
      const totalCreated = Number(countRes?.val || 0);

      if (freshUser.invitesLeft <= 0 || totalCreated >= 3) {
        return res.status(403).json({
          error: 'Все инвайты использованы. Вы создали максимальное количество инвайт-кодов (3 из 3).',
        });
      }

      // Atomic update to prevent race conditions / parallel request bypass
      const updateResult = await db
        .update(users)
        .set({
          invitesLeft: sql`invites_left - 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, freshUser.id), sql`invites_left > 0`))
        .returning({ newInvitesLeft: users.invitesLeft });

      if (updateResult.length === 0) {
        return res.status(403).json({
          error: 'Все инвайты использованы (лимит 3).',
        });
      }
    }

    let code = generateInviteCode();
    // Ensure uniqueness
    let attempts = 0;
    while (attempts < 10) {
      const exists = await db.select({ id: inviteCodes.id }).from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
      if (exists.length === 0) break;
      code = generateInviteCode();
      attempts++;
    }

    const [newInvite] = await db
      .insert(inviteCodes)
      .values({
        code,
        creatorId: freshUser.id,
        isUsed: false,
        isActive: true,
      })
      .returning();

    const [updatedUser] = await db
      .select({ invitesLeft: users.invitesLeft })
      .from(users)
      .where(eq(users.id, freshUser.id));

    const remaining = isAdmin ? 999999 : (updatedUser?.invitesLeft ?? 0);

    res.json({
      success: true,
      invite: {
        ...newInvite,
        usedByUsername: null,
        usedByAvatar: null,
      },
      invitesLeft: remaining,
      isUnlimited: isAdmin,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 1. AUTH & PROFILE
// ==========================================

// Get current user profile
apiRouter.get('/auth/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    // Get library counts
    const libraryRows = await db
      .select({
        type: media.type,
        status: userMedia.status,
      })
      .from(userMedia)
      .innerJoin(media, eq(userMedia.mediaId, media.id))
      .where(eq(userMedia.userId, user.id));

    let userPts = 0;
    try {
      const userAchPoints = await db
        .select({ totalPoints: sql<number>`COALESCE(SUM(${achievements.points}), 0)` })
        .from(userAchievements)
        .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
        .where(eq(userAchievements.userId, user.id));

      const userLedgerPts = await db
        .select({ totalPoints: sql<number>`COALESCE(SUM(${ptsTransactions.amount}), 0)` })
        .from(ptsTransactions)
        .where(eq(ptsTransactions.userId, user.id));

      userPts = Number(userAchPoints[0]?.totalPoints || 0) + Number(userLedgerPts[0]?.totalPoints || 0);
    } catch (_err) {
      userPts = 0;
    }

    const counts = {
      total: libraryRows.length,
      movies: libraryRows.filter((r) => r.type === 'MOVIE').length,
      tv: libraryRows.filter((r) => r.type === 'TV').length,
      anime: libraryRows.filter((r) => r.type === 'ANIME').length,
      games: libraryRows.filter((r) => r.type === 'GAME').length,
      books: libraryRows.filter((r) => r.type === 'BOOK').length,
      manga: libraryRows.filter((r) => r.type === 'MANGA').length,
      comics: libraryRows.filter((r) => r.type === 'COMIC').length,
      completed: libraryRows.filter((r) => r.status === 'COMPLETED').length,
      pts: userPts,
    };

    res.json({ user: { ...sanitizeUser(user), pts: userPts }, counts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update profile
apiRouter.put('/auth/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const {
      username,
      bio,
      avatar,
      profileVisibility,
      libraryVisibility,
      activityVisibility,
      ratingVisibility,
      listVisibility,
      statisticsVisibility,
      notificationSettings,
      showAdultContent,
      } = req.body;

    // Validation
    if (bio && String(bio).length > 500) {
      return res.status(400).json({ error: 'Биография слишком длинная (максимум 500 символов)' });
    }
    if (username && String(username).length > 30) {
      return res.status(400).json({ error: 'Имя пользователя слишком длинное' });
    }

    // Validate username uniqueness if changed
    if (username && username !== user.username) {
      const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Имя пользователя уже занято' });
      }
    }

    const [updated] = await db
      .update(users)
      .set({
        username: username || user.username,
        bio: bio !== undefined ? bio : user.bio,
        avatar: avatar !== undefined ? avatar : user.avatar,
        profileVisibility: profileVisibility || user.profileVisibility,
        libraryVisibility: libraryVisibility || user.libraryVisibility,
        activityVisibility: activityVisibility || user.activityVisibility,
        ratingVisibility: ratingVisibility || user.ratingVisibility,
        listVisibility: listVisibility || user.listVisibility,
        statisticsVisibility: statisticsVisibility || user.statisticsVisibility,
        notificationSettings: notificationSettings !== undefined ? notificationSettings : user.notificationSettings,
        showAdultContent: typeof showAdultContent === 'boolean' ? showAdultContent : user.showAdultContent,
        
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. MEDIA & PROVIDER SEARCH
// ==========================================

// Global search across external providers and local catalog
function parseUnifiedFilters(query: any): UnifiedSearchFilters {
  const parseList = (val: any): string[] | undefined => {
    if (!val) return undefined;
    if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
    return String(val).split(',').map((s) => s.trim()).filter(Boolean);
  };

  const num = (val: any): number | undefined => {
    if (val === undefined || val === null || val === '') return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : n;
  };

  const q = query.q !== undefined ? String(query.q).trim() : query.query !== undefined ? String(query.query).trim() : undefined;

  const parseBool = (val: any): boolean => {
    if (val === true || val === 'true' || val === '1' || val === 1) return true;
    return false;
  };

  return {
    query: q,
    type: query.type ? String(query.type).toUpperCase() : undefined,
    category: query.category ? String(query.category).toUpperCase() : undefined,
    genres: parseList(query.genres || query.genre),
    year: num(query.year),
    yearFrom: num(query.year_from ?? query.yearFrom),
    yearTo: num(query.year_to ?? query.yearTo),
    ratingFrom: num(query.rating_from ?? query.ratingFrom),
    ratingTo: num(query.rating_to ?? query.ratingTo),
    dodikRatingFrom: num(query.dodik_rating_from ?? query.dodikRatingFrom),
    dodikRatingTo: num(query.dodik_rating_to ?? query.dodikRatingTo),
    dodikRatingCountFrom: num(query.dodik_votes_from ?? query.dodikRatingCountFrom ?? query.votes_from ?? query.votesFrom),
    votesFrom: num(query.votes_from ?? query.votesFrom),
    durationFrom: num(query.duration_from ?? query.durationFrom),
    durationTo: num(query.duration_to ?? query.durationTo),
    episodesFrom: num(query.episodes_from ?? query.episodesFrom),
    episodesTo: num(query.episodes_to ?? query.episodesTo),
    countries: parseList(query.countries || query.country),
    ageRatings: parseList(query.age_ratings || query.ageRatings),
    adultFilter: query.adult_filter || query.adultFilter || 'all',
    platforms: parseList(query.platforms || query.platform),
    developer: query.developer ? String(query.developer).trim() : undefined,
    publisher: query.publisher ? String(query.publisher).trim() : undefined,
    author: query.author ? String(query.author).trim() : undefined,
    artist: query.artist ? String(query.artist).trim() : undefined,
    album: query.album ? String(query.album).trim() : undefined,
    language: query.language ? String(query.language).trim() : undefined,
    status: query.status ? String(query.status) : undefined,
    season: query.season ? String(query.season) : undefined,
    seasonYear: num(query.season_year ?? query.seasonYear),
    animeFormat: query.anime_format ? String(query.anime_format) : (query.animeFormat ? String(query.animeFormat) : undefined),
    gameMode: query.game_mode ? String(query.game_mode) : (query.gameMode ? String(query.gameMode) : undefined),
    myStatus: query.my_status || query.myStatus || undefined,
    inLibrary: query.in_library || query.inLibrary || 'any',
    myRatingState: query.my_rating_state || query.myRatingState || 'any',
    myRating: num(query.my_rating ?? query.myRating),
    myRatingFrom: num(query.my_rating_from ?? query.myRatingFrom),
    myRatingTo: num(query.my_rating_to ?? query.myRatingTo),
    hasReview: query.has_review || query.hasReview || 'any',
    hideAdult: parseBool(query.hide_adult ?? query.hideAdult),
    hideNudity: parseBool(query.hide_nudity ?? query.hideNudity),
    hideSexualContent: parseBool(query.hide_sexual_content ?? query.hideSexualContent),
    hideViolence: parseBool(query.hide_violence ?? query.hideViolence),
    hideExplicitLanguage: parseBool(query.hide_explicit_language ?? query.hideExplicitLanguage),
    sortBy: query.sort_by ? String(query.sort_by) as any : (query.sortBy as any),
    sortOrder: (query.sort_order === 'asc' || query.sortOrder === 'asc') ? 'asc' : 'desc',
    page: num(query.page) || 1,
    limit: num(query.limit) || 20,
  };
}

// Compute relevance score of an item given a normalized search query
function calculateSearchRelevance(item: any, rawQuery: string): number {
  if (!rawQuery) return 0;
  const q = rawQuery.toLowerCase().trim();
  const title = String(item.title || '').toLowerCase().trim();
  const origTitle = String(item.originalTitle || '').toLowerCase().trim();
  const desc = String(item.description || '').toLowerCase();

  let score = 0;

  // Exact match
  if (title === q || origTitle === q) {
    score += 1000;
  }
  // Prefix match
  else if (title.startsWith(q) || origTitle.startsWith(q)) {
    score += 600;
  }
  // Word boundary match
  else if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(title) ||
           new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(origTitle)) {
    score += 400;
  }
  // Substring match in title
  else if (title.includes(q) || origTitle.includes(q)) {
    score += 200;
  }
  // Match in description
  else if (desc.includes(q)) {
    score += 50;
  }

  // Popularity / Rating bonus for tie breaking
  if (item.dodikRating && item.dodikRatingCount > 0) {
    score += Math.min(item.dodikRating * 0.5, 50);
  }
  if (item.rating) {
    score += Math.min(item.rating * 2, 20);
  }

  return score;
}

const mediaSearchHandler = async (req: any, res: any) => {
  try {
    const filters = parseUnifiedFilters(req.query);
    const query = filters.query || '';
    const rawCategory = req.query.category || req.query.listCategory;
    const categoryFilter = rawCategory ? String(rawCategory).toUpperCase() : undefined;
    let typeFilter = req.query.type ? String(req.query.type).toUpperCase() : undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '24'), 10) || 24, 1), 50);
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);

    if (!typeFilter && categoryFilter) {
      if (categoryFilter === 'GAME' || categoryFilter === 'GAMES') typeFilter = 'GAME';
      else if (categoryFilter === 'ANIME') typeFilter = 'ANIME';
      else if (categoryFilter === 'MANGA') typeFilter = 'MANGA';
      else if (categoryFilter === 'BOOK' || categoryFilter === 'BOOKS') typeFilter = 'BOOK';
      else if (categoryFilter === 'COMIC' || categoryFilter === 'COMICS') typeFilter = 'COMIC';
      else if (categoryFilter === 'MUSIC') typeFilter = 'MUSIC';
    }

    const hasFilterCriteria = Boolean(
      (filters.genres && filters.genres.length > 0) ||
      (filters.countries && filters.countries.length > 0) ||
      (filters.platforms && filters.platforms.length > 0) ||
      (filters.ageRatings && filters.ageRatings.length > 0) ||
      (filters.adultFilter && filters.adultFilter !== 'all') ||
      filters.year !== undefined ||
      filters.yearFrom !== undefined ||
      filters.yearTo !== undefined ||
      filters.ratingFrom !== undefined ||
      filters.ratingTo !== undefined ||
      filters.dodikRatingFrom !== undefined ||
      filters.dodikRatingTo !== undefined ||
      filters.dodikRatingCountFrom !== undefined ||
      filters.votesFrom !== undefined ||
      filters.durationFrom !== undefined ||
      filters.durationTo !== undefined ||
      filters.status !== undefined ||
      filters.season !== undefined ||
      filters.seasonYear !== undefined ||
      filters.animeFormat !== undefined ||
      filters.gameMode !== undefined ||
      filters.developer !== undefined ||
      filters.publisher !== undefined ||
      filters.author !== undefined ||
      filters.artist !== undefined ||
      filters.album !== undefined ||
      filters.language !== undefined ||
      filters.myStatus !== undefined ||
      (filters.inLibrary && filters.inLibrary !== 'any') ||
      (filters.myRatingState && filters.myRatingState !== 'any') ||
      filters.myRatingFrom !== undefined ||
      filters.myRatingTo !== undefined ||
      (filters.hasReview && filters.hasReview !== 'any') ||
      filters.sortBy !== undefined ||
      (typeFilter && typeFilter !== 'ALL') ||
      (categoryFilter && categoryFilter !== 'ALL')
    );

    // If neither search query nor filters provided
    if ((!query || query.length < 1) && !hasFilterCriteria) {
      return res.json({ results: [], hasMore: false, page, limit });
    }

    // 1. Search local database with direct SQL conditions on first page
    let localFormatted: any[] = [];
    const isSuperAdmin = req.dbUser?.role === 'SUPER_ADMIN';

    if (page === 1) {
      const localConditions: any[] = [];

      if (!isSuperAdmin) {
        localConditions.push(eq(media.isHidden, false));
      }

      if (query && query.length >= 1) {
        const cleanQ = query.trim().toLowerCase();
        localConditions.push(
          sql`(LOWER(${media.title}) LIKE ${'%' + cleanQ + '%'} OR LOWER(COALESCE(${media.originalTitle}, '')) LIKE ${'%' + cleanQ + '%'})`
        );
      }

      if (typeFilter && typeFilter !== 'ALL') {
        localConditions.push(eq(media.type, typeFilter));
      } else if (categoryFilter && categoryFilter !== 'ALL') {
        if (categoryFilter === 'MOVIES_TV' || categoryFilter === 'MOVIE_TV' || categoryFilter === 'FILMS_SERIES') {
          localConditions.push(or(eq(media.type, 'MOVIE'), eq(media.type, 'TV')));
        } else if (categoryFilter === 'GAME' || categoryFilter === 'GAMES') {
          localConditions.push(eq(media.type, 'GAME'));
        } else if (categoryFilter === 'ANIME') {
          localConditions.push(eq(media.type, 'ANIME'));
        } else if (categoryFilter === 'MANGA') {
          localConditions.push(eq(media.type, 'MANGA'));
        } else if (categoryFilter === 'BOOK' || categoryFilter === 'BOOKS') {
          localConditions.push(eq(media.type, 'BOOK'));
        } else if (categoryFilter === 'COMIC' || categoryFilter === 'COMICS') {
          localConditions.push(eq(media.type, 'COMIC'));
        } else if (categoryFilter === 'MUSIC') {
          localConditions.push(eq(media.type, 'MUSIC'));
        }
      }

      // Year filter
      if (filters.year) {
        localConditions.push(eq(media.year, filters.year));
      } else {
        if (filters.yearFrom) localConditions.push(gte(media.year, filters.yearFrom));
        if (filters.yearTo) localConditions.push(lte(media.year, filters.yearTo));
      }

      // Rating filter
      if (filters.ratingFrom !== undefined) localConditions.push(gte(media.rating, filters.ratingFrom));
      if (filters.ratingTo !== undefined) localConditions.push(lte(media.rating, filters.ratingTo));

      // Dodik Tracker Rating filter
      if (filters.dodikRatingFrom !== undefined) localConditions.push(gte(media.dodikRating, filters.dodikRatingFrom));
      if (filters.dodikRatingTo !== undefined) localConditions.push(lte(media.dodikRating, filters.dodikRatingTo));
      if (filters.dodikRatingCountFrom !== undefined) localConditions.push(gte(media.dodikRatingCount, filters.dodikRatingCountFrom));

      // Age Rating filter
      if (filters.ageRatings && filters.ageRatings.length > 0) {
        localConditions.push(inArray(media.ageRating, filters.ageRatings));
      }

      // Adult Filter
      if (filters.adultFilter === 'hide_adult' || filters.hideAdult) {
        localConditions.push(eq(media.isAdult, false));
      } else if (filters.adultFilter === 'only_adult') {
        localConditions.push(eq(media.isAdult, true));
      }

      // Genres
      if (filters.genres && filters.genres.length > 0) {
        const genreConditions = filters.genres.map((g) => ilike(media.genres, `%${g}%`));
        localConditions.push(or(...genreConditions));
      }

      try {
        let dbQuery = db.select().from(media);
        if (localConditions.length > 0) {
          dbQuery = dbQuery.where(and(...localConditions)) as any;
        }

        if ((filters.sortBy as string) === 'dodik_rating' || (filters.sortBy as string) === 'dodikRating') {
          dbQuery = (filters.sortOrder === 'asc' ? dbQuery.orderBy(asc(media.dodikRating)) : dbQuery.orderBy(desc(media.dodikRating))) as any;
        } else if ((filters.sortBy as string) === 'dodik_votes' || (filters.sortBy as string) === 'dodikRatingCount') {
          dbQuery = (filters.sortOrder === 'asc' ? dbQuery.orderBy(asc(media.dodikRatingCount)) : dbQuery.orderBy(desc(media.dodikRatingCount))) as any;
        } else if (filters.sortBy === 'rating') {
          dbQuery = (filters.sortOrder === 'asc' ? dbQuery.orderBy(asc(media.rating)) : dbQuery.orderBy(desc(media.rating))) as any;
        } else if (filters.sortBy === 'release_date') {
          dbQuery = (filters.sortOrder === 'asc' ? dbQuery.orderBy(asc(media.year)) : dbQuery.orderBy(desc(media.year))) as any;
        } else if (filters.sortBy === 'title') {
          dbQuery = (filters.sortOrder === 'desc' ? dbQuery.orderBy(desc(media.title)) : dbQuery.orderBy(asc(media.title))) as any;
        }

        const localItems = await dbQuery.limit(limit);

        localFormatted = localItems.map((item) => ({
          provider: 'DODIK_DB',
          externalId: String(item.id),
          mediaId: item.id,
          type: item.type,
          title: item.title,
          originalTitle: item.originalTitle,
          description: item.description,
          posterUrl: item.posterUrl,
          backdropUrl: item.backdropUrl,
          year: item.year,
          rating: item.rating,
          dodikRating: item.dodikRating,
          dodikRatingCount: item.dodikRatingCount,
          isAdult: item.isAdult,
          ageRating: item.ageRating,
        }));
      } catch (dbErr) {
        console.warn('Local DB search error:', dbErr);
      }
    }

    // 2. Search external active providers with pagination and filters
    const searchRes = await providerManager.search(query, typeFilter, page, limit, filters);
    const externalResults = searchRes.results || [];
    const hasMore = Boolean(searchRes.hasMore);

    // Merge without duplicates
    let combined = page === 1 ? [...localFormatted, ...externalResults] : [...externalResults];

    // Deduplicate by mediaId or provider+externalId or normalized title+type
    const seen = new Set<string>();
    combined = combined.filter((item: any) => {
      const key = item.mediaId ? `media-${item.mediaId}` : `${item.provider}-${item.externalId}`;
      const titleKey = `${item.type}-${(item.title || '').trim().toLowerCase()}-${item.year || ''}`;
      if (seen.has(key) || (titleKey.length > 5 && seen.has(titleKey))) return false;
      seen.add(key);
      seen.add(titleKey);
      return true;
    });

    if (categoryFilter && categoryFilter !== 'ALL') {
      combined = combined.filter((item) => isMediaAllowedForTierCategory(item.type, categoryFilter));
    }

    // Exclude hidden media for non-SUPER_ADMIN users
    if (!isSuperAdmin && combined.length > 0) {
      const explicitMediaIds = combined.map((i: any) => i.mediaId).filter(Boolean);
      const extPairs = combined
        .filter((i: any) => !i.mediaId && i.provider && i.externalId)
        .map((i: any) => ({ provider: i.provider, externalId: String(i.externalId) }));

      const hiddenIds = new Set<number>();
      if (explicitMediaIds.length > 0) {
        const hiddenMediaRows = await db
          .select({ id: media.id })
          .from(media)
          .where(and(inArray(media.id, explicitMediaIds), eq(media.isHidden, true)));
        hiddenMediaRows.forEach((r) => hiddenIds.add(r.id));
      }

      const hiddenExtKeys = new Set<string>();
      if (extPairs.length > 0) {
        const extConds = extPairs.map((p) =>
          and(eq(mediaExternalIds.provider, p.provider), eq(mediaExternalIds.externalId, p.externalId))
        );
        const hiddenExtRows = await db
          .select({
            provider: mediaExternalIds.provider,
            externalId: mediaExternalIds.externalId,
          })
          .from(mediaExternalIds)
          .innerJoin(media, eq(mediaExternalIds.mediaId, media.id))
          .where(and(or(...extConds), eq(media.isHidden, true)));

        hiddenExtRows.forEach((r) => hiddenExtKeys.add(`${r.provider}:${r.externalId}`));
      }

      combined = combined.filter((item: any) => {
        if (item.mediaId && hiddenIds.has(item.mediaId)) return false;
        if (item.provider && item.externalId && hiddenExtKeys.has(`${item.provider}:${item.externalId}`)) return false;
        return true;
      });
    }

    // Post-filter on rating and year if specified
    if (filters.ratingFrom !== undefined) {
      combined = combined.filter((i) => i.rating === undefined || i.rating >= filters.ratingFrom!);
    }
    if (filters.ratingTo !== undefined) {
      combined = combined.filter((i) => i.rating === undefined || i.rating <= filters.ratingTo!);
    }
    if (filters.yearFrom !== undefined) {
      combined = combined.filter((i) => i.year === undefined || i.year >= filters.yearFrom!);
    }
    if (filters.yearTo !== undefined) {
      combined = combined.filter((i) => i.year === undefined || i.year <= filters.yearTo!);
    }

    // Resolve local mediaId for external provider items to link user data and Dodik ratings
    const unresolvedExt = combined
      .filter((i: any) => !i.mediaId && i.provider && i.externalId)
      .map((i: any) => ({ provider: String(i.provider).toUpperCase(), externalId: String(i.externalId) }));

    if (unresolvedExt.length > 0) {
      try {
        const extConditions = unresolvedExt.slice(0, 50).map((p) =>
          and(eq(mediaExternalIds.provider, p.provider), eq(mediaExternalIds.externalId, p.externalId))
        );
        if (extConditions.length > 0) {
          const matchedExternal = await db
            .select({
              provider: mediaExternalIds.provider,
              externalId: mediaExternalIds.externalId,
              mediaId: mediaExternalIds.mediaId,
            })
            .from(mediaExternalIds)
            .where(or(...extConditions));

          const extMap = new Map<string, number>();
          matchedExternal.forEach((me) => extMap.set(`${me.provider.toUpperCase()}:${me.externalId}`, me.mediaId));

          combined.forEach((item: any) => {
            if (!item.mediaId && item.provider && item.externalId) {
              const matchedId = extMap.get(`${String(item.provider).toUpperCase()}:${String(item.externalId)}`);
              if (matchedId) item.mediaId = matchedId;
            }
          });
        }
      } catch (err) {
        console.warn('Batch mediaExternalIds resolution error:', err);
      }
    }

    // Enrich items with user ratings/status, user reviews, and Dodik Tracker ratings
    const allMediaIds = combined.map((i: any) => i.mediaId).filter(Boolean);
    const userRatingsMap = new Map<number, number>();
    const userStatusMap = new Map<number, string>();
    const userReviewsSet = new Set<number>();
    const dodikRatingsMap = new Map<number, { averageRating: number | null; ratingCount: number }>();

    if (allMediaIds.length > 0) {
      // Fetch Dodik ratings
      const dodikRows = await db
        .select({
          mediaId: mediaRatings.mediaId,
          rating: mediaRatings.rating,
        })
        .from(mediaRatings)
        .where(inArray(mediaRatings.mediaId, allMediaIds));

      const ratingGroups = new Map<number, number[]>();
      dodikRows.forEach((r) => {
        if (!ratingGroups.has(r.mediaId)) ratingGroups.set(r.mediaId, []);
        ratingGroups.get(r.mediaId)!.push(r.rating);
      });

      ratingGroups.forEach((arr, mId) => {
        const count = arr.length;
        const avg = count > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / count) * 10) / 10 : null;
        dodikRatingsMap.set(mId, { averageRating: avg, ratingCount: count });
      });

      // Fetch User ratings, status, and reviews if user is authenticated
      if (req.dbUser) {
        const userMediaRows = await db
          .select({
            mediaId: userMedia.mediaId,
            rating: userMedia.rating,
            status: userMedia.status,
          })
          .from(userMedia)
          .where(and(eq(userMedia.userId, req.dbUser.id), inArray(userMedia.mediaId, allMediaIds)));

        userMediaRows.forEach((r) => {
          if (r.rating) userRatingsMap.set(r.mediaId, r.rating);
          if (r.status) userStatusMap.set(r.mediaId, r.status);
        });

        const userRatingRows = await db
          .select({
            mediaId: mediaRatings.mediaId,
            rating: mediaRatings.rating,
          })
          .from(mediaRatings)
          .where(and(eq(mediaRatings.userId, req.dbUser.id), inArray(mediaRatings.mediaId, allMediaIds)));

        userRatingRows.forEach((r) => {
          if (!userRatingsMap.has(r.mediaId)) userRatingsMap.set(r.mediaId, r.rating);
        });

        const userReviewRows = await db
          .select({ mediaId: reviews.mediaId })
          .from(reviews)
          .where(and(eq(reviews.userId, req.dbUser.id), inArray(reviews.mediaId, allMediaIds)));

        userReviewRows.forEach((r) => userReviewsSet.add(r.mediaId));
      }
    }

    // Attach enriched fields
    combined = combined.map((item: any) => {
      const mId = item.mediaId;
      const dodik = mId ? dodikRatingsMap.get(mId) : undefined;
      const uRating = mId ? userRatingsMap.get(mId) : undefined;
      const uStatus = mId ? userStatusMap.get(mId) : undefined;
      const hasRev = mId ? userReviewsSet.has(mId) : false;

      const computedDodikRating = dodik?.averageRating ?? (item.dodikRating !== undefined && item.dodikRating !== null ? item.dodikRating : null);
      const computedDodikCount = dodik?.ratingCount ?? item.dodikRatingCount ?? 0;

      return {
        ...item,
        dodikRating: computedDodikRating,
        dodikRatingCount: computedDodikCount,
        userRating: uRating || item.userRating || null,
        userStatus: uStatus || item.userStatus || null,
        hasUserReview: hasRev,
      };
    });

    // Personal Library Post-filters (when requested)
    if (filters.myStatus) {
      combined = combined.filter((i: any) => i.userStatus === filters.myStatus);
    }
    if (filters.inLibrary === 'in_library') {
      combined = combined.filter((i: any) => Boolean(i.userStatus));
    } else if (filters.inLibrary === 'not_in_library') {
      combined = combined.filter((i: any) => !i.userStatus);
    }

    if (filters.myRatingState === 'rated') {
      combined = combined.filter((i: any) => i.userRating !== null && i.userRating !== undefined);
    } else if (filters.myRatingState === 'unrated') {
      combined = combined.filter((i: any) => i.userRating === null || i.userRating === undefined);
    }

    if (filters.myRating !== undefined) {
      combined = combined.filter((i: any) => i.userRating === filters.myRating);
    }
    if (filters.myRatingFrom !== undefined) {
      combined = combined.filter((i: any) => i.userRating !== null && i.userRating !== undefined && i.userRating >= filters.myRatingFrom!);
    }
    if (filters.myRatingTo !== undefined) {
      combined = combined.filter((i: any) => i.userRating !== null && i.userRating !== undefined && i.userRating <= filters.myRatingTo!);
    }

    // Dodik Tracker Ratings Post-filter
    if (filters.dodikRatingFrom !== undefined) {
      combined = combined.filter((i: any) => i.dodikRating !== null && i.dodikRating !== undefined && i.dodikRating >= filters.dodikRatingFrom!);
    }
    if (filters.dodikRatingTo !== undefined) {
      combined = combined.filter((i: any) => i.dodikRating !== null && i.dodikRating !== undefined && i.dodikRating <= filters.dodikRatingTo!);
    }
    if (filters.dodikRatingCountFrom !== undefined) {
      combined = combined.filter((i: any) => (i.dodikRatingCount || 0) >= filters.dodikRatingCountFrom!);
    }

    if (filters.hasReview === 'with_review') {
      combined = combined.filter((i: any) => Boolean(i.hasUserReview));
    } else if (filters.hasReview === 'without_review') {
      combined = combined.filter((i: any) => !i.hasUserReview);
    }

    // Dodik Tracker Rating range post-filter
    if (filters.dodikRatingFrom !== undefined) {
      combined = combined.filter((i: any) => i.dodikRating !== null && i.dodikRating >= filters.dodikRatingFrom!);
    }
    if (filters.dodikRatingTo !== undefined) {
      combined = combined.filter((i: any) => i.dodikRating !== null && i.dodikRating <= filters.dodikRatingTo!);
    }
    if (filters.dodikRatingCountFrom !== undefined) {
      combined = combined.filter((i: any) => (i.dodikRatingCount || 0) >= filters.dodikRatingCountFrom!);
    }

    // Developer / Publisher post-filter
    if (filters.developer) {
      const devQuery = filters.developer.toLowerCase();
      combined = combined.filter((i: any) => {
        const devs = Array.isArray(i.developers) ? i.developers : [i.developer || ''];
        return devs.some((d: string) => String(d).toLowerCase().includes(devQuery));
      });
    }
    if (filters.publisher) {
      const pubQuery = filters.publisher.toLowerCase();
      combined = combined.filter((i: any) => {
        const pubs = Array.isArray(i.publishers) ? i.publishers : [i.publisher || ''];
        return pubs.some((p: string) => String(p).toLowerCase().includes(pubQuery));
      });
    }

    // Sorting logic
    if (filters.sortBy === 'relevance' || (!filters.sortBy && query)) {
      combined.sort((a: any, b: any) => {
        const relA = calculateSearchRelevance(a, query);
        const relB = calculateSearchRelevance(b, query);
        return relB - relA;
      });
    } else if ((filters.sortBy as string) === 'dodik_rating' || (filters.sortBy as string) === 'dodikRating') {
      const isAsc = filters.sortOrder === 'asc';
      combined.sort((a: any, b: any) => {
        const valA = a.dodikRating !== null && a.dodikRating !== undefined ? a.dodikRating : (isAsc ? 9999 : -1);
        const valB = b.dodikRating !== null && b.dodikRating !== undefined ? b.dodikRating : (isAsc ? 9999 : -1);
        return isAsc ? valA - valB : valB - valA;
      });
    } else if ((filters.sortBy as string) === 'dodik_votes' || (filters.sortBy as string) === 'dodikRatingCount') {
      const isAsc = filters.sortOrder === 'asc';
      combined.sort((a: any, b: any) => {
        const valA = a.dodikRatingCount ?? 0;
        const valB = b.dodikRatingCount ?? 0;
        return isAsc ? valA - valB : valB - valA;
      });
    } else if (filters.sortBy === 'rating') {
      const isAsc = filters.sortOrder === 'asc';
      combined.sort((a: any, b: any) => {
        const valA = a.rating ?? 0;
        const valB = b.rating ?? 0;
        return isAsc ? valA - valB : valB - valA;
      });
    } else if (filters.sortBy === 'release_date') {
      const isAsc = filters.sortOrder === 'asc';
      combined.sort((a: any, b: any) => {
        const valA = a.year ?? 0;
        const valB = b.year ?? 0;
        return isAsc ? valA - valB : valB - valA;
      });
    } else if (filters.sortBy === 'title') {
      const isAsc = filters.sortOrder === 'asc';
      combined.sort((a: any, b: any) => {
        const valA = String(a.title || '');
        const valB = String(b.title || '');
        return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    }

    combined = ContentVisibilityService.filterAccessibleContent(req.dbUser, combined, filters);

    res.json({
      results: combined,
      hasMore: hasMore || externalResults.length >= limit,
      page,
      limit,
    });
  } catch (err: any) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Ошибка при поиске медиа', results: [], hasMore: false, page: 1 });
  }
};

// Autocomplete search endpoint for fast typeahead
const mediaAutocompleteHandler = async (req: any, res: any) => {
  try {
    const rawQuery = String(req.query.q || req.query.query || '').trim();
    if (!rawQuery || rawQuery.length < 1) {
      return res.json({ results: [] });
    }

    const typeFilter = req.query.type ? String(req.query.type).toUpperCase() : undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '8'), 10) || 8, 1), 15);
    const isSuperAdmin = req.dbUser?.role === 'SUPER_ADMIN';

    // 1. Search local DB with LIKE matching on title and original title
    const localConditions: any[] = [];
    if (!isSuperAdmin) {
      localConditions.push(eq(media.isHidden, false));
    }
    const cleanQ = rawQuery.toLowerCase();
    localConditions.push(
      sql`(LOWER(${media.title}) LIKE ${'%' + cleanQ + '%'} OR LOWER(COALESCE(${media.originalTitle}, '')) LIKE ${'%' + cleanQ + '%'})`
    );

    if (typeFilter && typeFilter !== 'ALL') {
      localConditions.push(eq(media.type, typeFilter));
    }

    let localItems: any[] = [];
    try {
      localItems = await db
        .select()
        .from(media)
        .where(and(...localConditions))
        .limit(limit);
    } catch (e) {
      console.warn('Autocomplete local search err:', e);
    }

    let results: any[] = localItems.map((item) => ({
      provider: 'DODIK_DB',
      externalId: String(item.id),
      mediaId: item.id,
      type: item.type,
      title: item.title,
      originalTitle: item.originalTitle,
      year: item.year,
      posterUrl: item.posterUrl,
      rating: item.rating,
      dodikRating: item.dodikRating,
      isAdult: item.isAdult,
      ageRating: item.ageRating,
    }));

    // 2. If results are few and query length >= 2, supplement with fast provider search
    if (results.length < limit && rawQuery.length >= 2) {
      try {
        const ext = await providerManager.search(rawQuery, typeFilter, 1, limit);
        const extResults = ext.results || [];
        results = [...results, ...extResults];
      } catch (e) {
        // Ignore provider timeout for autocomplete
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    results = results.filter((item: any) => {
      const key = item.mediaId ? `media-${item.mediaId}` : `${item.provider}-${item.externalId}`;
      const titleKey = `${item.type}-${(item.title || '').trim().toLowerCase()}-${item.year || ''}`;
      if (seen.has(key) || (titleKey.length > 5 && seen.has(titleKey))) return false;
      seen.add(key);
      seen.add(titleKey);
      return true;
    });

    // Rank by relevance
    results.sort((a, b) => calculateSearchRelevance(b, rawQuery) - calculateSearchRelevance(a, rawQuery));

    // Filter 18+ content based on user preference
    results = ContentVisibilityService.filterAccessibleContent(req.dbUser, results);

    res.json({ results: results.slice(0, limit) });
  } catch (err: any) {
    res.json({ results: [] });
  }
};

apiRouter.get('/media/autocomplete', optionalAuth, mediaAutocompleteHandler);
apiRouter.get('/search/autocomplete', optionalAuth, mediaAutocompleteHandler);

apiRouter.get('/media/search', optionalAuth, mediaSearchHandler);
apiRouter.get('/search', optionalAuth, mediaSearchHandler);
apiRouter.get('/search/catalog', optionalAuth, mediaSearchHandler);
apiRouter.get('/media/catalog', optionalAuth, mediaSearchHandler);
apiRouter.get('/catalog', optionalAuth, mediaSearchHandler);

// Trending items with pagination and filters
apiRouter.get('/media/trending', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rawType = req.query.type ? String(req.query.type).toUpperCase() : 'ALL';
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 50);
    const filters = parseUnifiedFilters(req.query);

    const trendingRes = await providerManager.getTrending(rawType, page, limit, filters);
    let results = trendingRes.results || [];

    const isSuperAdmin = req.dbUser?.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && results.length > 0) {
      const explicitMediaIds = results.map((i: any) => i.mediaId).filter(Boolean);
      const extPairs = results
        .filter((i: any) => !i.mediaId && i.provider && i.externalId)
        .map((i: any) => ({ provider: i.provider, externalId: String(i.externalId) }));

      const hiddenIds = new Set<number>();
      if (explicitMediaIds.length > 0) {
        const hiddenMediaRows = await db
          .select({ id: media.id })
          .from(media)
          .where(and(inArray(media.id, explicitMediaIds), eq(media.isHidden, true)));
        hiddenMediaRows.forEach((r) => hiddenIds.add(r.id));
      }

      const hiddenExtKeys = new Set<string>();
      if (extPairs.length > 0) {
        const extConds = extPairs.map((p) =>
          and(eq(mediaExternalIds.provider, p.provider), eq(mediaExternalIds.externalId, p.externalId))
        );
        const hiddenExtRows = await db
          .select({
            provider: mediaExternalIds.provider,
            externalId: mediaExternalIds.externalId,
          })
          .from(mediaExternalIds)
          .innerJoin(media, eq(mediaExternalIds.mediaId, media.id))
          .where(and(or(...extConds), eq(media.isHidden, true)));

        hiddenExtRows.forEach((r) => hiddenExtKeys.add(`${r.provider}:${r.externalId}`));
      }

      results = results.filter((item: any) => {
        if (item.mediaId && hiddenIds.has(item.mediaId)) return false;
        if (item.provider && item.externalId && hiddenExtKeys.has(`${item.provider}:${item.externalId}`)) return false;
        return true;
      });
    }

    results = ContentVisibilityService.filterAccessibleContent(req.dbUser, results);

    res.json({
      results,
      hasMore: Boolean(trendingRes.hasMore),
      page,
      limit,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, results: [], hasMore: false, page: 1 });
  }
});

// Helper to ensure media exists in local DB, creating it from provider payload if necessary
export async function ensureMediaInDb(mediaPayload: any): Promise<any> {
  if (!mediaPayload) return null;

  let targetMedia: any = null;

  if (mediaPayload.provider && mediaPayload.externalId) {
    const foundExt = await db
      .select()
      .from(mediaExternalIds)
      .where(
        and(
          eq(mediaExternalIds.provider, mediaPayload.provider),
          eq(mediaExternalIds.externalId, String(mediaPayload.externalId))
        )
      )
      .limit(1);

    if (foundExt.length > 0) {
      const found = await db.select().from(media).where(eq(media.id, foundExt[0].mediaId)).limit(1);
      if (found.length > 0) {
        targetMedia = found[0];
      }
    }
  }

  if (!targetMedia) {
    const isAdult = ContentVisibilityService.isAdultContent(mediaPayload);
    const ageRating = mediaPayload.ageRating || mediaPayload.age_rating || mediaPayload.ratingAgeLimits || (isAdult ? '18+' : null);

    const [created] = await db
      .insert(media)
      .values({
        type: mediaPayload.type || 'MOVIE',
        title: mediaPayload.title || 'Без названия',
        originalTitle: mediaPayload.originalTitle || null,
        description: mediaPayload.description || null,
        posterUrl: mediaPayload.posterUrl || null,
        backdropUrl: mediaPayload.backdropUrl || null,
        releaseDate: mediaPayload.releaseDate || null,
        year: mediaPayload.year || null,
        rating: mediaPayload.rating || null,
        totalEpisodes: mediaPayload.totalEpisodes || 0,
        isAdult,
        ageRating,
      })
      .returning();

    targetMedia = created;

    if (mediaPayload.provider && mediaPayload.externalId) {
      await db.insert(mediaExternalIds).values({
        mediaId: targetMedia.id,
        provider: mediaPayload.provider,
        externalId: String(mediaPayload.externalId),
      });
    }
  }

  return targetMedia;
}

// Ensure media exists in local DB, creating it from provider payload if necessary
apiRouter.post('/media/ensure', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { mediaId, mediaPayload } = req.body;
    if (mediaId) {
      const found = await db.select().from(media).where(eq(media.id, Number(mediaId))).limit(1);
      if (found.length > 0) {
        return res.json({ mediaId: found[0].id, media: found[0] });
      }
    }

    if (!mediaPayload) {
      return res.status(400).json({ error: 'Не указаны данные медиа' });
    }

    const targetMedia = await ensureMediaInDb(mediaPayload);
    res.json({ mediaId: targetMedia.id, media: targetMedia });
  } catch (err: any) {
    console.error('Error ensuring media:', err);
    res.status(500).json({ error: err.message });
  }
});

// Single media details with rich provider information, crew, critic scores, and Dodik user scores
apiRouter.get('/media/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID медиа' });
    }
    const current = req.dbUser;
    let found = await db.select().from(media).where(eq(media.id, id)).limit(1);
    if (found.length === 0) {
      const byExt = await db
        .select()
        .from(mediaExternalIds)
        .where(eq(mediaExternalIds.externalId, String(id)))
        .limit(1);
      if (byExt.length > 0) {
        found = await db.select().from(media).where(eq(media.id, byExt[0].mediaId)).limit(1);
      }
    }

    // Auto-resolve if ID is an external ID not yet cached in local database
    if (found.length === 0) {
      let rawType = (req.query.type ? String(req.query.type).toUpperCase() : '') || '';
      if (rawType === 'GAMES') rawType = 'GAME';
      if (rawType === 'MOVIES') rawType = 'MOVIE';
      if (rawType === 'SERIES' || rawType === 'SHOWS') rawType = 'TV';
      if (rawType === 'BOOKS') rawType = 'BOOK';

      const candidateProviders: Array<{ provider: string; type: string }> = [];
      const requestedProvider = req.query.provider ? String(req.query.provider).toUpperCase() : '';

      if (requestedProvider) {
        candidateProviders.push({ provider: requestedProvider, type: rawType || 'GAME' });
      }

      if (rawType === 'GAME' || !rawType) {
        candidateProviders.push({ provider: 'RAWG', type: 'GAME' });
        candidateProviders.push({ provider: 'THEGAMESDB', type: 'GAME' });
        candidateProviders.push({ provider: 'IGDB', type: 'GAME' });
      }
      if (rawType === 'MOVIE' || !rawType) {
        candidateProviders.push({ provider: 'TMDB', type: 'MOVIE' });
        candidateProviders.push({ provider: 'KINOPOISK', type: 'MOVIE' });
      }
      if (rawType === 'TV' || !rawType) {
        candidateProviders.push({ provider: 'TMDB', type: 'TV' });
        candidateProviders.push({ provider: 'KINOPOISK', type: 'TV' });
      }
      if (rawType === 'ANIME' || !rawType) {
        candidateProviders.push({ provider: 'ANILIST', type: 'ANIME' });
      }
      if (rawType === 'MANGA' || !rawType) {
        candidateProviders.push({ provider: 'ANILIST', type: 'MANGA' });
      }
      if (rawType === 'BOOK' || !rawType) {
        candidateProviders.push({ provider: 'OPENLIBRARY', type: 'BOOK' });
      }

      for (const cand of candidateProviders) {
        try {
          const ext = await providerManager.getDetails(cand.provider, String(id), cand.type);
          if (ext && (ext.title || ext.originalTitle)) {
            const resolvedId = await ensureMediaRecord(undefined, {
              ...ext,
              provider: cand.provider,
              externalId: String(id),
              type: cand.type,
            });
            if (resolvedId) {
              found = await db.select().from(media).where(eq(media.id, resolvedId)).limit(1);
              if (found.length > 0) {
                break;
              }
            }
          }
        } catch (_e) {}
      }
    }

    if (found.length === 0) {
      return res.status(404).json({ error: 'Медиа не найдено' });
    }

    const item = found[0];

    const vis = ContentVisibilityService.canViewContent(current, item);
    if (!vis.allowed) {
      if (vis.reason === 'ADULT_RESTRICTED') {
        return res.status(403).json({ error: 'Контент 18+', isAdultRestricted: true, code: 'ADULT_RESTRICTED', media: item });
      }
      return res.status(404).json({ error: 'Медиа не найдено' });
    }

    const seasonsList = await db.select().from(seasons).where(eq(seasons.mediaId, item.id));

    // Look up external IDs for this item
    const extList = await db
      .select()
      .from(mediaExternalIds)
      .where(eq(mediaExternalIds.mediaId, item.id));

    let extDetails: any = null;
    if (extList.length > 0) {
      const primaryExt = extList[0];
      extDetails = await providerManager.getDetails(primaryExt.provider, primaryExt.externalId, item.type);
    } else {
      // Auto-discover provider ID if not yet linked
      try {
        const searchResultsRaw = await providerManager.search(item.title, item.type);
        const searchResults = searchResultsRaw.results;
        if (searchResults.length > 0) {
          const match = searchResults[0];
          await db.insert(mediaExternalIds).values({
            mediaId: item.id,
            provider: match.provider,
            externalId: String(match.externalId),
          }).catch(() => {});
          extDetails = await providerManager.getDetails(match.provider, String(match.externalId), item.type);
        }
      } catch (_e) {}
    }

    // Calculate Dodik Tracker rating & score distribution from mediaRatings table
    const dodikMetrics = await (async () => {
      const allRatings = await db
        .select({ rating: mediaRatings.rating, userId: mediaRatings.userId })
        .from(mediaRatings)
        .where(eq(mediaRatings.mediaId, item.id));

      const totalCount = allRatings.length;
      const avgRating = totalCount > 0
        ? Math.round((allRatings.reduce((acc, r) => acc + r.rating, 0) / totalCount) * 100) / 100
        : null;

      const distribution: Record<string, number> = {};
      for (let r = 0.5; r <= 10.0; r += 0.5) {
        distribution[r.toFixed(1)] = 0;
      }
      allRatings.forEach((r) => {
        const key = (Math.round(r.rating * 2) / 2).toFixed(1);
        if (distribution[key] !== undefined) {
          distribution[key]++;
        }
      });

      let userRating: number | null = null;
      if (current) {
        const found = allRatings.find((r) => r.userId === current.id);
        if (found) userRating = found.rating;
      }

      return {
        averageRating: avgRating,
        ratingCount: totalCount,
        distribution,
        userRating,
      };
    })();

    const dodikAverageRating = dodikMetrics.averageRating;
    const dodikRatingCount = dodikMetrics.ratingCount;
    const dodikDistribution = dodikMetrics.distribution;

    let userTracking = null;
    if (current) {
      const tracking = await db
        .select()
        .from(userMedia)
        .where(and(eq(userMedia.userId, current.id), eq(userMedia.mediaId, item.id)))
        .limit(1);
      if (tracking.length > 0) {
        userTracking = tracking[0];
      }
    }

    // Server-side translation & normalization layer for GAME media
    if (item.type === 'GAME') {
      try {
        const translation = await GameTranslator.translateGame({
          provider: extDetails?.provider || extList[0]?.provider || 'GAME',
          externalId: extDetails?.externalId || extList[0]?.externalId || String(item.id),
          title: extDetails?.originalTitle || item.originalTitle || extDetails?.title || item.title,
          description: extDetails?.description || item.description || undefined,
          genres: extDetails?.genres || [],
          tags: extDetails?.tags || [],
        });

        if (translation.title && translation.title !== item.title) {
          if (!item.originalTitle) {
            item.originalTitle = item.title;
          }
        }
        if (extDetails) {
          extDetails.title = translation.title;
          extDetails.originalTitle = extDetails.originalTitle || translation.originalTitle;
          extDetails.description = translation.description;
          extDetails.genres = translation.genres;
          extDetails.tags = translation.tags;
        } else {
          item.title = translation.title;
          item.description = translation.description || item.description;
        }
      } catch (err) {
        console.warn('[API /media/:id] Game translation error:', err);
      }
    }

    if (!item.ageRating && extDetails?.ageRating) {
      db.update(media).set({ ageRating: extDetails.ageRating }).where(eq(media.id, item.id)).catch(() => {});
    }

    res.json({
      ...item,
      ...(extDetails || {}),
      id: item.id,
      type: item.type,
      title: extDetails?.title || item.title || 'Без названия',
      originalTitle: extDetails?.originalTitle || item.originalTitle,
      description: extDetails?.description || item.description,
      posterUrl: extDetails?.posterUrl || item.posterUrl,
      backdropUrl: extDetails?.backdropUrl || item.backdropUrl,
      coverUrl: extDetails?.coverUrl || extDetails?.posterUrl || item.posterUrl,
      year: item.year || extDetails?.year,
      rating: extDetails?.rating || item.rating,
      dodikRating: {
        averageRating: dodikAverageRating,
        ratingCount: dodikRatingCount,
        distribution: dodikDistribution,
      },
      criticScore: extDetails?.criticScore || null,
      cast: extDetails?.cast || [],
      crew: extDetails?.crew || [],
      directors: extDetails?.directors || [],
      writers: extDetails?.writers || [],
      producers: extDetails?.producers || [],
      cinematographers: extDetails?.cinematographers || [],
      composers: extDetails?.composers || [],
      editors: extDetails?.editors || [],
      creators: extDetails?.creators || [],
      networks: extDetails?.networks || [],
      studios: extDetails?.studios || [],
      developers: extDetails?.developers || [],
      publishers: extDetails?.publishers || [],
      platforms: extDetails?.platforms || [],
      genres: extDetails?.genres || [],
      tags: extDetails?.tags || [],
      screenshots: extDetails?.screenshots || [],
      videos: extDetails?.videos || [],
      trailerUrl: extDetails?.trailerUrl || (extDetails?.videos?.[0]?.url) || undefined,
      website: extDetails?.website || undefined,
      seasons: extDetails?.seasons || seasonsList,
      similar: extDetails?.similar || [],
      ageRating: extDetails?.ageRating || item.ageRating || undefined,
      statusText: extDetails?.statusText || undefined,
      countries: extDetails?.countries || [],
      runtimeMinutes: extDetails?.runtimeMinutes || undefined,
      durationText: extDetails?.durationText || undefined,
      userTracking,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to compute Dodik Tracker metrics for media (1–10 scale)
async function computeDodikRatingData(mediaId: number, currentUserId?: number) {
  const allRatings = await db
    .select({ rating: mediaRatings.rating, userId: mediaRatings.userId })
    .from(mediaRatings)
    .where(eq(mediaRatings.mediaId, mediaId));

  const totalCount = allRatings.length;
  // Normalize any legacy ratings if stored on a 100-scale
  const normalizedRatings = allRatings.map((r) => ({
    userId: r.userId,
    rating: r.rating > 10 ? Math.min(10, Math.max(1, Math.round(r.rating / 10))) : Math.min(10, Math.max(1, r.rating)),
  }));

  const avgRating = totalCount > 0
    ? Math.round((normalizedRatings.reduce((acc, r) => acc + r.rating, 0) / totalCount) * 10) / 10
    : null;

  // Distribution on a 1..10 scale
  const distribution: Record<string, number> = {
    '10': 0,
    '9': 0,
    '8': 0,
    '7': 0,
    '6': 0,
    '5': 0,
    '4': 0,
    '3': 0,
    '2': 0,
    '1': 0,
  };

  normalizedRatings.forEach((r) => {
    const key = String(Math.round(r.rating));
    if (distribution[key] !== undefined) {
      distribution[key]++;
    }
  });

  // Always keep media.dodikRating and media.dodikRatingCount synchronized in DB
  await db
    .update(media)
    .set({
      dodikRating: avgRating,
      dodikRatingCount: totalCount,
      updatedAt: new Date(),
    })
    .where(eq(media.id, mediaId))
    .catch((err) => console.warn('[computeDodikRatingData] update media error:', err));

  let userRating: number | null = null;
  if (currentUserId) {
    const found = normalizedRatings.find((r) => r.userId === currentUserId);
    if (found) userRating = Math.round(found.rating);
  }

  return {
    averageRating: avgRating,
    ratingCount: totalCount,
    distribution,
    userRating,
    average: avgRating,
    count: totalCount,
    myRating: userRating,
  };
}

// Handler for Setting or Updating a Rating (1 to 10 integer scale)
const setRatingHandler = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    if (!user) {
      return res.status(401).json({ error: 'Требуется авторизация для выставления оценки' });
    }

    const idParam = req.params.id;
    let mediaId = parseInt(idParam, 10);
    const rawVal = req.body.rating !== undefined ? req.body.rating : (req.body.score !== undefined ? req.body.score : req.body.value);

    if (rawVal === undefined || rawVal === null || rawVal === '') {
      return res.status(400).json({ error: 'Параметр rating обязателен' });
    }

    let numRating = Number(rawVal);
    if (isNaN(numRating) || !Number.isFinite(numRating) || numRating <= 0) {
      return res.status(400).json({ error: 'Оценка должна быть числом от 1 до 10' });
    }

    // If passed on legacy 100-scale, normalize to 1..10
    if (numRating > 10) {
      numRating = Math.min(10, Math.max(1, Math.round(numRating / 10)));
    } else {
      numRating = Math.min(10, Math.max(1, Math.round(numRating)));
    }

    const rating = numRating;

    let targetMedia: any = null;
    if (!isNaN(mediaId)) {
      const [found] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
      if (found) targetMedia = found;
    }

    // Auto-resolve by external ID if not found directly
    if (!targetMedia) {
      const byExt = await db
        .select()
        .from(mediaExternalIds)
        .where(eq(mediaExternalIds.externalId, String(idParam)))
        .limit(1);
      if (byExt.length > 0) {
        const [found] = await db.select().from(media).where(eq(media.id, byExt[0].mediaId)).limit(1);
        if (found) targetMedia = found;
      }
    }

    // If mediaPayload provided in request body, ensure media exists
    if (!targetMedia && req.body.mediaPayload) {
      targetMedia = await ensureMediaInDb(req.body.mediaPayload);
    }

    if (!targetMedia) {
      return res.status(404).json({ error: 'Медиа не найдено' });
    }

    mediaId = targetMedia.id;

    // Upsert into mediaRatings (Guaranteed uniqueness via uniqueIndex user_media_unq)
    const [existingRating] = await db
      .select()
      .from(mediaRatings)
      .where(and(eq(mediaRatings.userId, user.id), eq(mediaRatings.mediaId, mediaId)))
      .limit(1);

    if (existingRating) {
      await db
        .update(mediaRatings)
        .set({ rating, updatedAt: new Date() })
        .where(eq(mediaRatings.id, existingRating.id));
    } else {
      await db.insert(mediaRatings).values({
        userId: user.id,
        mediaId,
        rating,
      });

      await db.insert(activities).values({
        userId: user.id,
        type: 'MEDIA_RATED',
        mediaId,
        details: JSON.stringify({ rating }),
      }).catch((e) => console.warn('[Activity insert] error:', e));
    }

    // Sync rating to userMedia table if user has this in their library
    const [userMediaEntry] = await db
      .select()
      .from(userMedia)
      .where(and(eq(userMedia.userId, user.id), eq(userMedia.mediaId, mediaId)))
      .limit(1);

    if (userMediaEntry) {
      await db
        .update(userMedia)
        .set({ rating, updatedAt: new Date() })
        .where(eq(userMedia.id, userMediaEntry.id));
    }

    // Recalculate Dodik Tracker stats
    const dodikRating = await computeDodikRatingData(mediaId, user.id);

    await achievementService.checkAndUnlock(user.id, 'MEDIA_ADDED', { ratingCount: dodikRating.ratingCount }).catch(() => {});

    res.json({
      success: true,
      mediaId,
      average: dodikRating.averageRating,
      count: dodikRating.ratingCount,
      myRating: rating,
      userRating: rating,
      dodikRating,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// Handler for Deleting a Rating
const deleteRatingHandler = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    if (!user) {
      return res.status(401).json({ error: 'Требуется авторизация для удаления оценки' });
    }

    const idParam = req.params.id;
    let mediaId = parseInt(idParam, 10);

    if (isNaN(mediaId)) {
      const byExt = await db
        .select()
        .from(mediaExternalIds)
        .where(eq(mediaExternalIds.externalId, String(idParam)))
        .limit(1);
      if (byExt.length > 0) {
        mediaId = byExt[0].mediaId;
      } else {
        return res.status(400).json({ error: 'Некорректный ID медиа' });
      }
    }

    await db
      .delete(mediaRatings)
      .where(and(eq(mediaRatings.userId, user.id), eq(mediaRatings.mediaId, mediaId)));

    await db
      .update(userMedia)
      .set({ rating: null, updatedAt: new Date() })
      .where(and(eq(userMedia.userId, user.id), eq(userMedia.mediaId, mediaId)));

    const dodikRating = await computeDodikRatingData(mediaId, user.id);

    res.json({
      success: true,
      mediaId,
      average: dodikRating.averageRating,
      count: dodikRating.ratingCount,
      myRating: null,
      userRating: null,
      dodikRating,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// Handler for Getting Dodik & External Ratings for media
const getRatingsHandler = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const idParam = req.params.id;
    let mediaId = parseInt(idParam, 10);

    let mediaItem: any = null;
    if (!isNaN(mediaId)) {
      const [found] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
      if (found) mediaItem = found;
    }

    if (!mediaItem) {
      const byExt = await db
        .select()
        .from(mediaExternalIds)
        .where(eq(mediaExternalIds.externalId, String(idParam)))
        .limit(1);
      if (byExt.length > 0) {
        mediaId = byExt[0].mediaId;
        const [found] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
        if (found) mediaItem = found;
      }
    }

    if (!mediaItem) {
      // Return empty stats gracefully if not in DB yet
      return res.json({
        mediaId: isNaN(mediaId) ? idParam : mediaId,
        average: null,
        count: 0,
        myRating: null,
        userRating: null,
        externalRatings: [],
        dodikRating: {
          averageRating: null,
          ratingCount: 0,
          distribution: {},
          userRating: null,
        },
      });
    }

    const dodikRating = await computeDodikRatingData(mediaItem.id, user?.id);

    const extIds = await db
      .select()
      .from(mediaExternalIds)
      .where(eq(mediaExternalIds.mediaId, mediaItem.id));

    const externalRatings: { source: string; score: number; max: number }[] = [];

    // Distinct external rating (from TMDB, RAWG, Kinopoisk, etc.)
    if (mediaItem.rating && mediaItem.rating > 0) {
      const sourceName = mediaItem.type === 'GAME' ? 'RAWG / IGDB' : mediaItem.type === 'ANIME' ? 'AniList' : 'TMDB / Кинопоиск';
      externalRatings.push({
        source: sourceName,
        score: Math.round(mediaItem.rating * 10) / 10,
        max: 10,
      });
    }

    extIds.forEach((ext) => {
      if (!externalRatings.some((r) => r.source === ext.provider)) {
        externalRatings.push({
          source: ext.provider,
          score: mediaItem.rating ? Math.round(mediaItem.rating * 10) / 10 : 8.0,
          max: 10,
        });
      }
    });

    res.json({
      mediaId: mediaItem.id,
      average: dodikRating.averageRating,
      count: dodikRating.ratingCount,
      myRating: dodikRating.userRating,
      userRating: dodikRating.userRating,
      dodikRating,
      externalRatings,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// Ratings API Routes (both /media/:id and /content/:id conventions)
apiRouter.post('/media/:id/rating', requireAuth, setRatingHandler);
apiRouter.put('/media/:id/rating', requireAuth, setRatingHandler);
apiRouter.post('/media/:id/dodik-rating', requireAuth, setRatingHandler);
apiRouter.post('/media/:id/rate', requireAuth, setRatingHandler);
apiRouter.post('/content/:id/rating', requireAuth, setRatingHandler);
apiRouter.put('/content/:id/rating', requireAuth, setRatingHandler);

apiRouter.delete('/media/:id/rating', requireAuth, deleteRatingHandler);
apiRouter.delete('/media/:id/dodik-rating', requireAuth, deleteRatingHandler);
apiRouter.delete('/media/:id/rate', requireAuth, deleteRatingHandler);
apiRouter.delete('/content/:id/rating', requireAuth, deleteRatingHandler);

apiRouter.get('/media/:id/ratings', optionalAuth, getRatingsHandler);
apiRouter.get('/media/:id/rating', optionalAuth, getRatingsHandler);
apiRouter.get('/media/:id/dodik-rating', optionalAuth, getRatingsHandler);
apiRouter.get('/content/:id/rating', optionalAuth, getRatingsHandler);

// Get current user's rating for specific media or all ratings
apiRouter.get('/ratings/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const mediaIdParam = req.query.mediaId ? parseInt(String(req.query.mediaId), 10) : undefined;

    if (mediaIdParam && !isNaN(mediaIdParam)) {
      const [ratingRow] = await db
        .select()
        .from(mediaRatings)
        .where(and(eq(mediaRatings.userId, user.id), eq(mediaRatings.mediaId, mediaIdParam)))
        .limit(1);

      return res.json({
        mediaId: mediaIdParam,
        rating: ratingRow?.rating ?? null,
        createdAt: ratingRow?.createdAt ?? null,
        updatedAt: ratingRow?.updatedAt ?? null,
      });
    }

    const userRatingsList = await db
      .select({
        id: mediaRatings.id,
        mediaId: mediaRatings.mediaId,
        rating: mediaRatings.rating,
        createdAt: mediaRatings.createdAt,
        updatedAt: mediaRatings.updatedAt,
        mediaTitle: media.title,
        mediaType: media.type,
        mediaPoster: media.posterUrl,
        mediaYear: media.year,
      })
      .from(mediaRatings)
      .innerJoin(media, eq(mediaRatings.mediaId, media.id))
      .where(eq(mediaRatings.userId, user.id))
      .orderBy(desc(mediaRatings.updatedAt));

    res.json(userRatingsList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update user adult content setting directly
apiRouter.post('/users/me/adult-content', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const enabled = Boolean(req.body.enabled);

    await db.update(users).set({ showAdultContent: enabled }).where(eq(users.id, user.id));

    res.json({ success: true, showAdultContent: enabled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// News comments & reactions
apiRouter.get('/news/:id/comments', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const newsId = parseInt(req.params.id, 10);
    if (isNaN(newsId)) return res.status(400).json({ error: 'Некорректный ID новости' });

    const commentsList = await db
      .select({
        id: newsComments.id,
        newsId: newsComments.newsId,
        userId: newsComments.userId,
        parentId: newsComments.parentId,
        content: newsComments.content,
        createdAt: newsComments.createdAt,
        updatedAt: newsComments.updatedAt,
        authorUsername: users.username,
        authorAvatar: users.avatar,
        authorRole: users.role,
      })
      .from(newsComments)
      .innerJoin(users, eq(newsComments.userId, users.id))
      .where(and(eq(newsComments.newsId, newsId), eq(newsComments.isHidden, false)))
      .orderBy(asc(newsComments.createdAt));

    res.json({ comments: commentsList });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/news/:id/comments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const newsId = parseInt(req.params.id, 10);
    const { content, parentId } = req.body;

    if (isNaN(newsId)) return res.status(400).json({ error: 'Некорректный ID новости' });
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Текст комментария не может быть пустым' });
    }

    const [comment] = await db
      .insert(newsComments)
      .values({
        newsId,
        userId: user.id,
        parentId: parentId ? parseInt(String(parentId), 10) : null,
        content: String(content).trim(),
      })
      .returning();

    res.json({
      comment: {
        ...comment,
        authorUsername: user.username,
        authorAvatar: user.avatar,
        authorRole: user.role,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/news/comments/:commentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const commentId = parseInt(req.params.commentId, 10);
    if (isNaN(commentId)) return res.status(400).json({ error: 'Некорректный ID комментария' });

    const [existing] = await db.select().from(newsComments).where(eq(newsComments.id, commentId)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Комментарий не найден' });

    const isOwner = existing.userId === user.id;
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'MODERATOR';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Нет прав для удаления комментария' });
    }

    await db.delete(newsComments).where(eq(newsComments.id, commentId));
    res.json({ success: true, commentId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/news/:id/reactions', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const newsId = parseInt(req.params.id, 10);
    if (isNaN(newsId)) return res.status(400).json({ error: 'Некорректный ID новости' });

    const reactionsList = await db
      .select({
        emoji: newsReactions.emoji,
        userId: newsReactions.userId,
      })
      .from(newsReactions)
      .where(eq(newsReactions.newsId, newsId));

    const counts: Record<string, number> = {};
    const userEmojis: string[] = [];

    reactionsList.forEach((r) => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
      if (req.dbUser && r.userId === req.dbUser.id) {
        userEmojis.push(r.emoji);
      }
    });

    res.json({ counts, userEmojis });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/news/:id/reactions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const newsId = parseInt(req.params.id, 10);
    const { emoji } = req.body;

    if (isNaN(newsId)) return res.status(400).json({ error: 'Некорректный ID новости' });
    if (!emoji || !String(emoji).trim()) {
      return res.status(400).json({ error: 'Не указан эмодзи' });
    }

    const cleanEmoji = String(emoji).trim();

    const [existing] = await db
      .select()
      .from(newsReactions)
      .where(
        and(
          eq(newsReactions.newsId, newsId),
          eq(newsReactions.userId, user.id),
          eq(newsReactions.emoji, cleanEmoji)
        )
      )
      .limit(1);

    if (existing) {
      await db.delete(newsReactions).where(eq(newsReactions.id, existing.id));
    } else {
      await db.insert(newsReactions).values({
        newsId,
        userId: user.id,
        emoji: cleanEmoji,
      });
    }

    const reactionsList = await db
      .select({ emoji: newsReactions.emoji, userId: newsReactions.userId })
      .from(newsReactions)
      .where(eq(newsReactions.newsId, newsId));

    const counts: Record<string, number> = {};
    const userEmojis: string[] = [];

    reactionsList.forEach((r) => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
      if (r.userId === user.id) {
        userEmojis.push(r.emoji);
      }
    });

    res.json({ success: true, counts, userEmojis });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Taste comparison endpoint
apiRouter.get('/users/:username/taste-comparison', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const currentUser = req.dbUser!;
    const targetUsername = req.params.username.trim();

    const [targetUser] = await db
      .select()
      .from(users)
      .where(ilike(users.username, targetUsername))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (targetUser.id === currentUser.id) {
      return res.status(400).json({ error: 'Нельзя сравнивать вкусы с самим собой' });
    }

    const myItems = await db
      .select({
        mediaId: userMedia.mediaId,
        rating: userMedia.rating,
        status: userMedia.status,
        type: media.type,
        title: media.title,
        posterUrl: media.posterUrl,
        genres: media.genres,
      })
      .from(userMedia)
      .innerJoin(media, eq(userMedia.mediaId, media.id))
      .where(eq(userMedia.userId, currentUser.id));

    const targetItems = await db
      .select({
        mediaId: userMedia.mediaId,
        rating: userMedia.rating,
        status: userMedia.status,
        type: media.type,
        title: media.title,
        posterUrl: media.posterUrl,
        genres: media.genres,
      })
      .from(userMedia)
      .innerJoin(media, eq(userMedia.mediaId, media.id))
      .where(eq(userMedia.userId, targetUser.id));

    const targetMap = new Map(targetItems.map((item) => [item.mediaId, item]));
    const sharedMedia: any[] = [];
    let scoreDiffSum = 0;
    let scoreComparisonCount = 0;

    myItems.forEach((myItem) => {
      const targetItem = targetMap.get(myItem.mediaId);
      if (targetItem) {
        sharedMedia.push({
          mediaId: myItem.mediaId,
          title: myItem.title,
          type: myItem.type,
          posterUrl: myItem.posterUrl,
          myRating: myItem.rating,
          targetRating: targetItem.rating,
        });

        if (myItem.rating && targetItem.rating) {
          scoreDiffSum += Math.abs(myItem.rating - targetItem.rating);
          scoreComparisonCount++;
        }
      }
    });

    let compatibilityScore = 75;
    if (scoreComparisonCount > 0) {
      const avgDiff = scoreDiffSum / scoreComparisonCount;
      compatibilityScore = Math.max(10, Math.min(100, Math.round(100 - (avgDiff / 10) * 100)));
    } else if (sharedMedia.length > 0) {
      compatibilityScore = 70 + Math.min(25, sharedMedia.length * 5);
    }

    const genreCounts: Record<string, number> = {};
    sharedMedia.forEach((item) => {
      let gList: string[] = [];
      try {
        if (typeof item.genres === 'string') gList = JSON.parse(item.genres);
        else if (Array.isArray(item.genres)) gList = item.genres;
      } catch (_e) {}
      gList.forEach((g) => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });

    const topSharedGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre]) => genre);

    res.json({
      targetUser: sanitizeUser(targetUser),
      compatibilityScore,
      sharedCount: sharedMedia.length,
      topSharedGenres,
      sharedMedia: sharedMedia.slice(0, 20),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Share media with friends or specific users
apiRouter.post('/media/:id/share', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const mediaId = parseInt(req.params.id, 10);
    const { targetUserIds, targetUserId, recipientUserId, recipientUsername, note, rating, isCompletion } = req.body;

    let targetIds: number[] = [];
    if (Array.isArray(targetUserIds)) {
      targetIds = targetUserIds.map((id: any) => parseInt(id, 10)).filter((id: number) => !isNaN(id) && id !== user.id);
    } else if (targetUserId || recipientUserId) {
      const singleId = parseInt(String(targetUserId || recipientUserId), 10);
      if (!isNaN(singleId) && singleId !== user.id) {
        targetIds = [singleId];
      }
    } else if (recipientUsername) {
      const [foundUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, String(recipientUsername).trim()))
        .limit(1);
      if (foundUser && foundUser.id !== user.id) {
        targetIds = [foundUser.id];
      }
    }

    if (targetIds.length === 0) {
      return res.status(400).json({ error: 'Укажите пользователей, с которыми хотите поделиться' });
    }

    const [mediaItem] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
    if (!mediaItem) {
      return res.status(404).json({ error: 'Контент не найден' });
    }

    const mediaTitle = mediaItem.title || mediaItem.originalTitle || 'контент';
    const alreadyShared: number[] = [];
    let sentCount = 0;

    // Check recent shares within the last 1 hour to prevent notification spam
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const recentNotifs = await db
      .select({ recipientUserId: notifications.recipientUserId })
      .from(notifications)
      .where(
        and(
          eq(notifications.actorUserId, user.id),
          eq(notifications.type, 'CONTENT_SHARED'),
          eq(notifications.entityId, String(mediaId)),
          gte(notifications.createdAt, oneHourAgo)
        )
      );

    const recentRecipients = new Set(recentNotifs.map((n) => n.recipientUserId));

    for (const rid of targetIds) {
      if (recentRecipients.has(rid)) {
        alreadyShared.push(rid);
        continue;
      }

      await notificationService.notifyContentShared(
        { id: user.id, username: user.username, avatar: user.avatar },
        rid,
        mediaTitle,
        mediaItem.id,
        mediaItem.type,
        {
          note: note ? String(note).trim() : undefined,
          rating: rating !== undefined && rating !== null ? Number(rating) : undefined,
          isCompletion: Boolean(isCompletion),
        }
      );
      sentCount++;
    }

    // Create activity record if at least one notification was sent
    if (sentCount > 0) {
      await db.insert(activities).values({
        userId: user.id,
        type: 'CONTENT_SHARED',
        mediaId: mediaItem.id,
        details: JSON.stringify({ isCompletion: Boolean(isCompletion), mediaTitle }),
      }).catch((e) => console.warn('[Activity insert] error:', e));
    }

    res.json({
      ok: true,
      sentCount,
      alreadyShared,
      message: sentCount > 0
        ? `Вы поделились «${mediaTitle}» (${sentCount} ${sentCount === 1 ? 'получатель' : 'получателей'})!`
        : 'Вы уже недавно делились этим контентом с выбранными пользователями.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check who we already shared this media with recently (within 24h)
apiRouter.get('/media/:id/share-status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const mediaId = parseInt(req.params.id, 10);
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000);

    const recentNotifs = await db
      .select({
        recipientUserId: notifications.recipientUserId,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.actorUserId, user.id),
          eq(notifications.type, 'CONTENT_SHARED'),
          eq(notifications.entityId, String(mediaId)),
          gte(notifications.createdAt, oneDayAgo)
        )
      );

    const sharedUserIds = Array.from(new Set(recentNotifs.map((n) => n.recipientUserId)));
    res.json({ sharedUserIds });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reviews for a specific media item
apiRouter.get('/media/:id/reviews', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const mediaId = parseInt(req.params.id, 10);
    const current = req.dbUser;

    const reviewRows = await db
      .select({
        id: reviews.id,
        userId: reviews.userId,
        mediaId: reviews.mediaId,
        rating: reviews.rating,
        title: reviews.title,
        content: reviews.content,
        containsSpoilers: reviews.containsSpoilers,
        likesCount: reviews.likesCount,
        createdAt: reviews.createdAt,
        updatedAt: reviews.updatedAt,
        authorUsername: users.username,
        authorAvatar: users.avatar,
        authorRole: users.role,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.mediaId, mediaId))
      .orderBy(desc(reviews.createdAt));

    let userLikedReviewIds = new Set<number>();
    let userReactionMap = new Map<number, string>();
    let reactionsCountMap = new Map<number, Record<string, number>>();

    if (reviewRows.length > 0) {
      const reviewIds = reviewRows.map((r) => r.id);

      // Fetch review reactions from review_reactions table
      const reactionsList = await db
        .select({
          reviewId: reviewReactions.reviewId,
          userId: reviewReactions.userId,
          type: reviewReactions.type,
        })
        .from(reviewReactions)
        .where(inArray(reviewReactions.reviewId, reviewIds));

      for (const rx of reactionsList) {
        if (!reactionsCountMap.has(rx.reviewId)) {
          reactionsCountMap.set(rx.reviewId, {});
        }
        const counts = reactionsCountMap.get(rx.reviewId)!;
        counts[rx.type] = (counts[rx.type] || 0) + 1;

        if (current && rx.userId === current.id) {
          userReactionMap.set(rx.reviewId, rx.type);
          if (rx.type === 'LIKE') {
            userLikedReviewIds.add(rx.reviewId);
          }
        }
      }

      // Also check legacy likes table if current user liked
      if (current) {
        const legacyLikes = await db
          .select()
          .from(likes)
          .where(
            and(
              eq(likes.userId, current.id),
              eq(likes.targetType, 'REVIEW'),
              inArray(likes.targetId, reviewIds)
            )
          );
        for (const l of legacyLikes) {
          userLikedReviewIds.add(l.targetId);
          if (!userReactionMap.has(l.targetId)) {
            userReactionMap.set(l.targetId, 'LIKE');
          }
        }
      }
    }

    const formatted = reviewRows.map((r) => {
      const counts = reactionsCountMap.get(r.id) || {};
      const calculatedLikes = (counts['LIKE'] || 0) > 0 ? (counts['LIKE'] || 0) : (r.likesCount || 0);

      return {
        ...r,
        score: r.rating,
        authorUsername: r.authorUsername,
        authorAvatar: r.authorAvatar,
        username: r.authorUsername,
        avatar: r.authorAvatar,
        user: {
          id: r.userId,
          username: r.authorUsername,
          displayName: r.authorUsername,
          avatarUrl: r.authorAvatar || undefined,
        },
        userLiked: userLikedReviewIds.has(r.id),
        userReaction: userReactionMap.get(r.id) || (userLikedReviewIds.has(r.id) ? 'LIKE' : null),
        reactions: counts,
        likesCount: calculatedLikes,
        isOwn: current ? current.id === r.userId : false,
      };
    });

    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create or update review for media
apiRouter.post('/media/:id/reviews', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const mediaId = parseInt(req.params.id, 10);
    const { rating, score, title, content, containsSpoilers } = req.body;
    const effectiveRating = rating !== undefined ? rating : score;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Текст отзыва обязателен' });
    }

    const foundMedia = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
    if (foundMedia.length === 0) {
      return res.status(404).json({ error: 'Медиа не найдено' });
    }

    const existing = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.userId, user.id), eq(reviews.mediaId, mediaId)))
      .limit(1);

    let cleanReviewRating: number | null = null;
    if (effectiveRating !== undefined && effectiveRating !== null && effectiveRating !== '') {
      const num = Number(effectiveRating);
      if (!isNaN(num) && Number.isFinite(num)) {
        cleanReviewRating = Math.max(0, Math.min(100, Math.round(num)));
      }
    }

    let savedReview;
    if (existing.length > 0) {
      [savedReview] = await db
        .update(reviews)
        .set({
          rating: cleanReviewRating !== null ? cleanReviewRating : existing[0].rating,
          title: title !== undefined ? title : existing[0].title,
          content: content.trim(),
          containsSpoilers: !!containsSpoilers,
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, existing[0].id))
        .returning();
    } else {
      [savedReview] = await db
        .insert(reviews)
        .values({
          userId: user.id,
          mediaId,
          rating: cleanReviewRating,
          title: title?.trim() || null,
          content: content.trim(),
          containsSpoilers: !!containsSpoilers,
        })
        .returning();

      // Log activity
      await db.insert(activities).values({
        userId: user.id,
        type: 'REVIEW_ADDED',
        mediaId,
        details: JSON.stringify({
          reviewId: savedReview.id,
          rating: effectiveRating,
          title: savedReview.title,
          snippet: content.slice(0, 200),
          containsSpoilers: !!savedReview.containsSpoilers,
        }),
      }).catch((e) => console.warn('[Review Activity] insert error:', e));
      // Trigger review achievement
      achievementService.checkAndUnlock(user.id, 'REVIEW_WRITTEN', { reviewId: savedReview.id }).catch(() => {});

      // Dispatch FRIEND_REVIEW notifications to user's friends
      (async () => {
        try {
          const friendsList = await db
            .select()
            .from(friendRequests)
            .where(
              and(
                eq(friendRequests.status, 'ACCEPTED'),
                or(eq(friendRequests.senderId, user.id), eq(friendRequests.receiverId, user.id))
              )
            );
          const friendIds = friendsList.map((f) => (f.senderId === user.id ? f.receiverId : f.senderId));

          const [targetMedia] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
          const mediaTitle = targetMedia?.title || targetMedia?.originalTitle || 'контенту';

          for (const fid of friendIds) {
            notificationService.notifyFriendReview(
              { id: user.id, username: user.username, avatar: user.avatar },
              fid,
              { id: mediaId, title: mediaTitle, type: targetMedia?.type },
              title ? `${title}: ${content.slice(0, 70)}` : content.slice(0, 80)
            ).catch(() => {});
          }

          // Mention notifications: check for @username in review content
          const mentions = content.match(/@([a-zA-Z0-9_-]+)/g);
          if (mentions && mentions.length > 0) {
            const usernames: string[] = Array.from(new Set(mentions.map((m) => m.slice(1))));
            if (usernames.length > 0) {
              const foundUsers = await db
                .select({ id: users.id, username: users.username })
                .from(users)
                .where(inArray(users.username, usernames));
              for (const u of foundUsers) {
                if (u.id !== user.id) {
                  notificationService.notifyMention(
                    { id: user.id, username: user.username, avatar: user.avatar },
                    u.id,
                    content.slice(0, 100),
                    `/media/${targetMedia?.type?.toLowerCase() || 'any'}/${mediaId}`
                  ).catch(() => {});
                }
              }
            }
          }
        } catch (err) {
          console.warn('[Review Notification] Dispatch error:', err);
        }
      })();
    }

    // Sync rating to userMedia and mediaRatings
    if (cleanReviewRating !== null) {
      const um = await db
        .select()
        .from(userMedia)
        .where(and(eq(userMedia.userId, user.id), eq(userMedia.mediaId, mediaId)))
        .limit(1);
      if (um.length > 0) {
        await db
          .update(userMedia)
          .set({ rating: cleanReviewRating, updatedAt: new Date() })
          .where(eq(userMedia.id, um[0].id));
      } else {
        const [targetMedia] = await db
          .select({ type: media.type })
          .from(media)
          .where(eq(media.id, mediaId))
          .limit(1);

        const defaultStatus = (targetMedia?.type === 'GAME') ? 'PLANNING' : 'PLAN_TO_WATCH';

        await db.insert(userMedia).values({
          userId: user.id,
          mediaId,
          rating: cleanReviewRating,
          status: defaultStatus,
        });
      }

      // Upsert into mediaRatings
      const [existingRating] = await db
        .select()
        .from(mediaRatings)
        .where(and(eq(mediaRatings.userId, user.id), eq(mediaRatings.mediaId, mediaId)))
        .limit(1);

      if (existingRating) {
        await db
          .update(mediaRatings)
          .set({ rating: cleanReviewRating, updatedAt: new Date() })
          .where(eq(mediaRatings.id, existingRating.id));
      } else {
        await db.insert(mediaRatings).values({
          userId: user.id,
          mediaId,
          rating: cleanReviewRating,
        });
      }

      await computeDodikRatingData(mediaId, user.id).catch(() => {});
    }

    // Return complete review with author metadata
    res.json({
      ...savedReview,
      score: savedReview.rating,
      authorUsername: user.username,
      authorAvatar: user.avatar,
      username: user.username,
      avatar: user.avatar,
      authorRole: user.role,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.username,
        avatarUrl: user.avatar || undefined,
      },
      isOwn: true,
      userLiked: false,
      userReaction: null,
      reactions: {},
      likesCount: savedReview.likesCount || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update review by ID
apiRouter.put(['/reviews/:id', '/media/:mediaId/reviews/:id'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const { rating, score, title, content, containsSpoilers } = req.body;
    const effectiveRating = rating !== undefined ? rating : score;

    const found = await db.select().from(reviews).where(eq(reviews.id, id)).limit(1);
    if (found.length === 0) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    const reviewItem = found[0];
    const isOwner = reviewItem.userId === user.id;
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'MODERATOR';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Нет прав для редактирования этого отзыва' });
    }

    // Always fetch the real author of the review, regardless of whether owner or admin is editing
    const [authorUser] = await db
      .select({
        id: users.id,
        username: users.username,
        avatar: users.avatar,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, reviewItem.userId))
      .limit(1);

    const [updated] = await db
      .update(reviews)
      .set({
        rating: effectiveRating !== undefined ? effectiveRating : reviewItem.rating,
        title: title !== undefined ? title : reviewItem.title,
        content: content !== undefined ? content.trim() : reviewItem.content,
        containsSpoilers: containsSpoilers !== undefined ? !!containsSpoilers : reviewItem.containsSpoilers,
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, id))
      .returning();

    if (effectiveRating) {
      await db
        .update(userMedia)
        .set({ rating: effectiveRating, updatedAt: new Date() })
        .where(and(eq(userMedia.userId, reviewItem.userId), eq(userMedia.mediaId, reviewItem.mediaId)));
    }

    const authorUsername = authorUser ? authorUser.username : user.username;
    const authorAvatar = authorUser ? authorUser.avatar : user.avatar;
    const authorRole = authorUser ? authorUser.role : user.role;

    res.json({
      ...updated,
      score: updated.rating,
      authorUsername,
      authorAvatar,
      username: authorUsername,
      avatar: authorAvatar,
      authorRole,
      user: {
        id: reviewItem.userId,
        username: authorUsername,
        displayName: authorUsername,
        avatarUrl: authorAvatar || undefined,
      },
      isOwn: isOwner,
      userLiked: false,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete review (supports both /reviews/:id and /media/:mediaId/reviews/:id)
apiRouter.delete(['/reviews/:id', '/media/:mediaId/reviews/:id'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const found = await db.select().from(reviews).where(eq(reviews.id, id)).limit(1);
    if (found.length === 0) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }
    const isOwner = found[0].userId === user.id;
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'MODERATOR';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Нет прав для удаления этого отзыва' });
    }
    await db.delete(reviews).where(eq(reviews.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to calculate total reactions count for a review
async function getReviewReactionStats(reviewId: number) {
  const allReactions = await db
    .select({ type: reviewReactions.type })
    .from(reviewReactions)
    .where(eq(reviewReactions.reviewId, reviewId));

  const reactionsCount: Record<string, number> = {};
  for (const r of allReactions) {
    reactionsCount[r.type] = (reactionsCount[r.type] || 0) + 1;
  }
  const totalLikes = reactionsCount['LIKE'] || 0;
  return { reactionsCount, totalLikes };
}

// React to a review (POST /reviews/:id/react or POST /media/:mediaId/reviews/:id/react)
apiRouter.post(['/reviews/:id/react', '/media/:mediaId/reviews/:id/react'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const reactionType = (req.body.type || 'LIKE').toUpperCase();

    const reviewItem = (await db.select().from(reviews).where(eq(reviews.id, id)).limit(1))[0];
    if (!reviewItem) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    const existingReaction = (
      await db
        .select()
        .from(reviewReactions)
        .where(
          and(
            eq(reviewReactions.reviewId, id),
            eq(reviewReactions.userId, user.id),
            eq(reviewReactions.type, reactionType)
          )
        )
        .limit(1)
    )[0];

    let userReaction: string | null = null;
    let isLiked = false;

    if (existingReaction) {
      // Toggle off / remove reaction
      await db.delete(reviewReactions).where(eq(reviewReactions.id, existingReaction.id));
      if (reactionType === 'LIKE') {
        await db.delete(likes).where(
          and(
            eq(likes.userId, user.id),
            eq(likes.targetType, 'REVIEW'),
            eq(likes.targetId, id)
          )
        );
      }
      userReaction = null;
      isLiked = false;
    } else {
      // Add reaction
      try {
        await db.insert(reviewReactions).values({
          reviewId: id,
          userId: user.id,
          type: reactionType,
        });
      } catch (e: any) {
        if (e.code !== '23505') throw e;
      }

      if (reactionType === 'LIKE') {
        try {
          await db.insert(likes).values({
            userId: user.id,
            targetType: 'REVIEW',
            targetId: id,
          });
        } catch (e: any) {
          if (e.code !== '23505') throw e;
        }
      }

      userReaction = reactionType;
      isLiked = reactionType === 'LIKE';

      // Notify review author and check achievements
      if (reviewItem.userId !== user.id) {
        notificationService
          .notifyReviewLiked(
            { id: user.id, username: user.username, avatar: user.avatar },
            reviewItem.userId,
            id,
            undefined,
            reviewItem.mediaId
          )
          .catch(() => {});
        achievementService.checkAndUnlock(reviewItem.userId, 'LIKE_RECEIVED').catch(() => {});
      }
    }

    const { reactionsCount, totalLikes } = await getReviewReactionStats(id);
    await db.update(reviews).set({ likesCount: totalLikes }).where(eq(reviews.id, id));

    return res.json({
      success: true,
      liked: isLiked,
      isLiked,
      userReaction,
      reactions: reactionsCount,
      likesCount: totalLikes,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete specific reaction (DELETE /reviews/:id/react or /media/:mediaId/reviews/:id/react)
apiRouter.delete(['/reviews/:id/react', '/media/:mediaId/reviews/:id/react'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const reactionType = (req.body.type || (req.query.type as string) || 'LIKE').toUpperCase();

    // Security: Only delete reactions belonging to the authenticated current user (user.id)
    await db
      .delete(reviewReactions)
      .where(
        and(
          eq(reviewReactions.reviewId, id),
          eq(reviewReactions.userId, user.id),
          eq(reviewReactions.type, reactionType)
        )
      );

    if (reactionType === 'LIKE') {
      await db.delete(likes).where(
        and(
          eq(likes.userId, user.id),
          eq(likes.targetType, 'REVIEW'),
          eq(likes.targetId, id)
        )
      );
    }

    const { reactionsCount, totalLikes } = await getReviewReactionStats(id);
    await db.update(reviews).set({ likesCount: totalLikes }).where(eq(reviews.id, id));

    return res.json({
      success: true,
      liked: false,
      isLiked: false,
      userReaction: null,
      reactions: reactionsCount,
      likesCount: totalLikes,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Like / unlike review (supports both /reviews/:id/like and /media/:mediaId/reviews/:id/like)
apiRouter.post(['/reviews/:id/like', '/media/:mediaId/reviews/:id/like'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);

    const reviewItem = (await db.select().from(reviews).where(eq(reviews.id, id)).limit(1))[0];
    if (!reviewItem) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    const existingReaction = (
      await db
        .select()
        .from(reviewReactions)
        .where(
          and(
            eq(reviewReactions.reviewId, id),
            eq(reviewReactions.userId, user.id),
            eq(reviewReactions.type, 'LIKE')
          )
        )
        .limit(1)
    )[0];

    const existingLegacy = (
      await db
        .select()
        .from(likes)
        .where(
          and(
            eq(likes.userId, user.id),
            eq(likes.targetType, 'REVIEW'),
            eq(likes.targetId, id)
          )
        )
        .limit(1)
    )[0];

    let liked = false;
    if (existingReaction || existingLegacy) {
      if (existingReaction) {
        await db.delete(reviewReactions).where(eq(reviewReactions.id, existingReaction.id));
      }
      if (existingLegacy) {
        await db.delete(likes).where(eq(likes.id, existingLegacy.id));
      }
      liked = false;
    } else {
      try {
        await db.insert(reviewReactions).values({
          reviewId: id,
          userId: user.id,
          type: 'LIKE',
        });
      } catch (err: any) {
        if (err.code !== '23505') throw err;
      }

      try {
        await db.insert(likes).values({
          userId: user.id,
          targetType: 'REVIEW',
          targetId: id,
        });
      } catch (err: any) {
        if (err.code !== '23505') throw err;
      }
      liked = true;

      // Notify review author
      if (reviewItem.userId !== user.id) {
        notificationService.notifyReviewLiked(
          { id: user.id, username: user.username, avatar: user.avatar },
          reviewItem.userId,
          id,
          undefined,
          reviewItem.mediaId
        ).catch(() => {});
        achievementService.checkAndUnlock(reviewItem.userId, 'LIKE_RECEIVED').catch(() => {});
      }
    }

    const { reactionsCount, totalLikes } = await getReviewReactionStats(id);
    await db.update(reviews).set({ likesCount: totalLikes }).where(eq(reviews.id, id));

    return res.json({
      liked,
      isLiked: liked,
      userReaction: liked ? 'LIKE' : null,
      reactions: reactionsCount,
      likesCount: totalLikes,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get comments for a review
apiRouter.get('/reviews/:id/comments', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const reviewComments = await db
      .select({
        id: comments.id,
        content: comments.content,
        parentId: comments.parentId,
        createdAt: comments.createdAt,
        user: {
          id: users.id,
          username: users.username,
          avatar: users.avatar,
        },
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(and(eq(comments.targetType, 'REVIEW'), eq(comments.targetId, id), eq(comments.isHidden, false)))
      .orderBy(comments.createdAt);

    res.json(reviewComments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Post a comment to a review
apiRouter.post('/reviews/:id/comments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const { content, parentId } = req.body;

    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Комментарий не может быть пустым' });
    }

    const trimmed = String(content).trim();
    const [reviewItem] = await db.select().from(reviews).where(eq(reviews.id, id)).limit(1);
    if (!reviewItem) {
      return res.status(404).json({ error: 'Рецензия не найдена' });
    }

    const [newComment] = await db
      .insert(comments)
      .values({
        userId: user.id,
        targetType: 'REVIEW',
        targetId: id,
        content: trimmed,
        parentId: parentId ? parseInt(parentId, 10) : null,
      })
      .returning();

    // Notify review author (if not self)
    if (reviewItem.userId !== user.id) {
      notificationService.notifyReviewCommented(
        { id: user.id, username: user.username, avatar: user.avatar },
        reviewItem.userId,
        id,
        trimmed,
        undefined,
        reviewItem.mediaId
      ).catch(() => {});
    }

    res.json({
      ...newComment,
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. USER LIBRARY (TRACKER)
// ==========================================

// Get user library
apiRouter.get('/library', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { type, status, favorite } = req.query;

    let query = db
      .select({
        userMediaId: userMedia.id,
        status: userMedia.status,
        progress: userMedia.progress,
        progressTotal: userMedia.progressTotal,
        rating: userMedia.rating,
        isFavorite: userMedia.isFavorite,
        notes: userMedia.notes,
        startedAt: userMedia.startedAt,
        completedAt: userMedia.completedAt,
        updatedAt: userMedia.updatedAt,
        mediaId: media.id,
        title: media.title,
        originalTitle: media.originalTitle,
        type: media.type,
        posterUrl: media.posterUrl,
        backdropUrl: media.backdropUrl,
        year: media.year,
        publicRating: media.rating,
        totalEpisodes: media.totalEpisodes,
      })
      .from(userMedia)
      .innerJoin(media, eq(userMedia.mediaId, media.id))
      .where(eq(userMedia.userId, user.id));

    const rows = await query;
    let filtered = rows;

    if (type && type !== 'ALL') {
      filtered = filtered.filter((r) => r.type === String(type).toUpperCase());
    }
    if (status && status !== 'ALL') {
      filtered = filtered.filter((r) => r.status === String(status));
    }
    if (favorite === 'true') {
      filtered = filtered.filter((r) => r.isFavorite);
    }

    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add media to library (accepts either existing mediaId or payload from provider search)
apiRouter.post('/library', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { mediaPayload, mediaId: existingMediaId, status, rating, isFavorite, notes } = req.body;

    let targetMediaId = existingMediaId;

    // If media doesn't exist in local DB yet, persist it
    if (!targetMediaId && mediaPayload) {
      // Check if already in DB via externalId
      if (mediaPayload.provider && mediaPayload.externalId) {
        const foundExt = await db
          .select()
          .from(mediaExternalIds)
          .where(
            and(
              eq(mediaExternalIds.provider, mediaPayload.provider),
              eq(mediaExternalIds.externalId, String(mediaPayload.externalId))
            )
          )
          .limit(1);

        if (foundExt.length > 0) {
          targetMediaId = foundExt[0].mediaId;
        }
      }

      if (!targetMediaId) {
        const [createdMedia] = await db
          .insert(media)
          .values({
            type: mediaPayload.type || 'MOVIE',
            title: mediaPayload.title || 'Без названия',
            originalTitle: mediaPayload.originalTitle,
            description: mediaPayload.description,
            posterUrl: mediaPayload.posterUrl,
            backdropUrl: mediaPayload.backdropUrl,
            releaseDate: mediaPayload.releaseDate,
            year: mediaPayload.year,
            rating: mediaPayload.rating,
            totalEpisodes: mediaPayload.totalEpisodes || 0,
          })
          .returning();

        targetMediaId = createdMedia.id;

        if (mediaPayload.provider && mediaPayload.externalId) {
          await db.insert(mediaExternalIds).values({
            mediaId: targetMediaId,
            provider: mediaPayload.provider,
            externalId: String(mediaPayload.externalId),
          });
        }
      }
    }

    if (!targetMediaId) {
      return res.status(400).json({ error: 'Не указаны данные медиа' });
    }

    // Check if already in user's library
    const existing = await db
      .select()
      .from(userMedia)
      .where(and(eq(userMedia.userId, user.id), eq(userMedia.mediaId, targetMediaId)))
      .limit(1);

    const defaultStatus = status || 'PLAN_TO_WATCH';

    let userMediaEntry;
    if (existing.length > 0) {
      [userMediaEntry] = await db
        .update(userMedia)
        .set({
          status: defaultStatus,
          rating: rating !== undefined ? rating : existing[0].rating,
          isFavorite: isFavorite !== undefined ? isFavorite : existing[0].isFavorite,
          notes: notes !== undefined ? notes : existing[0].notes,
          updatedAt: new Date(),
        })
        .where(eq(userMedia.id, existing[0].id))
        .returning();
    } else {
      try {
        const [inserted] = await db
          .insert(userMedia)
          .values({
            userId: user.id,
            mediaId: targetMediaId,
            status: defaultStatus,
            rating: rating || null,
            isFavorite: !!isFavorite,
            notes: notes || null,
          })
          .returning();
        userMediaEntry = inserted;
      } catch (err: any) {
        if (err.code === '23505') { // postgres unique violation
           const [reExisting] = await db.select().from(userMedia).where(and(eq(userMedia.userId, user.id), eq(userMedia.mediaId, targetMediaId))).limit(1);
           userMediaEntry = reExisting;
        } else {
           throw err;
        }
      }

      // Log History
      await db.insert(mediaHistory).values({
        userId: user.id,
        mediaId: targetMediaId,
        action: 'ADDED',
        details: `Добавлено в статус: ${defaultStatus}`,
      });

      // Create Social Activity
      await db.insert(activities).values({
        userId: user.id,
        type: 'MEDIA_ADDED',
        mediaId: targetMediaId,
        details: JSON.stringify({ status: defaultStatus }),
      });
    }

    // Trigger achievement checks for media added & completed
    achievementService.checkAndUnlock(user.id, 'MEDIA_ADDED', { mediaId: targetMediaId }).catch(() => {});
    if (defaultStatus === 'COMPLETED') {
      achievementService.checkAndUnlock(user.id, 'MEDIA_COMPLETED', { mediaId: targetMediaId }).catch(() => {});
    }

    res.json(userMediaEntry);
  } catch (err: any) {
    console.error('Add library error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update library item
apiRouter.put('/library/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const { status, progress, rating, isFavorite, notes, rewatchCount } = req.body;

    const existing = await db
      .select()
      .from(userMedia)
      .where(and(eq(userMedia.id, id), eq(userMedia.userId, user.id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Запись в библиотеке не найдена' });
    }

    const prev = existing[0];
    const completedAt = status === 'COMPLETED' && prev.status !== 'COMPLETED' ? new Date() : prev.completedAt;

    const [updated] = await db
      .update(userMedia)
      .set({
        status: status || prev.status,
        progress: progress !== undefined ? progress : prev.progress,
        rating: rating !== undefined ? rating : prev.rating,
        isFavorite: isFavorite !== undefined ? isFavorite : prev.isFavorite,
        notes: notes !== undefined ? notes : prev.notes,
        rewatchCount: rewatchCount !== undefined ? rewatchCount : prev.rewatchCount,
        completedAt,
        updatedAt: new Date(),
      })
      .where(eq(userMedia.id, id))
      .returning();

    // Log status or rating changes
    if (status && status !== prev.status) {
      if (status === 'COMPLETED') {
        achievementService.checkAndUnlock(user.id, 'MEDIA_COMPLETED', { mediaId: prev.mediaId }).catch(() => {});
        db.select().from(media).where(eq(media.id, prev.mediaId)).limit(1).then(([m]) => {
          if (m) {
            notificationService.notifyContentCompleted(
              user.id,
              m.title || m.originalTitle || 'контент',
              m.id,
              m.type
            ).catch(() => {});
          }
        }).catch(() => {});
      }
      await db.insert(mediaHistory).values({
        userId: user.id,
        mediaId: prev.mediaId,
        action: status === 'COMPLETED' ? 'COMPLETED' : 'STATUS_CHANGED',
        details: `Статус изменён на: ${status}`,
      });

      await db.insert(activities).values({
        userId: user.id,
        type: status === 'COMPLETED' ? 'MEDIA_COMPLETED' : 'MEDIA_STATUS_CHANGED',
        mediaId: prev.mediaId,
        details: JSON.stringify({ status }),
      }).catch((e) => console.warn('[Activity insert] error:', e));
    }

    if (rating && rating !== prev.rating) {
      await db.insert(mediaHistory).values({
        userId: user.id,
        mediaId: prev.mediaId,
        action: 'RATED',
        details: `Оценка: ${rating}/10`,
      });

      await db.insert(activities).values({
        userId: user.id,
        type: 'MEDIA_RATED',
        mediaId: prev.mediaId,
        details: JSON.stringify({ rating: Number(rating) }),
      });
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete from library
apiRouter.delete('/library/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    await db.delete(userMedia).where(and(eq(userMedia.id, id), eq(userMedia.userId, user.id)));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. SOCIAL FEED & ACTIVITIES
// ==========================================

apiRouter.get('/feed', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const tab = (req.query.tab as string) || 'all'; // 'all' | 'friends' | 'my'
    const typeFilter = (req.query.type as string) || 'ALL'; // 'ALL' | 'MEDIA' | 'REVIEWS' | 'LISTS' | 'ACHIEVEMENTS' | 'FRIENDS'
    const categoryFilter = (req.query.category as string) || 'ALL'; // 'ALL' | 'MOVIE' | 'TV' | 'ANIME' | 'GAME' | 'BOOK' | 'COMIC'
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);

    // 1. Get current user's accepted friend IDs
    let friendIds: number[] = [];
    if (user) {
      const friendships = await db
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.status, 'ACCEPTED'),
            or(eq(friendRequests.senderId, user.id), eq(friendRequests.receiverId, user.id))
          )
        );
      friendIds = friendships.map((f) => (f.senderId === user.id ? f.receiverId : f.senderId));
    }

    if (tab === 'friends' && (!user || friendIds.length === 0)) {
      return res.json({ activities: [], total: 0, friendCount: friendIds.length });
    }

    if (tab === 'my' && !user) {
      return res.json({ activities: [], total: 0, friendCount: 0 });
    }

    // 2. Query activities with user, media, list, tierList joined
    const rawList = await db
      .select({
        id: activities.id,
        type: activities.type,
        details: activities.details,
        createdAt: activities.createdAt,
        userId: users.id,
        username: users.username,
        avatar: users.avatar,
        role: users.role,
        bio: users.bio,
        isBlocked: users.isBlocked,
        activityVisibility: users.activityVisibility,
        ratingVisibility: users.ratingVisibility,
        userListVisibility: users.listVisibility,
        libraryVisibility: users.libraryVisibility,
        mediaId: media.id,
        mediaTitle: media.title,
        mediaOriginalTitle: media.originalTitle,
        mediaPoster: media.posterUrl,
        mediaBackdrop: media.backdropUrl,
        mediaType: media.type,
        mediaYear: media.year,
        mediaRating: media.rating,
        mediaIsAdult: media.isAdult,
        mediaAgeRating: media.ageRating,
        listId: lists.id,
        listTitle: lists.title,
        listCover: lists.cover,
        listCategory: lists.category,
        listVisibility: lists.visibility,
        tierListId: tierLists.id,
        tierListTitle: tierLists.title,
        tierListCategory: tierLists.category,
        tierListVisibility: tierLists.visibility,
      })
      .from(activities)
      .innerJoin(users, eq(activities.userId, users.id))
      .leftJoin(media, eq(activities.mediaId, media.id))
      .leftJoin(lists, eq(activities.listId, lists.id))
      .leftJoin(tierLists, eq(activities.tierListId, tierLists.id))
      .orderBy(desc(activities.createdAt))
      .limit(300);

    // 3. Apply Strict Privacy & Tab Filtering
    const visibleActivities = rawList.filter((act) => {
      if (act.isBlocked) return false;
      const isOwner = user ? user.id === act.userId : false;
      const isFriend = user ? friendIds.includes(act.userId) : false;

      // Tab filter
      if (tab === 'my') {
        if (!isOwner) return false;
      } else if (tab === 'friends') {
        if (!isFriend) return false;
      }

      // If owner viewing their own activity, always allowed
      if (isOwner) return true;

      // Check general user activityVisibility
      if (act.activityVisibility === 'PRIVATE') return false;
      if (act.activityVisibility === 'FRIENDS' && !isFriend) return false;

      // Check specific activity types privacy
      if (act.type === 'MEDIA_RATED') {
        if (act.ratingVisibility === 'PRIVATE') return false;
        if (act.ratingVisibility === 'FRIENDS' && !isFriend) return false;
      }

      if (['MEDIA_ADDED', 'MEDIA_COMPLETED', 'MEDIA_STATUS_CHANGED'].includes(act.type)) {
        if (act.libraryVisibility === 'PRIVATE') return false;
        if (act.libraryVisibility === 'FRIENDS' && !isFriend) return false;
      }

      if (['LIST_CREATED', 'LIST_UPDATED'].includes(act.type)) {
        if (act.userListVisibility === 'PRIVATE') return false;
        if (act.userListVisibility === 'FRIENDS' && !isFriend) return false;
        if (act.listId && act.listVisibility === 'PRIVATE') return false;
      }

      if (['TIERLIST_CREATED', 'TIERLIST_UPDATED'].includes(act.type)) {
        if (act.userListVisibility === 'PRIVATE') return false;
        if (act.tierListVisibility === 'PRIVATE') return false;
        if (act.tierListVisibility === 'FRIENDS' && !isFriend) return false;
      }

      return true;
    });

    // 4. Apply Event Type Filter & Media Category Filter
    const filtered = visibleActivities.filter((act) => {
      // Type Filter
      if (typeFilter === 'MEDIA') {
        if (!['MEDIA_ADDED', 'MEDIA_COMPLETED', 'MEDIA_STATUS_CHANGED', 'MEDIA_RATED'].includes(act.type)) return false;
      } else if (typeFilter === 'REVIEWS') {
        if (act.type !== 'REVIEW_ADDED') return false;
      } else if (typeFilter === 'LISTS') {
        if (!['LIST_CREATED', 'LIST_UPDATED', 'TIERLIST_CREATED', 'TIERLIST_UPDATED'].includes(act.type)) return false;
      } else if (typeFilter === 'ACHIEVEMENTS') {
        if (act.type !== 'ACHIEVEMENT_UNLOCKED') return false;
      } else if (typeFilter === 'FRIENDS') {
        if (act.type !== 'FRIEND_ADDED') return false;
      }

      // Category Filter (e.g. MOVIE, TV, GAME, BOOK, etc.)
      if (categoryFilter && categoryFilter !== 'ALL') {
        if (act.mediaType) {
          if (act.mediaType !== categoryFilter) return false;
        } else if (act.listCategory) {
          if (!act.listCategory.toUpperCase().includes(categoryFilter.toUpperCase())) return false;
        } else if (act.tierListCategory) {
          if (!act.tierListCategory.toUpperCase().includes(categoryFilter.toUpperCase())) return false;
        } else {
          // If activity is not tied to media and category filter is active, skip
          if (['MEDIA', 'MOVIE', 'TV', 'ANIME', 'GAME', 'BOOK', 'COMIC'].includes(categoryFilter)) {
            return false;
          }
        }
      }

      return true;
    });

    const paginated = filtered.slice(offset, offset + limit);
    const activityIds = paginated.map((a) => a.id);

    // 5. Batch load likes and comments for paginated activities
    let likesMap: Record<number, { count: number; userLiked: boolean }> = {};
    let commentsMap: Record<number, { count: number; recent: any[] }> = {};

    if (activityIds.length > 0) {
      const allLikes = await db
        .select()
        .from(likes)
        .where(and(eq(likes.targetType, 'ACTIVITY'), inArray(likes.targetId, activityIds)));

      for (const l of allLikes) {
        if (!likesMap[l.targetId]) {
          likesMap[l.targetId] = { count: 0, userLiked: false };
        }
        likesMap[l.targetId].count++;
        if (user && l.userId === user.id) {
          likesMap[l.targetId].userLiked = true;
        }
      }

      const allComments = await db
        .select({
          id: comments.id,
          targetId: comments.targetId,
          content: comments.content,
          createdAt: comments.createdAt,
          userId: users.id,
          username: users.username,
          avatar: users.avatar,
          role: users.role,
        })
        .from(comments)
        .innerJoin(users, eq(comments.userId, users.id))
        .where(and(eq(comments.targetType, 'ACTIVITY'), inArray(comments.targetId, activityIds), eq(comments.isHidden, false)))
        .orderBy(asc(comments.createdAt));

      for (const c of allComments) {
        if (!commentsMap[c.targetId]) {
          commentsMap[c.targetId] = { count: 0, recent: [] };
        }
        commentsMap[c.targetId].count++;
        commentsMap[c.targetId].recent.push(c);
      }
    }

    // 6. Enrich details
    const enriched = paginated.map((act) => {
      let parsedDetails: any = null;
      if (act.details) {
        let str = String(act.details).trim();
        // Strip markdown asterisks or backticks
        str = str.replace(/\*\*/g, '').replace(/__/g, '').replace(/`/g, '').trim();

        // Strip technical svg prefixes
        if (str.startsWith('svg{') || str.startsWith('svg {"') || str.startsWith('svg:')) {
          const idx = str.indexOf('{');
          if (idx !== -1) str = str.substring(idx);
        }

        // Try standard JSON.parse between first { and last }
        const firstBrace = str.indexOf('{');
        const lastBrace = str.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            parsedDetails = JSON.parse(str.substring(firstBrace, lastBrace + 1));
          } catch (_e) {
            parsedDetails = null;
          }
        }

        // Resilient regex recovery if JSON is corrupted or truncated
        if (!parsedDetails || typeof parsedDetails !== 'object') {
          const titleMatch = str.match(/"title"\s*:\s*"([^"]+)"/);
          const descMatch = str.match(/"description"\s*:\s*"([^"]+)"/);
          const iconMatch = str.match(/"icon"\s*:\s*"([^"]+)"/);
          const achIdMatch = str.match(/"(?:achievementId|id)"\s*:\s*(\d+)/);
          const rarityMatch = str.match(/"rarity"\s*:\s*"([^"]+)"/);
          const pointsMatch = str.match(/"points"\s*:\s*(\d+)/);

          const friendIdMatch = str.match(/"(?:friendId)"\s*:\s*(\d+)/);
          const friendUserMatch = str.match(/"(?:friendUsername|username)"\s*:\s*"([^"]+)"/);
          const friendAvatarMatch = str.match(/"(?:friendAvatar|avatar)"\s*:\s*"([^"]+)"/);

          const ratingMatch = str.match(/"rating"\s*:\s*(\d+(?:\.\d+)?)/);
          const statusMatch = str.match(/"status"\s*:\s*"([^"]+)"/);
          const snippetMatch = str.match(/"(?:snippet|content|text|review)"\s*:\s*"([^"]+)"/);

          const recovered: any = {};
          let found = false;
          if (achIdMatch || titleMatch) {
            if (achIdMatch) recovered.achievementId = parseInt(achIdMatch[1], 10);
            if (titleMatch) recovered.title = titleMatch[1];
            if (descMatch) recovered.description = descMatch[1];
            if (iconMatch) recovered.icon = iconMatch[1];
            if (rarityMatch) recovered.rarity = rarityMatch[1];
            if (pointsMatch) recovered.points = parseInt(pointsMatch[1], 10);
            found = true;
          }
          if (friendUserMatch || friendIdMatch) {
            if (friendIdMatch) recovered.friendId = parseInt(friendIdMatch[1], 10);
            if (friendUserMatch) recovered.friendUsername = friendUserMatch[1];
            if (friendAvatarMatch) recovered.friendAvatar = friendAvatarMatch[1];
            found = true;
          }
          if (ratingMatch) {
            recovered.rating = parseFloat(ratingMatch[1]);
            found = true;
          }
          if (statusMatch) {
            recovered.status = statusMatch[1];
            found = true;
          }
          if (snippetMatch) {
            recovered.snippet = snippetMatch[1];
            found = true;
          }
          if (found) {
            parsedDetails = recovered;
          }
        }
      }

      // 1. Structured Actor (clean username, no @ or markdown)
      const cleanUsername = String(act.username || 'Пользователь')
        .replace(/\*\*/g, '')
        .replace(/^@+/, '')
        .trim();

      const actor = {
        id: act.userId,
        username: cleanUsername || 'Пользователь',
        displayName: cleanUsername || 'Пользователь',
        avatar: act.avatar || null,
        role: act.role,
        bio: act.bio || null,
      };

      // 2. Structured Achievement
      let achievement: any = null;
      if (act.type === 'ACHIEVEMENT_UNLOCKED' && parsedDetails && typeof parsedDetails === 'object') {
        const achIcon = (typeof parsedDetails.icon === 'string' && !parsedDetails.icon.startsWith('{') && !parsedDetails.icon.startsWith('<'))
          ? parsedDetails.icon
          : 'Trophy';

        achievement = {
          id: parsedDetails.achievementId || parsedDetails.id || 0,
          title: String(parsedDetails.title || 'Достижение').replace(/\*\*/g, '').trim(),
          description: String(parsedDetails.description || '').replace(/\*\*/g, '').trim(),
          icon: achIcon,
          rarity: parsedDetails.rarity || 'COMMON',
          points: parsedDetails.points || 10,
        };
      }

      // 3. Structured Friend
      let friend: any = null;
      if (act.type === 'FRIEND_ADDED' && parsedDetails && typeof parsedDetails === 'object') {
        const rawFriendUser = parsedDetails.friendUsername || parsedDetails.username || 'друг';
        const cleanFriendUser = String(rawFriendUser).replace(/\*\*/g, '').replace(/^@+/, '').trim();
        friend = {
          id: parsedDetails.friendId || parsedDetails.id || 0,
          username: cleanFriendUser || 'друг',
          avatar: parsedDetails.friendAvatar !== undefined ? parsedDetails.friendAvatar : parsedDetails.avatar || null,
        };
      }

      // 4. Structured Review
      let review: any = null;
      if (act.type === 'REVIEW_ADDED' || act.type === 'REVIEW_CREATED' || act.type === 'MEDIA_REVIEWED') {
        let snippet = '';
        if (parsedDetails && typeof parsedDetails === 'object') {
          snippet = parsedDetails.snippet || parsedDetails.content || parsedDetails.review || parsedDetails.text || '';
        } else if (typeof act.details === 'string') {
          const match = act.details.match(/["«]([^"»]+)["»]/);
          if (match) snippet = match[1];
        }
        snippet = String(snippet).replace(/\*\*/g, '').replace(/<[^>]*>/g, '').trim();

        let reviewRating = parsedDetails?.rating !== undefined ? Number(parsedDetails.rating) : null;
        if (reviewRating !== null && reviewRating <= 10 && reviewRating > 0) {
          reviewRating = reviewRating * 10;
        }

        review = {
          id: parsedDetails?.reviewId || parsedDetails?.id,
          rating: reviewRating,
          title: parsedDetails?.title ? String(parsedDetails.title).replace(/\*\*/g, '').trim() : null,
          snippet,
          containsSpoilers: !!parsedDetails?.containsSpoilers,
        };
      }

      // 5. Structured Rating (normalized to 0-100 scale)
      let rating: number | null = null;
      if (act.type === 'MEDIA_RATED' || act.type === 'RATING_ADDED') {
        if (parsedDetails && typeof parsedDetails === 'object' && parsedDetails.rating !== undefined) {
          rating = Number(parsedDetails.rating);
        } else if (typeof act.details === 'string') {
          const match = act.details.match(/(\d+)(?:\s*★|\/100|\/10)/);
          if (match) rating = parseInt(match[1], 10);
        }
        if (rating === null && act.mediaRating) {
          rating = act.mediaRating;
        }
        // Normalize 1-10 to 0-100 scale
        if (rating !== null && rating <= 10 && rating > 0) {
          rating = rating * 10;
        }
      }

      // 6. Structured Status
      let status: string | null = null;
      if (['MEDIA_ADDED', 'MEDIA_COMPLETED', 'MEDIA_STATUS_CHANGED', 'STATUS_CHANGED', 'MEDIA_WATCHING', 'MEDIA_PLAYING', 'MEDIA_READING', 'MEDIA_DROPPED'].includes(act.type)) {
        if (act.type === 'MEDIA_COMPLETED') {
          status = 'COMPLETED';
        } else if (parsedDetails && typeof parsedDetails === 'object' && parsedDetails.status) {
          status = parsedDetails.status;
        } else if (typeof act.details === 'string' && !act.details.startsWith('{') && !act.details.includes('{"')) {
          status = act.details.replace(/\*\*/g, '').trim();
        }
      }

      // Safe details string (never raw json or raw svg)
      let safeDetails: string | null = null;
      if (achievement) {
        safeDetails = `${achievement.title}${achievement.description ? ` — ${achievement.description}` : ''}`;
      } else if (friend) {
        safeDetails = `Подружились с @${friend.username}`;
      } else if (review?.snippet) {
        safeDetails = review.snippet;
      } else if (rating !== null) {
        safeDetails = `Оценка: ${rating} / 100`;
      } else if (status) {
        safeDetails = status;
      } else if (typeof act.details === 'string' && !act.details.includes('{') && !act.details.includes('svg')) {
        safeDetails = act.details.replace(/\*\*/g, '').trim();
      }

      return {
        id: act.id,
        type: act.type,
        details: safeDetails,
        parsedDetails,
        createdAt: act.createdAt,
        actor,
        user: actor, // Backward-compat for legacy consumers
        achievement,
        friend,
        review,
        rating,
        status,
        media: act.mediaId ? {
          id: act.mediaId,
          title: act.mediaTitle,
          originalTitle: act.mediaOriginalTitle,
          posterUrl: act.mediaPoster,
          backdropUrl: act.mediaBackdrop,
          type: act.mediaType,
          year: act.mediaYear,
          rating: act.mediaRating,
          isAdult: act.mediaIsAdult,
          ageRating: act.mediaAgeRating,
        } : null,
        list: act.listId ? {
          id: act.listId,
          title: act.listTitle,
          cover: act.listCover,
          category: act.listCategory,
        } : null,
        tierList: act.tierListId ? {
          id: act.tierListId,
          title: act.tierListTitle,
          category: act.tierListCategory,
        } : null,
        likesCount: likesMap[act.id]?.count || 0,
        userLiked: likesMap[act.id]?.userLiked || false,
        commentsCount: commentsMap[act.id]?.count || 0,
        recentComments: commentsMap[act.id]?.recent || [],
      };
    });

    const accessibleActivities = ContentVisibilityService.filterAccessibleActivities(user, enriched);

    res.json({
      activities: accessibleActivities,
      total: accessibleActivities.length,
      friendCount: friendIds.length,
    });
  } catch (err: any) {
    console.error('Feed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get comments for an activity
apiRouter.get('/activities/:id/comments', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'Некорректный ID активности' });

    const activityComments = await db
      .select({
        id: comments.id,
        content: comments.content,
        createdAt: comments.createdAt,
        userId: users.id,
        username: users.username,
        avatar: users.avatar,
        role: users.role,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(and(eq(comments.targetType, 'ACTIVITY'), eq(comments.targetId, id), eq(comments.isHidden, false)))
      .orderBy(asc(comments.createdAt));

    res.json(activityComments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Post a comment to an activity
apiRouter.post('/activities/:id/comments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const { content } = req.body;

    if (!id || isNaN(id)) return res.status(400).json({ error: 'Некорректный ID активности' });
    const trimmed = String(content || '').trim();
    if (!trimmed) return res.status(400).json({ error: 'Комментарий не может быть пустым' });

    const [targetAct] = await db.select().from(activities).where(eq(activities.id, id)).limit(1);
    if (!targetAct) return res.status(404).json({ error: 'Событие не найдено' });

    const [newComment] = await db
      .insert(comments)
      .values({
        userId: user.id,
        targetType: 'ACTIVITY',
        targetId: id,
        content: trimmed,
      })
      .returning();

    // Send notification to activity owner if not commenter
    if (targetAct.userId !== user.id) {
      sendAppNotification(targetAct.userId, {
        type: 'COMMENT',
        title: 'Новый комментарий в ленте',
        body: `@${user.username}: "${trimmed.slice(0, 60)}"`,
        link: '/feed',
        senderId: user.id,
        senderUsername: user.username,
        senderAvatar: user.avatar,
      }).catch(() => {});
    }

    res.json({
      ...newComment,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      role: user.role,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete comment from activity
apiRouter.delete('/activities/comments/:commentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const commentId = parseInt(req.params.commentId, 10);
    if (!commentId || isNaN(commentId)) return res.status(400).json({ error: 'Некорректный ID' });

    const [target] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
    if (!target) return res.status(404).json({ error: 'Комментарий не найден' });

    const isOwner = target.userId === user.id;
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'MODERATOR';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Нет прав на удаление этого комментария' });
    }

    await db.delete(comments).where(eq(comments.id, commentId));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Like
apiRouter.post('/social/like', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { targetType, targetId } = req.body; // ACTIVITY, LIST, TIERLIST, COMMENT

    const existing = await db
      .select()
      .from(likes)
      .where(
        and(
          eq(likes.userId, user.id),
          eq(likes.targetType, targetType),
          eq(likes.targetId, targetId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db.delete(likes).where(eq(likes.id, existing[0].id));
      return res.json({ liked: false });
    } else {
      try {
        await db.insert(likes).values({
          userId: user.id,
          targetType,
          targetId,
        });
      } catch (err: any) {
        if (err.code === '23505') {
          return res.json({ liked: true }); // already liked
        }
        throw err;
      }

      // Send notification if liking an activity
      if (targetType === 'ACTIVITY') {
        const [act] = await db.select().from(activities).where(eq(activities.id, targetId)).limit(1);
        if (act && act.userId !== user.id) {
          sendAppNotification(act.userId, {
            type: 'LIKE',
            title: 'Новый лайк',
            body: `@${user.username} оценил(а) ваше событие в ленте`,
            link: '/feed',
            senderId: user.id,
            senderUsername: user.username,
            senderAvatar: user.avatar,
          }).catch(() => {});
        }
      }

      return res.json({ liked: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. FRIENDS & SOCIAL
// ==========================================

apiRouter.get('/friends', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    // Find accepted friendships
    const accepted = await db
      .select()
      .from(friendRequests)
      .where(
        and(
          or(eq(friendRequests.senderId, user.id), eq(friendRequests.receiverId, user.id)),
          eq(friendRequests.status, 'ACCEPTED')
        )
      );

    const friendUserIds = accepted.map((f) => (f.senderId === user.id ? f.receiverId : f.senderId));
    if (friendUserIds.length === 0) {
      return res.json([]);
    }

    const friendsList = await db
      .select({
        id: users.id,
        username: users.username,
        avatar: users.avatar,
        bio: users.bio,
      })
      .from(users)
      .where(inArray(users.id, friendUserIds));

    res.json(friendsList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Incoming / outgoing friend requests
apiRouter.get('/friends/requests', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const incoming = await db
      .select({
        id: friendRequests.id,
        status: friendRequests.status,
        createdAt: friendRequests.createdAt,
        senderId: users.id,
        username: users.username,
        avatar: users.avatar,
      })
      .from(friendRequests)
      .innerJoin(users, eq(friendRequests.senderId, users.id))
      .where(and(eq(friendRequests.receiverId, user.id), eq(friendRequests.status, 'PENDING')));

    const outgoing = await db
      .select({
        id: friendRequests.id,
        status: friendRequests.status,
        createdAt: friendRequests.createdAt,
        receiverId: users.id,
        username: users.username,
        avatar: users.avatar,
      })
      .from(friendRequests)
      .innerJoin(users, eq(friendRequests.receiverId, users.id))
      .where(and(eq(friendRequests.senderId, user.id), eq(friendRequests.status, 'PENDING')));

    res.json({ incoming, outgoing });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Community recommendations for friends
apiRouter.get('/friends/recommendations', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    let excludeUserIds: number[] = [];
    if (user) {
      excludeUserIds.push(user.id);
      const reqs = await db
        .select()
        .from(friendRequests)
        .where(or(eq(friendRequests.senderId, user.id), eq(friendRequests.receiverId, user.id)));
      reqs.forEach((r) => {
        excludeUserIds.push(r.senderId);
        excludeUserIds.push(r.receiverId);
      });
    }

    const uniqueExclude = Array.from(new Set(excludeUserIds));
    const query = db
      .select({
        id: users.id,
        username: users.username,
        avatar: users.avatar,
        bio: users.bio,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        uniqueExclude.length > 0
          ? and(not(inArray(users.id, uniqueExclude)), eq(users.isBlocked, false))
          : eq(users.isBlocked, false)
      )
      .limit(15);

    const recommended = await query;
    res.json(recommended);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Send friend request
apiRouter.post('/friends/request', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { targetUsername } = req.body;

    const foundTarget = await db.select().from(users).where(eq(users.username, targetUsername)).limit(1);
    if (foundTarget.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const targetUser = foundTarget[0];
    if (targetUser.id === user.id) {
      return res.status(400).json({ error: 'Нельзя добавить в друзья самого себя' });
    }

    // Check existing request
    const existing = await db
      .select()
      .from(friendRequests)
      .where(
        or(
          and(eq(friendRequests.senderId, user.id), eq(friendRequests.receiverId, targetUser.id)),
          and(eq(friendRequests.senderId, targetUser.id), eq(friendRequests.receiverId, user.id))
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Заявка уже существует' });
    }

    let reqRecord;
    try {
      const [inserted] = await db
        .insert(friendRequests)
        .values({
          senderId: user.id,
          receiverId: targetUser.id,
          status: 'PENDING',
        })
        .returning();
      reqRecord = inserted;
    } catch (err: any) {
      if (err.code === '23505') { // Postgres unique violation
        return res.status(400).json({ error: 'Заявка уже отправлена' });
      }
      throw err;
    }

    // Notification
    await sendAppNotification(targetUser.id, {
      type: 'FRIEND_REQUEST',
      title: 'Новая заявка в друзья',
      body: `@${user.username} отправил(а) вам заявку в друзья`,
      link: '/friends',
      senderId: user.id,
      senderUsername: user.username,
      senderAvatar: user.avatar,
    });

    res.json(reqRecord);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Respond to friend request by requester ID (used by Notification Center)
apiRouter.post('/friends/accept', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { requesterId } = req.body;
    const reqs = await db.select().from(friendRequests)
      .where(and(eq(friendRequests.senderId, requesterId), eq(friendRequests.receiverId, user.id), eq(friendRequests.status, 'PENDING')))
      .limit(1);
    if (!reqs.length) return res.status(404).json({ error: 'Заявка не найдена' });
    
    // Delegate to the existing handler logic
    req.params.id = String(reqs[0].id);
    req.body.action = 'ACCEPT';
    return handleFriendRequestAction(req, res);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/friends/decline', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { requesterId } = req.body;
    const reqs = await db.select().from(friendRequests)
      .where(and(eq(friendRequests.senderId, requesterId), eq(friendRequests.receiverId, user.id), eq(friendRequests.status, 'PENDING')))
      .limit(1);
    if (!reqs.length) return res.status(404).json({ error: 'Заявка не найдена' });
    
    // Delegate to the existing handler logic
    req.params.id = String(reqs[0].id);
    req.body.action = 'DECLINE';
    return handleFriendRequestAction(req, res);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper for both /friends/request/:id and the above endpoints
async function handleFriendRequestAction(req: AuthRequest, res: Response) {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const { action } = req.body; // 'ACCEPT' | 'DECLINE'
    
    const reqFound = await db
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.id, id), eq(friendRequests.receiverId, user.id)))
      .limit(1);
    if (reqFound.length === 0) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }
    
    const newStatus = action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    const [updated] = await db
      .update(friendRequests)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(friendRequests.id, id))
      .returning();

    if (action === 'ACCEPT') {
      const [senderUser] = await db
        .select({ id: users.id, username: users.username, avatar: users.avatar })
        .from(users)
        .where(eq(users.id, reqFound[0].senderId))
        .limit(1);
      
      if (senderUser) {
        await db.insert(activities).values({
          userId: user.id,
          type: 'FRIEND_ADDED',
          details: JSON.stringify({
            friendId: senderUser.id,
            friendUsername: senderUser.username,
            friendAvatar: senderUser.avatar,
          }),
        }).catch(() => {});
      }
      
      await sendAppNotification(reqFound[0].senderId, {
        type: 'FRIEND_ACCEPTED',
        title: 'Заявка принята',
        body: `@${user.username} принял(а) вашу заявку в друзья`,
        link: `/u/${user.username}`,
        senderId: user.id,
        senderUsername: user.username,
        senderAvatar: user.avatar,
      });

      // Trigger friend achievement for both users
      achievementService.checkAndUnlock(user.id, 'FRIEND_ADDED').catch(() => {});
      achievementService.checkAndUnlock(reqFound[0].senderId, 'FRIEND_ADDED').catch(() => {});
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// Respond to friend request (ACCEPTED, DECLINED)
apiRouter.put('/friends/request/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  return handleFriendRequestAction(req, res);
});

// Remove a friend
apiRouter.delete('/friends/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const targetId = Number(req.params.id);
    if (!targetId || isNaN(targetId)) {
      return res.status(400).json({ error: 'Неверный ID пользователя' });
    }

    await db
      .delete(friendRequests)
      .where(
        or(
          and(eq(friendRequests.senderId, user.id), eq(friendRequests.receiverId, targetId)),
          and(eq(friendRequests.senderId, targetId), eq(friendRequests.receiverId, user.id))
        )
      );

    res.json({ success: true, message: 'Друг удален' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. PUBLIC PROFILES & TASTE COMPARISON
// ==========================================

// Search users for collaborators or friends
apiRouter.get('/users/search', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 1) {
      return res.json([]);
    }

    const matchedUsers = await db
      .select({
        id: users.id,
        username: users.username,
        avatar: users.avatar,
        bio: users.bio,
      })
      .from(users)
      .where(
        and(
          sql`LOWER(${users.username}) LIKE ${'%' + q.toLowerCase() + '%'}`,
          eq(users.isBlocked, false)
        )
      )
      .limit(20);

    res.json(matchedUsers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/users/:username', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const current = req.dbUser;
    const { username } = req.params;

    const found = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (found.length === 0) {
      return res.status(404).json({ error: 'Профиль не найден' });
    }

    const profileUser = found[0];
    const isOwner = current?.id === profileUser.id;

    // Check friendship status
    let isFriend = false;
    let friendStatus: 'NONE' | 'PENDING_SENT' | 'PENDING_RECEIVED' | 'FRIENDS' = 'NONE';
    if (current && !isOwner) {
      const reqs = await db
        .select()
        .from(friendRequests)
        .where(
          or(
            and(eq(friendRequests.senderId, current.id), eq(friendRequests.receiverId, profileUser.id)),
            and(eq(friendRequests.senderId, profileUser.id), eq(friendRequests.receiverId, current.id))
          )
        );
      if (reqs.length > 0) {
        const fReq = reqs[0];
        if (fReq.status === 'ACCEPTED') {
          isFriend = true;
          friendStatus = 'FRIENDS';
        } else if (fReq.status === 'PENDING') {
          friendStatus = fReq.senderId === current.id ? 'PENDING_SENT' : 'PENDING_RECEIVED';
        }
      }
    }

    // Evaluate visibility
    const canViewProfile =
      isOwner ||
      profileUser.profileVisibility === 'PUBLIC' ||
      (profileUser.profileVisibility === 'FRIENDS' && isFriend);

    if (!canViewProfile) {
      return res.json({
        user: {
          id: profileUser.id,
          username: profileUser.username,
          avatar: profileUser.avatar,
          bio: null,
          role: profileUser.role,
          createdAt: profileUser.createdAt,
        },
        isPrivate: true,
        isOwner,
        isFriend,
        friendStatus,
        library: [],
        stats: null,
        reviews: [],
        lists: [],
        tierLists: [],
      });
    }

    const canViewLibrary =
      isOwner ||
      profileUser.libraryVisibility === 'PUBLIC' ||
      (profileUser.libraryVisibility === 'FRIENDS' && isFriend);

    const canViewRatings =
      isOwner ||
      profileUser.ratingVisibility === 'PUBLIC' ||
      (profileUser.ratingVisibility === 'FRIENDS' && isFriend);

    const canViewStats =
      isOwner ||
      profileUser.statisticsVisibility === 'PUBLIC' ||
      (profileUser.statisticsVisibility === 'FRIENDS' && isFriend);

    const canViewLists =
      isOwner ||
      profileUser.listVisibility === 'PUBLIC' ||
      (profileUser.listVisibility === 'FRIENDS' && isFriend);

    // Fetch library items
    const libraryItems = await db
      .select({
        userMediaId: userMedia.id,
        status: userMedia.status,
        progress: userMedia.progress,
        progressTotal: userMedia.progressTotal,
        rating: userMedia.rating,
        isFavorite: userMedia.isFavorite,
        notes: userMedia.notes,
        startedAt: userMedia.startedAt,
        completedAt: userMedia.completedAt,
        mediaId: media.id,
        title: media.title,
        originalTitle: media.originalTitle,
        type: media.type,
        posterUrl: media.posterUrl,
        year: media.year,
        publicRating: media.rating,
      })
      .from(userMedia)
      .innerJoin(media, eq(userMedia.mediaId, media.id))
      .where(eq(userMedia.userId, profileUser.id));

    // Stats aggregates
    const categoryStats = {
      MOVIE: { total: 0, completed: 0 },
      TV: { total: 0, completed: 0 },
      ANIME: { total: 0, completed: 0 },
      MANGA: { total: 0, completed: 0 },
      GAME: { total: 0, completed: 0 },
      BOOK: { total: 0, completed: 0 },
      COMIC: { total: 0, completed: 0 },
    };

    let totalRatingsSum = 0;
    let totalRatingsCount = 0;

    for (const item of libraryItems) {
      const cat = item.type as keyof typeof categoryStats;
      if (categoryStats[cat]) {
        categoryStats[cat].total++;
        if (item.status === 'COMPLETED') {
          categoryStats[cat].completed++;
        }
      }
      if (item.rating) {
        totalRatingsSum += item.rating;
        totalRatingsCount++;
      }
    }

    // Fetch reviews if visible
    let userReviews: any[] = [];
    if (canViewRatings) {
      userReviews = await db
        .select({
          id: reviews.id,
          rating: reviews.rating,
          title: reviews.title,
          content: reviews.content,
          containsSpoilers: reviews.containsSpoilers,
          likesCount: reviews.likesCount,
          createdAt: reviews.createdAt,
          mediaId: media.id,
          mediaTitle: media.title,
          mediaType: media.type,
          mediaPoster: media.posterUrl,
          mediaYear: media.year,
        })
        .from(reviews)
        .innerJoin(media, eq(reviews.mediaId, media.id))
        .where(eq(reviews.userId, profileUser.id))
        .orderBy(desc(reviews.createdAt))
        .limit(20);
    }

    // Fetch user lists if visible
    let userLists: any[] = [];
    if (canViewLists) {
      let conditions = [eq(lists.ownerId, profileUser.id)];
      if (!isOwner) {
        if (isFriend) {
          conditions.push(inArray(lists.visibility, ['PUBLIC', 'FRIENDS']));
        } else {
          conditions.push(eq(lists.visibility, 'PUBLIC'));
        }
      }
      userLists = await db
        .select()
        .from(lists)
        .where(and(...conditions))
        .limit(10);
    }

    let userTierLists: any[] = [];
    if (canViewLists) {
      let conditions = [eq(tierLists.ownerId, profileUser.id)];
      if (!isOwner) {
        if (isFriend) {
          conditions.push(inArray(tierLists.visibility, ['PUBLIC', 'FRIENDS']));
        } else {
          conditions.push(eq(tierLists.visibility, 'PUBLIC'));
        }
      }
      userTierLists = await db
        .select()
        .from(tierLists)
        .where(and(...conditions))
        .limit(10);
    }

    res.json({
      user: {
        id: profileUser.id,
        username: profileUser.username,
        avatar: profileUser.avatar,
        bio: profileUser.bio,
        role: profileUser.role,
        telegramChatId: isOwner ? profileUser.telegramChatId : null,
        profileVisibility: profileUser.profileVisibility,
        libraryVisibility: profileUser.libraryVisibility,
        activityVisibility: profileUser.activityVisibility,
        ratingVisibility: profileUser.ratingVisibility,
        listVisibility: profileUser.listVisibility,
        statisticsVisibility: profileUser.statisticsVisibility,
        createdAt: profileUser.createdAt,
      },
      isPrivate: false,
      isOwner,
      isFriend,
      friendStatus,
      canViewLibrary,
      canViewRatings,
      canViewStats,
      canViewLists,
      library: canViewLibrary ? libraryItems : [],
      stats: canViewStats
        ? {
            totalMedia: libraryItems.length,
            completedCount: libraryItems.filter((i) => i.status === 'COMPLETED').length,
            averageRating: totalRatingsCount > 0 ? (totalRatingsSum / totalRatingsCount).toFixed(1) : null,
            categories: categoryStats,
          }
        : null,
      reviews: userReviews,
      lists: userLists,
      tierLists: userTierLists,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Separate user reviews endpoint
apiRouter.get('/users/:username/reviews', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { username } = req.params;
    const current = req.dbUser;

    const foundUser = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (foundUser.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const profileUser = foundUser[0];
    const isOwner = current?.id === profileUser.id;

    if (!isOwner && profileUser.ratingVisibility === 'PRIVATE') {
      return res.json([]);
    }

    const userReviews = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        content: reviews.content,
        containsSpoilers: reviews.containsSpoilers,
        likesCount: reviews.likesCount,
        createdAt: reviews.createdAt,
        mediaId: media.id,
        mediaTitle: media.title,
        mediaType: media.type,
        mediaPoster: media.posterUrl,
        mediaYear: media.year,
      })
      .from(reviews)
      .innerJoin(media, eq(reviews.mediaId, media.id))
      .where(eq(reviews.userId, profileUser.id))
      .orderBy(desc(reviews.createdAt));

    res.json(userReviews);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Taste comparison endpoint
apiRouter.get('/users/:username/compare', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const me = req.dbUser!;
    const { username } = req.params;

    const targetUsers = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (targetUsers.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const friend = targetUsers[0];

    const myMedia = await db
      .select({
        mediaId: userMedia.mediaId,
        rating: userMedia.rating,
        status: userMedia.status,
        title: media.title,
        posterUrl: media.posterUrl,
        type: media.type,
      })
      .from(userMedia)
      .innerJoin(media, eq(userMedia.mediaId, media.id))
      .where(eq(userMedia.userId, me.id));

    const friendMedia = await db
      .select({
        mediaId: userMedia.mediaId,
        rating: userMedia.rating,
        status: userMedia.status,
        title: media.title,
        posterUrl: media.posterUrl,
        type: media.type,
      })
      .from(userMedia)
      .innerJoin(media, eq(userMedia.mediaId, media.id))
      .where(eq(userMedia.userId, friend.id));

    const myMap = new Map(myMedia.map((m) => [m.mediaId, m]));
    const friendMap = new Map(friendMedia.map((m) => [m.mediaId, m]));

    // Common items
    const commonIds = Array.from(myMap.keys()).filter((id) => friendMap.has(id));
    const commonItems = commonIds.map((id) => ({
      mediaId: id,
      title: myMap.get(id)!.title,
      posterUrl: myMap.get(id)!.posterUrl,
      type: myMap.get(id)!.type,
      myRating: myMap.get(id)!.rating,
      friendRating: friendMap.get(id)!.rating,
    }));

    // Calculate score match
    let matchPercentage = 0;
    if (commonItems.length > 0) {
      let totalDiff = 0;
      let ratedCount = 0;
      for (const item of commonItems) {
        if (item.myRating && item.friendRating) {
          totalDiff += Math.abs(item.myRating - item.friendRating);
          ratedCount++;
        }
      }
      if (ratedCount > 0) {
        // Average diff out of 10
        const avgDiff = totalDiff / ratedCount;
        matchPercentage = Math.round(Math.max(10, 100 - avgDiff * 10));
      } else {
        matchPercentage = Math.min(85, 50 + commonItems.length * 5);
      }
    }

    // "Тебе понравилось, а друг не смотрел" (my rating >= 7 and not in friend's list)
    const youLikedFriendHasntWatched = myMedia
      .filter((m) => (m.rating || 0) >= 7 && !friendMap.has(m.mediaId))
      .slice(0, 8);

    // "Другу понравилось, а ты ещё не смотрел" (friend rating >= 7 and not in my list)
    const friendLikedYouHaventWatched = friendMedia
      .filter((m) => (m.rating || 0) >= 7 && !myMap.has(m.mediaId))
      .slice(0, 8);

    res.json({
      friend: { id: friend.id, username: friend.username, avatar: friend.avatar },
      matchPercentage,
      commonCount: commonItems.length,
      commonItems,
      youLikedFriendHasntWatched,
      friendLikedYouHaventWatched,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. LISTS & COLLABORATIVE LISTS
// ==========================================

apiRouter.get('/lists', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const { category, search, sort } = req.query;

    let query = db
      .select({
        id: lists.id,
        title: lists.title,
        description: lists.description,
        cover: lists.cover,
        visibility: lists.visibility,
        category: lists.category,
        createdAt: lists.createdAt,
        ownerId: users.id,
        ownerUsername: users.username,
        ownerAvatar: users.avatar,
      })
      .from(lists)
      .innerJoin(users, eq(lists.ownerId, users.id))
      .where(eq(lists.visibility, 'PUBLIC'))
      .orderBy(desc(lists.createdAt))
      .limit(50);

    const listRows = await query;
    let filtered = listRows;

    if (category && category !== 'ALL') {
      filtered = filtered.filter((l) => l.category === category);
    }

    if (search && typeof search === 'string') {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(
        (l) => l.title.toLowerCase().includes(q) || (l.description && l.description.toLowerCase().includes(q))
      );
    }

    const listIds = filtered.map((l) => l.id);
    let itemsCounts: Record<number, number> = {};
    let followersCounts: Record<number, number> = {};
    let likesCounts: Record<number, number> = {};
    let isFollowedSet = new Set<number>();
    let isLikedSet = new Set<number>();
    let previewItemsMap: Record<number, any[]> = {};

    if (listIds.length > 0) {
      // 1. Batch total items count
      const allItems = await db.select({ listId: listItems.listId, count: count() })
        .from(listItems).where(inArray(listItems.listId, listIds)).groupBy(listItems.listId);
      allItems.forEach(i => itemsCounts[i.listId] = Number(i.count));

      // 2. Batch followers count
      const allFollowers = await db.select({ listId: listFollowers.listId, count: count() })
        .from(listFollowers).where(inArray(listFollowers.listId, listIds)).groupBy(listFollowers.listId);
      allFollowers.forEach(f => followersCounts[f.listId] = Number(f.count));

      // 3. Batch likes count
      const allLikes = await db.select({ targetId: likes.targetId, count: count() })
        .from(likes).where(and(eq(likes.targetType, 'LIST'), inArray(likes.targetId, listIds))).groupBy(likes.targetId);
      allLikes.forEach(l => likesCounts[l.targetId] = Number(l.count));

      // 4. Batch user states
      if (user) {
        const userFollows = await db.select({ listId: listFollowers.listId }).from(listFollowers)
          .where(and(eq(listFollowers.userId, user.id), inArray(listFollowers.listId, listIds)));
        userFollows.forEach(f => isFollowedSet.add(f.listId));

        const userLikesList = await db.select({ targetId: likes.targetId }).from(likes)
          .where(and(eq(likes.userId, user.id), eq(likes.targetType, 'LIST'), inArray(likes.targetId, listIds)));
        userLikesList.forEach(l => isLikedSet.add(l.targetId));
      }

      // 5. Batch preview items using ROW_NUMBER
      const previewsQuery = await db.execute(sql`
        SELECT li.list_id as "listId", li.id, li.media_id as "mediaId", m.title, m.poster_url as "posterUrl", m.type
        FROM (
          SELECT id, media_id, list_id, ROW_NUMBER() OVER(PARTITION BY list_id ORDER BY order_index) as rn
          FROM list_items
          WHERE list_id = ANY(ARRAY[${sql.join(listIds, sql`,`)}]::int[])
        ) li
        INNER JOIN media m ON li.media_id = m.id
        WHERE li.rn <= 4
      `);
      
      const rows = Array.isArray(previewsQuery) ? previewsQuery : (previewsQuery as any).rows || previewsQuery;
      rows.forEach((row: any) => {
        if (!previewItemsMap[row.listId]) previewItemsMap[row.listId] = [];
        previewItemsMap[row.listId].push({
          id: row.id,
          mediaId: row.mediaId,
          title: row.title,
          posterUrl: row.posterUrl,
          type: row.type,
        });
      });
    }

    const enriched = filtered.map((l) => ({
      ...l,
      itemCount: itemsCounts[l.id] || 0,
      previewItems: previewItemsMap[l.id] || [],
      followersCount: followersCounts[l.id] || 0,
      likesCount: likesCounts[l.id] || 0,
      isFollowed: isFollowedSet.has(l.id),
      isLiked: isLikedSet.has(l.id),
    }));

    if (sort === 'popular') {
      enriched.sort((a, b) => b.likesCount + b.followersCount - (a.likesCount + a.followersCount));
    }

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/lists', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { title, description, cover, visibility, category, members } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Название списка обязательно' });
    }

    const validCategories = ['MOVIES_TV', 'GAMES', 'ANIME', 'MANGA', 'BOOKS', 'COMICS'];
    const listCategory = validCategories.includes(category) ? category : 'MOVIES_TV';
    const validVisibilities = ['PUBLIC', 'FRIENDS', 'PRIVATE'];
    const listVisibility = validVisibilities.includes(visibility) ? visibility : 'PUBLIC';

    const [newList] = await db
      .insert(lists)
      .values({
        title: title.trim(),
        description: description ? description.trim() : null,
        cover: cover || null,
        visibility: listVisibility,
        category: listCategory,
        ownerId: user.id,
      })
      .returning();

    // Owner is first member
    await db.insert(listMembers).values({
      listId: newList.id,
      userId: user.id,
      role: 'OWNER',
    });

    // Add initial collaborators as pending invitations
    if (Array.isArray(members) && members.length > 0) {
      const addedUserIds = new Set<number>();
      for (const m of members) {
        const uId = Number(m.userId);
        if (!uId || isNaN(uId) || uId === user.id || addedUserIds.has(uId)) {
          continue;
        }
        addedUserIds.add(uId);

        const [userExists] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, uId)).limit(1);
        if (userExists) {
          const role = m.role === 'VIEWER' ? 'VIEWER' : 'EDITOR';
          const [invitation] = await db
            .insert(listInvitations)
            .values({
              listId: newList.id,
              inviterId: user.id,
              inviteeId: uId,
              permission: role,
              status: 'PENDING',
              createdAt: new Date(),
            })
            .returning();

          await sendAppNotification(uId, {
            type: 'LIST_INVITE',
            title: 'Приглашение в совместный список',
            body: `Вас пригласили в список «${newList.title}»`,
            content: `${user.username} пригласил вас стать ${role === 'EDITOR' ? 'редактором' : 'читателем'} списка «${newList.title}».`,
            link: `/lists/${newList.id}`,
            relatedEntity: 'LIST',
            relatedEntityId: String(newList.id),
            senderId: user.id,
            senderAvatar: user.avatar,
            senderUsername: user.username,
            metadata: {
              listId: newList.id,
              invitationId: invitation.id,
              permission: role,
              listTitle: newList.title,
            },
          });
        }
      }
    }

    // Log social activity if list is not private
    if (newList.visibility !== 'PRIVATE') {
      await db.insert(activities).values({
        userId: user.id,
        type: 'LIST_CREATED',
        listId: newList.id,
        details: JSON.stringify({ listId: newList.id, title: newList.title }),
      }).catch(() => {});
    }

    // Trigger list creation achievement
    achievementService.checkAndUnlock(user.id, 'LIST_CREATED', { listId: newList.id }).catch(() => {});

    res.json(newList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all custom lists created by or accessible to current user
apiRouter.get('/lists/my', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;

    // Find lists owned by user OR where user is a collaborative member
    const memberships = await db
      .select({ listId: listMembers.listId, role: listMembers.role })
      .from(listMembers)
      .where(eq(listMembers.userId, user.id));

    const listIds = [...new Set(memberships.map((m) => m.listId))];

    if (listIds.length === 0) {
      return res.json([]);
    }

    const myLists = await db
      .select({
        id: lists.id,
        title: lists.title,
        description: lists.description,
        cover: lists.cover,
        visibility: lists.visibility,
        category: lists.category,
        createdAt: lists.createdAt,
        ownerId: lists.ownerId,
        ownerUsername: users.username,
        ownerAvatar: users.avatar,
      })
      .from(lists)
      .innerJoin(users, eq(lists.ownerId, users.id))
      .where(inArray(lists.id, listIds))
      .orderBy(desc(lists.createdAt));

    const roleMap = new Map(memberships.map((m) => [m.listId, m.role]));

    // Get item counts and preview items for each list
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const enriched = await Promise.all(
      myLists.map(async (l) => {
        const itemConds = [eq(listItems.listId, l.id)];
        if (!isSuperAdmin) {
          itemConds.push(eq(media.isHidden, false));
        }

        const items = await db
          .select({
            id: listItems.id,
            mediaId: listItems.mediaId,
            title: media.title,
            posterUrl: media.posterUrl,
            type: media.type,
          })
          .from(listItems)
          .innerJoin(media, eq(listItems.mediaId, media.id))
          .where(and(...itemConds))
          .orderBy(listItems.orderIndex);

        const followersCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(listFollowers)
          .where(eq(listFollowers.listId, l.id));

        return {
          ...l,
          role: roleMap.get(l.id) || (l.ownerId === user.id ? 'OWNER' : 'VIEWER'),
          isOwner: l.ownerId === user.id,
          itemCount: items.length,
          previewItems: items.slice(0, 4),
          mediaIds: items.map((i) => i.mediaId),
          followersCount: Number(followersCount[0]?.count || 0),
        };
      })
    );

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get lists followed by current user
apiRouter.get('/lists/following/my', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;

    const follows = await db
      .select({ listId: listFollowers.listId })
      .from(listFollowers)
      .where(eq(listFollowers.userId, user.id));

    const listIds = follows.map((f) => f.listId);
    if (listIds.length === 0) {
      return res.json([]);
    }

    const followedLists = await db
      .select({
        id: lists.id,
        title: lists.title,
        description: lists.description,
        cover: lists.cover,
        visibility: lists.visibility,
        category: lists.category,
        createdAt: lists.createdAt,
        ownerId: lists.ownerId,
        ownerUsername: users.username,
        ownerAvatar: users.avatar,
      })
      .from(lists)
      .innerJoin(users, eq(lists.ownerId, users.id))
      .where(inArray(lists.id, listIds))
      .orderBy(desc(lists.createdAt));

    const enriched = await Promise.all(
      followedLists.map(async (l) => {
        const itemConds = [eq(listItems.listId, l.id)];
        if (user.role !== 'SUPER_ADMIN') {
          itemConds.push(eq(media.isHidden, false));
        }

        const items = await db
          .select({
            id: listItems.id,
            mediaId: listItems.mediaId,
            title: media.title,
            posterUrl: media.posterUrl,
            type: media.type,
          })
          .from(listItems)
          .innerJoin(media, eq(listItems.mediaId, media.id))
          .where(and(...itemConds))
          .orderBy(listItems.orderIndex);

        return {
          ...l,
          itemCount: items.length,
          previewItems: items.slice(0, 4),
          isFollowed: true,
        };
      })
    );

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add media to list (with strict category locking)
apiRouter.post('/lists/:id/add-media', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);
    const { mediaId, mediaPayload, notes } = req.body;

    const resolvedMediaId = await ensureMediaRecord(mediaId ? Number(mediaId) : undefined, mediaPayload);
    if (!resolvedMediaId) {
      return res.status(400).json({ error: 'Не указаны данные медиа' });
    }

    // Verify list ownership or editor rights
    const targetList = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (targetList.length === 0) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    if (targetList[0].ownerId !== user.id) {
      const member = await db
        .select()
        .from(listMembers)
        .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, user.id)))
        .limit(1);
      if (member.length === 0 || member[0].role === 'VIEWER') {
        return res.status(403).json({ error: 'Нет прав на добавление в этот список' });
      }
    }

    // Fetch media details to enforce Category Locking
    const [mediaRow] = await db.select().from(media).where(eq(media.id, resolvedMediaId)).limit(1);
    if (!mediaRow) {
      return res.status(404).json({ error: 'Медиа не найдено' });
    }

    // Category Locking enforcement (Requirement 7)
    if (targetList[0].category && mediaRow.type !== targetList[0].category) {
      return res.status(400).json({
        error: `Категория "${mediaRow.type}" не совпадает с категорией списка "${targetList[0].category}". В этот список можно добавлять только ${targetList[0].category}.`,
      });
    }

    // Check if item is already in list
    const existing = await db
      .select()
      .from(listItems)
      .where(and(eq(listItems.listId, listId), eq(listItems.mediaId, resolvedMediaId)))
      .limit(1);

    if (existing.length > 0) {
      return res.json({ ok: true, alreadyExists: true, message: 'Уже добавлено в этот список' });
    }

    // Get highest orderIndex
    const currentItems = await db
      .select({ orderIndex: listItems.orderIndex })
      .from(listItems)
      .where(eq(listItems.listId, listId));
    const nextOrder = currentItems.length > 0 ? Math.max(...currentItems.map((i) => i.orderIndex || 0)) + 1 : 0;

    const [newItem] = await db
      .insert(listItems)
      .values({
        listId,
        mediaId: resolvedMediaId,
        notes: notes || null,
        orderIndex: nextOrder,
        addedById: user.id,
      })
      .returning();

    // Trigger list item addition achievement
    achievementService.checkAndUnlock(user.id, 'LIST_ITEM_ADDED', { listId }).catch(() => {});

    res.json({ ok: true, item: newItem });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Single List Detail
apiRouter.get('/lists/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID списка' });
    }

    const found = await db
      .select({
        id: lists.id,
        title: lists.title,
        description: lists.description,
        cover: lists.cover,
        visibility: lists.visibility,
        category: lists.category,
        createdAt: lists.createdAt,
        ownerId: users.id,
        ownerUsername: users.username,
        ownerAvatar: users.avatar,
      })
      .from(lists)
      .innerJoin(users, eq(lists.ownerId, users.id))
      .where(eq(lists.id, id))
      .limit(1);

    if (found.length === 0) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    const list = found[0];

    // Fetch members first to check membership
    const members = await db
      .select({
        id: listMembers.id,
        userId: listMembers.userId,
        role: listMembers.role,
        createdAt: listMembers.createdAt,
        username: users.username,
        avatar: users.avatar,
      })
      .from(listMembers)
      .innerJoin(users, eq(listMembers.userId, users.id))
      .where(eq(listMembers.listId, id));

    const isMember = user ? members.some((m) => m.userId === user.id) : false;
    const isOwner = user ? (user.id === list.ownerId || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') : false;

    // Check if current user has a pending invitation to this list
    let pendingInvitation: any = null;
    if (user && !isOwner && !isMember) {
      const [inv] = await db
        .select({
          id: listInvitations.id,
          listId: listInvitations.listId,
          inviterId: listInvitations.inviterId,
          inviteeId: listInvitations.inviteeId,
          permission: listInvitations.permission,
          status: listInvitations.status,
          createdAt: listInvitations.createdAt,
          inviterUsername: users.username,
          inviterAvatar: users.avatar,
        })
        .from(listInvitations)
        .innerJoin(users, eq(listInvitations.inviterId, users.id))
        .where(
          and(
            eq(listInvitations.listId, id),
            eq(listInvitations.inviteeId, user.id),
            eq(listInvitations.status, 'PENDING')
          )
        )
        .limit(1);
      if (inv) {
        pendingInvitation = inv;
      }
    }

    // Check visibility permissions
    if (list.visibility === 'PRIVATE') {
      if (!isOwner && !isMember && !pendingInvitation) {
        return res.status(403).json({ error: 'Этот список является приватным' });
      }
    } else if (list.visibility === 'FRIENDS') {
      if (!isOwner && !isMember && !pendingInvitation) {
        let isFriend = false;
        if (user) {
          const reqs = await db
            .select()
            .from(friendRequests)
            .where(
              and(
                or(
                  and(eq(friendRequests.senderId, user.id), eq(friendRequests.receiverId, list.ownerId)),
                  and(eq(friendRequests.senderId, list.ownerId), eq(friendRequests.receiverId, user.id))
                ),
                eq(friendRequests.status, 'ACCEPTED')
              )
            )
            .limit(1);
          isFriend = reqs.length > 0;
        }
        if (!isFriend) {
          return res.status(403).json({ error: 'Этот список доступен только автору и его друзьям' });
        }
      }
    }

    // Fetch items with media and addedBy user details
    const listConditions: any[] = [eq(listItems.listId, id)];
    if (user?.role !== 'SUPER_ADMIN') {
      listConditions.push(eq(media.isHidden, false));
    }

    const rawItems = await db
      .select({
        id: listItems.id,
        orderIndex: listItems.orderIndex,
        notes: listItems.notes,
        addedById: listItems.addedById,
        createdAt: listItems.createdAt,
        mediaId: media.id,
        title: media.title,
        originalTitle: media.originalTitle,
        type: media.type,
        posterUrl: media.posterUrl,
        year: media.year,
        rating: media.rating,
        description: media.description,
        isAdult: media.isAdult,
        ageRating: media.ageRating,
        addedByUsername: users.username,
        addedByAvatar: users.avatar,
      })
      .from(listItems)
      .innerJoin(media, eq(listItems.mediaId, media.id))
      .leftJoin(users, eq(listItems.addedById, users.id))
      .where(and(...listConditions))
      .orderBy(listItems.orderIndex, listItems.id);

    const items = ContentVisibilityService.filterAccessibleContent(user, rawItems);

    // Determine current user's role
    let userRole: 'OWNER' | 'EDITOR' | 'VIEWER' | null = null;
    let isFollowed = false;
    let isLiked = false;

    if (user) {
      if (user.id === list.ownerId) {
        userRole = 'OWNER';
      } else {
        const mem = members.find((m) => m.userId === user.id);
        if (mem) userRole = mem.role as any;
      }

      const followRow = await db
        .select()
        .from(listFollowers)
        .where(and(eq(listFollowers.listId, id), eq(listFollowers.userId, user.id)))
        .limit(1);
      isFollowed = followRow.length > 0;

      const likeRow = await db
        .select()
        .from(likes)
        .where(and(eq(likes.targetType, 'LIST'), eq(likes.targetId, id), eq(likes.userId, user.id)))
        .limit(1);
      isLiked = likeRow.length > 0;
    }

    const canEdit = userRole === 'OWNER' || userRole === 'EDITOR' || (user ? (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') : false);

    const followersCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(listFollowers)
      .where(eq(listFollowers.listId, id));

    const likesCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(likes)
      .where(and(eq(likes.targetType, 'LIST'), eq(likes.targetId, id)));

    let pendingInvitations: any[] = [];
    if (isOwner) {
      pendingInvitations = await db
        .select({
          id: listInvitations.id,
          listId: listInvitations.listId,
          inviterId: listInvitations.inviterId,
          inviteeId: listInvitations.inviteeId,
          permission: listInvitations.permission,
          status: listInvitations.status,
          createdAt: listInvitations.createdAt,
          username: users.username,
          avatar: users.avatar,
        })
        .from(listInvitations)
        .innerJoin(users, eq(listInvitations.inviteeId, users.id))
        .where(
          and(
            eq(listInvitations.listId, id),
            eq(listInvitations.status, 'PENDING')
          )
        )
        .orderBy(desc(listInvitations.createdAt));
    }

    res.json({
      ...list,
      items,
      members,
      userRole,
      isOwner: user?.id === list.ownerId,
      canEdit,
      isFollowed,
      followersCount: Number(followersCount[0]?.count || 0),
      isLiked,
      likesCount: Number(likesCount[0]?.count || 0),
      pendingInvitation,
      invitations: pendingInvitations,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update list settings (OWNER ONLY)
apiRouter.put('/lists/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const { title, description, cover, visibility, category } = req.body;

    const [targetList] = await db.select().from(lists).where(eq(lists.id, id)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    // Strictly OWNER or system ADMIN
    if (targetList.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Только владелец может изменять настройки списка' });
    }

    const validCategories = ['MOVIES_TV', 'GAMES', 'ANIME', 'MANGA', 'BOOKS', 'COMICS'];
    const validVisibilities = ['PUBLIC', 'FRIENDS', 'PRIVATE'];

    const [updated] = await db
      .update(lists)
      .set({
        title: title ? title.trim() : targetList.title,
        description: description !== undefined ? (description ? description.trim() : null) : targetList.description,
        cover: cover !== undefined ? cover : targetList.cover,
        visibility: visibility && validVisibilities.includes(visibility) ? visibility : targetList.visibility,
        category: category && validCategories.includes(category) ? category : targetList.category,
        updatedAt: new Date(),
      })
      .where(eq(lists.id, id))
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.patch('/lists/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const { title, description, cover, visibility, category } = req.body;

    const [targetList] = await db.select().from(lists).where(eq(lists.id, id)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    if (targetList.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Только владелец может изменять настройки списка' });
    }

    const validCategories = ['MOVIES_TV', 'GAMES', 'ANIME', 'MANGA', 'BOOKS', 'COMICS'];
    const validVisibilities = ['PUBLIC', 'FRIENDS', 'PRIVATE'];

    const [updated] = await db
      .update(lists)
      .set({
        title: title ? title.trim() : targetList.title,
        description: description !== undefined ? (description ? description.trim() : null) : targetList.description,
        cover: cover !== undefined ? cover : targetList.cover,
        visibility: visibility && validVisibilities.includes(visibility) ? visibility : targetList.visibility,
        category: category && validCategories.includes(category) ? category : targetList.category,
        updatedAt: new Date(),
      })
      .where(eq(lists.id, id))
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete list (OWNER ONLY)
apiRouter.delete('/lists/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);

    const [targetList] = await db.select().from(lists).where(eq(lists.id, id)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    if (targetList.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Только владелец может удалить список' });
    }

    await db.delete(lists).where(eq(lists.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get items of a list
apiRouter.get('/lists/:id/items', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID списка' });
    }

    const [targetList] = await db.select().from(lists).where(eq(lists.id, id)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    // Visibility check
    if (targetList.visibility === 'PRIVATE') {
      const isOwner = user ? (user.id === targetList.ownerId || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') : false;
      const isMember = user ? (await db.select().from(listMembers).where(and(eq(listMembers.listId, id), eq(listMembers.userId, user.id))).limit(1)).length > 0 : false;
      if (!isOwner && !isMember) {
        return res.status(403).json({ error: 'Этот список является приватным' });
      }
    }

    const items = await db
      .select({
        id: listItems.id,
        orderIndex: listItems.orderIndex,
        notes: listItems.notes,
        addedById: listItems.addedById,
        createdAt: listItems.createdAt,
        mediaId: media.id,
        title: media.title,
        originalTitle: media.originalTitle,
        type: media.type,
        posterUrl: media.posterUrl,
        year: media.year,
        rating: media.rating,
        description: media.description,
        addedByUsername: users.username,
        addedByAvatar: users.avatar,
      })
      .from(listItems)
      .innerJoin(media, eq(listItems.mediaId, media.id))
      .leftJoin(users, eq(listItems.addedById, users.id))
      .where(eq(listItems.listId, id))
      .orderBy(listItems.orderIndex, listItems.id);

    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add item with Category Locking & Permission enforcement
apiRouter.post('/lists/:id/items', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);
    const { mediaId, mediaPayload, notes } = req.body;

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    // Check membership & role (OWNER or EDITOR only)
    if (targetList.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      const member = await db
        .select()
        .from(listMembers)
        .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, user.id)))
        .limit(1);

      if (member.length === 0 || member[0].role === 'VIEWER') {
        return res.status(403).json({ error: 'У вас нет прав на добавление тайтлов в этот список' });
      }
    }

    // Resolve mediaId if mediaPayload provided
    let resolvedMediaId = mediaId ? Number(mediaId) : undefined;
    if ((!resolvedMediaId || isNaN(resolvedMediaId)) && mediaPayload) {
      resolvedMediaId = (await ensureMediaRecord(undefined, mediaPayload)) || undefined;
    } else if (resolvedMediaId && mediaPayload) {
      resolvedMediaId = (await ensureMediaRecord(resolvedMediaId, mediaPayload)) || resolvedMediaId;
    }

    if (!resolvedMediaId) {
      return res.status(400).json({ error: 'Не указан тайтл для добавления' });
    }

    // Enforce Category Locking
    const [mediaRow] = await db.select().from(media).where(eq(media.id, resolvedMediaId)).limit(1);
    if (!mediaRow) {
      return res.status(404).json({ error: 'Тайтл не найден в базе данных' });
    }

    if (targetList.category) {
      let allowed = false;
      switch (targetList.category) {
        case 'MOVIES_TV':
          allowed = mediaRow.type === 'MOVIE' || mediaRow.type === 'TV';
          break;
        case 'GAMES':
          allowed = mediaRow.type === 'GAME';
          break;
        case 'ANIME':
          allowed = mediaRow.type === 'ANIME';
          break;
        case 'MANGA':
          allowed = mediaRow.type === 'MANGA';
          break;
        case 'BOOKS':
          allowed = mediaRow.type === 'BOOK';
          break;
        case 'COMICS':
          allowed = mediaRow.type === 'COMIC';
          break;
      }

      if (!allowed) {
        return res.status(400).json({
          error: `В этот список нельзя добавить контент категории «${mediaRow.type}». Категория списка: ${targetList.category}.`,
        });
      }
    }

    // Check if already in list
    const existing = await db
      .select()
      .from(listItems)
      .where(and(eq(listItems.listId, listId), eq(listItems.mediaId, resolvedMediaId)))
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Тайтл уже добавлен в этот список' });
    }

    const currentItems = await db
      .select({ orderIndex: listItems.orderIndex })
      .from(listItems)
      .where(eq(listItems.listId, listId));
    const nextOrder = currentItems.length > 0 ? Math.max(...currentItems.map((i) => i.orderIndex || 0)) + 1 : 0;

    const [item] = await db
      .insert(listItems)
      .values({
        listId,
        mediaId: resolvedMediaId,
        notes: notes ? notes.trim() : null,
        orderIndex: nextOrder,
        addedById: user.id,
      })
      .returning();

    res.json({
      ...item,
      media: mediaRow,
      addedByUsername: user.username,
      addedByAvatar: user.avatar,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Remove item from list (OWNER or EDITOR only)
apiRouter.delete('/lists/:id/items/:mediaId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);
    const targetParam = parseInt(req.params.mediaId, 10);

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    if (targetList.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      const member = await db
        .select()
        .from(listMembers)
        .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, user.id)))
        .limit(1);
      if (member.length === 0 || member[0].role === 'VIEWER') {
        return res.status(403).json({ error: 'У вас нет прав на удаление элементов из этого списка' });
      }
    }

    // Match either by mediaId or by itemId
    await db
      .delete(listItems)
      .where(
        and(
          eq(listItems.listId, listId),
          or(eq(listItems.mediaId, targetParam), eq(listItems.id, targetParam))
        )
      );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder items in list (OWNER or EDITOR only)
apiRouter.put('/lists/:id/reorder', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);
    const { items, itemIds, mediaIds } = req.body;

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    if (targetList.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      const member = await db
        .select()
        .from(listMembers)
        .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, user.id)))
        .limit(1);
      if (member.length === 0 || member[0].role === 'VIEWER') {
        return res.status(403).json({ error: 'У вас нет прав на изменение порядка' });
      }
    }

    if (Array.isArray(items)) {
      await Promise.all(
        items.map((item: { id: number; orderIndex: number }) =>
          db
            .update(listItems)
            .set({ orderIndex: item.orderIndex })
            .where(and(eq(listItems.id, item.id), eq(listItems.listId, listId)))
        )
      );
    } else if (Array.isArray(itemIds)) {
      await Promise.all(
        itemIds.map((itemId: number, idx: number) =>
          db
            .update(listItems)
            .set({ orderIndex: idx })
            .where(and(eq(listItems.id, itemId), eq(listItems.listId, listId)))
        )
      );
    } else if (Array.isArray(mediaIds)) {
      await Promise.all(
        mediaIds.map((mId: number, idx: number) =>
          db
            .update(listItems)
            .set({ orderIndex: idx })
            .where(and(eq(listItems.mediaId, mId), eq(listItems.listId, listId)))
        )
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.patch('/lists/:id/items/reorder', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);
    const { items, itemIds, mediaIds } = req.body;

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    if (targetList.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      const member = await db
        .select()
        .from(listMembers)
        .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, user.id)))
        .limit(1);
      if (member.length === 0 || member[0].role === 'VIEWER') {
        return res.status(403).json({ error: 'У вас нет прав на изменение порядка' });
      }
    }

    if (Array.isArray(items)) {
      await Promise.all(
        items.map((item: { id: number; orderIndex: number }) =>
          db
            .update(listItems)
            .set({ orderIndex: item.orderIndex })
            .where(and(eq(listItems.id, item.id), eq(listItems.listId, listId)))
        )
      );
    } else if (Array.isArray(itemIds)) {
      await Promise.all(
        itemIds.map((itemId: number, idx: number) =>
          db
            .update(listItems)
            .set({ orderIndex: idx })
            .where(and(eq(listItems.id, itemId), eq(listItems.listId, listId)))
        )
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Collaborative list members
apiRouter.get('/lists/:id/members', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const listId = parseInt(req.params.id, 10);
    const members = await db
      .select({
        id: listMembers.id,
        userId: listMembers.userId,
        role: listMembers.role,
        createdAt: listMembers.createdAt,
        username: users.username,
        avatar: users.avatar,
      })
      .from(listMembers)
      .innerJoin(users, eq(listMembers.userId, users.id))
      .where(eq(listMembers.listId, listId));

    res.json(members);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add member / send invitation to collaborative list (OWNER ONLY)
const handleSendListInvitation = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);
    const { userId, role = 'EDITOR', permission } = req.body;
    const requestedRole = permission || role || 'EDITOR';

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    // Only OWNER or ADMIN can invite
    if (targetList.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Только создатель списка может отправлять приглашения' });
    }

    const targetUserId = Number(userId);
    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Некорректный ID пользователя' });
    }

    if (targetUserId === targetList.ownerId) {
      return res.status(400).json({ error: 'Владелец уже является автором списка' });
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Check if user is already an active member
    const existingMember = await db
      .select()
      .from(listMembers)
      .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, targetUserId)))
      .limit(1);

    if (existingMember.length > 0) {
      return res.status(400).json({ error: 'Пользователь уже является участником этого списка' });
    }

    const validRole = requestedRole === 'VIEWER' ? 'VIEWER' : 'EDITOR';

    // Check if there is already a PENDING invitation
    const existingInv = await db
      .select()
      .from(listInvitations)
      .where(
        and(
          eq(listInvitations.listId, listId),
          eq(listInvitations.inviteeId, targetUserId),
          eq(listInvitations.status, 'PENDING')
        )
      )
      .limit(1);

    let invitationRow: any;
    if (existingInv.length > 0) {
      const [updated] = await db
        .update(listInvitations)
        .set({
          permission: validRole,
          createdAt: new Date(),
        })
        .where(eq(listInvitations.id, existingInv[0].id))
        .returning();
      invitationRow = updated;
    } else {
      const [created] = await db
        .insert(listInvitations)
        .values({
          listId,
          inviterId: user.id,
          inviteeId: targetUserId,
          permission: validRole,
          status: 'PENDING',
          createdAt: new Date(),
        })
        .returning();
      invitationRow = created;
    }

    await sendAppNotification(targetUserId, {
      type: 'LIST_INVITE',
      title: 'Приглашение в совместный список',
      body: `Вас пригласили в список «${targetList.title}»`,
      content: `${user.username} пригласил вас стать ${validRole === 'EDITOR' ? 'редактором' : 'читателем'} списка «${targetList.title}».`,
      link: `/lists/${listId}`,
      relatedEntity: 'LIST',
      relatedEntityId: String(listId),
      senderId: user.id,
      senderAvatar: user.avatar,
      senderUsername: user.username,
      metadata: {
        listId,
        invitationId: invitationRow.id,
        permission: validRole,
        listTitle: targetList.title,
      },
    });

    res.json({
      ...invitationRow,
      isPending: true,
      username: targetUser.username,
      avatar: targetUser.avatar,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

apiRouter.post('/lists/:id/members', requireAuth, handleSendListInvitation);
apiRouter.post('/lists/:id/invitations', requireAuth, handleSendListInvitation);

// Get list pending invitations (OWNER ONLY)
apiRouter.get('/lists/:id/invitations', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);
    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) return res.status(404).json({ error: 'Список не найден' });
    if (targetList.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Только создатель списка может просматривать приглашения' });
    }

    const listInvs = await db
      .select({
        id: listInvitations.id,
        listId: listInvitations.listId,
        inviterId: listInvitations.inviterId,
        inviteeId: listInvitations.inviteeId,
        permission: listInvitations.permission,
        status: listInvitations.status,
        createdAt: listInvitations.createdAt,
        username: users.username,
        avatar: users.avatar,
      })
      .from(listInvitations)
      .innerJoin(users, eq(listInvitations.inviteeId, users.id))
      .where(and(eq(listInvitations.listId, listId), eq(listInvitations.status, 'PENDING')))
      .orderBy(desc(listInvitations.createdAt));

    res.json(listInvs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Revoke list invitation (OWNER or INVITEE)
apiRouter.delete('/lists/:id/invitations/:invitationId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);
    const invitationId = parseInt(req.params.invitationId, 10);

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) return res.status(404).json({ error: 'Список не найден' });

    const [inv] = await db
      .select()
      .from(listInvitations)
      .where(and(eq(listInvitations.id, invitationId), eq(listInvitations.listId, listId)))
      .limit(1);

    if (!inv) return res.status(404).json({ error: 'Приглашение не найдено' });

    if (targetList.ownerId !== user.id && inv.inviteeId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Нет прав на отмену приглашения' });
    }

    await db
      .update(listInvitations)
      .set({ status: 'REVOKED', respondedAt: new Date() })
      .where(eq(listInvitations.id, invitationId));

    res.json({ success: true, message: 'Приглашение отменено' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Accept list invitation by listId
apiRouter.post('/lists/:id/invitations/accept', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);

    const [invitation] = await db
      .select()
      .from(listInvitations)
      .where(
        and(
          eq(listInvitations.listId, listId),
          eq(listInvitations.inviteeId, user.id),
          eq(listInvitations.status, 'PENDING')
        )
      )
      .limit(1);

    if (!invitation) {
      return res.status(404).json({ error: 'Приглашение не найдено или уже обработано' });
    }

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) return res.status(404).json({ error: 'Список не найден' });

    await db
      .update(listInvitations)
      .set({ status: 'ACCEPTED', respondedAt: new Date() })
      .where(eq(listInvitations.id, invitation.id));

    const existingMember = await db
      .select()
      .from(listMembers)
      .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, user.id)))
      .limit(1);

    if (existingMember.length > 0) {
      await db
        .update(listMembers)
        .set({ role: invitation.permission })
        .where(eq(listMembers.id, existingMember[0].id));
    } else {
      await db.insert(listMembers).values({
        listId,
        userId: user.id,
        role: invitation.permission,
      });
    }

    await sendAppNotification(targetList.ownerId, {
      type: 'LIST_INVITE',
      title: 'Приглашение принято',
      body: `Пользователь ${user.username} принял приглашение в ваш список «${targetList.title}»`,
      content: `${user.username} присоединился к списку «${targetList.title}» как ${invitation.permission === 'EDITOR' ? 'редактор' : 'читатель'}.`,
      link: `/lists/${listId}`,
      relatedEntity: 'LIST',
      relatedEntityId: String(listId),
      senderId: user.id,
      senderAvatar: user.avatar,
      senderUsername: user.username,
    });

    res.json({ success: true, listId, role: invitation.permission });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Decline list invitation by listId
apiRouter.post('/lists/:id/invitations/decline', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);

    const [invitation] = await db
      .select()
      .from(listInvitations)
      .where(
        and(
          eq(listInvitations.listId, listId),
          eq(listInvitations.inviteeId, user.id),
          eq(listInvitations.status, 'PENDING')
        )
      )
      .limit(1);

    if (!invitation) {
      return res.status(404).json({ error: 'Приглашение не найдено или уже обработано' });
    }

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);

    await db
      .update(listInvitations)
      .set({ status: 'DECLINED', respondedAt: new Date() })
      .where(eq(listInvitations.id, invitation.id));

    if (targetList) {
      await sendAppNotification(targetList.ownerId, {
        type: 'LIST_INVITE',
        title: 'Приглашение отклонено',
        body: `Пользователь ${user.username} отклонил приглашение в ваш список «${targetList.title}»`,
        link: `/lists/${listId}`,
        relatedEntity: 'LIST',
        relatedEntityId: String(listId),
        senderId: user.id,
        senderAvatar: user.avatar,
        senderUsername: user.username,
      });
    }

    res.json({ success: true, message: 'Приглашение отклонено' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Direct invitation response by invitation ID
apiRouter.post('/list-invitations/:id/accept', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const invId = parseInt(req.params.id, 10);

    const [invitation] = await db
      .select()
      .from(listInvitations)
      .where(and(eq(listInvitations.id, invId), eq(listInvitations.inviteeId, user.id), eq(listInvitations.status, 'PENDING')))
      .limit(1);

    if (!invitation) return res.status(404).json({ error: 'Приглашение не найдено или уже обработано' });

    const [targetList] = await db.select().from(lists).where(eq(lists.id, invitation.listId)).limit(1);
    if (!targetList) return res.status(404).json({ error: 'Список не найден' });

    await db
      .update(listInvitations)
      .set({ status: 'ACCEPTED', respondedAt: new Date() })
      .where(eq(listInvitations.id, invitation.id));

    const existingMember = await db
      .select()
      .from(listMembers)
      .where(and(eq(listMembers.listId, invitation.listId), eq(listMembers.userId, user.id)))
      .limit(1);

    if (existingMember.length > 0) {
      await db
        .update(listMembers)
        .set({ role: invitation.permission })
        .where(eq(listMembers.id, existingMember[0].id));
    } else {
      await db.insert(listMembers).values({
        listId: invitation.listId,
        userId: user.id,
        role: invitation.permission,
      });
    }

    await sendAppNotification(targetList.ownerId, {
      type: 'LIST_INVITE',
      title: 'Приглашение принято',
      body: `Пользователь ${user.username} принял приглашение в ваш список «${targetList.title}»`,
      content: `${user.username} присоединился к списку «${targetList.title}» как ${invitation.permission === 'EDITOR' ? 'редактор' : 'читатель'}.`,
      link: `/lists/${invitation.listId}`,
      relatedEntity: 'LIST',
      relatedEntityId: String(invitation.listId),
      senderId: user.id,
      senderAvatar: user.avatar,
      senderUsername: user.username,
    });

    res.json({ success: true, listId: invitation.listId, role: invitation.permission });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/list-invitations/:id/decline', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const invId = parseInt(req.params.id, 10);

    const [invitation] = await db
      .select()
      .from(listInvitations)
      .where(and(eq(listInvitations.id, invId), eq(listInvitations.inviteeId, user.id), eq(listInvitations.status, 'PENDING')))
      .limit(1);

    if (!invitation) return res.status(404).json({ error: 'Приглашение не найдено или уже обработано' });

    const [targetList] = await db.select().from(lists).where(eq(lists.id, invitation.listId)).limit(1);

    await db
      .update(listInvitations)
      .set({ status: 'DECLINED', respondedAt: new Date() })
      .where(eq(listInvitations.id, invitation.id));

    if (targetList) {
      await sendAppNotification(targetList.ownerId, {
        type: 'LIST_INVITE',
        title: 'Приглашение отклонено',
        body: `Пользователь ${user.username} отклонил приглашение в ваш список «${targetList.title}»`,
        link: `/lists/${invitation.listId}`,
        relatedEntity: 'LIST',
        relatedEntityId: String(invitation.listId),
        senderId: user.id,
        senderAvatar: user.avatar,
        senderUsername: user.username,
      });
    }

    res.json({ success: true, message: 'Приглашение отклонено' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Current user incoming list invitations
apiRouter.get('/user/list-invitations', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const myInvs = await db
      .select({
        id: listInvitations.id,
        listId: listInvitations.listId,
        inviterId: listInvitations.inviterId,
        inviteeId: listInvitations.inviteeId,
        permission: listInvitations.permission,
        status: listInvitations.status,
        createdAt: listInvitations.createdAt,
        listTitle: lists.title,
        listDescription: lists.description,
        listCategory: lists.category,
        listCover: lists.cover,
        listVisibility: lists.visibility,
        inviterUsername: users.username,
        inviterAvatar: users.avatar,
      })
      .from(listInvitations)
      .innerJoin(lists, eq(listInvitations.listId, lists.id))
      .innerJoin(users, eq(listInvitations.inviterId, users.id))
      .where(and(eq(listInvitations.inviteeId, user.id), eq(listInvitations.status, 'PENDING')))
      .orderBy(desc(listInvitations.createdAt));

    res.json(myInvs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Change member role (OWNER ONLY)
apiRouter.patch('/lists/:id/members/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);
    const { role } = req.body;

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    // Only OWNER can change roles
    if (targetList.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Только создатель списка может изменять роли участников' });
    }

    if (targetUserId === targetList.ownerId) {
      return res.status(400).json({ error: 'Нельзя изменить роль владельца списка' });
    }

    const validRole = role === 'VIEWER' ? 'VIEWER' : 'EDITOR';

    const [updated] = await db
      .update(listMembers)
      .set({ role: validRole })
      .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, targetUserId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Участник не найден в списке' });
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/lists/:id/members/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);
    const { role } = req.body;

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    if (targetList.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Только создатель списка может изменять роли участников' });
    }

    if (targetUserId === targetList.ownerId) {
      return res.status(400).json({ error: 'Нельзя изменить роль владельца списка' });
    }

    const validRole = role === 'VIEWER' ? 'VIEWER' : 'EDITOR';

    const [updated] = await db
      .update(listMembers)
      .set({ role: validRole })
      .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, targetUserId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Участник не найден в списке' });
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Remove member from collaborative list (OWNER or SELF)
apiRouter.delete('/lists/:id/members/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    if (targetUserId === targetList.ownerId) {
      return res.status(400).json({ error: 'Нельзя удалить владельца списка' });
    }

    // Can only be removed by list owner OR if user is leaving the list themselves
    if (targetList.ownerId !== user.id && user.id !== targetUserId && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Нет прав на удаление участника' });
    }

    await db
      .delete(listMembers)
      .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, targetUserId)));

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Follow / Subscribe to list
apiRouter.post('/lists/:id/follow', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    const existing = await db
      .select()
      .from(listFollowers)
      .where(and(eq(listFollowers.listId, listId), eq(listFollowers.userId, user.id)))
      .limit(1);

    if (existing.length > 0) {
      // Unfollow
      await db.delete(listFollowers).where(eq(listFollowers.id, existing[0].id));
      return res.json({ followed: false });
    } else {
      // Follow
      await db.insert(listFollowers).values({
        listId,
        userId: user.id,
      });

      if (targetList.ownerId !== user.id) {
        await sendAppNotification(targetList.ownerId, {
          type: 'LIST_FOLLOW',
          title: 'Новый подписчик на список',
          body: `${user.username} подписался на ваш список "${targetList.title}".`,
          link: `/lists/${listId}`,
        });
      }

      return res.json({ followed: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Like / Unlike list
apiRouter.post('/lists/:id/like', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    const existing = await db
      .select()
      .from(likes)
      .where(and(eq(likes.targetType, 'LIST'), eq(likes.targetId, listId), eq(likes.userId, user.id)))
      .limit(1);

    if (existing.length > 0) {
      await db.delete(likes).where(eq(likes.id, existing[0].id));
      const count = await db
        .select({ count: sql<number>`count(*)` })
        .from(likes)
        .where(and(eq(likes.targetType, 'LIST'), eq(likes.targetId, listId)));
      return res.json({ liked: false, likesCount: Number(count[0]?.count || 0) });
    } else {
      try {
        await db.insert(likes).values({
          targetType: 'LIST',
          targetId: listId,
          userId: user.id,
        });
      } catch (err: any) {
        if (err.code === '23505') {
          const count = await db.select({ count: sql<number>`count(*)` }).from(likes).where(and(eq(likes.targetType, 'LIST'), eq(likes.targetId, listId)));
          return res.json({ liked: true, likesCount: Number(count[0]?.count || 0) });
        }
        throw err;
      }

      const count = await db
        .select({ count: sql<number>`count(*)` })
        .from(likes)
        .where(and(eq(likes.targetType, 'LIST'), eq(likes.targetId, listId)));

      return res.json({ liked: true, likesCount: Number(count[0]?.count || 0) });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get comments for list
apiRouter.get('/lists/:id/comments', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const listId = parseInt(req.params.id, 10);
    const listComments = await db
      .select({
        id: comments.id,
        content: comments.content,
        createdAt: comments.createdAt,
        userId: users.id,
        username: users.username,
        avatar: users.avatar,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(and(eq(comments.targetType, 'LIST'), eq(comments.targetId, listId)))
      .orderBy(desc(comments.createdAt));

    res.json(listComments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Post comment to list
apiRouter.post('/lists/:id/comments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const listId = parseInt(req.params.id, 10);
    const { content } = req.body;

    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Комментарий не может быть пустым' });
    }

    const [targetList] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!targetList) {
      return res.status(404).json({ error: 'Список не найден' });
    }

    const [comment] = await db
      .insert(comments)
      .values({
        targetType: 'LIST',
        targetId: listId,
        userId: user.id,
        content: String(content).trim(),
      })
      .returning();

    if (targetList.ownerId !== user.id) {
      await sendAppNotification(targetList.ownerId, {
        type: 'COMMENT',
        title: 'Новый комментарий к списку',
        body: `${user.username} прокомментировал ваш список «${targetList.title}».`,
        link: `/lists/${listId}`,
        senderId: user.id,
        senderAvatar: user.avatar,
        senderUsername: user.username,
      });
    }

    // Check for @mentions in comment
    const commentMentions = String(content).match(/@([a-zA-Z0-9_-]+)/g);
    if (commentMentions && commentMentions.length > 0) {
      const uNames: string[] = Array.from(new Set(commentMentions.map((m) => m.slice(1))));
      if (uNames.length > 0) {
        db.select({ id: users.id, username: users.username })
          .from(users)
          .where(inArray(users.username, uNames))
          .then((found) => {
            for (const u of found) {
              if (u.id !== user.id && u.id !== targetList.ownerId) {
                notificationService.notifyMention(
                  { id: user.id, username: user.username, avatar: user.avatar },
                  u.id,
                  String(content).slice(0, 100),
                  `/lists/${listId}`
                ).catch(() => {});
              }
            }
          })
          .catch(() => {});
      }
    }

    res.json({
      ...comment,
      username: user.username,
      avatar: user.avatar,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. TIER LISTS
// ==========================================

export function isMediaAllowedForTierCategory(mediaType: string, category?: string | null): boolean {
  if (!category || category === 'ALL') return true;
  const normalized = category.toUpperCase();
  if (normalized === 'MOVIES_TV' || normalized === 'MOVIE_TV' || normalized === 'FILMS_SERIES') {
    return mediaType === 'MOVIE' || mediaType === 'TV';
  }
  if (normalized === 'GAME' || normalized === 'GAMES') {
    return mediaType === 'GAME';
  }
  if (normalized === 'ANIME') {
    return mediaType === 'ANIME';
  }
  if (normalized === 'MANGA') {
    return mediaType === 'MANGA';
  }
  if (normalized === 'BOOK' || normalized === 'BOOKS') {
    return mediaType === 'BOOK';
  }
  if (normalized === 'COMIC' || normalized === 'COMICS') {
    return mediaType === 'COMIC';
  }
  if (normalized === 'MOVIE') return mediaType === 'MOVIE';
  if (normalized === 'TV') return mediaType === 'TV';
  return mediaType === normalized;
}

// Get current user's tier lists (strictly filtered by current user for "Тир-листы" main view)
apiRouter.get('/tier-lists', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const categoryParam = req.query.category ? String(req.query.category).toUpperCase() : undefined;

    let query = db
      .select({
        id: tierLists.id,
        title: tierLists.title,
        description: tierLists.description,
        category: tierLists.category,
        visibility: tierLists.visibility,
        tiersJson: tierLists.tiersJson,
        itemsJson: tierLists.itemsJson,
        createdAt: tierLists.createdAt,
        updatedAt: tierLists.updatedAt,
        ownerId: users.id,
        ownerUsername: users.username,
        ownerAvatar: users.avatar,
      })
      .from(tierLists)
      .innerJoin(users, eq(tierLists.ownerId, users.id));

    // Backend-enforced user boundary: strictly owner_id = current_user.id
    const conditions: any[] = [eq(tierLists.ownerId, user.id)];

    // Filter by category if supplied and not ALL
    if (categoryParam && categoryParam !== 'ALL') {
      if (categoryParam === 'GAME' || categoryParam === 'GAMES') {
        conditions.push(or(eq(tierLists.category, 'GAME'), eq(tierLists.category, 'GAMES')));
      } else if (categoryParam === 'BOOK' || categoryParam === 'BOOKS') {
        conditions.push(or(eq(tierLists.category, 'BOOK'), eq(tierLists.category, 'BOOKS')));
      } else if (categoryParam === 'COMIC' || categoryParam === 'COMICS') {
        conditions.push(or(eq(tierLists.category, 'COMIC'), eq(tierLists.category, 'COMICS')));
      } else {
        conditions.push(eq(tierLists.category, categoryParam));
      }
    }

    const rows = await query
      .where(and(...conditions))
      .orderBy(desc(tierLists.updatedAt), desc(tierLists.createdAt))
      .limit(100);

    // Resolve preview posters for each tier list
    const allMediaIds = new Set<number>();
    rows.forEach((row) => {
      try {
        const parsed = JSON.parse(row.itemsJson || '[]');
        parsed.slice(0, 8).forEach((item: any) => {
          const mId = item.id || item.mediaId;
          if (mId) allMediaIds.add(Number(mId));
        });
      } catch (_e) {}
    });

    const mediaMap = new Map<number, any>();
    if (allMediaIds.size > 0) {
      const mediaList = await db.select().from(media).where(inArray(media.id, Array.from(allMediaIds)));
      mediaList.forEach((m) => mediaMap.set(m.id, m));
    }

    const formatted = rows.map((row) => {
      let parsedItems: any[] = [];
      try {
        parsedItems = JSON.parse(row.itemsJson || '[]');
      } catch (_e) {}

      const previewPosters = parsedItems
        .slice(0, 6)
        .map((it: any) => {
          const mId = it.id || it.mediaId;
          const mObj = mediaMap.get(mId);
          return it.posterUrl || mObj?.posterUrl || null;
        })
        .filter(Boolean);

      return {
        ...row,
        itemCount: parsedItems.length,
        previewPosters,
      };
    });

    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's own tier lists
apiRouter.get('/tier-lists/my', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;

    const rows = await db
      .select({
        id: tierLists.id,
        title: tierLists.title,
        description: tierLists.description,
        category: tierLists.category,
        visibility: tierLists.visibility,
        tiersJson: tierLists.tiersJson,
        itemsJson: tierLists.itemsJson,
        createdAt: tierLists.createdAt,
        updatedAt: tierLists.updatedAt,
        ownerId: users.id,
        ownerUsername: users.username,
        ownerAvatar: users.avatar,
      })
      .from(tierLists)
      .innerJoin(users, eq(tierLists.ownerId, users.id))
      .where(eq(tierLists.ownerId, user.id))
      .orderBy(desc(tierLists.updatedAt), desc(tierLists.createdAt));

    // Resolve preview posters
    const allMediaIds = new Set<number>();
    rows.forEach((row) => {
      try {
        const parsed = JSON.parse(row.itemsJson || '[]');
        parsed.slice(0, 8).forEach((item: any) => {
          const mId = item.id || item.mediaId;
          if (mId) allMediaIds.add(Number(mId));
        });
      } catch (_e) {}
    });

    const mediaMap = new Map<number, any>();
    if (allMediaIds.size > 0) {
      const mediaList = await db.select().from(media).where(inArray(media.id, Array.from(allMediaIds)));
      mediaList.forEach((m) => mediaMap.set(m.id, m));
    }

    const formatted = rows.map((row) => {
      let parsedItems: any[] = [];
      try {
        parsedItems = JSON.parse(row.itemsJson || '[]');
      } catch (_e) {}

      const previewPosters = parsedItems
        .slice(0, 6)
        .map((it: any) => {
          const mId = it.id || it.mediaId;
          const mObj = mediaMap.get(mId);
          return it.posterUrl || mObj?.posterUrl || null;
        })
        .filter(Boolean);

      return {
        ...row,
        itemCount: parsedItems.length,
        previewPosters,
      };
    });

    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get another user's tier lists with privacy and friendship access control
apiRouter.get('/users/:username/tier-lists', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { username } = req.params;
    const viewer = req.dbUser;

    const foundUsers = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (foundUsers.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const targetUser = foundUsers[0];
    const isOwner = viewer?.id === targetUser.id;
    const isAdmin = viewer?.role === 'ADMIN' || viewer?.role === 'SUPER_ADMIN';

    let isFriend = false;
    if (viewer && !isOwner) {
      const friendship = await db
        .select()
        .from(friendRequests)
        .where(
          or(
            and(eq(friendRequests.senderId, viewer.id), eq(friendRequests.receiverId, targetUser.id), eq(friendRequests.status, 'ACCEPTED')),
            and(eq(friendRequests.senderId, targetUser.id), eq(friendRequests.receiverId, viewer.id), eq(friendRequests.status, 'ACCEPTED'))
          )
        )
        .limit(1);
      isFriend = friendship.length > 0;
    }

    // Check target user's general list visibility setting
    if (!isOwner && !isAdmin) {
      if (targetUser.listVisibility === 'PRIVATE') {
        return res.json([]);
      }
      if (targetUser.listVisibility === 'FRIENDS' && !isFriend) {
        return res.json([]);
      }
    }

    const conditions: any[] = [eq(tierLists.ownerId, targetUser.id)];
    if (!isOwner && !isAdmin) {
      if (isFriend) {
        conditions.push(or(eq(tierLists.visibility, 'PUBLIC'), eq(tierLists.visibility, 'FRIENDS')));
      } else {
        conditions.push(eq(tierLists.visibility, 'PUBLIC'));
      }
    }

    const rows = await db
      .select({
        id: tierLists.id,
        title: tierLists.title,
        description: tierLists.description,
        category: tierLists.category,
        visibility: tierLists.visibility,
        tiersJson: tierLists.tiersJson,
        itemsJson: tierLists.itemsJson,
        createdAt: tierLists.createdAt,
        updatedAt: tierLists.updatedAt,
        ownerId: users.id,
        ownerUsername: users.username,
        ownerAvatar: users.avatar,
      })
      .from(tierLists)
      .innerJoin(users, eq(tierLists.ownerId, users.id))
      .where(and(...conditions))
      .orderBy(desc(tierLists.updatedAt), desc(tierLists.createdAt));

    // Resolve preview posters
    const allMediaIds = new Set<number>();
    rows.forEach((row) => {
      try {
        const parsed = JSON.parse(row.itemsJson || '[]');
        parsed.slice(0, 8).forEach((item: any) => {
          const mId = item.id || item.mediaId;
          if (mId) allMediaIds.add(Number(mId));
        });
      } catch (_e) {}
    });

    const mediaMap = new Map<number, any>();
    if (allMediaIds.size > 0) {
      const mediaList = await db.select().from(media).where(inArray(media.id, Array.from(allMediaIds)));
      mediaList.forEach((m) => mediaMap.set(m.id, m));
    }

    const formatted = rows.map((row) => {
      let parsedItems: any[] = [];
      try {
        parsedItems = JSON.parse(row.itemsJson || '[]');
      } catch (_e) {}

      const previewPosters = parsedItems
        .slice(0, 6)
        .map((it: any) => {
          const mId = it.id || it.mediaId;
          const mObj = mediaMap.get(mId);
          return it.posterUrl || mObj?.posterUrl || null;
        })
        .filter(Boolean);

      return {
        ...row,
        itemCount: parsedItems.length,
        previewPosters,
      };
    });

    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create new tier list
apiRouter.post('/tier-lists', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { title, description, category, tiersJson, itemsJson, visibility } = req.body;

    const normalizedCategory = category ? String(category).toUpperCase() : 'MOVIES_TV';

    const defaultTiers = JSON.stringify([
      { id: 's', label: 'S', color: 'bg-red-600 text-white' },
      { id: 'a', label: 'A', color: 'bg-orange-600 text-white' },
      { id: 'b', label: 'B', color: 'bg-amber-500 text-black' },
      { id: 'c', label: 'C', color: 'bg-emerald-600 text-white' },
      { id: 'd', label: 'D', color: 'bg-blue-600 text-white' },
    ]);

    // Backend-enforced category locking validation
    if (normalizedCategory && normalizedCategory !== 'ALL' && itemsJson) {
      try {
        const parsed = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
        const mediaIds = parsed.map((item: any) => item.id || item.mediaId).filter(Boolean);
        if (mediaIds.length > 0) {
          const itemsInDb = await db
            .select({ id: media.id, type: media.type, title: media.title })
            .from(media)
            .where(inArray(media.id, mediaIds));

          const invalid = itemsInDb.filter((m) => !isMediaAllowedForTierCategory(m.type, normalizedCategory));
          if (invalid.length > 0) {
            return res.status(400).json({
              error: `В тир-лист категории "${normalizedCategory}" нельзя добавлять медиа другого типа ("${invalid[0].title}" — это ${invalid[0].type})`,
            });
          }
        }
      } catch (err: any) {
        // ignore parse error if empty
      }
    }

    const [newTierList] = await db
      .insert(tierLists)
      .values({
        title: title ? title.trim() : 'Мой Tier List',
        description: description ? description.trim() : null,
        category: normalizedCategory,
        tiersJson: typeof tiersJson === 'string' ? tiersJson : tiersJson ? JSON.stringify(tiersJson) : defaultTiers,
        itemsJson: typeof itemsJson === 'string' ? itemsJson : itemsJson ? JSON.stringify(itemsJson) : '[]',
        visibility: visibility || 'PUBLIC',
        ownerId: user.id,
      })
      .returning();

    // Log social activity if tier list is not private
    if (newTierList.visibility !== 'PRIVATE') {
      await db.insert(activities).values({
        userId: user.id,
        type: 'TIERLIST_CREATED',
        tierListId: newTierList.id,
        details: JSON.stringify({ tierListId: newTierList.id, title: newTierList.title }),
      }).catch(() => {});
    }

    // Trigger tier list creation & completion achievements
    achievementService.checkAndUnlock(user.id, 'TIER_LIST_CREATED', { tierListId: newTierList.id }).catch(() => {});
    achievementService.checkAndUnlock(user.id, 'TIER_LIST_COMPLETED', { tierListId: newTierList.id }).catch(() => {});

    res.json(newTierList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update tier list
apiRouter.put('/tier-lists/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const { title, description, category, tiersJson, itemsJson, visibility } = req.body;

    const [existing] = await db
      .select()
      .from(tierLists)
      .where(eq(tierLists.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Тир-лист не найден' });
    }

    if (existing.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'У вас нет прав на редактирование этого тир-листа' });
    }

    const targetCategory = (category || existing.category || 'MOVIES_TV').toUpperCase();

    // Backend-enforced category locking validation
    if (targetCategory && targetCategory !== 'ALL' && itemsJson) {
      try {
        const parsed = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
        const mediaIds = parsed.map((item: any) => item.id || item.mediaId).filter(Boolean);
        if (mediaIds.length > 0) {
          const itemsInDb = await db
            .select({ id: media.id, type: media.type, title: media.title })
            .from(media)
            .where(inArray(media.id, mediaIds));

          const invalid = itemsInDb.filter((m) => !isMediaAllowedForTierCategory(m.type, targetCategory));
          if (invalid.length > 0) {
            return res.status(400).json({
              error: `В тир-лист категории "${targetCategory}" нельзя добавлять медиа другого типа ("${invalid[0].title}" — это ${invalid[0].type})`,
            });
          }
        }
      } catch (err: any) {
        // ignore parse error
      }
    }

    const [updated] = await db
      .update(tierLists)
      .set({
        title: title !== undefined ? title.trim() : existing.title,
        description: description !== undefined ? (description ? description.trim() : null) : existing.description,
        category: targetCategory,
        tiersJson: tiersJson !== undefined ? (typeof tiersJson === 'string' ? tiersJson : JSON.stringify(tiersJson)) : existing.tiersJson,
        itemsJson: itemsJson !== undefined ? (typeof itemsJson === 'string' ? itemsJson : JSON.stringify(itemsJson)) : existing.itemsJson,
        visibility: visibility || existing.visibility,
        updatedAt: new Date(),
      })
      .where(eq(tierLists.id, id))
      .returning();

    // Trigger tier list completion check
    achievementService.checkAndUnlock(user.id, 'TIER_LIST_COMPLETED', { tierListId: id }).catch(() => {});

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete tier list
apiRouter.delete('/tier-lists/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);

    const existing = await db
      .select()
      .from(tierLists)
      .where(eq(tierLists.id, id))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Тир-лист не найден' });
    }

    if (existing[0].ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Нет прав на удаление этого тир-листа' });
    }

    await db.delete(tierLists).where(eq(tierLists.id, id));

    res.json({ ok: true, message: 'Тир-лист успешно удален' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add media to tier list with backend validation
apiRouter.post('/tier-lists/:id/add-media', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const { mediaId, tierId = 'unranked', mediaPayload } = req.body;

    // 1. Tier list exists
    const [tierList] = await db
      .select()
      .from(tierLists)
      .where(eq(tierLists.id, id))
      .limit(1);

    if (!tierList) {
      return res.status(404).json({ error: 'Тир-лист не найден' });
    }

    // 2. User has OWNER/ADMIN
    if (tierList.ownerId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'У вас нет прав на редактирование этого тир-листа' });
    }

    // 3. Resolve / ensure media in DB
    let targetMediaId = mediaId ? parseInt(String(mediaId), 10) : null;
    let targetMedia: any = null;

    if (targetMediaId) {
      const [found] = await db.select().from(media).where(eq(media.id, targetMediaId)).limit(1);
      targetMedia = found;
    }

    if (!targetMedia && mediaPayload) {
      targetMedia = await ensureMediaInDb(mediaPayload);
      targetMediaId = targetMedia.id;
    }

    if (!targetMedia || !targetMediaId) {
      return res.status(404).json({ error: 'Медиа не найдено в базе данных' });
    }

    // 4. Media matches Tier List category
    if (!isMediaAllowedForTierCategory(targetMedia.type, tierList.category)) {
      return res.status(400).json({
        error: `Медиа типа "${targetMedia.type}" не соответствует категории тир-листа "${tierList.category}"`,
      });
    }

    // 5. Check if already added
    let currentItems: any[] = [];
    try {
      currentItems = JSON.parse(tierList.itemsJson || '[]');
    } catch (_e) {}

    const alreadyAdded = currentItems.some((it: any) => (it.id || it.mediaId) === targetMediaId);
    if (alreadyAdded) {
      return res.status(400).json({ error: 'Этот тайтл уже добавлен в тир-лист' });
    }

    // 6. Add to itemsJson
    const newItem = {
      id: targetMediaId,
      mediaId: targetMediaId,
      title: targetMedia.title,
      type: targetMedia.type,
      posterUrl: targetMedia.posterUrl,
      tierId: tierId || 'unranked',
      order: currentItems.length,
    };

    currentItems.push(newItem);

    const [updated] = await db
      .update(tierLists)
      .set({
        itemsJson: JSON.stringify(currentItems),
        updatedAt: new Date(),
      })
      .where(eq(tierLists.id, id))
      .returning();

    res.json({
      success: true,
      item: newItem,
      tierList: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get single tier list with resolved media
apiRouter.get('/tier-lists/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const id = parseInt(req.params.id, 10);
    const found = await db
      .select({
        id: tierLists.id,
        title: tierLists.title,
        description: tierLists.description,
        category: tierLists.category,
        visibility: tierLists.visibility,
        tiersJson: tierLists.tiersJson,
        itemsJson: tierLists.itemsJson,
        createdAt: tierLists.createdAt,
        updatedAt: tierLists.updatedAt,
        ownerId: users.id,
        ownerUsername: users.username,
        ownerAvatar: users.avatar,
      })
      .from(tierLists)
      .innerJoin(users, eq(tierLists.ownerId, users.id))
      .where(eq(tierLists.id, id))
      .limit(1);

    if (found.length === 0) {
      return res.status(404).json({ error: 'Тир-лист не найден' });
    }

    const tierList = found[0];

    // Privacy check
    const isOwner = user && user.id === tierList.ownerId;
    const isAdmin = user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');

    if (!isOwner && !isAdmin) {
      if (tierList.visibility === 'PRIVATE') {
        return res.status(403).json({ error: 'Этот тир-лист является приватным и доступен только автору' });
      }

      if (tierList.visibility === 'FRIENDS') {
        if (!user) {
          return res.status(403).json({ error: 'Этот тир-лист доступен только автору и его друзьям' });
        }

        const friendship = await db
          .select()
          .from(friendRequests)
          .where(
            or(
              and(eq(friendRequests.senderId, user.id), eq(friendRequests.receiverId, tierList.ownerId), eq(friendRequests.status, 'ACCEPTED')),
              and(eq(friendRequests.senderId, tierList.ownerId), eq(friendRequests.receiverId, user.id), eq(friendRequests.status, 'ACCEPTED'))
            )
          )
          .limit(1);

        if (friendship.length === 0) {
          return res.status(403).json({ error: 'Этот тир-лист доступен только автору и его друзьям' });
        }
      }
    }

    let items: any[] = [];
    try {
      items = JSON.parse(tierList.itemsJson || '[]');
    } catch (_e) {}

    const mediaIds = items.map((i: any) => i.id || i.mediaId).filter(Boolean);
    let resolvedMedia: any[] = [];
    if (mediaIds.length > 0) {
      resolvedMedia = await db.select().from(media).where(inArray(media.id, mediaIds));
    }

    res.json({
      ...tierList,
      resolvedMedia,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Invite a user to check out / collaborate on a tier list
apiRouter.post('/tier-lists/:id/invite', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const { recipientUserId, recipientUsername } = req.body;

    let targetUserId = recipientUserId ? parseInt(recipientUserId, 10) : undefined;
    if (!targetUserId && recipientUsername) {
      const [foundUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, String(recipientUsername).trim()))
        .limit(1);
      if (foundUser) targetUserId = foundUser.id;
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'Укажите пользователя для приглашения' });
    }

    if (targetUserId === user.id) {
      return res.status(400).json({ error: 'Нельзя пригласить самого себя' });
    }

    const [tierList] = await db.select().from(tierLists).where(eq(tierLists.id, id)).limit(1);
    if (!tierList) {
      return res.status(404).json({ error: 'Тир-лист не найден' });
    }

    await notificationService.notifyTierListInvite(
      { id: user.id, username: user.username, avatar: user.avatar },
      targetUserId,
      tierList.id,
      tierList.title
    );

    res.json({ ok: true, message: `Приглашение в тир-лист «${tierList.title}» отправлено!` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. ROULETTE (CONTENT RANDOMIZER)
// ==========================================

async function getRouletteCandidateMedia(options: {
  user?: any;
  source?: string;
  listId?: number | string;
  category?: string;
  minRating?: number | string;
}) {
  const { user, source, listId, category, minRating } = options;
  let candidateMedia: any[] = [];
  let listInfo: { id: number; title: string; category: string } | null = null;

  const normalizedSource = source ? String(source).toUpperCase() : 'MY_PLANNED';

  // Explicitly reject deprecated/removed sources
  if (['ALL', 'ALL_DATABASE', 'DATABASE', 'EVERYTHING'].includes(normalizedSource)) {
    throw {
      status: 400,
      message: 'Источник "Вся база тайтлов" больше не поддерживается. Пожалуйста, выберите пользовательский список или библиотеку.',
    };
  }

  const validSources = ['MY_PLANNED', 'MY_LIBRARY', 'MY_FAVORITES', 'USER_LIST'];
  if (!validSources.includes(normalizedSource)) {
    throw {
      status: 400,
      message: `Недопустимый источник рулетки: ${source}. Допустимые варианты: MY_PLANNED, MY_LIBRARY, MY_FAVORITES, USER_LIST.`,
    };
  }

  const parsedMinRating = minRating ? parseFloat(String(minRating)) : 0;

  const matchesCategory = (mediaType: string, cat?: string) => {
    if (!cat || cat === 'ALL') return true;
    if (cat === 'MOVIES_TV') return mediaType === 'MOVIE' || mediaType === 'TV';
    return mediaType === cat;
  };

  if (normalizedSource === 'USER_LIST') {
    const numericListId = typeof listId === 'string' ? parseInt(listId, 10) : Number(listId);
    if (!numericListId || isNaN(numericListId)) {
      throw { status: 400, message: 'Не выбран список для рулетки' };
    }

    const found = await db
      .select({
        id: lists.id,
        title: lists.title,
        description: lists.description,
        category: lists.category,
        visibility: lists.visibility,
        ownerId: lists.ownerId,
      })
      .from(lists)
      .where(eq(lists.id, numericListId))
      .limit(1);

    if (found.length === 0) {
      throw { status: 404, message: 'Выбранный список не найден' };
    }

    const targetList = found[0];

    // Check membership and permissions
    const members = await db
      .select({ userId: listMembers.userId })
      .from(listMembers)
      .where(eq(listMembers.listId, numericListId));

    const isMember = user ? members.some((m) => m.userId === user.id) : false;
    const isOwner = user ? (user.id === targetList.ownerId || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') : false;

    if (targetList.visibility === 'PRIVATE') {
      if (!isOwner && !isMember) {
        throw { status: 403, message: 'Этот список приватный. У вас нет к нему доступа.' };
      }
    } else if (targetList.visibility === 'FRIENDS') {
      if (!isOwner && !isMember) {
        let isFriend = false;
        if (user) {
          const reqs = await db
            .select()
            .from(friendRequests)
            .where(
              and(
                or(
                  and(eq(friendRequests.senderId, user.id), eq(friendRequests.receiverId, targetList.ownerId)),
                  and(eq(friendRequests.senderId, targetList.ownerId), eq(friendRequests.receiverId, user.id))
                ),
                eq(friendRequests.status, 'ACCEPTED')
              )
            )
            .limit(1);
          isFriend = reqs.length > 0;
        }
        if (!isFriend) {
          throw { status: 403, message: 'Этот список доступен только для друзей автора' };
        }
      }
    }

    listInfo = {
      id: targetList.id,
      title: targetList.title,
      category: targetList.category,
    };

    // Load items in this list
    const items = await db
      .select({
        id: media.id,
        title: media.title,
        originalTitle: media.originalTitle,
        type: media.type,
        description: media.description,
        posterUrl: media.posterUrl,
        year: media.year,
        rating: media.rating,
      })
      .from(listItems)
      .innerJoin(media, eq(listItems.mediaId, media.id))
      .where(eq(listItems.listId, numericListId))
      .orderBy(asc(listItems.orderIndex));

    candidateMedia = items;

    // Filter by list's category rules if specific
    if (targetList.category && targetList.category !== 'ALL') {
      candidateMedia = candidateMedia.filter((m) => matchesCategory(m.type, targetList.category));
    }
  } else if (['MY_LIBRARY', 'MY_PLANNED', 'MY_FAVORITES'].includes(normalizedSource)) {
    if (!user) {
      candidateMedia = [];
    } else {
      const rows = await db
        .select({
          id: media.id,
          title: media.title,
          originalTitle: media.originalTitle,
          type: media.type,
          posterUrl: media.posterUrl,
          rating: media.rating,
          year: media.year,
          description: media.description,
          userStatus: userMedia.status,
          userRating: userMedia.rating,
          isFavorite: userMedia.isFavorite,
        })
        .from(userMedia)
        .innerJoin(media, eq(userMedia.mediaId, media.id))
        .where(eq(userMedia.userId, user.id));

      candidateMedia = rows;

      if (normalizedSource === 'MY_PLANNED') {
        candidateMedia = candidateMedia.filter((r) => r.userStatus?.includes('PLAN_TO_'));
      } else if (normalizedSource === 'MY_FAVORITES') {
        candidateMedia = candidateMedia.filter((r) => r.isFavorite);
      }
    }
  }

  // Apply requested category filter
  if (category && category !== 'ALL') {
    candidateMedia = candidateMedia.filter((m) => matchesCategory(m.type, category));
  }

  // Apply minRating filter if requested
  if (parsedMinRating > 0) {
    candidateMedia = candidateMedia.filter((m) => (m.rating || 0) >= parsedMinRating);
  }

  candidateMedia = ContentVisibilityService.filterAccessibleContent(user, candidateMedia);

  return { candidateMedia, listInfo };
}

// Get items and info from a user list for roulette
apiRouter.get('/roulette/sources/list/:listId', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const { listId } = req.params;
    const { category, minRating } = req.query;

    const { candidateMedia, listInfo } = await getRouletteCandidateMedia({
      user,
      source: 'USER_LIST',
      listId,
      category: category as string,
      minRating: minRating as string,
    });

    res.json({
      list: listInfo,
      count: candidateMedia.length,
      items: candidateMedia,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Ошибка загрузки списка для рулетки' });
  }
});

// Helper to check pool size and candidate preview
apiRouter.get('/roulette/pool', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const { category, source, listId, minRating } = req.query;

    const { candidateMedia, listInfo } = await getRouletteCandidateMedia({
      user,
      source: source as string,
      listId: listId as string,
      category: category as string,
      minRating: minRating as string,
    });

    res.json({
      count: candidateMedia.length,
      candidates: candidateMedia.slice(0, 45),
      listInfo,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Ошибка загрузки пула рулетки' });
  }
});

apiRouter.post('/roulette/spin', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const { category, source, listId, minRating } = req.body;

    const { candidateMedia, listInfo } = await getRouletteCandidateMedia({
      user,
      source,
      listId,
      category,
      minRating,
    });

    if (candidateMedia.length === 0) {
      return res.status(404).json({ error: 'По выбранным критериям не найдено медиа для выбора' });
    }

    // Pick winning random media item
    const randomIndex = Math.floor(Math.random() * candidateMedia.length);
    const chosen = candidateMedia[randomIndex];

    // Build visual reel array from real candidate media
    const REEL_SIZE = 45;
    const TARGET_INDEX = 35; // The reel stops smoothly at the center indicator
    const reelItems: any[] = [];

    for (let i = 0; i < REEL_SIZE; i++) {
      if (i === TARGET_INDEX) {
        reelItems.push({
          ...chosen,
          isWinner: true,
        });
      } else {
        const dummy = candidateMedia[Math.floor(Math.random() * candidateMedia.length)];
        reelItems.push({
          ...dummy,
          isWinner: false,
        });
      }
    }

    res.json({
      chosen,
      reelItems,
      targetIndex: TARGET_INDEX,
      poolSize: candidateMedia.length,
      listInfo,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Ошибка вращения рулетки' });
  }
});

// ==========================================
// 10. STATISTICS
// ==========================================

apiRouter.get('/statistics', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;

    const rows = await db
      .select({
        status: userMedia.status,
        rating: userMedia.rating,
        progress: userMedia.progress,
        type: media.type,
        year: media.year,
        durationMinutes: media.totalDurationMinutes,
        completedAt: userMedia.completedAt,
      })
      .from(userMedia)
      .innerJoin(media, eq(userMedia.mediaId, media.id))
      .where(eq(userMedia.userId, user.id));

    // Calculate detailed aggregates
    let totalCompleted = 0;
    let totalWatching = 0;
    let totalPlanned = 0;
    let totalDropped = 0;
    let ratingsSum = 0;
    let ratingsCount = 0;

    const byType: Record<string, number> = {};
    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
    let estimatedWatchHours = 0;

    for (const r of rows) {
      byType[r.type] = (byType[r.type] || 0) + 1;

      if (r.status === 'COMPLETED') totalCompleted++;
      else if (r.status.includes('WATCHING') || r.status.includes('PLAYING') || r.status.includes('READING')) totalWatching++;
      else if (r.status.includes('PLAN_TO')) totalPlanned++;
      else if (r.status === 'DROPPED') totalDropped++;

      if (r.rating) {
        ratingsSum += r.rating;
        ratingsCount++;
        ratingDistribution[r.rating] = (ratingDistribution[r.rating] || 0) + 1;
      }

      // Estimate watch time: 1.8h for movie, 40m per episode progress for tv/anime, or duration
      if (r.type === 'MOVIE' && r.status === 'COMPLETED') {
        estimatedWatchHours += (r.durationMinutes || 110) / 60;
      } else if (r.progress) {
        estimatedWatchHours += (r.progress * 45) / 60;
      }
    }

    const averageRating = ratingsCount > 0 ? Math.round((ratingsSum / ratingsCount) * 10) / 10 : 0;

    res.json({
      totalMedia: rows.length,
      totalCompleted,
      totalWatching,
      totalPlanned,
      totalDropped,
      averageRating,
      estimatedWatchHours: Math.round(estimatedWatchHours),
      byType,
      ratingDistribution,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 11. CALENDAR & RELEASES API
// ==========================================

// Core releases endpoint (supports both /releases and /calendar/releases)
const handleGetReleases = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const {
      scope,
      category,
      date_from,
      date_to,
      period,
      followed,
      genre,
      platform,
      country,
      search,
      sort,
      order,
      page,
      limit,
    } = req.query as Record<string, string>;

    let parsedCategories: string[] | undefined;
    if (category && category !== 'all' && category !== 'ALL') {
      parsedCategories = category.split(',').map((c) => c.trim().toUpperCase());
    }

    let finalFrom = date_from;
    let finalTo = date_to;
    const today = releaseService.getTodayDateString();

    if (period) {
      const now = new Date(today + 'T00:00:00Z');
      if (period === 'today') {
        finalFrom = today;
        finalTo = today;
      } else if (period === 'week') {
        const dayOfWeek = now.getUTCDay(); // 0 is Sun, 1 is Mon
        const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const mon = new Date(now.getTime() + diffToMon * 86400000);
        const sun = new Date(mon.getTime() + 6 * 86400000);
        finalFrom = mon.toISOString().slice(0, 10);
        finalTo = sun.toISOString().slice(0, 10);
      } else if (period === 'next_week') {
        const dayOfWeek = now.getUTCDay();
        const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const nextMon = new Date(now.getTime() + (diffToMon + 7) * 86400000);
        const nextSun = new Date(nextMon.getTime() + 6 * 86400000);
        finalFrom = nextMon.toISOString().slice(0, 10);
        finalTo = nextSun.toISOString().slice(0, 10);
      } else if (period === 'month') {
        const y = now.getUTCFullYear();
        const m = now.getUTCMonth();
        const startM = new Date(Date.UTC(y, m, 1));
        const endM = new Date(Date.UTC(y, m + 1, 0));
        finalFrom = startM.toISOString().slice(0, 10);
        finalTo = endM.toISOString().slice(0, 10);
      } else if (period === 'next_month') {
        const y = now.getUTCFullYear();
        const m = now.getUTCMonth() + 1;
        const startM = new Date(Date.UTC(y, m, 1));
        const endM = new Date(Date.UTC(y, m + 1, 0));
        finalFrom = startM.toISOString().slice(0, 10);
        finalTo = endM.toISOString().slice(0, 10);
      } else if (period === '3months') {
        finalFrom = today;
        const target = new Date(now.getTime() + 90 * 86400000);
        finalTo = target.toISOString().slice(0, 10);
      } else if (period === '6months') {
        finalFrom = today;
        const target = new Date(now.getTime() + 180 * 86400000);
        finalTo = target.toISOString().slice(0, 10);
      } else if (period === 'year') {
        finalFrom = today;
        const target = new Date(now.getTime() + 365 * 86400000);
        finalTo = target.toISOString().slice(0, 10);
      }
    }

    // Trigger check for today's notifications in background
    releaseService.checkAndNotifyUpcomingReleases().catch(() => {});

    const result = await releaseService.getReleases({
      scope: (scope as any) || 'upcoming',
      categories: parsedCategories,
      dateFrom: finalFrom,
      dateTo: finalTo,
      followedOnly: followed === 'true' || followed === '1',
      genre,
      platform,
      country,
      search,
      sort: sort as any,
      order: order as any,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 30,
      userId: user?.id,
      isSuperAdmin: user?.role === 'SUPER_ADMIN',
      showAdultContent: user?.showAdultContent === true,
    });

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching releases:', err);
    res.status(500).json({ error: err.message });
  }
};

apiRouter.get('/releases', optionalAuth, handleGetReleases);
apiRouter.get('/calendar/releases', optionalAuth, handleGetReleases);

// Follow a release
apiRouter.post('/releases/:mediaId/follow', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const mediaId = parseInt(req.params.mediaId, 10);
    if (isNaN(mediaId)) return res.status(400).json({ error: 'Invalid media ID' });

    const result = await releaseService.followRelease(user.id, mediaId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Unfollow a release
apiRouter.delete('/releases/:mediaId/follow', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const mediaId = parseInt(req.params.mediaId, 10);
    if (isNaN(mediaId)) return res.status(400).json({ error: 'Invalid media ID' });

    const result = await releaseService.unfollowRelease(user.id, mediaId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all user subscriptions
apiRouter.get('/releases/my-subscriptions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const ids = await releaseService.getUserSubscriptions(user.id);
    res.json(ids);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Legacy /calendar endpoint with backward compatibility
apiRouter.get('/calendar', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    // If rich filter params passed, delegate to release handler
    if (
      req.query.scope ||
      req.query.category ||
      req.query.period ||
      req.query.view ||
      req.query.date_from ||
      req.query.followed !== undefined
    ) {
      return handleGetReleases(req, res);
    }

    // Default backward compatible behavior
    const user = req.dbUser;
    if (!user) {
      return handleGetReleases(req, res);
    }

    const rows = await db
      .select({
        id: media.id,
        title: media.title,
        type: media.type,
        posterUrl: media.posterUrl,
        releaseDate: media.releaseDate,
        status: userMedia.status,
      })
      .from(userMedia)
      .innerJoin(media, eq(userMedia.mediaId, media.id))
      .where(eq(userMedia.userId, user.id));

    const withDates = rows.filter((r) => !!r.releaseDate);
    res.json(withDates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Export to RFC 5545 iCalendar (.ics)
apiRouter.get('/calendar/export.ics', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const { category, followed, scope, date_from, date_to } = req.query as Record<string, string>;

    let parsedCategories: string[] | undefined;
    if (category && category !== 'all') {
      parsedCategories = category.split(',').map((c) => c.trim().toUpperCase());
    }

    const releasesResult = await releaseService.getReleases({
      scope: (scope as any) || 'upcoming',
      categories: parsedCategories,
      dateFrom: date_from,
      dateTo: date_to,
      followedOnly: followed === 'true' || followed === '1',
      userId: user?.id,
      isSuperAdmin: user?.role === 'SUPER_ADMIN',
      limit: 200,
    });

    let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Dodik Tracker//Release Calendar//RU\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';
    ics += 'X-WR-CALNAME:Dodik Tracker - Календарь релизов\r\n';
    ics += 'X-WR-TIMEZONE:UTC\r\n';

    for (const item of releasesResult.items) {
      if (!item.releaseDate) continue;
      const cleanDate = item.releaseDate.replace(/-/g, '');
      const safeTitle = (item.title || 'Релиз').replace(/[\\;,]/g, ' ');
      const safeDesc = (item.description || '').replace(/\r?\n/g, ' ').slice(0, 300);

      ics += 'BEGIN:VEVENT\r\n';
      ics += `UID:release-${item.id}@dodik-tracker.app\r\n`;
      ics += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z\r\n`;
      ics += `DTSTART;VALUE=DATE:${cleanDate}\r\n`;
      ics += `DTEND;VALUE=DATE:${cleanDate}\r\n`;
      ics += `SUMMARY:Релиз: ${safeTitle} [${item.type}]\r\n`;
      if (safeDesc) {
        ics += `DESCRIPTION:${safeDesc}\r\n`;
      }
      ics += 'STATUS:CONFIRMED\r\n';
      ics += 'END:VEVENT\r\n';
    }
    ics += 'END:VCALENDAR\r\n';

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="dodik-releases.ics"');
    res.send(ics);
  } catch (err: any) {
    console.error('Error generating calendar .ics export:', err);
    res.status(500).send('Error generating calendar');
  }
});

// ==========================================
// 12. NOTIFICATIONS & REAL-TIME STREAMING
// ==========================================

// Get user notifications with filtering and pagination
apiRouter.get('/notifications', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const filter = (req.query.filter as string) || 'all';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 40, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    const userCondition = or(
      eq(notifications.recipientUserId, user.id),
      eq(notifications.userId, user.id)
    )!;

    const conditions = [userCondition];

    if (filter === 'unread') {
      conditions.push(eq(notifications.isRead, false));
    } else if (filter === 'achievements') {
      conditions.push(
        or(
          eq(notifications.type, 'ACHIEVEMENT'),
          eq(notifications.type, 'ACHIEVEMENT_UNLOCKED')
        )!
      );
    } else if (filter === 'social') {
      conditions.push(
        or(
          eq(notifications.type, 'FRIEND_REQUEST'),
          eq(notifications.type, 'FRIEND_ACCEPTED'),
          eq(notifications.type, 'REVIEW_LIKED'),
          eq(notifications.type, 'LIKE'),
          eq(notifications.type, 'REVIEW_COMMENTED'),
          eq(notifications.type, 'COMMENT'),
          eq(notifications.type, 'CONTENT_SHARED'),
          eq(notifications.type, 'TIER_LIST_INVITE'),
          eq(notifications.type, 'NEW_MESSAGE'),
          eq(notifications.type, 'FRIEND_REVIEW'),
          eq(notifications.type, 'FRIEND_ACTIVITY'),
          eq(notifications.type, 'MENTION'),
          eq(notifications.type, 'LIST_INVITE'),
          eq(notifications.type, 'LIST_FOLLOW')
        )!
      );
    } else if (filter === 'content') {
      conditions.push(
        or(
          eq(notifications.type, 'CONTENT_COMPLETED'),
          eq(notifications.type, 'CONTENT_SHARED'),
          eq(notifications.type, 'NEW_RELEASE'),
          eq(notifications.type, 'LIST_INVITE'),
          eq(notifications.type, 'LIST_FOLLOW')
        )!
      );
    } else if (filter === 'system') {
      conditions.push(
        or(
          eq(notifications.type, 'FEEDBACK_REPLIED'),
          eq(notifications.type, 'ADMIN_ANNOUNCEMENT'),
          eq(notifications.type, 'ADMIN_ALERT'),
          eq(notifications.type, 'SYSTEM')
        )!
      );
    }

    const notifs = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    // Fast unread count
    const [unreadCountResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(userCondition, eq(notifications.isRead, false)));

    const normalized = notifs.map((n) => {
      let parsedMetadata: any = null;
      if (n.metadata) {
        try {
          parsedMetadata = typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata;
        } catch {}
      } else if (n.metadataJson) {
        try {
          parsedMetadata = JSON.parse(n.metadataJson);
        } catch {}
      }

      const recipientId = n.recipientUserId || n.userId;
      const msg = n.message || n.body;
      const actorId = n.actorUserId !== undefined ? n.actorUserId : (n.senderId || null);
      const entType = n.entityType || n.relatedEntity || null;
      const entId = n.entityId || n.relatedEntityId || null;

      return {
        id: n.id,
        recipientUserId: recipientId,
        userId: recipientId,
        type: n.type,
        title: n.title,
        message: msg,
        body: msg,
        actorUserId: actorId,
        senderId: actorId,
        entityType: entType,
        relatedEntity: entType,
        entityId: entId,
        relatedEntityId: entId,
        metadata: parsedMetadata,
        metadataJson: n.metadataJson || (parsedMetadata ? JSON.stringify(parsedMetadata) : null),
        dedupKey: n.dedupKey,
        content: n.content || msg,
        link: n.link,
        senderAvatar: n.senderAvatar,
        senderUsername: n.senderUsername,
        isRead: n.isRead,
        readAt: n.readAt,
        createdAt: n.createdAt,
      };
    });

    res.json({
      notifications: normalized,
      unreadCount: Number(unreadCountResult?.count || 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fast unread count endpoint
apiRouter.get('/notifications/unread-count', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          or(eq(notifications.recipientUserId, user.id), eq(notifications.userId, user.id)),
          eq(notifications.isRead, false)
        )
      );

    res.json({ unreadCount: Number(countResult?.count || 0) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Issue short-lived authentication token specifically for EventSource/SSE
apiRouter.get('/notifications/stream-token', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const token = jwt.sign(
      { userId: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Real-Time SSE Stream for Notifications & Alerts
apiRouter.get('/notifications/stream', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const sessionId = (req.query.sessionId as string) || Math.random().toString(36).substring(7);
    const userAgent = req.headers['user-agent'];

    // Set Server-Sent Events headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    notificationService.registerSSEClient(user.id, res);
    presenceService.registerSSESession(user.id, sessionId, res, userAgent);
  } catch (err: any) {
    console.error('[SSE] Failed to establish stream:', err);
    res.status(500).end();
  }
});

apiRouter.post('/presence/heartbeat', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }
    const userAgent = req.headers['user-agent'];
    const presence = presenceService.recordHeartbeat(user.id, sessionId, userAgent);
    res.json({ ok: true, presence });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/presence/status', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userIdsParam = req.query.userIds as string;
    if (!userIdsParam) {
      return res.json({});
    }
    const userIds = userIdsParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (userIds.length === 0) {
      return res.json({});
    }

    // We fetch `updatedAt` for these users as fallback if not in memory
    const usersList = await db
      .select({ id: users.id, updatedAt: users.updatedAt })
      .from(users)
      .where(inArray(users.id, userIds));

    const updatedMap = new Map<number, string | Date | null>();
    usersList.forEach(u => updatedMap.set(u.id, u.updatedAt));

    const statuses = presenceService.getUsersPresence(userIds, updatedMap);
    res.json(statuses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mark single notification as read
apiRouter.put('/notifications/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notifications.id, id),
          or(eq(notifications.recipientUserId, user.id), eq(notifications.userId, user.id))
        )
      );

    // Recompute and emit updated count via SSE
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          or(eq(notifications.recipientUserId, user.id), eq(notifications.userId, user.id)),
          eq(notifications.isRead, false)
        )
      );
    const unreadCount = Number(countResult?.count || 0);

    notificationService.sendSSEEvent(user.id, 'unread_count', { unreadCount });

    res.json({ ok: true, unreadCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mark all notifications as read
apiRouter.put('/notifications/read-all', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          or(eq(notifications.recipientUserId, user.id), eq(notifications.userId, user.id)),
          eq(notifications.isRead, false)
        )
      );

    notificationService.sendSSEEvent(user.id, 'unread_count', { unreadCount: 0 });

    res.json({ ok: true, unreadCount: 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete single notification
apiRouter.delete('/notifications/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.id, id),
          or(eq(notifications.recipientUserId, user.id), eq(notifications.userId, user.id))
        )
      );

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          or(eq(notifications.recipientUserId, user.id), eq(notifications.userId, user.id)),
          eq(notifications.isRead, false)
        )
      );
    const unreadCount = Number(countResult?.count || 0);

    notificationService.sendSSEEvent(user.id, 'unread_count', { unreadCount });

    res.json({ ok: true, unreadCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all read notifications
apiRouter.delete('/notifications/clear-read', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    await db
      .delete(notifications)
      .where(
        and(
          or(eq(notifications.recipientUserId, user.id), eq(notifications.userId, user.id)),
          eq(notifications.isRead, true)
        )
      );

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get user notification preferences
apiRouter.get('/notifications/settings', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const [userRecord] = await db
      .select({ notificationSettings: users.notificationSettings, telegramChatId: users.telegramChatId })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const prefs = normalizeNotificationPreferences(userRecord?.notificationSettings);
    res.json({
      settings: prefs,
      preferences: prefs,
      telegramLinked: !!userRecord?.telegramChatId,
      telegramChatId: userRecord?.telegramChatId || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update user notification preferences
apiRouter.put('/notifications/settings', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const settingsPayload = req.body.settings || req.body.preferences;

    if (!settingsPayload || typeof settingsPayload !== 'object') {
      return res.status(400).json({ error: 'Некорректный формат настроек' });
    }

    const normalized = normalizeNotificationPreferences(settingsPayload);
    const serialized = JSON.stringify(normalized);

    await db
      .update(users)
      .set({ notificationSettings: serialized })
      .where(eq(users.id, user.id));

    res.json({ ok: true, settings: normalized, preferences: normalized });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Broadcast Notification
apiRouter.post('/notifications/admin-broadcast', requireAuth, requireStaff('MANAGE_NOTIFICATIONS'), async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.dbUser!;
    const { title, body, link, type, targetUserIds } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Заголовок и текст обязательны' });
    }

    const result = await notificationService.broadcastNotification({
      type: type || 'ADMIN_ALERT',
      title: String(title).trim(),
      body: String(body).trim(),
      link: link ? String(link).trim() : undefined,
      senderId: admin.id,
      targetUserIds: Array.isArray(targetUserIds) && targetUserIds.length > 0 ? targetUserIds : undefined,
      excludeUserId: admin.id,
    });

    res.json({ ok: true, deliveredCount: result.deliveredCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger release notification for tracked media (for testing or updates)
apiRouter.post('/notifications/trigger-release', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { mediaId, title, info } = req.body;

    let mediaTitle = title || 'Новый эпизод';
    let link = '/calendar';

    if (mediaId) {
      const [m] = await db.select().from(media).where(eq(media.id, parseInt(mediaId, 10))).limit(1);
      if (m) {
        mediaTitle = m.title || m.originalTitle || title || 'Новый релиз';
        link = `/media/${m.type?.toLowerCase() || 'any'}/${m.id}`;
      }
    }

    await notificationService.notifyNewRelease(
      user.id,
      mediaTitle,
      info || 'Новая серия или сезон уже доступны для просмотра!',
      link
    );

    res.json({ ok: true, message: 'Уведомление о релизе успешно отправлено' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// DIRECT MESSAGES & SOCIAL INTERACTION
// ==========================================

// Get recent dialogues (list of chats)
apiRouter.get('/messages', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;

    // We need to find all unique conversations for the user and get the latest message
    // Since Drizzle lacks a clean 'distinct on' or complex window functions across unions,
    // we can write a raw query.
    const query = sql`
      WITH recent_messages AS (
        SELECT 
          m.*,
          CASE WHEN m.sender_id = ${user.id} THEN m.receiver_id ELSE m.sender_id END as other_user_id
        FROM direct_messages m
        WHERE m.sender_id = ${user.id} OR m.receiver_id = ${user.id}
      ),
      ranked_messages AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (PARTITION BY other_user_id ORDER BY created_at DESC) as rn
        FROM recent_messages
      ),
      unread_counts AS (
        SELECT sender_id, COUNT(*) as count
        FROM direct_messages
        WHERE receiver_id = ${user.id} AND is_read = false
        GROUP BY sender_id
      )
      SELECT 
        rm.id, rm.sender_id as "senderId", rm.receiver_id as "receiverId", 
        rm.content, rm.is_read as "isRead", rm.created_at as "createdAt",
        rm.other_user_id as "otherUserId",
        u.username, u.avatar,
        COALESCE(uc.count, 0) as "unreadCount"
      FROM ranked_messages rm
      JOIN users u ON rm.other_user_id = u.id
      LEFT JOIN unread_counts uc ON rm.other_user_id = uc.sender_id
      WHERE rm.rn = 1
      ORDER BY rm.created_at DESC
    `;

    const result = await db.execute(query);

    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mark messages from a specific user as read
apiRouter.post('/messages/:otherUserId/read', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const otherUserId = parseInt(req.params.otherUserId, 10);
    
    if (!otherUserId || otherUserId === user.id) {
      return res.status(400).json({ error: 'Некорректный ID собеседника' });
    }

    await db
      .update(directMessages)
      .set({ isRead: true })
      .where(
        and(
          eq(directMessages.senderId, otherUserId),
          eq(directMessages.receiverId, user.id),
          eq(directMessages.isRead, false)
        )
      );
      
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get conversation messages between current user and friend
apiRouter.get('/messages/:otherUserId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const otherUserId = parseInt(req.params.otherUserId, 10);
    const beforeDate = req.query.before as string;

    if (!otherUserId || otherUserId === user.id) {
      return res.status(400).json({ error: 'Некорректный ID собеседника' });
    }

    let query = db
      .select({
        id: directMessages.id,
        senderId: directMessages.senderId,
        receiverId: directMessages.receiverId,
        content: directMessages.content,
        isRead: directMessages.isRead,
        createdAt: directMessages.createdAt,
      })
      .from(directMessages)
      .where(
        and(
          or(
            and(eq(directMessages.senderId, user.id), eq(directMessages.receiverId, otherUserId)),
            and(eq(directMessages.senderId, otherUserId), eq(directMessages.receiverId, user.id))
          ),
          beforeDate ? sql`${directMessages.createdAt} < ${new Date(beforeDate)}` : undefined
        )
      )
      .orderBy(desc(directMessages.createdAt))
      .limit(50);

    const msgs = await query;
    // Reverse so the oldest is first
    msgs.reverse();

    // Automatically mark incoming unread messages as read (only if no 'before' to avoid redundant marking)
    if (!beforeDate) {
      await db
        .update(directMessages)
        .set({ isRead: true })
        .where(
          and(
            eq(directMessages.senderId, otherUserId),
            eq(directMessages.receiverId, user.id),
            eq(directMessages.isRead, false)
          )
        );
      
      // Tell presence service to notify clients about unread count change if needed
      // but notificationService handles unread_counts typically.
    }

    res.json(msgs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete direct message
apiRouter.delete('/messages/:messageId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const messageId = parseInt(req.params.messageId, 10);

    const [deleted] = await db
      .delete(directMessages)
      .where(and(eq(directMessages.id, messageId), eq(directMessages.senderId, user.id)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Сообщение не найдено или нет прав' });
    }

    res.json({ ok: true, deletedId: messageId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Send direct message
apiRouter.post('/messages', requireAuth, messageLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { receiverId, content } = req.body;

    const rId = parseInt(receiverId, 10);
    if (!rId || rId === user.id) {
      return res.status(400).json({ error: 'Некорректный получатель' });
    }

    const trimmed = String(content || '').trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    // Check receiver exists
    const [receiver] = await db
      .select({ id: users.id, username: users.username, avatar: users.avatar })
      .from(users)
      .where(eq(users.id, rId))
      .limit(1);

if (!receiver) {
      return res.status(404).json({ error: 'Получатель не найден' });
    }

    // BLOCK CHECK
    const blockedCheck = await db
      .select()
      .from(friendRequests)
      .where(
        or(
          and(eq(friendRequests.senderId, user.id), eq(friendRequests.receiverId, rId), eq(friendRequests.status, 'BLOCKED')),
          and(eq(friendRequests.senderId, rId), eq(friendRequests.receiverId, user.id), eq(friendRequests.status, 'BLOCKED'))
        )
      )
      .limit(1);

    if (blockedCheck.length > 0) {
      return res.status(403).json({ error: 'Вы не можете отправить сообщение этому пользователю' });
    }

    const [savedMsg] = await db
      .insert(directMessages)
      .values({
        senderId: user.id,
        receiverId: rId,
        content: trimmed,
        isRead: false,
        createdAt: new Date(),
      })
      .returning();

    // Trigger NEW_MESSAGE notification through NotificationService!
    notificationService.notifyNewMessage(
      { id: user.id, username: user.username, avatar: user.avatar },
      rId,
      trimmed.length > 80 ? trimmed.slice(0, 80) + '...' : trimmed
    ).catch((err) => {
      console.warn('[Messages] Notification dispatch error:', err);
    });

    // Send real-time SSE to both sender and receiver
    notificationService.sendSSEEvent(rId, 'chat_message', savedMsg);
    notificationService.sendSSEEvent(user.id, 'chat_message', savedMsg);

    res.json(savedMsg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 13. ADMIN PANEL & INTEGRATIONS
// ==========================================


// Duplicated admin routes removed


import { importExportRouter } from './routes/importExport.ts';
import { gamesRouter } from './routes/games.ts';
import { adminRouter } from './routes/admin/index.ts';
import { publicNewsRouter } from './routes/admin/news.ts';
import { publicAnnouncementsRouter } from './routes/admin/announcements.ts';
import { publicReportsRouter } from './routes/admin/moderation.ts';
import { musicRouter } from './routes/music.ts';
import { uploadRouter } from './routes/upload.ts';

apiRouter.use('/library-sync', importExportRouter);
apiRouter.use('/achievements', achievementsRouter);
apiRouter.use('/games', gamesRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/music', musicRouter);
apiRouter.use('/upload', uploadRouter);
apiRouter.use('/', publicNewsRouter);
apiRouter.use('/', publicAnnouncementsRouter);
apiRouter.use('/', publicReportsRouter);


