import {
  MediaProvider,
  MediaSearchResult,
  ProviderHealthResult,
  MediaDetailExtended,
  MediaCastMember,
  MediaCrewMember,
  SimilarMediaItem,
} from './types.ts';

export class AniListProvider implements MediaProvider {
  name = 'AniList';
  supportedTypes = ['ANIME', 'MANGA'];
  requiresKey = false;

  async healthCheck(_credentials?: Record<string, any>): Promise<ProviderHealthResult> {
    const start = Date.now();
    try {
      const query = `
        query {
          Page(page: 1, perPage: 1) {
            media(type: ANIME) {
              id
              title {
                romaji
              }
            }
          }
        }
      `;
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}: Ошибка AniList GraphQL` };
      }
      return { ok: true, latencyMs, details: 'AniList GraphQL API доступен' };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message || 'Сетевая ошибка' };
    }
  }

  async search(queryText: string, _credentials?: Record<string, any>): Promise<MediaSearchResult[]> {
    try {
      const gql = `
        query ($search: String) {
          Page(page: 1, perPage: 15) {
            media(search: $search) {
              id
              type
              title {
                romaji
                english
                native
              }
              description(asHtml: false)
              coverImage {
                large
                extraLarge
              }
              bannerImage
              startDate {
                year
              }
              episodes
              chapters
              averageScore
              genres
            }
          }
        }
      `;

      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: gql, variables: { search: queryText } }),
      });

      if (!res.ok) return [];
      const json = await res.json();
      const mediaList = json.data?.Page?.media || [];
      const results: MediaSearchResult[] = [];

      for (const item of mediaList) {
        const title = item.title.english || item.title.romaji || item.title.native || 'Без названия';
        const isManga = item.type === 'MANGA';
        results.push({
          provider: 'AniList',
          externalId: String(item.id),
          type: isManga ? 'MANGA' : 'ANIME',
          title,
          originalTitle: item.title.native || item.title.romaji,
          description: item.description ? item.description.replace(/<[^>]*>/g, '') : undefined,
          posterUrl: item.coverImage?.extraLarge || item.coverImage?.large,
          backdropUrl: item.bannerImage || undefined,
          year: item.startDate?.year || undefined,
          rating: item.averageScore ? Math.round(item.averageScore / 10 * 10) / 10 : undefined,
          totalEpisodes: item.episodes || item.chapters || undefined,
          genres: item.genres || [],
        });
      }

      return results;
    } catch (err) {
      console.error('AniList search error:', err);
      return [];
    }
  }

  async getDetails(
    externalId: string,
    _type?: string,
    _credentials?: Record<string, any>
  ): Promise<(MediaSearchResult & MediaDetailExtended) | null> {
    try {
      const numId = parseInt(externalId, 10);
      if (isNaN(numId)) return null;

      const gql = `
        query ($id: Int) {
          Media(id: $id) {
            id
            type
            title {
              romaji
              english
              native
            }
            description(asHtml: false)
            format
            status
            episodes
            duration
            chapters
            volumes
            season
            seasonYear
            source
            genres
            averageScore
            meanScore
            coverImage {
              large
              extraLarge
            }
            bannerImage
            startDate {
              year
              month
              day
            }
            studios(isMain: true) {
              nodes {
                name
                isAnimationStudio
              }
            }
            characters(sort: [ROLE, RELEVANCE], perPage: 20) {
              edges {
                role
                node {
                  id
                  name {
                    full
                    native
                  }
                  image {
                    large
                  }
                }
                voiceActors(language: JAPANESE) {
                  id
                  name {
                    full
                    native
                  }
                  image {
                    large
                  }
                }
              }
            }
            staff(perPage: 15) {
              edges {
                role
                node {
                  id
                  name {
                    full
                    native
                  }
                  image {
                    large
                  }
                }
              }
            }
            recommendations(perPage: 8, sort: RATING_DESC) {
              nodes {
                mediaRecommendation {
                  id
                  type
                  title {
                    romaji
                    english
                  }
                  coverImage {
                    large
                  }
                  averageScore
                  startDate {
                    year
                  }
                }
              }
            }
          }
        }
      `;

      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: gql, variables: { id: numId } }),
      });

      if (!res.ok) return null;
      const json = await res.json();
      const m = json.data?.Media;
      if (!m) return null;

      const isManga = m.type === 'MANGA';
      const title = m.title.english || m.title.romaji || m.title.native || 'Без названия';
      const originalTitle = m.title.native || m.title.romaji;
      const cleanDesc = m.description ? m.description.replace(/<[^>]*>/g, '') : undefined;
      const posterUrl = m.coverImage?.extraLarge || m.coverImage?.large;
      const backdropUrl = m.bannerImage || undefined;

      // Status translation
      const statusMap: Record<string, string> = {
        FINISHED: 'Завершён',
        RELEASING: 'Онгоинг',
        NOT_YET_RELEASED: 'Анонс',
        CANCELLED: 'Отменён',
        HIATUS: 'Приостановлен',
      };
      const statusText = statusMap[m.status] || m.status;

      // Source translation
      const sourceMap: Record<string, string> = {
        ORIGINAL: 'Оригинал',
        MANGA: 'Манга',
        LIGHT_NOVEL: 'Ранобэ',
        VISUAL_NOVEL: 'Визуальная новелла',
        VIDEO_GAME: 'Видеоигра',
        OTHER: 'Другое',
        NOVEL: 'Новелла',
        DOUJINSHI: 'Додзинси',
        ANIME: 'Аниме',
      };
      const sourceText = sourceMap[m.source] || m.source;

      // Cast
      const cast: MediaCastMember[] = (m.characters?.edges || []).map((edge: any) => {
        const char = edge.node;
        const va = edge.voiceActors?.[0];
        return {
          id: char.id,
          name: char.name.full,
          originalName: char.name.native,
          character: edge.role === 'MAIN' ? 'Главный герой' : 'Второстепенный персонаж',
          photoUrl: char.image?.large,
          voiceActorName: va?.name?.full,
          voiceActorPhoto: va?.image?.large,
        };
      });

      // Staff (Crew)
      const crew: MediaCrewMember[] = (m.staff?.edges || []).map((edge: any) => ({
        id: edge.node.id,
        name: edge.node.name.full,
        role: edge.role,
        photoUrl: edge.node.image?.large,
      }));

      const directors = (m.staff?.edges || [])
        .filter((e: any) => e.role && e.role.toLowerCase().includes('director'))
        .map((e: any) => e.node.name.full);

      // Studios
      const studios = (m.studios?.nodes || []).map((s: any) => s.name);

      // Critic Score (AniList mean or average score)
      const criticScore = (m.meanScore || m.averageScore)
        ? {
            source: 'AniList Score',
            score: m.meanScore || m.averageScore,
            max: 100,
          }
        : null;

      // Similar
      const similar: SimilarMediaItem[] = (m.recommendations?.nodes || [])
        .filter((n: any) => n.mediaRecommendation)
        .map((n: any) => {
          const rec = n.mediaRecommendation;
          return {
            externalId: String(rec.id),
            provider: 'AniList',
            type: rec.type === 'MANGA' ? 'MANGA' : 'ANIME',
            title: rec.title.english || rec.title.romaji || 'Без названия',
            originalTitle: rec.title.romaji,
            posterUrl: rec.coverImage?.large,
            year: rec.startDate?.year,
            rating: rec.averageScore ? Math.round(rec.averageScore / 10 * 10) / 10 : undefined,
          };
        });

      return {
        provider: 'AniList',
        externalId: String(m.id),
        type: isManga ? 'MANGA' : 'ANIME',
        title,
        originalTitle,
        description: cleanDesc,
        posterUrl,
        backdropUrl,
        year: m.startDate?.year || m.seasonYear || undefined,
        genres: m.genres || [],
        rating: m.averageScore ? Math.round(m.averageScore / 10 * 10) / 10 : undefined,
        totalEpisodes: m.episodes || m.chapters || undefined,
        cast,
        crew,
        directors: directors.length > 0 ? directors : undefined,
        studios: studios.length > 0 ? studios : undefined,
        criticScore,
        statusText,
        sourceText,
        runtimeMinutes: m.duration || undefined,
        durationText: m.duration ? `${m.duration} мин.` : undefined,
        episodesCount: m.episodes || m.chapters || undefined,
        similar,
      };
    } catch (err) {
      console.error('AniList getDetails error:', err);
      return null;
    }
  }

  async getTrending(type: string = 'ANIME', _credentials?: Record<string, any>): Promise<MediaSearchResult[]> {
    try {
      const gql = `
        query ($type: MediaType) {
          Page(page: 1, perPage: 12) {
            media(type: $type, sort: TRENDING_DESC) {
              id
              type
              title {
                romaji
                english
                native
              }
              description(asHtml: false)
              coverImage {
                large
              }
              bannerImage
              startDate {
                year
              }
              episodes
              chapters
              averageScore
              genres
            }
          }
        }
      `;

      const mediaType = type === 'MANGA' ? 'MANGA' : 'ANIME';
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: gql, variables: { type: mediaType } }),
      });

      if (!res.ok) return [];
      const json = await res.json();
      const mediaList = json.data?.Page?.media || [];
      const results: MediaSearchResult[] = [];

      for (const item of mediaList) {
        const title = item.title.english || item.title.romaji || item.title.native || 'Без названия';
        const isManga = item.type === 'MANGA';
        results.push({
          provider: 'AniList',
          externalId: String(item.id),
          type: isManga ? 'MANGA' : 'ANIME',
          title,
          originalTitle: item.title.native || item.title.romaji,
          description: item.description ? item.description.replace(/<[^>]*>/g, '') : undefined,
          posterUrl: item.coverImage?.large,
          backdropUrl: item.bannerImage || undefined,
          year: item.startDate?.year || undefined,
          rating: item.averageScore ? Math.round(item.averageScore / 10 * 10) / 10 : undefined,
          totalEpisodes: item.episodes || item.chapters || undefined,
          genres: item.genres || [],
        });
      }

      return results;
    } catch (err) {
      console.error('AniList trending error:', err);
      return [];
    }
  }
}
