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
  // Check cookie first, fallback to Authorization header
  let token: string | undefined = req.cookies?.dodik_session;
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split('Bearer ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }

  // 1. Try Custom JWT Token first
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload && payload.userId) {
      const found = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
      if (found.length > 0) {
        if (found[0].isBlocked) {
          return res.status(403).json({ error: 'Ваш аккаунт заблокирован администратором' });
        }
        req.dbUser = found[0];
        req.user = { uid: found[0].uid, email: found[0].email, name: found[0].username, id: found[0].id };
        return next();
      }
    }
  } catch (_jwtErr) {
    // Not a valid JWT or expired, fall back to Firebase Auth verification
  }

  // 2. Try Firebase ID token
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    // Fetch or verify database user
    const foundUsers = await db.select().from(users).where(eq(users.uid, decodedToken.uid)).limit(1);
    if (foundUsers.length > 0) {
      if (foundUsers[0].isBlocked) {
        return res.status(403).json({ error: 'Ваш аккаунт заблокирован администратором' });
      }
      req.dbUser = foundUsers[0];
      return next();
    }

    // Check system registration mode for new Google users
    const regModeSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'registration_mode'))
      .limit(1);
    const regMode = regModeSetting.length > 0 ? regModeSetting[0].value : 'OPEN';

    const allUsersCount = await db.select().from(users);
    const isFirst = allUsersCount.length === 0;

    if (!isFirst && regMode === 'CLOSED') {
      return res.status(403).json({ error: 'Регистрация новых пользователей закрыта администратором' });
    }

    const email = decodedToken.email || `user_${decodedToken.uid.slice(0, 8)}@dodik.local`;
    const baseUsername = (decodedToken.name || email.split('@')[0] || 'dodik')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 20);
    const username = `${baseUsername}_${Math.floor(Math.random() * 899 + 100)}`;

    const [newUser] = await db
      .insert(users)
      .values({
        uid: decodedToken.uid,
        email,
        username,
        avatar: decodedToken.picture || null,
        role: isFirst ? 'SUPER_ADMIN' : 'USER',
        invitesLeft: 3,
      })
      .returning();

    req.dbUser = newUser;
    next();
  } catch (error: any) {
    if (error?.code === 'auth/id-token-expired' || error?.message?.includes('auth/id-token-expired')) {
      return res.status(401).json({ error: 'Срок действия токена истек', code: 'auth/id-token-expired' });
    }
    console.error('Error verifying auth token:', error);
    return res.status(401).json({ error: 'Недействительный токен сессии' });
  }
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

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.dbUser || (req.dbUser.role !== 'ADMIN' && req.dbUser.role !== 'SUPER_ADMIN')) {
    return res.status(403).json({ error: 'Доступ запрещён: требуются права администратора' });
  }
  next();
};
