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
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
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
          className="w-full max-w-lg overflow-hidden bg-[#181622] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-white">
                  {isCompletion ? 'Поделиться завершением' : 'Поделиться с друзьями'}
                </h3>
                <p className="text-xs text-white/50">
                  {isCompletion
                    ? 'Расскажите друзьям, что вы завершили этот контент'
                    : 'Отправьте персональную рекомендацию'}
                </p>
              </div>
            </div>
            <button
              id="close-share-modal-btn"
              onClick={onClose}
              className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Preview Mini Card */}
          <div className="p-4 bg-white/[0.03] border-b border-white/10 flex items-center gap-3.5">
            {media.posterUrl ? (
              <img
                src={media.posterUrl}
                alt={media.title}
                referrerPolicy="no-referrer"
                className="w-12 h-16 object-cover rounded-lg border border-white/10 flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-16 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white/30" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                {media.type || 'МЕДИА'}
              </span>
              <h4 className="font-semibold text-white truncate text-sm mt-1">{media.title}</h4>
              {media.rating ? (
                <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  <span className="font-medium">{media.rating}/10</span>
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
                <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="share-friend-search-input"
                  type="text"
                  placeholder="Поиск по друзьям..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-violet-500/50"
                />
              </div>

              {friends.length > 0 && (
                <div className="flex items-center justify-between text-xs text-white/50 px-1">
                  <span>
                    Выбрано:{' '}
                    <strong className="text-violet-300">{selectedFriendIds.length}</strong> из{' '}
                    {friends.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      id="select-all-friends-btn"
                      type="button"
                      onClick={handleSelectAll}
                      className="text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      Выбрать всех
                    </button>
                    <span>•</span>
                    <button
                      id="deselect-all-friends-btn"
                      type="button"
                      onClick={handleDeselectAll}
                      className="hover:text-white/80 transition-colors"
                    >
                      Снять
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Friends list */}
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {loading ? (
                <div className="py-8 text-center text-sm text-white/40">Загрузка друзей...</div>
              ) : friends.length === 0 ? (
                <div className="py-8 text-center text-sm text-white/40 space-y-2">
                  <p>У вас пока нет добавленных друзей</p>
                  <p className="text-xs text-white/30">
                    Добавьте друзей в профиле, чтобы делиться завершённым контентом
                  </p>
                </div>
              ) : filteredFriends.length === 0 ? (
                <div className="py-6 text-center text-sm text-white/40">
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
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-violet-600/20 border-violet-500/40 text-white'
                          : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.06] text-white/80'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          {friend.avatar ? (
                            <img
                              src={friend.avatar}
                              alt={friend.username}
                              className="w-8 h-8 rounded-full object-cover border border-white/10"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-violet-600/30 text-violet-300 font-semibold flex items-center justify-center text-xs border border-violet-500/20">
                              {friend.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium text-sm block truncate">
                            {friend.username}
                          </span>
                          {isAlreadyShared && (
                            <span className="text-[10px] text-amber-400/90 flex items-center gap-1">
                              <UserCheck className="w-3 h-3" />
                              Уже делились
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : 'border-white/20 bg-white/5'
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
                className="text-xs font-medium text-white/60 flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Сообщение к рекомендации (опционально):
              </label>
              <textarea
                id="share-note-input"
                rows={2}
                maxLength={250}
                placeholder="Например: Отличный финал, рекомендую к просмотру!"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/50 resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-end gap-3">
            <button
              id="cancel-share-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
            >
              Отмена
            </button>
            <button
              id="submit-share-btn"
              type="button"
              disabled={selectedFriendIds.length === 0 || submitting}
              onClick={handleShare}
              className="px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600 rounded-xl transition-all shadow-lg shadow-violet-600/20 flex items-center gap-2"
            >
              {submitting ? (
                <>Отправка...</>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  Поделиться ({selectedFriendIds.length})
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
