import React, { useState, useEffect } from 'react';
import {
  X,
  Bookmark,
  Check,
  Plus,
  Loader2,
  ListPlus,
  FolderPlus,
  Sparkles,
  Lock,
  Globe,
  Film,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface AddToListModalProps {
  media: {
    id?: number;
    mediaId?: number;
    title: string;
    type?: string;
    posterUrl?: string;
    year?: number;
    rating?: number;
    provider?: string;
    externalId?: string | number;
    description?: string;
  };
  onClose: () => void;
  onAdded?: (listId: number) => void;
}

export const AddToListModal: React.FC<AddToListModalProps> = ({ media, onClose, onAdded }) => {
  const { authFetch, dbUser } = useAuth();
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingListId, setAddingListId] = useState<number | null>(null);
  const [addedListIds, setAddedListIds] = useState<Set<number>>(new Set());

  // Create new list state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newVisibility, setNewVisibility] = useState('PUBLIC');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLists = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/lists/my');
      if (res.ok) {
        const data = await res.json();
        setLists(data);

        // Pre-check if this media is already in any lists
        const alreadyIn = new Set<number>();
        const targetId = media.id || media.mediaId;
        data.forEach((l: any) => {
          if (targetId && l.mediaIds && l.mediaIds.includes(targetId)) {
            alreadyIn.add(l.id);
          }
        });
        setAddedListIds(alreadyIn);
      }
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить списки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLists();
  }, []);

  const handleAddToList = async (listId: number) => {
    setAddingListId(listId);
    setError(null);

    try {
      const res = await authFetch(`/api/lists/${listId}/add-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: media.id || media.mediaId,
          mediaPayload: {
            title: media.title,
            type: media.type || 'MOVIE',
            posterUrl: media.posterUrl,
            year: media.year,
            rating: media.rating,
            provider: media.provider,
            externalId: media.externalId,
            description: media.description,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка добавления в список');
      }

      setAddedListIds((prev) => new Set(prev).add(listId));
      onAdded?.(listId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingListId(null);
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const res = await authFetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
          visibility: newVisibility,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Не удалось создать список');
      }

      const createdList = await res.json();

      // Automatically add current media into this new list
      await handleAddToList(createdList.id);

      setShowCreateForm(false);
      setNewTitle('');
      setNewDescription('');
      await fetchLists();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080A18]/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-[#11152A] border border-[#1E2442] p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#1E2442]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-14 rounded-lg bg-[#0B0D20] border border-[#1E2442] overflow-hidden shrink-0">
              {media.posterUrl ? (
                <img
                  src={media.posterUrl}
                  alt={media.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#64748B]">
                  <Film className="w-4 h-4" />
                </div>
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F8FAFC] line-clamp-1">{media.title}</h2>
              <p className="text-[11px] text-[#94A3B8] flex items-center gap-1.5 mt-0.5">
                <Bookmark className="w-3 h-3 text-[#A78BFA]" />
                Добавить в пользовательский список
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            {error}
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#94A3B8] text-xs">
              <Loader2 className="w-5 h-5 animate-spin text-[#A78BFA]" />
              <span>Загрузка ваших списков...</span>
            </div>
          ) : lists.length === 0 && !showCreateForm ? (
            <div className="py-8 text-center space-y-3 p-4 rounded-xl bg-[#0B0D20] border border-[#1E2442]">
              <div className="w-10 h-10 rounded-full bg-[#151932] border border-[#8B5CF6]/30 flex items-center justify-center mx-auto text-[#A78BFA]">
                <ListPlus className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#F8FAFC]">У вас ещё нет списков</p>
                <p className="text-[11px] text-[#94A3B8] mt-0.5">
                  Создайте свою первую коллекцию (например: «Любимое кино», «На выходные»)
                </p>
              </div>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-all shadow-lg shadow-[#7C3AED]/25 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Создать список
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {lists.map((lst) => {
                const isAdded = addedListIds.has(lst.id);
                const isCurrentAdding = addingListId === lst.id;

                return (
                  <div
                    key={lst.id}
                    onClick={() => !isAdded && !isCurrentAdding && handleAddToList(lst.id)}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all cursor-pointer ${
                      isAdded
                        ? 'bg-emerald-500/10 border-emerald-500/40'
                        : 'bg-[#0B0D20] border-[#1E2442] hover:border-[#8B5CF6]/50 hover:bg-[#151932]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#F8FAFC] truncate">{lst.title}</span>
                        {lst.visibility === 'PRIVATE' ? (
                          <Lock className="w-3 h-3 text-[#64748B]" />
                        ) : (
                          <Globe className="w-3 h-3 text-[#64748B]" />
                        )}
                      </div>
                      <p className="text-[10px] text-[#94A3B8] mt-0.5 font-mono">
                        {lst.itemCount} {lst.itemCount === 1 ? 'элемент' : 'элементов'}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {isCurrentAdding ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#A78BFA]" />
                      ) : isAdded ? (
                        <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-lg">
                          <Check className="w-3.5 h-3.5" />
                          В списке
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="px-2.5 py-1 rounded-lg bg-[#151932] hover:bg-[#7C3AED] text-[#CBD5E1] hover:text-white text-xs font-medium transition-colors cursor-pointer border border-[#1E2442]"
                        >
                          Добавить
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Create Form */}
          {showCreateForm && (
            <form
              onSubmit={handleCreateList}
              className="p-3.5 rounded-xl bg-[#0B0D20] border border-[#1E2442] space-y-3 mt-2 animate-in fade-in"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#F8FAFC] flex items-center gap-1.5">
                  <FolderPlus className="w-3.5 h-3.5 text-[#A78BFA]" />
                  Новый список
                </h4>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="text-[11px] text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                >
                  Отмена
                </button>
              </div>

              <input
                type="text"
                placeholder="Название списка (например: Любимые триллеры)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-[#080A18] border border-[#1E2442] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
              />

              <textarea
                placeholder="Описание (необязательно)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-[#080A18] border border-[#1E2442] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
              />

              <div className="flex items-center justify-between gap-2">
                <select
                  value={newVisibility}
                  onChange={(e) => setNewVisibility(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#080A18] border border-[#1E2442] text-[11px] text-[#CBD5E1] focus:outline-none"
                >
                  <option value="PUBLIC">Публичный</option>
                  <option value="FRIENDS">Только для друзей</option>
                  <option value="PRIVATE">Приватный</option>
                </select>

                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                  Создать и добавить
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#1E2442] flex items-center justify-between">
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="text-xs text-[#A78BFA] hover:text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Создать новый список
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#0B0D20] hover:bg-[#151932] border border-[#1E2442] text-xs font-medium text-[#F8FAFC] transition-colors cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
