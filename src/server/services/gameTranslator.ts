import { db } from '../../db/index.ts';
import { gameTranslations } from '../../db/schema.ts';
import { eq, and, or } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';

export interface GameTranslationResult {
  title: string;
  originalTitle: string;
  description?: string;
  genres: string[];
  tags: string[];
  source: 'OFFICIAL' | 'GEMINI' | 'DICTIONARY' | 'CACHED';
}

const GENRE_MAP: Record<string, string> = {
  action: 'Экшен',
  adventure: 'Приключения',
  'role-playing (rpg)': 'Ролевая игра (RPG)',
  'role-playing games (rpg)': 'Ролевая игра (RPG)',
  rpg: 'Ролевая игра (RPG)',
  shooter: 'Шутер',
  fps: 'Шутер от первого лица',
  tps: 'Шутер от третьего лица',
  strategy: 'Стратегия',
  'real-time strategy (rts)': 'RTS / Стратегия в реальном времени',
  rts: 'RTS / Стратегия в реальном времени',
  'turn-based strategy (tbs)': 'Пошаговая стратегия',
  tbs: 'Пошаговая стратегия',
  simulation: 'Симулятор',
  puzzle: 'Головоломка',
  racing: 'Гонки',
  sports: 'Спорт',
  platformer: 'Платформер',
  fighting: 'Файтинг',
  'survival horror': 'Выживание / Хоррор',
  horror: 'Хоррор',
  survival: 'Выживание',
  stealth: 'Стелс',
  sandbox: 'Песочница',
  roguelike: 'Рогалик',
  roguelite: 'Роглайт',
  'open world': 'Открытый мир',
  mmo: 'ММО',
  mmorpg: 'ММОРПГ',
  indie: 'Инди',
  arcade: 'Аркада',
  tactical: 'Тактика',
  'hack and slash': 'Слэшер',
  'hack and slash/beat \'em up': 'Слэшер / Beat \'em up',
  'point-and-click': 'Квест / Point-and-Click',
  'visual novel': 'Визуальная новелла',
  card: 'Карточная игра',
  'board games': 'Настольная игра',
  educational: 'Обучающая игра',
  family: 'Семейная игра',
  casual: 'Казуальная игра',
  music: 'Музыкальная игра',
};

const WELL_KNOWN_TITLES_RU: Record<string, string> = {
  'the witcher 3: wild hunt': 'Ведьмак 3: Дикая Охота',
  'the witcher 2: assassins of kings': 'Ведьмак 2: Убийцы королей',
  'the witcher': 'Ведьмак',
  'the elder scrolls v: skyrim': 'The Elder Scrolls V: Skyrim',
  'grand theft auto v': 'Grand Theft Auto V',
  'red dead redemption 2': 'Red Dead Redemption 2',
  'cyberpunk 2077': 'Cyberpunk 2077',
  'half-life 2': 'Half-Life 2',
  'half-life': 'Half-Life',
  'portal 2': 'Portal 2',
  'portal': 'Portal',
  'god of war': 'God of War',
  'god of war ragnarök': 'God of War: Рагнарёк',
  'the last of us part i': 'Одни из нас: Часть 1',
  'the last of us part ii': 'Одни из нас: Часть 2',
  'the last of us': 'Одни из нас',
  'horizon zero dawn': 'Horizon Zero Dawn',
  'horizon forbidden west': 'Horizon Запретный Запад',
  'bloodborne': 'Bloodborne',
  'elden ring': 'Elden Ring',
  'dark souls': 'Dark Souls',
  'dark souls iii': 'Dark Souls III',
  'fallout: new vegas': 'Fallout: New Vegas',
  'fallout 4': 'Fallout 4',
  's.t.a.l.k.e.r.: shadow of chernobyl': 'S.T.A.L.K.E.R.: Тень Чернобыля',
  's.t.a.l.k.e.r. 2: heart of chornobyl': 'S.T.A.L.K.E.R. 2: Сердце Чернобыля',
  'metro 2033': 'Метро 2033',
  'metro: last light': 'Метро: Луч надежды',
  'metro exodus': 'Метро: Исход',
  'mass effect 2': 'Mass Effect 2',
  'mass effect': 'Mass Effect',
  'tomb raider': 'Tomb Raider',
  'rise of the tomb raider': 'Rise of the Tomb Raider',
  'shadow of the tomb raider': 'Shadow of the Tomb Raider',
  'bioshock infinite': 'BioShock Infinite',
  'bioshock': 'BioShock',
  'deus ex: human revolution': 'Deus Ex: Human Revolution',
  'resident evil 4': 'Resident Evil 4',
  'resident evil 2': 'Resident Evil 2',
  'resident evil 7: biohazard': 'Resident Evil 7: Biohazard',
  'resident evil village': 'Resident Evil Village',
  'silent hill 2': 'Silent Hill 2',
  'disco elysium': 'Disco Elysium',
  'hollow knight': 'Hollow Knight',
  'death stranding': 'Death Stranding',
  'baldur\'s gate 3': 'Baldur\'s Gate 3',
  'baldurs gate 3': 'Baldur\'s Gate 3',
  'divinity: original sin 2': 'Divinity: Original Sin 2',
  'control': 'Control',
  'alan wake 2': 'Alan Wake 2',
  'alan wake': 'Alan Wake',
  'life is strange': 'Life is Strange',
  'detroit: become human': 'Detroit: Стать человеком',
  'heavy rain': 'Heavy Rain',
  'beyond: two souls': 'За гранью: Две души',
  'until dawn': 'Дожить до рассвета',
};

