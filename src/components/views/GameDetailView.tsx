import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { UnifiedGame } from '../../types/unifiedGame.ts';
import { GameBreadcrumbs } from '../game/GameBreadcrumbs.tsx';
import { GameHero } from '../game/GameHero.tsx';
import { GameOverview } from '../game/GameOverview.tsx';
import { GameDevelopersPublishers } from '../game/GameDevelopersPublishers.tsx';
import { GamePlatforms } from '../game/GamePlatforms.tsx';
import { GameScreenshotGallery } from '../game/GameScreenshotGallery.tsx';
import { GameVideoList } from '../game/GameVideoList.tsx';
import { GameSeries } from '../game/GameSeries.tsx';
import { GameDLCList } from '../game/GameDLCList.tsx';
import { GameStoreList } from '../game/GameStoreList.tsx';
import { GameDevelopmentTeam } from '../game/GameDevelopmentTeam.tsx';
import { GameRelatedGames } from '../game/GameRelatedGames.tsx';
import { GameAdminDiagnosticModal } from '../game/GameAdminDiagnosticModal.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useShare } from '../../context/ShareContext.tsx';
import { AdultContentWarning } from '../common/AdultContentWarning.tsx';
import { ContentRatingModal } from '../content/ContentRatingModal.tsx';

interface GameDetailViewProps {
  idOrSlug: string;
}

