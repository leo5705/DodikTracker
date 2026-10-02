/**
 * MediaDiagnosticService: Deep inspection of media streams using ffprobe.
 * Extracts container, video codec, audio codec(s), channels, sample rates,
 * and assesses native browser decode compatibility.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface AudioTrackInfo {
  index: number;
  codec: string;
  codecLongName?: string;
  profile?: string;
  channels: number;
  channelLayout?: string;
  sampleRate: number;
  bitrate?: number;
  language?: string;
  title?: string;
  isDefault: boolean;
  browserNativeSupport: 'NATIVE' | 'UNSUPPORTED_PATENT_CODEC' | 'UNKNOWN';
  browserSupportReason: string;
}

export interface VideoTrackInfo {
  index: number;
  codec: string;
  codecLongName?: string;
  profile?: string;
  width: number;
  height: number;
  bitrate?: number;
  fps?: number;
  browserNativeSupport: 'NATIVE' | 'PARTIAL' | 'UNKNOWN';
}

export interface SubtitleTrackInfo {
  index: number;
  codec: string;
  language?: string;
  title?: string;
  forced?: boolean;
  hearingImpaired?: boolean;
  isBitmap: boolean;
  format: 'TEXT' | 'BITMAP';
}

export function isBitmapSubtitleCodec(codec: string): boolean {
  const c = (codec || '').toLowerCase();
  return /hdmv_pgs|pgs|vobsub|dvd_subtitle|dvb_subtitle|xsub/i.test(c);
}

export interface MediaDiagnosticReport {
  container: string;
  containerLongName?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  bitrateBps?: number;
  video: VideoTrackInfo | null;
  audio: AudioTrackInfo | null;
  allAudioTracks: AudioTrackInfo[];
  videoTracksCount: number;
  audioTracksCount: number;
  subtitleTracksCount: number;
  subtitles: SubtitleTrackInfo[];
  audioPlaybackDiagnosis: {
    hasAudio: boolean;
    primaryCodec: string;
    canBrowserDecodeNatively: boolean;
    diagnosis: string;
  };
}

/**
 * Assesses whether Chromium / Chrome / WebKit HTML5 <video> can natively decode the audio codec.
 */
export function assessAudioCodecCompatibility(codec: string): {
  support: 'NATIVE' | 'UNSUPPORTED_PATENT_CODEC' | 'UNKNOWN';
  reason: string;
} {
  const c = (codec || '').toLowerCase().trim();
  switch (c) {
    case 'aac':
    case 'mp4a':
      return {
        support: 'NATIVE',
        reason: 'AAC is natively supported across all modern browsers (Chromium, Firefox, Safari).',
      };
    case 'mp3':
      return {
        support: 'NATIVE',
        reason: 'MP3 is natively supported across all modern browsers.',
      };
    case 'opus':
      return {
        support: 'NATIVE',
        reason: 'Opus is natively supported in WebM and modern Matroska/MP4 implementations.',
      };
    case 'vorbis':
      return {
        support: 'NATIVE',
        reason: 'Vorbis is natively supported in WebM and Ogg containers.',
      };
    case 'flac':
      return {
        support: 'NATIVE',
        reason: 'FLAC is natively supported in modern Chromium and Firefox.',
      };
    case 'ac3':
    case 'ac-3':
      return {
        support: 'UNSUPPORTED_PATENT_CODEC',
        reason: 'Dolby Digital (AC-3) is NOT supported natively by Chromium/Chrome HTML5 <video> due to patent licensing fees. Video plays, but audio is silently dropped.',
      };
    case 'eac3':
    case 'ec-3':
    case 'eac-3':
      return {
        support: 'UNSUPPORTED_PATENT_CODEC',
        reason: 'Dolby Digital Plus (E-AC-3) is NOT supported natively by Chromium/Chrome HTML5 <video> due to patent licensing fees.',
      };
    case 'dts':
    case 'dca':
      return {
        support: 'UNSUPPORTED_PATENT_CODEC',
        reason: 'DTS (DCA) is NOT supported natively by modern web browsers.',
      };
    case 'truehd':
      return {
        support: 'UNSUPPORTED_PATENT_CODEC',
        reason: 'Dolby TrueHD is NOT supported natively by web browsers.',
      };
    default:
      return {
        support: 'UNKNOWN',
        reason: `Audio codec "${c}" may not be supported by standard HTML5 <video> decoders.`,
      };
  }
}

