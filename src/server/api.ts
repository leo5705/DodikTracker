import { Router, Response } from 'express';
import { requireAuth, requireAdmin, optionalAuth, AuthRequest, JWT_SECRET } from '../middleware/auth.ts';
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
  inviteCodes,
  passwordResetTokens,
  directMessages,
} from '../db/schema.ts';
import { eq, and, or, desc, asc, sql, inArray, isNull, ilike, gte, lte } from 'drizzle-orm';
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

export const apiRouter = Router();

export function setSessionCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('dodik_session', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie('dodik_session', {
    httpOnly: true,
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
apiRouter.get('/proxy/image', async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).send('Некорректный URL изображения');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const upstreamRes = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: new URL(imageUrl).origin,
      },
    });
    clearTimeout(timeout);

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send('Ошибка загрузки удаленного изображения');
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

    const arrayBuffer = await upstreamRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (_err) {
    return res.status(502).send('Ошибка проксирования изображения');
  }
});

// Helper to create in-app notification and push real-time SSE + Telegram queue
export async function sendAppNotification(
  userId: number,
  notif: {
    type: string;
    title: string;
    body: string;
    content?: string;
    relatedEntity?: string;
    relatedEntityId?: string;
    link?: string;
    senderId?: number;
    senderAvatar?: string;
    senderUsername?: string;
    metadata?: Record<string, any>;
  }
) {
  try {
    await notificationService.notifyUser({
      userId,
      type: notif.type as any,
      title: notif.title,
      body: notif.body,
      content: notif.content,
      relatedEntity: notif.relatedEntity,
      relatedEntityId: notif.relatedEntityId,
      link: notif.link,
      senderId: notif.senderId,
      senderAvatar: notif.senderAvatar,
      senderUsername: notif.senderUsername,
      metadata: notif.metadata,
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

    const mode = setting.length > 0 ? setting[0].value : 'OPEN'; // 'OPEN' | 'INVITE_ONLY' | 'CLOSED'
    const botUsername = botSetting.length > 0 ? botSetting[0].value : 'DodikTrackerBot';

    res.json({
      mode,
      allowsRegistration: mode === 'OPEN' || mode === 'INVITE_ONLY',
      requiresInvite: mode === 'INVITE_ONLY',
      botUsername,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

apiRouter.get('/auth/registration-status', getRegistrationStatusHandler);
apiRouter.get('/auth/registration-mode', getRegistrationStatusHandler);
apiRouter.get('/admin/registration-mode', getRegistrationStatusHandler);

// Register with username & password (+ optional or required invite code)
// Email is NOT required (Requirements 14)
apiRouter.post('/auth/register', async (req, res) => {
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

    if (!isFirstUser) {
      if (mode === 'CLOSED') {
        return res.status(403).json({ error: 'Регистрация новых пользователей закрыта администратором' });
      }
      
      if (mode === 'MAINTENANCE') {
        return res.status(503).json({ error: 'Сайт находится на техническом обслуживании' });
      }

      if (mode === 'INVITE_ONLY') {
        if (!inviteCode || !String(inviteCode).trim()) {
          return res.status(400).json({ error: 'Проект закрытый. Для регистрации необходим инвайт-код' });
        }

        const cleanCode = String(inviteCode).trim().toUpperCase();
        const foundCode = await db
          .select()
          .from(inviteCodes)
          .where(and(eq(inviteCodes.code, cleanCode), eq(inviteCodes.isUsed, false)))
          .limit(1);

        if (foundCode.length === 0) {
          return res.status(400).json({ error: 'Недействительный или уже использованный инвайт-код' });
        }
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

    // 4. If an invite code was used, mark it
    if (inviteCode) {
      const cleanCode = String(inviteCode).trim().toUpperCase();
      await db
        .update(inviteCodes)
        .set({ isUsed: true, usedById: newUser.id, usedAt: new Date() })
        .where(eq(inviteCodes.code, cleanCode))
        .catch(() => {});
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
apiRouter.post('/auth/login', async (req, res) => {
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

// Check Telegram bot status
apiRouter.get('/auth/telegram/status', async (_req, res) => {
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

    res.json({
      configured: !!botToken,
      botUsername,
      botUrl: `https://t.me/${botUsername}`,
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

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    telegramAuthCodes.set(code, {
      code,
      expiresAt,
      telegramUsername: cleanTg,
      isVerified: false,
    });

    res.json({
      configured: true,
      code,
      expiresAt,
      botUsername,
      botUrl: `https://t.me/${botUsername}?start=${code}`,
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

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 15 * 60 * 1000;

    telegramAuthCodes.set(code, {
      code,
      expiresAt,
      userId: user.id,
      isVerified: false,
    });

    res.json({
      configured: true,
      code,
      expiresAt,
      botUsername,
      botUrl: `https://t.me/${botUsername}?start=${code}`,
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

    const botSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'telegram_bot_username'))
      .limit(1);
    const botUsername =
      botSetting.length > 0 && botSetting[0].value?.trim()
        ? botSetting[0].value.trim()
        : telegramBot.getUsername();

    // CRITICAL SECURITY FIX: Check that the Telegram bot actually verified this code!
    if (!stored.isVerified) {
      return res.status(400).json({
        verified: false,
        error: `Авторизация ещё не подтверждена. Перейдите в бот @${botUsername} в Telegram и отправьте команду /login ${cleanCode}`,
      });
    }

    const tgUsername = stored.telegramUsername || (stored.telegramId ? `tg_${stored.telegramId}` : 'telegram_user');
    const tgId = stored.telegramId;
    const tgChatId = stored.telegramChatId;

    // Check if user exists
    let userRecord: any = null;

    if (stored.resolvedUserId) {
      const found = await db.select().from(users).where(eq(users.id, stored.resolvedUserId)).limit(1);
      if (found.length > 0) userRecord = found[0];
    }

    if (!userRecord && tgId) {
      const found = await db.select().from(users).where(eq(users.telegramId, tgId)).limit(1);
      if (found.length > 0) userRecord = found[0];
    }

    if (!userRecord && stored.telegramUsername) {
      const found = await db
        .select()
        .from(users)
        .where(
          or(
            eq(users.telegramUsername, stored.telegramUsername),
            eq(users.username, `tg_${stored.telegramUsername}`),
            eq(users.username, stored.telegramUsername)
          )
        )
        .limit(1);
      if (found.length > 0) userRecord = found[0];
    }

    if (!userRecord) {
      // Must register new user -> check registration mode
      const regModeSetting = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'site_access_mode'))
        .limit(1);
      const mode = regModeSetting.length > 0 ? regModeSetting[0].value : 'OPEN';

      const allUsers = await db.select({ id: users.id }).from(users);
      const isFirst = allUsers.length === 0;

      if (!isFirst) {
        if (mode === 'CLOSED') {
          return res.status(403).json({ error: 'Регистрация закрыта администратором' });
        }
        if (mode === 'INVITE_ONLY') {
          if (!inviteCode) {
            return res.status(400).json({
              requireInvite: true,
              error: 'Для новой регистрации через Telegram необходим инвайт-код. Пожалуйста, введите инвайт-код.',
            });
          }
          const cleanInvite = String(inviteCode).trim().toUpperCase();
          const foundInvite = await db
            .select()
            .from(inviteCodes)
            .where(and(eq(inviteCodes.code, cleanInvite), eq(inviteCodes.isUsed, false)))
            .limit(1);

          if (foundInvite.length === 0) {
            return res.status(400).json({ error: 'Недействительный инвайт-код' });
          }

          // Mark used
          await db
            .update(inviteCodes)
            .set({ isUsed: true, usedAt: new Date() })
            .where(eq(inviteCodes.code, cleanInvite));
        }
      }

      const cleanUserPrefix = tgUsername.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 14) || 'user';
      const generatedUsername = `tg_${cleanUserPrefix}_${Math.floor(Math.random() * 899 + 100)}`;
      const customUid = `tg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      const targetAdminUser = (process.env.INITIAL_ADMIN_USERNAME || process.env.ADMIN_USERNAME || '').trim().toLowerCase();
      const shouldBeAdmin = (targetAdminUser && (targetAdminUser === generatedUsername.toLowerCase() || targetAdminUser === stored.telegramUsername?.toLowerCase())) || (isFirst && !targetAdminUser && process.env.ALLOW_FIRST_USER_ADMIN !== 'false');

      const [created] = await db
        .insert(users)
        .values({
          uid: customUid,
          username: generatedUsername,
          email: `${generatedUsername}@dodik.telegram`,
          telegramUsername: stored.telegramUsername || null,
          telegramId: tgId || null,
          telegramChatId: tgChatId || null,
          role: shouldBeAdmin ? 'SUPER_ADMIN' : 'USER',
          invitesLeft: 3,
        })
        .returning();

      userRecord = created;
    } else {
      // User exists -> update telegram link if available
      if (tgId || tgChatId || stored.telegramUsername) {
        await db
          .update(users)
          .set({
            telegramId: tgId || userRecord.telegramId,
            telegramChatId: tgChatId || userRecord.telegramChatId,
            telegramUsername: stored.telegramUsername || userRecord.telegramUsername,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userRecord.id));
      }
    }

    telegramAuthCodes.delete(cleanCode);

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

    if (!user) {
      const allUsers = await db.select({ id: users.id }).from(users).limit(1);
      const isFirst = allUsers.length === 0;

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
    const myCodes = await db
      .select({
        id: inviteCodes.id,
        code: inviteCodes.code,
        isUsed: inviteCodes.isUsed,
        createdAt: inviteCodes.createdAt,
        usedAt: inviteCodes.usedAt,
        usedById: inviteCodes.usedById,
      })
      .from(inviteCodes)
      .where(eq(inviteCodes.creatorId, user.id))
      .orderBy(desc(inviteCodes.createdAt));

    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

    res.json({
      invitesLeft: isAdmin ? 999999 : user.invitesLeft,
      isUnlimited: isAdmin,
      codes: myCodes,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate new invite code
apiRouter.post('/invites/generate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

    if (!isAdmin && user.invitesLeft <= 0) {
      return res.status(403).json({ error: 'У вас закончились доступные приглашения (лимит 3)' });
    }

    let code = generateInviteCode();
    // Ensure uniqueness
    let attempts = 0;
    while (attempts < 5) {
      const exists = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
      if (exists.length === 0) break;
      code = generateInviteCode();
      attempts++;
    }

    const [newInvite] = await db
      .insert(inviteCodes)
      .values({
        code,
        creatorId: user.id,
        isUsed: false,
      })
      .returning();

    // Deduct invite for regular user
    let remaining = user.invitesLeft;
    if (!isAdmin) {
      remaining = Math.max(0, user.invitesLeft - 1);
      await db.update(users).set({ invitesLeft: remaining }).where(eq(users.id, user.id));
    }

    res.json({
      invite: newInvite,
      invitesLeft: isAdmin ? 999999 : remaining,
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
    };

    res.json({ user: sanitizeUser(user), counts });
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
      telegramChatId,
    } = req.body;

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
        telegramChatId: telegramChatId !== undefined ? telegramChatId : user.telegramChatId,
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
    votesFrom: num(query.votes_from ?? query.votesFrom),
    durationFrom: num(query.duration_from ?? query.durationFrom),
    durationTo: num(query.duration_to ?? query.durationTo),
    episodesFrom: num(query.episodes_from ?? query.episodesFrom),
    episodesTo: num(query.episodes_to ?? query.episodesTo),
    countries: parseList(query.countries || query.country),
    platforms: parseList(query.platforms || query.platform),
    status: query.status ? String(query.status) : undefined,
    season: query.season ? String(query.season) : undefined,
    seasonYear: num(query.season_year ?? query.seasonYear),
    animeFormat: query.anime_format ? String(query.anime_format) : (query.animeFormat ? String(query.animeFormat) : undefined),
    gameMode: query.game_mode ? String(query.game_mode) : (query.gameMode ? String(query.gameMode) : undefined),
    sortBy: query.sort_by ? String(query.sort_by) as any : (query.sortBy as any),
    sortOrder: (query.sort_order === 'asc' || query.sortOrder === 'asc') ? 'asc' : 'desc',
    page: num(query.page) || 1,
    limit: num(query.limit) || 20,
  };
}

const mediaSearchHandler = async (req: any, res: any) => {
  try {
    const filters = parseUnifiedFilters(req.query);
    const query = filters.query || '';
    const rawCategory = req.query.category || req.query.listCategory;
    const categoryFilter = rawCategory ? String(rawCategory).toUpperCase() : undefined;
    let typeFilter = req.query.type ? String(req.query.type).toUpperCase() : undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 50);
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);

    if (!typeFilter && categoryFilter) {
      if (categoryFilter === 'GAME' || categoryFilter === 'GAMES') typeFilter = 'GAME';
      else if (categoryFilter === 'ANIME') typeFilter = 'ANIME';
      else if (categoryFilter === 'MANGA') typeFilter = 'MANGA';
      else if (categoryFilter === 'BOOK' || categoryFilter === 'BOOKS') typeFilter = 'BOOK';
      else if (categoryFilter === 'COMIC' || categoryFilter === 'COMICS') typeFilter = 'COMIC';
    }

    const hasFilterCriteria = Boolean(
      (filters.genres && filters.genres.length > 0) ||
      (filters.countries && filters.countries.length > 0) ||
      (filters.platforms && filters.platforms.length > 0) ||
      filters.year !== undefined ||
      filters.yearFrom !== undefined ||
      filters.yearTo !== undefined ||
      filters.ratingFrom !== undefined ||
      filters.ratingTo !== undefined ||
      filters.votesFrom !== undefined ||
      filters.durationFrom !== undefined ||
      filters.durationTo !== undefined ||
      filters.status !== undefined ||
      filters.season !== undefined ||
      filters.seasonYear !== undefined ||
      filters.animeFormat !== undefined ||
      filters.gameMode !== undefined ||
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
    if (page === 1) {
      const localConditions: any[] = [];

      if (query && query.length >= 2) {
        localConditions.push(
          sql`(LOWER(${media.title}) LIKE ${'%' + query.toLowerCase() + '%'} OR LOWER(COALESCE(${media.originalTitle}, '')) LIKE ${'%' + query.toLowerCase() + '%'})`
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

        if (filters.sortBy === 'rating') {
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

apiRouter.get('/media/search', mediaSearchHandler);
apiRouter.get('/search', mediaSearchHandler);
apiRouter.get('/media/catalog', mediaSearchHandler);

// Trending items with pagination and filters
apiRouter.get('/media/trending', async (req, res) => {
  try {
    const rawType = req.query.type ? String(req.query.type).toUpperCase() : 'ALL';
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 50);
    const filters = parseUnifiedFilters(req.query);

    const trendingRes = await providerManager.getTrending(rawType, page, limit, filters);
    res.json({
      results: trendingRes.results || [],
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
apiRouter.post('/media/ensure', async (req, res) => {
  try {
    const { mediaId, mediaPayload } = req.body;
    if (mediaId) {
      const found = await db.select().from(media).where(eq(media.id, Number(mediaId))).limit(1);
      if (found.length > 0) {
        return res.json({ media: found[0] });
      }
    }

    if (!mediaPayload) {
      return res.status(400).json({ error: 'Не указаны данные медиа' });
    }

    const targetMedia = await ensureMediaInDb(mediaPayload);
    res.json({ media: targetMedia });
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

    // Calculate Dodik Tracker rating & score distribution
    const userRatingsRows = await db
      .select({
        rating: userMedia.rating,
      })
      .from(userMedia)
      .where(and(eq(userMedia.mediaId, item.id), sql`${userMedia.rating} IS NOT NULL`));

    let dodikAverageRating: number | null = null;
    const dodikRatingCount = userRatingsRows.length;
    const dodikDistribution: Record<number, number> = {
      10: 0, 9: 0, 8: 0, 7: 0, 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0,
    };

    if (dodikRatingCount > 0) {
      let sum = 0;
      for (const r of userRatingsRows) {
        const val = r.rating!;
        sum += val;
        if (dodikDistribution[val] !== undefined) {
          dodikDistribution[val]++;
        }
      }
      dodikAverageRating = Math.round((sum / dodikRatingCount) * 10) / 10;
    }

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
      ageRating: extDetails?.ageRating || undefined,
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

// Rate a media item directly (sets userMedia rating and updates Dodik aggregate)
apiRouter.post('/media/:id/rate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const mediaId = parseInt(req.params.id, 10);
    const { rating } = req.body;

    const cleanRating = (rating !== null && rating !== undefined)
      ? Math.min(10, Math.max(1, Math.round(Number(rating))))
      : null;

    const existing = await db
      .select()
      .from(userMedia)
      .where(and(eq(userMedia.userId, user.id), eq(userMedia.mediaId, mediaId)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userMedia)
        .set({ rating: cleanRating, updatedAt: new Date() })
        .where(eq(userMedia.id, existing[0].id));
    } else {
      await db.insert(userMedia).values({
        userId: user.id,
        mediaId,
        rating: cleanRating,
        status: 'COMPLETED',
      });
    }

    // Recalculate dodikRating
    const allRatings = await db
      .select({ rating: userMedia.rating })
      .from(userMedia)
      .where(and(eq(userMedia.mediaId, mediaId), sql`${userMedia.rating} IS NOT NULL`));

    let averageRating: number | null = null;
    const ratingCount = allRatings.length;
    const distribution: Record<number, number> = {
      10: 0, 9: 0, 8: 0, 7: 0, 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0,
    };
    if (ratingCount > 0) {
      let sum = 0;
      for (const r of allRatings) {
        sum += r.rating!;
        if (distribution[r.rating!] !== undefined) distribution[r.rating!]++;
      }
      averageRating = Math.round((sum / ratingCount) * 10) / 10;
    }

    res.json({
      success: true,
      userRating: cleanRating,
      dodikRating: { averageRating, ratingCount, distribution },
    });
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
    if (current && reviewRows.length > 0) {
      const reviewIds = reviewRows.map((r) => r.id);
      const userLikes = await db
        .select()
        .from(likes)
        .where(
          and(
            eq(likes.userId, current.id),
            eq(likes.targetType, 'REVIEW'),
            inArray(likes.targetId, reviewIds)
          )
        );
      userLikedReviewIds = new Set(userLikes.map((l) => l.targetId));
    }

    const formatted = reviewRows.map((r) => ({
      ...r,
      score: r.rating,
      username: r.authorUsername,
      avatar: r.authorAvatar,
      userLiked: userLikedReviewIds.has(r.id),
      isOwn: current ? current.id === r.userId : false,
    }));

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

    let savedReview;
    if (existing.length > 0) {
      [savedReview] = await db
        .update(reviews)
        .set({
          rating: effectiveRating !== undefined ? effectiveRating : existing[0].rating,
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
          rating: effectiveRating || null,
          title: title?.trim() || null,
          content: content.trim(),
          containsSpoilers: !!containsSpoilers,
        })
        .returning();

      // Log activity
      await db.insert(activities).values({
        userId: user.id,
        type: 'MEDIA_RATED',
        mediaId,
        details: title ? `Отзыв: "${title}"` : 'Написал(а) отзыв',
      });
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

    // Sync rating to userMedia
    if (effectiveRating) {
      const um = await db
        .select()
        .from(userMedia)
        .where(and(eq(userMedia.userId, user.id), eq(userMedia.mediaId, mediaId)))
        .limit(1);
      if (um.length > 0) {
        await db
          .update(userMedia)
          .set({ rating: effectiveRating, updatedAt: new Date() })
          .where(eq(userMedia.id, um[0].id));
      } else {
        await db.insert(userMedia).values({
          userId: user.id,
          mediaId,
          rating: effectiveRating,
          status: 'COMPLETED',
        });
      }
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
      isOwn: true,
      userLiked: false,
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

    res.json({
      ...updated,
      score: updated.rating,
      authorUsername: user.username,
      authorAvatar: user.avatar,
      username: user.username,
      avatar: user.avatar,
      authorRole: user.role,
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

// Like / unlike review
apiRouter.post('/reviews/:id/like', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const id = parseInt(req.params.id, 10);

    const existing = await db
      .select()
      .from(likes)
      .where(
        and(
          eq(likes.userId, user.id),
          eq(likes.targetType, 'REVIEW'),
          eq(likes.targetId, id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db.delete(likes).where(eq(likes.id, existing[0].id));
      await db
        .update(reviews)
        .set({ likesCount: sql`GREATEST(0, ${reviews.likesCount} - 1)` })
        .where(eq(reviews.id, id));
      return res.json({ liked: false });
    } else {
      await db.insert(likes).values({
        userId: user.id,
        targetType: 'REVIEW',
        targetId: id,
      });
      await db
        .update(reviews)
        .set({ likesCount: sql`${reviews.likesCount} + 1` })
        .where(eq(reviews.id, id));

      // Notify review author
      const reviewItem = (await db.select().from(reviews).where(eq(reviews.id, id)).limit(1))[0];
      if (reviewItem && reviewItem.userId !== user.id) {
        sendAppNotification(reviewItem.userId, {
          type: 'LIKE',
          title: 'Новый лайк',
          body: `@${user.username} оценил(а) вашу рецензию`,
          link: `/media/any/${reviewItem.mediaId}`,
        });
        // Trigger achievement check for receiving likes
        achievementService.checkAndUnlock(reviewItem.userId, 'LIKE_RECEIVED').catch(() => {});
      }
      return res.json({ liked: true });
    }
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
      [userMediaEntry] = await db
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
        details: defaultStatus,
      });
    }

    // Trigger achievement checks for media added & completed
    achievementService.checkAndUnlock(user.id, 'MEDIA_ADDED', { mediaId: targetMediaId }).catch(() => {});
    if (defaultStatus === 'COMPLETED') {
      achievementService.checkAndUnlock(user.id, 'MEDIA_COMPLETED', { mediaId: targetMediaId }).catch(() => {});
    }

    // Dispatch FRIEND_ACTIVITY to friends
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
        if (friendIds.length > 0) {
          const [mItem] = await db.select().from(media).where(eq(media.id, targetMediaId)).limit(1);
          const mTitle = mItem?.title || mItem?.originalTitle || 'контент';
          const actText = defaultStatus === 'COMPLETED'
            ? `завершил(а) просмотр «${mTitle}»`
            : `добавил(а) «${mTitle}» в список (${defaultStatus})`;

          for (const fid of friendIds) {
            notificationService.notifyFriendActivity(
              { id: user.id, username: user.username, avatar: user.avatar },
              fid,
              actText,
              `/media/${mItem?.type?.toLowerCase() || 'any'}/${targetMediaId}`
            ).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('[Activity Notification] Dispatch error:', err);
      }
    })();

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
      }
      await db.insert(mediaHistory).values({
        userId: user.id,
        mediaId: prev.mediaId,
        action: status === 'COMPLETED' ? 'COMPLETED' : 'STATUS_CHANGED',
        details: `Статус изменён на: ${status}`,
      });

      await db.insert(activities).values({
        userId: user.id,
        type: status === 'COMPLETED' ? 'MEDIA_COMPLETED' : 'MEDIA_ADDED',
        mediaId: prev.mediaId,
        details: status,
      });
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
        details: `${rating}/10`,
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
    // Get recent activities with user and media details
    const list = await db
      .select({
        id: activities.id,
        type: activities.type,
        details: activities.details,
        createdAt: activities.createdAt,
        userId: users.id,
        username: users.username,
        avatar: users.avatar,
        mediaId: media.id,
        mediaTitle: media.title,
        mediaPoster: media.posterUrl,
        mediaType: media.type,
      })
      .from(activities)
      .innerJoin(users, eq(activities.userId, users.id))
      .leftJoin(media, eq(activities.mediaId, media.id))
      .orderBy(desc(activities.createdAt))
      .limit(30);

    // Get likes count for these activities
    const activityIds = list.map((a) => a.id);
    let likesMap: Record<number, { count: number; userLiked: boolean }> = {};

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
    }

    const enriched = list.map((act) => ({
      ...act,
      likesCount: likesMap[act.id]?.count || 0,
      userLiked: likesMap[act.id]?.userLiked || false,
    }));

    res.json(enriched);
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
      await db.insert(likes).values({
        userId: user.id,
        targetType,
        targetId,
      });
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

    const [reqRecord] = await db
      .insert(friendRequests)
      .values({
        senderId: user.id,
        receiverId: targetUser.id,
        status: 'PENDING',
      })
      .returning();

    // Notification
    await sendAppNotification(targetUser.id, {
      type: 'FRIEND_REQUEST',
      title: 'Новая заявка в друзья',
      body: `@${user.username} отправил(а) вам заявку в друзья`,
      link: '/friends',
    });

    res.json(reqRecord);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Respond to friend request (ACCEPTED, DECLINED)
apiRouter.put('/friends/request/:id', requireAuth, async (req: AuthRequest, res: Response) => {
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
      await sendAppNotification(reqFound[0].senderId, {
        type: 'FRIEND_ACCEPTED',
        title: 'Заявка принята',
        body: `@${user.username} принял(а) вашу заявку в друзья`,
        link: `/u/${user.username}`,
      });
      // Trigger friend achievement for both users
      achievementService.checkAndUnlock(user.id, 'FRIEND_ADDED').catch(() => {});
      achievementService.checkAndUnlock(reqFound[0].senderId, 'FRIEND_ADDED').catch(() => {});
    }

    res.json(updated);
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
      userLists = await db
        .select()
        .from(lists)
        .where(and(eq(lists.ownerId, profileUser.id), eq(lists.visibility, 'PUBLIC')))
        .limit(10);
    }

    let userTierLists: any[] = [];
    if (canViewLists) {
      userTierLists = await db
        .select()
        .from(tierLists)
        .where(and(eq(tierLists.ownerId, profileUser.id), eq(tierLists.visibility, 'PUBLIC')))
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

    const enriched = await Promise.all(
      filtered.map(async (l) => {
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
          .where(eq(listItems.listId, l.id))
          .orderBy(listItems.orderIndex)
          .limit(4);

        const totalItemsCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(listItems)
          .where(eq(listItems.listId, l.id));

        const followersCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(listFollowers)
          .where(eq(listFollowers.listId, l.id));

        const likesCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(likes)
          .where(and(eq(likes.targetType, 'LIST'), eq(likes.targetId, l.id)));

        let isFollowed = false;
        let isLiked = false;

        if (user) {
          const followRow = await db
            .select()
            .from(listFollowers)
            .where(and(eq(listFollowers.listId, l.id), eq(listFollowers.userId, user.id)))
            .limit(1);
          isFollowed = followRow.length > 0;

          const likeRow = await db
            .select()
            .from(likes)
            .where(and(eq(likes.targetType, 'LIST'), eq(likes.targetId, l.id), eq(likes.userId, user.id)))
            .limit(1);
          isLiked = likeRow.length > 0;
        }

        return {
          ...l,
          itemCount: Number(totalItemsCount[0]?.count || 0),
          previewItems: items,
          followersCount: Number(followersCount[0]?.count || 0),
          likesCount: Number(likesCount[0]?.count || 0),
          isFollowed,
          isLiked,
        };
      })
    );

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

    // Trigger list creation achievement
    achievementService.checkAndUnlock(user.id, 'LIST_CREATED', { listId: newList.id }).catch(() => {});

    res.json(newList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Ensure media in local database
apiRouter.post('/media/ensure', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { mediaId, mediaPayload } = req.body;
    const resolvedId = await ensureMediaRecord(mediaId ? Number(mediaId) : undefined, mediaPayload);
    if (!resolvedId) {
      return res.status(400).json({ error: 'Не удалось определить или сохранить медиа' });
    }
    const [found] = await db.select().from(media).where(eq(media.id, resolvedId)).limit(1);
    res.json({ mediaId: resolvedId, media: found });
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
    const enriched = await Promise.all(
      myLists.map(async (l) => {
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
          .where(eq(listItems.listId, l.id))
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
          .where(eq(listItems.listId, l.id))
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
        addedByUsername: users.username,
        addedByAvatar: users.avatar,
      })
      .from(listItems)
      .innerJoin(media, eq(listItems.mediaId, media.id))
      .leftJoin(users, eq(listItems.addedById, users.id))
      .where(eq(listItems.listId, id))
      .orderBy(listItems.orderIndex, listItems.id);

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
      items: rawItems,
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
      await db.insert(likes).values({
        targetType: 'LIST',
        targetId: listId,
        userId: user.id,
      });

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
      if (targetUser.listVisibility === 'FRIENDS_ONLY' && !isFriend) {
        return res.json([]);
      }
    }

    const conditions: any[] = [eq(tierLists.ownerId, targetUser.id)];
    if (!isOwner && !isAdmin) {
      if (isFriend) {
        conditions.push(or(eq(tierLists.visibility, 'PUBLIC'), eq(tierLists.visibility, 'FRIENDS_ONLY')));
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

    const existing = await db
      .select()
      .from(tierLists)
      .where(and(eq(tierLists.id, id), eq(tierLists.ownerId, user.id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Тир-лист не найден или нет прав' });
    }

    const targetCategory = (category || existing[0].category || 'MOVIES_TV').toUpperCase();

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
        title: title !== undefined ? title.trim() : existing[0].title,
        description: description !== undefined ? (description ? description.trim() : null) : existing[0].description,
        category: targetCategory,
        tiersJson: tiersJson !== undefined ? (typeof tiersJson === 'string' ? tiersJson : JSON.stringify(tiersJson)) : existing[0].tiersJson,
        itemsJson: itemsJson !== undefined ? (typeof itemsJson === 'string' ? itemsJson : JSON.stringify(itemsJson)) : existing[0].itemsJson,
        visibility: visibility || existing[0].visibility,
        updatedAt: new Date(),
      })
      .where(and(eq(tierLists.id, id), eq(tierLists.ownerId, user.id)))
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

    if (existing[0].ownerId !== user.id && user.role !== 'ADMIN') {
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
    if (tierList.ownerId !== user.id && user.role !== 'ADMIN') {
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

      if (tierList.visibility === 'FRIENDS_ONLY') {
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

  const parsedMinRating = minRating ? parseFloat(String(minRating)) : 0;

  const matchesCategory = (mediaType: string, cat?: string) => {
    if (!cat || cat === 'ALL') return true;
    if (cat === 'MOVIES_TV') return mediaType === 'MOVIE' || mediaType === 'TV';
    return mediaType === cat;
  };

  if (source === 'USER_LIST' || listId) {
    const numericListId = typeof listId === 'string' ? parseInt(listId, 10) : Number(listId);
    if (!numericListId || isNaN(numericListId)) {
      throw { status: 400, message: 'Не выбран список' };
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
  } else if (user && (source === 'MY_LIBRARY' || source === 'MY_PLANNED' || source === 'MY_FAVORITES')) {
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

    if (source === 'MY_PLANNED') {
      candidateMedia = candidateMedia.filter((r) => r.userStatus?.includes('PLAN_TO_'));
    } else if (source === 'MY_FAVORITES') {
      candidateMedia = candidateMedia.filter((r) => r.isFavorite);
    }
  } else {
    // From entire media catalog
    const conditions: any[] = [];
    if (category && category !== 'ALL') {
      if (category === 'MOVIES_TV') {
        conditions.push(inArray(media.type, ['MOVIE', 'TV']));
      } else {
        conditions.push(eq(media.type, String(category)));
      }
    }
    if (parsedMinRating > 0) {
      conditions.push(gte(media.rating, parsedMinRating));
    }

    candidateMedia = await db
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
      .from(media)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(media.rating))
      .limit(500);
  }

  // Apply category filter if requested
  if (category && category !== 'ALL') {
    candidateMedia = candidateMedia.filter((m) => matchesCategory(m.type, category));
  }

  // Apply minRating filter if requested
  if (parsedMinRating > 0) {
    candidateMedia = candidateMedia.filter((m) => (m.rating || 0) >= parsedMinRating);
  }

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

    const conditions = [eq(notifications.userId, user.id)];

    if (filter === 'unread') {
      conditions.push(eq(notifications.isRead, false));
    } else if (filter === 'achievements') {
      conditions.push(eq(notifications.type, 'ACHIEVEMENT_UNLOCKED'));
    } else if (filter === 'social') {
      conditions.push(
        or(
          eq(notifications.type, 'FRIEND_REQUEST'),
          eq(notifications.type, 'FRIEND_ACCEPTED'),
          eq(notifications.type, 'NEW_MESSAGE'),
          eq(notifications.type, 'FRIEND_REVIEW'),
          eq(notifications.type, 'FRIEND_ACTIVITY'),
          eq(notifications.type, 'MENTION'),
          eq(notifications.type, 'LIKE'),
          eq(notifications.type, 'COMMENT')
        )!
      );
    } else if (filter === 'system') {
      conditions.push(
        or(
          eq(notifications.type, 'SYSTEM'),
          eq(notifications.type, 'ADMIN_ALERT'),
          eq(notifications.type, 'NEW_RELEASE')
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
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

    res.json({
      notifications: notifs,
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
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

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
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));

    // Recompute and emit updated count via SSE
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));
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
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

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
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));
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
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, true)));

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
apiRouter.post('/notifications/admin-broadcast', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
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
apiRouter.post('/messages', requireAuth, async (req: AuthRequest, res: Response) => {
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

apiRouter.get('/admin/dashboard', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const [allUsers, allMedia, allLists, allTierLists, allLogs] = await Promise.all([
      db.select().from(users),
      db.select().from(media),
      db.select().from(lists),
      db.select().from(tierLists),
      db.select().from(apiLogs).limit(50),
    ]);

    res.json({
      users: {
        total: allUsers.length,
        new7d: allUsers.filter(u => u.createdAt && new Date(u.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000).length,
        active30d: allUsers.length,
        blocked: allUsers.filter(u => u.isBlocked).length,
        staff: allUsers.filter(u => ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER', 'NEWS_EDITOR'].includes(u.role)).length,
      },
      content: {
        total: allMedia.length,
        hidden: allMedia.filter(m => m.isHidden).length,
        byCategory: [
          { type: 'MOVIE', count: allMedia.filter(m => m.type === 'MOVIE').length },
          { type: 'TV', count: allMedia.filter(m => m.type === 'TV').length },
          { type: 'ANIME', count: allMedia.filter(m => m.type === 'ANIME').length },
          { type: 'GAME', count: allMedia.filter(m => m.type === 'GAME').length },
          { type: 'BOOK', count: allMedia.filter(m => m.type === 'BOOK').length },
        ].filter(c => c.count > 0)
      },
      engagement: {
        reviews: 0,
        lists: allLists.length,
        tierLists: allTierLists.length,
        userMedia: 0,
        messages: 0,
      },
      moderation: {
        pending: 0,
        total: 0,
        resolved: 0,
      },
      system: {
        maintenanceMode: false,
        uptime: '12d 5h',
        version: '1.0.0',
        database: 'CONNECTED',
        cache: 'OPTIMIZED',
        registrationMode: 'OPEN',
        integrations: {
          enabled: 3,
          hasErrors: 0,
        }
      },
      trends: {
        registrations: [],
        userMedia: [],
      },
      recentAudit: [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin message cleanup status
apiRouter.get('/admin/message-cleanup/status', requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const cleanupStatus = getCleanupStatus();
    res.json(cleanupStatus);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin trigger message cleanup manually
apiRouter.post('/admin/message-cleanup/run', requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await runMessageCleanupJob();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List configured integrations (credentials masked)
apiRouter.get('/admin/integrations', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const registeredProviders = providerManager.getAllProviders();
    const storedIntegrations = await db.select().from(systemIntegrations);

    const integrationsMap = new Map(storedIntegrations.map((i) => [i.provider, i]));

    const result = registeredProviders.map((p) => {
      const stored = integrationsMap.get(p.name.toUpperCase());
      let creds: Record<string, any> | undefined = undefined;
      if (stored?.encryptedCredentials) {
        try {
          creds = decryptCredentials(stored.encryptedCredentials);
        } catch {}
      }

      const hasKey = !!(creds?.apiKey || creds?.clientId || creds?.clientSecret || stored?.encryptedCredentials);
      const hasClientId = !!(creds?.clientId || (creds?.apiKey && !creds?.clientSecret && p.name.toUpperCase() === 'IGDB'));
      const hasClientSecret = !!creds?.clientSecret;

      return {
        provider: p.name,
        supportedTypes: p.supportedTypes,
        requiresKey: p.requiresKey,
        enabled: stored ? stored.enabled : !p.requiresKey,
        hasKey,
        hasClientId,
        hasClientSecret,
        maskedKey: creds?.apiKey ? maskApiKey(creds.apiKey) : undefined,
        maskedClientId: creds?.clientId ? maskApiKey(creds.clientId) : undefined,
        lastCheckedAt: stored?.lastCheckedAt || null,
        lastError: stored?.lastError || null,
        priority: stored?.priority || 1,
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Save or update integration credentials (encrypted with AES-256-GCM)
apiRouter.post('/admin/integrations', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { provider, apiKey, enabled, priority, clientId, clientSecret, removeKey } = req.body;

    if (!provider) {
      return res.status(400).json({ error: 'Провайдер обязателен' });
    }

    const providerKey = provider.toUpperCase();
    const existing = await db
      .select()
      .from(systemIntegrations)
      .where(eq(systemIntegrations.provider, providerKey))
      .limit(1);

    let encrypted: string | null = existing[0]?.encryptedCredentials || null;

    if (removeKey) {
      encrypted = null;
    } else if (apiKey !== undefined || clientId !== undefined || clientSecret !== undefined) {
      let currentCreds: Record<string, any> = {};
      if (existing[0]?.encryptedCredentials) {
        try {
          currentCreds = decryptCredentials(existing[0].encryptedCredentials) || {};
        } catch (_e) {}
      }

      let newClientId = clientId;
      let newClientSecret = clientSecret;
      let newApiKey = apiKey;

      // Auto-split combined strings for IGDB
      if (providerKey === 'IGDB' && newApiKey && typeof newApiKey === 'string' && newApiKey.includes(':') && !newClientSecret) {
        const parts = newApiKey.split(':');
        newClientId = parts[0].trim();
        newClientSecret = parts.slice(1).join(':').trim();
        newApiKey = undefined;
      }

      const credentialsPayload: Record<string, any> = {
        ...currentCreds,
        ...(newApiKey !== undefined ? (newApiKey === '' ? {} : { apiKey: newApiKey }) : {}),
        ...(newClientId !== undefined ? (newClientId === '' ? {} : { clientId: newClientId }) : {}),
        ...(newClientSecret !== undefined ? (newClientSecret === '' ? {} : { clientSecret: newClientSecret }) : {}),
      };

      // Clean empty keys
      if (newApiKey === '') delete credentialsPayload.apiKey;
      if (newClientId === '') delete credentialsPayload.clientId;
      if (newClientSecret === '') delete credentialsPayload.clientSecret;

      if (Object.keys(credentialsPayload).length > 0) {
        encrypted = encryptCredentials(credentialsPayload);
      } else {
        encrypted = null;
      }
    }

    if (existing.length > 0) {
      await db
        .update(systemIntegrations)
        .set({
          enabled: enabled !== undefined ? enabled : existing[0].enabled,
          encryptedCredentials: encrypted,
          priority: priority !== undefined ? Number(priority) : existing[0].priority,
          updatedAt: new Date(),
        })
        .where(eq(systemIntegrations.id, existing[0].id));
    } else {
      await db.insert(systemIntegrations).values({
        provider: providerKey,
        enabled: enabled !== undefined ? !!enabled : false,
        encryptedCredentials: encrypted,
        priority: priority !== undefined ? Number(priority) : 1,
      });
    }

    // Audit log (never logs secret)
    await db.insert(adminAuditLogs).values({
      userId: user.id,
      action: 'UPDATE_INTEGRATION',
      details: `Обновлена интеграция ${providerKey} (включена: ${enabled}, ключ ${encrypted ? 'настроен' : 'удален'})`,
    });

    res.json({
      ok: true,
      hasKey: !!encrypted,
      maskedKey: apiKey ? maskApiKey(apiKey) : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Provider health check (calls actual external API)
apiRouter.post('/admin/integrations/health-check', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { provider, apiKey, clientId, clientSecret } = req.body;
    let creds: Record<string, any> | undefined = undefined;
    if (apiKey || clientId || clientSecret) {
      creds = {
        ...(apiKey ? { apiKey } : {}),
        ...(clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
      };
    }
    const result = await providerManager.healthCheck(provider, creds);

    // Update integration last status
    await db
      .update(systemIntegrations)
      .set({
        lastCheckedAt: new Date(),
        lastError: result.ok ? null : result.error,
      })
      .where(eq(systemIntegrations.provider, provider.toUpperCase()))
      .catch(() => {});

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Users management
apiRouter.get('/admin/users', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        uid: users.uid,
        username: users.username,
        email: users.email,
        avatar: users.avatar,
        role: users.role,
        isBlocked: users.isBlocked,
        invitesLeft: users.invitesLeft,
        telegramChatId: users.telegramChatId,
        telegramUsername: users.telegramUsername,
        createdAt: users.createdAt,
        mediaCount: sql<number>`COALESCE((SELECT COUNT(*) FROM user_media WHERE user_media.user_id = ${users.id}), 0)::int`,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(100);

    res.json(allUsers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/admin/users/:id/role', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { role } = req.body; // USER, MODERATOR, ADMIN, SUPER_ADMIN

    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const [updated] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    await db.insert(adminAuditLogs).values({
      userId: req.dbUser!.id,
      action: 'CHANGE_ROLE',
      details: `Роль пользователя @${targetUser.username} изменена с ${targetUser.role} на ${role}`,
      ip: req.ip,
    }).catch(() => {});

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/admin/users/:id/block', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Prevent blocking super admin
    if (targetUser.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Нельзя заблокировать главного администратора' });
    }

    const newBlockedStatus = !targetUser.isBlocked;
    const [updated] = await db
      .update(users)
      .set({ isBlocked: newBlockedStatus, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    await db.insert(adminAuditLogs).values({
      userId: req.dbUser!.id,
      action: newBlockedStatus ? 'BAN_USER' : 'UNBAN_USER',
      details: `${newBlockedStatus ? 'Заблокирован' : 'Разблокирован'} аккаунт @${targetUser.username}`,
      ip: req.ip,
    }).catch(() => {});

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/users/:id/reset-password', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Generate token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokens).values({
      userId: id,
      tokenHash,
      expiresAt,
    });

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const resetUrl = `${protocol}://${host}/reset-password/${rawToken}`;

    await db.insert(adminAuditLogs).values({
      userId: req.dbUser!.id,
      action: 'RESET_PASSWORD',
      details: `Сгенерирована ссылка для сброса пароля пользователя @${targetUser.username}`,
      ip: req.ip,
    }).catch(() => {});

    res.json({
      success: true,
      token: rawToken,
      resetUrl,
      username: targetUser.username,
      expiresAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin audit logs
apiRouter.get('/admin/audit-logs', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const logs = await db
      .select({
        id: adminAuditLogs.id,
        action: adminAuditLogs.action,
        details: adminAuditLogs.details,
        ip: adminAuditLogs.ip,
        createdAt: adminAuditLogs.createdAt,
        adminUsername: users.username,
        adminAvatar: users.avatar,
      })
      .from(adminAuditLogs)
      .leftJoin(users, eq(adminAuditLogs.userId, users.id))
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(100);

    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API request logs
apiRouter.get('/admin/api-logs', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const logs = await db.select().from(apiLogs).orderBy(desc(apiLogs.createdAt)).limit(100);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// System settings
apiRouter.get('/admin/settings', async (req, res) => {
  try {
    const settings = await db.select().from(systemSettings);
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update registration mode: 'OPEN' | 'INVITE_ONLY' | 'CLOSED'
apiRouter.put('/admin/registration-mode', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { mode } = req.body;
    if (!mode || !['OPEN', 'INVITE_ONLY', 'CLOSED'].includes(mode)) {
      return res.status(400).json({ error: 'Недопустимый режим (допустимо: OPEN, INVITE_ONLY, CLOSED)' });
    }

    const existing = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'site_access_mode'))
      .limit(1);

    if (existing.length > 0) {
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

    await db.insert(adminAuditLogs).values({
      userId: req.dbUser!.id,
      action: 'UPDATE_REGISTRATION_MODE',
      details: `Режим регистрации изменен на: ${mode}`,
    });

    res.json({ ok: true, mode });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all system invite codes for admin panel
apiRouter.get('/admin/invites', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const allCodes = await db
      .select({
        id: inviteCodes.id,
        code: inviteCodes.code,
        isUsed: inviteCodes.isUsed,
        createdAt: inviteCodes.createdAt,
        usedAt: inviteCodes.usedAt,
        creatorId: inviteCodes.creatorId,
        usedById: inviteCodes.usedById,
      })
      .from(inviteCodes)
      .orderBy(desc(inviteCodes.createdAt))
      .limit(200);

    const userIds = [
      ...new Set([
        ...allCodes.map((c) => c.creatorId).filter(Boolean),
        ...allCodes.map((c) => c.usedById).filter(Boolean),
      ]),
    ] as number[];

    const usersMap = new Map<number, string>();
    if (userIds.length > 0) {
      const foundUsers = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, userIds));
      foundUsers.forEach((u) => usersMap.set(u.id, u.username));
    }

    const formatted = allCodes.map((c) => ({
      ...c,
      creatorUsername: c.creatorId ? usersMap.get(c.creatorId) || `ID #${c.creatorId}` : 'Система / Администратор',
      usedByUsername: c.usedById ? usersMap.get(c.usedById) || `ID #${c.usedById}` : null,
    }));

    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin adjusts a specific user's invite balance
apiRouter.put('/admin/users/:id/invites', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { count } = req.body;

    const countNum = parseInt(count, 10);
    if (isNaN(countNum) || countNum < 0) {
      return res.status(400).json({ error: 'Количество должно быть неотрицательным числом' });
    }

    const [updated] = await db
      .update(users)
      .set({ invitesLeft: countNum, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    await db.insert(adminAuditLogs).values({
      userId: req.dbUser!.id,
      action: 'UPDATE_USER_INVITES',
      details: `Количество инвайтов для пользователя #${id} (${updated.username}) изменено на: ${countNum}`,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Telegram integration settings
apiRouter.get('/admin/telegram-settings', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const settings = await db.select().from(systemSettings);
    const map = new Map(settings.map((s) => [s.key, s.value]));

    const botToken = map.get('telegram_bot_token') || '';
    const botUsername = map.get('telegram_bot_username') || 'DodikTrackerBot';
    let adminIds: string[] = [];
    try {
      adminIds = JSON.parse(map.get('telegram_admin_ids') || '[]');
    } catch (_e) {}

    res.json({
      hasToken: !!botToken,
      maskedToken: botToken ? maskApiKey(botToken) : '',
      botUsername,
      adminIds,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update Telegram bot token, username, or admin IDs
apiRouter.post('/admin/telegram-settings', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { botToken, botUsername, adminIds } = req.body;

    const upsertSetting = async (key: string, value: string, descText: string) => {
      const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
      if (existing.length > 0) {
        await db.update(systemSettings).set({ value, updatedAt: new Date() }).where(eq(systemSettings.key, key));
      } else {
        await db.insert(systemSettings).values({ key, value, description: descText });
      }
    };

    if (botToken !== undefined && botToken.trim()) {
      await upsertSetting('telegram_bot_token', botToken.trim(), 'Telegram Bot API Token');
    }

    if (botUsername !== undefined) {
      await upsertSetting('telegram_bot_username', botUsername.replace('@', '').trim(), 'Telegram Bot Username');
    }

    if (adminIds !== undefined) {
      await upsertSetting('telegram_admin_ids', JSON.stringify(adminIds), 'List of Telegram Administrator Chat IDs');
    }

    await db.insert(adminAuditLogs).values({
      userId: req.dbUser!.id,
      action: 'UPDATE_TELEGRAM_SETTINGS',
      details: 'Обновлены настройки Telegram интеграции и список ID администраторов',
    });

    // Automatically reload and restart Telegram bot polling with new settings
    await telegramBot.restart();

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// User test Telegram notification (from profile Settings)
apiRouter.post('/notifications/test-telegram', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { chatId } = req.body;
    const targetChatId = chatId ? String(chatId).trim() : user.telegramChatId;

    if (!targetChatId) {
      return res.status(400).json({ error: 'Chat ID не указан' });
    }

    const testMsg = `🎉 *Dodik Tracker — Тестовое уведомление*\n\nПривет, *${user.username}*! Связь с ботом успешно проверена. Теперь вы будете оперативно получать уведомления о друзьях, оценках и списках прямо в Telegram!`;
    const result = await telegramBot.sendMessage(targetChatId, testMsg);

    if (!result.ok) {
      return res.status(400).json({
        error: result.error || result.description || 'Не удалось отправить сообщение. Убедитесь, что вы нажали /start в боте.',
      });
    }

    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate 6-digit link code for logged-in user
apiRouter.post('/auth/telegram/link-code', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 15 * 60 * 1000;

    telegramAuthCodes.set(code, {
      code,
      expiresAt,
      userId: user.id,
    });

    const botSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'telegram_bot_username'))
      .limit(1);
    const botUsername = botSetting.length > 0 ? botSetting[0].value : 'DodikTrackerBot';

    res.json({
      code,
      expiresAt,
      botUsername,
      message: `Код привязки: ${code}. Отправьте команду /link ${code} боту @${botUsername}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Test Telegram Bot API connection & optionally send message to admin IDs
apiRouter.post('/admin/telegram-test', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const settings = await db.select().from(systemSettings);
    const map = new Map(settings.map((s) => [s.key, s.value]));

    const token = req.body.botToken || map.get('telegram_bot_token');
    if (!token) {
      return res.status(400).json({ error: 'Telegram Bot Token не настроен' });
    }

    // Call getMe
    const getMeRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const getMeData = await getMeRes.json();

    if (!getMeData.ok) {
      return res.status(400).json({
        ok: false,
        error: `Ошибка Telegram API: ${getMeData.description || 'Недействительный токен'}`,
      });
    }

    // If an admin ID is provided or in settings, optionally send a test notification
    const testAdminId = req.body.adminId;
    let messageSent = false;
    let sendResult = null;

    if (testAdminId) {
      const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: testAdminId,
          text: `🔔 *Dodik Tracker: Проверка связи*\n\nИнтеграция с Telegram успешно подключена к боту *@${getMeData.result.username}*!\n\nАдминистратор: ${req.dbUser!.username}\nДата: ${new Date().toLocaleString('ru-RU')}`,
          parse_mode: 'Markdown',
        }),
      });
      sendResult = await sendRes.json();
      messageSent = sendResult.ok;
    }

    res.json({
      ok: true,
      bot: getMeData.result,
      messageSent,
      sendResult,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

import { importExportRouter } from './routes/importExport.ts';
import { gamesRouter } from './routes/games.ts';
import { adminRouter } from './routes/admin/index.ts';
import { publicNewsRouter } from './routes/admin/news.ts';
import { publicAnnouncementsRouter } from './routes/admin/announcements.ts';
import { publicReportsRouter } from './routes/admin/moderation.ts';

apiRouter.use('/library-sync', importExportRouter);
apiRouter.use('/achievements', achievementsRouter);
apiRouter.use('/games', gamesRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/', publicNewsRouter);
apiRouter.use('/', publicAnnouncementsRouter);
apiRouter.use('/', publicReportsRouter);


