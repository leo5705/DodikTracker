import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Share2, Check, UserCheck, Search, Sparkles, Star, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/NotificationContext.tsx';

export interface ShareContentMedia {
  id: number;
  title: string;
  type?: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  rating?: number | null;
}

interface FriendItem {
  id: number;
  username: string;
  avatar?: string | null;
  bio?: string | null;
}

interface ShareContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  media: ShareContentMedia | null;
  isCompletion?: boolean;
}

export const ShareContentModal: React.FC<ShareContentModalProps> = ({
  isOpen,
  onClose,
  media,
  isCompletion = false,
}) => {
  const { authFetch, dbUser } = useAuth();
  const { showToast } = useToast();

  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [alreadySharedIds, setAlreadySharedIds] = useState<number[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && dbUser && media) {
      setLoading(true);
      setSelectedFriendIds([]);
      setSearchQuery('');
      setNote('');

      Promise.all([
        authFetch('/api/friends')
          .then((res) => (res.ok ? res.json() : []))
          .catch(() => []),
        authFetch(`/api/media/${media.id}/share-status`)
          .then((res) => (res.ok ? res.json() : { sharedUserIds: [] }))
          .catch(() => ({ sharedUserIds: [] })),
      ])
        .then(([friendsData, statusData]) => {
          setFriends(friendsData || []);
          setAlreadySharedIds(statusData?.sharedUserIds || []);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, dbUser, media?.id]);

  if (!isOpen || !media) return null;

  const filteredFriends = friends.filter((f) =>
    f.username.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const toggleSelectFriend = (friendId: number) => {
    setSelectedFriendIds((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]
    );
  };

  const handleSelectAll = () => {
    const available = filteredFriends
      .filter((f) => !alreadySharedIds.includes(f.id))
      .map((f) => f.id);
    setSelectedFriendIds(available);
  };

  const handleDeselectAll = () => {
    setSelectedFriendIds([]);
  };

  const handleShare = async () => {
    if (selectedFriendIds.length === 0) {
      showToast('Выберите хотя бы одного друга для отправки', 'info');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch(`/api/media/${media.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserIds: selectedFriendIds,
          note: note.trim() || undefined,
          rating: media.rating,
          isCompletion: Boolean(isCompletion),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при отправке');
      }

      showToast(data.message || 'Успешно отправлено друзьям!', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Не удалось поделиться', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        id="share-content-modal-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080A18]/80 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          id="share-content-modal"
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-lg overflow-hidden bg-[#11152A] border border-[#1E2442] rounded-3xl shadow-2xl flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[#1E2442] bg-[#0B0D20]/50">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#151932] border border-[#8B5CF6]/30 text-[#A78BFA]">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[#F8FAFC]">
                  {isCompletion ? 'Поделиться завершением' : 'Поделиться с друзьями'}
                </h3>
                <p className="text-xs text-[#94A3B8]">
                  {isCompletion
                    ? 'Расскажите друзьям, что вы завершили этот контент'
                    : 'Отправьте персональную рекомендацию'}
                </p>
              </div>
            </div>
            <button
              id="close-share-modal-btn"
              onClick={onClose}
              className="p-2 text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Preview Mini Card */}
          <div className="p-4 bg-[#0B0D20] border-b border-[#1E2442] flex items-center gap-3.5">
            {media.posterUrl ? (
              <img
                src={media.posterUrl}
                alt={media.title}
                referrerPolicy="no-referrer"
                className="w-12 h-16 object-cover rounded-xl border border-[#1E2442] flex-shrink-0 shadow-sm"
              />
            ) : (
              <div className="w-12 h-16 rounded-xl bg-[#151932] border border-[#1E2442] flex items-center justify-center flex-shrink-0 text-[#A78BFA]">
                <Sparkles className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-[#151932] text-[#A78BFA] border border-[#8B5CF6]/30 font-mono">
                {media.type || 'МЕДИА'}
              </span>
              <h4 className="font-bold text-[#F8FAFC] truncate text-sm mt-1">{media.title}</h4>
              {media.rating ? (
                <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-400 font-mono">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  <span className="font-semibold">{media.rating}/10</span>
                  {isCompletion && (
                    <span className="text-[11px] text-emerald-400 font-medium ml-1">
                      • Завершено
                    </span>
                  )}
                </div>
              ) : isCompletion ? (
                <div className="text-xs text-emerald-400 font-medium mt-1">✓ Завершено</div>
              ) : null}
            </div>
          </div>

          {/* Body */}
          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            {/* Search and select all controls */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="share-friend-search-input"
                  type="text"
                  placeholder="Поиск по друзьям..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-[#080A18] border border-[#1E2442] rounded-xl text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>

              {friends.length > 0 && (
                <div className="flex items-center justify-between text-xs text-[#94A3B8] px-1">
                  <span>
                    Выбрано:{' '}
                    <strong className="text-[#A78BFA] font-mono">{selectedFriendIds.length}</strong> из{' '}
                    <span className="font-mono">{friends.length}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      id="select-all-friends-btn"
                      type="button"
                      onClick={handleSelectAll}
                      className="text-[#A78BFA] hover:text-white transition-colors cursor-pointer"
                    >
                      Выбрать всех
                    </button>
                    <span>•</span>
                    <button
                      id="deselect-all-friends-btn"
                      type="button"
                      onClick={handleDeselectAll}
                      className="hover:text-white transition-colors cursor-pointer"
                    >
                      Снять
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Friends list */}
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
              {loading ? (
                <div className="py-8 text-center text-xs text-[#64748B]">Загрузка друзей...</div>
              ) : friends.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#94A3B8] space-y-2">
                  <p>У вас пока нет добавленных друзей</p>
                  <p className="text-[11px] text-[#64748B]">
                    Добавьте друзей в профиле, чтобы делиться завершённым контентом
                  </p>
                </div>
              ) : filteredFriends.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#64748B]">
                  Друзья по запросу «{searchQuery}» не найдены
                </div>
              ) : (
                filteredFriends.map((friend) => {
                  const isAlreadyShared = alreadySharedIds.includes(friend.id);
                  const isSelected = selectedFriendIds.includes(friend.id);

                  return (
                    <button
                      id={`share-friend-item-${friend.id}`}
                      key={friend.id}
                      type="button"
                      onClick={() => toggleSelectFriend(friend.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/50 text-white'
                          : 'bg-[#0B0D20] border-[#1E2442] hover:bg-[#151932] text-[#CBD5E1]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          {friend.avatar ? (
                            <img
                              src={friend.avatar}
                              alt={friend.username}
                              className="w-8 h-8 rounded-full object-cover border border-[#1E2442]"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#151932] text-[#A78BFA] font-bold flex items-center justify-center text-xs border border-[#8B5CF6]/30">
                              {friend.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-xs block truncate text-[#F8FAFC]">
                            {friend.username}
                          </span>
                          {isAlreadyShared && (
                            <span className="text-[10px] text-amber-400 flex items-center gap-1">
                              <UserCheck className="w-3 h-3" />
                              Уже делились
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                            : 'border-[#1E2442] bg-[#080A18]'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Optional Note Textarea */}
            <div className="space-y-1.5 pt-2">
              <label
                htmlFor="share-note-input"
                className="text-xs font-medium text-[#CBD5E1] flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5 text-[#A78BFA]" />
                Сообщение к рекомендации (опционально):
              </label>
              <textarea
                id="share-note-input"
                rows={2}
                maxLength={250}
                placeholder="Например: Отличный финал, рекомендую к просмотру!"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full p-2.5 bg-[#080A18] border border-[#1E2442] rounded-xl text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#8B5CF6] resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#1E2442] bg-[#0B0D20] flex items-center justify-end gap-3">
            <button
              id="cancel-share-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] rounded-xl transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              id="submit-share-btn"
              type="button"
              disabled={selectedFriendIds.length === 0 || submitting}
              onClick={handleShare}
              className="px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 disabled:opacity-40 rounded-xl transition-all shadow-lg shadow-[#7C3AED]/25 flex items-center gap-2 cursor-pointer"
            >
              {submitting ? (
                <>Отправка...</>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  <span>Поделиться ({selectedFriendIds.length})</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
