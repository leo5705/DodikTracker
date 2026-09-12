import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Layers,
  Globe,
  Lock,
  User,
  Calendar,
  Loader2,
  Trash2,
  Share2,
  Check,
  Film,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';

interface TierListDetailViewProps {
  tierListId: number;
}

export const TierListDetailView: React.FC<TierListDetailViewProps> = ({ tierListId }) => {
  const { authFetch, dbUser } = useAuth();
  const { navigate, goBack } = useRouter();

  const [tierList, setTierList] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTierList = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/tier-lists/${tierListId}`);
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Этот тир-лист является приватным и доступен только автору или друзьям');
          }
          if (res.status === 404) {
            throw new Error('Тир-лист не найден в базе данных');
          }
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

    if (tierListId) {
      fetchTierList();
    }
  }, [tierListId, dbUser]);

  const handleDelete = async () => {
    setDeleting(true);
    setActionError(null);
    try {
      const res = await authFetch(`/api/tier-lists/${tierListId}`, { method: 'DELETE' });
      if (res.ok) {
        setShowDeleteModal(false);
        navigate('/tier-lists');
      } else {
        const data = await res.json();
        setActionError(data.error || 'Ошибка удаления тир-листа');
      }
    } catch (err) {
      setActionError('Ошибка при удалении');
    } finally {
      setDeleting(false);
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="py-32 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-10 h-10 text-fuchsia-400 animate-spin" />
        <p className="text-xs text-[#9A94AA] font-mono">Загрузка тир-листа...</p>
      </div>
    );
  }

  if (error || !tierList) {
    return (
      <div className="py-24 text-center space-y-4 max-w-lg mx-auto animate-fadeIn">
        <div className="w-14 h-14 rounded-2xl bg-fuchsia-950/40 border border-fuchsia-800/40 flex items-center justify-center mx-auto text-fuchsia-400">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-[#F3F1F8] font-mono">Доступ ограничен</h2>
        <p className="text-xs text-[#9A94AA] leading-relaxed">{error}</p>
        <div className="pt-2">
          <button
            onClick={() => navigate('/tier-lists')}
            className="px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-semibold shadow transition-all"
          >
            Все тир-листы
          </button>
        </div>
      </div>
    );
  }

  // Parse tiers & items
  let tiers: any[] = [];
  let items: any[] = [];
  const mediaMap = new Map<number, any>();

  try {
    tiers = JSON.parse(tierList.tiersJson || '[]');
  } catch (_e) {}
  try {
    items = JSON.parse(tierList.itemsJson || '[]');
  } catch (_e) {}
  if (Array.isArray(tierList.resolvedMedia)) {
    tierList.resolvedMedia.forEach((m: any) => mediaMap.set(m.id, m));
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
  const isOwner = dbUser && (dbUser.id === tierList.ownerId || dbUser.role === 'ADMIN');

  return (
    <div className="space-y-8 pb-16 animate-fadeIn">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => goBack()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#14131A] hover:bg-[#1F1C2E] border border-[#252233] text-xs font-medium text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад к тир-листам
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14131A] hover:bg-[#1F1C2E] border border-[#252233] text-xs font-medium text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Ссылка скопирована</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Поделиться</span>
              </>
            )}
          </button>

          {isOwner && (
            <button
              onClick={() => setShowDeleteModal(true)}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-xs font-medium text-rose-300 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить</span>
            </button>
          )}
        </div>
      </div>

      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fuchsia-950/60 border border-fuchsia-800/50 text-xs font-semibold text-fuchsia-300">
            <Layers className="w-3.5 h-3.5" />
            Тир-лист • {tierList.category || 'МЕДИА'}
          </span>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 font-mono">
            {tierList.visibility === 'PUBLIC' ? (
              <>
                <Globe className="w-3 h-3 text-emerald-400" />
                <span>Публичный</span>
              </>
            ) : tierList.visibility === 'FRIENDS_ONLY' ? (
              <>
                <Users className="w-3 h-3 text-amber-400" />
                <span>Для друзей</span>
              </>
            ) : (
              <>
                <Lock className="w-3 h-3 text-rose-400" />
                <span>Приватный</span>
              </>
            )}
          </span>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 font-mono">
            <Calendar className="w-3 h-3" />
            {new Date(tierList.createdAt).toLocaleDateString('ru-RU')}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-[#F3F1F8] font-mono tracking-tight">
          {tierList.title}
        </h1>

        {tierList.description && (
          <p className="text-xs sm:text-sm text-[#9A94AA] leading-relaxed max-w-3xl">
            {tierList.description}
          </p>
        )}

        <div className="pt-2 flex items-center gap-2">
          <div
            onClick={() => navigate(`/u/${tierList.ownerUsername}`)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#191724] border border-[#252233] hover:border-fuchsia-500/50 cursor-pointer transition-colors group"
          >
            <div className="w-6 h-6 rounded-full bg-fuchsia-950 flex items-center justify-center text-[10px] font-bold text-fuchsia-300 overflow-hidden">
              {tierList.ownerAvatar ? (
                <img src={tierList.ownerAvatar} alt={tierList.ownerUsername || 'User'} className="w-full h-full object-cover" />
              ) : (
                (tierList.ownerUsername?.[0] || 'U').toUpperCase()
              )}
            </div>
            <span className="text-xs text-[#9A94AA] group-hover:text-fuchsia-300 font-medium transition-colors">
              Автор: @{tierList.ownerUsername || 'anonymous'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Tier Board */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#9A94AA] font-mono">
          Ранжирование тайтлов ({items.length} в тир-листе)
        </h3>

        <div className="rounded-3xl bg-[#14131A] border border-[#252233] overflow-hidden shadow-2xl">
          {activeTiers.map((tier) => {
            const tierItems = items.filter((it: any) => it.tierId === tier.id);

            return (
              <div
                key={tier.id}
                className="flex flex-col sm:flex-row border-b border-[#252233] last:border-b-0 min-h-[96px] bg-[#14131A] hover:bg-[#16141F] transition-colors"
              >
                {/* Tier Rank Label */}
                <div
                  className={`w-full sm:w-24 shrink-0 py-3 sm:py-0 flex items-center justify-center font-black text-2xl select-none uppercase tracking-wider shadow-inner ${tier.color}`}
                >
                  {tier.label}
                </div>

                {/* Tier Content Media Cards */}
                <div className="flex-1 p-3 sm:p-4 flex flex-wrap gap-3 items-center min-w-0 bg-[#16151E]/60">
                  {tierItems.length === 0 ? (
                    <span className="text-xs text-[#6B667B] italic px-2">
                      В этой категории пока нет тайтлов
                    </span>
                  ) : (
                    tierItems.map((it: any) => {
                      const mediaObj = mediaMap.get(it.id || it.mediaId);
                      const poster = it.posterUrl || mediaObj?.posterUrl;
                      const title = it.title || mediaObj?.title || 'Без названия';
                      const targetId = it.id || it.mediaId;
                      const targetType = (mediaObj?.type || 'item').toLowerCase().replace(/_/g, '-');

                      return (
                        <div
                          key={targetId}
                          onClick={() => navigate(`/media/${targetType}/${targetId}`)}
                          title={`${title} (нажмите, чтобы открыть страницу)`}
                          role="link"
                          tabIndex={0}
                          className="group relative w-16 sm:w-20 aspect-[2/3] rounded-xl overflow-hidden bg-[#201D2C] border border-[#2E2A40] hover:border-fuchsia-400 cursor-pointer shadow-md transition-all duration-200 hover:scale-105 hover:shadow-xl"
                        >
                          {poster ? (
                            <img
                              src={poster}
                              alt={title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-1.5 text-center bg-zinc-900">
                              <Film className="w-4 h-4 text-zinc-500 mb-1" />
                              <span className="text-[9px] text-zinc-300 line-clamp-2 leading-tight">
                                {title}
                              </span>
                            </div>
                          )}

                          {/* Hover Overlay with title */}
                          <div className="absolute inset-0 bg-black/85 p-1.5 opacity-0 group-hover:opacity-100 flex flex-col justify-between transition-opacity text-left">
                            <span className="text-[9px] font-bold text-white line-clamp-3 leading-tight">
                              {title}
                            </span>
                            <span className="text-[8px] text-fuchsia-300 font-mono">
                              Открыть →
                            </span>
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
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Удалить тир-лист?"
        message="Вы уверены, что хотите удалить этот тир-лист? Это действие необратимо."
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          setShowDeleteModal(false);
          setActionError(null);
        }}
      />
    </div>
  );
};
