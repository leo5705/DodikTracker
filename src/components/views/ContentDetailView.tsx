import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertCircle,
  Film,
  Tv,
  BookOpen,
  Book,
  Flame,
  Music,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useShare } from '../../context/ShareContext.tsx';
import { UnifiedContentItem, ContentType, ContentReview } from '../../types/content.ts';
import { normalizeMediaToUnified } from '../../utils/contentAdapter.ts';
import { formatMediaTypePath } from '../common/MediaCard.tsx';

// Unified Sub-components
import { ContentBreadcrumbs } from '../content/ContentBreadcrumbs.tsx';
import { ContentHero } from '../content/ContentHero.tsx';
import { ContentOverview } from '../content/ContentOverview.tsx';
import { ContentMetadataGrid } from '../content/ContentMetadataGrid.tsx';
import { ContentCastCrew } from '../content/ContentCastCrew.tsx';
import { ContentSeasonsEpisodes } from '../content/ContentSeasonsEpisodes.tsx';
import { ContentMusicTracklist } from '../content/ContentMusicTracklist.tsx';
import { ContentMangaRelations } from '../content/ContentMangaRelations.tsx';
import { ContentGallery } from '../content/ContentGallery.tsx';
import { ContentVideos } from '../content/ContentVideos.tsx';
import { ContentReviewsSection } from '../content/ContentReviewsSection.tsx';
import { ContentSimilar } from '../content/ContentSimilar.tsx';
import { ContentRatingModal } from '../content/ContentRatingModal.tsx';
import { ContentReviewModal } from '../content/ContentReviewModal.tsx';
import { AddToListModal } from '../modals/AddToListModal.tsx';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';

interface ContentDetailViewProps {
  mediaId: number | string;
  mediaType?: string;
  queryParams?: Record<string, string>;
}

