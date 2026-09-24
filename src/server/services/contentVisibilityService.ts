// src/server/services/contentVisibilityService.ts

export interface ContentSafety {
  isAdult: boolean;
  containsNudity: boolean;
  containsSexualContent: boolean;
  containsViolence: boolean;
  containsExplicitLanguage: boolean;
  ageRating: string | null;
  source: string | null;
  warningLabels: string[];
}

export interface ContentSafetyFilters {
  hideAdult?: boolean | string;
  hide_adult?: boolean | string;
  hideNudity?: boolean | string;
  hide_nudity?: boolean | string;
  hideSexualContent?: boolean | string;
  hide_sexual_content?: boolean | string;
  hideViolence?: boolean | string;
  hide_violence?: boolean | string;
  hideExplicitLanguage?: boolean | string;
  hide_explicit_language?: boolean | string;
}

export interface ContentItemLike {
  id?: number | string;
  mediaId?: number;
  type?: string;
  title?: string;
  originalTitle?: string;
  description?: string;
  isHidden?: boolean;
  isAdult?: boolean;
  is_adult?: boolean;
  adult?: boolean;
  ageRating?: string | null;
  age_rating?: string | null;
  ratingAgeLimits?: string | null;
  contentRating?: string | null;
  maturityRating?: string | null;
  genres?: string | any[] | null;
  tags?: string | any[] | null;
  format?: string | null;
  esrb_rating?: any;
  pegi?: any;
  cero?: any;
  explicit?: boolean;
  collectionExplicitness?: string;
  trackExplicitness?: string;
  contentAdvisoryRating?: string;
  [key: string]: any;
}

export interface UserLike {
  id?: number;
  role?: string;
  showAdultContent?: boolean;
  [key: string]: any;
}

export class ContentVisibilityService {
  /**
   * Checks whether a given user is staff / admin.
   */
  public static isStaffOrAdmin(user?: UserLike | null): boolean {
    if (!user || !user.role) return false;
    const role = String(user.role).toUpperCase();
    return ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER'].includes(role);
  }

