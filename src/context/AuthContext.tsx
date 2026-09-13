import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  username: string;
  avatar: string | null;
  bio: string | null;
  role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
  profileVisibility: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  libraryVisibility: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  ratingVisibility?: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  activityVisibility?: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  listVisibility?: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  statisticsVisibility?: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  telegramUsername?: string | null;
  telegramChatId?: string | null;
  notificationSettings?: Record<string, boolean>;
  invitesLeft: number;
  createdAt: string;
}

export interface LibraryCounts {
  total: number;
  movies: number;
  tv: number;
  anime: number;
  games: number;
  books: number;
  manga: number;
  comics: number;
  completed: number;
}

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  dbUser: DbUser | null;
  counts: LibraryCounts | null;
  token: string | null;
  loading: boolean;
  login: () => Promise<void>;
  loginGoogle: () => Promise<void>;
  loginPassword: (login: string, pass: string) => Promise<void>;
  registerPassword: (username: string, pass: string, inviteCode?: string) => Promise<void>;
  loginTelegram: (code: string, telegramUsername?: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [counts, setCounts] = useState<LibraryCounts | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setDbUser(data.user);
        setCounts(data.counts);
        return data.user;
      } else if (res.status === 401 || res.status === 403) {
        setDbUser(null);
        setCounts(null);
      }
    } catch (err) {
      console.error('Failed to sync profile from DB:', err);
    }
    return null;
  };

  useEffect(() => {
    let isMounted = true;

    // 1. Immediately verify server session cookie
    fetchProfile().finally(() => {
      if (isMounted) setLoading(false);
    });

    // 2. Listen to Firebase auth for Google Sign-in flow
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      setFirebaseUser(user);
      if (user) {
        try {
          const idToken = await user.getIdToken();
          const res = await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            setDbUser(data.user);
            setToken(data.token);
            await fetchProfile();
          }
        } catch (err) {
          console.error('Firebase session sync failed:', err);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const loginGoogle = async () => {
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Ошибка входа через Google');
      }
      const data = await res.json();
      setToken(data.token);
      setDbUser(data.user);
      await fetchProfile();
    } catch (err: any) {
      if (
        err?.code === 'auth/cancelled-popup-request' ||
        err?.code === 'auth/popup-closed-by-user' ||
        err?.message?.includes('cancelled-popup-request') ||
        err?.message?.includes('popup-closed-by-user')
      ) {
        return;
      }
      console.error('Google Sign-in error:', err);
      throw err;
    }
  };

  const login = loginGoogle;

  const loginPassword = async (loginStr: string, pass: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: loginStr, password: pass }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Ошибка входа');
    }
    setToken(data.token);
    setDbUser(data.user);
    await fetchProfile();
  };

  const registerPassword = async (username: string, pass: string, inviteCode?: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pass, inviteCode }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Ошибка регистрации');
    }
    setToken(data.token);
    setDbUser(data.user);
    await fetchProfile();
  };

  const loginTelegram = async (code: string, telegramUsername?: string, inviteCode?: string) => {
    const res = await fetch('/api/auth/telegram/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, telegramUsername, inviteCode }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Ошибка входа через Telegram');
    }
    setToken(data.token);
    setDbUser(data.user);
    await fetchProfile();
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (_e) {}
    try {
      await signOut(auth);
    } catch (_e) {}
    setToken(null);
    setDbUser(null);
    setCounts(null);
  };

  const refreshProfile = async () => {
    await fetchProfile();
  };

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    let currentToken = token;
    if (firebaseUser) {
      try {
        currentToken = await firebaseUser.getIdToken();
        setToken(currentToken);
      } catch (_e) {}
    }
    const headers = new Headers(init.headers || {});
    if (currentToken) {
      headers.set('Authorization', `Bearer ${currentToken}`);
    }
    let res = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (res.status === 401 && firebaseUser) {
      try {
        const freshToken = await firebaseUser.getIdToken(true);
        if (freshToken) {
          setToken(freshToken);
          headers.set('Authorization', `Bearer ${freshToken}`);
          res = await fetch(url, {
            ...init,
            headers,
            credentials: 'include',
          });
        }
      } catch (_refreshErr) {}
    }

    return res;
  }, [token, firebaseUser]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        dbUser,
        counts,
        token,
        loading,
        login,
        loginGoogle,
        loginPassword,
        registerPassword,
        loginTelegram,
        logout,
        refreshProfile,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
