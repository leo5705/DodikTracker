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
    | 'achievements'
    | 'messages'
    | 'profile'
    | 'settings'
    | 'notifications'
    | 'feedback'
    | 'media-detail'
    | 'reset-password'
    | 'news'
    | 'news-detail'
    | 'music-home'
    | 'music-releases'
    | 'music-new'
    | 'music-artists'
    | 'music-genres'
    | 'music-search'
    | 'music-library'
    | 'music-studio'
    | 'music-release-editor'
    | 'music-artist'
    | 'music-release'
    | 'game-catalog'
    | 'game-detail'
    | 'game-developers'
    | 'game-developer-detail'
    | 'game-publishers'
    | 'game-publisher-detail'
    | 'game-series-detail';
  params: Record<string, string>;
  pathname: string;
}

interface RouterContextType {
  pathname: string;
  route: RouteMatch;
  navigate: (path: string, options?: { replace?: boolean; scroll?: boolean }) => void;
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

  // Game Routes
  // Developer detail: /games/developers/:id or /game/developer/:id
  const devDetailMatch = cleanPath.match(/^\/(?:games\/developers|game\/developer)\/([a-zA-Z0-9_.-]+)$/);
  if (devDetailMatch) {
    return {
      name: 'game-developer-detail',
      params: { ...queryParams, id: devDetailMatch[1] },
      pathname: cleanPath,
    };
  }

  // Developers list: /games/developers
  if (cleanPath === '/games/developers') {
    return { name: 'game-developers', params: queryParams, pathname: cleanPath };
  }

  // Publisher detail: /games/publishers/:id or /game/publisher/:id
  const pubDetailMatch = cleanPath.match(/^\/(?:games\/publishers|game\/publisher)\/([a-zA-Z0-9_.-]+)$/);
  if (pubDetailMatch) {
    return {
      name: 'game-publisher-detail',
      params: { ...queryParams, id: pubDetailMatch[1] },
      pathname: cleanPath,
    };
  }

  // Publishers list: /games/publishers
  if (cleanPath === '/games/publishers') {
    return { name: 'game-publishers', params: queryParams, pathname: cleanPath };
  }

  // Series detail: /games/series/:id or /game/series/:id
  const seriesDetailMatch = cleanPath.match(/^\/(?:games\/series|game\/series)\/([a-zA-Z0-9_.-]+)$/);
  if (seriesDetailMatch) {
    return {
      name: 'game-series-detail',
      params: { ...queryParams, id: seriesDetailMatch[1] },
      pathname: cleanPath,
    };
  }

  // Game catalog: /games/catalog or /games
  if (cleanPath === '/games/catalog' || cleanPath === '/games') {
    return { name: 'game-catalog', params: queryParams, pathname: cleanPath };
  }

  // Game detail: /games/:id or /game/:id
  const gameDetailMatch = cleanPath.match(/^\/(?:games|game)\/([a-zA-Z0-9_.-]+)$/);
  if (gameDetailMatch) {
    return {
      name: 'game-detail',
      params: { ...queryParams, id: gameDetailMatch[1] },
      pathname: cleanPath,
    };
  }

  const musicArtistMatch = cleanPath.match(/^\/music\/artist\/([a-zA-Z0-9_.-]+)$/);
  if (musicArtistMatch) {
    return {
      name: 'music-artist',
      params: { ...queryParams, idOrSlug: musicArtistMatch[1] },
      pathname: cleanPath,
    };
  }

  const musicReleaseMatch = cleanPath.match(/^\/music\/release\/([a-zA-Z0-9_.-]+)$/);
  if (musicReleaseMatch) {
    return {
      name: 'music-release',
      params: { ...queryParams, idOrSlug: musicReleaseMatch[1] },
      pathname: cleanPath,
    };
  }

  const releaseEditMatch = cleanPath.match(/^\/music\/studio\/releases\/edit\/(\d+)$/);
  if (releaseEditMatch) {
    return {
      name: 'music-release-editor',
      params: { ...queryParams, mode: 'edit', id: releaseEditMatch[1] },
      pathname: cleanPath,
    };
  }

  if (cleanPath === '/music/studio/releases/new') {
    return {
      name: 'music-release-editor',
      params: { ...queryParams, mode: 'new' },
      pathname: cleanPath,
    };
  }

  if (cleanPath === '/music/studio' || cleanPath === '/music-studio') {
    return { name: 'music-studio', params: queryParams, pathname: cleanPath };
  }

  if (cleanPath === '/music/releases') {
    return { name: 'music-releases', params: queryParams, pathname: cleanPath };
  }

  if (cleanPath === '/music/new') {
    return { name: 'music-new', params: queryParams, pathname: cleanPath };
  }

  if (cleanPath === '/music/artists') {
    return { name: 'music-artists', params: queryParams, pathname: cleanPath };
  }

  if (cleanPath === '/music/genres') {
    return { name: 'music-genres', params: queryParams, pathname: cleanPath };
  }

