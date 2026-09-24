import React, { useState, useEffect, useRef } from 'react';
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
  MessageSquare,
  Star,
  Sparkles,
  UserCheck,
  FileText,
  Volume2,
  VolumeX,
  ExternalLink,
  Edit3,
  ListMusic,
  Check,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ArtistProfile {
  id: number;
  userId: number;
  stageName: string;
  slug: string;
  avatar: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  username?: string;
  userAvatar?: string | null;
  userRole?: string;
}

interface Release {
  id: number;
  artistId: number;
  title: string;
  slug: string;
  type: 'SINGLE' | 'EP' | 'ALBUM';
  description: string | null;
  cover: string | null;
  releaseDate: string | null;
  status: string;
  createdAt: string;
  avgScore: number;
  reviewsCount: number;
  tracksCount: number;
}

interface Track {
  id: number;
  releaseId: number;
  releaseTitle: string;
  releaseCover: string | null;
  releaseSlug: string;
  title: string;
  slug: string;
  trackNumber: number;
  audioFile: string | null;
  duration: number | null;
  explicit: boolean;
  lyrics: string | null;
  authorNote: string | null;
  createdAt: string;
}

interface Review {
  id: number;
  releaseId: number;
  releaseTitle: string;
  releaseCover: string | null;
  overallScore: number;
  musicScore: number;
  performanceScore: number;
  productionScore: number;
  lyricsScore: number;
  atmosphereScore: number;
  cohesionScore: number;
  text: string | null;
  createdAt: string;
  username: string;
  userAvatar: string | null;
}

interface ArtistStats {
  totalReleases: number;
  totalTracks: number;
  totalReviews: number;
  avgOverallScore: number;
}

