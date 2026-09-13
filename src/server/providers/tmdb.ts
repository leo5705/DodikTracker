import {
  MediaProvider,
  MediaSearchResult,
  ProviderHealthResult,
  MediaDetailExtended,
  MediaCastMember,
  MediaCrewMember,
  MediaSeasonInfo,
  SimilarMediaItem,
} from './types.ts';

export class TMDBProvider implements MediaProvider {
  name = 'TMDB';
  supportedTypes = ['MOVIE', 'TV'];
  requiresKey = true;

  async healthCheck(credentials?: Record<string, any>): Promise<ProviderHealthResult> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) {
      return { ok: false, latencyMs: 0, error: 'API ключ не настроен' };
    }

    const start = Date.now();
    try {
      const res = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=ru-RU&page=1`);
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return {
          ok: false,
          latencyMs,
          error: errorData.status_message || `HTTP ${res.status}: Ошибка проверки ключа TMDB`,
        };
      }
      return { ok: true, latencyMs, details: 'Подключение успешно установлено' };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message || 'Ошибка сети' };
    }
  }

  async search(query: string, credentials?: Record<string, any>, page: number = 1): Promise<import("./types.js").PaginatedResult<MediaSearchResult> | MediaSearchResult[]> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return [];

    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=ru-RU&include_adult=false&page=${page}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      const results: MediaSearchResult[] = [];

      for (const item of (data.results || [])) {
        if (item.media_type !== 'movie' && item.media_type !== 'tv') continue;
        const isMovie = item.media_type === 'movie';
        const title = isMovie ? (item.title || item.original_title) : (item.name || item.original_name);
        const originalTitle = isMovie ? item.original_title : item.original_name;
        const releaseDate = isMovie ? item.release_date : item.first_air_date;
        const year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : undefined;
        const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined;
        const backdropUrl = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : undefined;

        results.push({
          provider: 'TMDB',
          externalId: String(item.id),
          type: isMovie ? 'MOVIE' : 'TV',
          title: title || 'Без названия',
          originalTitle,
          description: item.overview || undefined,
          posterUrl,
          backdropUrl,
          releaseDate,
          year,
          rating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined,
          genres: item.genre_ids ? [] : undefined,
        });
      }

      return results;
    } catch (err) {
      console.error('TMDB search error:', err);
      return [];
    }
  }

  async getDetails(
    externalId: string,
    type: string = 'MOVIE',
    credentials?: Record<string, any>
  ): Promise<(MediaSearchResult & MediaDetailExtended) | null> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return null;

    try {
      const isMovie = type.toUpperCase() !== 'TV';
      const endpoint = isMovie
        ? `https://api.themoviedb.org/3/movie/${externalId}?api_key=${apiKey}&language=ru-RU&append_to_response=credits,similar,release_dates`
        : `https://api.themoviedb.org/3/tv/${externalId}?api_key=${apiKey}&language=ru-RU&append_to_response=credits,similar,content_ratings`;

      const res = await fetch(endpoint);
      if (!res.ok) return null;
      let data = await res.json();

      // If Russian overview is missing, try fetching English description
      let description = data.overview;
      if (!description || !description.trim()) {
        try {
          const enRes = await fetch(
            isMovie
              ? `https://api.themoviedb.org/3/movie/${externalId}?api_key=${apiKey}&language=en-US`
              : `https://api.themoviedb.org/3/tv/${externalId}?api_key=${apiKey}&language=en-US`
          );
          if (enRes.ok) {
            const enData = await enRes.json();
            description = enData.overview || undefined;
          }
        } catch (_e) {}
      }

      const title = isMovie ? (data.title || data.original_title) : (data.name || data.original_name);
      const originalTitle = isMovie ? data.original_title : data.original_name;
      const releaseDate = isMovie ? data.release_date : data.first_air_date;
      const year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : undefined;
      const posterUrl = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : undefined;
      const backdropUrl = data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : undefined;
      const genres = (data.genres || []).map((g: any) => g.name);

      // Parse Cast
      const cast: MediaCastMember[] = (data.credits?.cast || []).slice(0, 24).map((c: any) => ({
        id: c.id,
        name: c.name,
        originalName: c.original_name,
        character: c.character,
        photoUrl: c.profile_path ? `https://image.tmdb.org/t/p/w276_and_h350_face${c.profile_path}` : undefined,
        order: c.order,
      }));

      // Parse Crew
      const rawCrew = data.credits?.crew || [];
      const directors = [...new Set(rawCrew.filter((c: any) => c.job === 'Director').map((c: any) => c.name))] as string[];
      const writers = [
        ...new Set(
          rawCrew
            .filter((c: any) => c.job === 'Screenplay' || c.department === 'Writing' || c.job === 'Writer' || c.job === 'Story')
            .map((c: any) => c.name)
        ),
      ] as string[];
      const producers = [
        ...new Set(
          rawCrew
            .filter((c: any) => c.job === 'Producer' || c.job === 'Executive Producer')
            .map((c: any) => c.name)
        ),
      ] as string[];
      const cinematographers = [
        ...new Set(
          rawCrew
            .filter((c: any) => c.job === 'Director of Photography' || c.job === 'Cinematography')
            .map((c: any) => c.name)
        ),
      ] as string[];
      const composers = [
        ...new Set(
          rawCrew
            .filter((c: any) => c.job === 'Original Music Composer' || c.job === 'Music')
            .map((c: any) => c.name)
        ),
      ] as string[];
      const editors = [
        ...new Set(rawCrew.filter((c: any) => c.job === 'Editor').map((c: any) => c.name)),
      ] as string[];

      const crew: MediaCrewMember[] = [];
      const addedKeys = new Set<string>();
      const priorityJobs = ['Director', 'Screenplay', 'Writer', 'Producer', 'Executive Producer', 'Director of Photography', 'Original Music Composer', 'Editor'];

      for (const c of rawCrew) {
        if (priorityJobs.includes(c.job) && !addedKeys.has(`${c.name}_${c.job}`)) {
          addedKeys.add(`${c.name}_${c.job}`);
          let role = c.job;
          if (c.job === 'Director') role = 'Режиссёр';
          else if (c.job === 'Screenplay' || c.job === 'Writer') role = 'Сценарист';
          else if (c.job === 'Producer') role = 'Продюсер';
          else if (c.job === 'Executive Producer') role = 'Исполнительный продюсер';
          else if (c.job === 'Director of Photography') role = 'Оператор';
          else if (c.job === 'Original Music Composer' || c.job === 'Music') role = 'Композитор';
          else if (c.job === 'Editor') role = 'Монтаж';

          crew.push({
            id: c.id,
            name: c.name,
            role,
            department: c.department,
            photoUrl: c.profile_path ? `https://image.tmdb.org/t/p/w276_and_h350_face${c.profile_path}` : undefined,
          });
        }
      }

      // Age Rating
      let ageRating: string | undefined;
      if (isMovie && data.release_dates?.results) {
        const ruRelease = data.release_dates.results.find((r: any) => r.iso_3166_1 === 'RU');
        const usRelease = data.release_dates.results.find((r: any) => r.iso_3166_1 === 'US');
        const rel = ruRelease || usRelease;
        if (rel?.release_dates?.[0]?.certification) {
          ageRating = rel.release_dates[0].certification;
        }
      } else if (!isMovie && data.content_ratings?.results) {
        const ruRating = data.content_ratings.results.find((r: any) => r.iso_3166_1 === 'RU');
        const usRating = data.content_ratings.results.find((r: any) => r.iso_3166_1 === 'US');
        const r = ruRating || usRating;
        if (r?.rating) {
          ageRating = r.rating;
        }
      }

      // Status
      const statusMap: Record<string, string> = {
        Released: 'Выпущен',
        Ended: 'Завершён',
        'Returning Series': 'В онгоинге',
        'In Production': 'В производстве',
        'Post Production': 'Пост-продакшн',
        Canceled: 'Закрыт',
        Planned: 'Запланирован',
      };
      const statusText = statusMap[data.status] || data.status;

      // Countries
      const countries = (data.production_countries || []).map((c: any) => c.name);

      // TV-specific details
      const creators = !isMovie ? (data.created_by || []).map((c: any) => c.name) : undefined;
      const networks = !isMovie ? (data.networks || []).map((n: any) => n.name) : undefined;
      const seasons: MediaSeasonInfo[] | undefined = !isMovie
        ? (data.seasons || []).map((s: any) => ({
            seasonNumber: s.season_number,
            title: s.name,
            episodeCount: s.episode_count,
            airDate: s.air_date,
            posterUrl: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : undefined,
            overview: s.overview || undefined,
          }))
        : undefined;

      // Similar
      const similar: SimilarMediaItem[] = (data.similar?.results || []).slice(0, 10).map((s: any) => {
        const sDate = isMovie ? s.release_date : s.first_air_date;
        return {
          externalId: String(s.id),
          provider: 'TMDB',
          type: isMovie ? 'MOVIE' : 'TV',
          title: isMovie ? (s.title || s.original_title) : (s.name || s.original_name),
          originalTitle: isMovie ? s.original_title : s.original_name,
          posterUrl: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : undefined,
          year: sDate ? parseInt(sDate.split('-')[0], 10) : undefined,
          rating: s.vote_average ? Math.round(s.vote_average * 10) / 10 : undefined,
        };
      });

      return {
        provider: 'TMDB',
        externalId: String(data.id),
        type: isMovie ? 'MOVIE' : 'TV',
        title: title || 'Без названия',
        originalTitle,
        description,
        posterUrl,
        backdropUrl,
        releaseDate,
        year,
        genres,
        rating: data.vote_average ? Math.round(data.vote_average * 10) / 10 : undefined,
        totalSeasons: seasons?.length,
        totalEpisodes: data.number_of_episodes,
        cast,
        crew,
        directors: directors.length > 0 ? directors : undefined,
        writers: writers.length > 0 ? writers : undefined,
        producers: producers.length > 0 ? producers : undefined,
        cinematographers: cinematographers.length > 0 ? cinematographers : undefined,
        composers: composers.length > 0 ? composers : undefined,
        editors: editors.length > 0 ? editors : undefined,
        creators: creators && creators.length > 0 ? creators : undefined,
        networks: networks && networks.length > 0 ? networks : undefined,
        seasons,
        ageRating,
        statusText,
        countries,
        runtimeMinutes: isMovie ? data.runtime : data.episode_run_time?.[0],
        similar,
        website: data.homepage || undefined,
      };
    } catch (err) {
      console.error('TMDB getDetails error:', err);
      return null;
    }
  }

  async getTrending(type: string = "MOVIE", credentials?: Record<string, any>, page: number = 1): Promise<import("./types.js").PaginatedResult<MediaSearchResult> | MediaSearchResult[]> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return [];

    try {
      const mediaType = type === 'TV' ? 'tv' : 'movie';
      const res = await fetch(`https://api.themoviedb.org/3/trending/${mediaType}/week?api_key=${apiKey}&language=ru-RU&page=${page}`);
      if (!res.ok) return [];
      const data = await res.json();
      const results: MediaSearchResult[] = [];

      for (const item of (data.results || [])) {
        const isMovie = mediaType === 'movie';
        const title = isMovie ? (item.title || item.original_title) : (item.name || item.original_name);
        const originalTitle = isMovie ? item.original_title : item.original_name;
        const releaseDate = isMovie ? item.release_date : item.first_air_date;
        const year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : undefined;
        const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined;
        const backdropUrl = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : undefined;

        results.push({
          provider: 'TMDB',
          externalId: String(item.id),
          type: isMovie ? 'MOVIE' : 'TV',
          title: title || 'Без названия',
          originalTitle,
          description: item.overview || undefined,
          posterUrl,
          backdropUrl,
          releaseDate,
          year,
          rating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined,
        });
      }

      return results;
    } catch (err) {
      console.error('TMDB trending error:', err);
      return [];
    }
  }
}
