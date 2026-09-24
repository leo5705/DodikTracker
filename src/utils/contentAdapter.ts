import { UnifiedContentItem, ContentType, ContentPerson, ContentSeason, ContentTrack, ContentRelation, ContentImage, ContentVideo } from '../types/content.ts';
import { parseVideo } from './videoUtils.ts';

export function normalizeMediaToUnified(raw: any, fallbackType?: string): UnifiedContentItem {
  if (!raw) {
    return {
      id: 0,
      type: 'MOVIE',
      title: 'Неизвестно',
    };
  }

  const rawType = (raw.type || fallbackType || 'MOVIE').toUpperCase() as ContentType;

  // Title & description
  const title = raw.title || raw.name || raw.russianTitle || 'Без названия';
  const originalTitle = raw.originalTitle || raw.originalName || raw.englishTitle || (raw.title !== title ? raw.title : undefined);
  const description = raw.description || raw.overview || raw.synopsis || raw.summary || '';
  const tagline = raw.tagline || raw.quote || undefined;

  // Visuals
  const posterUrl = raw.posterUrl || raw.poster || raw.coverUrl || raw.image || raw.images?.poster;
  const backdropUrl = raw.backdropUrl || raw.backdrop || raw.images?.backdrop || posterUrl;

  // Release date & Year
  let releaseDate = raw.releaseDate || raw.firstAirDate || raw.publishedDate || raw.airedOn || raw.release_date;
  let year = raw.year || raw.releaseYear;
  if (!year && releaseDate) {
    const parsed = new Date(releaseDate);
    if (!isNaN(parsed.getFullYear())) {
      year = parsed.getFullYear();
    }
  }

  // Duration
  let duration = raw.duration || raw.runtime || raw.episodeRuntime;
  let durationText = raw.durationText;
  if (!durationText && duration) {
    if (typeof duration === 'number') {
      const hours = Math.floor(duration / 60);
      const mins = duration % 60;
      durationText = hours > 0 ? `${hours} ч. ${mins > 0 ? `${mins} мин.` : ''}` : `${mins} мин.`;
    } else {
      durationText = String(duration);
    }
  }

  // Age rating
  const ageRating = raw.ageRating || raw.contentRating || raw.ratingAge || raw.age_rating;

  // Status
  let status = raw.status || raw.releaseStatus;
  let statusText = raw.statusText;
  if (!statusText && status) {
    const sLower = status.toLowerCase();
    if (sLower.includes('ongoing') || sLower.includes('airing') || sLower.includes('releasing')) {
      statusText = 'Онгоинг';
    } else if (sLower.includes('completed') || sLower.includes('ended') || sLower.includes('released')) {
      statusText = 'Завершён';
    } else if (sLower.includes('announced') || sLower.includes('upcoming') || sLower.includes('planned')) {
      statusText = 'Анонсирован';
    } else {
      statusText = status;
    }
  }

  // Genres & Tags
  let genres: any[] = [];
  if (Array.isArray(raw.genres)) {
    genres = raw.genres.map((g) => (typeof g === 'string' ? g : g.name || g.title || ''));
  } else if (typeof raw.genres === 'string') {
    genres = raw.genres.split(',').map((g: string) => g.trim());
  }

  const tags = Array.isArray(raw.tags) ? raw.tags : [];
  const countries = Array.isArray(raw.countries)
    ? raw.countries.map((c: any) => (typeof c === 'string' ? c : c.name || ''))
    : typeof raw.countries === 'string'
    ? raw.countries.split(',').map((c: string) => c.trim())
    : [];

  // Ratings
  const rating = raw.rating || raw.score || raw.voteAverage || raw.vote_average;
  const ratingCount = raw.ratingCount || raw.voteCount || raw.vote_count;

  let criticScore = raw.criticScore;
  if (!criticScore) {
    if (raw.metacritic) {
      criticScore = { score: raw.metacritic, source: 'Metacritic', maxScore: 100 };
    } else if (raw.rottenTomatoesScore) {
      criticScore = { score: raw.rottenTomatoesScore, source: 'Rotten Tomatoes', maxScore: 100 };
    } else if (raw.malScore) {
      criticScore = { score: raw.malScore, source: 'MyAnimeList', maxScore: 10 };
    } else if (raw.anilistScore) {
      criticScore = { score: raw.anilistScore, source: 'AniList', maxScore: 100 };
    }
  }

  // Persons (Cast & Crew)
  const cast: ContentPerson[] = [];
  const directors: ContentPerson[] = [];
  const writers: ContentPerson[] = [];
  const producers: ContentPerson[] = [];
  const authors: ContentPerson[] = [];
  const mangaka: ContentPerson[] = [];

  if (Array.isArray(raw.cast)) {
    raw.cast.forEach((c: any) => {
      cast.push({
        id: c.id,
        name: c.name || c.personName || c.actorName || '',
        character: c.character || c.role || c.characterName || '',
        image: c.image || c.profilePath || c.photoUrl || c.avatarUrl || '',
      });
    });
  }

  if (Array.isArray(raw.crew)) {
    raw.crew.forEach((c: any) => {
      const job = (c.job || c.role || '').toLowerCase();
      const person: ContentPerson = {
        id: c.id,
        name: c.name || c.personName || '',
        role: c.job || c.role || '',
        image: c.image || c.profilePath || c.photoUrl || '',
      };
      if (job.includes('director') || job.includes('режиссер') || job.includes('режиссёр')) {
        directors.push(person);
      } else if (job.includes('writer') || job.includes('screenplay') || job.includes('сценарист')) {
        writers.push(person);
      } else if (job.includes('producer') || job.includes('продюсер')) {
        producers.push(person);
      } else if (job.includes('author') || job.includes('автор')) {
        authors.push(person);
      } else if (job.includes('mangaka') || job.includes('мангака')) {
        mangaka.push(person);
      }
    });
  }

  // Fallbacks from raw fields
  if (directors.length === 0 && Array.isArray(raw.directors)) {
    raw.directors.forEach((d: any) => {
      directors.push(typeof d === 'string' ? { name: d } : { name: d.name, image: d.image });
    });
  }

  if (authors.length === 0 && Array.isArray(raw.authors)) {
    raw.authors.forEach((a: any) => {
      authors.push(typeof a === 'string' ? { name: a } : { name: a.name, image: a.image });
    });
  } else if (authors.length === 0 && typeof raw.author === 'string') {
    authors.push({ name: raw.author });
  }

  if (mangaka.length === 0 && Array.isArray(raw.mangaka)) {
    raw.mangaka.forEach((m: any) => {
      mangaka.push(typeof m === 'string' ? { name: m } : { name: m.name, image: m.image });
    });
  }

  // Studios, Publishers, Labels
  const studios: any[] = [];
  if (Array.isArray(raw.studios)) {
    raw.studios.forEach((s: any) => studios.push(typeof s === 'string' ? { name: s } : s));
  } else if (typeof raw.studio === 'string') {
    studios.push({ name: raw.studio });
  }

  const publishers: any[] = [];
  if (Array.isArray(raw.publishers)) {
    raw.publishers.forEach((p: any) => publishers.push(typeof p === 'string' ? { name: p } : p));
  } else if (typeof raw.publisher === 'string') {
    publishers.push({ name: raw.publisher });
  }

  const developers: any[] = [];
  if (Array.isArray(raw.developers)) {
    raw.developers.forEach((d: any) => developers.push(typeof d === 'string' ? { name: d } : d));
  } else if (typeof raw.developer === 'string') {
    developers.push({ name: raw.developer });
  }

  const platforms: string[] = [];
  if (Array.isArray(raw.platforms)) {
    raw.platforms.forEach((p: any) => platforms.push(typeof p === 'string' ? p : p.name || p.platform?.name || ''));
  } else if (typeof raw.platforms === 'string') {
    platforms.push(...raw.platforms.split(',').map((s: string) => s.trim()));
  }

  const requirements = raw.requirements || (raw.pc_requirements ? {
    minimum: raw.pc_requirements.minimum,
    recommended: raw.pc_requirements.recommended,
  } : undefined);

  const achievements = Array.isArray(raw.achievements) ? raw.achievements : undefined;

  const labels: any[] = [];
  if (Array.isArray(raw.labels)) {
    raw.labels.forEach((l: any) => labels.push(typeof l === 'string' ? { name: l } : l));
  } else if (typeof raw.label === 'string') {
    labels.push({ name: raw.label });
  }

  // Seasons & Episodes
  const seasons: ContentSeason[] = [];
  if (Array.isArray(raw.seasons)) {
    raw.seasons.forEach((s: any, sIdx: number) => {
      const episodes = Array.isArray(s.episodes)
        ? s.episodes.map((ep: any, eIdx: number) => ({
            id: ep.id,
            episodeNumber: ep.episodeNumber || ep.number || eIdx + 1,
            title: ep.title || ep.name || `Эпизод ${ep.episodeNumber || eIdx + 1}`,
            overview: ep.overview || ep.description || '',
            airDate: ep.airDate || ep.air_date || '',
            stillUrl: ep.stillUrl || ep.still_path || ep.thumbnailUrl || '',
            duration: ep.duration || ep.runtime || '',
            watched: Boolean(ep.watched),
          }))
        : [];

      seasons.push({
        id: s.id,
        seasonNumber: s.seasonNumber || sIdx + 1,
        title: s.title || s.name || `Сезон ${s.seasonNumber || sIdx + 1}`,
        overview: s.overview || '',
        posterUrl: s.posterUrl || s.poster_path || '',
        episodeCount: s.episodeCount || episodes.length,
        episodes,
      });
    });
  }

  // Music Tracks
  const tracks: ContentTrack[] = [];
  if (Array.isArray(raw.tracks)) {
    raw.tracks.forEach((t: any, idx: number) => {
      tracks.push({
        id: t.id || idx + 1,
        trackNumber: t.trackNumber || t.number || idx + 1,
        title: t.title || t.name || `Трек ${idx + 1}`,
        duration: t.duration || t.durationText || '',
        previewUrl: t.previewUrl || t.preview_url || '',
        artists: Array.isArray(t.artists) ? t.artists : typeof t.artist === 'string' ? [t.artist] : [],
      });
    });
  }

  // Relations (Manga / Anime)
  const relations: ContentRelation[] = [];
  if (Array.isArray(raw.relations)) {
    raw.relations.forEach((r: any) => {
      relations.push({
        id: r.id || r.externalId,
        mediaId: r.mediaId || r.id,
        title: r.title || r.name || '',
        type: (r.type || 'ANIME').toUpperCase(),
        relationType: r.relationType || r.relation || 'OTHER',
        relationLabel: r.relationLabel,
        posterUrl: r.posterUrl || r.poster || '',
        year: r.year,
      });
    });
  }

  // Screenshots / Images
  const screenshots: ContentImage[] = [];
  if (Array.isArray(raw.screenshots)) {
    raw.screenshots.forEach((s: any) => {
      if (typeof s === 'string') {
        screenshots.push({ url: s });
      } else if (s && s.url) {
        screenshots.push({
          url: s.url,
          thumbnailUrl: s.thumbnailUrl || s.thumbnail || s.url,
          caption: s.caption || s.title || '',
        });
      }
    });
  } else if (Array.isArray(raw.images?.backdrops)) {
    raw.images.backdrops.forEach((b: any) => {
      screenshots.push({
        url: typeof b === 'string' ? b : b.url || b.file_path,
        thumbnailUrl: typeof b === 'string' ? b : b.thumbnailUrl || b.file_path,
      });
    });
  }

  // Videos & Trailers
  const videos: ContentVideo[] = [];
  let trailerUrl = raw.trailerUrl || raw.trailer || undefined;

  if (Array.isArray(raw.videos)) {
    raw.videos.forEach((v: any) => {
      const parsed = parseVideo(v);
      if (parsed.isValid || v.url || v.key) {
        videos.push({
          id: v.id || v.key || parsed.videoId,
          name: v.name || v.title || 'Видео',
          title: v.title || v.name,
          url: parsed.canonicalUrl || v.url,
          embedUrl: parsed.embedUrl || v.embedUrl,
          key: v.key || parsed.videoId,
          site: parsed.site !== 'Unknown' ? parsed.site : v.site || 'YouTube',
          type: v.type || 'Трейлер',
          thumbnailUrl: parsed.thumbnailUrl || v.thumbnailUrl,
          official: v.official !== undefined ? Boolean(v.official) : true,
          publishedAt: v.publishedAt || v.published_at,
        });
      }
    });
  } else if (trailerUrl) {
    const parsed = parseVideo(trailerUrl);
    if (parsed.isValid) {
      videos.push({
        id: parsed.videoId || 'trailer-1',
        name: 'Официальный трейлер',
        title: 'Официальный трейлер',
        url: parsed.canonicalUrl || trailerUrl,
        embedUrl: parsed.embedUrl,
        key: parsed.videoId,
        site: parsed.site,
        type: 'Trailer',
        thumbnailUrl: parsed.thumbnailUrl,
        official: true,
      });
    }
  }

  if (!trailerUrl && videos.length > 0) {
    const mainTrailer = videos.find((v) => (v.type || '').toLowerCase().includes('trailer') || (v.type || '').toLowerCase().includes('трейлер')) || videos[0];
    trailerUrl = mainTrailer.url;
  }

  return {
    id: raw.id || 0,
    mediaId: raw.id,
    type: rawType,
    title,
    originalTitle,
    description,
    tagline,
    posterUrl,
    backdropUrl,
    releaseDate,
    year,
    ageRating,
    genres,
    tags,
    countries,
    language: raw.language,
    originalLanguage: raw.originalLanguage || raw.original_language,
    status,
    statusText,
    duration,
    durationText,
    website: raw.website || raw.homepage,
    provider: raw.provider,
    externalId: raw.externalId,

    rating: rating ? Number(rating) : undefined,
    ratingCount: ratingCount ? Number(ratingCount) : undefined,
    criticScore,
    dodikRating: raw.dodikRating,

    directors,
    writers,
    producers,
    authors,
    mangaka,
    cast,
    studios,
    publishers,
    developers,
    platforms,
    requirements,
    achievements,
    labels,

    budget: raw.budget,
    boxOffice: raw.boxOffice || raw.revenue,
    totalSeasons: raw.totalSeasons || raw.numberOfSeasons,
    totalEpisodes: raw.totalEpisodes || raw.numberOfEpisodes,
    totalChapters: raw.totalChapters,
    totalVolumes: raw.totalVolumes,
    totalPages: raw.totalPages || raw.pageCount,
    isbn: raw.isbn,
    format: raw.format,
    seasonYear: raw.seasonYear,
    sourceMaterial: raw.sourceMaterial,
    demographics: raw.demographics,

    seasons,
    tracks,
    relations,
    screenshots,
    videos,
    trailerUrl,
    similar: raw.similar || [],

    userTracking: raw.userTracking,
  };
}
