import { Router, Response } from 'express';
import { optionalAuth, requireAdmin, AuthRequest } from '../../middleware/auth.ts';
import { UnifiedGameService } from '../game/unifiedGameService.ts';
import { db } from '../../db/index.ts';
import { userMedia, media } from '../../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { GameCatalogFilters } from '../../types/unifiedGame.ts';

export const gamesRouter = Router();

// 1. GET /api/games/catalog - Browse games with filters
gamesRouter.get('/catalog', async (req, res) => {
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
    return res.json(result);
  } catch (err: any) {
    console.error('[GamesRouter] /catalog error:', err);
    return res.status(500).json({ error: 'Не удалось получить каталог игр' });
  }
});

// 2. GET /api/games/search - Deep search games across RAWG & GMDB
gamesRouter.get('/search', async (req, res) => {
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
    return res.json(game?.stores || []);
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
gamesRouter.get('/:id/similar', async (req, res) => {
  try {
    const game = await UnifiedGameService.getInstance().getGameDetails(req.params.id);
    return res.json(game?.similar || []);
  } catch (err: any) {
    return res.status(500).json({ error: 'Ошибка получения похожих игр' });
  }
});

// 18. GET /api/games/:id - Complete unified game details
gamesRouter.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const game = await UnifiedGameService.getInstance().getGameDetails(req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена в единой базе Dodik Tracker' });
    }

    // If user is authenticated, check for user library status
    let userTracking = null;
    if (req.user?.id && game.mediaId) {
      const um = await db
        .select()
        .from(userMedia)
        .where(
          and(
            eq(userMedia.userId, req.user.id),
            eq(userMedia.mediaId, game.mediaId)
          )
        )
        .limit(1);
      if (um.length > 0) userTracking = um[0];
    }

    return res.json({
      ...game,
      userTracking,
    });
  } catch (err: any) {
    console.error(`[GamesRouter] /:id error for ${req.params.id}:`, err);
    return res.status(500).json({ error: 'Ошибка получения данных игры' });
  }
});
