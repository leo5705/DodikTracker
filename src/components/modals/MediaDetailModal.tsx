import React, { useState, useEffect } from 'react';
import {
  X,
  Star,
  Heart,
  Calendar,
  Layers,
  Sparkles,
  MessageSquare,
  ThumbsUp,
  Trash2,
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
  Dices,
  Flame,
  AlertTriangle,
  Bookmark,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AddToListModal } from './AddToListModal.tsx';
import { ConfirmModal } from './ConfirmModal.tsx';

interface MediaDetailModalProps {
  mediaId?: number;
  initialMedia?: any;
  onClose: () => void;
  onUpdated?: () => void;
  onOpenUserProfile?: (username: string) => void;
}

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({
  mediaId,
  initialMedia,
  onClose,
  onUpdated,
  onOpenUserProfile,
}) => {
  const { authFetch, dbUser, login } = useAuth();
  const [mediaData, setMediaData] = useState<any>(initialMedia || null);
  const [loading, setLoading] = useState(false);
  const [reviewsList, setReviewsList] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showAddToList, setShowAddToList] = useState(false);

  // Tracking state
  const [userStatus, setUserStatus] = useState<string>('PLAN_TO_WATCH');
  const [userProgress, setUserProgress] = useState<number>(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [savingTracking, setSavingTracking] = useState<boolean>(false);
  const [trackingSavedSuccess, setTrackingSavedSuccess] = useState<boolean>(false);

  // Review Form state
  const [showReviewForm, setShowReviewForm] = useState<boolean>(false);
  const [reviewScore, setReviewScore] = useState<number | null>(null);
  const [reviewTitle, setReviewTitle] = useState<string>('');
  const [reviewContent, setReviewContent] = useState<string>('');
  const [reviewSpoilers, setReviewSpoilers] = useState<boolean>(false);
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<number>>(new Set());

  const targetMediaId = mediaId || mediaData?.id;

  const fetchMediaDetails = async (id: number) => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/media/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMediaData(data);
        if (data.userTracking) {
          setUserStatus(data.userTracking.status || 'WATCHING');
          setUserProgress(data.userTracking.progress || 0);
          setUserRating(data.userTracking.rating || null);
          setIsFavorite(!!data.userTracking.isFavorite);
          setNotes(data.userTracking.notes || '');
        }
      }
    } catch (err) {
      console.error('Failed to load media details:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async (id: number) => {
    setReviewsLoading(true);
    try {
      const res = await authFetch(`/api/media/${id}/reviews`);
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
    if (targetMediaId) {
      fetchMediaDetails(targetMediaId);
      fetchReviews(targetMediaId);
    } else if (initialMedia) {
      (async () => {
        setLoading(true);
        try {
          const res = await authFetch('/api/media/ensure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(initialMedia),
          });
          if (res.ok) {
            const data = await res.json();
            setMediaData(data);
            if (data.id) {
              fetchMediaDetails(data.id);
              fetchReviews(data.id);
            }
          }
        } catch (err) {
          console.error('Failed to auto-ensure media:', err);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [targetMediaId]);

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
          mediaId: targetMediaId,
          status: userStatus,
          progress: userProgress,
          rating: userRating,
          isFavorite,
          notes: notes.trim() || null,
        }),
      });

      if (res.ok) {
        setTrackingSavedSuccess(true);
        setTimeout(() => setTrackingSavedSuccess(false), 2000);
        onUpdated?.();
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
      const res = await authFetch(`/api/media/${targetMediaId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: reviewScore,
          title: reviewTitle.trim() || null,
          content: reviewContent.trim(),
          containsSpoilers: reviewSpoilers,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Не удалось опубликовать отзыв');
      }

      setShowReviewForm(false);
      setReviewTitle('');
      setReviewContent('');
      setReviewScore(null);
      setReviewSpoilers(false);
      fetchReviews(targetMediaId);
      onUpdated?.();
    } catch (err: any) {
      setReviewError(err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  const [reviewToDelete, setReviewToDelete] = useState<number | null>(null);

  const confirmDeleteReview = async () => {
    if (!reviewToDelete) return;
    try {
      const res = await authFetch(`/api/reviews/${reviewToDelete}`, { method: 'DELETE' });
      if (res.ok) {
        setReviewsList((prev) => prev.filter((r) => r.id !== reviewToDelete));
        setReviewToDelete(null);
      }
    } catch (err) {
      console.error('Failed to delete review:', err);
    }
  };

  const handleLikeReview = async (reviewId: number) => {
    if (!dbUser) {
      await login();
      return;
    }
    try {
      const res = await authFetch(`/api/reviews/${reviewId}/like`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setReviewsList((prev) =>
          prev.map((r) => {
            if (r.id === reviewId) {
              return {
                ...r,
                userLiked: data.liked,
                likesCount: data.liked ? r.likesCount + 1 : Math.max(0, r.likesCount - 1),
              };
            }
            return r;
          })
        );
      }
    } catch (err) {
      console.error('Failed to like review:', err);
    }
  };

  const toggleSpoiler = (reviewId: number) => {
    setRevealedSpoilers((prev) => {
      const next = new Set(prev);
      if (next.has(reviewId)) next.delete(reviewId);
      else next.add(reviewId);
      return next;
    });
  };

  const getCategoryIcon = (type: string) => {
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
        return <Film className="w-4 h-4 text-purple-400" />;
    }
  };

  const getStatusOptions = (type?: string) => {
    if (type === 'GAME') {
      return [
        { value: 'PLAN_TO_PLAY', label: 'Хочу сыграть' },
        { value: 'PLAYING', label: 'Играю сейчас' },
        { value: 'COMPLETED', label: 'Пройдено' },
        { value: 'ON_HOLD', label: 'Отложено' },
        { value: 'DROPPED', label: 'Дропнуто' },
      ];
    }
    if (type === 'BOOK' || type === 'MANGA' || type === 'COMIC') {
      return [
        { value: 'PLAN_TO_READ', label: 'Хочу прочитать' },
        { value: 'READING', label: 'Читаю' },
        { value: 'COMPLETED', label: 'Прочитано' },
        { value: 'ON_HOLD', label: 'Отложено' },
        { value: 'DROPPED', label: 'Дропнуто' },
      ];
    }
    return [
      { value: 'PLAN_TO_WATCH', label: 'В планах' },
      { value: 'WATCHING', label: 'Смотрю' },
      { value: 'COMPLETED', label: 'Просмотрено' },
      { value: 'ON_HOLD', label: 'Отложено' },
      { value: 'DROPPED', label: 'Дропнуто' },
    ];
  };

  const getProgressLabel = (type?: string) => {
    switch (type) {
      case 'GAME':
        return 'Часов наиграно';
      case 'BOOK':
        return 'Прочитано страниц';
      case 'MANGA':
      case 'COMIC':
        return 'Прочитано глав';
      case 'TV':
      case 'ANIME':
        return 'Просмотрено серий';
      default:
        return 'Прогресс';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto custom-scrollbar">
      <div className="relative w-full max-w-3xl bg-[#14131A] border border-[#252233] rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-[#0F0E12]/80 border border-[#252233] text-[#9A94AA] hover:text-white flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Backdrop Banner Header */}
        <div className="relative h-44 sm:h-56 w-full bg-[#191724] shrink-0 overflow-hidden">
          {mediaData?.backdropUrl ? (
            <img
              src={mediaData.backdropUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center opacity-40 filter blur-[1px]"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-purple-950/40 via-[#191724] to-[#14131A]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#14131A] via-[#14131A]/60 to-transparent" />

          {/* Quick Header Details Overlay */}
          <div className="absolute bottom-4 left-4 sm:left-6 right-16 flex items-end gap-4">
            {mediaData?.posterUrl && (
              <img
                src={mediaData.posterUrl}
                alt={mediaData.title}
                referrerPolicy="no-referrer"
                className="w-20 h-28 sm:w-24 sm:h-36 object-cover rounded-xl border border-[#2E2A40] shadow-xl shrink-0 -mb-2"
              />
            )}
            <div className="overflow-hidden">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#1F1C2E] border border-[#2E2A40] text-xs font-semibold text-[#AC82FF]">
                  {getCategoryIcon(mediaData?.type)}
                  {mediaData?.type}
                </span>
                {mediaData?.year && (
                  <span className="text-xs text-[#9A94AA] font-mono flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {mediaData.year}
                  </span>
                )}
                {mediaData?.rating && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold font-mono">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {mediaData.rating}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-2xl font-black text-[#F3F1F8] leading-tight truncate">
                {mediaData?.title || 'Загрузка...'}
              </h2>
              {mediaData?.originalTitle && (
                <p className="text-xs text-[#9A94AA] font-mono truncate">{mediaData.originalTitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-[#9A94AA] gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#9B6BFF]" />
              <span className="text-xs">Загрузка информации...</span>
            </div>
          ) : (
            <>
              {/* Description */}
              {mediaData?.description && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#9A94AA]">
                    Описание
                  </h4>
                  <p className="text-xs sm:text-sm text-[#D5D0E3] leading-relaxed bg-[#191724]/70 p-3.5 rounded-xl border border-[#252233]">
                    {mediaData.description}
                  </p>
                </div>
              )}

              {/* Personal Tracker Card */}
              <div className="p-4 rounded-xl bg-[#181622] border border-[#2E2A40] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#9B6BFF]" />
                    <span className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider">
                      Мой трекер
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAddToList(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border bg-[#14131A] text-[#D5D0E3] border-[#252233] hover:text-white hover:border-[#AC82FF]/60 hover:bg-[#1F1C2E] transition-colors"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-[#AC82FF]" />
                      В список
                    </button>
                    <button
                      onClick={() => setIsFavorite(!isFavorite)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        isFavorite
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-[#14131A] text-[#9A94AA] border-[#252233] hover:text-white'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-rose-400 text-rose-400' : ''}`} />
                      {isFavorite ? 'В избранном' : 'В избранное'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Status Selector */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#9A94AA]">Статус</label>
                    <select
                      value={userStatus}
                      onChange={(e) => setUserStatus(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                    >
                      {getStatusOptions(mediaData?.type).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Progress Counter */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#9A94AA]">
                      {getProgressLabel(mediaData?.type)}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setUserProgress((p) => Math.max(0, p - 1))}
                        className="w-8 h-8 rounded-lg bg-[#14131A] border border-[#2E2A40] text-[#9A94AA] hover:text-white flex items-center justify-center shrink-0"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={userProgress}
                        onChange={(e) => setUserProgress(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-full text-center px-2 py-1.5 rounded-lg bg-[#14131A] border border-[#2E2A40] text-xs font-mono font-bold text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                      />
                      <button
                        type="button"
                        onClick={() => setUserProgress((p) => p + 1)}
                        className="w-8 h-8 rounded-lg bg-[#14131A] border border-[#2E2A40] text-[#9A94AA] hover:text-white flex items-center justify-center shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Rating Selector */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#9A94AA]">
                      Моя оценка ({userRating ? `${userRating}/10` : 'без оценки'})
                    </label>
                    <select
                      value={userRating || ''}
                      onChange={(e) => setUserRating(e.target.value ? parseInt(e.target.value, 10) : null)}
                      className="w-full px-3 py-2 rounded-xl bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                    >
                      <option value="">Без оценки</option>
                      {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
                        <option key={r} value={r}>
                          {r} ★ {r === 10 ? '(Шедевр)' : r >= 8 ? '(Отлично)' : r >= 6 ? '(Нормально)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#9A94AA]">Заметки для себя</label>
                  <input
                    type="text"
                    placeholder="Например: смотрел с друзьями, шедевральный саундтрек..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#656075] focus:outline-none focus:border-[#9B6BFF]"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleSaveTracking}
                    disabled={savingTracking}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-semibold shadow-lg shadow-purple-950/40 transition-colors disabled:opacity-50"
                  >
                    {savingTracking ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : trackingSavedSuccess ? (
                      <Check className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    {trackingSavedSuccess ? 'Сохранено!' : 'Сохранить статус'}
                  </button>
                </div>
              </div>

              {/* Community Reviews Section */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#9B6BFF]" />
                    <h3 className="text-sm font-bold text-[#F3F1F8] uppercase tracking-wider">
                      Отзывы сообщества ({reviewsList.length})
                    </h3>
                  </div>

                  <button
                    onClick={() => {
                      if (!dbUser) login();
                      else setShowReviewForm(!showReviewForm);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[#191724] border border-[#2E2A40] text-[#AC82FF] hover:bg-[#1E1B2B] font-medium transition-colors"
                  >
                    {showReviewForm ? 'Отмена' : '+ Написать отзыв'}
                  </button>
                </div>

                {/* Review Form */}
                {showReviewForm && (
                  <form
                    onSubmit={handleSubmitReview}
                    className="p-4 rounded-xl bg-[#181622] border border-[#2E2A40] space-y-3 animate-in fade-in duration-150"
                  >
                    <h4 className="text-xs font-bold text-[#F3F1F8]">Ваш отзыв</h4>
                    {reviewError && (
                      <div className="p-2 rounded-lg bg-red-900/30 border border-red-700/50 text-red-200 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{reviewError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-[#9A94AA]">Оценка (1-10)</label>
                        <select
                          value={reviewScore || ''}
                          onChange={(e) => setReviewScore(e.target.value ? parseInt(e.target.value, 10) : null)}
                          className="w-full mt-1 px-3 py-2 rounded-xl bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                        >
                          <option value="">Без оценки</option>
                          {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
                            <option key={r} value={r}>
                              {r} ★
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[#9A94AA]">Заголовок (необязательно)</label>
                        <input
                          type="text"
                          placeholder="Главные впечатления в двух словах"
                          value={reviewTitle}
                          onChange={(e) => setReviewTitle(e.target.value)}
                          className="w-full mt-1 px-3 py-2 rounded-xl bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#656075] focus:outline-none focus:border-[#9B6BFF]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-[#9A94AA]">Текст рецензии</label>
                      <textarea
                        rows={4}
                        required
                        placeholder="Поделитесь подробными впечатлениями, сюжетом, атмосферой..."
                        value={reviewContent}
                        onChange={(e) => setReviewContent(e.target.value)}
                        className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#656075] focus:outline-none focus:border-[#9B6BFF] resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-[#9A94AA]">
                        <input
                          type="checkbox"
                          checked={reviewSpoilers}
                          onChange={(e) => setReviewSpoilers(e.target.checked)}
                          className="rounded border-[#2E2A40] text-[#9B6BFF] focus:ring-0"
                        />
                        <span>Содержит сюжетные спойлеры</span>
                      </label>

                      <button
                        type="submit"
                        disabled={submittingReview}
                        className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
                      >
                        {submittingReview ? 'Публикация...' : 'Опубликовать'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Reviews List */}
                {reviewsLoading ? (
                  <div className="py-6 flex items-center justify-center text-[#9A94AA]">
                    <Loader2 className="w-5 h-5 animate-spin text-[#9B6BFF]" />
                  </div>
                ) : reviewsList.length === 0 ? (
                  <div className="py-8 text-center bg-[#191724]/40 rounded-xl border border-[#252233] p-4">
                    <p className="text-xs text-[#9A94AA]">Пока никто не оставил отзыв об этом произведении.</p>
                    <p className="text-xs text-[#AC82FF] mt-1 font-medium">Будьте первым, кто поделится мнением!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reviewsList.map((rev) => {
                      const isSpoilerHidden = rev.containsSpoilers && !revealedSpoilers.has(rev.id);
                      return (
                        <div
                          key={rev.id}
                          className="p-4 rounded-xl bg-[#191724]/60 border border-[#252233] space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div
                              className="flex items-center gap-2.5 cursor-pointer group"
                              onClick={() => onOpenUserProfile?.(rev.authorUsername)}
                            >
                              {rev.authorAvatar ? (
                                <img
                                  src={rev.authorAvatar}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  className="w-7 h-7 rounded-full object-cover border border-[#2E2A40]"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-[#1F1C2E] border border-[#2E2A40] flex items-center justify-center text-[10px] font-bold text-[#AC82FF]">
                                  {rev.authorUsername.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-[#F3F1F8] group-hover:text-[#AC82FF] transition-colors">
                                    @{rev.authorUsername}
                                  </span>
                                  {rev.authorRole === 'ADMIN' && (
                                    <span className="text-[10px] px-1.5 rounded bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                                      Админ
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-[#9A94AA]">
                                  {new Date(rev.createdAt).toLocaleDateString('ru-RU')}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {rev.rating && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold font-mono">
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                  {rev.rating}/10
                                </span>
                              )}
                              {(rev.isOwn || dbUser?.role === 'ADMIN' || dbUser?.role === 'SUPER_ADMIN') && (
                                <button
                                  onClick={() => setReviewToDelete(rev.id)}
                                  title="Удалить отзыв"
                                  className="p-1 text-[#9A94AA] hover:text-red-400 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {rev.title && (
                            <h5 className="text-xs sm:text-sm font-bold text-[#F3F1F8]">{rev.title}</h5>
                          )}

                          {rev.containsSpoilers && (
                            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-amber-300 text-[11px]">
                              <span className="flex items-center gap-1.5 font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                Внимание: отзыв содержит спойлеры!
                              </span>
                              <button
                                onClick={() => toggleSpoiler(rev.id)}
                                className="flex items-center gap-1 text-[11px] underline hover:text-amber-200"
                              >
                                {isSpoilerHidden ? (
                                  <>
                                    <Eye className="w-3 h-3" /> Показать
                                  </>
                                ) : (
                                  <>
                                    <EyeOff className="w-3 h-3" /> Скрыть
                                  </>
                                )}
                              </button>
                            </div>
                          )}

                          <p
                            className={`text-xs text-[#D5D0E3] leading-relaxed transition-all ${
                              isSpoilerHidden ? 'filter blur-sm select-none opacity-40' : ''
                            }`}
                          >
                            {rev.content}
                          </p>

                          <div className="flex items-center justify-between pt-1 border-t border-[#252233]/60">
                            <button
                              onClick={() => handleLikeReview(rev.id)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                rev.userLiked
                                  ? 'bg-purple-600/20 text-[#AC82FF] border border-purple-500/40'
                                  : 'text-[#9A94AA] hover:text-white bg-[#14131A] border border-[#252233]'
                              }`}
                            >
                              <ThumbsUp className={`w-3 h-3 ${rev.userLiked ? 'fill-purple-400' : ''}`} />
                              <span>{rev.likesCount || 0}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add To Custom List Modal */}
      {showAddToList && mediaData && (
        <AddToListModal
          media={{
            id: targetMediaId,
            mediaId: targetMediaId,
            title: mediaData.title,
            type: mediaData.type,
            posterUrl: mediaData.posterUrl,
            year: mediaData.year,
            rating: mediaData.rating,
            provider: mediaData.provider,
            externalId: mediaData.externalId,
            description: mediaData.description,
          }}
          onClose={() => setShowAddToList(false)}
        />
      )}

      {/* Delete Review Modal */}
      <ConfirmModal
        isOpen={reviewToDelete !== null}
        title="Удалить отзыв?"
        message="Вы уверены, что хотите удалить этот отзыв?"
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
        onConfirm={confirmDeleteReview}
        onCancel={() => setReviewToDelete(null)}
      />
    </div>
  );
};
