import {
  MediaProvider,
  MediaSearchResult,
  ProviderHealthResult,
  MediaDetailExtended,
  MediaCastMember,
  MediaCrewMember,
  MediaSeasonInfo,
  MediaVideoItem,
  SimilarMediaItem,
  UnifiedSearchFilters,
  PaginatedResult,
} from './types.ts';

const TMDB_GENRE_MAP: Record<string, number> = {
  боевик: 28,
  action: 28,
  приключения: 12,
  adventure: 12,
  анимация: 16,
  мультфильм: 16,
  animation: 16,
  комедия: 35,
  comedy: 35,
  криминал: 80,
  crime: 80,
  документальный: 99,
  documentary: 99,
  драма: 18,
  drama: 18,
  семейный: 10751,
  family: 10751,
  фэнтези: 14,
  fantasy: 14,
  история: 36,
  history: 36,
  ужасы: 27,
  horror: 27,
  музыка: 10402,
  music: 10402,
  детектив: 9648,
  mystery: 9648,
  мелодрама: 10749,
  romance: 10749,
  фантастика: 878,
  'sci-fi': 878,
  'science fiction': 878,
  триллер: 53,
  thriller: 53,
  военный: 10752,
  war: 10752,
  вестерн: 37,
  western: 37,
};

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

  async search(
    query: string,
    credentials?: Record<string, any>,
    page: number = 1,
    _limit: number = 20,
    filters?: UnifiedSearchFilters
  ): Promise<PaginatedResult<MediaSearchResult>> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return { results: [], hasMore: false, page };

    const trimmedQ = (query || '').trim();
    const hasFilters = Boolean(
      filters &&
        (filters.genres?.length ||
          filters.countries?.length ||
          filters.year ||
          filters.yearFrom ||
          filters.yearTo ||
          filters.ratingFrom ||
          filters.ratingTo ||
          filters.votesFrom ||
          filters.durationFrom ||
          filters.durationTo ||
          filters.sortBy ||
          filters.type)
    );

    try {
      let url: string;
      const targetType = filters?.type === 'TV' ? 'tv' : 'movie';

      // If no text query or discover is preferred because of deep criteria
      if (!trimmedQ && hasFilters) {
        url = this.buildDiscoverUrl(apiKey, targetType, page, filters!);
      } else if (trimmedQ) {
        // Multi search or specific type search
        if (filters?.type === 'TV') {
          url = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(trimmedQ)}&language=ru-RU&include_adult=false&page=${page}`;
        } else if (filters?.type === 'MOVIE') {
          url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(trimmedQ)}&language=ru-RU&include_adult=false&page=${page}`;
          if (filters?.year) url += `&primary_release_year=${filters.year}`;
        } else {
          url = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(trimmedQ)}&language=ru-RU&include_adult=false&page=${page}`;
        }
      } else {
        return { results: [], hasMore: false, page };
      }

      const res = await fetch(url);
      if (!res.ok) return { results: [], hasMore: false, page };
      const data = await res.json();
      let results: MediaSearchResult[] = [];

      for (const item of (data.results || [])) {
        if (item.media_type === 'person') continue;
        const isMovie = item.media_type ? item.media_type === 'movie' : targetType === 'movie';
        const title = isMovie ? (item.title || item.original_title) : (item.name || item.original_name);
        const originalTitle = isMovie ? item.original_title : item.original_name;
        const releaseDate = isMovie ? item.release_date : item.first_air_date;
        const year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : undefined;
        const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined;
        const backdropUrl = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : undefined;
        const rating = item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined;
        const voteCount = item.vote_count || 0;

        // Post-filter if search endpoint was used
        if (trimmedQ && filters) {
          if (filters.year && year !== filters.year) continue;
          if (filters.yearFrom && year && year < filters.yearFrom) continue;
          if (filters.yearTo && year && year > filters.yearTo) continue;
          if (filters.ratingFrom && rating !== undefined && rating < filters.ratingFrom) continue;
          if (filters.ratingTo && rating !== undefined && rating > filters.ratingTo) continue;
          if (filters.votesFrom && voteCount < filters.votesFrom) continue;
        }

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
          rating,
        });
      }

      const hasMore = (data.page || 1) < (data.total_pages || 1);
      return { results, hasMore, page: data.page || page, total: data.total_results };
    } catch (err) {
      console.error('TMDB search error:', err);
      return { results: [], hasMore: false, page };
    }
  }

  private buildDiscoverUrl(
    apiKey: string,
    type: 'movie' | 'tv',
    page: number,
    filters: UnifiedSearchFilters
  ): string {
    const params = new URLSearchParams({
      api_key: apiKey,
      language: 'ru-RU',
      include_adult: 'false',
      page: String(page),
    });

    // Genres
    if (filters.genres && filters.genres.length > 0) {
      const genreIds = filters.genres
        .map((g) => TMDB_GENRE_MAP[g.toLowerCase().trim()])
        .filter(Boolean);
      if (genreIds.length > 0) {
        params.set('with_genres', genreIds.join(','));
      }
    }

    // Country
    if (filters.countries && filters.countries.length > 0) {
      params.set('with_origin_country', filters.countries.join('|'));
    }

    // Years
    if (filters.year) {
      if (type === 'movie') params.set('primary_release_year', String(filters.year));
      else params.set('first_air_date_year', String(filters.year));
    } else {
      if (filters.yearFrom) {
        const key = type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
        params.set(key, `${filters.yearFrom}-01-01`);
      }
      if (filters.yearTo) {
        const key = type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
        params.set(key, `${filters.yearTo}-12-31`);
      }
    }

    // Rating & Votes
    if (filters.ratingFrom !== undefined) params.set('vote_average.gte', String(filters.ratingFrom));
    if (filters.ratingTo !== undefined) params.set('vote_average.lte', String(filters.ratingTo));
    if (filters.votesFrom !== undefined) params.set('vote_count.gte', String(filters.votesFrom));

    // Runtime
    if (type === 'movie') {
      if (filters.durationFrom) params.set('with_runtime.gte', String(filters.durationFrom));
      if (filters.durationTo) params.set('with_runtime.lte', String(filters.durationTo));
    }

    // Sort
    let sortBy = 'popularity.desc';
    const isAsc = filters.sortOrder === 'asc';
    if (filters.sortBy === 'rating') sortBy = isAsc ? 'vote_average.asc' : 'vote_average.desc';
    else if (filters.sortBy === 'votes') sortBy = isAsc ? 'vote_count.asc' : 'vote_count.desc';
    else if (filters.sortBy === 'release_date') {
      sortBy = type === 'movie'
        ? (isAsc ? 'primary_release_date.asc' : 'primary_release_date.desc')
        : (isAsc ? 'first_air_date.asc' : 'first_air_date.desc');
    } else if (filters.sortBy === 'title') {
      sortBy = type === 'movie'
        ? (isAsc ? 'original_title.asc' : 'original_title.desc')
        : (isAsc ? 'name.asc' : 'name.desc');
    }
    params.set('sort_by', sortBy);

    return `https://api.themoviedb.org/3/discover/${type}?${params.toString()}`;
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
        ? `https://api.themoviedb.org/3/movie/${externalId}?api_key=${apiKey}&language=ru-RU&append_to_response=credits,similar,release_dates,videos`
        : `https://api.themoviedb.org/3/tv/${externalId}?api_key=${apiKey}&language=ru-RU&append_to_response=credits,similar,content_ratings,videos`;

      const res = await fetch(endpoint);
      if (!res.ok) return null;
      let data = await res.json();

      // If Russian videos are sparse or empty, fetch all video languages (ru, en, null)
      let rawVideos = data.videos?.results || [];
      if (rawVideos.length === 0) {
        try {
          const vEndpoint = `https://api.themoviedb.org/3/${isMovie ? 'movie' : 'tv'}/${externalId}/videos?api_key=${apiKey}&include_video_language=ru,en,null`;
          const vRes = await fetch(vEndpoint);
          if (vRes.ok) {
            const vData = await vRes.json();
            if (Array.isArray(vData.results) && vData.results.length > 0) {
              rawVideos = vData.results;
            }
          }
        } catch (_e) {}
      }

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
            if (rawVideos.length === 0 && Array.isArray(enData.videos?.results)) {
              rawVideos = enData.videos.results;
            }
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
        const priorityCountries = ['RU', 'US', 'GB', 'DE', 'FR', 'KR', 'JP'];
        for (const countryCode of priorityCountries) {
          const rel = data.release_dates.results.find((r: any) => r.iso_3166_1 === countryCode);
          if (rel?.release_dates && Array.isArray(rel.release_dates)) {
            const certObj = rel.release_dates.find((rd: any) => rd.certification && String(rd.certification).trim() !== '');
            if (certObj) {
              ageRating = String(certObj.certification).trim();
              break;
            }
          }
        }
        if (!ageRating) {
          // Fallback search across any country's release dates
          for (const rel of data.release_dates.results) {
            if (rel?.release_dates && Array.isArray(rel.release_dates)) {
              const certObj = rel.release_dates.find((rd: any) => rd.certification && String(rd.certification).trim() !== '');
              if (certObj) {
                ageRating = String(certObj.certification).trim();
                break;
              }
            }
          }
        }
      } else if (!isMovie && data.content_ratings?.results) {
        const priorityCountries = ['RU', 'US', 'GB', 'DE', 'KR', 'JP'];
        for (const countryCode of priorityCountries) {
          const r = data.content_ratings.results.find((cr: any) => cr.iso_3166_1 === countryCode);
          if (r?.rating && String(r.rating).trim() !== '') {
            ageRating = String(r.rating).trim();
            break;
          }
        }
        if (!ageRating && data.content_ratings.results.length > 0) {
          const fallback = data.content_ratings.results.find((cr: any) => cr.rating && String(cr.rating).trim() !== '');
          if (fallback?.rating) {
            ageRating = String(fallback.rating).trim();
          }
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

      // Parse and prioritize videos & trailers
      const parsedVideos: MediaVideoItem[] = [];
      const priorityOrder = (v: any) => {
        const isRu = (v.iso_639_1 || '').toLowerCase() === 'ru';
        const isOfficial = Boolean(v.official);
        const type = (v.type || '').toLowerCase();

        if (type === 'trailer' && isOfficial && isRu) return 1;
        if (type === 'teaser' && isOfficial && isRu) return 2;
        if (type === 'trailer' && isOfficial) return 3;
        if (type === 'teaser' && isOfficial) return 4;
        if (type === 'trailer') return 5;
        if (type === 'teaser') return 6;
        if (type === 'clip' || type === 'featurette') return 7;
        return 8;
      };

      const sortedRaw = [...rawVideos].sort((a, b) => priorityOrder(a) - priorityOrder(b));

      for (const v of sortedRaw) {
        if (!v.key) continue;
        const site = v.site === 'Vimeo' ? 'Vimeo' : 'YouTube';
        const url = site === 'YouTube' ? `https://www.youtube.com/watch?v=${v.key}` : `https://vimeo.com/${v.key}`;
        const embedUrl = site === 'YouTube' ? `https://www.youtube-nocookie.com/embed/${v.key}?autoplay=1&rel=0` : `https://player.vimeo.com/video/${v.key}?autoplay=1`;
        const thumbnail = site === 'YouTube' ? `https://img.youtube.com/vi/${v.key}/hqdefault.jpg` : undefined;

        parsedVideos.push({
          id: v.id || v.key,
          title: v.name || (v.type === 'Trailer' ? 'Официальный трейлер' : v.type || 'Видео'),
          url,
          embedUrl,
          site,
          key: v.key,
          type: v.type || 'Trailer',
          thumbnailUrl: thumbnail,
          language: v.iso_639_1,
          official: Boolean(v.official),
          publishedAt: v.published_at,
        });
      }

      const mainTrailer = parsedVideos.find((v) => (v.type || '').toLowerCase() === 'trailer') || parsedVideos[0];
      const trailerUrl = mainTrailer?.url;

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
        videos: parsedVideos.length > 0 ? parsedVideos : undefined,
        trailerUrl,
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

  async getTrending(type: string = "MOVIE", credentials?: Record<string, any>, page: number = 1): Promise<import("./types.js").PaginatedResult<MediaSearchResult>> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return { results: [], hasMore: false, page };

    try {
      const mediaType = type === 'TV' ? 'tv' : type === 'ALL' ? 'all' : 'movie';
      const res = await fetch(`https://api.themoviedb.org/3/trending/${mediaType}/week?api_key=${apiKey}&language=ru-RU&page=${page}`);
      if (!res.ok) return { results: [], hasMore: false, page };
      const data = await res.json();
      const results: MediaSearchResult[] = [];

      for (const item of (data.results || [])) {
        if (item.media_type === 'person') continue;
        const isMovie = item.media_type ? item.media_type === 'movie' : mediaType === 'movie';
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

      const hasMore = (data.page || 1) < (data.total_pages || 1);
      return { results, hasMore, page: data.page || page, total: data.total_results };
    } catch (err) {
      console.error('TMDB trending error:', err);
      return { results: [], hasMore: false, page };
    }
  }
}
