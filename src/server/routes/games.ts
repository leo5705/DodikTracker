import { Router, Response } from 'express';
import { optionalAuth, requireAdmin, AuthRequest } from '../../middleware/auth.ts';
import { UnifiedGameService } from '../game/unifiedGameService.ts';
import { ContentVisibilityService } from '../services/contentVisibilityService.ts';
import { db } from '../../db/index.ts';
import { userMedia, media, mediaExternalIds, mediaRatings } from '../../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { GameCatalogFilters } from '../../types/unifiedGame.ts';
import { deduplicateAndNormalizeStores } from '../../utils/storeNormalizer.ts';

export const gamesRouter = Router();

const isStaffOrAdmin = (user?: any) =>
  Boolean(user && ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER'].includes(user.role));

async function getHiddenGameData() {
  const hiddenRows = await db
    .select({ id: media.id, title: media.title, year: media.year })
    .from(media)
    .where(and(eq(media.type, 'GAME'), eq(media.isHidden, true)));
  const hiddenIds = new Set<number>(hiddenRows.map((m) => m.id));

  const extRows = await db
    .select({ externalId: mediaExternalIds.externalId })
    .from(mediaExternalIds)
    .innerJoin(media, eq(mediaExternalIds.mediaId, media.id))
    .where(and(eq(media.type, 'GAME'), eq(media.isHidden, true)));
  const hiddenExtIds = new Set<string>(extRows.map((e) => String(e.externalId).trim().toLowerCase()));

  const hiddenTitles = new Set<string>(
    hiddenRows.map((m) => `${(m.title || '').trim().toLowerCase()}:${m.year || ''}`)
  );

  return { hiddenIds, hiddenExtIds, hiddenTitles };
}

function isGameHidden(
  g: any,
  hiddenIds: Set<number>,
  hiddenExtIds: Set<string>,
  hiddenTitles: Set<string>
): boolean {
  if (g.mediaId && hiddenIds.has(Number(g.mediaId))) return true;
  if (g.id && (hiddenIds.has(Number(g.id)) || hiddenExtIds.has(String(g.id).trim().toLowerCase()))) return true;
  if (g.rawgId && hiddenExtIds.has(String(g.rawgId).trim().toLowerCase())) return true;
  if (g.gmdbId && hiddenExtIds.has(String(g.gmdbId).trim().toLowerCase())) return true;
  if (g.slug && hiddenExtIds.has(String(g.slug).trim().toLowerCase())) return true;
  if (g.title) {
    const titleKey = `${(g.title || '').trim().toLowerCase()}:${g.year || ''}`;
    if (hiddenTitles.has(titleKey)) return true;
  }
  return false;
}

// 1. GET /api/games/catalog - Browse games with filters
gamesRouter.get('/catalog', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const filters: GameCatalogFilters = {
      genre: req.query.genre as string,
      platform: req.query.platform as string,
      developer: req.query.developer as string,
      publisher: req.query.publisher as string,
      year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
      yearFrom: req.query.yearFrom ? parseInt(req.query.yearFrom as string, 10) : undefined,
      yearTo: req.query.yearTo ? parseInt(req.query.yearTo as string, 10) : undefined,
      ratingFrom: req.query.ratingFrom ? parseFloat(req.query.ratingFrom as string) : undefined,
      ratingTo: req.query.ratingTo ? parseFloat(req.query.ratingTo as string) : undefined,
      metacriticFrom: req.query.metacriticFrom ? parseInt(req.query.metacriticFrom as string, 10) : undefined,
      metacriticTo: req.query.metacriticTo ? parseInt(req.query.metacriticTo as string, 10) : undefined,
      sortBy: (req.query.sortBy as any) || 'popularity',
      sortOrder: (req.query.sortOrder as any) || 'desc',
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
    };

    const result = await UnifiedGameService.getInstance().getCatalog(filters);
    const current = req.dbUser;
    if (!isStaffOrAdmin(current) && result.results.length > 0) {
      const { hiddenIds, hiddenExtIds, hiddenTitles } = await getHiddenGameData();
      result.results = result.results.filter(
        (g) => !isGameHidden(g, hiddenIds, hiddenExtIds, hiddenTitles)
      );
    }
    result.results = ContentVisibilityService.filterAccessibleContent(current, result.results);
    return res.json(result);
  } catch (err: any) {
    console.error('[GamesRouter] /catalog error:', err);
    return res.status(500).json({ error: 'Не удалось получить каталог игр' });
  }
});

