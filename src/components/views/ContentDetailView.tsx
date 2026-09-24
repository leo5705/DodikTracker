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
  Info,
  Users,
  GitFork,
  MessageSquare,
  AlignLeft,
  Star,
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
import { ContentPlot } from '../content/ContentPlot.tsx';
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
import { AdultContentWarning } from '../common/AdultContentWarning.tsx';

type DetailTab = 'OVERVIEW' | 'INFO' | 'CAST_CREW' | 'PLOT' | 'REVIEWS' | 'RELATED';

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

  const [activeTab, setActiveTab] = useState<DetailTab>('OVERVIEW');
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

  // 18+ adult content state
  const [isAdultRestricted, setIsAdultRestricted] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);

  const fetchMedia = async () => {
    setLoading(true);
    setError(null);
    try {
      const qParams = new URLSearchParams();
      if (mediaType) qParams.set('type', mediaType);
      if (queryParams?.provider) qParams.set('provider', queryParams.provider);
      const queryString = qParams.toString() ? `?${qParams.toString()}` : '';

      let res = await authFetch(`/api/media/${mediaId}${queryString}`);
      
      // Fallback for games if not in media endpoint directly
      if (!res.ok && (mediaType?.toUpperCase() === 'GAME' || (!isNaN(Number(mediaId)) && String(mediaId).length > 6))) {
        const gameRes = await authFetch(`/api/games/${encodeURIComponent(String(mediaId))}`);
        if (gameRes.ok) {
          res = gameRes;
        }
      }

      if (!res.ok) {
        if (res.status === 403) {
          const errBody = await res.json().catch(() => ({}));
          if (errBody.isAdultRestricted || errBody.code === 'ADULT_RESTRICTED') {
            setIsAdultRestricted(true);
            if (errBody.media) {
              setRawMedia(errBody.media);
              setContentItem(normalizeMediaToUnified(errBody.media, mediaType));
            }
            return;
          }
        }
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

  // Handle Progress update
  const handleProgressUpdate = async (newProgress: number) => {
    if (!dbUser) {
      await login();
      return;
    }
    const currentTracking = contentItem?.userTracking || {};

    try {
      const res = await authFetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: contentItem?.id || mediaId,
          status: currentTracking.status || 'IN_PROGRESS',
          progress: newProgress,
          rating: currentTracking.rating || currentTracking.score,
          isFavorite: currentTracking.isFavorite,
        }),
      });

      if (res.ok) {
        setContentItem((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            userTracking: {
              ...prev.userTracking,
              progress: newProgress,
            },
          };
        });
      }
    } catch (err) {
      console.error('Failed to update progress:', err);
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

    await fetchReviews();
    if (data.score) {
      setContentItem((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          userTracking: {
            ...prev.userTracking,
            score: data.score || undefined,
            rating: data.score || undefined,
          },
        };
      });
    }
    setEditingReview(null);
  };

  // Handle Review Delete
  const handleDeleteReview = async () => {
    if (!reviewToDelete) return;
    const targetId = contentItem?.id || mediaId;
    try {
      const res = await authFetch(`/api/media/${targetId}/reviews/${reviewToDelete}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setReviewsList((prev) => prev.filter((r) => r.id !== reviewToDelete));
      }
    } finally {
      setReviewToDelete(null);
    }
  };

  // Handle Review Reaction
  const handleReactReview = async (reviewId: number, reactionType: string) => {
    if (!dbUser) {
      await login();
      return;
    }
    const targetId = contentItem?.id || mediaId;
    try {
      const res = await authFetch(`/api/media/${targetId}/reviews/${reviewId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction: reactionType }),
      });
      if (res.ok) {
        const data = await res.json();
        setReviewsList((prev) =>
          prev.map((r) => {
            if (r.id === reviewId) {
              return {
                ...r,
                userReaction: data.userReaction,
                isLiked: data.userReaction === 'LIKE',
                reactions: data.reactions || r.reactions,
                likesCount: data.reactions?.LIKE || (data.userReaction === 'LIKE' ? r.likesCount + 1 : r.likesCount),
              };
            }
            return r;
          })
        );
      }
    } catch (err) {
      console.error('Failed to react to review:', err);
    }
  };

  // Episode watch toggle
  const handleToggleEpisodeWatched = (seasonNumber: number, episodeNumber: number, _watched: boolean) => {
    const epKey = `${seasonNumber}-${episodeNumber}`;
    setWatchedEpisodes((prev) => {
      const next = new Set(prev);
      if (next.has(epKey)) next.delete(epKey);
      else next.add(epKey);
      return next;
    });
  };

  // Adult Content Modal confirmation
  const isContentAdult = Boolean((contentItem as any)?.isAdult || contentItem?.ageRating === '18+' || contentItem?.ageRating === 'AO' || contentItem?.ageRating === 'NC-17' || contentItem?.ageRating === 'R18+');
  if ((isAdultRestricted || isContentAdult) && !adultConfirmed && (!dbUser || !dbUser.showAdultContent)) {
    return (
      <AdultContentWarning
        title={contentItem?.title || rawMedia?.title}
        ageRating={contentItem?.ageRating || rawMedia?.ageRating || '18+'}
        contentWarnings={(contentItem as any)?.contentWarnings || (rawMedia as any)?.contentWarnings || []}
        onConfirm={async () => {
          setAdultConfirmed(true);
          setIsAdultRestricted(false);
          await fetchMedia();
        }}
        onBack={goBack}
      />
    );
  }

  // Loading Screen
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#8B5CF6]" />
        <span className="text-xs text-[#94A3B8] font-medium tracking-wide">
          Загрузка информации о произведении...
        </span>
      </div>
    );
  }

  // Error Screen
  if (error || !contentItem) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-[#F8FAFC]">Не удалось загрузить тайтл</h2>
          <p className="text-xs text-[#94A3B8] max-w-md mx-auto">{error || 'Страница недоступна'}</p>
        </div>
        <button
          onClick={goBack}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-semibold inline-flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-[#7C3AED]/25"
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

  // Tab definitions with icons & counts
  const tabsList: Array<{ id: DetailTab; label: string; icon: any; count?: number }> = [
    { id: 'OVERVIEW', label: 'Обзор', icon: AlignLeft },
    { id: 'INFO', label: 'Информация', icon: Info },
    {
      id: 'CAST_CREW',
      label: 'Актеры / Команда',
      icon: Users,
      count:
        (contentItem.cast?.length || 0) +
        (contentItem.directors?.length || 0) +
        (contentItem.authors?.length || 0) +
        (contentItem.developers?.length || 0) || undefined,
    },
    { id: 'PLOT', label: 'Сюжет', icon: BookOpen },
    { id: 'REVIEWS', label: 'Отзывы', icon: MessageSquare, count: reviewsList.length || undefined },
    {
      id: 'RELATED',
      label: 'Связанный контент',
      icon: GitFork,
      count: (contentItem.relations?.length || 0) + (contentItem.similar?.length || 0) || undefined,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8 animate-in fade-in duration-300">
      {/* Navigation Header with Breadcrumbs & Back Button */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-[#1E2442]">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Назад</span>
          </button>

          <ContentBreadcrumbs type={contentItem.type} items={breadcrumbItems} />
        </div>
      </div>

      {/* 1. Immersive Hero Section */}
      <ContentHero
        item={contentItem}
        userTracking={contentItem.userTracking}
        onStatusChange={handleStatusChange}
        onProgressUpdate={handleProgressUpdate}
        onToggleFavorite={handleToggleFavorite}
        onOpenRatingModal={() => setShowRatingModal(true)}
        onRatingUpdated={(newRating, newDodikData) => {
          setContentItem((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              dodikRating: newDodikData ? {
                averageRating: newDodikData.averageRating,
                ratingCount: newDodikData.ratingCount,
                distribution: newDodikData.distribution,
                userRating: newRating,
              } : prev.dodikRating,
              userTracking: {
                ...prev.userTracking,
                rating: newRating || undefined,
                score: newRating || undefined,
              },
            };
          });
        }}
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

      {/* 2. Navigation Tabs Under Hero */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 border-b border-[#1E2442]">
        {tabsList.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#151932] text-white border border-[#8B5CF6]/50 shadow-md shadow-[#8B5CF6]/10'
                  : 'text-[#94A3B8] hover:text-[#CBD5E1] hover:bg-[#11152A] border border-transparent'
              }`}
            >
              <TabIcon className={`w-4 h-4 ${isActive ? 'text-[#A78BFA]' : 'text-[#64748B]'}`} />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isActive ? 'bg-[#8B5CF6]/30 text-white' : 'bg-[#1E2442] text-[#94A3B8]'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Tab Content Panels */}
      <div className="space-y-8">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Description / Synopsis */}
            <ContentOverview item={contentItem} />

            {/* Quick Metadata Highlights */}
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

            {/* Screenshots / Photos Gallery */}
            {contentItem.screenshots && contentItem.screenshots.length > 0 && (
              <ContentGallery images={contentItem.screenshots} />
            )}

            {/* Official Trailers & Videos */}
            {contentItem.videos && contentItem.videos.length > 0 && (
              <ContentVideos
                videos={contentItem.videos}
                contentTitle={contentItem.title || contentItem.originalTitle}
              />
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
        )}

        {/* TAB 2: INFORMATION */}
        {activeTab === 'INFO' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <ContentMetadataGrid item={contentItem} />
          </div>
        )}

        {/* TAB 3: CAST & CREW */}
        {activeTab === 'CAST_CREW' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <ContentCastCrew
              cast={contentItem.cast}
              crew={[
                ...(contentItem.directors || []),
                ...(contentItem.writers || []),
                ...(contentItem.producers || []),
                ...(contentItem.authors || []),
                ...(contentItem.mangaka || []),
                ...(contentItem.developers?.map((d) => ({ name: d.name, role: 'Разработчик' })) || []),
                ...(contentItem.publishers?.map((p) => ({ name: p.name, role: 'Издатель' })) || []),
              ]}
              type={contentItem.type}
            />
          </div>
        )}

        {/* TAB 4: PLOT */}
        {activeTab === 'PLOT' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <ContentPlot item={contentItem} />
          </div>
        )}

        {/* TAB 5: REVIEWS */}
        {activeTab === 'REVIEWS' && (
          <div className="space-y-8 animate-in fade-in duration-200">
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
          </div>
        )}

        {/* TAB 6: RELATED CONTENT */}
        {activeTab === 'RELATED' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {contentItem.relations && contentItem.relations.length > 0 && (
              <ContentMangaRelations relations={contentItem.relations} />
            )}
            {contentItem.similar && contentItem.similar.length > 0 && (
              <ContentSimilar items={contentItem.similar} />
            )}
            {!contentItem.relations?.length && !contentItem.similar?.length && (
              <div className="p-8 rounded-3xl bg-[#11152A] border border-[#1E2442] text-center space-y-2">
                <GitFork className="w-8 h-8 text-[#64748B] mx-auto stroke-1" />
                <p className="text-xs text-[#94A3B8]">Связанный контент и франшизы не найдены</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rating Modal */}
      {showRatingModal && (
        <ContentRatingModal
          isOpen={showRatingModal}
          onClose={() => setShowRatingModal(false)}
          currentRating={contentItem.userTracking?.rating || contentItem.userTracking?.score || null}
          onSaveRating={handleSaveRating}
          itemTitle={contentItem.title}
        />
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <ContentReviewModal
          isOpen={showReviewModal}
          onClose={() => {
            setShowReviewModal(false);
            setEditingReview(null);
          }}
          onSubmit={handleSubmitReview}
          existingReview={editingReview}
          itemTitle={contentItem.title}
        />
      )}

      {/* Add To List Modal */}
      {showAddToList && (
        <AddToListModal
          media={{
            id: Number(contentItem.id || mediaId),
            mediaId: Number(contentItem.id || mediaId),
            title: contentItem.title,
            type: contentItem.type,
            posterUrl: contentItem.posterUrl,
            year: contentItem.year,
            rating: contentItem.rating,
            provider: contentItem.provider,
            externalId: contentItem.externalId,
          }}
          onClose={() => setShowAddToList(false)}
          onAdded={() => setShowAddToList(false)}
        />
      )}

      {/* Delete Review Confirm Modal */}
      {reviewToDelete !== null && (
        <ConfirmModal
          isOpen={true}
          title="Удалить отзыв"
          message="Вы уверены, что хотите удалить свой отзыв? Это действие необратимо."
          confirmText="Удалить"
          cancelText="Отмена"
          variant="danger"
          onConfirm={handleDeleteReview}
          onCancel={() => setReviewToDelete(null)}
        />
      )}
    </div>
  );
};
