import React, { useState, useEffect } from 'react';
import {
  Film,
  Search,
  Filter,
  Eye,
  EyeOff,
  Edit2,
  Plus,
  Trash2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  X,
  Check,
  Sparkles,
  Link,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export const AdminContentTab: React.FC = () => {
  const { authFetch } = useAuth();
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [visibilityFilter, setVisibilityFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Edit Metadata Modal state
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    originalTitle: '',
    description: '',
    posterUrl: '',
    backdropUrl: '',
    releaseDate: '',
    year: '',
    rating: '',
    isAdult: false,
    ageRating: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Manage External IDs Modal state
  const [externalIdsModalItem, setExternalIdsModalItem] = useState<any | null>(null);
  const [externalIds, setExternalIds] = useState<any[]>([]);
  const [newProvider, setNewProvider] = useState('TMDB');
  const [newExtId, setNewExtId] = useState('');
  const [savingExtId, setSavingExtId] = useState(false);

  const fetchContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        q: search.trim(),
        type: typeFilter,
        visibility: visibilityFilter,
      });
      const res = await authFetch(`/api/admin/content?${params.toString()}`);
      if (!res.ok) throw new Error('Ошибка загрузки контента');
      const data = await res.json();
      setMediaList(data.items || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить медиа-каталог');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
  }, [page, typeFilter, visibilityFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchContent();
  };

  const handleToggleHide = async (item: any) => {
    try {
      // Optimistically update local item state
      setMediaList((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isHidden: !i.isHidden } : i))
      );
      const res = await authFetch(`/api/admin/content/${item.id}/toggle-hide`, { method: 'POST' });
      if (!res.ok) {
        throw new Error('Не удалось изменить статус');
      }
    } catch (err: any) {
      alert(err.message);
      fetchContent();
    }
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    setEditForm({
      title: item.title || '',
      originalTitle: item.originalTitle || '',
      description: item.description || '',
      posterUrl: item.posterUrl || '',
      backdropUrl: item.backdropUrl || '',
      releaseDate: item.releaseDate ? item.releaseDate.split('T')[0] : '',
      year: item.year ? String(item.year) : '',
      rating: item.rating ? String(item.rating) : '',
      isAdult: !!item.isAdult,
      ageRating: item.ageRating || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setSavingEdit(true);

    try {
      const res = await authFetch(`/api/admin/content/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title.trim(),
          originalTitle: editForm.originalTitle.trim() || null,
          description: editForm.description.trim() || null,
          posterUrl: editForm.posterUrl.trim() || null,
          backdropUrl: editForm.backdropUrl.trim() || null,
          releaseDate: editForm.releaseDate || null,
          year: editForm.year ? parseInt(editForm.year, 10) : null,
          rating: editForm.rating ? parseFloat(editForm.rating) : null,
          isAdult: editForm.isAdult,
          ageRating: editForm.ageRating.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка при сохранении');

      setEditingItem(null);
      fetchContent();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleOpenExternalIds = async (item: any) => {
    setExternalIdsModalItem(item);
    try {
      const res = await authFetch(`/api/admin/content/${item.id}`);
      if (res.ok) {
        const data = await res.json();
        setExternalIds(data.externalIds || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddExternalId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!externalIdsModalItem || !newExtId.trim()) return;
    setSavingExtId(true);

    try {
      const res = await authFetch(`/api/admin/content/${externalIdsModalItem.id}/external-ids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: newProvider, externalId: newExtId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка привязки ID');

      setNewExtId('');
      // Reload external IDs
      const detailRes = await authFetch(`/api/admin/content/${externalIdsModalItem.id}`);
      if (detailRes.ok) {
        const detailData = await detailRes.json();
        setExternalIds(detailData.externalIds || []);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingExtId(false);
    }
  };

  const handleDeleteExternalId = async (extId: number) => {
    if (!externalIdsModalItem) return;
    try {
      await authFetch(`/api/admin/content/${externalIdsModalItem.id}/external-ids/${extId}`, {
        method: 'DELETE',
      });
      setExternalIds(externalIds.filter((e) => e.id !== extId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-5 w-full animate-in fade-in duration-200">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4.5 h-4.5 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск произведения по названию..."
              className="w-full h-11 pl-10 pr-4 bg-[#11152A] border border-[#1E2442] focus:border-[#8B5CF6] rounded-xl text-sm text-[#F8FAFC] placeholder-[#64748B] outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            className="h-11 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold transition-colors cursor-pointer shadow-md"
          >
            Найти
          </button>
        </form>

        <div className="flex items-center gap-2.5 flex-wrap">
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs sm:text-sm text-[#F8FAFC] outline-none font-medium cursor-pointer"
          >
            <option value="ALL">Все категории</option>
            <option value="MOVIE">Фильмы (MOVIE)</option>
            <option value="TV">Сериалы (TV)</option>
            <option value="ANIME">Аниме (ANIME)</option>
            <option value="MANGA">Манга (MANGA)</option>
            <option value="GAME">Игры (GAME)</option>
            <option value="BOOK">Книги (BOOK)</option>
            <option value="COMIC">Комиксы (COMIC)</option>
          </select>

          <select
            value={visibilityFilter}
            onChange={(e) => {
              setVisibilityFilter(e.target.value);
              setPage(1);
            }}
            className="h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs sm:text-sm text-[#F8FAFC] outline-none font-medium cursor-pointer"
          >
            <option value="ALL">Вся видимость</option>
            <option value="VISIBLE">Видимые в каталоге</option>
            <option value="HIDDEN">Скрытые из поиска</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="text-xs sm:text-sm text-[#94A3B8] flex items-center justify-between px-1">
        <span>
          Найдено: <strong className="text-[#F8FAFC]">{totalCount}</strong> медиа-объектов
        </span>
        <span>
          Страница <strong className="text-[#F8FAFC]">{page}</strong> из{' '}
          <strong className="text-[#F8FAFC]">{totalPages}</strong>
        </span>
      </div>

      {/* Media Catalog Table */}
      <div className="rounded-2xl bg-[#0B0D20] border border-[#1E2442] overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <RotateCw className="w-8 h-8 text-[#8B5CF6] animate-spin" />
            <span className="text-sm text-[#94A3B8] font-mono">Загрузка каталога...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">{error}</div>
        ) : mediaList.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-sm">Медиа-объекты не найдены</div>
        ) : (
          <div className="overflow-x-auto max-h-[720px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-[#0B0D20]/95 backdrop-blur-md shadow-sm">
                <tr className="border-b border-[#1E2442] text-[#94A3B8] uppercase tracking-wider font-mono text-xs">
                  <th className="py-3.5 px-4">Произведение</th>
                  <th className="py-3.5 px-3.5">Категория</th>
                  <th className="py-3.5 px-3.5 text-center">Год</th>
                  <th className="py-3.5 px-3.5 text-center">Рейтинг</th>
                  <th className="py-3.5 px-3.5 text-center">В трекере</th>
                  <th className="py-3.5 px-3.5">Статус</th>
                  <th className="py-3.5 px-4 text-right">Управление</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2442]">
                {mediaList.map((m) => (
                  <tr key={m.id} className="hover:bg-[#11152A] transition-colors">
                    {/* Media Title & Poster */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3.5">
                        {m.posterUrl ? (
                          <img
                            src={m.posterUrl}
                            alt={m.title}
                            className="w-10 h-14 rounded-xl object-cover border border-[#1E2442] shrink-0 shadow-sm"
                          />
                        ) : (
                          <div className="w-10 h-14 rounded-xl bg-[#11152A] border border-[#1E2442] flex items-center justify-center text-[#64748B] shrink-0">
                            <Film className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-[#F8FAFC] truncate">{m.title}</div>
                          {m.originalTitle && (
                            <div className="text-xs text-[#94A3B8] truncate">{m.originalTitle}</div>
                          )}
                          <div className="text-xs text-[#64748B] font-mono mt-0.5">ID: #{m.id}</div>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-3.5 whitespace-nowrap">
                      <span className="px-2.5 py-1 rounded-md bg-[#11152A] border border-[#1E2442] text-xs font-mono text-purple-300 font-bold">
                        {m.type}
                      </span>
                    </td>

                    {/* Year */}
                    <td className="py-3.5 px-3.5 text-center font-mono text-[#94A3B8] text-xs sm:text-sm">
                      {m.year || '—'}
                    </td>

                    {/* Rating */}
                    <td className="py-3.5 px-3.5 text-center font-mono font-bold text-amber-400 text-xs sm:text-sm">
                      {m.rating ? Number(m.rating).toFixed(1) : '—'}
                    </td>

                    {/* Tracker count */}
                    <td className="py-3.5 px-3.5 text-center font-mono text-[#F8FAFC] text-xs sm:text-sm">
                      {m.trackerCount || 0}
                    </td>

                    {/* Visibility */}
                    <td className="py-3.5 px-3.5 whitespace-nowrap">
                      {m.isHidden ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Скрыто
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Активно
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Edit metadata */}
                        <button
                          onClick={() => handleOpenEdit(m)}
                          title="Редактировать метаданные"
                          className="p-2 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* External IDs */}
                        <button
                          onClick={() => handleOpenExternalIds(m)}
                          title="Внешние ID провайдеров"
                          className="p-2 rounded-xl bg-[#11152A] hover:bg-blue-950/40 text-[#94A3B8] hover:text-blue-300 transition-colors cursor-pointer"
                        >
                          <Link className="w-4 h-4" />
                        </button>

                        {/* Toggle hide */}
                        <button
                          onClick={() => handleToggleHide(m)}
                          title={m.isHidden ? 'Восстановить в поиске' : 'Скрыть из каталога'}
                          className={`p-2 rounded-xl transition-colors cursor-pointer ${
                            m.isHidden
                              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                              : 'bg-[#11152A] text-[#94A3B8] hover:text-amber-400 hover:bg-amber-950/40'
                          }`}
                        >
                          {m.isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 border-t border-[#1E2442] flex items-center justify-between text-xs sm:text-sm text-[#94A3B8]">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="h-10 px-4 rounded-xl bg-[#11152A] border border-[#1E2442] hover:bg-[#151932] disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1.5 font-semibold cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            Назад
          </button>
          <span>
            Страница <strong className="text-[#F8FAFC]">{page}</strong> из{' '}
            <strong className="text-[#F8FAFC]">{totalPages}</strong>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="h-10 px-4 rounded-xl bg-[#11152A] border border-[#1E2442] hover:bg-[#151932] disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1.5 font-semibold cursor-pointer"
          >
            Вперёд
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 1. Edit Metadata Modal */}
      {/* ============================================================ */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-xl bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 sm:p-7 space-y-4 my-8 shadow-2xl">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#1E2442]">
              <h3 className="text-lg font-bold text-[#F8FAFC]">
                Метаданные #{editingItem.id}: {editingItem.title}
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="p-2 rounded-xl hover:bg-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">
                  Название на русском *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
                />
              </div>

              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">
                  Оригинальное название
                </label>
                <input
                  type="text"
                  value={editForm.originalTitle}
                  onChange={(e) => setEditForm({ ...editForm, originalTitle: e.target.value })}
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">Год релиза</label>
                  <input
                    type="number"
                    value={editForm.year}
                    onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                    className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">
                    Рейтинг (0.0 - 10.0)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={editForm.rating}
                    onChange={(e) => setEditForm({ ...editForm, rating: e.target.value })}
                    className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">
                  URL постера (Poster URL)
                </label>
                <input
                  type="url"
                  value={editForm.posterUrl}
                  onChange={(e) => setEditForm({ ...editForm, posterUrl: e.target.value })}
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">Описание сюжета</label>
                <textarea
                  rows={4}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full p-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
                />
              </div>

              <div className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                      18+
                    </span>
                    <span className="text-sm font-bold text-[#F8FAFC]">
                      Маркировка 18+ (Adult Content)
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.isAdult}
                      onChange={(e) => setEditForm({ ...editForm, isAdult: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#1E2442] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>
                <div>
                  <label className="text-xs text-[#94A3B8] font-medium block mb-1">
                    Возрастной рейтинг (Age Rating)
                  </label>
                  <input
                    type="text"
                    placeholder="Например: 18+, 16+, R18, M"
                    value={editForm.ageRating}
                    onChange={(e) => setEditForm({ ...editForm, ageRating: e.target.value })}
                    className="w-full h-10 px-3 bg-[#0B0D20] border border-[#1E2442] rounded-xl text-xs sm:text-sm text-[#F8FAFC] outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#1E2442]">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="h-11 px-5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-sm font-semibold text-[#F8FAFC] border border-[#1E2442] transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="h-11 px-6 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-sm font-bold text-white flex items-center gap-2 transition-colors cursor-pointer shadow-md"
                >
                  {savingEdit && <RotateCw className="w-4 h-4 animate-spin" />}
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. External IDs Manager Modal */}
      {/* ============================================================ */}
      {externalIdsModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#1E2442]">
              <h3 className="text-base font-bold text-[#F8FAFC]">
                Внешние ID: {externalIdsModalItem.title}
              </h3>
              <button
                onClick={() => setExternalIdsModalItem(null)}
                className="p-2 rounded-xl hover:bg-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of current IDs */}
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
              {externalIds.length === 0 ? (
                <div className="text-xs sm:text-sm text-[#64748B] p-4 rounded-xl bg-[#11152A] text-center">
                  Внешние привязки отсутствуют
                </div>
              ) : (
                externalIds.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs sm:text-sm"
                  >
                    <div>
                      <span className="font-bold text-indigo-300 mr-2">{item.provider}:</span>
                      <span className="font-mono text-[#F8FAFC]">{item.externalId}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteExternalId(item.id)}
                      className="p-1.5 text-[#64748B] hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add New ID */}
            <form onSubmit={handleAddExternalId} className="space-y-3.5 pt-3 border-t border-[#1E2442]">
              <div className="grid grid-cols-3 gap-2.5">
                <select
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  className="h-11 px-3 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs sm:text-sm text-[#F8FAFC] outline-none font-semibold cursor-pointer"
                >
                  <option value="TMDB">TMDB</option>
                  <option value="KINOPOISK">Kinopoisk</option>
                  <option value="RAWG">RAWG</option>
                  <option value="ANILIST">AniList</option>
                  <option value="OPENLIBRARY">OpenLib</option>
                </select>

                <input
                  type="text"
                  required
                  value={newExtId}
                  onChange={(e) => setNewExtId(e.target.value)}
                  placeholder="ID провайдера..."
                  className="col-span-2 h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm font-mono text-[#F8FAFC] outline-none"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={savingExtId || !newExtId.trim()}
                  className="h-11 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-sm font-bold text-white flex items-center gap-2 transition-colors cursor-pointer shadow-md"
                >
                  {savingExtId && <RotateCw className="w-4 h-4 animate-spin" />}
                  Добавить привязку
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