// 2. GET /api/games/search - Deep search games across RAWG & GMDB
gamesRouter.get('/search', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const query = (req.query.q as string) || (req.query.query as string) || '';
    const filters: GameCatalogFilters = {
      genre: req.query.genre as string,
      platform: req.query.platform as string,
      developer: req.query.developer as string,
      publisher: req.query.publisher as string,
      year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
      sortBy: (req.query.sortBy as any) || 'popularity',
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
    };

    const result = await UnifiedGameService.getInstance().searchGames(query, filters);
    const current = req.dbUser;
    if (!isStaffOrAdmin(current) && result.results.length > 0) {
      const { hiddenIds, hiddenExtIds, hiddenTitles } = await getHiddenGameData();
      result.results = result.results.filter(
        (g) => !isGameHidden(g, hiddenIds, hiddenExtIds, hiddenTitles)
      );
    }
    result.results = ContentVisibilityService.filterAccessibleContent(current, result.results);
    return res.json(result);
  } catch (err: any) {
    console.error('[GamesRouter] /search error:', err);
    return res.status(500).json({ error: 'Ошибка поиска игр' });
  }
});

// 3. GET /api/games/developers - Developers catalog / search
gamesRouter.get('/developers', async (req, res) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const search = req.query.search as string;

    const result = await UnifiedGameService.getInstance().getDevelopersList(page, limit, search);
    return res.json(result);
  } catch (err: any) {
    console.error('[GamesRouter] /developers error:', err);
    return res.status(500).json({ error: 'Ошибка получения списка разработчиков' });
  }
});

// 4. GET /api/games/developers/:id - Developer details
gamesRouter.get('/developers/:id', async (req, res) => {
  try {
    const dev = await UnifiedGameService.getInstance().getDeveloper(req.params.id);
    if (!dev) {
      return res.status(404).json({ error: 'Разработчик не найден' });
    }
    return res.json(dev);
  } catch (err: any) {
    console.error(`[GamesRouter] /developers/${req.params.id} error:`, err);
    return res.status(500).json({ error: 'Ошибка получения данных разработчика' });
  }
});

// 5. GET /api/games/developers/:id/games - Developer's games
gamesRouter.get('/developers/:id/games', async (req, res) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const sort = (req.query.sort as string) || (req.query.sortBy as string) || 'popularity';

    const result = await UnifiedGameService.getInstance().getDeveloperGames(req.params.id, page, limit, sort);
    return res.json(result);
  } catch (err: any) {
    console.error(`[GamesRouter] /developers/${req.params.id}/games error:`, err);
    return res.status(500).json({ error: 'Ошибка получения списка игр разработчика' });
  }
});

// 6. GET /api/games/publishers - Publishers catalog / search
gamesRouter.get('/publishers', async (req, res) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const search = req.query.search as string;

    const result = await UnifiedGameService.getInstance().getPublishersList(page, limit, search);
    return res.json(result);
  } catch (err: any) {
    console.error('[GamesRouter] /publishers error:', err);
    return res.status(500).json({ error: 'Ошибка получения списка издателей' });
  }
});

// 7. GET /api/games/publishers/:id - Publisher details
gamesRouter.get('/publishers/:id', async (req, res) => {
  try {
    const pub = await UnifiedGameService.getInstance().getPublisher(req.params.id);
    if (!pub) {
      return res.status(404).json({ error: 'Издатель не найден' });
    }
    return res.json(pub);
  } catch (err: any) {
    console.error(`[GamesRouter] /publishers/${req.params.id} error:`, err);
    return res.status(500).json({ error: 'Ошибка получения данных издателя' });
  }
});