// In-memory LRU cache to avoid repeated DB/API hits within session
const memoryCache = new Map<string, { data: GameTranslationResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

function containsCyrillic(str?: string | null): boolean {
  if (!str) return false;
  return /[\u0400-\u04FF]/.test(str);
}

export class GameTranslator {
  /**
   * Translates genres using dictionary
   */
  static translateGenres(genres?: string[]): string[] {
    if (!genres || genres.length === 0) return [];
    return genres.map((g) => {
      const key = g.toLowerCase().trim();
      return GENRE_MAP[key] || g;
    });
  }

  /**
   * Translates single title quickly if in dictionary
   */
  static translateTitleOnly(rawTitle: string): string {
    if (!rawTitle) return rawTitle;
    const clean = rawTitle.toLowerCase().trim();
    if (WELL_KNOWN_TITLES_RU[clean]) {
      return WELL_KNOWN_TITLES_RU[clean];
    }
    return rawTitle;
  }

  /**
   * Translates tags safely
   */
  static translateTags(tags?: string[]): string[] {
    if (!tags || tags.length === 0) return [];
    return tags.map((t) => {
      const key = t.toLowerCase().trim();
      if (GENRE_MAP[key]) return GENRE_MAP[key];
      if (key === 'singleplayer' || key === 'single-player') return 'Для одного игрока';
      if (key === 'multiplayer' || key === 'multi-player') return 'Многопользовательская';
      if (key === 'co-op' || key === 'cooperative') return 'Кооператив';
      if (key === 'online co-op') return 'Сетевой кооператив';
      if (key === 'atmospheric') return 'Атмосферная';
      if (key === 'great soundtrack') return 'Отличный саундтрек';
      if (key === 'story rich') return 'Глубокий сюжет';
      if (key === 'difficult') return 'Сложная';
      if (key === 'scifi' || key === 'sci-fi') return 'Научная фантастика';
      if (key === 'fantasy') return 'Фэнтези';
      if (key === 'cyberpunk') return 'Киберпанк';
      if (key === 'post-apocalyptic') return 'Постапокалипсис';
      if (key === 'first-person') return 'От первого лица';
      if (key === 'third person') return 'От третьего лица';
      return t;
    });
  }

  /**
   * Main entry point for translating a game
   */
  static async translateGame(params: {
    provider: string;
    externalId: string;
    title: string;
    description?: string;
    genres?: string[];
    tags?: string[];
    alternates?: string[];
  }): Promise<GameTranslationResult> {
    const { provider, externalId, title, description, alternates } = params;
    const rawGenres = params.genres || [];
    const rawTags = params.tags || [];

    const cacheKey = `${provider.toUpperCase()}_${externalId}`;
    const titleKey = `TITLE_${title.toLowerCase().trim()}`;

    // 1. Check in-memory cache
    const mem = memoryCache.get(cacheKey) || memoryCache.get(titleKey);
    if (mem && Date.now() < mem.expiresAt) {
      return mem.data;
    }

    // 2. Check Cloud SQL DB persistent cache
    try {
      const dbRows = await db
        .select()
        .from(gameTranslations)
        .where(
          or(
            and(
              eq(gameTranslations.provider, provider.toUpperCase()),
              eq(gameTranslations.externalId, String(externalId))
            ),
            eq(gameTranslations.titleOriginal, title.trim())
          )
        )
        .limit(1);

      if (dbRows.length > 0) {
        const row = dbRows[0];
        const parsedGenres = row.genresRu ? JSON.parse(row.genresRu) : GameTranslator.translateGenres(rawGenres);
        const parsedTags = row.tagsRu ? JSON.parse(row.tagsRu) : GameTranslator.translateTags(rawTags);

        const result: GameTranslationResult = {
          title: row.titleRu || title,
          originalTitle: row.titleOriginal || title,
          description: row.descriptionRu || description,
          genres: parsedGenres,
          tags: parsedTags,
          source: 'CACHED',
        };

        memoryCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
        memoryCache.set(titleKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    } catch (err) {
      console.warn('[GameTranslator] DB lookup error:', err);
    }

    // 3. Priority 1: Check for official Russian title from alternates or provider
    let officialRussianTitle: string | null = null;
    if (containsCyrillic(title)) {
      officialRussianTitle = title;
    } else if (alternates && alternates.length > 0) {
      const cyrillicAlt = alternates.find((alt) => containsCyrillic(alt));
      if (cyrillicAlt) {
        officialRussianTitle = cyrillicAlt.trim();
      }
    }

    // Check well-known titles map
    const lowerTitle = title.toLowerCase().trim();
    if (!officialRussianTitle && WELL_KNOWN_TITLES_RU[lowerTitle]) {
      officialRussianTitle = WELL_KNOWN_TITLES_RU[lowerTitle];
    }

    const dictGenres = GameTranslator.translateGenres(rawGenres);
    const dictTags = GameTranslator.translateTags(rawTags);

    // If description is already Russian or missing, we don't need Gemini
    const isDescRussian = containsCyrillic(description);
    if ((isDescRussian || !description) && officialRussianTitle) {
      const result: GameTranslationResult = {
        title: officialRussianTitle,
        originalTitle: title,
        description,
        genres: dictGenres,
        tags: dictTags,
        source: 'OFFICIAL',
      };
      await GameTranslator.persistTranslation(provider, externalId, title, result);
      return result;
    }

    // 4. Server-Side AI Translation Layer via Gemini
    const ai = getGeminiClient();
    if (ai && description && !isDescRussian) {
      try {
        const translated = await GameTranslator.callGeminiTranslator(ai, {
          title,
          officialRussianTitle,
          description,
          genres: dictGenres,
          tags: dictTags,
        });

        if (translated) {
          const result: GameTranslationResult = {
            title: officialRussianTitle || translated.titleRu || title,
            originalTitle: title,
            description: translated.descriptionRu || description,
            genres: translated.genresRu && translated.genresRu.length > 0 ? translated.genresRu : dictGenres,
            tags: translated.tagsRu && translated.tagsRu.length > 0 ? translated.tagsRu : dictTags,
            source: 'GEMINI',
          };

          await GameTranslator.persistTranslation(provider, externalId, title, result);
          return result;
        }
      } catch (err) {
        console.warn('[GameTranslator] Gemini translation call failed, using dictionary/original:', err);
      }
    }

    // Fallback: Dictionary / Official title with original description
    const fallbackResult: GameTranslationResult = {
      title: officialRussianTitle || title,
      originalTitle: title,
      description,
      genres: dictGenres,
      tags: dictTags,
      source: officialRussianTitle ? 'OFFICIAL' : 'DICTIONARY',
    };

    await GameTranslator.persistTranslation(provider, externalId, title, fallbackResult);
    return fallbackResult;
  }

  private static async callGeminiTranslator(
    ai: GoogleGenAI,
    payload: {
      title: string;
      officialRussianTitle: string | null;
      description: string;
      genres: string[];
      tags: string[];
    }
  ): Promise<{ titleRu?: string; descriptionRu?: string; genresRu?: string[]; tagsRu?: string[] } | null> {
    const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];

    const prompt = `You are a professional video game localizer.
Translate the following video game description into fluent, atmospheric, and natural Russian.

MANDATORY RULES:
1. Translate the synopsis/overview into Russian.
2. If the game has a standard official Russian title (like 'Ведьмак 3: Дикая Охота' for 'The Witcher 3: Wild Hunt'), provide it in titleRu. If it is commonly released under its English title (like 'Cyberpunk 2077', 'Elden Ring', 'Doom'), keep the English title.
3. NEVER translate developer names, publisher names, company names, person names, hardware brands, game engines, or console platforms. Keep them exactly as in the original (e.g. CD Projekt RED, Valve, Sony, PlayStation, PC remain untouched).
4. Return ONLY valid JSON with keys:
{
  "titleRu": "Russian or recognized title",
  "descriptionRu": "Translated Russian synopsis without HTML tags or promotional spam",
  "genresRu": ["genre 1 in Russian", "genre 2 in Russian"],
  "tagsRu": ["tag 1 in Russian", "tag 2 in Russian"]
}

Game Title: ${payload.title}
${payload.officialRussianTitle ? `Official Russian Title: ${payload.officialRussianTitle}` : ''}
Current Genres: ${JSON.stringify(payload.genres)}
Current Tags: ${JSON.stringify(payload.tags.slice(0, 10))}
Original Description:
${payload.description.slice(0, 3000)}`;

    for (const model of modelsToTry) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const text = res.text?.trim();
        if (text) {
          const parsed = JSON.parse(text);
          return parsed;
        }
      } catch (err: any) {
        console.warn(`[GameTranslator] Model ${model} returned error: ${err.message}. Trying next...`);
      }
    }

    return null;
  }

  private static async persistTranslation(
    provider: string,
    externalId: string,
    originalTitle: string,
    result: GameTranslationResult
  ) {
    const cacheKey = `${provider.toUpperCase()}_${externalId}`;
    const titleKey = `TITLE_${originalTitle.toLowerCase().trim()}`;

    // Store in memory cache
    memoryCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    memoryCache.set(titleKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });

    // Store in Cloud SQL DB
    try {
      await db.insert(gameTranslations).values({
        provider: provider.toUpperCase(),
        externalId: String(externalId),
        titleOriginal: originalTitle.trim(),
        titleRu: result.title,
        descriptionRu: result.description || null,
        genresRu: JSON.stringify(result.genres),
        tagsRu: JSON.stringify(result.tags),
        source: result.source,
      });
    } catch (err) {
      // Ignore unique constraint violation if inserted concurrently
    }
  }
}
