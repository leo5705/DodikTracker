import {
  MediaProvider,
  MediaSearchResult,
  ProviderHealthResult,
  MediaDetailExtended,
  MediaCastMember,
  MediaCrewMember,
  MediaVideoItem,
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

  async search(
    queryText: string,
    _credentials?: Record<string, any>,
    page: number = 1,
    limit: number = 20,
    filters?: import('./types.ts').UnifiedSearchFilters
  ): Promise<import('./types.ts').PaginatedResult<MediaSearchResult>> {
    try {
      const gql = `
        query (
          $search: String,
          $type: MediaType,
          $format_in: [MediaFormat],
          $status: MediaStatus,
          $genre_in: [String],
          $season: MediaSeason,
          $seasonYear: Int,
          $startDate_greater: FuzzyDateInt,
          $startDate_lesser: FuzzyDateInt,
          $averageScore_greater: Int,
          $averageScore_lesser: Int,
          $episodes_greater: Int,
          $episodes_lesser: Int,
          $countryOfOrigin: CountryCode,
          $sort: [MediaSort],
          $page: Int,
          $perPage: Int
        ) {
          Page(page: $page, perPage: $perPage) {
            pageInfo {
              hasNextPage
              total
              currentPage
            }
            media(
              search: $search,
              type: $type,
              format_in: $format_in,
              status: $status,
              genre_in: $genre_in,
              season: $season,
              seasonYear: $seasonYear,
              startDate_greater: $startDate_greater,
              startDate_lesser: $startDate_lesser,
              averageScore_greater: $averageScore_greater,
              averageScore_lesser: $averageScore_lesser,
              episodes_greater: $episodes_greater,
              episodes_lesser: $episodes_lesser,
              countryOfOrigin: $countryOfOrigin,
              sort: $sort
            ) {
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

      const variables: Record<string, any> = {
        page,
        perPage: limit,
      };

      const trimmedQ = (queryText || '').trim();
      if (trimmedQ) {
        variables.search = trimmedQ;
      }

      // Type
      const targetType = filters?.type === 'MANGA' || filters?.category === 'MANGA' ? 'MANGA' : 'ANIME';
      variables.type = targetType;

      // Format (TV, MOVIE, OVA, ONA, SPECIAL, MANGA)
      if (filters?.animeFormat) {
        variables.format_in = [filters.animeFormat.toUpperCase()];
      }

      // Status
      if (filters?.status) {
        const s = filters.status.toUpperCase();
        if (s === 'RELEASING' || s === 'ONGOING') variables.status = 'RELEASING';
        else if (s === 'FINISHED' || s === 'ENDED') variables.status = 'FINISHED';
        else if (s === 'NOT_YET_RELEASED' || s === 'ANNOUNCED') variables.status = 'NOT_YET_RELEASED';
        else if (s === 'CANCELLED') variables.status = 'CANCELLED';
      }

      // Genres
      if (filters?.genres && filters.genres.length > 0) {
        variables.genre_in = filters.genres;
      }

      // Season & Year
      if (filters?.season) {
        variables.season = filters.season.toUpperCase();
      }
      if (filters?.seasonYear) {
        variables.seasonYear = filters.seasonYear;
      }

      // Year range
      if (filters?.year) {
        variables.startDate_greater = filters.year * 10000;
        variables.startDate_lesser = (filters.year + 1) * 10000;
      } else {
        if (filters?.yearFrom) variables.startDate_greater = filters.yearFrom * 10000;
        if (filters?.yearTo) variables.startDate_lesser = (filters.yearTo + 1) * 10000;
      }

      // Rating (AniList uses 0-100)
      if (filters?.ratingFrom !== undefined) variables.averageScore_greater = Math.round(filters.ratingFrom * 10);
      if (filters?.ratingTo !== undefined) variables.averageScore_lesser = Math.round(filters.ratingTo * 10);

      // Episodes
      if (filters?.episodesFrom !== undefined) variables.episodes_greater = filters.episodesFrom;
      if (filters?.episodesTo !== undefined) variables.episodes_lesser = filters.episodesTo;

      // Country (JP, KR, CN, TW)
      if (filters?.countries && filters.countries.length > 0) {
        const c = filters.countries[0].toUpperCase();
        if (['JP', 'KR', 'CN', 'TW'].includes(c)) {
          variables.countryOfOrigin = c;
        }
      }

      // Sort
      if (filters?.sortBy === 'rating') {
        variables.sort = filters.sortOrder === 'asc' ? ['SCORE'] : ['SCORE_DESC'];
      } else if (filters?.sortBy === 'popularity') {
        variables.sort = filters.sortOrder === 'asc' ? ['POPULARITY'] : ['POPULARITY_DESC'];
      } else if (filters?.sortBy === 'release_date') {
        variables.sort = filters.sortOrder === 'asc' ? ['START_DATE'] : ['START_DATE_DESC'];
      } else if (filters?.sortBy === 'title') {
        variables.sort = ['TITLE_ROMAJI'];
      } else if (!trimmedQ) {
        variables.sort = ['TRENDING_DESC', 'POPULARITY_DESC'];
      }

      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: gql, variables }),
      });

      if (!res.ok) return { results: [], hasMore: false, page };
      const json = await res.json();
      const mediaList = json.data?.Page?.media || [];
      const pageInfo = json.data?.Page?.pageInfo;
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

      return {
        results,
        hasMore: pageInfo?.hasNextPage ?? (results.length >= limit),
        page,
        total: pageInfo?.total,
      };
    } catch (err) {
      console.error('AniList search error:', err);
      return { results: [], hasMore: false, page };
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
            isAdult
            countryOfOrigin
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
            trailer {
              id
              site
              thumbnail
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

      // Trailer & Video
      const videos: MediaVideoItem[] = [];
      let trailerUrl: string | undefined;

      if (m.trailer && m.trailer.id) {
        const tId = String(m.trailer.id).trim();
        const site = (m.trailer.site || '').toLowerCase() === 'dailymotion' ? 'Dailymotion' : 'YouTube';
        const url = site === 'YouTube' ? `https://www.youtube.com/watch?v=${tId}` : `https://www.dailymotion.com/video/${tId}`;
        const embedUrl = site === 'YouTube'
          ? `https://www.youtube-nocookie.com/embed/${tId}?autoplay=1&rel=0`
          : `https://www.dailymotion.com/embed/video/${tId}?autoplay=1`;
        const thumbnail = m.trailer.thumbnail || (site === 'YouTube' ? `https://img.youtube.com/vi/${tId}/hqdefault.jpg` : undefined);

        trailerUrl = url;
        videos.push({
          id: tId,
          title: 'Официальный промо-ролик (PV) / Трейлер',
          url,
          embedUrl,
          site,
          key: tId,
          type: 'Trailer',
          thumbnailUrl: thumbnail,
          official: true,
        });
      }

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
        ageRating: m.isAdult ? '18+' : undefined,
        totalEpisodes: m.episodes || m.chapters || undefined,
        cast,
        crew,
        directors: directors.length > 0 ? directors : undefined,
        studios: studios.length > 0 ? studios : undefined,
        videos: videos.length > 0 ? videos : undefined,
        trailerUrl,
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

  async getTrending(
    type: string = 'ANIME',
    _credentials?: Record<string, any>,
    page: number = 1,
    limit: number = 20,
    filters?: import('./types.ts').UnifiedSearchFilters
  ): Promise<import('./types.ts').PaginatedResult<MediaSearchResult>> {
    return this.search('', _credentials, page, limit, { ...filters, type });
  }
}
