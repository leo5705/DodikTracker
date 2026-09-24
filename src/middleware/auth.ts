import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { db } from '../db/index.ts';
import { users, systemSettings } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'dodik_tracker_jwt_secret_key_2026_antigravity';

export interface AuthRequest extends Request {
  user?: DecodedIdToken | any;
  dbUser?: typeof users.$inferSelect;
}


export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  let token: string | undefined = req.cookies?.dodik_session;
  const authHeader = req.headers.authorization;

  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split('Bearer ')[1];
  }
  if (!token && req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }

  let dbUser = null;
  let decodedUser = null;

  // 1. Try Custom JWT Token first
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload && payload.userId) {
      const found = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
      if (found.length > 0) {
        dbUser = found[0];
        decodedUser = { uid: found[0].uid, email: found[0].email, name: found[0].username, id: found[0].id };
      }
    }
  } catch (_jwtErr) {
    // Not a valid JWT or expired, fall back to Firebase Auth verification
  }

  // 2. Try Firebase ID token
  if (!dbUser) {
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      decodedUser = decodedToken;

      const foundUsers = await db.select().from(users).where(eq(users.uid, decodedToken.uid)).limit(1);
      if (foundUsers.length > 0) {
        dbUser = foundUsers[0];
      } else {
        // --- NEW USER REGISTRATION VIA FIREBASE ---
        const regModeSetting = await db
          .select()
          .from(systemSettings)
          .where(eq(systemSettings.key, 'site_access_mode'))
          .limit(1);
        const regMode = regModeSetting.length > 0 ? regModeSetting[0].value : 'OPEN';

        const allUsersCount = await db.select({ id: users.id }).from(users);
        const isFirst = allUsersCount.length === 0;

        if (!isFirst) {
          if (regMode === 'CLOSED') {
            return res.status(403).json({ error: 'Регистрация закрыта администратором' });
          }
          if (regMode === 'MAINTENANCE') {
            return res.status(503).json({ error: 'Сайт находится на техническом обслуживании. Регистрация недоступна.' });
          }
          if (regMode === 'INVITE_ONLY') {
            return res.status(403).json({ error: 'Для регистрации нужен инвайт-код. Зарегистрируйтесь по паролю.' });
          }
        }

        const email = decodedToken.email || `user_${decodedToken.uid.slice(0, 8)}@dodik.local`;
        const baseUsername = (decodedToken.name || email.split('@')[0] || 'dodik')
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .slice(0, 20);
        const username = `${baseUsername}_${Math.floor(Math.random() * 899 + 100)}`;

        const targetAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
        const targetAdminUser = (process.env.INITIAL_ADMIN_USERNAME || process.env.ADMIN_USERNAME || '').trim().toLowerCase();

        const shouldBeAdmin = (targetAdminEmail && targetAdminEmail === email.toLowerCase()) ||
                              (targetAdminUser && targetAdminUser === username.toLowerCase()) ||
                              (isFirst && !targetAdminEmail && !targetAdminUser && process.env.ALLOW_FIRST_USER_ADMIN !== 'false');

        const [newUser] = await db
          .insert(users)
          .values({
            uid: decodedToken.uid,
            email,
            username,
            avatar: decodedToken.picture || null,
            role: shouldBeAdmin ? 'SUPER_ADMIN' : 'USER',
            invitesLeft: 3,
          })
          .returning();
        
        dbUser = newUser;
      }
    } catch (error: any) {
      if (error?.code === 'auth/id-token-expired' || error?.message?.includes('auth/id-token-expired')) {
        return res.status(401).json({ error: 'Срок действия токена истек', code: 'auth/id-token-expired' });
      }
      console.error('Error verifying auth token:', error);
      return res.status(401).json({ error: 'Недействительный токен сессии' });
    }
  }

  // Common Checks for dbUser
  if (dbUser) {
    if (dbUser.isBlocked) {
      return res.status(403).json({ error: 'Ваш аккаунт заблокирован администратором', banReason: dbUser.banReason });
    }
    if (dbUser.bannedUntil && new Date(dbUser.bannedUntil) > new Date()) {
      return res.status(403).json({
        error: `Ваш аккаунт временно заблокирован до ${new Date(dbUser.bannedUntil).toLocaleString('ru-RU')}`,
        bannedUntil: dbUser.bannedUntil,
        banReason: dbUser.banReason,
      });
    }

    const modeSetting = await db.select().from(systemSettings).where(eq(systemSettings.key, 'site_access_mode')).limit(1);
    const siteMode = modeSetting.length > 0 ? modeSetting[0].value : 'OPEN';
    
    if (siteMode === 'MAINTENANCE' && !isStaffRole(dbUser.role)) {
       return res.status(503).json({ error: 'MAINTENANCE_MODE' });
    }

    req.dbUser = dbUser;
    req.user = decodedUser;
    return next();
  }

  return res.status(401).json({ error: 'Необходима авторизация' });
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  let token: string | undefined = req.cookies?.dodik_session;
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split('Bearer ')[1];
  }
  if (!token && req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (token) {
    // 1. Try JWT
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      if (payload && payload.userId) {
        const found = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
        if (found.length > 0 && !found[0].isBlocked) {
          req.dbUser = found[0];
          req.user = { uid: found[0].uid, email: found[0].email, name: found[0].username, id: found[0].id };
          return next();
        }
      }
    } catch (_e) {}

    // 2. Try Firebase
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      req.user = decodedToken;
      const foundUsers = await db.select().from(users).where(eq(users.uid, decodedToken.uid)).limit(1);
      if (foundUsers.length > 0 && !foundUsers[0].isBlocked) {
        req.dbUser = foundUsers[0];
      }
    } catch (_err) {
      // silent pass for optional
    }
  }
  next();
};