export const ArtistProfileView: React.FC<{ idOrSlug: string }> = ({ idOrSlug }) => {
  const { navigate, goBack } = useRouter();
  const { dbUser } = useAuth();
  const { playTrack, currentTrack, isPlaying } = useMusicPlayer();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ArtistStats>({
    totalReleases: 0,
    totalTracks: 0,
    totalReviews: 0,
    avgOverallScore: 0,
  });

  // UI state
  const [activeTab, setActiveTab] = useState<'releases' | 'tracks' | 'reviews'>('releases');
  const [releaseFilter, setReleaseFilter] = useState<'ALL' | 'ALBUM' | 'EP' | 'SINGLE'>('ALL');
  const [copied, setCopied] = useState(false);
  const [selectedLyricsTrack, setSelectedLyricsTrack] = useState<Track | null>(null);
  const [selectedNoteTrack, setSelectedNoteTrack] = useState<Track | null>(null);

  useEffect(() => {
    fetchArtist();
  }, [idOrSlug]);

  const fetchArtist = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/music/artists/${idOrSlug}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Музыкальный исполнитель не найден');
        }
        throw new Error('Ошибка при загрузке профиля исполнителя');
      }
      const data = await res.json();
      setArtist(data.artist);
      setReleases(data.releases || []);
      setTracks(data.tracks || []);
      setReviews(data.reviews || []);
      setStats(data.stats || { totalReleases: 0, totalTracks: 0, totalReviews: 0, avgOverallScore: 0 });
    } catch (err: any) {
      setError(err.message || 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  // Audio playback handler using global player context
  const handlePlayTrack = (track: Track) => {
    playTrack(track as any, tracks as any, {
      title: track.releaseTitle,
      cover: track.releaseCover,
      slug: track.releaseSlug,
      artistName: artist?.stageName || 'Исполнитель',
      artistSlug: artist?.slug || '',
    });
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

  const filteredReleases = releases.filter((r) => {
    if (releaseFilter === 'ALL') return true;
    return r.type === releaseFilter;
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (score >= 60) return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    if (score >= 40) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    if (score > 0) return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    return 'text-slate-400 bg-slate-800/50 border-slate-700/50';
  };

  const getReleaseTypeBadge = (type: string) => {
    switch (type) {
      case 'ALBUM':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">АЛЬБОМ</span>;
      case 'EP':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">EP</span>;
      case 'SINGLE':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">СИНГЛ</span>;
      default:
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-800 text-slate-300">{type}</span>;
    }
  };

  const isOwner = dbUser && artist && dbUser.id === artist.userId;
  const isAdmin = dbUser && (dbUser.role === 'ADMIN' || dbUser.role === 'SUPER_ADMIN');

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        <span className="text-sm font-medium text-slate-400">Загрузка профиля исполнителя...</span>
      </div>
    );
  }

  if (error || !artist) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-slate-200 mb-2">{error || 'Исполнитель не найден'}</h2>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          Возможно, профиль исполнителя еще не одобрен администрацией или указан неверный адрес.
        </p>
        <button
          onClick={() => goBack()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition"
        >
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>
      </div>
    );
  }

  return (
    <div className="pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 pt-4">
      {/* Top Header / Nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => goBack()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition text-sm font-medium backdrop-blur-md"
        >
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition text-sm font-medium backdrop-blur-md"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            {copied ? 'Ссылка скопирована' : 'Поделиться'}
          </button>

          {(isOwner || isAdmin) && (
            <button
              onClick={() => navigate('/music/studio')}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white text-sm font-semibold shadow-lg shadow-purple-900/30 transition"
            >
              <Edit3 className="w-4 h-4" /> В студию
            </button>
          )}
        </div>
      </div>

      {/* Hero Banner Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F1322] via-[#12182E] to-[#0A0D1B] border border-cyan-500/20 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        {/* Glow ambient background elements */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-cyan-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-8">
          {/* Avatar */}
          <div className="relative shrink-0">
            {artist.avatar ? (
              <img
                src={artist.avatar}
                alt={artist.stageName}
                className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl object-cover border-2 border-cyan-500/30 shadow-2xl shadow-cyan-950/50"
              />
            ) : (
              <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-gradient-to-br from-cyan-950/80 to-purple-950/80 border-2 border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-2xl shadow-cyan-950/50">
                <Music2 className="w-16 h-16 opacity-80" />
              </div>
            )}
            <span className="absolute -bottom-2 -right-2 p-1.5 rounded-xl bg-cyan-500 text-slate-950 shadow-lg" title="Верифицированный музыкант">
              <Sparkles className="w-4 h-4" />
            </span>
          </div>

          {/* Details */}
          <div className="flex-1 text-center md:text-left space-y-3">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold tracking-wide uppercase">
                <Music2 className="w-3.5 h-3.5" /> Исполнитель
              </span>
              {artist.username && (
                <button
                  onClick={() => navigate(`/u/${artist.username}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white text-xs font-semibold transition"
                >
                  <UserCheck className="w-3.5 h-3.5 text-purple-400" />
                  @{artist.username}
                </button>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
              {artist.stageName}
            </h1>

            {artist.description && (
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl font-normal">
                {artist.description}
              </p>
            )}

            {/* Stats Cards */}
            <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
              <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md">
                <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Disc className="w-3.5 h-3.5 text-cyan-400" /> Релизы
                </div>
                <div className="text-xl font-bold text-white mt-1 font-mono">{stats.totalReleases}</div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md">
                <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <ListMusic className="w-3.5 h-3.5 text-purple-400" /> Треки
                </div>
                <div className="text-xl font-bold text-white mt-1 font-mono">{stats.totalTracks}</div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md">
                <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-400" /> Рецензии
                </div>
                <div className="text-xl font-bold text-white mt-1 font-mono">{stats.totalReviews}</div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md">
                <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-emerald-400" /> Ср. оценка
                </div>
                <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">
                  {stats.avgOverallScore > 0 ? `${stats.avgOverallScore}/100` : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="border-b border-slate-800/80 flex items-center justify-between gap-4 overflow-x-auto pb-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('releases')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition ${
              activeTab === 'releases'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Disc className="w-4 h-4" /> Дискография ({releases.length})
          </button>

          <button
            onClick={() => setActiveTab('tracks')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition ${
              activeTab === 'tracks'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <ListMusic className="w-4 h-4" /> Все треки ({tracks.length})
          </button>

          <button
            onClick={() => setActiveTab('reviews')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition ${
              activeTab === 'reviews'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Рецензии ({reviews.length})
          </button>
        </div>

        {activeTab === 'releases' && (
          <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            {(['ALL', 'ALBUM', 'EP', 'SINGLE'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setReleaseFilter(filter)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  releaseFilter === filter
                    ? 'bg-cyan-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {filter === 'ALL' ? 'Все' : filter === 'ALBUM' ? 'Альбомы' : filter}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab Contents */}
      {/* 1. Releases Tab */}
      {activeTab === 'releases' && (
        <div className="space-y-6">
          {filteredReleases.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 text-slate-400">
              <Disc className="w-12 h-12 mx-auto mb-3 opacity-40 text-cyan-400" />
              <p className="font-semibold text-slate-300">Релизы не найдены</p>
              <p className="text-xs mt-1 text-slate-500">У исполнителя пока нет опубликованных релизов в этой категории</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
              {filteredReleases.map((rel) => (
                <div
                  key={rel.id}
                  onClick={() => navigate(`/music/release/${rel.slug || rel.id}`)}
                  className="group relative flex flex-col rounded-2xl bg-slate-900/50 border border-slate-800/80 overflow-hidden hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-950/20 transition-all cursor-pointer backdrop-blur-md"
                >
                  {/* Cover */}
                  <div className="relative aspect-square overflow-hidden bg-slate-950">
                    {rel.cover ? (
                      <img
                        src={rel.cover}
                        alt={rel.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950 text-slate-700 group-hover:text-cyan-500 transition-colors">
                        <Disc className="w-16 h-16 opacity-60" />
                      </div>
                    )}

                    {/* Top Type Badge */}
                    <div className="absolute top-2 left-2">
                      {getReleaseTypeBadge(rel.type)}
                    </div>

                    {/* Avg Score Badge */}
                    {rel.avgScore > 0 && (
                      <div className="absolute top-2 right-2">
                        <span className={`px-2 py-0.5 text-xs font-bold font-mono rounded-lg border backdrop-blur-md ${getScoreColor(rel.avgScore)}`}>
                          {rel.avgScore}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3.5 flex flex-col flex-1 justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-white text-sm line-clamp-1 group-hover:text-cyan-300 transition-colors">
                        {rel.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <span>{rel.releaseDate ? rel.releaseDate.substring(0, 4) : 'Скоро'}</span>
                        <span>•</span>
                        <span>{rel.tracksCount} {rel.tracksCount === 1 ? 'трек' : rel.tracksCount < 5 ? 'трека' : 'треков'}</span>
                      </p>
                    </div>

                    {rel.reviewsCount > 0 && (
                      <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3 text-amber-400" />
                        <span>{rel.reviewsCount} {rel.reviewsCount === 1 ? 'рецензия' : 'рецензий'}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Tracks Tab */}
      {activeTab === 'tracks' && (
        <div className="space-y-4">
          {tracks.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 text-slate-400">
              <ListMusic className="w-12 h-12 mx-auto mb-3 opacity-40 text-purple-400" />
              <p className="font-semibold text-slate-300">Треки отсутствуют</p>
              <p className="text-xs mt-1 text-slate-500">Исполнитель еще не опубликовал ни одного трека</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 overflow-hidden divide-y divide-slate-800/60 backdrop-blur-md">
              {tracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isThisPlaying = isCurrent && isPlaying;

                return (
                  <div
                    key={track.id}
                    className={`flex items-center justify-between p-3.5 sm:px-5 hover:bg-slate-800/40 transition gap-3 sm:gap-4 ${
                      isCurrent ? 'bg-cyan-500/10' : ''
                    }`}
                  >
                    {/* Left: Number & Play */}
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => handlePlayTrack(track)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition ${
                          isThisPlaying
                            ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                            : 'bg-slate-800/80 hover:bg-cyan-500 hover:text-slate-950 text-slate-300 border border-slate-700/60'
                        }`}
                        title={isThisPlaying ? 'Пауза' : 'Воспроизвести'}
                      >
                        {isThisPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                      </button>

                      {/* Cover thumbnail */}
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-slate-950 border border-slate-800">
                        {track.releaseCover ? (
                          <img src={track.releaseCover} alt={track.releaseTitle} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-600">
                            <Disc className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      {/* Title & Release */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className={`font-bold text-sm truncate ${isCurrent ? 'text-cyan-300' : 'text-slate-100'}`}>
                            {track.title}
                          </h4>
                          {track.explicit && (
                            <span className="px-1.5 py-0.2 text-[10px] font-black rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase shrink-0">
                              E
                            </span>
                          )}
                        </div>

                        <p
                          onClick={() => navigate(`/music/release/${track.releaseSlug || track.releaseId}`)}
                          className="text-xs text-slate-400 hover:text-cyan-400 transition cursor-pointer truncate"
                        >
                          Релиз: {track.releaseTitle}
                        </p>
                      </div>
                    </div>

                    {/* Right: Actions & Duration */}
                    <div className="flex items-center gap-3 shrink-0">
                      {track.lyrics && (
                        <button
                          onClick={() => setSelectedLyricsTrack(track)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-semibold transition flex items-center gap-1.5"
                          title="Посмотреть текст песни"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Текст</span>
                        </button>
                      )}

                      {track.authorNote && (
                        <button
                          onClick={() => setSelectedNoteTrack(track)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-semibold transition flex items-center gap-1.5"
                          title="Заметка автора"
                        >
                          <Info className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Заметка</span>
                        </button>
                      )}

                      <span className="text-xs font-mono font-medium text-slate-400 w-12 text-right">
                        {formatDuration(track.duration)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. Reviews Tab */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {reviews.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 text-slate-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40 text-amber-400" />
              <p className="font-semibold text-slate-300">Рецензий пока нет</p>
              <p className="text-xs mt-1 text-slate-500">Будьте первым, кто напишет рецензию на релиз этого исполнителя</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 transition flex flex-col justify-between gap-4 backdrop-blur-md"
                >
                  <div className="space-y-3">
                    {/* Top Review Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {rev.userAvatar ? (
                          <img src={rev.userAvatar} alt={rev.username} className="w-9 h-9 rounded-full object-cover border border-slate-700" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-purple-950 border border-purple-800 text-purple-300 flex items-center justify-center font-bold text-xs">
                            {rev.username?.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div>
                          <p
                            onClick={() => navigate(`/u/${rev.username}`)}
                            className="text-sm font-bold text-slate-200 hover:text-cyan-300 transition cursor-pointer"
                          >
                            @{rev.username}
                          </p>
                          <p
                            onClick={() => navigate(`/music/${rev.releaseId}`)}
                            className="text-xs text-slate-400 hover:text-cyan-400 transition cursor-pointer"
                          >
                            на релиз: <span className="font-semibold text-slate-300">{rev.releaseTitle}</span>
                          </p>
                        </div>
                      </div>

                      {/* Score badge */}
                      <span className={`px-3 py-1 rounded-xl text-sm font-black font-mono border ${getScoreColor(rev.overallScore)}`}>
                        {rev.overallScore}/100
                      </span>
                    </div>

                    {/* Breakdown scores */}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 text-[11px] font-mono text-center">
                      <div>
                        <div className="text-slate-500 text-[10px]">Музыка</div>
                        <div className="font-bold text-cyan-300">{rev.musicScore}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">Исполнение</div>
                        <div className="font-bold text-cyan-300">{rev.performanceScore}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">Продакшн</div>
                        <div className="font-bold text-cyan-300">{rev.productionScore}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">Текст</div>
                        <div className="font-bold text-cyan-300">{rev.lyricsScore}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">Атмосфера</div>
                        <div className="font-bold text-cyan-300">{rev.atmosphereScore}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">Целостность</div>
                        <div className="font-bold text-cyan-300">{rev.cohesionScore}</div>
                      </div>
                    </div>

                    {/* Review text */}
                    {rev.text && (
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed italic bg-slate-950/30 p-3 rounded-xl border border-slate-800/40">
                        "{rev.text}"
                      </p>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500 font-mono text-right">
                    {new Date(rev.createdAt).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lyrics Modal */}
      {selectedLyricsTrack && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="font-bold text-slate-100">{selectedLyricsTrack.title}</h3>
                  <p className="text-xs text-slate-400">Текст песни</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLyricsTrack(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto whitespace-pre-wrap font-sans text-sm sm:text-base text-slate-200 leading-relaxed bg-slate-950/30">
              {selectedLyricsTrack.lyrics}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-right">
              <button
                onClick={() => setSelectedLyricsTrack(null)}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Author Note Modal */}
      {selectedNoteTrack && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full flex flex-col overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-3">
                <Info className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-slate-100">{selectedNoteTrack.title}</h3>
                  <p className="text-xs text-slate-400">Авторская заметка</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedNoteTrack(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 text-sm text-slate-300 leading-relaxed bg-slate-950/30 italic">
              "{selectedNoteTrack.authorNote}"
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-right">
              <button
                onClick={() => setSelectedNoteTrack(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
