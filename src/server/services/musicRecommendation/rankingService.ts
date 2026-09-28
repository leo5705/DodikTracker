import { TasteProfile, CandidateTrack, ScoredTrack } from './types.ts';

export class RankingService {
  /**
   * Ranks and scores a pool of candidates against the user's taste profile.
   * Enforces diversity, anti-monopoly constraints, penalty deductions, and honest explanations.
   */
  public rankCandidates(
    candidates: CandidateTrack[],
    taste: TasteProfile,
    transitionAffinityMap: Map<string, number> = new Map()
  ): ScoredTrack[] {
    const scoredList: ScoredTrack[] = [];

    for (const c of candidates) {
      const artistKey = (c.artistName || '').toLowerCase().trim();
      const artistData = taste.artists[c.artistName] || taste.artists[artistKey];
      const artistWeight = artistData ? artistData.weight : 0;

      // 1. Genre Affinity
      let genreWeight = 0;
      if (c.genres && c.genres.length > 0) {
        for (const g of c.genres) {
          const gData = taste.genres[g] || taste.genres[g.toLowerCase()];
          if (gData && gData.weight > genreWeight) {
            genreWeight = gData.weight;
          }
        }
      }

      // 2. Short-term Interest Boost
      const isShortTermArtist = taste.shortTermArtists.some(
        (a) => a.toLowerCase() === artistKey
      );
      const shortTermBoost = isShortTermArtist ? 12 : 0;

      // 3. Transition Affinity Score
      const transitionCount = transitionAffinityMap.get(String(c.id)) || 0;
      const transitionScore = Math.min(15, transitionCount * 3);

      // 4. Discovery / Novelty Score
      const isNewArtist = !artistData && !taste.negativeArtists.has(artistKey);
      const noveltyScore = isNewArtist && genreWeight > 0.3 ? 15 : 0;

      // 5. Quality & Community Rating Score
      const qualityScore = c.avgScore ? (c.avgScore / 100) * 10 : Math.min(8, (c.listenCount || 0) * 0.1);

      // 6. Base Score Calculation
      let score =
        artistWeight * 35 +
        genreWeight * 30 +
        shortTermBoost +
        transitionScore +
        noveltyScore +
        qualityScore +
        20; // baseline

      // Favorite bonus
      const isFavorite = taste.favoriteTrackIds.has(String(c.id));
      if (isFavorite) {
        score += 25;
      }

      // 7. Negative Signals & Penalties
      if (taste.negativeArtists.has(artistKey)) {
        score -= 50; // Heavy penalty for heavily skipped/disliked artists
      }

      if (taste.recentTrackIds.has(String(c.id))) {
        score -= 25; // Fatigue penalty for tracks heard in the last 3 days
      }

      // Duration penalty if extreme outlier (< 40s or > 900s when user average is ~200s)
      if (c.durationSeconds && taste.averageDuration > 0) {
        const diffRatio = Math.abs(c.durationSeconds - taste.averageDuration) / taste.averageDuration;
        if (diffRatio > 2.5) {
          score -= 8;
        }
      }

      // 8. Honest Explanation Selection
      let explanation = c.sourceReason || 'Рекомендация по вкусу';
      if (isFavorite) {
        explanation = 'Из вашей медиатеки избранного';
      } else if (taste.subscribedArtistNames.has(c.artistName)) {
        explanation = `От исполнителя из ваших подписок: ${c.artistName}`;
      } else if (artistWeight > 0.6) {
        explanation = `Потому что вы часто слушаете «${c.artistName}»`;
      } else if (isShortTermArtist) {
        explanation = `На основе ваших недавних прослушиваний`;
      } else if (transitionScore >= 6) {
        explanation = `Часто слушают вместе с вашими треками`;
      } else if (isNewArtist && genreWeight > 0.4 && c.genres && c.genres[0]) {
        explanation = `Новый исполнитель в любимом стиле «${c.genres[0]}»`;
      } else if (genreWeight > 0.5 && c.genres && c.genres[0]) {
        explanation = `В вашем любимом жанре «${c.genres[0]}»`;
      } else if (c.source === 'underrated') {
        explanation = 'Недооценённый трек сообщества Dodik Tracker';
      }

      scoredList.push({
        ...c,
        score: Math.max(5, Math.round(score)),
        explanation,
      });
    }

    // Sort by final score descending
    scoredList.sort((a, b) => b.score - a.score);

    return scoredList;
  }

  /**
   * Applies diversity filter (Anti-Monopoly):
   * Limits max tracks per artist and interleaves distinct genres.
   */
  public applyDiversityFilter(
    tracks: ScoredTrack[],
    options: { maxPerArtist?: number; limit?: number; strictQuota?: boolean } = {}
  ): ScoredTrack[] {
    const maxPerArtist = options.maxPerArtist ?? 2;
    const limit = options.limit ?? 12;
    const strictQuota = options.strictQuota ?? true;

    const artistCountMap = new Map<string, number>();
    const result: ScoredTrack[] = [];
    const overflow: ScoredTrack[] = [];

    for (const track of tracks) {
      const artistKey = (track.artistName || 'unknown').toLowerCase().trim();
      const count = artistCountMap.get(artistKey) || 0;

      if (count < maxPerArtist) {
        artistCountMap.set(artistKey, count + 1);
        result.push(track);
      } else {
        overflow.push(track);
      }

      if (result.length >= limit) break;
    }

    // Only backfill from overflow if strictQuota is explicitly false
    if (!strictQuota && result.length < limit && overflow.length > 0) {
      for (const extra of overflow) {
        if (!result.some((r) => r.id === extra.id)) {
          result.push(extra);
          if (result.length >= limit) break;
        }
      }
    }

    return result;
  }
}

export const rankingService = new RankingService();
