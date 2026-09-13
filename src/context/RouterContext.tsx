import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export interface RouteMatch {
  name:
    | 'home'
    | 'search'
    | 'library'
    | 'library-import'
    | 'library-export'
    | 'feed'
    | 'friends'
    | 'lists'
    | 'list-detail'
    | 'tier-lists'
    | 'tier-list-detail'
    | 'roulette'
    | 'statistics'
    | 'calendar'
    | 'admin'
    | 'profile'
    | 'settings'
    | 'notifications'
    | 'media-detail'
    | 'reset-password';
  params: Record<string, string>;
  pathname: string;
}

interface RouterContextType {
  pathname: string;
  route: RouteMatch;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  goBack: () => void;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

export function parseRoute(rawPathname: string): RouteMatch {
  const [pathPart, queryPart] = (rawPathname || '/').split('?');
  const cleanPath = pathPart.replace(/\/+$/, '') || '/';

  const queryParams: Record<string, string> = {};
  if (queryPart) {
    try {
      const sp = new URLSearchParams(queryPart);
      sp.forEach((val, key) => {
        queryParams[key] = val;
      });
    } catch {
      // ignore
    }
  }

  // 1. Media Detail: /media/:type/:id or /media/:id
  const mediaWithTypeMatch = cleanPath.match(/^\/media\/([a-zA-Z0-9_-]+)\/(\d+)$/);
  if (mediaWithTypeMatch) {
    return {
      name: 'media-detail',
      params: { ...queryParams, type: mediaWithTypeMatch[1], id: mediaWithTypeMatch[2] },
      pathname: cleanPath,
    };
  }

  const mediaSimpleMatch = cleanPath.match(/^\/media\/(\d+)$/);
  if (mediaSimpleMatch) {
    return {
      name: 'media-detail',
      params: { ...queryParams, id: mediaSimpleMatch[1] },
      pathname: cleanPath,
    };
  }

  // 2. Tier Lists Detail: /tier-lists/:id or /tier-list/:id
  const tierListMatch = cleanPath.match(/^\/(?:tier-lists|tier-list)\/(\d+)$/);
  if (tierListMatch) {
    return {
      name: 'tier-list-detail',
      params: { ...queryParams, id: tierListMatch[1] },
      pathname: cleanPath,
    };
  }

  // 3. List Detail: /lists/:id or /list/:id
  const listMatch = cleanPath.match(/^\/(?:lists|list)\/(\d+)$/);
  if (listMatch) {
    return {
      name: 'list-detail',
      params: { ...queryParams, id: listMatch[1] },
      pathname: cleanPath,
    };
  }

  // 4. User Profile: /u/:username or /profile/:username
  const userProfileMatch = cleanPath.match(/^\/(?:u|profile)\/([a-zA-Z0-9_-]+)$/);
  if (userProfileMatch) {
    return {
      name: 'profile',
      params: { ...queryParams, username: userProfileMatch[1] },
      pathname: cleanPath,
    };
  }

  // 5. Reset Password: /reset-password/:token
  const resetPasswordMatch = cleanPath.match(/^\/reset-password\/([a-zA-Z0-9_-]+)$/);
  if (resetPasswordMatch) {
    return {
      name: 'reset-password',
      params: { ...queryParams, token: resetPasswordMatch[1] },
      pathname: cleanPath,
    };
  }

  // 5. Library import / export
  if (cleanPath === '/library/import') return { name: 'library-import', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/library/export') return { name: 'library-export', params: queryParams, pathname: cleanPath };

  // 6. Library with category: /library/:category
  const libraryCatMatch = cleanPath.match(/^\/library\/([a-zA-Z0-9_-]+)$/);
  if (libraryCatMatch) {
    return {
      name: 'library',
      params: { ...queryParams, category: libraryCatMatch[1].toUpperCase() },
      pathname: cleanPath,
    };
  }

  // 6. Top-level tabs
  if (cleanPath === '/search') return { name: 'search', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/library') return { name: 'library', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/feed') return { name: 'feed', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/friends') return { name: 'friends', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/lists') return { name: 'lists', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/tier-lists' || cleanPath === '/tierlists')
    return { name: 'tier-lists', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/roulette') return { name: 'roulette', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/statistics') return { name: 'statistics', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/calendar') return { name: 'calendar', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/admin') return { name: 'admin', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/settings') return { name: 'settings', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/notifications') return { name: 'notifications', params: queryParams, pathname: cleanPath };
  if (cleanPath === '/profile') return { name: 'profile', params: queryParams, pathname: cleanPath };

  // Default: home
  return { name: 'home', params: queryParams, pathname: cleanPath };
}

export const RouterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pathname, setPathname] = useState<string>(
    () => (window.location.pathname || '/') + (window.location.search || '')
  );

  useEffect(() => {
    const handlePopState = () => {
      setPathname((window.location.pathname || '/') + (window.location.search || ''));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    const target = path.startsWith('/') ? path : `/${path}`;
    const current = (window.location.pathname || '/') + (window.location.search || '');
    if (target === current) return;

    if (options?.replace) {
      window.history.replaceState(null, '', target);
    } else {
      window.history.pushState(null, '', target);
    }
    setPathname(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate('/');
    }
  }, [navigate]);

  const route = parseRoute(pathname);

  return (
    <RouterContext.Provider value={{ pathname, route, navigate, goBack }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = (): RouterContextType => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
};
