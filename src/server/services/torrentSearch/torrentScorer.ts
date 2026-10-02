/**
 * TorrentScorer: Evaluates and assigns numerical suitability score (0..1000+) for TorrentCandidates.
 *
 * Stage 10.19 Smart Scoring:
 * 1. Bitrate estimation (size vs duration, optimal 2.5-7.5 Mbps for smooth web streaming).
 * 2. Seed efficiency (seeders / GB; rewards swarm health relative to volume).
 * 3. Release type (WEB-DL > BDRip > WEBRip > BluRay > Remux).
 * 4. Video codec (H.264 browser compatibility bonus +40).
 * 5. Audio codec (Browser-native AAC/MP3 bonus +60, AC-3/DTS handled via Stage 10.17 transcode).
 * 6. Audio language (Russian audio +50, Original +25).
 * 7. Subtitles (RU +20, EN +10, Forced +15).
 * 8. NO arbitrary hard size cut-off; relative scoring ensures 8GB/80 seeders beats 4GB/5 seeders.
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

  // 3. Raw Seeders Base (Max +250 points)
  const seeders = candidate.seeders || 0;
  if (seeders <= 0) {
    score -= 300; // Heavy penalty for 0 seeders
  } else if (seeders >= 50) {
    score += 250;
  } else {
    score += Math.min(250, seeders * 5);
  }

  const sizeBytes = candidate.sizeBytes || 0;
  const sizeMB = sizeBytes / (1024 * 1024);
  const sizeGB = Math.max(0.5, sizeBytes / (1024 * 1024 * 1024));

  // 4. Seed Efficiency (seeders / sizeGB) - Section 3.2
  // High density of seeders relative to size guarantees fast swarm chunks
  const seedEfficiency = seeders / sizeGB;
  candidate.seedEfficiency = Math.round(seedEfficiency * 10) / 10;

  if (seedEfficiency >= 10.0) {
    score += 80; // Exceptional seed density
  } else if (seedEfficiency >= 5.0) {
    score += 50; // Healthy swarm
  } else if (seedEfficiency >= 2.0) {
    score += 20; // Acceptable swarm
  } else if (seedEfficiency < 1.0 && seeders < 25) {
    score -= 50; // High size with scarce seeders = high starvation risk
  }

  // 5. Bitrate Estimation (Section 3.1)
  // ONLY if durationMinutes is known! "Если duration неизвестна — bitrate penalty не применять."
  if (query.durationMinutes && query.durationMinutes > 0 && sizeBytes > 0) {
    const totalSeconds = query.durationMinutes * 60;
    const bitrateMbps = (sizeBytes * 8) / (totalSeconds * 1_000_000);
    candidate.estimatedBitrateMbps = Math.round(bitrateMbps * 10) / 10;

    if (bitrateMbps >= 2.5 && bitrateMbps <= 7.5) {
      score += 80; // Optimal streaming bitrate (fast buffer, crisp quality)
    } else if (bitrateMbps > 7.5 && bitrateMbps <= 11.0) {
      score += 30; // Acceptable for fast swarms
    } else if (bitrateMbps > 11.0 && bitrateMbps <= 16.0) {
      score -= 40; // Heavy bitrate for browser p2p streaming
    } else if (bitrateMbps > 16.0) {
      score -= 90; // Excessive bitrate (e.g. uncompressed Remux)
    } else if (bitrateMbps < 1.2 && (candidate.quality.resolution === '1080p' || candidate.quality.resolution === '720p')) {
      score -= 30; // Overcompressed / low quality
    }
  }

  // 6. Quality & Resolution Preferences (Optimal for Web/P2P streaming)
  switch (candidate.quality.resolution) {
    case '1080p':
      score += 180; // Sweet spot for browser streaming
      break;
    case '720p':
      score += 140; // Highly stable for slower connections
      break;
    case '2160p':
      score += 70; // 4K allowed, but heavy for browser
      break;
    case '480p':
      score += 40;
      break;
    default:
      score += 20;
  }

  // 7. Source / Release Type (Section 3.3)
  const source = (candidate.quality.source || '').toUpperCase();
  if (source === 'WEB-DL') {
    score += 70; // Sweetest spot for web streaming (clean streams, WebVTT compatible)
  } else if (source === 'BDRIP' || source === 'BRRIP') {
    score += 60;
  } else if (source === 'WEBRIP') {
    score += 50;
  } else if (source === 'BLURAY') {
    score += 40;
  } else if (source === 'HDTV') {
    score += 30;
  } else if (source.includes('REMUX')) {
    score += 15; // Remux has excessive bandwidth for browser streaming
  }

  // 8. Video Codec Preference (Section 3.4)
  const codec = (candidate.quality.codec || '').toUpperCase();
  if (codec === 'X264' || codec === 'H264' || codec === 'AVC') {
    score += 40; // Universal browser native compatibility bonus
  } else if (codec === 'HEVC' || codec === 'H265' || codec === 'X265') {
    score += 20; // Modern efficient codec
  } else if (codec === 'AV1') {
    score += 15;
  }

  // 9. Audio Codec (Section 3.5)
  const audioCodec = (candidate.quality.audioCodec || '').toUpperCase();
  if (audioCodec === 'AAC' || audioCodec === 'MP3' || audioCodec === 'OPUS') {
    score += 60; // Browser-native audio, zero transcoding needed!
  } else if (audioCodec === 'AC3' || audioCodec === 'AC-3' || audioCodec === 'E-AC-3' || audioCodec === 'EAC3') {
    score += 15; // Supported via Stage 10.17 transcode
  } else if (audioCodec === 'DTS' || audioCodec === 'DTS-HD' || audioCodec === 'TRUEHD') {
    score += 5; // Heavy audio, requires transcoding
  }

  // 10. Audio Language (Section 3.6)
  const hasRusAudio =
    candidate.languages?.some((l) => /rus|ru/i.test(l)) ||
    /\b(rus|дубл|мво|дво|mvo|dvo|авторск|полное дублирование)\b/i.test(nameLower);
  const hasOrigAudio =
    candidate.languages?.some((l) => /eng|orig/i.test(l)) ||
    /\b(eng|original|оригинал)\b/i.test(nameLower);

  if (hasRusAudio) {
    score += 50;
  } else if (hasOrigAudio) {
    score += 25;
  }

  // 11. Subtitles Detection (Section 3.7)
  const hasForcedSubs =
    candidate.quality.subtitles?.includes('forced') ||
    /\b(forced|форсированные)\b/i.test(nameLower);
  const hasRusSubs =
    candidate.quality.subtitles?.includes('ru') ||
    (/\b(sub|subs|субтитры)\b/i.test(nameLower) && /\b(rus|рус)\b/i.test(nameLower));
  const hasSubs =
    (candidate.quality.subtitles && candidate.quality.subtitles.length > 0) ||
    /\b(sub|subs|субтитры)\b/i.test(nameLower);

  if (hasForcedSubs) {
    score += 15;
  }
  if (hasRusSubs) {
    score += 20;
  } else if (hasSubs) {
    score += 10;
  }

  // 12. Relative Size Balance (Section 4: No hard 3-6GB cap)
  if (sizeMB < 100) {
    score -= 200; // Suspiciously small (likely fake or audio only)
  } else if (sizeMB >= 400 && sizeMB <= 10000) {
    score += 40; // Moderate practical size bonus
  } else if (sizeMB > 35000) {
    score -= 60; // Extremely large (>35GB)
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
    console.log(
      `[WATCH_DIAG] SOURCE_SCORE: candidate="${cand.name.slice(0, 45)}" score=${score} (res=${cand.quality.resolution}, src=${cand.quality.source || '?'}, seeders=${cand.seeders}, size=${cand.formattedSize || Math.round((cand.sizeBytes || 0) / 1024 / 1024) + 'MB'}, bitrate=${cand.estimatedBitrateMbps ? cand.estimatedBitrateMbps + 'Mbps' : 'unknown'}, audio=${cand.quality.audioCodec || '?'})`
    );
    return { ...cand, score };
  });

  // Filter out candidates with score <= 0 (e.g. sample releases or 0 seeders with bad matches)
  const validCandidates = scored.filter((c) => c.score > 0);
  const sorted = validCandidates.sort((a, b) => b.score - a.score);

  if (sorted.length > 0) {
    const best = sorted[0];
    console.log(
      `[WATCH_DIAG] SOURCE_SELECTED: candidate="${best.name}" score=${best.score} seeders=${best.seeders} (file: ${best.formattedSize || 'unknown'})`
    );
  }

  return sorted;
}
