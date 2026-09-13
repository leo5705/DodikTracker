import React, { useState, useEffect } from 'react';
import { X, Loader2, Layers, User, Film, Globe, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface TierListViewModalProps {
  tierListId: number;
  onClose: () => void;
  onSelectMedia?: (mediaId: number) => void;
  onOpenUserProfile?: (username: string) => void;
}

export const TierListViewModal: React.FC<TierListViewModalProps> = ({
  tierListId,
  onClose,
  onSelectMedia,
  onOpenUserProfile,
}) => {
  const { authFetch } = useAuth();
  const [tierList, setTierList] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTierList = async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/api/tier-lists/${tierListId}`);
        if (!res.ok) {
          throw new Error('Не удалось загрузить тир-лист');
        }
        const data = await res.json();
        setTierList(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTierList();
  }, [tierListId]);

  // Parse tiers & items
  let tiers: any[] = [];
  let items: any[] = [];
  const mediaMap = new Map<number, any>();

  if (tierList) {
    try {
      tiers = JSON.parse(tierList.tiersJson || '[]');
    } catch (_e) {}
    try {
      items = JSON.parse(tierList.itemsJson || '[]');
    } catch (_e) {}
    if (Array.isArray(tierList.resolvedMedia)) {
      tierList.resolvedMedia.forEach((m: any) => mediaMap.set(m.id, m));
    }
  }

  const defaultTiers = [
    { id: 's', label: 'S', color: 'bg-red-600 text-white' },
    { id: 'a', label: 'A', color: 'bg-orange-600 text-white' },
    { id: 'b', label: 'B', color: 'bg-amber-500 text-black' },
    { id: 'c', label: 'C', color: 'bg-emerald-600 text-white' },
    { id: 'd', label: 'D', color: 'bg-blue-600 text-white' },
    { id: 'f', label: 'F', color: 'bg-zinc-600 text-white' },
  ];

  const activeTiers = tiers.length > 0 ? tiers : defaultTiers;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl rounded-2xl bg-[#14131A] border border-[#252233] p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#252233]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-fuchsia-400">
              <Layers className="w-3.5 h-3.5" />
              <span>Тир-лист • {tierList?.category || 'МЕДИА'}</span>
              {tierList && (
                <span className="text-[10px] text-[#9A94AA] flex items-center gap-1">
                  • {tierList.visibility === 'PUBLIC' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {tierList.visibility}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-[#F3F1F8] truncate mt-0.5">{tierList?.title || 'Загрузка...'}</h2>
            {tierList?.ownerUsername && (
              <p
                onClick={() => onOpenUserProfile?.(tierList.ownerUsername)}
                className="text-xs text-[#9A94AA] hover:text-[#AC82FF] cursor-pointer flex items-center gap-1 mt-0.5 transition-colors"
              >
                <User className="w-3 h-3" />
                Автор: @{tierList.ownerUsername}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#1E1C29] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-[#9A94AA] text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-fuchsia-400" />
              <span>Загрузка тир-листа...</span>
            </div>
          ) : tierList ? (
            <>
              {tierList.description && (
                <p className="text-xs text-[#D5D0E3] bg-[#191724] p-3 rounded-xl border border-[#252233] leading-relaxed">
                  {tierList.description}
                </p>
              )}

              {/* Tiers Grid */}
              <div className="space-y-2 rounded-xl overflow-hidden border border-[#252233]">
                {activeTiers.map((tier) => {
                  const tierItems = items.filter((i) => i.tierId === tier.id);

                  return (
                    <div
                      key={tier.id}
                      className="flex border-b border-[#252233] last:border-b-0 min-h-[85px] bg-[#191724]"
                    >
                      {/* Tier Label */}
                      <div
                        className={`w-20 shrink-0 flex items-center justify-center font-black text-xl select-none ${tier.color}`}
                      >
                        {tier.label}
                      </div>

                      {/* Tier Items */}
                      <div className="flex-1 p-2 flex flex-wrap gap-2 items-center min-w-0">
                        {tierItems.length === 0 ? (
                          <span className="text-[11px] text-[#6B667B] italic px-2">Пусто</span>
                        ) : (
                          tierItems.map((item) => {
                            const mediaObj = mediaMap.get(item.id || item.mediaId);
                            const poster = item.posterUrl || mediaObj?.posterUrl;
                            const title = item.title || mediaObj?.title || 'Без названия';
                            const targetId = item.id || item.mediaId;

                            return (
                              <div
                                key={targetId}
                                onClick={() => onSelectMedia?.(targetId)}
                                title={title}
                                className="group relative w-14 h-20 rounded-md overflow-hidden bg-[#201D2C] border border-[#2E2A40] hover:border-[#AC82FF] cursor-pointer shadow transition-all hover:scale-105"
                              >
                                {poster ? (
                                  <img
                                    src={poster}
                                    alt={title}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center">
                                    <Film className="w-3.5 h-3.5 text-[#9A94AA]" />
                                    <span className="text-[8px] text-[#9A94AA] line-clamp-2 mt-0.5">
                                      {title}
                                    </span>
                                  </div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 bg-black/80 px-1 py-0.5 text-[8px] text-[#F3F1F8] truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                  {title}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#252233] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#191724] hover:bg-[#252233] text-xs font-semibold text-[#F3F1F8] transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