export type StaffRole = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'CONTENT_MANAGER' | 'NEWS_EDITOR';

export type AdminPermission =
  | 'ACCESS_ADMIN_PANEL'
  | 'VIEW_DASHBOARD'
  | 'MANAGE_USERS'
  | 'MANAGE_ROLES'
  | 'MANAGE_MODERATION'
  | 'MANAGE_NEWS'
  | 'MANAGE_ANNOUNCEMENTS'
  | 'MANAGE_CONTENT'
  | 'MANAGE_ACHIEVEMENTS'
  | 'MANAGE_NOTIFICATIONS'
  | 'MANAGE_INTEGRATIONS'
  | 'MANAGE_SETTINGS'
  | 'VIEW_AUDIT_LOG'
  | 'VIEW_ANALYTICS';

export function isStaffRole(role?: string): boolean {
  if (!role) return false;
  return ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER', 'NEWS_EDITOR'].includes(role);
}

export function isAdminRole(role?: string): boolean {
  if (!role) return false;
  const r = String(role).toUpperCase();
  return r === 'SUPER_ADMIN' || r === 'ADMIN';
}

export const requireAdminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  if (!isAdminRole(req.dbUser.role)) {
    return res.status(403).json({
      error: 'Доступ запрещён: выдать или изменить роль музыканта может только администратор',
    });
  }
  next();
};

export function hasStaffPermission(role: string | undefined, permission: AdminPermission): boolean {
  if (!role) return false;
  if (role === 'SUPER_ADMIN') return true;

  if (role === 'ADMIN') {
    // Admin has access to all except assigning or modifying SUPER_ADMIN
    return permission !== 'MANAGE_ROLES';
  }

  if (role === 'MODERATOR') {
    return [
      'ACCESS_ADMIN_PANEL',
      'VIEW_DASHBOARD',
      'MANAGE_MODERATION',
      'MANAGE_USERS',
      'VIEW_AUDIT_LOG',
      'VIEW_ANALYTICS',
    ].includes(permission);
  }

  if (role === 'CONTENT_MANAGER') {
    return [
      'ACCESS_ADMIN_PANEL',
      'VIEW_DASHBOARD',
      'MANAGE_CONTENT',
      'MANAGE_INTEGRATIONS',
      'VIEW_ANALYTICS',
    ].includes(permission);
  }

  if (role === 'NEWS_EDITOR') {
    return [
      'ACCESS_ADMIN_PANEL',
      'VIEW_DASHBOARD',
      'MANAGE_NEWS',
      'MANAGE_ANNOUNCEMENTS',
      'VIEW_ANALYTICS',
    ].includes(permission);
  }

  return false;
}

export const requireStaff = (permission: AdminPermission = 'ACCESS_ADMIN_PANEL') => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    if (!hasStaffPermission(req.dbUser.role, permission)) {
      return res.status(403).json({
        error: `Доступ запрещён: недостаточно прав (требуется: ${permission})`,
      });
    }
    next();
  };
};

export const requireAdmin = requireStaff('ACCESS_ADMIN_PANEL');