export const ContentDetailView: React.FC<ContentDetailViewProps> = ({
  mediaId,
  mediaType,
  queryParams,
}) => {
  const { authFetch, dbUser, login } = useAuth();
  const { navigate, goBack } = useRouter();
  const { openCompletionModal, openShareModal } = useShare();

  const [rawMedia, setRawMedia] = useState<any>(null);
  const [contentItem, setContentItem] = useState<UnifiedContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reviews state
  const [reviewsList, setReviewsList] = useState<ContentReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [editingReview, setEditingReview] = useState<ContentReview | null>(null);
  const [reviewToDelete, setReviewToDelete] = useState<number | null>(null);

  // Modals state
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showAddToList, setShowAddToList] = useState(false);

  // Watched episodes set
  const [watchedEpisodes, setWatchedEpisodes] = useState<Set<string>>(new Set());

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
        if (res.status === 404) throw new Error('Произведение не найдено в каталоге');
        throw new Error('Не удалось загрузить данные о произведении');
      }

      const data = await res.json();
      setRawMedia(data);

      const normalized = normalizeMediaToUnified(data, mediaType);
      setContentItem(normalized);

      // If resolved from external id and local id is different, replace url quietly
      if (data.id && String(data.id) !== String(mediaId)) {
        const typePath = formatMediaTypePath(data.type || mediaType || 'movie');
        navigate(`/media/${typePath}/${data.id}`, { replace: true, scroll: false });
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async () => {
    if (!contentItem?.id && !mediaId) return;
    const targetId = contentItem?.id || mediaId;
    setReviewsLoading(true);
    try {
      const res = await authFetch(`/api/media/${targetId}/reviews`);
      if (res.ok) {
        const data = await res.json();
        setReviewsList(
          data.map((r: any) => ({
            id: r.id,
            userId: r.userId,
            user: {
              id: r.userId,
              username: r.user?.username || r.authorUsername || r.username || 'Пользователь',
              displayName: r.user?.displayName || r.authorUsername || r.username || 'Пользователь',
              avatarUrl: r.user?.avatarUrl || r.authorAvatar || r.avatar || undefined,
            },
            score: r.score || r.rating,
            rating: r.rating || r.score,
            title: r.title,
            content: r.content,
            containsSpoilers: Boolean(r.containsSpoilers),
            likesCount: r.likesCount || 0,
            isLiked: Boolean(r.isLiked || r.userLiked),
            userReaction: r.userReaction || (r.isLiked || r.userLiked ? 'LIKE' : null),
            reactions: r.reactions || {},
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          }))
        );
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
    }
  }, [mediaId, mediaType, dbUser?.id]);

  useEffect(() => {
    if (contentItem?.id) {
      fetchReviews();
    }
  }, [contentItem?.id]);

  // Handle Tracking status change
  const handleStatusChange = async (newStatus: string) => {
    if (!dbUser) {
      await login();
      return;
    }
    const currentTracking = contentItem?.userTracking || {};
    const effectiveStatus = currentTracking.status === newStatus ? 'PLANNING' : newStatus;

    try {
      const res = await authFetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: contentItem?.id || mediaId,
          status: effectiveStatus,
          rating: currentTracking.rating || currentTracking.score,
          isFavorite: currentTracking.isFavorite,
          notes: currentTracking.notes,
        }),
      });

      if (res.ok) {
        setContentItem((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            userTracking: {
              ...prev.userTracking,
              status: effectiveStatus,
            },
          };
        });

        if (effectiveStatus === 'COMPLETED') {
          openCompletionModal({
            mediaId: Number(contentItem?.id || mediaId),
            title: contentItem?.title || contentItem?.originalTitle || 'Контент',
            type: contentItem?.type,
            posterUrl: contentItem?.posterUrl,
            rating: currentTracking.rating || currentTracking.score || null,
          });
        }
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Handle Favorite toggle
  const handleToggleFavorite = async () => {
    if (!dbUser) {
      await login();
      return;
    }
    const currentTracking = contentItem?.userTracking || {};
    const nextFavorite = !currentTracking.isFavorite;

    try {
      const res = await authFetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: contentItem?.id || mediaId,
          status: currentTracking.status || 'PLANNING',
          rating: currentTracking.rating || currentTracking.score,
          isFavorite: nextFavorite,
        }),
      });

      if (res.ok) {
        setContentItem((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            userTracking: {
              ...prev.userTracking,
              isFavorite: nextFavorite,
            },
          };
        });
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  // Handle Saving Rating (1-10)
  const handleSaveRating = async (scoreToSave: number | null) => {
    if (!dbUser) {
      await login();
      return;
    }
    const targetId = contentItem?.id || mediaId;
    try {
      const res = await authFetch(`/api/media/${targetId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: scoreToSave }),
      });

      if (res.ok) {
        const data = await res.json();
        setContentItem((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            dodikRating: data.dodikRating || prev.dodikRating,
            userTracking: {
              ...prev.userTracking,
              rating: scoreToSave || undefined,
              score: scoreToSave || undefined,
            },
          };
        });
      }
    } catch (err) {
      console.error('Failed to save rating:', err);
    }
  };

  // Handle Review Submit
  const handleSubmitReview = async (data: {
    title: string | null;
    content: string;
    score: number | null;
    containsSpoilers: boolean;
  }) => {
    if (!dbUser) {
      await login();
      return;
    }
    const targetId = contentItem?.id || mediaId;
    const url = editingReview
      ? `/api/media/${targetId}/reviews/${editingReview.id}`
      : `/api/media/${targetId}/reviews`;
    const method = editingReview ? 'PUT' : 'POST';

    const res = await authFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || 'Не удалось сохранить отзыв');
    }

    setEditingReview(null);
    fetchReviews();
  };

  // Handle Delete Review
  const handleDeleteReview = async () => {
    if (!reviewToDelete || !contentItem) return;
    try {
      const res = await authFetch(`/api/media/${contentItem.id}/reviews/${reviewToDelete}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setReviewsList((prev) => prev.filter((r) => r.id !== reviewToDelete));
      }
    } catch (err) {
      console.error('Failed to delete review:', err);
    } finally {
      setReviewToDelete(null);
    }
  };

  // Handle React to Review (like or custom reaction)
  const handleReactReview = async (reviewId: number, type: string = 'LIKE') => {
    if (!dbUser) {
      await login();
      return;
    }
    const targetId = contentItem?.id || mediaId;
    try {
      const res = await authFetch(`/api/media/${targetId}/reviews/${reviewId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        const data = await res.json();
        setReviewsList((prev) =>
          prev.map((r) =>
            r.id === reviewId
              ? {
                  ...r,
                  likesCount: data.likesCount ?? r.likesCount,
                  isLiked: Boolean(data.isLiked),
                  userReaction: data.userReaction ?? null,
                  reactions: data.reactions ?? r.reactions,
                }
              : r
          )
        );
      }
    } catch (err) {
      console.error('Failed to react to review:', err);
    }
  };

  // Handle Episode watched toggle
  const handleToggleEpisodeWatched = (seasonNumber: number, episodeNumber: number, watched: boolean) => {
    const key = `${seasonNumber}-${episodeNumber}`;
    setWatchedEpisodes((prev) => {
      const next = new Set(prev);
      if (watched) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  // Loading Screen matching Game page
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 animate-pulse">
        <div className="h-6 w-48 bg-zinc-800/80 rounded-xl" />
        <div className="h-[460px] bg-zinc-900/90 rounded-3xl border border-zinc-800" />
        <div className="h-64 bg-zinc-900/80 rounded-3xl border border-zinc-800" />
      </div>
    );
  }

  // Error Screen
  if (error || !contentItem) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-rose-950/50 border border-rose-800/50 flex items-center justify-center text-rose-400 mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-zinc-100">Не удалось загрузить тайтл</h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">{error || 'Страница недоступна'}</p>
        </div>
        <button
          onClick={goBack}
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold inline-flex items-center gap-2 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Вернуться назад</span>
        </button>
      </div>
    );
  }

  const breadcrumbItems = [
    ...(contentItem.genres && Array.isArray(contentItem.genres) && contentItem.genres.length > 0
      ? [
          {
            label:
              typeof contentItem.genres[0] === 'string'
                ? contentItem.genres[0]
                : contentItem.genres[0].name,
            path: `/search?type=${contentItem.type}&genre=${encodeURIComponent(
              typeof contentItem.genres[0] === 'string'
                ? contentItem.genres[0]
                : contentItem.genres[0].name
            )}`,
          },
        ]
      : []),
    { label: contentItem.title },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8 animate-in fade-in duration-300">
      {/* Navigation Header with Breadcrumbs & Back Button */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-zinc-800/60">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Назад</span>
          </button>

          <ContentBreadcrumbs type={contentItem.type} items={breadcrumbItems} />
        </div>
      </div>

      {/* 1. Unified Hero Section */}
      <ContentHero
        item={contentItem}
        userTracking={contentItem.userTracking}
        onStatusChange={handleStatusChange}
        onToggleFavorite={handleToggleFavorite}
        onOpenRatingModal={() => setShowRatingModal(true)}
        onOpenReviewModal={() => {
          setEditingReview(null);
          setShowReviewModal(true);
        }}
        onOpenListModal={() => setShowAddToList(true)}
        onOpenShareModal={() =>
          openShareModal(
            {
              id: Number(contentItem.id || mediaId),
              title: contentItem.title || contentItem.originalTitle || 'Контент',
              type: contentItem.type,
              posterUrl: contentItem.posterUrl,
              rating: contentItem.userTracking?.rating || contentItem.userTracking?.score || null,
            },
            contentItem.userTracking?.status === 'COMPLETED'
          )
        }
      />

      {/* 2. Structured Sections Grid */}
      <div className="space-y-8">
        {/* Overview & Synopsis */}
        <ContentOverview item={contentItem} />

        {/* Detailed Metadata Grid */}
        <ContentMetadataGrid item={contentItem} />

        {/* TV Series / Anime Seasons & Episodes */}
        {contentItem.seasons && contentItem.seasons.length > 0 && (
          <ContentSeasonsEpisodes
            seasons={contentItem.seasons}
            onToggleEpisodeWatched={handleToggleEpisodeWatched}
            watchedEpisodes={watchedEpisodes}
          />
        )}

        {/* Music Album Tracklist */}
        {contentItem.tracks && contentItem.tracks.length > 0 && (
          <ContentMusicTracklist tracks={contentItem.tracks} />
        )}

        {/* Anime & Manga Relations (Franchise adaptations, Sequels, Prequels) */}
        {contentItem.relations && contentItem.relations.length > 0 && (
          <ContentMangaRelations relations={contentItem.relations} />
        )}

        {/* Cast & Crew / Authors / Staff */}
        {((contentItem.cast && contentItem.cast.length > 0) ||
          (contentItem.directors && contentItem.directors.length > 0) ||
          (contentItem.authors && contentItem.authors.length > 0)) && (
          <ContentCastCrew
            cast={contentItem.cast}
            crew={[
              ...(contentItem.directors || []),
              ...(contentItem.writers || []),
              ...(contentItem.producers || []),
              ...(contentItem.authors || []),
              ...(contentItem.mangaka || []),
            ]}
            type={contentItem.type}
          />
        )}

        {/* Screenshots / Photos Gallery */}
        {contentItem.screenshots && contentItem.screenshots.length > 0 && (
          <ContentGallery images={contentItem.screenshots} />
        )}

        {/* Official Trailers & Videos */}
        {contentItem.videos && contentItem.videos.length > 0 && (
          <ContentVideos videos={contentItem.videos} />
        )}

        {/* Dodik Community Reviews & Rating Breakdown */}
        <ContentReviewsSection
          reviews={reviewsList}
          dodikRating={contentItem.dodikRating}
          loading={reviewsLoading}
          onOpenReviewModal={() => {
            setEditingReview(null);
            setShowReviewModal(true);
          }}
          onEditReview={(rev) => {
            setEditingReview(rev);
            setShowReviewModal(true);
          }}
          onDeleteReview={async (id) => setReviewToDelete(id)}
          onLikeReview={(id) => handleReactReview(id, 'LIKE')}
          onReactReview={handleReactReview}
        />

        {/* Similar Recommendations */}
        {contentItem.similar && contentItem.similar.length > 0 && (
          <ContentSimilar items={contentItem.similar} />
        )}
      </div>

      {/* Modals */}
      {/* 1. Rating (1-10) Modal */}
      <ContentRatingModal
        isOpen={showRatingModal}
        currentRating={contentItem.userTracking?.rating || contentItem.userTracking?.score}
        itemTitle={contentItem.title}
        onClose={() => setShowRatingModal(false)}
        onSaveRating={handleSaveRating}
      />

      {/* 2. Review Modal */}
      <ContentReviewModal
        isOpen={showReviewModal}
        itemTitle={contentItem.title}
        existingReview={editingReview}
        onClose={() => {
          setShowReviewModal(false);
          setEditingReview(null);
        }}
        onSubmit={handleSubmitReview}
      />

      {/* 3. Add to List Modal */}
      {showAddToList && (
        <AddToListModal
          media={{
            id: typeof contentItem.id === 'number' ? contentItem.id : undefined,
            mediaId: typeof contentItem.id === 'number' ? contentItem.id : undefined,
            title: contentItem.title,
            type: contentItem.type,
            posterUrl: contentItem.posterUrl,
            year: contentItem.year,
            rating: contentItem.rating,
            provider: contentItem.provider,
            externalId: contentItem.externalId,
            description: contentItem.description,
          }}
          onClose={() => setShowAddToList(false)}
        />
      )}

      {/* 4. Confirm Delete Review Modal */}
      {reviewToDelete !== null && (
        <ConfirmModal
          isOpen={true}
          title="Удалить рецензию?"
          message="Вы уверены, что хотите удалить вашу рецензию? Это действие нельзя отменить."
          confirmText="Удалить"
          variant="danger"
          onConfirm={handleDeleteReview}
          onCancel={() => setReviewToDelete(null)}
        />
      )}
    </div>
  );
};