export class MediaDiagnosticService {
  /**
   * Probes a file or HTTP stream using local ffprobe binary.
   */
  async probeMedia(targetPathOrUrl: string, timeoutMs = 12000): Promise<MediaDiagnosticReport> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        targetPathOrUrl,
      ];

      const { stdout } = await execFileAsync('ffprobe', args, {
        signal: controller.signal,
        timeout: timeoutMs,
      });

      clearTimeout(timer);
      const parsed = JSON.parse(stdout);
      return this.formatDiagnosticReport(parsed);
    } catch (err: any) {
      clearTimeout(timer);
      throw new Error(`ffprobe diagnostic failed: ${err.message}`);
    }
  }

  /**
   * Formats raw ffprobe JSON into structured MediaDiagnosticReport.
   */
  formatDiagnosticReport(raw: any): MediaDiagnosticReport {
    const streams = Array.isArray(raw?.streams) ? raw.streams : [];
    const format = raw?.format || {};

    const videoStreams = streams.filter((s: any) => s.codec_type === 'video');
    const audioStreams = streams.filter((s: any) => s.codec_type === 'audio');
    const subtitleStreams = streams.filter((s: any) => s.codec_type === 'subtitle');

    const formattedAudioTracks: AudioTrackInfo[] = audioStreams.map((s: any, idx: number) => {
      const codec = s.codec_name || 'unknown';
      const compat = assessAudioCodecCompatibility(codec);
      const channels = typeof s.channels === 'number' ? s.channels : parseInt(s.channels || '0', 10);
      const sampleRate = typeof s.sample_rate === 'number' ? s.sample_rate : parseInt(s.sample_rate || '0', 10);
      const bitrate = s.bit_rate ? parseInt(s.bit_rate, 10) : undefined;
      const isDefault = Boolean(s.disposition?.default === 1);

      return {
        index: typeof s.index === 'number' ? s.index : idx,
        codec,
        codecLongName: s.codec_long_name,
        profile: s.profile,
        channels,
        channelLayout: s.channel_layout,
        sampleRate,
        bitrate,
        language: s.tags?.language || s.tags?.LANGUAGE,
        title: s.tags?.title || s.tags?.TITLE,
        isDefault,
        browserNativeSupport: compat.support,
        browserSupportReason: compat.reason,
      };
    });

    let primaryVideo: VideoTrackInfo | null = null;
    if (videoStreams.length > 0) {
      const v = videoStreams[0];
      let fps: number | undefined;
      if (v.avg_frame_rate && v.avg_frame_rate.includes('/')) {
        const [num, den] = v.avg_frame_rate.split('/').map(Number);
        if (den > 0) fps = Math.round((num / den) * 100) / 100;
      }

      primaryVideo = {
        index: v.index || 0,
        codec: v.codec_name || 'unknown',
        codecLongName: v.codec_long_name,
        profile: v.profile,
        width: v.width || 0,
        height: v.height || 0,
        bitrate: v.bit_rate ? parseInt(v.bit_rate, 10) : undefined,
        fps,
        browserNativeSupport: ['h264', 'vp8', 'vp9', 'av1'].includes((v.codec_name || '').toLowerCase())
          ? 'NATIVE'
          : 'PARTIAL',
      };
    }

    const primaryAudio: AudioTrackInfo | null = formattedAudioTracks.length > 0
      ? (formattedAudioTracks.find((t) => t.isDefault) || formattedAudioTracks[0])
      : null;

    const hasAudio = formattedAudioTracks.length > 0;
    const canBrowserDecodeNatively = Boolean(primaryAudio && primaryAudio.browserNativeSupport === 'NATIVE');

    let diagnosis = 'No audio track detected in media container.';
    if (hasAudio) {
      if (canBrowserDecodeNatively) {
        diagnosis = `Audio track is encoded with ${primaryAudio?.codec.toUpperCase()}, which is natively supported by modern browsers. If audio is inaudible, verify player mute/volume state.`;
      } else {
        diagnosis = `CONFIRMED: Audio track is encoded with ${primaryAudio?.codec.toUpperCase()} (${primaryAudio?.channels}ch). Chromium/Chrome does NOT support native decoding of ${primaryAudio?.codec.toUpperCase()} in HTML5 <video>. The browser demuxer silently drops the audio track while playing video.`;
      }
    }

    return {
      container: format.format_name || 'unknown',
      containerLongName: format.format_long_name,
      durationSeconds: format.duration ? parseFloat(format.duration) : undefined,
      sizeBytes: format.size ? parseInt(format.size, 10) : undefined,
      bitrateBps: format.bit_rate ? parseInt(format.bit_rate, 10) : undefined,
      video: primaryVideo,
      audio: primaryAudio,
      allAudioTracks: formattedAudioTracks,
      videoTracksCount: videoStreams.length,
      audioTracksCount: audioStreams.length,
      subtitleTracksCount: subtitleStreams.length,
      subtitles: subtitleStreams.map((s: any) => {
        const codec = s.codec_name || 'unknown';
        const isBitmap = isBitmapSubtitleCodec(codec);
        const forced = s.disposition?.forced === 1 || Boolean(s.tags?.title && /forced|форсир/i.test(s.tags.title));
        const hearingImpaired = s.disposition?.hearing_impaired === 1;
        return {
          index: s.index,
          codec,
          language: s.tags?.language || s.tags?.LANGUAGE,
          title: s.tags?.title || s.tags?.TITLE,
          forced,
          hearingImpaired,
          isBitmap,
          format: isBitmap ? 'BITMAP' : 'TEXT',
        };
      }),
      audioPlaybackDiagnosis: {
        hasAudio,
        primaryCodec: primaryAudio?.codec || 'none',
        canBrowserDecodeNatively,
        diagnosis,
      },
    };
  }
}

export const mediaDiagnosticService = new MediaDiagnosticService();