// 8. GET /api/games/publishers/:id/games - Publisher's games
gamesRouter.get('/publishers/:id/games', async (req, res) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const sort = (req.query.sort as string) || (req.query.sortBy as string) || 'popularity';

    const result = await UnifiedGameService.getInstance().getPublisherGames(req.params.id, page, limit, sort);
    return res.json(result);
  } catch (err: any) {
    console.error(`[GamesRouter] /publishers/${req.params.id}/games error:`, err);
    return res.status(500).json({ error: 'Ошибка получения списка игр издателя' });
  }
});

// 9. GET /api/games/series/:id - Series details & games
gamesRouter.get('/series/:id', async (req, res) => {
  try {
    const series = await UnifiedGameService.getInstance().getSeries(req.params.id);
    if (!series) {
      return res.status(404).json({ error: 'Серия игр не найдена' });
    }
    return res.json(series);
  } catch (err: any) {
    console.error(`[GamesRouter] /series/${req.params.id} error:`, err);
    return res.status(500).json({ error: 'Ошибка получения данных серии' });
  }
});

// 10. GET /api/games/:id/diagnostic - Admin diagnostic
gamesRouter.get('/:id/diagnostic', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const diag = await UnifiedGameService.getInstance().getGameDiagnostic(req.params.id);
    if (!diag) {
      return res.status(404).json({ error: 'Диагностика для данной игры недоступна' });
    }
    return res.json(diag);
  } catch (err: any) {
    console.error(`[GamesRouter] /${req.params.id}/diagnostic error:`, err);
    return res.status(500).json({ error: 'Ошибка проведения диагностики' });
  }
});

// 11. GET /api/games/:id/screenshots
gamesRouter.get('/:id/screenshots', async (req, res) => {
  try {
    const game = await UnifiedGameService.getInstance().getGameDetails(req.params.id);
    return res.json(game?.screenshots || []);
  } catch (err: any) {
    return res.status(500).json({ error: 'Ошибка получения скриншотов' });
  }
});

// 12. GET /api/games/:id/videos
gamesRouter.get('/:id/videos', async (req, res) => {
  try {
    const game = await UnifiedGameService.getInstance().getGameDetails(req.params.id);
    return res.json(game?.videos || []);
  } catch (err: any) {
    return res.status(500).json({ error: 'Ошибка получения видео' });
  }
});

// 13. GET /api/games/:id/series
gamesRouter.get('/:id/series', async (req, res) => {
  try {
    const game = await UnifiedGameService.getInstance().getGameDetails(req.params.id);
    return res.json(game?.series || null);
  } catch (err: any) {
    return res.status(500).json({ error: 'Ошибка получения серии' });
  }
});

// 14. GET /api/games/:id/dlc
gamesRouter.get('/:id/dlc', async (req, res) => {
  try {
    const game = await UnifiedGameService.getInstance().getGameDetails(req.params.id);
    return res.json(game?.dlcs || []);
  } catch (err: any) {
    return res.status(500).json({ error: 'Ошибка получения DLC' });
  }
});

// 15. GET /api/games/:id/stores
gamesRouter.get('/:id/stores', async (req, res) => {
  try {
    const game = await UnifiedGameService.getInstance().getGameDetails(req.params.id);
    return res.json(deduplicateAndNormalizeStores(game?.stores || []));
  } catch (err: any) {
    return res.status(500).json({ error: 'Ошибка получения магазинов' });
  }
});

// 16. GET /api/games/:id/creators
gamesRouter.get('/:id/creators', async (req, res) => {
  try {
    const game = await UnifiedGameService.getInstance().getGameDetails(req.params.id);
    return res.json(game?.creators || []);
  } catch (err: any) {
    return res.status(500).json({ error: 'Ошибка получения команды создателей' });
  }
});

