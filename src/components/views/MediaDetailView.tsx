import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Star,
  Heart,
  Calendar,
  Clock,
  Globe,
  Award,
  Sparkles,
  MessageSquare,
  ThumbsUp,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Plus,
  Minus,
  Check,
  Loader2,
  Film,
  Tv,
  Gamepad2,
  Book,
  BookOpen,
  Flame,
  Dices,
  Bookmark,
  Share2,
  Users,
  Clapperboard,
  Image as ImageIcon,
  ExternalLink,
  ShieldAlert,
  X,
  Play,
  Video,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';
import { AddToListModal } from '../modals/AddToListModal.tsx';
import { formatMediaTypePath } from '../common/MediaCard.tsx';

interface MediaDetailViewProps {
  mediaId: number;
  mediaType?: string;
  queryParams?: Record<string, string>;
}

export const MediaDetailView: React.FC<MediaDetailViewProps> = ({ mediaId, mediaType, queryParams }) => {
  const { authFetch, dbUser, login } = useAuth();
  const { navigate, goBack } = useRouter();

  const [mediaData, setMediaData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [navigatingSimilarId, setNavigatingSimilarId] = useState<string | number | null>(null);

  // Active section tab
  const [activeTab, setActiveTab] = useState<'overview' | 'crew' | 'seasons' | 'media' | 'reviews'>('overview');

  // Reviews
  const [reviewsList, setReviewsList] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null);
  const [reviewScore, setReviewScore] = useState<number | null>(null);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewContent, setReviewContent] = useState('');
  const [reviewSpoilers, setReviewSpoilers] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<number>>(new Set());

  // Tracking state
  const [userStatus, setUserStatus] = useState<string>('PLAN_TO_WATCH');
  const [userProgress, setUserProgress] = useState<number>(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [savingTracking, setSavingTracking] = useState<boolean>(false);
  const [trackingSavedSuccess, setTrackingSavedSuccess] = useState<boolean>(false);
  const [ratingSaving, setRatingSaving] = useState<boolean>(false);

  // Modals & Lightbox & Media
  const [showAddToList, setShowAddToList] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [reviewToDelete, setReviewToDelete] = useState<number | null>(null);
  const [posterError, setPosterError] = useState<boolean>(false);
  const [activeVideoIndex, setActiveVideoIndex] = useState<number>(0);

  const fetchMedia = async () => {
    setLoading(true);
    setError(null);
    try {
      const qParams = new URLSearchParams();
      if (mediaType) qParams.set('type', mediaType);
      if (queryParams?.provider) qParams.set('provider', queryParams.provider);
      const queryString = qParams.toString() ? `?${qParams.toString()}` : '';
      const res = await authFetch(`/api/media/${mediaId}${queryString}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Медиа не найдено в базе данных');
        throw new Error('Не удалось загрузить данные о тайтле');
      }
      const data = await res.json();
      setMediaData(data);
      setPosterError(false);
      setActiveVideoIndex(0);

      // If this was resolved from an external ID and the local DB id is different,
      // silently update URL to the canonical local DB id
      if (data.id && data.id !== mediaId) {
        navigate(`/media/${formatMediaTypePath(data.type || mediaType)}/${data.id}`, { replace: true });
      }

      if (data.userTracking) {
        setUserStatus(data.userTracking.status || 'WATCHING');
        setUserProgress(data.userTracking.progress || 0);
        setUserRating(data.userTracking.rating || null);
        setIsFavorite(!!data.userTracking.isFavorite);
        setNotes(data.userTracking.notes || '');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSimilarClick = async (sim: any) => {
    const simType = sim.type || mediaData?.type || 'GAME';
    const typePath = formatMediaTypePath(simType);

    // 1. If it already has a local DB mediaId
    if (sim.mediaId || (typeof sim.id === 'number' && !sim.provider)) {
      const id = sim.mediaId || sim.id;
      navigate(`/media/${typePath}/${id}`);
      return;
    }

    // 2. Ensure in local DB first for instant seamless navigation
    setNavigatingSimilarId(sim.externalId || sim.id);
    try {
      const res = await authFetch('/api/media/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaPayload: {
            ...sim,
            type: simType,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const finalId = data.mediaId || data.media?.id;
        if (finalId) {
          navigate(`/media/${typePath}/${finalId}`);
          return;
        }
      }
    } catch (err) {
      console.warn('Failed to ensure similar media, navigating directly:', err);
    } finally {
      setNavigatingSimilarId(null);
    }

    // 3. Fallback: navigate with external ID + query type (backend auto-resolver will catch it)
    if (sim.externalId) {
      navigate(`/media/${typePath}/${sim.externalId}?type=${encodeURIComponent(simType)}&provider=${encodeURIComponent(sim.provider || '')}`);
    }
  };

  const fetchReviews = async () => {
    setReviewsLoading(true);
    try {
      const res = await authFetch(`/api/media/${mediaId}/reviews`);
      if (res.ok) {
        const data = await res.json();
        setReviewsList(data);
      }
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    if (mediaId) {
      fetchMedia();
      fetchReviews();
    }
  }, [mediaId, dbUser?.id]);

  // Quick rating submission directly to Dodik aggregate
  const handleQuickRate = async (rateValue: number) => {
    if (!dbUser) {
      await login();
      return;
    }
    const newRating = userRating === rateValue ? null : rateValue;
    setUserRating(newRating);
    setRatingSaving(true);
    try {
      const res = await authFetch(`/api/media/${mediaId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: newRating }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.dodikRating && mediaData) {
          setMediaData((prev: any) => ({
            ...prev,
            dodikRating: data.dodikRating,
          }));
        }
      }
    } catch (err) {
      console.error('Failed to submit rate:', err);
    } finally {
      setRatingSaving(false);
    }
  };

  const handleSaveTracking = async () => {
    if (!dbUser) {
      await login();
      return;
    }
    setSavingTracking(true);
    try {
      const res = await authFetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId,
          status: userStatus,
          progress: userProgress,
          rating: userRating,
          isFavorite,
          notes: notes.trim() || null,
        }),
      });

      if (res.ok) {
        setTrackingSavedSuccess(true);
        setTimeout(() => setTrackingSavedSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Failed to save tracking:', err);
    } finally {
      setSavingTracking(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbUser) {
      await login();
      return;
    }
    if (!reviewContent.trim()) {
      setReviewError('Пожалуйста, напишите текст отзыва');
      return;
    }

    setSubmittingReview(true);
    setReviewError(null);

    try {
      const url = editingReviewId
        ? `/api/media/${mediaId}/reviews/${editingReviewId}`
        : `/api/media/${mediaId}/reviews`;
      const method = editingReviewId ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: reviewScore,
          score: reviewScore,
          title: reviewTitle.trim() || null,
          content: reviewContent.trim(),
          containsSpoilers: reviewSpoilers,
        }),
      });

      if (res.ok) {
        setShowReviewForm(false);
        setEditingReviewId(null);
        setReviewContent('');
        setReviewTitle('');
        setReviewScore(null);
        setReviewSpoilers(false);
        fetchReviews();
        fetchMedia(); // refresh Dodik ratings
      } else {
        const data = await res.json();
        setReviewError(data.error || 'Ошибка при сохранении отзыва');
      }
    } catch (err: any) {
      setReviewError(err.message || 'Ошибка сети');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleToggleLikeReview = async (reviewId: number) => {
    if (!dbUser) {
      await login();
      return;
    }
    try {
      const res = await authFetch(`/api/reviews/${reviewId}/like`, { method: 'POST' });
      if (res.ok) {
        fetchReviews();
      }
    } catch (err) {
      console.error('Failed to like review:', err);
    }
  };

  const confirmDeleteReview = async () => {
    if (!reviewToDelete) return;
    try {
      const res = await authFetch(`/api/media/${mediaId}/reviews/${reviewToDelete}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setReviewToDelete(null);
        fetchReviews();
        fetchMedia();
      }
    } catch (err) {
      console.error('Failed to delete review:', err);
    }
  };

  const handleStartEditReview = (rev: any) => {
    setEditingReviewId(rev.id);
    setReviewScore(rev.score || rev.rating);
    setReviewTitle(rev.title || '');
    setReviewContent(rev.content);
    setReviewSpoilers(!!rev.containsSpoilers);
    setShowReviewForm(true);
    setActiveTab('reviews');
  };

  const toggleSpoiler = (id: number) => {
    setRevealedSpoilers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'MOVIE':
        return <Film className="w-4 h-4 text-purple-400" />;
      case 'TV':
        return <Tv className="w-4 h-4 text-indigo-400" />;
      case 'ANIME':
        return <Sparkles className="w-4 h-4 text-fuchsia-400" />;
      case 'MANGA':
        return <BookOpen className="w-4 h-4 text-pink-400" />;
      case 'GAME':
        return <Gamepad2 className="w-4 h-4 text-emerald-400" />;
      case 'BOOK':
        return <Book className="w-4 h-4 text-amber-400" />;
      case 'COMIC':
        return <Flame className="w-4 h-4 text-orange-400" />;
      case 'BOARD_GAME':
        return <Dices className="w-4 h-4 text-teal-400" />;
      default:
        return <Film className="w-4 h-4 text-zinc-400" />;
    }
  };

  const getCriticBadgeColor = (score: number) => {
    if (score >= 75) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    if (score >= 50) return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  };

  if (loading) {
    return (
      <div className="py-32 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-10 h-10 text-[#AC82FF] animate-spin" />
        <p className="text-xs text-[#9A94AA] font-mono">Загрузка карточки тайтла...</p>
      </div>
    );
  }

  if (error || !mediaData) {
    return (
      <div className="py-24 text-center space-y-4 max-w-lg mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-rose-950/40 border border-rose-800/40 flex items-center justify-center mx-auto text-rose-400">
          <Film className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-[#F3F1F8] font-mono">Медиа не найдено</h2>
        <p className="text-xs text-[#9A94AA] leading-relaxed">
          {error || 'Запрошенный тайтл отсутствует в базе данных или был удален.'}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => fetchMedia()}
            className="px-4 py-2 rounded-xl bg-[#191724] hover:bg-[#1F1C2E] border border-[#252233] hover:border-[#AC82FF]/50 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#AC82FF]" />
            <span>Повторить попытку</span>
          </button>
          <button
            onClick={() => navigate('/search')}
            className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-semibold shadow transition-all"
          >
            Вернуться в каталог
          </button>
        </div>
      </div>
    );
  }

  const dodikRating = mediaData.dodikRating || { averageRating: null, ratingCount: 0, distribution: {} };
  const existingMyReview = reviewsList.find((r) => r.userId === dbUser?.id);
  const hasCrew = (mediaData.directors?.length > 0) ||
    (mediaData.writers?.length > 0) ||
    (mediaData.producers?.length > 0) ||
    (mediaData.cinematographers?.length > 0) ||
    (mediaData.composers?.length > 0) ||
    (mediaData.creators?.length > 0) ||
    (mediaData.crew?.length > 0);
  const hasCast = mediaData.cast && mediaData.cast.length > 0;
  const hasSeasons = mediaData.seasons && mediaData.seasons.length > 0;
  const hasScreenshots = (mediaData.screenshots && mediaData.screenshots.length > 0);
  const rawVideos: Array<{ name: string; url?: string; key?: string; site?: string }> = [
    ...(mediaData.videos || []),
    ...(mediaData.trailerUrl && !(mediaData.videos || []).some((v: any) => v.url === mediaData.trailerUrl)
      ? [{ name: 'Официальный трейлер', url: mediaData.trailerUrl, site: mediaData.trailerUrl.includes('youtube') ? 'YouTube' : 'Direct' }]
      : []),
  ];
  const hasVideos = rawVideos.length > 0;
  const hasMedia = hasScreenshots || hasVideos;
  const hasSimilar = mediaData.similar && mediaData.similar.length > 0;

  const getYouTubeKey = (v: any) => {
    if (v.key) return v.key;
    if (!v.url) return null;
    const match = v.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  };

  return (
    <div className="space-y-8 pb-16 animate-fadeIn">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => goBack()}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#14131A] hover:bg-[#1F1C2E] border border-[#252233] text-xs font-medium text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14131A] hover:bg-[#1F1C2E] border border-[#252233] text-xs font-medium text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Скопировано</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Поделиться</span>
              </>
            )}
          </button>
          <button
            onClick={() => setShowAddToList(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#9B6BFF]/15 hover:bg-[#9B6BFF] text-[#AC82FF] hover:text-white border border-[#9B6BFF]/30 hover:border-[#9B6BFF] text-xs font-semibold transition-all shadow-sm"
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>В список</span>
          </button>
        </div>
      </div>

      {/* Hero Backdrop & Main Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-[#14131A] border border-[#252233] shadow-2xl">
        {/* Backdrop image banner */}
        <div className="h-64 sm:h-80 w-full relative overflow-hidden">
          {mediaData.backdropUrl || mediaData.posterUrl ? (
            <img
              src={mediaData.backdropUrl || mediaData.posterUrl}
              alt={mediaData.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center filter blur-[1px] brightness-40 scale-105"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-purple-950/40 via-zinc-900 to-zinc-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#14131A] via-[#14131A]/75 to-transparent" />
        </div>

        {/* Content overlapping backdrop */}
        <div className="relative px-6 sm:px-10 pb-8 -mt-32 sm:-mt-44 flex flex-col md:flex-row gap-6 sm:gap-8 items-start">
          {/* Poster Card */}
          <div className="w-36 sm:w-52 aspect-[2/3] rounded-2xl bg-[#191724] border-2 border-[#252233] shadow-2xl overflow-hidden shrink-0 relative group">
            {mediaData.posterUrl && !posterError ? (
              <img
                src={mediaData.posterUrl}
                alt={mediaData.title}
                referrerPolicy="no-referrer"
                onError={() => setPosterError(true)}
                className="w-full h-full object-cover"
              />
            ) : mediaData.type === 'GAME' ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-[#15141C] border border-[#252233] text-[#9A94AA]">
                <Gamepad2 className="w-12 h-12 mb-3 text-[#AC82FF]/60" />
                <span className="text-xs font-bold text-zinc-200 line-clamp-3 leading-snug px-1">
                  {mediaData.title}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono mt-2">Игра</span>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-[#9A94AA] text-xs">
                <Film className="w-8 h-8 mb-2 text-zinc-600" />
                <span>Нет постера</span>
              </div>
            )}

            {mediaData.ageRating && (
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-zinc-700 text-zinc-300 text-[10px] font-bold font-mono">
                {mediaData.ageRating}
              </div>
            )}
          </div>

          {/* Title & Key Headers */}
          <div className="flex-1 min-w-0 space-y-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1F1C2E] border border-[#3A344E] text-xs font-semibold text-[#AC82FF]">
                {getTypeIcon(mediaData.type)}
                {mediaData.type === 'MOVIE' && 'Фильм'}
                {mediaData.type === 'TV' && 'Сериал'}
                {mediaData.type === 'ANIME' && 'Аниме'}
                {mediaData.type === 'GAME' && 'Игра'}
                {mediaData.type === 'BOOK' && 'Книга'}
                {mediaData.type === 'COMIC' && 'Комикс'}
                {mediaData.type === 'MANGA' && 'Манга'}
                {!['MOVIE', 'TV', 'ANIME', 'GAME', 'BOOK', 'COMIC', 'MANGA'].includes(mediaData.type) && (mediaData.type || 'Медиа')}
              </span>

              {mediaData.year && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-300">
                  <Calendar className="w-3 h-3 text-zinc-400" />
                  {mediaData.year}
                </span>
              )}

              {mediaData.statusText && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 text-xs font-medium">
                  {mediaData.statusText}
                </span>
              )}

              {mediaData.durationText && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-300">
                  <Clock className="w-3 h-3 text-zinc-400" />
                  {mediaData.durationText}
                </span>
              )}

              {mediaData.countries && mediaData.countries.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-400">
                  <Globe className="w-3 h-3 text-zinc-400" />
                  {mediaData.countries.slice(0, 2).join(', ')}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-4xl font-black text-[#F3F1F8] font-mono tracking-tight leading-tight">
              {mediaData.title}
            </h1>

            {mediaData.originalTitle && mediaData.originalTitle !== mediaData.title && (
              <p className="text-sm sm:text-base text-[#9A94AA] font-sans italic">
                {mediaData.originalTitle}
              </p>
            )}

            {/* Genres Chips */}
            {mediaData.genres && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(Array.isArray(mediaData.genres) ? mediaData.genres : String(mediaData.genres).split(',')).map(
                  (g: string, i: number) => (
                    <span
                      key={i}
                      className="px-2.5 py-0.5 rounded-lg bg-[#191724] border border-[#252233] text-xs text-zinc-300 font-medium"
                    >
                      {g.trim()}
                    </span>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Triple Rating Bar: Dodik Tracker + Critics + Source Provider */}
        <div className="border-t border-[#252233] bg-[#0E0D14]/90 px-6 sm:px-10 py-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 divide-y md:divide-y-0 md:divide-x divide-[#252233]">
            {/* 1. Dodik Tracker User Rating */}
            <div className="space-y-2 pr-0 md:pr-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#AC82FF] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Оценка Dodik Tracker
                </span>
                <span className="text-[10px] text-[#9A94AA]">
                  {dodikRating.ratingCount ? `${dodikRating.ratingCount} оценок` : 'Пока нет оценок'}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-amber-400 font-mono">
                    {dodikRating.averageRating ? dodikRating.averageRating.toFixed(1) : '—'}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">/ 10</span>
                </div>

                <div className="flex-1">
                  {/* Interactive Quick Star Rater */}
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((starNum) => (
                      <button
                        key={starNum}
                        onClick={() => handleQuickRate(starNum)}
                        disabled={ratingSaving}
                        title={`Поставить ${starNum} из 10`}
                        className="group relative p-0.5 focus:outline-none"
                      >
                        <Star
                          className={`w-3.5 h-3.5 transition-transform group-hover:scale-125 ${
                            userRating && userRating >= starNum
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-zinc-600 hover:text-amber-400'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    {userRating ? `Ваша оценка: ${userRating} из 10 (нажмите для смены)` : 'Нажмите на звезду, чтобы оценить'}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Critics Score */}
            <div className="pt-3 md:pt-0 px-0 md:px-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" />
                  Оценка критиков
                </span>
                <span className="text-[10px] text-[#9A94AA]">
                  {mediaData.criticScore?.source || (mediaData.type === 'GAME' ? 'Metacritic' : 'Metacritic / RT')}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {mediaData.criticScore ? (
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-3 py-1.5 rounded-xl border text-xl font-mono font-black ${getCriticBadgeColor(
                        mediaData.criticScore.score
                      )}`}
                    >
                      {mediaData.criticScore.score}
                      {mediaData.criticScore.maxScore === 100 ? '' : `/${mediaData.criticScore.maxScore}`}
                    </span>
                    <div className="text-xs text-zinc-300">
                      <p className="font-semibold">
                        {mediaData.criticScore.score >= 75
                          ? 'Всеобщее признание'
                          : mediaData.criticScore.score >= 50
                          ? 'Смешанные отзывы'
                          : 'Отрицательные отзывы'}
                      </p>
                      <p className="text-[10px] text-zinc-500">{mediaData.criticScore.source}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Award className="w-5 h-5 text-zinc-600" />
                    <span>Оценка критиков уточняется</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Provider Community Rating */}
            <div className="pt-3 md:pt-0 pl-0 md:pl-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-zinc-400" />
                  Рейтинг {mediaData.provider || 'провайдера'}
                </span>
                <span className="text-[10px] text-[#9A94AA]">База {mediaData.provider || 'API'}</span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-zinc-200 font-mono">
                  {mediaData.rating ? (typeof mediaData.rating === 'number' ? mediaData.rating.toFixed(1) : mediaData.rating) : '—'}
                </span>
                <span className="text-xs text-zinc-500 font-mono">/ 10</span>
                {mediaData.year && (
                  <span className="text-[11px] text-zinc-500 ml-auto">Год: {mediaData.year}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs for Media Detail Sections */}
      <div className="flex items-center gap-2 border-b border-[#252233] pb-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'Обзор и инфо', icon: Film },
          ...(hasCrew ? [{ id: 'crew', label: 'Съёмочная группа', icon: Clapperboard }] : []),
          ...(hasSeasons ? [{ id: 'seasons', label: `Сезоны (${mediaData.seasons.length})`, icon: Tv }] : []),
          ...(hasMedia
            ? [
                {
                  id: 'media',
                  label:
                    hasVideos && hasScreenshots
                      ? `Медиа & Трейлеры (${(mediaData.screenshots?.length || 0) + rawVideos.length})`
                      : hasVideos
                      ? `Трейлеры (${rawVideos.length})`
                      : `Галерея (${mediaData.screenshots.length})`,
                  icon: hasVideos ? Play : ImageIcon,
                },
              ]
            : []),
          { id: 'reviews', label: `Рецензии (${reviewsList.length})`, icon: MessageSquare },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-[#9B6BFF] text-white shadow-lg shadow-[#9B6BFF]/25'
                  : 'text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#14131A]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Content Layout (Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-start">
        {/* LEFT COLUMN: User Tracking & Library Controls */}
        <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-6 shadow-xl lg:sticky lg:top-6">
          <div className="flex items-center justify-between border-b border-[#252233] pb-3">
            <h2 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#AC82FF]" />
              Мой статус & трекинг
            </h2>
            <button
              onClick={() => setIsFavorite(!isFavorite)}
              className="p-1.5 rounded-xl bg-[#191724] hover:bg-[#1F1C2E] border border-[#252233] transition-colors"
              title={isFavorite ? 'В избранном' : 'Добавить в избранное'}
            >
              <Heart
                className={`w-4 h-4 ${
                  isFavorite ? 'text-rose-500 fill-rose-500' : 'text-zinc-400'
                }`}
              />
            </button>
          </div>

          {/* Status selector buttons */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#9A94AA]">Статус в библиотеке</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'PLAN_TO_WATCH', label: 'В планах' },
                { id: 'WATCHING', label: mediaData.type === 'GAME' ? 'Играю' : 'Смотрю' },
                { id: 'COMPLETED', label: mediaData.type === 'GAME' ? 'Пройдено' : 'Завершено' },
                { id: 'DROPPED', label: 'Дропнуто' },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setUserStatus(s.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all text-center ${
                    userStatus === s.id
                      ? 'bg-[#9B6BFF] text-white border-[#9B6BFF] shadow-md shadow-[#9B6BFF]/20 font-bold'
                      : 'bg-[#191724] text-[#9A94AA] border-[#252233] hover:text-[#F3F1F8]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Progress (Episodes / Chapters / Hours) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#9A94AA]">
                Прогресс ({mediaData.type === 'GAME' ? 'часы' : 'серии'}):
              </span>
              <span className="font-mono font-bold text-[#F3F1F8]">
                {userProgress} {mediaData.totalEpisodes ? `/ ${mediaData.totalEpisodes}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUserProgress((p) => Math.max(0, p - 1))}
                className="p-2 rounded-xl bg-[#191724] border border-[#252233] hover:bg-[#1F1C2E] text-zinc-300"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                min="0"
                value={userProgress}
                onChange={(e) => setUserProgress(parseInt(e.target.value, 10) || 0)}
                className="flex-1 py-1.5 px-3 rounded-xl bg-[#191724] border border-[#252233] text-center text-sm font-mono text-white focus:outline-none focus:border-[#9B6BFF]"
              />
              <button
                type="button"
                onClick={() => setUserProgress((p) => p + 1)}
                className="p-2 rounded-xl bg-[#191724] border border-[#252233] hover:bg-[#1F1C2E] text-zinc-300"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* User Personal Rating (1 to 10) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#9A94AA]">Личная оценка:</span>
              <span className="font-bold text-amber-400 font-mono">
                {userRating ? `${userRating} / 10` : 'Без оценки'}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleQuickRate(num)}
                  className={`py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors ${
                    userRating !== null && userRating >= num
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                      : 'bg-[#191724] text-zinc-500 border-[#252233] hover:text-zinc-300'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Personal Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#9A94AA]">Заметки к тайтлу (личные):</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Мысли, на каком моменте остановился, ожидания..."
              className="w-full p-2.5 rounded-xl bg-[#191724] border border-[#252233] text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#9B6BFF] resize-none"
            />
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveTracking}
            disabled={savingTracking}
            className="w-full py-2.5 px-4 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#9B6BFF]/25 transition-all disabled:opacity-50"
          >
            {savingTracking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : trackingSavedSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>Сохранено в профиль!</span>
              </>
            ) : (
              <span>Сохранить в библиотеку</span>
            )}
          </button>
        </div>

        {/* RIGHT COLUMN: Tab Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Synopsis / Description */}
              {mediaData.description && (
                <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-3">
                  <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2">
                    <Film className="w-4 h-4 text-[#AC82FF]" />
                    Сюжет & Описание
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                    {mediaData.description}
                  </p>
                </div>
              )}

              {/* Official Trailer preview block in Overview if available */}
              {hasVideos && (
                <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2">
                      <Play className="w-4 h-4 text-[#AC82FF]" />
                      Официальный ролик / Трейлер
                    </h3>
                    {rawVideos.length > 1 && (
                      <button
                        onClick={() => setActiveTab('media')}
                        className="text-xs text-[#AC82FF] hover:underline font-semibold"
                      >
                        Все видео ({rawVideos.length}) →
                      </button>
                    )}
                  </div>
                  <div className="aspect-video rounded-2xl overflow-hidden bg-black border border-[#252233]">
                    {(() => {
                      const trailer = rawVideos[0];
                      const ytKey = trailer ? getYouTubeKey(trailer) : null;
                      if (ytKey) {
                        return (
                          <iframe
                            src={`https://www.youtube-nocookie.com/embed/${ytKey}?rel=0`}
                            title={trailer.name || 'Трейлер'}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="w-full h-full border-0"
                          />
                        );
                      }
                      if (trailer?.url) {
                        return (
                          <video
                            controls
                            src={trailer.url}
                            className="w-full h-full object-contain"
                          />
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}

              {/* Dodik Score Breakdown Distribution */}
              {dodikRating.ratingCount > 0 && (
                <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Распределение оценок Dodik Tracker
                    </h3>
                    <span className="text-xs text-amber-400 font-mono font-bold">
                      {dodikRating.averageRating?.toFixed(1)} / 10
                    </span>
                  </div>
                  <div className="space-y-1.5 pt-2">
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((star) => {
                      const count = dodikRating.distribution?.[star] || 0;
                      const percent = dodikRating.ratingCount > 0 ? (count / dodikRating.ratingCount) * 100 : 0;
                      return (
                        <div key={star} className="flex items-center gap-2 text-xs font-mono">
                          <span className="w-5 text-right text-zinc-400 font-semibold">{star}</span>
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <div className="flex-1 h-2 rounded-full bg-[#191724] border border-[#252233] overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full transition-all duration-500"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="w-12 text-right text-zinc-500 text-[11px]">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Specifications / Key Details Grid */}
              <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4">
                <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2">
                  <Award className="w-4 h-4 text-[#AC82FF]" />
                  Детали и характеристики
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                  {mediaData.releaseDate && (
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 font-medium">Дата премьеры:</span>
                      <p className="text-zinc-200 font-mono font-semibold">{mediaData.releaseDate}</p>
                    </div>
                  )}
                  {mediaData.year && (
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 font-medium">Год выхода:</span>
                      <p className="text-zinc-200 font-mono font-semibold">{mediaData.year}</p>
                    </div>
                  )}
                  {mediaData.durationText && (
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 font-medium">Хронометраж:</span>
                      <p className="text-zinc-200 font-mono font-semibold">{mediaData.durationText}</p>
                    </div>
                  )}
                  {mediaData.countries && mediaData.countries.length > 0 && (
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 font-medium">Страны:</span>
                      <p className="text-zinc-200 font-semibold">{mediaData.countries.join(', ')}</p>
                    </div>
                  )}
                  {mediaData.studios && mediaData.studios.length > 0 && (
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 font-medium">Студии:</span>
                      <p className="text-zinc-200 font-semibold">{mediaData.studios.join(', ')}</p>
                    </div>
                  )}
                  {mediaData.developers && mediaData.developers.length > 0 && (
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 font-medium">Разработчики:</span>
                      <p className="text-zinc-200 font-semibold">{mediaData.developers.join(', ')}</p>
                    </div>
                  )}
                  {mediaData.publishers && mediaData.publishers.length > 0 && (
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 font-medium">Издатели:</span>
                      <p className="text-zinc-200 font-semibold">{mediaData.publishers.join(', ')}</p>
                    </div>
                  )}
                  {mediaData.platforms && mediaData.platforms.length > 0 && (
                    <div className="space-y-0.5 col-span-2">
                      <span className="text-zinc-500 font-medium">Платформы:</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {mediaData.platforms.map((plat: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-[#191724] border border-[#252233] text-[11px] text-zinc-300 font-mono"
                          >
                            {plat}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {mediaData.tags && mediaData.tags.length > 0 && (
                    <div className="space-y-0.5 col-span-2 sm:col-span-3">
                      <span className="text-zinc-500 font-medium">Теги:</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {mediaData.tags.slice(0, 10).map((tag: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Cast Spotlight (In main overview) */}
              {hasCast && (
                <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#AC82FF]" />
                      В главных ролях / Актёры
                    </h3>
                    <button
                      onClick={() => setActiveTab('crew')}
                      className="text-xs text-[#AC82FF] hover:underline"
                    >
                      Вся съёмочная группа →
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {mediaData.cast.slice(0, 8).map((actor: any, i: number) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-2xl bg-[#191724] border border-[#252233] flex items-center gap-2.5 overflow-hidden"
                      >
                        <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0">
                          {actor.photoUrl ? (
                            <img
                              src={actor.photoUrl}
                              alt={actor.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-500">
                              {actor.name?.[0] || 'A'}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-zinc-100 truncate">{actor.name}</p>
                          {actor.character && (
                            <p className="text-[10px] text-zinc-400 truncate">{actor.character}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Crew Spotlight (Key Creators: Director, Screenplay, Producers) */}
              {hasCrew && (
                <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-3">
                  <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2">
                    <Clapperboard className="w-4 h-4 text-[#AC82FF]" />
                    Съёмочная группа (Ключевые создатели)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {mediaData.directors?.length > 0 && (
                      <div className="p-3 rounded-2xl bg-[#191724] border border-[#252233]">
                        <span className="text-[10px] font-semibold text-[#AC82FF] uppercase tracking-wider block mb-1">
                          Режиссёр
                        </span>
                        <p className="text-xs font-bold text-zinc-100">{mediaData.directors.join(', ')}</p>
                      </div>
                    )}
                    {mediaData.writers?.length > 0 && (
                      <div className="p-3 rounded-2xl bg-[#191724] border border-[#252233]">
                        <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider block mb-1">
                          Сценарий / Автор
                        </span>
                        <p className="text-xs font-bold text-zinc-100">{mediaData.writers.slice(0, 3).join(', ')}</p>
                      </div>
                    )}
                    {mediaData.producers?.length > 0 && (
                      <div className="p-3 rounded-2xl bg-[#191724] border border-[#252233]">
                        <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider block mb-1">
                          Продюсеры
                        </span>
                        <p className="text-xs font-bold text-zinc-100">{mediaData.producers.slice(0, 3).join(', ')}</p>
                      </div>
                    )}
                    {mediaData.composers?.length > 0 && (
                      <div className="p-3 rounded-2xl bg-[#191724] border border-[#252233]">
                        <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider block mb-1">
                          Композитор
                        </span>
                        <p className="text-xs font-bold text-zinc-100">{mediaData.composers.join(', ')}</p>
                      </div>
                    )}
                    {mediaData.cinematographers?.length > 0 && (
                      <div className="p-3 rounded-2xl bg-[#191724] border border-[#252233]">
                        <span className="text-[10px] font-semibold text-teal-400 uppercase tracking-wider block mb-1">
                          Оператор
                        </span>
                        <p className="text-xs font-bold text-zinc-100">{mediaData.cinematographers.join(', ')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Similar titles */}
              {hasSimilar && (
                <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4">
                  <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#AC82FF]" />
                    Похожие тайтлы & Рекомендации
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {mediaData.similar.slice(0, 4).map((sim: any, idx: number) => {
                      const isOpening = navigatingSimilarId === (sim.externalId || sim.id);
                      return (
                        <div
                          key={idx}
                          onClick={() => !isOpening && handleSimilarClick(sim)}
                          className="group p-2 rounded-2xl bg-[#191724] border border-[#252233] hover:border-[#AC82FF]/50 cursor-pointer transition-all space-y-2 relative"
                        >
                          <div className="aspect-[2/3] rounded-xl bg-zinc-800 overflow-hidden relative">
                            {sim.posterUrl ? (
                              <img
                                src={sim.posterUrl}
                                alt={sim.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-zinc-600">
                                Нет фото
                              </div>
                            )}
                            {sim.rating && (
                              <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-amber-400 text-[10px] font-mono font-bold flex items-center gap-0.5">
                                <Star className="w-2.5 h-2.5 fill-amber-400" />
                                {sim.rating}
                              </div>
                            )}
                            {isOpening && (
                              <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-1.5 backdrop-blur-[2px] z-10">
                                <Loader2 className="w-6 h-6 text-[#AC82FF] animate-spin" />
                                <span className="text-[10px] text-zinc-300 font-mono">Открытие...</span>
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-zinc-200 group-hover:text-[#AC82FF] truncate transition-colors">
                              {sim.title}
                            </p>
                            {sim.year && <p className="text-[10px] text-zinc-500 font-mono">{sim.year}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: FULL CREW & CAST */}
          {activeTab === 'crew' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Crew Categories */}
              <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4">
                <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2 border-b border-[#252233] pb-3">
                  <Clapperboard className="w-4 h-4 text-[#AC82FF]" />
                  Полный состав съёмочной группы
                </h3>

                <div className="space-y-4">
                  {mediaData.directors?.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-[#AC82FF] uppercase tracking-wider">Режиссёры</h4>
                      <div className="flex flex-wrap gap-2">
                        {mediaData.directors.map((person: string, i: number) => (
                          <span
                            key={i}
                            className="px-3 py-1.5 rounded-xl bg-[#191724] border border-[#252233] text-xs font-semibold text-zinc-200"
                          >
                            {person}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {mediaData.writers?.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Сценаристы & Авторы</h4>
                      <div className="flex flex-wrap gap-2">
                        {mediaData.writers.map((person: string, i: number) => (
                          <span
                            key={i}
                            className="px-3 py-1.5 rounded-xl bg-[#191724] border border-[#252233] text-xs font-semibold text-zinc-200"
                          >
                            {person}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {mediaData.producers?.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">Продюсеры</h4>
                      <div className="flex flex-wrap gap-2">
                        {mediaData.producers.map((person: string, i: number) => (
                          <span
                            key={i}
                            className="px-3 py-1.5 rounded-xl bg-[#191724] border border-[#252233] text-xs font-semibold text-zinc-200"
                          >
                            {person}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {mediaData.composers?.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Композиторы</h4>
                      <div className="flex flex-wrap gap-2">
                        {mediaData.composers.map((person: string, i: number) => (
                          <span
                            key={i}
                            className="px-3 py-1.5 rounded-xl bg-[#191724] border border-[#252233] text-xs font-semibold text-zinc-200"
                          >
                            {person}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {mediaData.cinematographers?.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider">Операторы</h4>
                      <div className="flex flex-wrap gap-2">
                        {mediaData.cinematographers.map((person: string, i: number) => (
                          <span
                            key={i}
                            className="px-3 py-1.5 rounded-xl bg-[#191724] border border-[#252233] text-xs font-semibold text-zinc-200"
                          >
                            {person}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {mediaData.crew && mediaData.crew.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Другие участники команды</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {mediaData.crew.map((member: any, i: number) => (
                          <div
                            key={i}
                            className="p-2 rounded-xl bg-[#191724] border border-[#252233] text-xs"
                          >
                            <p className="font-bold text-zinc-200 truncate">{member.name}</p>
                            <p className="text-[10px] text-zinc-500 truncate">{member.role || member.job}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Full Cast */}
              {hasCast && (
                <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4">
                  <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2 border-b border-[#252233] pb-3">
                    <Users className="w-4 h-4 text-[#AC82FF]" />
                    Актёрский состав ({mediaData.cast.length})
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {mediaData.cast.map((actor: any, i: number) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-2xl bg-[#191724] border border-[#252233] flex items-center gap-2.5 overflow-hidden"
                      >
                        <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0">
                          {actor.photoUrl ? (
                            <img
                              src={actor.photoUrl}
                              alt={actor.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-500">
                              {actor.name?.[0] || 'A'}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-zinc-100 truncate">{actor.name}</p>
                          {actor.character && (
                            <p className="text-[10px] text-zinc-400 truncate">{actor.character}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SEASONS & EPISODES */}
          {activeTab === 'seasons' && hasSeasons && (
            <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4 animate-fadeIn">
              <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2 border-b border-[#252233] pb-3">
                <Tv className="w-4 h-4 text-[#AC82FF]" />
                Сезоны и серии
              </h3>

              <div className="space-y-3">
                {mediaData.seasons.map((s: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-[#191724] border border-[#252233] flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg bg-[#9B6BFF]/20 text-[#AC82FF] font-mono text-xs font-bold">
                          Сезон {s.seasonNumber ?? idx + 1}
                        </span>
                        <h4 className="text-sm font-bold text-zinc-100">{s.title || `Сезон ${s.seasonNumber ?? idx + 1}`}</h4>
                      </div>
                      {s.overview && (
                        <p className="text-xs text-zinc-400 max-w-xl line-clamp-2">{s.overview}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs font-mono shrink-0">
                      {s.episodeCount && (
                        <span className="px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300">
                          {s.episodeCount} серий
                        </span>
                      )}
                      {s.airDate && (
                        <span className="text-zinc-500">{s.airDate}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: VIDEOS, TRAILERS & SCREENSHOTS */}
          {activeTab === 'media' && hasMedia && (
            <div className="space-y-6 animate-fadeIn">
              {hasVideos && (
                <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4">
                  <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2 border-b border-[#252233] pb-3">
                    <Play className="w-4 h-4 text-[#AC82FF]" />
                    Трейлеры и видеоматериалы ({rawVideos.length})
                  </h3>

                  {/* Active video player */}
                  <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-[#252233]">
                    {(() => {
                      const curVideo = rawVideos[activeVideoIndex] || rawVideos[0];
                      const ytKey = curVideo ? getYouTubeKey(curVideo) : null;
                      if (ytKey) {
                        return (
                          <iframe
                            src={`https://www.youtube-nocookie.com/embed/${ytKey}?rel=0`}
                            title={curVideo.name || 'Видео'}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="w-full h-full border-0"
                          />
                        );
                      }
                      if (curVideo?.url) {
                        return (
                          <video
                            controls
                            src={curVideo.url}
                            className="w-full h-full object-contain"
                          />
                        );
                      }
                      return (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
                          Видео недоступно
                        </div>
                      );
                    })()}
                  </div>

                  {/* Video selector list if more than 1 */}
                  {rawVideos.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {rawVideos.map((vid, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveVideoIndex(idx)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                            activeVideoIndex === idx
                              ? 'bg-[#9B6BFF] text-white border-[#9B6BFF]'
                              : 'bg-[#191724] text-zinc-300 border-[#252233] hover:border-[#AC82FF]/40'
                          }`}
                        >
                          {vid.name || `Видео #${idx + 1}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Screenshots gallery */}
              {hasScreenshots && (
                <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4">
                  <h3 className="text-sm font-bold text-[#F3F1F8] font-mono flex items-center gap-2 border-b border-[#252233] pb-3">
                    <ImageIcon className="w-4 h-4 text-[#AC82FF]" />
                    Галерея скриншотов & кадров ({mediaData.screenshots.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {mediaData.screenshots.map((imgUrl: string, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedImage(imgUrl)}
                        className="aspect-video rounded-2xl bg-zinc-900 border border-[#252233] overflow-hidden group cursor-pointer hover:border-[#AC82FF]/50 transition-all"
                      >
                        <img
                          src={imgUrl}
                          alt={`Кадр ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: REVIEWS */}
          {activeTab === 'reviews' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-[#252233] pb-3">
                <div>
                  <h2 className="text-base font-bold text-[#F3F1F8] font-mono flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#AC82FF]" />
                    Рецензии участников Dodik Tracker ({reviewsList.length})
                  </h2>
                  <p className="text-xs text-[#9A94AA]">
                    Авторизованные отзывы с оценками и защитой от спойлеров
                  </p>
                </div>

                {!showReviewForm && (
                  <button
                    onClick={() => {
                      if (!dbUser) login();
                      else setShowReviewForm(true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-semibold shadow transition-all flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {existingMyReview ? 'Редактировать отзыв' : 'Написать рецензию'}
                  </button>
                )}
              </div>

              {/* Review Form */}
              {showReviewForm && (
                <form
                  onSubmit={handleSubmitReview}
                  className="p-6 rounded-3xl bg-[#14131A] border border-[#AC82FF]/40 space-y-4 shadow-xl animate-fadeIn"
                >
                  <div className="flex items-center justify-between border-b border-[#252233] pb-2">
                    <h3 className="text-xs font-bold text-[#F3F1F8] font-mono">
                      {editingReviewId ? 'Редактирование рецензии' : 'Новая рецензия'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowReviewForm(false)}
                      className="text-xs text-[#9A94AA] hover:text-white"
                    >
                      Отмена
                    </button>
                  </div>

                  {reviewError && (
                    <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300">
                      {reviewError}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#9A94AA]">Оценка (от 1 до 10):</label>
                    <div className="flex gap-1 overflow-x-auto pb-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                        <button
                          key={score}
                          type="button"
                          onClick={() => setReviewScore(reviewScore === score ? null : score)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-colors ${
                            reviewScore === score
                              ? 'bg-amber-500 text-black border-amber-500'
                              : 'bg-[#191724] text-zinc-400 border-[#252233] hover:text-white'
                          }`}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#9A94AA]">Заголовок (необязательно):</label>
                    <input
                      type="text"
                      value={reviewTitle}
                      onChange={(e) => setReviewTitle(e.target.value)}
                      placeholder="Краткий тезис или заголовок..."
                      className="w-full py-2 px-3 rounded-xl bg-[#191724] border border-[#252233] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#9B6BFF]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#9A94AA]">Текст рецензии:</label>
                    <textarea
                      rows={5}
                      value={reviewContent}
                      onChange={(e) => setReviewContent(e.target.value)}
                      placeholder="Поделитесь подробными впечатлениями, плюсами и минусами тайтла..."
                      className="w-full p-3 rounded-xl bg-[#191724] border border-[#252233] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#9B6BFF] resize-y"
                      required
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={reviewSpoilers}
                        onChange={(e) => setReviewSpoilers(e.target.checked)}
                        className="rounded bg-[#191724] border-[#252233] text-[#9B6BFF] focus:ring-0"
                      />
                      <span>Содержит спойлеры</span>
                    </label>

                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="px-5 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-bold flex items-center gap-2 shadow transition-all disabled:opacity-50"
                    >
                      {submittingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Опубликовать'}
                    </button>
                  </div>
                </form>
              )}

              {/* Reviews List */}
              {reviewsLoading ? (
                <div className="py-12 text-center text-xs text-[#9A94AA]">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#AC82FF]" />
                  Загрузка рецензий...
                </div>
              ) : reviewsList.length > 0 ? (
                <div className="space-y-4">
                  {reviewsList.map((rev) => {
                    const isRevealed = revealedSpoilers.has(rev.id);
                    const authorName = rev.authorUsername || rev.username || 'Пользователь';
                    const isAuthor = dbUser && (dbUser.id === rev.userId || dbUser.username === authorName);
                    const displayScore = rev.rating ?? rev.score;

                    return (
                      <div
                        key={rev.id}
                        className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-3 shadow-md"
                      >
                        {/* Reviewer Header */}
                        <div className="flex items-center justify-between">
                          <div
                            onClick={() => navigate(`/u/${authorName}`)}
                            className="flex items-center gap-2.5 cursor-pointer group"
                          >
                            <div className="w-8 h-8 rounded-full bg-[#1F1C2E] border border-[#3A344E] flex items-center justify-center text-xs font-bold text-[#AC82FF] overflow-hidden">
                              {rev.authorAvatar || rev.avatar ? (
                                <img
                                  src={rev.authorAvatar || rev.avatar}
                                  alt={authorName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                (authorName[0] || 'U').toUpperCase()
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-bold text-[#F3F1F8] group-hover:text-[#AC82FF] transition-colors">
                                  @{authorName}
                                </p>
                                {rev.authorRole && rev.authorRole !== 'USER' && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#9B6BFF]/20 text-[#AC82FF] border border-[#9B6BFF]/40 font-bold">
                                    {rev.authorRole}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-[#9A94AA]">
                                {new Date(rev.createdAt).toLocaleDateString('ru-RU')}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {displayScore !== null && displayScore !== undefined && (
                              <div className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center gap-1 font-mono">
                                <Star className="w-3 h-3 fill-amber-400" />
                                {displayScore} / 10
                              </div>
                            )}

                            {isAuthor && (
                              <div className="flex items-center gap-1 ml-2">
                                <button
                                  onClick={() => handleStartEditReview(rev)}
                                  className="p-1 rounded-lg bg-[#191724] hover:bg-[#1F1C2E] text-zinc-400 hover:text-white transition-colors"
                                  title="Редактировать"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setReviewToDelete(rev.id)}
                                  className="p-1 rounded-lg bg-[#191724] hover:bg-rose-950 text-zinc-400 hover:text-rose-400 transition-colors"
                                  title="Удалить"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Title */}
                        {rev.title && (
                          <h4 className="text-sm font-bold text-[#F3F1F8] font-mono">{rev.title}</h4>
                        )}

                        {/* Content / Spoiler Shield */}
                        {rev.containsSpoilers && !isRevealed ? (
                          <div className="p-4 rounded-xl bg-[#191724] border border-amber-500/30 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-amber-300">
                              <ShieldAlert className="w-4 h-4 text-amber-400" />
                              <span>Рецензия содержит спойлеры к сюжету</span>
                            </div>
                            <button
                              onClick={() => toggleSpoiler(rev.id)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium flex items-center gap-1 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Показать
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                            {rev.content}
                          </p>
                        )}

                        {/* Footer (Like button) */}
                        <div className="flex items-center justify-between pt-2 border-t border-[#252233] text-xs text-[#9A94AA]">
                          <button
                            onClick={() => handleToggleLikeReview(rev.id)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
                              rev.userLiked
                                ? 'bg-[#9B6BFF]/20 text-[#AC82FF] font-semibold'
                                : 'hover:bg-[#191724] text-zinc-400 hover:text-white'
                            }`}
                          >
                            <ThumbsUp className={`w-3.5 h-3.5 ${rev.userLiked ? 'fill-[#AC82FF]' : ''}`} />
                            <span>{rev.likesCount || 0}</span>
                          </button>

                          {rev.containsSpoilers && isRevealed && (
                            <button
                              onClick={() => toggleSpoiler(rev.id)}
                              className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                            >
                              <EyeOff className="w-3 h-3" />
                              Скрыть спойлеры
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center space-y-3 p-6 rounded-3xl bg-[#14131A] border border-[#252233]">
                  <MessageSquare className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-xs text-[#9A94AA]">
                    У этого тайтла ещё нет рецензий. Будьте первым, кто поделится мнением!
                  </p>
                  <button
                    onClick={() => {
                      if (!dbUser) login();
                      else setShowReviewForm(true);
                    }}
                    className="px-4 py-1.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-semibold shadow transition-all inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Написать первую рецензию
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal for Screenshots */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="relative max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-zinc-800">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/70 hover:bg-black text-white transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={selectedImage}
              alt="Скриншот"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain max-h-[85vh]"
            />
          </div>
        </div>
      )}

      {/* Delete Review Confirm Modal */}
      <ConfirmModal
        isOpen={!!reviewToDelete}
        title="Удалить рецензию?"
        message="Вы уверены, что хотите удалить свою рецензию? Это действие необратимо."
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
        onConfirm={confirmDeleteReview}
        onCancel={() => setReviewToDelete(null)}
      />

      {/* Add To List Modal */}
      {showAddToList && (
        <AddToListModal
          media={{
            id: mediaData.id,
            mediaId: mediaData.id,
            title: mediaData.title,
            type: mediaData.type,
            posterUrl: mediaData.posterUrl,
            year: mediaData.year,
            rating: mediaData.rating,
            provider: mediaData.provider,
            description: mediaData.description,
          }}
          onClose={() => setShowAddToList(false)}
        />
      )}
    </div>
  );
};
