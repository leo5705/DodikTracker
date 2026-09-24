import React, { useState, useEffect } from 'react';
import { Library, Star, Disc, Loader2 } from 'lucide-react';
import { MusicNav } from '../music/MusicNav.tsx';
import { MusicReleaseCard, ReleaseCardData } from '../music/MusicReleaseCard.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

export const MusicLibraryView: React.FC = () => {
  const { dbUser, authFetch } = useAuth();
  const { navigate } = useRouter();

  const [reviewedReleases, setReviewedReleases] = useState<ReleaseCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUser) {
      setLoading(false);
      return;
    }

    // Fetch user's reviewed releases
    authFetch('/api/music/reviews/my')
      .then((res) => (res.ok ? res.json() : { reviews: [] }))
      .then((data) => {
        const list = (data.reviews || []).map((r: any) => ({
          id: r.releaseId,
          artistId: r.artistId,
          title: r.releaseTitle,
          slug: r.releaseSlug,
          type: r.releaseType || 'ALBUM',
          cover: r.releaseCover,
          stageName: r.artistStageName,
          avgScore: r.overallScore,
        }));
        setReviewedReleases(list);
      })
      .catch((err) => console.error('Error fetching user music library:', err))
      .finally(() => setLoading(false));
  }, [dbUser, authFetch]);

  return (
    <div className="space-y-6 pb-16">
      <MusicNav activeTab="library" />

      <div className="flex items-center gap-2">
        <Library className="w-5 h-5 text-purple-400" />
        <h2 className="text-lg font-bold text-white font-mono">Моя музыкальная медиатека</h2>
      </div>

      {!dbUser ? (
        <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-3">
          <p className="text-sm text-white font-mono font-bold">Авторизуйтесь для доступа к личной медиатеке</p>
        </div>
      ) : loading ? (
        <div className="py-20 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          <span className="text-xs font-mono font-semibold">Загрузка вашей музыкальной медиатеки...</span>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#94A3B8] font-mono uppercase tracking-wider flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400" />
              <span>Оценённые вами релизы ({reviewedReleases.length})</span>
            </h3>

            {reviewedReleases.length === 0 ? (
              <div className="p-10 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-3">
                <Disc className="w-10 h-10 text-purple-400 mx-auto" />
                <p className="text-sm font-bold text-white font-mono">Вы еще не оставляли рецензий на релизы</p>
                <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
                  Слушайте альбомы и синглы авторских исполнителей Dodik Tracker и ставьте свои 100-балльные оценки.
                </p>
                <button
                  onClick={() => navigate('/music/releases')}
                  className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all cursor-pointer inline-block mt-2"
                >
                  Перейти в каталог музыки
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {reviewedReleases.map((rel) => (
                  <MusicReleaseCard key={rel.id} release={rel} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
