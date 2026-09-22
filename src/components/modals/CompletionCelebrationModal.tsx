import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, Star, Share2, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/NotificationContext.tsx';
import { ShareContentModal, ShareContentMedia } from './ShareContentModal.tsx';

export interface CompletionItem {
  mediaId: number;
  title: string;
  type?: string;
  posterUrl?: string | null;
  rating?: number | null;
}

interface CompletionCelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: CompletionItem | null;
  onRatingUpdated?: (newRating: number) => void;
}

export const CompletionCelebrationModal: React.FC<CompletionCelebrationModalProps> = ({
  isOpen,
  onClose,
  item,
  onRatingUpdated,
}) => {
  const { authFetch, dbUser } = useAuth();
  const { showToast } = useToast();

  const [currentRating, setCurrentRating] = useState<number | null>(item?.rating || null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [savingRating, setSavingRating] = useState(false);

  // Sync rating on open
  React.useEffect(() => {
    if (item) {
      setCurrentRating(item.rating || null);
    }
  }, [item?.mediaId, item?.rating]);

  if (!isOpen || !item) return null;

  const handleRate = async (score: number) => {
    setCurrentRating(score);
    if (!dbUser) return;

    setSavingRating(true);
    try {
      const res = await authFetch(`/api/media/${item.mediaId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: score }),
      });

      if (res.ok) {
        showToast(`Оценка ${score}/10 сохранена`, 'success');
        if (onRatingUpdated) onRatingUpdated(score);
      }
    } catch (err) {
      console.error('Failed to save rating:', err);
    } finally {
      setSavingRating(false);
    }
  };

  const shareMedia: ShareContentMedia = {
    id: item.mediaId,
    title: item.title,
    type: item.type,
    posterUrl: item.posterUrl,
    rating: currentRating,
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && !isShareModalOpen && (
          <div
            id="completion-modal-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <motion.div
              id="completion-modal"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="w-full max-w-md bg-[#16141F] border border-emerald-500/30 rounded-3xl shadow-2xl overflow-hidden text-center relative"
            >
              {/* Background gradient decorative glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-emerald-500/10 blur-3xl pointer-events-none" />

              {/* Close Button */}
              <button
                id="close-completion-modal-btn"
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="p-7 pt-9 space-y-6">
                {/* Celebratory Icon */}
                <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                  <CheckCircle2 className="w-9 h-9 stroke-[2.2]" />
                </div>

                {/* Title & Content Info */}
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    Завершено!
                  </div>
                  <h3 className="text-xl font-bold text-white px-2 line-clamp-2">
                    Вы завершили: <span className="text-emerald-300">«{item.title}»</span>
                  </h3>
                  <p className="text-xs text-white/50">
                    Отличная работа! Не забудьте оценить и поделиться впечатлениями.
                  </p>
                </div>

                {/* Poster Preview (if available) */}
                {item.posterUrl && (
                  <div className="flex justify-center">
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-20 h-28 object-cover rounded-xl border border-white/15 shadow-xl"
                    />
                  </div>
                )}

                {/* Star Rating Section */}
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span>Ваша оценка:</span>
                    <span className="font-bold text-amber-400 text-sm">
                      {(hoverRating || currentRating) ? `${hoverRating || currentRating}/10` : 'Без оценки'}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-1 sm:gap-1.5 py-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => {
                      const active = (hoverRating !== null ? hoverRating : currentRating || 0) >= star;
                      return (
                        <button
                          key={star}
                          id={`completion-rate-star-${star}`}
                          type="button"
                          disabled={savingRating}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(null)}
                          onClick={() => handleRate(star)}
                          className="p-1 hover:scale-125 transition-transform text-white/20 hover:text-amber-400 focus:outline-none"
                        >
                          <Star
                            className={`w-5 h-5 ${
                              active ? 'text-amber-400 fill-amber-400' : 'text-white/20'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2.5 pt-2">
                  <button
                    id="completion-share-btn"
                    type="button"
                    onClick={() => setIsShareModalOpen(true)}
                    className="w-full py-3 px-5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-2xl transition-all shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2"
                  >
                    <Share2 className="w-4 h-4" />
                    Поделиться с друзьями
                  </button>

                  <button
                    id="completion-done-btn"
                    type="button"
                    onClick={onClose}
                    className="w-full py-2.5 px-4 text-xs font-medium text-white/50 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Embedded Share Modal */}
      <ShareContentModal
        isOpen={isShareModalOpen}
        onClose={() => {
          setIsShareModalOpen(false);
          onClose();
        }}
        media={shareMedia}
        isCompletion={true}
      />
    </>
  );
};
