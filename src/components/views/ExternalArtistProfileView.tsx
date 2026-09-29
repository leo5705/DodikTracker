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
  Calendar,
  Clock,
  Sparkles,
  Check,
  AlertTriangle,
  Headphones,
  Plus,
  UserCheck,
  ChevronDown,
  ChevronUp,
  User,
  Heart,
} from 'lucide-react';
import { TrackActionsMenu } from '../music/TrackActionsMenu.tsx';
import { ArtistLinks } from '../music/ArtistLinks.tsx';
import { MusicTrackRow } from '../music/MusicTrackRow.tsx';
import {
  ExternalArtist,
  ExternalRelease,
  ExternalCatalogItem,
  ExternalArtistFullProfile,
} from '../../server/services/externalMusic/types.ts';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';

interface ExternalArtistProfileProps {
  provider: 'youtube';
  artistId: string;
}

export const ExternalArtistProfileView: React.FC<ExternalArtistProfileProps> = ({ provider, artistId }) => {
  const { navigate, goBack } = useRouter();
  const { authFetch, dbUser } = useAuth();
  const { playTrack, currentTrack, isPlaying, addToQueue, toggleFavoriteTrack } = useMusicPlayer();

  const [fullProfile, setFullProfile] = useState<ExternalArtistFullProfile | null>(null);
  const [artist, setArtist] = useState<ExternalArtist | null>(null);
  const [favoriteTrackIds, setFavoriteTrackIds] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [submittingSub, setSubmittingSub] = useState<boolean>(false);

  // Section Expansion toggles
  const [showAllAlbums, setShowAllAlbums] = useState<boolean>(false);
  const [showAllSingles, setShowAllSingles] = useState<boolean>(false);
  const [showAllCompilations, setShowAllCompilations] = useState<boolean>(false);
  const [showAllLive, setShowAllLive] = useState<boolean>(false);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/music/external/artist/${provider}/${artistId}`);
      if (!res.ok) {
        throw new Error('Не удалось загрузить профиль артиста. Сервис временно недоступен.');
      }
      const data = await res.json();
      setArtist(data.artist);
      if (data.fullProfile) {
        setFullProfile(data.fullProfile);
      } else {
        // Fallback fallback construction
        setFullProfile({
          artist: data.artist,
          popularTracks: data.tracks || [],
          latestRelease: data.releases?.[0] || null,
          popularReleases: data.releases || [],
          albums: (data.releases || []).filter((r: ExternalRelease) => r.releaseType === 'album'),
          singlesAndEps: (data.releases || []).filter((r: ExternalRelease) => r.releaseType === 'single' || r.releaseType === 'ep'),
          compilations: (data.releases || []).filter((r: ExternalRelease) => r.releaseType === 'compilation'),
          liveReleases: (data.releases || []).filter((r: ExternalRelease) => r.releaseType === 'live'),
          featuring: [],
          similarArtists: [],
        });
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const toggleSubscribe = async () => {
    if (!dbUser || !artist) return;
    setSubmittingSub(true);
    try {
      const isSub = !!artist.isSubscribed;
      const method = isSub ? 'DELETE' : 'POST';
      const res = await authFetch(`/api/music/external/artists/${provider}/${artistId}/subscribe`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: artist.name, avatar: artist.avatar }),
      });
      if (res.ok) {
        setArtist({ ...artist, isSubscribed: !isSub });
      }
    } catch (err) {
      console.error('Error toggling subscription:', err);
    } finally {
      setSubmittingSub(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [provider, artistId]);

  const handlePlayTrack = (track: ExternalCatalogItem) => {
    const playerTrack = {
      id: track.id,
      source: track.provider,
      providerTrackId: track.providerTrackId,
      videoId: track.provider === 'youtube' ? track.providerTrackId : undefined,
      title: track.title,
      artistName: track.artist,
      releaseTitle: track.album || 'Сингл',
      releaseCover: track.thumbnail || null,
      thumbnail: track.thumbnail || null,
      duration: track.durationSeconds || null,
      explicit: Boolean(track.explicit),
      playable: track.playable !== false,
    };

    const playlist = (fullProfile?.popularTracks || []).map((t) => ({
      id: t.id,
      source: t.provider,
      providerTrackId: t.providerTrackId,
      videoId: t.provider === 'youtube' ? t.providerTrackId : undefined,
      title: t.title,
      artistName: t.artist,
      releaseTitle: t.album || 'Сингл',
      releaseCover: t.thumbnail || null,
      thumbnail: t.thumbnail || null,
      duration: t.durationSeconds || null,
      explicit: Boolean(t.explicit),
      playable: t.playable !== false,
    }));

    playTrack(playerTrack as any, playlist as any, {
      title: track.album || 'Сингл',
      cover: track.thumbnail || null,
      slug: '',
      artistName: track.artist,
      artistSlug: '',
    });
  };

  const handlePlayAll = () => {
    if (fullProfile?.popularTracks && fullProfile.popularTracks.length > 0) {
      handlePlayTrack(fullProfile.popularTracks[0]);
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
        <span className="text-sm font-medium text-slate-400">Загрузка дискографии и профиля артиста...</span>
      </div>
    );
  }

  if (error || !artist || !fullProfile) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-slate-200 mb-2">{error || 'Профиль артиста не найден'}</h2>
        <button
          onClick={() => goBack()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>
      </div>
    );
  }

  const visibleAlbums = showAllAlbums ? fullProfile.albums : fullProfile.albums.slice(0, 6);
  const visibleSingles = showAllSingles ? fullProfile.singlesAndEps : fullProfile.singlesAndEps.slice(0, 6);
  const visibleCompilations = showAllCompilations ? fullProfile.compilations : fullProfile.compilations.slice(0, 6);
  const visibleLive = showAllLive ? fullProfile.liveReleases : fullProfile.liveReleases.slice(0, 6);

  return (
    <div className="pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 pt-4">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => goBack()}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition text-sm font-medium backdrop-blur-md cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>

        <div className="flex items-center gap-2">
          {dbUser && (
            <button
              onClick={toggleSubscribe}
              disabled={submittingSub}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-semibold transition backdrop-blur-md border cursor-pointer ${
                artist.isSubscribed
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                  : 'bg-purple-600 hover:bg-purple-500 text-white border-purple-500/40'
              }`}
            >
              {artist.isSubscribed ? <UserCheck className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{artist.isSubscribed ? 'Вы подписаны' : 'Подписаться'}</span>
            </button>
          )}

          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#11152A] hover:bg-[#1A203F] text-slate-300 hover:text-white border border-[#1E2442] text-sm transition cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            <span>{copied ? 'Скопировано!' : 'Поделиться'}</span>
          </button>
        </div>
      </div>

      {/* HERO ARTIST HEADER */}
      <div className="relative rounded-3xl overflow-hidden border border-[#1E2442] bg-gradient-to-r from-[#0F1123] to-[#0A0B14] p-6 sm:p-8 md:p-10 flex flex-col md:flex-row items-center md:items-end gap-6 sm:gap-8 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

        {artist.avatar ? (
          <img
            src={getBestMusicImageUrl(artist.avatar, 'large')}
            alt={artist.name}
            className="w-36 h-36 sm:w-44 sm:h-44 rounded-full object-cover border-2 border-purple-500/30 shadow-2xl shrink-0 relative z-10"
          />
        ) : (
          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-[#151932] border-2 border-purple-500/30 flex items-center justify-center shrink-0 relative z-10 text-[#8B5CF6]">
            <User className="w-16 h-16" />
          </div>
        )}

        <div className="flex-1 text-center md:text-left space-y-3 relative z-10 min-w-0">
          <div className="flex items-center justify-center md:justify-start gap-2 text-xs font-bold font-mono tracking-wide text-purple-400 uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Музыкальный артист</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight truncate leading-none">
            {artist.name}
          </h1>

          {artist.description && (
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl line-clamp-2">
              {artist.description}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs font-mono text-slate-400">
            {artist.followersCount !== null && artist.followersCount !== undefined && artist.followersCount > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-900/60 px-3 py-1 rounded-full border border-slate-800">
                <Headphones className="w-3.5 h-3.5 text-purple-400" />
                <span>Подписчики: {artist.followersCount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-slate-900/60 px-3 py-1 rounded-full border border-slate-800">
              <Disc className="w-3.5 h-3.5 text-purple-400" />
              <span>Всего релизов: {fullProfile.albums.length + fullProfile.singlesAndEps.length + fullProfile.compilations.length + fullProfile.liveReleases.length}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
            <button
              onClick={handlePlayAll}
              disabled={fullProfile.popularTracks.length === 0}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110 disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-lg shadow-purple-600/30"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Слушать популярное</span>
            </button>
          </div>
        </div>
      </div>

      {/* POPULAR TRACKS & LATEST RELEASE ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Popular Tracks (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <h3 className="text-base font-extrabold text-white font-mono tracking-wider uppercase flex items-center gap-2">
            <Music2 className="w-5 h-5 text-purple-400" />
            <span>Популярные треки</span>
          </h3>

          {fullProfile.popularTracks.length > 0 ? (
            <div className="space-y-2">
              {fullProfile.popularTracks.map((track, idx) => (
                <MusicTrackRow
                  key={`pop-track-${track.id}-${idx}`}
                  track={{
                    id: track.id,
                    source: 'youtube',
                    videoId: track.providerTrackId,
                    providerTrackId: track.providerTrackId,
                    title: track.title,
                    artistName: track.artist || artist?.name || 'Исполнитель',
                    artists: (track as any).artists,
                    artistId: artist?.providerArtistId,
                    releaseTitle: track.album || 'Сингл',
                    releaseCover: track.thumbnail || null,
                    thumbnail: track.thumbnail || null,
                    durationSeconds: track.durationSeconds || null,
                    duration: track.durationSeconds || null,
                    explicit: Boolean(track.explicit),
                    trackNumber: idx + 1,
                    isFavorite: !!favoriteTrackIds[track.id],
                  }}
                  index={idx + 1}
                  showIndex={true}
                  showCover={true}
                  queueContext={fullProfile.popularTracks.map((t, i) => ({
                    id: t.id,
                    source: 'youtube',
                    videoId: t.providerTrackId,
                    providerTrackId: t.providerTrackId,
                    title: t.title,
                    artistName: t.artist || artist?.name || 'Исполнитель',
                    artists: (t as any).artists,
                    artistId: artist?.providerArtistId,
                    releaseTitle: t.album || 'Сингл',
                    releaseCover: t.thumbnail || null,
                    thumbnail: t.thumbnail || null,
                    durationSeconds: t.durationSeconds || null,
                    duration: t.durationSeconds || null,
                    explicit: Boolean(t.explicit),
                    trackNumber: i + 1,
                    isFavorite: !!favoriteTrackIds[t.id],
                  }))}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center border border-[#1E2442] bg-[#080A18]/30 rounded-2xl text-slate-500 font-mono text-xs">
              Нет доступных треков
            </div>
          )}
        </div>

        {/* Latest Release (4 cols) */}
        {fullProfile.latestRelease && (
          <div className="lg:col-span-4 space-y-4">
            <h3 className="text-base font-extrabold text-white font-mono tracking-wider uppercase flex items-center gap-2">
              <Disc className="w-5 h-5 text-purple-400" />
              <span>Последний релиз</span>
            </h3>

            <div
              onClick={() => navigate(`/music/external/release/${fullProfile.latestRelease!.provider}/${fullProfile.latestRelease!.providerReleaseId}`)}
              className="p-5 rounded-3xl bg-[#080A18]/80 hover:bg-[#151932]/60 border border-[#1E2442] hover:border-purple-500/40 transition duration-300 flex flex-col gap-4 cursor-pointer group shadow-xl"
            >
              <div className="aspect-square w-full rounded-2xl overflow-hidden bg-[#151932] border border-[#1E2442] relative">
                <img
                  src={getBestMusicImageUrl(fullProfile.latestRelease.coverUrl, 'large')}
                  alt={fullProfile.latestRelease.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                />
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-purple-400 font-mono uppercase tracking-wider bg-purple-950/50 border border-purple-800/40 px-2 py-0.5 rounded">
                  {fullProfile.latestRelease.releaseType === 'ep' ? 'EP' : fullProfile.latestRelease.releaseType === 'single' ? 'Сингл' : fullProfile.latestRelease.releaseType === 'live' ? 'Концертный альбом' : fullProfile.latestRelease.releaseType === 'compilation' ? 'Компиляция' : 'Альбом'}
                </span>
                <h4 className="text-lg font-extrabold text-white truncate group-hover:text-purple-300 transition-colors pt-1">
                  {fullProfile.latestRelease.title}
                </h4>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span>{fullProfile.latestRelease.year || '2026'}</span>
                  {fullProfile.latestRelease.tracksCount && (
                    <>
                      <span>•</span>
                      <span>{fullProfile.latestRelease.tracksCount} треков</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STUDIO ALBUMS SECTION */}
      {fullProfile.albums.length > 0 && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1E2442]">
            <h3 className="text-lg font-extrabold text-white font-mono tracking-wider uppercase flex items-center gap-2">
              <Disc className="w-5 h-5 text-purple-400" />
              <span>Альбомы ({fullProfile.albums.length})</span>
            </h3>
            {fullProfile.albums.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllAlbums(!showAllAlbums)}
                className="text-xs font-bold font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
              >
                <span>{showAllAlbums ? 'Свернуть' : `Показать все (${fullProfile.albums.length})`}</span>
                {showAllAlbums ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {visibleAlbums.map((rel, idx) => (
              <div
                key={`album-${rel.providerReleaseId}-${idx}`}
                onClick={() => navigate(`/music/external/release/${rel.provider}/${rel.providerReleaseId}`)}
                className="p-3 rounded-2xl bg-[#080A18]/60 hover:bg-[#151932]/60 border border-[#1E2442] hover:border-purple-500/40 transition duration-300 cursor-pointer group flex flex-col justify-between"
              >
                <div className="aspect-square w-full rounded-xl overflow-hidden bg-[#151932] border border-[#1E2442] mb-3 relative">
                  <img
                    src={getBestMusicImageUrl(rel.coverUrl, 'medium')}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-100 truncate group-hover:text-purple-300 transition-colors">
                    {rel.title}
                  </h4>
                  <p className="text-[11px] font-mono text-slate-400">
                    {rel.year || '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SINGLES & EPS SECTION */}
      {fullProfile.singlesAndEps.length > 0 && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1E2442]">
            <h3 className="text-lg font-extrabold text-white font-mono tracking-wider uppercase flex items-center gap-2">
              <Disc className="w-5 h-5 text-indigo-400" />
              <span>Синглы и EP ({fullProfile.singlesAndEps.length})</span>
            </h3>
            {fullProfile.singlesAndEps.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllSingles(!showAllSingles)}
                className="text-xs font-bold font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
              >
                <span>{showAllSingles ? 'Свернуть' : `Показать все (${fullProfile.singlesAndEps.length})`}</span>
                {showAllSingles ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {visibleSingles.map((rel, idx) => (
              <div
                key={`single-${rel.providerReleaseId}-${idx}`}
                onClick={() => navigate(`/music/external/release/${rel.provider}/${rel.providerReleaseId}`)}
                className="p-3 rounded-2xl bg-[#080A18]/60 hover:bg-[#151932]/60 border border-[#1E2442] hover:border-indigo-500/40 transition duration-300 cursor-pointer group flex flex-col justify-between"
              >
                <div className="aspect-square w-full rounded-xl overflow-hidden bg-[#151932] border border-[#1E2442] mb-3 relative">
                  <img
                    src={getBestMusicImageUrl(rel.coverUrl, 'medium')}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-100 truncate group-hover:text-indigo-300 transition-colors">
                    {rel.title}
                  </h4>
                  <p className="text-[11px] font-mono text-slate-400">
                    {rel.year || '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COMPILATIONS SECTION */}
      {fullProfile.compilations.length > 0 && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1E2442]">
            <h3 className="text-lg font-extrabold text-white font-mono tracking-wider uppercase flex items-center gap-2">
              <Disc className="w-5 h-5 text-amber-400" />
              <span>Компиляции и сборники ({fullProfile.compilations.length})</span>
            </h3>
            {fullProfile.compilations.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllCompilations(!showAllCompilations)}
                className="text-xs font-bold font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
              >
                <span>{showAllCompilations ? 'Свернуть' : `Показать все (${fullProfile.compilations.length})`}</span>
                {showAllCompilations ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {visibleCompilations.map((rel, idx) => (
              <div
                key={`compilation-${rel.providerReleaseId}-${idx}`}
                onClick={() => navigate(`/music/external/release/${rel.provider}/${rel.providerReleaseId}`)}
                className="p-3 rounded-2xl bg-[#080A18]/60 hover:bg-[#151932]/60 border border-[#1E2442] hover:border-amber-500/40 transition duration-300 cursor-pointer group flex flex-col justify-between"
              >
                <div className="aspect-square w-full rounded-xl overflow-hidden bg-[#151932] border border-[#1E2442] mb-3 relative">
                  <img
                    src={getBestMusicImageUrl(rel.coverUrl, 'medium')}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-100 truncate group-hover:text-amber-300 transition-colors">
                    {rel.title}
                  </h4>
                  <p className="text-[11px] font-mono text-slate-400">
                    {rel.year || '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LIVE RELEASES SECTION */}
      {fullProfile.liveReleases.length > 0 && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1E2442]">
            <h3 className="text-lg font-extrabold text-white font-mono tracking-wider uppercase flex items-center gap-2">
              <Disc className="w-5 h-5 text-rose-400" />
              <span>Концертные альбомы / Live ({fullProfile.liveReleases.length})</span>
            </h3>
            {fullProfile.liveReleases.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllLive(!showAllLive)}
                className="text-xs font-bold font-mono text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
              >
                <span>{showAllLive ? 'Свернуть' : `Показать все (${fullProfile.liveReleases.length})`}</span>
                {showAllLive ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {visibleLive.map((rel, idx) => (
              <div
                key={`live-${rel.providerReleaseId}-${idx}`}
                onClick={() => navigate(`/music/external/release/${rel.provider}/${rel.providerReleaseId}`)}
                className="p-3 rounded-2xl bg-[#080A18]/60 hover:bg-[#151932]/60 border border-[#1E2442] hover:border-rose-500/40 transition duration-300 cursor-pointer group flex flex-col justify-between"
              >
                <div className="aspect-square w-full rounded-xl overflow-hidden bg-[#151932] border border-[#1E2442] mb-3 relative">
                  <img
                    src={getBestMusicImageUrl(rel.coverUrl, 'medium')}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-100 truncate group-hover:text-rose-300 transition-colors">
                    {rel.title}
                  </h4>
                  <p className="text-[11px] font-mono text-slate-400">
                    {rel.year || '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FEATURING / PARTICIPATION SECTION */}
      {fullProfile.featuring.length > 0 && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1E2442]">
            <h3 className="text-lg font-extrabold text-white font-mono tracking-wider uppercase flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <span>Участие / Featuring ({fullProfile.featuring.length})</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {fullProfile.featuring.map((featTrack, idx) => (
              <div
                key={`feat-${featTrack.id}-${idx}`}
                onClick={() => handlePlayTrack(featTrack)}
                className="p-3.5 rounded-2xl bg-[#080A18]/60 hover:bg-[#151932]/60 border border-[#1E2442] hover:border-emerald-500/40 transition duration-300 flex items-center gap-3.5 cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#151932] border border-[#1E2442] shrink-0 relative">
                  <img
                    src={getBestMusicImageUrl(featTrack.thumbnail, 'small')}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-slate-100 truncate group-hover:text-emerald-300 transition-colors">
                    {featTrack.title}
                  </h4>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{featTrack.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SIMILAR ARTISTS SECTION */}
      {fullProfile.similarArtists.length > 0 && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1E2442]">
            <h3 className="text-lg font-extrabold text-white font-mono tracking-wider uppercase flex items-center gap-2">
              <User className="w-5 h-5 text-violet-400" />
              <span>Похожие артисты</span>
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {fullProfile.similarArtists.map((sa, idx) => (
              <div
                key={`sa-${sa.providerArtistId}-${idx}`}
                onClick={() => navigate(`/music/external/artist/${sa.provider}/${sa.providerArtistId}`)}
                className="p-4 rounded-2xl bg-[#080A18]/60 hover:bg-[#151932]/60 border border-[#1E2442] hover:border-violet-500/40 transition duration-300 flex flex-col items-center text-center cursor-pointer group space-y-3"
              >
                {sa.avatar ? (
                  <img
                    src={getBestMusicImageUrl(sa.avatar, 'medium')}
                    alt={sa.name}
                    className="w-20 h-20 rounded-full object-cover border border-[#1E2442] group-hover:scale-105 transition duration-300 shadow-md"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-[#151932] border border-[#1E2442] flex items-center justify-center text-violet-400">
                    <User className="w-8 h-8" />
                  </div>
                )}
                <h4 className="text-xs font-bold text-slate-200 truncate w-full group-hover:text-violet-300 transition-colors">
                  {sa.name}
                </h4>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
