import React, { useState, useEffect } from 'react';
import { X, Loader2, Bookmark, Film, User, Star, Calendar, Globe, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface ListViewModalProps {
  listId: number;
  onClose: () => void;
  onSelectMedia?: (mediaId: number) => void;
  onOpenUserProfile?: (username: string) => void;
}

export const ListViewModal: React.FC<ListViewModalProps> = ({
  listId,
  onClose,
  onSelectMedia,
  onOpenUserProfile,
}) => {
  const { authFetch } = useAuth();
  const [list, setList] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchList = async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/api/lists/${listId}`);
        if (!res.ok) {
          throw new Error('Не удалось загрузить список или он приватный');
        }
        const data = await res.json();
        setList(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchList();
  }, [listId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl bg-[#14131A] border border-[#252233] p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#252233]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#AC82FF]">
              <Bookmark className="w-3.5 h-3.5" />
              <span>Пользовательский список</span>
              {list && (
                <span className="text-[10px] text-[#9A94AA] flex items-center gap-1">
                  • {list.visibility === 'PUBLIC' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {list.visibility}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-[#F3F1F8] truncate mt-0.5">{list?.title || 'Загрузка...'}</h2>
            {list?.ownerUsername && (
              <p
                onClick={() => onOpenUserProfile?.(list.ownerUsername)}
                className="text-xs text-[#9A94AA] hover:text-[#AC82FF] cursor-pointer flex items-center gap-1 mt-0.5 transition-colors"
              >
                <User className="w-3 h-3" />
                Автор: @{list.ownerUsername}
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
              <Loader2 className="w-6 h-6 animate-spin text-[#AC82FF]" />
              <span>Загрузка элементов списка...</span>
            </div>
          ) : list ? (
            <>
              {list.description && (
                <p className="text-xs text-[#D5D0E3] bg-[#191724] p-3 rounded-xl border border-[#252233] leading-relaxed">
                  {list.description}
                </p>
              )}

              {(!list.items || list.items.length === 0) ? (
                <div className="py-12 text-center text-xs text-[#9A94AA] p-4 bg-[#191724]/40 rounded-xl border border-[#252233]">
                  В этом списке пока нет медиа.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {list.items.map((item: any) => (
                    <div
                      key={item.id}
                      onClick={() => onSelectMedia?.(item.mediaId)}
                      className="p-2.5 rounded-xl bg-[#191724] border border-[#252233] hover:border-[#3A344E] hover:bg-[#1E1C29] flex items-center gap-3 cursor-pointer transition-all duration-200"
                    >
                      <div className="w-12 h-16 rounded-lg bg-[#201D2C] overflow-hidden shrink-0 border border-[#2E2A40]">
                        {item.posterUrl ? (
                          <img
                            src={item.posterUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#9A94AA]">
                            <Film className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-[#F3F1F8] truncate hover:text-[#AC82FF] transition-colors">
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-[#9A94AA]">
                          {item.year && <span>{item.year}</span>}
                          <span>•</span>
                          <span className="text-[#AC82FF] font-medium">{item.type}</span>
                          {item.rating && (
                            <span className="flex items-center gap-0.5 text-amber-400 font-bold ml-auto">
                              <Star className="w-2.5 h-2.5 fill-amber-400" />
                              {item.rating}
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <p className="text-[10px] text-[#D5D0E3] italic line-clamp-1 mt-1">
                            «{item.notes}»
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
