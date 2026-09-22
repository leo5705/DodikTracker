// src/server/services/contentVisibilityService.ts

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
  genres?: string | any[] | null;
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
   * Checks whether a given role is staff / admin.
   */
  public static isStaffOrAdmin(user?: UserLike | null): boolean {
    if (!user || !user.role) return false;
    const role = String(user.role).toUpperCase();
    return ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER'].includes(role);
  }

  /**
   * Normalizes and detects whether an item is adult 18+ content.
   */
  public static isAdultContent(item?: ContentItemLike | null): boolean {
    if (!item) return false;

    // Explicit boolean flags
    if (item.isAdult === true || item.is_adult === true || item.adult === true) {
      return true;
    }

    // Check age ratings / certifications
    const ratingsToCheck = [
      item.ageRating,
      item.age_rating,
      item.ratingAgeLimits,
      item.contentRating,
      typeof item.esrb_rating === 'string' ? item.esrb_rating : item.esrb_rating?.name,
    ]
      .filter(Boolean)
      .map((r) => String(r).trim().toUpperCase());

    for (const r of ratingsToCheck) {
      if (
        r === '18' ||
        r === '18+' ||
        r === 'R18' ||
        r === 'R18+' ||
        r === 'R-18' ||
        r === 'NC-17' ||
        r === 'NC17' ||
        r === 'RX' ||
        r === 'EXPLICIT' ||
        r === 'ADULT' ||
        r === 'ADULTS ONLY' ||
        r === 'AO' ||
        r === 'AGE18' ||
        r === 'TV-MA' ||
        r.includes('18+') ||
        r.includes('R18') ||
        r.includes('ADULT') ||
        r.includes('NC-17')
      ) {
        return true;
      }
    }

    // Check genres
    let genresStr = '';
    if (Array.isArray(item.genres)) {
      genresStr = item.genres.join(' ').toUpperCase();
    } else if (typeof item.genres === 'string') {
      genresStr = item.genres.toUpperCase();
    }

    if (
      genresStr.includes('HENTAI') ||
      genresStr.includes('EROTICA') ||
      genresStr.includes('ADULT') ||
      genresStr.includes('18+') ||
      genresStr.includes('ЭРОТИКА')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Central decision function for viewing content.
   * Returns { allowed: boolean, reason?: 'HIDDEN' | 'ADULT_RESTRICTED' }
   */
  public static canViewContent(
    user: UserLike | null | undefined,
    item: ContentItemLike | null | undefined
  ): { allowed: boolean; reason?: 'HIDDEN' | 'ADULT_RESTRICTED' } {
    if (!item) return { allowed: true };

    const isStaff = this.isStaffOrAdmin(user);

    // 1. Hidden content check
    if (item.isHidden) {
      if (!isStaff) {
        return { allowed: false, reason: 'HIDDEN' };
      }
    }

    // 2. Adult 18+ content check
    if (this.isAdultContent(item)) {
      if (isStaff) {
        return { allowed: true };
      }
      const canShowAdult = Boolean(user && user.showAdultContent === true);
      if (!canShowAdult) {
        return { allowed: false, reason: 'ADULT_RESTRICTED' };
      }
    }

    return { allowed: true };
  }

  /**
   * Filters an array of content items keeping only accessible ones for the given user.
   */
  public static filterAccessibleContent<T extends ContentItemLike>(
    user: UserLike | null | undefined,
    items: T[]
  ): T[] {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => this.canViewContent(user, item).allowed);
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
}