// 17. GET /api/games/:id/similar
gamesRouter.get('/:id/similar', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const game = await UnifiedGameService.getInstance().getGameDetails(req.params.id);
    let similar = game?.similar || [];
    const current = req.dbUser;
    if (!isStaffOrAdmin(current) && similar.length > 0) {
      const { hiddenIds, hiddenExtIds, hiddenTitles } = await getHiddenGameData();
      similar = similar.filter((g: any) => !isGameHidden(g, hiddenIds, hiddenExtIds, hiddenTitles));
    }
    similar = ContentVisibilityService.filterAccessibleContent(current, similar);
    return res.json(similar);
  } catch (err: any) {
    return res.status(500).json({ error: 'Ошибка получения похожих игр' });
  }
});

// 18. GET /api/games/:id - Complete unified game details
gamesRouter.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const current = req.dbUser;
    const isStaff = isStaffOrAdmin(current);
    const idParam = String(req.params.id || '').trim();

    if (!isStaff) {
      const { hiddenIds, hiddenExtIds } = await getHiddenGameData();
      if (!isNaN(Number(idParam)) && hiddenIds.has(Number(idParam))) {
        return res.status(404).json({ error: 'Игра не найдена' });
      }
      if (hiddenExtIds.has(idParam.toLowerCase())) {
        return res.status(404).json({ error: 'Игра не найдена' });
      }
    }

    const game = await UnifiedGameService.getInstance().getGameDetails(req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена в единой базе Dodik Tracker' });
    }

    // Check if game is linked to a hidden media record or matches hidden external IDs
    if (!isStaff) {
      const { hiddenIds, hiddenExtIds, hiddenTitles } = await getHiddenGameData();
      if (isGameHidden(game, hiddenIds, hiddenExtIds, hiddenTitles)) {
        return res.status(404).json({ error: 'Игра не найдена' });
      }
    }

    const vis = ContentVisibilityService.canViewContent(current, game);
    if (!vis.allowed) {
      if (vis.reason === 'ADULT_RESTRICTED') {
        return res.status(403).json({ error: 'Контент 18+', isAdultRestricted: true, code: 'ADULT_RESTRICTED' });
      }
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    // If user is authenticated, check for user library status
    let userTracking = null;
    const targetUserId = req.dbUser?.id || req.user?.id;
    if (targetUserId && game.mediaId) {
      const um = await db
        .select()
        .from(userMedia)
        .where(
          and(
            eq(userMedia.userId, targetUserId),
            eq(userMedia.mediaId, game.mediaId)
          )
        )
        .limit(1);
      if (um.length > 0) userTracking = um[0];
    }

    // Compute Dodik Tracker rating & score distribution for the game
    let dodikRating = {
      averageRating: null as number | null,
      ratingCount: 0,
      distribution: {} as Record<string, number>,
      userRating: null as number | null,
    };

    if (game.mediaId) {
      const allRatings = await db
        .select({ rating: mediaRatings.rating, userId: mediaRatings.userId })
        .from(mediaRatings)
        .where(eq(mediaRatings.mediaId, game.mediaId));

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
      if (targetUserId) {
        const found = allRatings.find((r) => r.userId === targetUserId);
        if (found) userRating = found.rating;
      }

      dodikRating = {
        averageRating: avgRating,
        ratingCount: totalCount,
        distribution,
        userRating,
      };
    }

    // External Ratings array
    const externalRatings: { source: string; score: number; max: number }[] = [];
    if (game.rating && game.rating > 0) {
      externalRatings.push({
        source: 'RAWG / IGDB',
        score: Math.round(game.rating * 10) / 10,
        max: 10,
      });
    }
    if (game.metacritic) {
      externalRatings.push({
        source: 'Metacritic',
        score: Math.round(game.metacritic / 10 * 10) / 10,
        max: 10,
      });
    }

    return res.json({
      ...game,
      dodikRating,
      externalRatings,
      userTracking,
    });
  } catch (err: any) {
    console.error(`[GamesRouter] /:id error for ${req.params.id}:`, err);
    return res.status(500).json({ error: 'Ошибка получения данных игры' });
  }
});