  if (cleanPath === '/music/search') {
    return { name: 'music-search', params: queryParams, pathname: cleanPath };
  }

  if (cleanPath === '/music/library' || cleanPath === '/music/my') {
    return { name: 'music-library', params: queryParams, pathname: cleanPath };
  }

  if (cleanPath === '/music') {
    return { name: 'music-home', params: queryParams, pathname: cleanPath };
  }

  // Category-specific Direct Routes: /movies/:id, /anime/:id, /series/:id, /manga/:id, /books/:id, /comics/:id, /music/:id
  const directCategoryMatch = cleanPath.match(/^\/(movies|movie|series|tv|anime|manga|books|book|comics|comic|music)\/([a-zA-Z0-9_.-]+)$/);
  if (directCategoryMatch) {
    const rawCat = directCategoryMatch[1].toLowerCase();
    let normalizedType = 'movie';
    if (rawCat === 'series' || rawCat === 'tv') normalizedType = 'tv';
    else if (rawCat === 'anime') normalizedType = 'anime';
    else if (rawCat === 'manga') normalizedType = 'manga';
    else if (rawCat === 'books' || rawCat === 'book') normalizedType = 'book';
    else if (rawCat === 'comics' || rawCat === 'comic') normalizedType = 'comic';
    else if (rawCat === 'music') normalizedType = 'music';
    else if (rawCat === 'movies' || rawCat === 'movie') normalizedType = 'movie';

    return {
      name: 'media-detail',
      params: { ...queryParams, type: normalizedType, id: directCategoryMatch[2] },
      pathname: cleanPath,
    };
  }

  // 1. Media Detail: /media/:type/:id or /media/:id
  const mediaWithTypeMatch = cleanPath.match(/^\/media\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (mediaWithTypeMatch) {
    return {
      name: 'media-detail',
      params: { ...queryParams, type: mediaWithTypeMatch[1], id: mediaWithTypeMatch[2] },
      pathname: cleanPath,
    };
  }

  const mediaSimpleMatch = cleanPath.match(/^\/media\/([a-zA-Z0-9_.-]+)$/);
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

  // 4. User Profile & User Tier Lists: /u/:username, /users/:username, /profile/:username, /users/:username/tier-lists
  const userTierListsMatch = cleanPath.match(/^\/(?:u|profile|users)\/([a-zA-Z0-9_-]+)\/tier-lists$/);
  if (userTierListsMatch) {
    return {
      name: 'profile',
      params: { ...queryParams, username: userTierListsMatch[1], tab: 'lists' },
      pathname: cleanPath,
    };
  }

  const userProfileMatch = cleanPath.match(/^\/(?:u|profile|users)\/([a-zA-Z0-9_-]+)$/);
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

  // News Routes
  const newsDetailMatch = cleanPath.match(/^\/news\/([a-zA-Z0-9_.-]+)$/);
  if (newsDetailMatch) {
    return {
      name: 'news-detail',
      params: { ...queryParams, slug: newsDetailMatch[1] },
      pathname: cleanPath,
    };
  }
  if (cleanPath === '/news') {
    return { name: 'news', params: queryParams, pathname: cleanPath };
  }

  // Feedback Routes
  const feedbackDetailMatch = cleanPath.match(/^\/feedback\/([a-zA-Z0-9_.-]+)$/);
  if (feedbackDetailMatch) {
    return {
      name: 'feedback',
      params: { ...queryParams, id: feedbackDetailMatch[1] },
      pathname: cleanPath,
    };
  }
  if (cleanPath === '/feedback') return { name: 'feedback', params: queryParams, pathname: cleanPath };

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

  // Messages / Chat: /messages/:userId or /messages
  const messagesUserMatch = cleanPath.match(/^\/messages\/([a-zA-Z0-9_-]+)$/);
  if (messagesUserMatch) {
    return {
      name: 'messages',
      params: { ...queryParams, userId: messagesUserMatch[1] },
      pathname: cleanPath,
    };
  }
  if (cleanPath === '/messages' || cleanPath === '/chat') {
    return { name: 'messages', params: queryParams, pathname: cleanPath };
  }

  // 6. Top-level tabs
  if (cleanPath === '/search' || cleanPath === '/catalog' || cleanPath === '/catalogue') {
    return { name: 'search', params: queryParams, pathname: cleanPath };
  }
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
  if (cleanPath === '/achievements') return { name: 'achievements', params: queryParams, pathname: cleanPath };
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

  const navigate = useCallback((path: string, options?: { replace?: boolean; scroll?: boolean }) => {
    const target = path.startsWith('/') ? path : `/${path}`;
    const current = (window.location.pathname || '/') + (window.location.search || '');
    if (target === current) return;

    if (options?.replace) {
      window.history.replaceState(null, '', target);
    } else {
      window.history.pushState(null, '', target);
    }
    setPathname(target);
    if (options?.scroll !== false) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