  /**
   * Evaluates comprehensive ContentSafety metadata for an item across all categories.
   */
  public static evaluateContentSafety(item?: ContentItemLike | null): ContentSafety {
    if (!item) {
      return {
        isAdult: false,
        containsNudity: false,
        containsSexualContent: false,
        containsViolence: false,
        containsExplicitLanguage: false,
        ageRating: null,
        source: null,
        warningLabels: [],
      };
    }

    const warnings: string[] = [];
    let isAdult = false;
    let containsNudity = false;
    let containsSexualContent = false;
    let containsViolence = false;
    let containsExplicitLanguage = false;

    // 1. Explicit boolean flags from providers
    if (item.isAdult === true || item.is_adult === true || item.adult === true || item.explicit === true) {
      isAdult = true;
      warnings.push('18+ Adult Content');
    }

    // 2. Normalizing age rating string
    const rawRating = [
      item.ageRating,
      item.age_rating,
      item.ratingAgeLimits,
      item.contentRating,
      item.maturityRating,
      item.contentAdvisoryRating,
      typeof item.esrb_rating === 'string' ? item.esrb_rating : item.esrb_rating?.name,
      typeof item.pegi === 'string' ? item.pegi : item.pegi?.name,
      typeof item.cero === 'string' ? item.cero : item.cero?.name,
    ]
      .filter(Boolean)
      .map((r) => String(r).trim())[0] || null;

    const ratingUpper = rawRating ? rawRating.toUpperCase() : '';

    if (
      ratingUpper === '18' ||
      ratingUpper === '18+' ||
      ratingUpper === 'R18' ||
      ratingUpper === 'R18+' ||
      ratingUpper === 'R-18' ||
      ratingUpper === 'NC-17' ||
      ratingUpper === 'NC17' ||
      ratingUpper === 'RX' ||
      ratingUpper === 'EXPLICIT' ||
      ratingUpper === 'ADULT' ||
      ratingUpper === 'ADULTS ONLY' ||
      ratingUpper === 'AO' ||
      ratingUpper === 'AGE18' ||
      ratingUpper === 'TV-MA' ||
      ratingUpper === 'MATURE' ||
      ratingUpper === 'CERO Z' ||
      ratingUpper.includes('18+') ||
      ratingUpper.includes('R18') ||
      ratingUpper.includes('ADULT') ||
      ratingUpper.includes('NC-17')
    ) {
      isAdult = true;
      if (!warnings.includes('18+ Age Rating')) {
        warnings.push('18+ Age Rating');
      }
    }

    // 3. Audio / Music explicitness check (iTunes / Spotify / MusicBrainz)
    if (
      item.collectionExplicitness === 'explicit' ||
      item.trackExplicitness === 'explicit' ||
      ratingUpper === 'EXPLICIT'
    ) {
      isAdult = true;
      containsExplicitLanguage = true;
      warnings.push('Explicit Lyrics / Audio');
    }

    // 4. Genres and Tags analysis
    const genresList: string[] = [];
    if (Array.isArray(item.genres)) {
      genresList.push(...item.genres.map((g) => (typeof g === 'string' ? g : g?.name || '')).filter(Boolean));
    } else if (typeof item.genres === 'string') {
      genresList.push(item.genres);
    }

    const tagsList: string[] = [];
    if (Array.isArray(item.tags)) {
      tagsList.push(...item.tags.map((t) => (typeof t === 'string' ? t : t?.name || '')).filter(Boolean));
    } else if (typeof item.tags === 'string') {
      tagsList.push(item.tags);
    }

    const combinedText = `${genresList.join(' ')} ${tagsList.join(' ')} ${item.format || ''} ${item.description || ''}`.toUpperCase();

    // Sexual Content / Nudity / Hentai / Ecchi
    if (
      combinedText.includes('HENTAI') ||
      combinedText.includes('EROTICA') ||
      combinedText.includes('ЭРОТИКА') ||
      combinedText.includes('PORN') ||
      combinedText.includes('SEXUAL CONTENT') ||
      combinedText.includes('SEXUAL THEMES') ||
      combinedText.includes('ECCHI') ||
      combinedText.includes('ADULT FICTION') ||
      combinedText.includes('NSFW')
    ) {
      isAdult = true;
      containsSexualContent = true;
      warnings.push('Sexual Content');
    }

    if (
      combinedText.includes('NUDITY') ||
      combinedText.includes('НАГОТА') ||
      combinedText.includes('ОБНАЖЕНИЕ') ||
      combinedText.includes('NUDE')
    ) {
      containsNudity = true;
      isAdult = true;
      warnings.push('Nudity');
    }

    // Violence / Gore
    if (
      combinedText.includes('GORE') ||
      combinedText.includes('EXTREME VIOLENCE') ||
      combinedText.includes('BLOOD AND GORE') ||
      combinedText.includes('ЖЕСТОКОСТЬ') ||
      combinedText.includes('РАСЧЛЕНЕНИЕ')
    ) {
      containsViolence = true;
      warnings.push('Violence & Gore');
    }

    // Explicit Language
    if (
      combinedText.includes('STRONG LANGUAGE') ||
      combinedText.includes('EXPLICIT LANGUAGE') ||
      combinedText.includes('EXPLICIT LYRICS') ||
      combinedText.includes('EXPLICIT') ||
      combinedText.includes('НЕНОРМАТИВНАЯ ЛЕКСИКА') ||
      combinedText.includes('ПРОФАНАЦИЯ') ||
      combinedText.includes('МАТ')
    ) {
      containsExplicitLanguage = true;
      isAdult = true;
      warnings.push('Explicit Language');
    }

    const source = item.provider || (item.rawgId ? 'RAWG' : item.tmdbId ? 'TMDB' : item.kinopoiskId ? 'KINOPOISK' : 'DATABASE');

    return {
      isAdult,
      containsNudity,
      containsSexualContent,
      containsViolence,
      containsExplicitLanguage,
      ageRating: rawRating,
      source,
      warningLabels: Array.from(new Set(warnings)),
    };
  }

  /**
   * Normalizes and detects whether an item is adult 18+ content across all categories.
   */
  public static isAdultContent(item?: ContentItemLike | null): boolean {
    if (!item) return false;
    return this.evaluateContentSafety(item).isAdult;
  }

