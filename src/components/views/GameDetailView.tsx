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

interface GameDetailViewProps {
  idOrSlug: string;
}

export const GameDetailView: React.FC<GameDetailViewProps> = ({ idOrSlug }) => {
  const { dbUser } = useAuth();
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

  const fetchGameDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(idOrSlug)}`);
      if (!res.ok) {
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
            provider: game.externalIds.rawg ? 'RAWG' : 'THEGAMESDB',
            externalId: game.externalIds.rawg || game.externalIds.gmdb || game.slug,
          },
          status,
          score: userTracking?.score || undefined,
        }),
      });

      if (!res.ok) throw new Error('Ошибка сохранения статуса');
      const data = await res.json();
      setUserTracking(data);
      showToast(`Статус игры обновлён: ${status}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Ошибка сохранения статуса', 'error');
    }
  };

  const handleSaveScore = async () => {
    if (!dbUser) return;
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
            provider: game.externalIds.rawg ? 'RAWG' : 'THEGAMESDB',
            externalId: game.externalIds.rawg || game.externalIds.gmdb || game.slug,
          },
          status: userTracking?.status || 'COMPLETED',
          score: selectedScore,
        }),
      });

      if (!res.ok) throw new Error('Ошибка сохранения оценки');
      const data = await res.json();
      setUserTracking(data);
      setShowScoreModal(false);
      showToast(`Оценка сохранена: ${selectedScore}/10`, 'success');
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6 w-full max-w-sm space-y-5 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-100 text-center">Оценить {game.title}</h3>
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  onClick={() => setSelectedScore(num)}
                  className={`w-9 h-9 rounded-xl font-bold text-sm border transition-all ${
                    selectedScore === num
                      ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/20'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowScoreModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveScore}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-purple-600/20"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div
            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold shadow-2xl flex items-center gap-2 ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : toastMessage.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
                : 'bg-zinc-900/90 border-purple-500/50 text-zinc-100'
            }`}
          >
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}
    </div>
  );
};
