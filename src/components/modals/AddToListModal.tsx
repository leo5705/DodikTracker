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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-[#14131A] border border-[#252233] p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#252233]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-14 rounded-lg bg-[#191724] border border-[#2E2A40] overflow-hidden shrink-0">
              {media.posterUrl ? (
                <img
                  src={media.posterUrl}
                  alt={media.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#9A94AA]">
                  <Film className="w-4 h-4" />
                </div>
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F3F1F8] line-clamp-1">{media.title}</h2>
              <p className="text-[11px] text-[#9A94AA] flex items-center gap-1.5 mt-0.5">
                <Bookmark className="w-3 h-3 text-[#AC82FF]" />
                Добавить в пользовательский список
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#1E1C29] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#9A94AA] text-xs">
              <Loader2 className="w-5 h-5 animate-spin text-[#AC82FF]" />
              <span>Загрузка ваших списков...</span>
            </div>
          ) : lists.length === 0 && !showCreateForm ? (
            <div className="py-8 text-center space-y-3 p-4 rounded-xl bg-[#191724]/60 border border-[#252233]">
              <div className="w-10 h-10 rounded-full bg-[#201D2C] flex items-center justify-center mx-auto text-[#AC82FF]">
                <ListPlus className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#F3F1F8]">У вас ещё нет списков</p>
                <p className="text-[11px] text-[#9A94AA] mt-0.5">
                  Создайте свою первую коллекцию (например: «Любимое кино», «На выходные»)
                </p>
              </div>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-lg shadow-purple-950/40"
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
                        : 'bg-[#191724] border-[#252233] hover:border-[#3A344E] hover:bg-[#1E1C29]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#F3F1F8] truncate">{lst.title}</span>
                        {lst.visibility === 'PRIVATE' ? (
                          <Lock className="w-3 h-3 text-[#9A94AA]" />
                        ) : (
                          <Globe className="w-3 h-3 text-[#9A94AA]" />
                        )}
                      </div>
                      <p className="text-[10px] text-[#9A94AA] mt-0.5">
                        {lst.itemCount} {lst.itemCount === 1 ? 'элемент' : 'элементов'}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {isCurrentAdding ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#AC82FF]" />
                      ) : isAdded ? (
                        <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-lg">
                          <Check className="w-3.5 h-3.5" />
                          В списке
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="px-2.5 py-1 rounded-lg bg-[#252233] hover:bg-[#9B6BFF] text-[#D5D0E3] hover:text-white text-xs font-medium transition-colors"
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
              className="p-3.5 rounded-xl bg-[#191724] border border-[#3A344E] space-y-3 mt-2 animate-in fade-in"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#F3F1F8] flex items-center gap-1.5">
                  <FolderPlus className="w-3.5 h-3.5 text-[#AC82FF]" />
                  Новый список
                </h4>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="text-[11px] text-[#9A94AA] hover:text-[#F3F1F8]"
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
                className="w-full px-3 py-2 rounded-lg bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#9A94AA] focus:outline-none focus:border-[#AC82FF]"
              />

              <textarea
                placeholder="Описание (необязательно)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#9A94AA] focus:outline-none focus:border-[#AC82FF]"
              />

              <div className="flex items-center justify-between gap-2">
                <select
                  value={newVisibility}
                  onChange={(e) => setNewVisibility(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#14131A] border border-[#2E2A40] text-[11px] text-[#D5D0E3] focus:outline-none"
                >
                  <option value="PUBLIC">Публичный</option>
                  <option value="FRIENDS">Только для друзей</option>
                  <option value="PRIVATE">Приватный</option>
                </select>

                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                  Создать и добавить
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#252233] flex items-center justify-between">
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="text-xs text-[#AC82FF] hover:text-[#C5A3FF] font-semibold inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Создать новый список
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#191724] hover:bg-[#252233] text-xs font-medium text-[#F3F1F8] transition-colors"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
