import React, { useState, useEffect } from 'react';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useMusicPlayer, Track } from '../../context/MusicPlayerContext.tsx';
import {
  Disc,
  Play,
  Pause,
  ArrowLeft,
  Share2,
  Star,
  Sparkles,
  FileText,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Music2,
  Edit3,
  X,
  Trash2,
  SlidersHorizontal,
  LogIn,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

interface Genre {
  id: number;
  name: string;
  slug: string;
}

interface ReleaseData {
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
  stageName: string;
  artistSlug: string;
  artistAvatar: string | null;
  artistUserId: number;
  artistDescription: string | null;
}

interface ReviewStats {
  reviewsCount: number;
  avgOverallScore: number;
  avgMusicScore: number;
  avgPerformanceScore: number;
  avgProductionScore: number;
  avgLyricsScore: number;
  avgAtmosphereScore: number;
  avgCohesionScore: number;
}

interface Review {
  id: number;
  userId: number;
  releaseId: number;
  musicScore: number;
  performanceScore: number;
  productionScore: number;
  lyricsScore: number;
  atmosphereScore: number;
  cohesionScore: number;
  overallScore: number;
  text: string | null;
  createdAt: string;
  updatedAt: string;
  username: string;
  userAvatar: string | null;
}

const REVIEW_CRITERIA = [
  { key: 'musicScore', label: 'Музыка', desc: 'Мелодия, гармония, аранжировка, ритмический рисунок' },
  { key: 'performanceScore', label: 'Исполнение', desc: 'Вокал, инструментальное мастерство, техничность' },
  { key: 'productionScore', label: 'Продакшн', desc: 'Сведение, мастеринг, качество звука, саунд-дизайн' },
  { key: 'lyricsScore', label: 'Текст', desc: 'Смысловое наполнение, рифмы, метафоры, посыл' },
  { key: 'atmosphereScore', label: 'Атмосфера', desc: 'Погружение, вайб, эмоциональный отклик, настроение' },
  { key: 'cohesionScore', label: 'Целостность', desc: 'Связанность треков, концепция, драматургия релиза' },
] as const;

export const MusicReleaseView: React.FC<{ idOrSlug: string }> = ({ idOrSlug }) => {
  const { navigate } = useRouter();
  const { dbUser } = useAuth();
  const { playTrack, currentTrack, isPlaying } = useMusicPlayer();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [release, setRelease] = useState<ReleaseData | null>(null);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [userReview, setUserReview] = useState<Review | null>(null);

  // Reviews list & pagination & sorting
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [hasMoreReviews, setHasMoreReviews] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewSort, setReviewSort] = useState<'newest' | 'highest' | 'lowest'>('newest');

  // Track accordion toggles for lyrics & notes
  const [expandedLyricsTrackId, setExpandedLyricsTrackId] = useState<number | null>(null);
  const [expandedNoteTrackId, setExpandedNoteTrackId] = useState<number | null>(null);

  // Accordion for expanded review score details in review cards
  const [expandedReviewIds, setExpandedReviewIds] = useState<number[]>([]);

  // UI state
  const [copied, setCopied] = useState(false);

  // Review Form & Modal State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    musicScore: 80,
    performanceScore: 80,
    productionScore: 80,
    lyricsScore: 80,
    atmosphereScore: 80,
    cohesionScore: 80,
    text: '',
  });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState<string | null>(null);

  // Delete review state
  const [isDeletingReview, setIsDeletingReview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchRelease();
  }, [idOrSlug]);

  const fetchRelease = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/music/releases/${idOrSlug}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Музыкальный релиз не найден');
        }
        throw new Error('Ошибка при загрузке информации о релизе');
      }

      const data = await res.json();
      setRelease(data.release);
      setGenres(data.genres || []);
      setTracks(data.tracks || []);
      setStats(data.stats || null);
      setUserReview(data.userReview || null);

      if (data.userReview) {
        setReviewForm({
          musicScore: data.userReview.musicScore,
          performanceScore: data.userReview.performanceScore,
          productionScore: data.userReview.productionScore,
          lyricsScore: data.userReview.lyricsScore,
          atmosphereScore: data.userReview.atmosphereScore,
          cohesionScore: data.userReview.cohesionScore,
          text: data.userReview.text || '',
        });
      }

      if (data.release?.id) {
        fetchReviews(data.release.id, 1, reviewSort);
      }
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка при загрузке');
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async (releaseId: number, page: number, sort: string = reviewSort) => {
    setLoadingReviews(true);
    try {
      const res = await fetch(`/api/music/releases/${releaseId}/reviews?page=${page}&limit=10&sort=${sort}`);
      if (res.ok) {
        const data = await res.json();
        if (page === 1) {
          setReviews(data.reviews || []);
        } else {
          setReviews((prev) => [...prev, ...(data.reviews || [])]);
        }
        setHasMoreReviews(page < (data.pagination?.totalPages || 1));
        setReviewsPage(page);
      }
    } catch (err) {
      console.error('Error fetching reviews:', err);
    } finally {
      setLoadingReviews(false);
    }
  };

  const handleSortChange = (newSort: 'newest' | 'highest' | 'lowest') => {
    setReviewSort(newSort);
    if (release) {
      fetchReviews(release.id, 1, newSort);
    }
  };

  const handleLoadMoreReviews = () => {
    if (release && hasMoreReviews && !loadingReviews) {
      fetchReviews(release.id, reviewsPage + 1, reviewSort);
    }
  };

  const toggleReviewAccordion = (id: number) => {
    setExpandedReviewIds((prev) =>
      prev.includes(id) ? prev.filter((rId) => rId !== id) : [...prev, id]
    );
  };

  const handlePlayFirstTrack = () => {
    if (!tracks || tracks.length === 0 || !release) return;
    const firstTrack = tracks[0];
    playTrack(firstTrack, tracks, {
      id: release.id,
      title: release.title,
      cover: release.cover,
      slug: release.slug,
      artistName: release.stageName,
      artistSlug: release.artistSlug,
    });
  };

  const handlePlaySpecificTrack = (track: Track) => {
    if (!release) return;
    playTrack(track, tracks, {
      id: release.id,
      title: release.title,
      cover: release.cover,
      slug: release.slug,
      artistName: release.stageName,
      artistSlug: release.artistSlug,
    });
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: `${release?.title} - ${release?.stageName}`,
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenReviewModal = () => {
    setReviewError(null);
    setReviewSuccessMsg(null);
    if (userReview) {
      setReviewForm({
        musicScore: userReview.musicScore,
        performanceScore: userReview.performanceScore,
        productionScore: userReview.productionScore,
        lyricsScore: userReview.lyricsScore,
        atmosphereScore: userReview.atmosphereScore,
        cohesionScore: userReview.cohesionScore,
        text: userReview.text || '',
      });
    }
    setIsReviewModalOpen(true);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!release) return;

    setSubmittingReview(true);
    setReviewError(null);
    setReviewSuccessMsg(null);

    try {
      const res = await fetch(`/api/music/releases/${release.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewForm),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось сохранить рецензию. Попробуйте ещё раз.');
      }

      setUserReview(data.review);
      setReviewSuccessMsg('Рецензия успешно сохранена!');
      setTimeout(() => {
        setIsReviewModalOpen(false);
        setReviewSuccessMsg(null);
      }, 1200);

      // Refresh release data to update statistics and review list
      fetchRelease();
    } catch (err: any) {
      setReviewError(err.message || 'Произошла ошибка при сохранении рецензии');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!userReview || !release) return;

    setIsDeletingReview(true);
    try {
      const res = await fetch(`/api/music/reviews/${userReview.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось удалить рецензию');
      }

      setUserReview(null);
      setShowDeleteConfirm(false);
      setIsReviewModalOpen(false);

      // Reset form defaults
      setReviewForm({
        musicScore: 80,
        performanceScore: 80,
        productionScore: 80,
        lyricsScore: 80,
        atmosphereScore: 80,
        cohesionScore: 80,
        text: '',
      });

      // Refresh release data to update community stats
      fetchRelease();
    } catch (err: any) {
      alert(err.message || 'Ошибка при удалении');
    } finally {
      setIsDeletingReview(false);
    }
  };

  const formatDuration = (secs: number | null | undefined) => {
    if (!secs || isNaN(secs) || secs <= 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const calculateTotalDurationSeconds = () => {
    return tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  };

  const formatTotalDurationText = (totalSecs: number) => {
    if (totalSecs <= 0) return '';
    const mins = Math.floor(totalSecs / 60);
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hours} ч ${remMins} мин`;
    }
    return `${mins} мин`;
  };

  const getReleaseTypeLabel = (type: string) => {
    switch (type) {
      case 'ALBUM':
        return 'АЛЬБОМ';
      case 'EP':
        return 'EP';
      case 'SINGLE':
        return 'СИНГЛ';
      default:
        return type;
    }
  };

  const getReleaseTypeBadgeStyle = (type: string) => {
    switch (type) {
      case 'ALBUM':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'EP':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'SINGLE':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getScoreColorClass = (score: number) => {
    if (score >= 85) return 'text-purple-300 bg-purple-500/15 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]';
    if (score >= 70) return 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30';
    if (score >= 50) return 'text-amber-300 bg-amber-500/15 border-amber-500/30';
    if (score > 0) return 'text-rose-400 bg-rose-500/15 border-rose-500/30';
    return 'text-slate-400 bg-slate-800/50 border-slate-700/50';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 space-y-6 animate-pulse">
        <div className="w-full max-w-5xl flex flex-col md:flex-row gap-8 items-center">
          <div className="w-64 h-64 bg-slate-800/60 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-4 w-full">
            <div className="h-4 bg-slate-800/60 rounded w-24" />
            <div className="h-8 bg-slate-800/60 rounded w-3/4" />
            <div className="h-5 bg-slate-800/60 rounded w-1/2" />
            <div className="h-12 bg-slate-800/60 rounded-xl w-40 mt-4" />
          </div>
        </div>
        <div className="w-full max-w-5xl h-64 bg-slate-800/40 rounded-2xl" />
      </div>
    );
  }

  if (error || !release) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4">
          <AlertTriangle className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{error || 'Релиз не найден'}</h2>
        <p className="text-slate-400 text-sm max-w-md mb-6">
          Возможно, релиз ещё находится на модерации или был удалён автором.
        </p>
        <button
          onClick={() => navigate('/search')}
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-500/20"
        >
          <ArrowLeft className="w-4 h-4" /> Вернуться в музыку
        </button>
      </div>
    );
  }

  const isExplicitRelease = tracks.some((t) => t.explicit);
  const totalSecs = calculateTotalDurationSeconds();

  // Frontend Live Calculated Preview Score
  const calculatedLiveScore = Math.round(((reviewForm.musicScore + reviewForm.performanceScore + reviewForm.productionScore + reviewForm.lyricsScore + reviewForm.atmosphereScore + reviewForm.cohesionScore) / 6.0) * 10) / 10;

  return (
    <div className="relative min-h-screen text-slate-100 pb-20">
      {/* Background Visual Effect based on Cover */}
      {release.cover && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <img
            src={release.cover}
            alt=""
            className="w-full h-full object-cover scale-125 blur-3xl opacity-15"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#080A18]/80 via-[#080A18]/95 to-[#080A18]" />
        </div>
      )}

      <div className="relative z-10 space-y-8 max-w-5xl mx-auto">
        {/* Navigation Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <button
            onClick={() => navigate('/search')}
            className="hover:text-purple-400 transition-colors cursor-pointer"
          >
            Музыка
          </button>
          <span>/</span>
          <button
            onClick={() => navigate(`/music/artist/${release.artistSlug}`)}
            className="hover:text-purple-400 transition-colors cursor-pointer truncate max-w-[150px]"
          >
            {release.stageName}
          </button>
          <span>/</span>
          <span className="text-white font-semibold truncate max-w-[200px]">{release.title}</span>
        </nav>

        {/* HERO SECTION */}
        <section className="p-6 md:p-8 rounded-3xl bg-[#11152A]/80 backdrop-blur-2xl border border-[#1E2442] shadow-2xl flex flex-col md:flex-row gap-8 items-center md:items-start">
          {/* Cover image */}
          <div className="relative group w-56 h-56 md:w-64 md:h-64 rounded-2xl overflow-hidden shrink-0 shadow-2xl border border-white/10 bg-slate-900">
            {release.cover ? (
              <img
                src={release.cover}
                alt={release.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-900/40 to-slate-900 text-purple-400 p-4 text-center">
                <Disc className="w-16 h-16 mb-2 stroke-1" />
                <span className="text-xs font-mono">{release.title}</span>
              </div>
            )}
            {isExplicitRelease && (
              <span className="absolute top-3 right-3 px-2 py-0.5 text-xs font-black rounded-md bg-rose-600/90 text-white shadow-lg backdrop-blur-md border border-rose-400/30">
                18+
              </span>
            )}
          </div>

          {/* Release Main Info */}
          <div className="flex-1 min-w-0 space-y-4 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
              <span
                className={`px-2.5 py-0.5 text-[11px] font-bold tracking-wider rounded-md border ${getReleaseTypeBadgeStyle(
                  release.type
                )}`}
              >
                {getReleaseTypeLabel(release.type)}
              </span>

              {genres.map((g) => (
                <span
                  key={g.id}
                  className="px-2.5 py-0.5 text-[11px] font-medium rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60"
                >
                  {g.name}
                </span>
              ))}
            </div>

            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">
              {release.title}
            </h1>

            {/* Artist Link */}
            <div className="flex items-center justify-center md:justify-start gap-3">
              {release.artistAvatar ? (
                <img
                  src={release.artistAvatar}
                  alt={release.stageName}
                  className="w-8 h-8 rounded-full object-cover border border-purple-500/30"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-purple-600/20 text-purple-300 flex items-center justify-center font-bold text-xs border border-purple-500/30">
                  {release.stageName.charAt(0).toUpperCase()}
                </div>
              )}
              <button
                onClick={() => navigate(`/music/artist/${release.artistSlug}`)}
                className="text-lg font-bold text-purple-300 hover:text-purple-200 hover:underline transition-colors cursor-pointer"
              >
                {release.stageName}
              </button>
            </div>

            {/* Release Metadata */}
            <div className="flex items-center justify-center md:justify-start gap-2 text-xs text-slate-400 font-medium">
              {release.releaseDate && <span>{formatDate(release.releaseDate)}</span>}
              {release.releaseDate && <span className="text-slate-600">·</span>}
              <span>{tracks.length} {tracks.length === 1 ? 'трек' : tracks.length >= 2 && tracks.length <= 4 ? 'трека' : 'треков'}</span>
              {totalSecs > 0 && (
                <>
                  <span className="text-slate-600">·</span>
                  <span>{formatTotalDurationText(totalSecs)}</span>
                </>
              )}
            </div>

            {/* Rating Summary in Hero */}
            <div className="pt-2 flex items-center justify-center md:justify-start gap-4 flex-wrap">
              {/* Community Score */}
              {stats && stats.reviewsCount > 0 ? (
                <div className="flex items-center gap-2.5 bg-slate-900/60 p-1.5 pr-3 rounded-2xl border border-slate-800">
                  <div className={`px-3 py-1 rounded-xl font-mono text-sm font-black border ${getScoreColorClass(stats.avgOverallScore)}`}>
                    {stats.avgOverallScore.toFixed(1)}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Оценка сообщества</span>
                    <span className="text-xs text-slate-300 font-semibold">
                      {stats.reviewsCount} {stats.reviewsCount === 1 ? 'рецензия' : stats.reviewsCount >= 2 && stats.reviewsCount <= 4 ? 'рецензии' : 'рецензий'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900/60 px-3.5 py-1.5 rounded-2xl border border-slate-800 text-xs font-medium text-slate-500">
                  Пока нет оценок сообщества
                </div>
              )}

              {/* My Score Badge if user reviewed */}
              {userReview && (
                <div className="flex items-center gap-2 bg-purple-950/40 p-1.5 pr-3 rounded-2xl border border-purple-500/30">
                  <div className="px-3 py-1 rounded-xl font-mono text-sm font-black bg-purple-600 text-white shadow-md">
                    {userReview.overallScore.toFixed(1)}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-purple-300 block tracking-wider">Моя оценка</span>
                    <span className="text-xs text-purple-200 font-semibold">из 100</span>
                  </div>
                </div>
              )}
            </div>

            {/* Hero Action Buttons */}
            <div className="pt-4 flex items-center justify-center md:justify-start gap-3 flex-wrap">
              <button
                onClick={handlePlayFirstTrack}
                disabled={tracks.length === 0}
                className={`px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2.5 shadow-xl transition-all cursor-pointer ${
                  tracks.length === 0
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-500/25 hover:scale-102 active:scale-98'
                }`}
              >
                <Play className="w-5 h-5 fill-current" />
                Слушать
              </button>

              <button
                onClick={handleShare}
                className="px-4 py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 font-medium text-sm flex items-center gap-2 transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                {copied ? 'Ссылка скопирована' : 'Поделиться'}
              </button>
            </div>
          </div>
        </section>

        {/* TRACKLIST SECTION */}
        <section className="p-6 md:p-8 rounded-3xl bg-[#11152A]/80 backdrop-blur-xl border border-[#1E2442] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Music2 className="w-5 h-5 text-purple-400" />
              Треки
            </h2>
            <span className="text-xs text-slate-400 font-mono">{tracks.length} шт.</span>
          </div>

          {tracks.length === 0 ? (
            <div className="p-8 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800">
              В этом релизе пока нет треков.
            </div>
          ) : (
            <div className="space-y-2">
              {tracks.map((trk, index) => {
                const isCurrent = currentTrack?.id === trk.id;
                const isCurrentPlaying = isCurrent && isPlaying;
                const hasLyrics = Boolean(trk.lyrics && trk.lyrics.trim());
                const hasAuthorNote = Boolean(trk.authorNote && trk.authorNote.trim());
                const isLyricsExpanded = expandedLyricsTrackId === trk.id;
                const isNoteExpanded = expandedNoteTrackId === trk.id;

                return (
                  <div
                    key={trk.id}
                    className={`rounded-2xl border transition-all ${
                      isCurrent
                        ? 'bg-purple-950/30 border-purple-500/40 shadow-lg shadow-purple-900/10'
                        : 'bg-[#151932]/60 hover:bg-[#181D3B] border-[#1E2442]/60'
                    }`}
                  >
                    {/* Main track row */}
                    <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
                      {/* Track number & Play button */}
                      <button
                        onClick={() => handlePlaySpecificTrack(trk)}
                        className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-purple-600 text-slate-300 hover:text-white flex items-center justify-center shrink-0 transition-all cursor-pointer group"
                      >
                        {isCurrentPlaying ? (
                          <Pause className="w-4 h-4 fill-current text-purple-400 group-hover:text-white" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5 text-slate-400 group-hover:text-white" />
                        )}
                      </button>

                      <span className="text-xs font-mono text-slate-500 w-5 text-center hidden sm:inline">
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      {/* Title & Badges */}
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            onClick={() => handlePlaySpecificTrack(trk)}
                            className={`font-semibold text-sm cursor-pointer hover:underline truncate ${
                              isCurrent ? 'text-purple-300 font-bold' : 'text-slate-100'
                            }`}
                          >
                            {trk.title}
                          </span>
                          {trk.explicit && (
                            <span className="px-1.5 py-0.2 text-[9px] font-black rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                              18+
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Track Action Toggles (Lyrics & Note) */}
                      <div className="flex items-center gap-1 sm:gap-2">
                        {hasLyrics && (
                          <button
                            onClick={() =>
                              setExpandedLyricsTrackId(isLyricsExpanded ? null : trk.id)
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                              isLyricsExpanded
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Текст</span>
                          </button>
                        )}

                        {hasAuthorNote && (
                          <button
                            onClick={() =>
                              setExpandedNoteTrackId(isNoteExpanded ? null : trk.id)
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                              isNoteExpanded
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                            }`}
                          >
                            <Info className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Заметка</span>
                          </button>
                        )}

                        <span className="text-xs font-mono text-slate-400 ml-2 w-10 text-right">
                          {formatDuration(trk.duration)}
                        </span>
                      </div>
                    </div>

                    {/* Expandable Lyrics Area */}
                    {hasLyrics && isLyricsExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-purple-500/20 bg-purple-950/10 rounded-b-2xl">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-purple-300 flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5" /> Текст песни
                          </span>
                          <button
                            onClick={() => setExpandedLyricsTrackId(null)}
                            className="text-xs text-slate-400 hover:text-white"
                          >
                            Скрыть
                          </button>
                        </div>
                        <pre className="text-xs text-slate-300 font-sans whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                          {trk.lyrics}
                        </pre>
                      </div>
                    )}

                    {/* Expandable Author Note Area */}
                    {hasAuthorNote && isNoteExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-indigo-500/20 bg-indigo-950/10 rounded-b-2xl">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-indigo-300 flex items-center gap-1">
                            <Info className="w-3.5 h-3.5" /> Авторская заметка
                          </span>
                          <button
                            onClick={() => setExpandedNoteTrackId(null)}
                            className="text-xs text-slate-400 hover:text-white"
                          >
                            Скрыть
                          </button>
                        </div>
                        <p className="text-xs text-slate-300 italic leading-relaxed p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                          "{trk.authorNote}"
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 100-POINT REVIEW SYSTEM SECTION */}
        <section className="p-6 md:p-8 rounded-3xl bg-[#11152A]/80 backdrop-blur-xl border border-[#1E2442] space-y-8">
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-[#1E2442] pb-5">
            <div>
              <h2 className="text-2xl font-black text-white flex items-center gap-2">
                <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
                Музыкальная рецензия Dodik Tracker
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Система оценки музыкального релиза по 6 ключевым критериям (0–100)
              </p>
            </div>

            {/* Top Action Button */}
            {dbUser ? (
              <button
                onClick={handleOpenReviewModal}
                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-500/25 transition-all cursor-pointer hover:scale-102 active:scale-98"
              >
                {userReview ? (
                  <>
                    <Edit3 className="w-4 h-4" />
                    Редактировать оценку ({userReview.overallScore.toFixed(1)})
                  </>
                ) : (
                  <>
                    <Sliders className="w-4 h-4" />
                    Оценить релиз
                  </>
                )}
              </button>
            ) : (
              <div className="text-xs text-slate-400 bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-800 flex items-center gap-2">
                <LogIn className="w-4 h-4 text-purple-400" />
                <span>Войдите в аккаунт, чтобы оставить рецензию</span>
              </div>
            )}
          </div>

          {/* MY REVIEW CARD (If user has already reviewed) */}
          {userReview && (
            <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-950/30 via-[#151932] to-[#11152A] border border-purple-500/30 space-y-5 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between flex-wrap gap-3 border-b border-purple-500/20 pb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  <h3 className="text-base font-bold text-white">Моя рецензия</h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleOpenReviewModal}
                    className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Редактировать
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Удалить
                  </button>
                </div>
              </div>

              {/* Delete confirmation bar inside card */}
              {showDeleteConfirm && (
                <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 flex items-center justify-between flex-wrap gap-3 animate-in fade-in">
                  <span className="text-xs font-bold">Вы уверены, что хотите удалить свою рецензию?</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDeleteReview}
                      disabled={isDeletingReview}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-xs hover:bg-rose-500 cursor-pointer disabled:opacity-50"
                    >
                      {isDeletingReview ? 'Удаление...' : 'Да, удалить'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-700 cursor-pointer"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}

              {/* My Overall Score display */}
              <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-purple-400 block">Ваш итоговый балл</span>
                  <span className="text-xs text-slate-400">Рассчитан по 6 критериям</span>
                </div>
                <div className="text-2xl sm:text-3xl font-black font-mono text-purple-300 bg-purple-500/15 px-4 py-1.5 rounded-xl border border-purple-500/30">
                  {userReview.overallScore.toFixed(1)} <span className="text-xs font-normal text-slate-400">/ 100</span>
                </div>
              </div>

              {/* 6 Scores Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                  <span className="text-xs text-slate-400 block">Музыка</span>
                  <span className="text-base font-bold font-mono text-purple-300">{userReview.musicScore}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                  <span className="text-xs text-slate-400 block">Исполнение</span>
                  <span className="text-base font-bold font-mono text-cyan-300">{userReview.performanceScore}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                  <span className="text-xs text-slate-400 block">Продакшн</span>
                  <span className="text-base font-bold font-mono text-indigo-300">{userReview.productionScore}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                  <span className="text-xs text-slate-400 block">Текст</span>
                  <span className="text-base font-bold font-mono text-blue-300">{userReview.lyricsScore}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                  <span className="text-xs text-slate-400 block">Атмосфера</span>
                  <span className="text-base font-bold font-mono text-emerald-300">{userReview.atmosphereScore}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                  <span className="text-xs text-slate-400 block">Целостность</span>
                  <span className="text-base font-bold font-mono text-amber-300">{userReview.cohesionScore}</span>
                </div>
              </div>

              {userReview.text && (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {userReview.text}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* COMMUNITY STATISTICS BLOCK */}
          <div className="p-6 rounded-2xl bg-[#151932]/70 border border-[#1E2442] space-y-5">
            <div className="flex items-center justify-between border-b border-[#1E2442] pb-4 flex-wrap gap-2">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                Оценка сообщества
              </h3>
              {stats && stats.reviewsCount > 0 ? (
                <span className="text-xs font-mono text-slate-400">
                  Всего рецензий: <strong className="text-white font-bold">{stats.reviewsCount}</strong>
                </span>
              ) : null}
            </div>

            {stats && stats.reviewsCount > 0 ? (
              <div className="space-y-5">
                {/* Community Overall Score Hero */}
                <div className="flex items-center justify-between bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block font-bold">
                      Средняя оценка релиза
                    </span>
                    <span className="text-xs text-slate-400">На основе всех опубликованных рецензий</span>
                  </div>
                  <div className={`text-2xl sm:text-4xl font-black font-mono px-5 py-1.5 rounded-2xl border ${getScoreColorClass(stats.avgOverallScore)}`}>
                    {stats.avgOverallScore.toFixed(1)} <span className="text-sm font-normal text-slate-400">/ 100</span>
                  </div>
                </div>

                {/* 6 Criteria Breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1">
                    <span className="text-xs text-slate-400 font-medium block">1. Музыка</span>
                    <div className="text-lg font-bold font-mono text-purple-300">{stats.avgMusicScore.toFixed(1)}</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1">
                    <span className="text-xs text-slate-400 font-medium block">2. Исполнение</span>
                    <div className="text-lg font-bold font-mono text-cyan-300">{stats.avgPerformanceScore.toFixed(1)}</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1">
                    <span className="text-xs text-slate-400 font-medium block">3. Продакшн</span>
                    <div className="text-lg font-bold font-mono text-indigo-300">{stats.avgProductionScore.toFixed(1)}</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1">
                    <span className="text-xs text-slate-400 font-medium block">4. Текст</span>
                    <div className="text-lg font-bold font-mono text-blue-300">{stats.avgLyricsScore.toFixed(1)}</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1">
                    <span className="text-xs text-slate-400 font-medium block">5. Атмосфера</span>
                    <div className="text-lg font-bold font-mono text-emerald-300">{stats.avgAtmosphereScore.toFixed(1)}</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1">
                    <span className="text-xs text-slate-400 font-medium block">6. Целостность</span>
                    <div className="text-lg font-bold font-mono text-amber-300">{stats.avgCohesionScore.toFixed(1)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800/80">
                <Star className="w-10 h-10 mx-auto mb-2 text-slate-600 stroke-1" />
                <p className="text-sm font-semibold text-slate-400">Пока нет оценок сообщества</p>
                <p className="text-xs text-slate-500 mt-1">Оцените данный релиз первым по 6 критериям!</p>
              </div>
            )}
          </div>

          {/* REVIEWS LIST SECTION */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[#1E2442] pb-3">
              <h3 className="text-lg font-bold text-white">Рецензии пользователей</h3>

              {/* Sorting Switcher */}
              <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => handleSortChange('newest')}
                  className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    reviewSort === 'newest' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Новые
                </button>
                <button
                  onClick={() => handleSortChange('highest')}
                  className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    reviewSort === 'highest' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Высокие
                </button>
                <button
                  onClick={() => handleSortChange('lowest')}
                  className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    reviewSort === 'lowest' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Низкие
                </button>
              </div>
            </div>

            {reviews.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800/80 text-xs">
                Рецензий пока нет.
              </div>
            ) : (
              <div className="space-y-4">
                {reviews.map((rev) => {
                  const isAccordionOpen = expandedReviewIds.includes(rev.id);
                  return (
                    <div
                      key={rev.id}
                      className="p-5 rounded-2xl bg-[#151932]/70 border border-[#1E2442] space-y-3 shadow-md"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {rev.userAvatar ? (
                            <img
                              src={rev.userAvatar}
                              alt={rev.username}
                              className="w-10 h-10 rounded-full object-cover border border-purple-500/20"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-sm font-bold border border-slate-700">
                              {rev.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <span className="text-sm font-bold text-white block">@{rev.username}</span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              {formatDate(rev.createdAt)}
                            </span>
                          </div>
                        </div>

                        <div className={`px-3.5 py-1 rounded-xl font-mono text-sm font-black border ${getScoreColorClass(rev.overallScore)}`}>
                          {rev.overallScore.toFixed(1)} / 100
                        </div>
                      </div>

                      {rev.text && (
                        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed bg-slate-900/50 p-3.5 rounded-xl border border-slate-800/80 whitespace-pre-wrap">
                          {rev.text}
                        </p>
                      )}

                      {/* Accordion toggle button for criteria */}
                      <div className="pt-1">
                        <button
                          onClick={() => toggleReviewAccordion(rev.id)}
                          className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition cursor-pointer"
                        >
                          {isAccordionOpen ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" /> Скрыть оценки
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" /> Показать оценки по 6 критериям
                            </>
                          )}
                        </button>

                        {isAccordionOpen && (
                          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-mono animate-in fade-in">
                            <div><span className="text-slate-400">Музыка:</span> <strong className="text-purple-300">{rev.musicScore}</strong></div>
                            <div><span className="text-slate-400">Исполнение:</span> <strong className="text-cyan-300">{rev.performanceScore}</strong></div>
                            <div><span className="text-slate-400">Продакшн:</span> <strong className="text-indigo-300">{rev.productionScore}</strong></div>
                            <div><span className="text-slate-400">Текст:</span> <strong className="text-blue-300">{rev.lyricsScore}</strong></div>
                            <div><span className="text-slate-400">Атмосфера:</span> <strong className="text-emerald-300">{rev.atmosphereScore}</strong></div>
                            <div><span className="text-slate-400">Целостность:</span> <strong className="text-amber-300">{rev.cohesionScore}</strong></div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {hasMoreReviews && (
              <div className="text-center pt-3">
                <button
                  onClick={handleLoadMoreReviews}
                  disabled={loadingReviews}
                  className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loadingReviews ? 'Загрузка...' : 'Показать ещё рецензии'}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* REVIEW FORM MODAL */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-2xl p-6 sm:p-8 rounded-3xl bg-[#11152A] border border-[#1E2442] shadow-2xl space-y-6 my-8 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-[#1E2442] pb-4">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-6 h-6 text-purple-400" />
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {userReview ? 'Редактировать рецензию' : 'Оценить релиз'}
                  </h3>
                  <p className="text-xs text-slate-400">100-балльная система Dodik Tracker</p>
                </div>
              </div>

              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {reviewError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                {reviewError}
              </div>
            )}

            {reviewSuccessMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {reviewSuccessMsg}
              </div>
            )}

            <form onSubmit={handleSubmitReview} className="space-y-6">
              {/* Sliders Grid: 2 columns on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {REVIEW_CRITERIA.map(({ key, label, desc }) => {
                  const val = (reviewForm as any)[key];
                  return (
                    <div key={key} className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor={key} className="text-xs font-bold text-slate-200">
                          {label}
                        </label>
                        <span className="font-mono font-black text-purple-300 text-sm bg-purple-500/15 px-2 py-0.5 rounded-md border border-purple-500/30">
                          {val} <span className="text-[10px] text-slate-400 font-normal">/ 100</span>
                        </span>
                      </div>

                      <p className="text-[10px] text-slate-400 leading-tight">{desc}</p>

                      <input
                        id={key}
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={val}
                        aria-label={label}
                        onChange={(e) =>
                          setReviewForm({ ...reviewForm, [key]: parseInt(e.target.value, 10) })
                        }
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-all"
                      />

                      <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                        <span>0 — Плохо</span>
                        <span>50 — Средне</span>
                        <span>100 — Выдающееся</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live Preview Overall Score */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-purple-950/40 border border-purple-500/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-purple-300 block">Предварительный итог</span>
                  <span className="text-[10px] text-slate-400">Рассчитывается как среднее арифметическое</span>
                </div>
                <div className="text-2xl font-black font-mono text-white bg-purple-600 px-4 py-1 rounded-xl shadow-lg shadow-purple-500/30">
                  {calculatedLiveScore.toFixed(1)} <span className="text-xs font-normal opacity-80">/ 100</span>
                </div>
              </div>

              {/* Review Textarea */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Текст рецензии (необязательно)</label>
                <textarea
                  value={reviewForm.text}
                  onChange={(e) => setReviewForm({ ...reviewForm, text: e.target.value })}
                  placeholder="Опишите ваши впечатления от альбома, релизные акценты, сильные и слабые стороны..."
                  rows={4}
                  className="w-full p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors resize-none leading-relaxed"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-between gap-3 pt-2">
                {userReview ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" /> Удалить
                  </button>
                ) : <div />}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsReviewModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-500/25 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submittingReview ? 'Сохранение...' : 'Опубликовать рецензию'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
