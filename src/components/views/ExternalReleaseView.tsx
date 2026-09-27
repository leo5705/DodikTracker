import React, { useState, useEffect } from 'react';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import {
  Music2,
  Disc,
  Play,
  Pause,
  ArrowLeft,
  Share2,
  Clock,
  Check,
  AlertTriangle,
  Plus,
  Heart,
} from 'lucide-react';
import { ExternalRelease, ExternalCatalogItem } from '../../server/services/externalMusic/types.ts';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';
import { TrackActionsMenu } from '../music/TrackActionsMenu.tsx';
import { ArtistLinks } from '../music/ArtistLinks.tsx';
import { MusicTrackRow } from '../music/MusicTrackRow.tsx';

interface ExternalReleaseViewProps {
  provider: 'youtube';
  releaseId: string;
}

export const ExternalReleaseView: React.FC<ExternalReleaseViewProps> = ({ provider, releaseId }) => {
  const { navigate, goBack } = useRouter();
  const { authFetch } = useAuth();
  const { playTrack, currentTrack, isPlaying, addToQueue, toggleFavoriteTrack } = useMusicPlayer();

  const [release, setRelease] = useState<ExternalRelease | null>(null);
  const [favoriteTrackIds, setFavoriteTrackIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchRelease = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/music/external/release/${provider}/${releaseId}`);
      if (!res.ok) {
        throw new Error('Не удалось загрузить данные о релизе. Возможно, он скрыт или удален.');
      }
      const data = await res.json();
      setRelease(data);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки релиза');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRelease();
  }, [provider, releaseId]);

  const handlePlayTrack = (track: ExternalCatalogItem) => {
    if (!release) return;

    const playerTrack = {
      id: track.id,
      source: track.provider,
      providerTrackId: track.providerTrackId,
      videoId: track.provider === 'youtube' ? track.providerTrackId : undefined,
      title: track.title,
      artistName: track.artist,
      releaseTitle: release.title,
      releaseCover: release.coverUrl || track.thumbnail || null,
      thumbnail: track.thumbnail || release.coverUrl || null,
      duration: track.durationSeconds || null,
      explicit: Boolean(track.explicit),
      playable: track.playable !== false,
    };

    const playlist = (release.tracks || []).map((t) => ({
      id: t.id,
      source: t.provider,
      providerTrackId: t.providerTrackId,
      videoId: t.provider === 'youtube' ? t.providerTrackId : undefined,
      title: t.title,
      artistName: t.artist,
      releaseTitle: release.title,
      releaseCover: release.coverUrl || t.thumbnail || null,
      thumbnail: t.thumbnail || release.coverUrl || null,
      duration: t.durationSeconds || null,
      explicit: Boolean(t.explicit),
      playable: t.playable !== false,
    }));

    playTrack(playerTrack as any, playlist as any, {
      title: release.title,
      cover: release.coverUrl || null,
      slug: '',
      artistName: release.artist,
      artistSlug: '',
    });
  };

  const handlePlayAll = () => {
    if (release && release.tracks && release.tracks.length > 0) {
      handlePlayTrack(release.tracks[0]);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        <span className="text-sm font-medium text-slate-400">Поиск информации о релизе...</span>
      </div>
    );
  }

  if (error || !release) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-slate-200 mb-2">{error || 'Релиз не найден'}</h2>
        <button
          onClick={() => goBack()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>
      </div>
    );
  }

  const tracksList = release.tracks || [];

  return (
    <div className="pb-24 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 pt-4">
      {/* Back & Share Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => goBack()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition text-sm font-medium backdrop-blur-md cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>

        <button
          onClick={handleShare}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#11152A] hover:bg-[#1A203F] text-slate-300 hover:text-white border border-[#1E2442] text-sm transition cursor-pointer"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          <span>{copied ? 'Скопировано!' : 'Поделиться'}</span>
        </button>
      </div>

      {/* ALBUM VIEW CARD */}
      <div className="flex flex-col md:flex-row items-center md:items-end gap-6 sm:gap-8 p-6 sm:p-8 rounded-3xl border border-[#1E2442] bg-gradient-to-r from-[#0F1123] to-[#0A0B14] shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent pointer-events-none" />

        <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden shrink-0 bg-[#151932] border border-[#1E2442] shadow-lg relative z-10">
          <img
            src={getBestMusicImageUrl(release.coverUrl, 'large')}
            alt={release.title}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex-1 text-center md:text-left space-y-3 relative z-10 min-w-0">
          <div className="text-xs font-bold font-mono tracking-wide text-purple-400 uppercase">
            {release.releaseType === 'ep' ? 'EP' : release.releaseType === 'single' ? 'Сингл' : 'Альбом'}
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
            {release.title}
          </h1>

          <div className="text-sm font-medium flex items-center justify-center md:justify-start gap-1">
            <span className="text-slate-400">Исполнитель:</span>{' '}
            <ArtistLinks
              artistName={release.artist}
              artistId={release.artistId}
              linkClassName="text-purple-400 hover:text-purple-300 font-bold hover:underline"
            />
          </div>

          <div className="flex items-center justify-center md:justify-start gap-3 text-xs font-mono text-slate-400">
            <span>{release.year || '2026'}</span>
            <span>•</span>
            <span>{tracksList.length} треков</span>
          </div>

          <div className="pt-3">
            <button
              onClick={handlePlayAll}
              disabled={tracksList.length === 0}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-lg hover:shadow-purple-500/20"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Слушать весь альбом</span>
            </button>
          </div>
        </div>
      </div>

      {/* TRACKS LIST */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
          <Music2 className="w-4 h-4 text-purple-400" />
          <span>Список треков релиза</span>
        </h3>

        {tracksList.length > 0 ? (
          <div className="space-y-2">
            {tracksList.map((track, idx) => (
              <MusicTrackRow
                key={track.id}
                track={{
                  id: track.id,
                  source: 'youtube',
                  videoId: track.providerTrackId,
                  providerTrackId: track.providerTrackId,
                  title: track.title,
                  artistName: track.artist || release.artist,
                  artistId: release.artistId,
                  releaseTitle: release.title,
                  releaseCover: track.thumbnail || release.coverUrl || null,
                  thumbnail: track.thumbnail || release.coverUrl || null,
                  durationSeconds: track.durationSeconds || null,
                  duration: track.durationSeconds || null,
                  explicit: Boolean(track.explicit),
                  trackNumber: idx + 1,
                  isFavorite: Boolean(favoriteTrackIds[track.id]),
                }}
                index={idx + 1}
                showIndex={true}
                showCover={false}
                queueContext={tracksList.map((t, i) => ({
                  id: t.id,
                  source: 'youtube',
                  videoId: t.providerTrackId,
                  providerTrackId: t.providerTrackId,
                  title: t.title,
                  artistName: t.artist || release.artist,
                  artistId: release.artistId,
                  releaseTitle: release.title,
                  releaseCover: t.thumbnail || release.coverUrl || null,
                  thumbnail: t.thumbnail || release.coverUrl || null,
                  durationSeconds: t.durationSeconds || null,
                  duration: t.durationSeconds || null,
                  explicit: Boolean(t.explicit),
                  trackNumber: i + 1,
                  isFavorite: Boolean(favoriteTrackIds[t.id]),
                }))}
              />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center border border-[#1E2442] bg-[#080A18]/30 rounded-2xl text-slate-500 font-mono text-xs shadow-md">
            Нет доступных треков в данном релизе
          </div>
        )}
      </div>
    </div>
  );
};