export const GameDetailView: React.FC<GameDetailViewProps> = ({ idOrSlug }) => {
  const { dbUser } = useAuth();
  const { navigate } = useRouter();
  const { openCompletionModal, openShareModal } = useShare();
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const [game, setGame] = useState<UnifiedGame | null>(null);
  const [userTracking, setUserTracking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [selectedScore, setSelectedScore] = useState<number>(0);
  const [isAdultRestricted, setIsAdultRestricted] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);

  const fetchGameDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(idOrSlug)}`);
      if (!res.ok) {
        if (res.status === 403) {
          const errBody = await res.json().catch(() => ({}));
          if (errBody.isAdultRestricted || errBody.code === 'ADULT_RESTRICTED') {
            setIsAdultRestricted(true);
            if (errBody.game) {
              setGame(errBody.game);
            }
            return;
          }
        }
        throw new Error(`Игра не найдена: HTTP ${res.status}`);
      }
      const data = await res.json();
      setGame(data);
      if (data.userTracking) {
        setUserTracking(data.userTracking);
        setSelectedScore(data.userTracking.score || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных игры');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGameDetails();
  }, [idOrSlug]);

  const handleStatusChange = async (status: string) => {
    if (!dbUser) {
      showToast('Для добавления в библиотеку войдите в аккаунт', 'info');
      return;
    }
    if (!game) return;

    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: game.mediaId,
          mediaPayload: {
            type: 'GAME',
            title: game.title,
            originalTitle: game.originalTitle,
            description: game.description,
            posterUrl: game.posterUrl,
            backdropUrl: game.backdropUrl,
            releaseDate: game.releaseDate,
            year: game.year,
            rating: game.rating,
            provider: game.externalIds.rawg
              ? 'RAWG'
              : game.externalIds.igdb
              ? 'IGDB'
              : game.externalIds.gmdb
              ? 'THEGAMESDB'
              : 'LOCAL',
            externalId: String(game.externalIds.rawg || game.externalIds.igdb || game.externalIds.gmdb || game.slug || game.id),
          },
          status,
          score: userTracking?.score || undefined,
        }),
      });

      if (!res.ok) throw new Error('Ошибка сохранения статуса');
      const data = await res.json();
      setUserTracking(data);
      showToast(`Статус игры обновлён: ${status}`, 'success');

      if (status === 'COMPLETED') {
        openCompletionModal({
          mediaId: Number(game.mediaId || data.mediaId),
          title: game.title || game.originalTitle || 'Игра',
          type: 'GAME',
          posterUrl: game.posterUrl,
          rating: userTracking?.score || null,
        });
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка сохранения статуса', 'error');
    }
  };

  const handleSaveScore = async (scoreToSave: number | null) => {
    if (!dbUser || !game) return;

    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: game.mediaId,
          mediaPayload: {
            type: 'GAME',
            title: game.title,
            originalTitle: game.originalTitle,
            description: game.description,
            posterUrl: game.posterUrl,
            backdropUrl: game.backdropUrl,
            releaseDate: game.releaseDate,
            year: game.year,
            rating: game.rating,
            provider: game.externalIds.rawg
              ? 'RAWG'
              : game.externalIds.igdb
              ? 'IGDB'
              : game.externalIds.gmdb
              ? 'THEGAMESDB'
              : 'LOCAL',
            externalId: String(game.externalIds.rawg || game.externalIds.igdb || game.externalIds.gmdb || game.slug || game.id),
          },
          status: userTracking?.status || 'PLANNING',
          score: scoreToSave,
        }),
      });

      if (!res.ok) throw new Error('Ошибка сохранения оценки');
      const data = await res.json();
      setUserTracking(data);
      setShowScoreModal(false);
      showToast(scoreToSave !== null ? `Оценка сохранена: ${scoreToSave}/100` : 'Оценка удалена', 'success');
    } catch (err: any) {
      showToast(err.message || 'Ошибка сохранения оценки', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-zinc-400 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
        <p className="text-sm font-medium">Загрузка единой информации об игре...</p>
      </div>
    );
  }

  // 18+ Adult Restricted / Confirmation Check
  const isGameAdult = Boolean(game?.isAdult || game?.ageRating === '18+' || game?.ageRating === '18' || game?.ageRating === 'AO' || game?.ageRating === 'NC-17');
  if ((isAdultRestricted || isGameAdult) && !adultConfirmed && !dbUser?.showAdultContent) {
    return (
      <AdultContentWarning
        title={game?.title}
        ageRating={game?.ageRating || '18+'}
        contentWarnings={(game as any)?.contentWarnings || []}
        onConfirm={async () => {
          setAdultConfirmed(true);
          setIsAdultRestricted(false);
          await fetchGameDetails();
        }}
        onBack={() => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            navigate('/search');
          }
        }}
      />
    );
  }

  if (error || !game) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-950/50 border border-rose-800/40 text-rose-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100">Не удалось загрузить игру</h2>
        <p className="text-sm text-zinc-400">{error || 'Игра не найдена в базе данных'}</p>
        <button
          onClick={fetchGameDetails}
          className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow-lg shadow-purple-600/20"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Попробовать снова</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Breadcrumbs Navigation */}
      <GameBreadcrumbs
        items={[
          ...(game.genres?.[0]
            ? [{ label: game.genres[0].name, path: `/games/catalog?genre=${encodeURIComponent(game.genres[0].name)}` }]
            : []),
          { label: game.title },
        ]}
      />

      {/* Hero Header */}
      <GameHero
        game={game}
        userTracking={userTracking}
        onStatusChange={handleStatusChange}
        onOpenRatingModal={() => setShowScoreModal(true)}
        onOpenDiagnosticModal={() => setShowDiagnostic(true)}
        onOpenShareModal={() =>
          openShareModal(
            {
              id: Number(game.mediaId),
              title: game.title,
              type: 'GAME',
              posterUrl: game.posterUrl,
              rating: userTracking?.score || null,
            },
            userTracking?.status === 'COMPLETED'
          )
        }
      />

      {/* Main Grid Content */}
      <div className="space-y-8">
        {/* Overview & Description */}
        <GameOverview game={game} />

        {/* Developers and Publishers */}
        <GameDevelopersPublishers
          developers={game.developers}
          publishers={game.publishers}
        />

        {/* Platforms and Requirements */}
        <GamePlatforms platforms={game.platforms} />

        {/* Screenshots Gallery */}
        <GameScreenshotGallery screenshots={game.screenshots} />

        {/* Video & Trailers */}
        <GameVideoList videos={game.videos} />

        {/* Series / Franchise */}
        <GameSeries series={game.series || null} />

        {/* DLCs & Add-ons */}
        <GameDLCList dlcs={game.dlcs} />

        {/* Stores / Buy Links */}
        <GameStoreList stores={game.stores} />

        {/* Development Team Creators */}
        <GameDevelopmentTeam creators={game.creators} />

        {/* Similar Games */}
        <GameRelatedGames games={game.similar} />
      </div>

      {/* Admin Diagnostic Modal */}
      {showDiagnostic && (
        <GameAdminDiagnosticModal
          gameIdOrSlug={idOrSlug}
          isOpen={showDiagnostic}
          onClose={() => setShowDiagnostic(false)}
        />
      )}

      {/* Rating Modal */}
      {showScoreModal && (
        <ContentRatingModal
          isOpen={showScoreModal}
          currentRating={userTracking?.score || userTracking?.rating}
          itemTitle={game.title}
          onClose={() => setShowScoreModal(false)}
          onSaveRating={handleSaveScore}
        />
      )}
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+1rem)] md:bottom-6 right-4 sm:right-6 z-50 pointer-events-auto animate-fade-in">
          <div
            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold shadow-2xl flex items-center gap-2 ${
              toastMessage.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : toastMessage.type === 'error'
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                : 'bg-[#11152A] border-[#8B5CF6]/40 text-[#F8FAFC]'
            }`}
          >
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}
    </div>
  );
};