  /**
   * Central decision function for viewing content.
   * Checks both user permissions and optional fine-grained ContentSafetyFilters.
   * Returns { allowed: boolean, reason?: 'HIDDEN' | 'ADULT_RESTRICTED' | 'SAFETY_RESTRICTED' }
   */
  public static canViewContent(
    user: UserLike | null | undefined,
    item: ContentItemLike | null | undefined,
    filters?: ContentSafetyFilters
  ): { allowed: boolean; reason?: 'HIDDEN' | 'ADULT_RESTRICTED' | 'SAFETY_RESTRICTED'; safety?: ContentSafety } {
    if (!item) return { allowed: true };

    const isStaff = this.isStaffOrAdmin(user);

    // 1. Hidden content check
    if (item.isHidden) {
      if (!isStaff) {
        return { allowed: false, reason: 'HIDDEN' };
      }
    }

    const safety = this.evaluateContentSafety(item);

    // 2. Adult 18+ content check
    if (safety.isAdult) {
      if (!isStaff) {
        const canShowAdult = Boolean(user && user.showAdultContent === true);
        if (!canShowAdult) {
          return { allowed: false, reason: 'ADULT_RESTRICTED', safety };
        }
      }
    }

    // 3. Fine-grained Safety Filter checks (if passed in query / search filters)
    if (filters) {
      const hideAdult = filters.hideAdult === true || filters.hideAdult === 'true' || filters.hide_adult === true || filters.hide_adult === 'true';
      if (hideAdult && safety.isAdult) {
        return { allowed: false, reason: 'SAFETY_RESTRICTED', safety };
      }

      const hideNudity = filters.hideNudity === true || filters.hideNudity === 'true' || filters.hide_nudity === true || filters.hide_nudity === 'true';
      if (hideNudity && safety.containsNudity) {
        return { allowed: false, reason: 'SAFETY_RESTRICTED', safety };
      }

      const hideSexual = filters.hideSexualContent === true || filters.hideSexualContent === 'true' || filters.hide_sexual_content === true || filters.hide_sexual_content === 'true';
      if (hideSexual && safety.containsSexualContent) {
        return { allowed: false, reason: 'SAFETY_RESTRICTED', safety };
      }

      const hideViolence = filters.hideViolence === true || filters.hideViolence === 'true' || filters.hide_violence === true || filters.hide_violence === 'true';
      if (hideViolence && safety.containsViolence) {
        return { allowed: false, reason: 'SAFETY_RESTRICTED', safety };
      }

      const hideExplicitLang = filters.hideExplicitLanguage === true || filters.hideExplicitLanguage === 'true' || filters.hide_explicit_language === true || filters.hide_explicit_language === 'true';
      if (hideExplicitLang && safety.containsExplicitLanguage) {
        return { allowed: false, reason: 'SAFETY_RESTRICTED', safety };
      }
    }

    return { allowed: true, safety };
  }

  /**
   * Filters an array of content items keeping only accessible ones for the given user and filters.
   */
  public static filterAccessibleContent<T extends ContentItemLike>(
    user: UserLike | null | undefined,
    items: T[],
    filters?: ContentSafetyFilters
  ): T[] {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => this.canViewContent(user, item, filters).allowed);
  }

  /**
   * Filters or masks activities so 18+ media titles are not leaked to users without showAdultContent.
   */
  public static filterAccessibleActivities<T extends { media?: ContentItemLike | null; details?: string | null; [key: string]: any }>(
    user: UserLike | null | undefined,
    activities: T[]
  ): T[] {
    if (!Array.isArray(activities)) return [];
    const canShowAdult = this.isStaffOrAdmin(user) || Boolean(user && user.showAdultContent === true);

    return activities.filter((act) => {
      if (act.media && this.isAdultContent(act.media) && !canShowAdult) {
        return false;
      }
      return true;
    });
  }

  /**
   * Sanitizes a media item preview for safe transport when adult viewing is restricted.
   */
  public static sanitizeMediaSummary(item: ContentItemLike): Partial<ContentItemLike> {
    return {
      id: item.id || item.mediaId,
      mediaId: item.mediaId || (typeof item.id === 'number' ? item.id : undefined),
      type: item.type,
      title: item.title,
      originalTitle: item.originalTitle,
      year: item.year,
      ageRating: item.ageRating || '18+',
      isAdult: true,
      adult: true,
      description: 'Данный контент содержит возрастное ограничение 18+.',
    };
  }
}

