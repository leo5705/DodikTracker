/**
 * TorrentScorer: Evaluates and assigns numerical suitability score (0..1000) for TorrentCandidates.
 * Prioritizes active seeders, optimal 1080p/720p resolution for browser P2P streaming,
 * and exact title/season/episode matches.
 */

import { TorrentCandidate, TorrentSearchQuery } from './torrentSearchTypes.ts';

/**
 * Scores a single TorrentCandidate.
 */
export function scoreTorrentCandidate(
  candidate: TorrentCandidate,
  query: TorrentSearchQuery
): number {
  let score = 0;
  const nameLower = candidate.name.toLowerCase();

  // 1. Exclude sample / trailer / promo / bonus releases
  if (/sample|trailer|promo|bonus|featurette|extras/i.test(nameLower)) {
    return -1000;
  }

  // 2. Media Match Scoring
  if (candidate.matchedMedia?.title) {
    score += 250;
  } else {
    // Slight penalty if main title/original title not detected in release name
    score -= 100;
  }

  if (candidate.matchedMedia?.year) {
    score += 80;
  }

  if (query.mediaType === 'series' || query.seasonNumber !== undefined) {
    if (candidate.matchedMedia?.season) {
      score += 150;
    } else {
      score -= 150; // Reject wrong season
    }

    if (query.episodeNumber !== undefined) {
      if (candidate.matchedMedia?.episode) {
        score += 200;
      } else {
        score -= 200; // Reject wrong episode
      }
    }
  }

  // 3. Seeders Weight (Max +250 points)
  const seeders = candidate.seeders || 0;
  if (seeders <= 0) {
    score -= 300; // Heavy penalty for 0 seeders
  } else if (seeders >= 50) {
    score += 250;
  } else {
    score += Math.min(250, seeders * 5);
  }

  // 4. Quality & Resolution Preferences (Optimal for Web/P2P streaming)
  switch (candidate.quality.resolution) {
    case '1080p':
      score += 180; // Sweet spot for browser streaming
      break;
    case '720p':
      score += 140;
      break;
    case '2160p':
      score += 90; // 4K allowed but heavy for browser WebRTC
      break;
    case '480p':
      score += 40;
      break;
    default:
      score += 20;
  }

  // 5. Source / Release Type
  if (candidate.quality.source === 'WEB-DL' || candidate.quality.source === 'BDRip') {
    score += 60;
  } else if (candidate.quality.source === 'BDremux') {
    score += 30; // High quality but huge bandwidth
  }

  // 6. Codec Preference (x264 / HEVC supported well in browsers)
  if (candidate.quality.codec === 'x264' || candidate.quality.codec === 'HEVC') {
    score += 30;
  }

  // 7. File Size Evaluation (Optimal range: 500MB - 12GB for Web Streaming)
  const sizeBytes = candidate.sizeBytes || 0;
  const sizeMB = sizeBytes / (1024 * 1024);

  if (sizeMB < 100) {
    score -= 200; // Suspiciously small (likely fake or audio only)
  } else if (sizeMB >= 400 && sizeMB <= 8000) {
    score += 100; // Optimal size range
  } else if (sizeMB > 30000) {
    score -= 100; // Very large (>30GB) can cause WebRTC buffer stalls
  }

  return Math.max(0, Math.round(score));
}

/**
 * Scores and sorts a list of TorrentCandidate DTOs in descending order.
 */
export function rankTorrentCandidates(
  candidates: TorrentCandidate[],
  query: TorrentSearchQuery
): TorrentCandidate[] {
  const scored = candidates.map((cand) => {
    const score = scoreTorrentCandidate(cand, query);
    return { ...cand, score };
  });

  // Filter out candidates with score <= 0 (e.g. sample releases or 0 seeders with bad matches)
  const validCandidates = scored.filter((c) => c.score > 0);

  // If no candidates had score > 0, return top scored candidates sorted anyway
  const listToSort = validCandidates.length > 0 ? validCandidates : scored;

  return listToSort.sort((a, b) => b.score - a.score);
}
