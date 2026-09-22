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
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Ошибка изменения видимости');
      }
      const updated = await res.json();
      setMediaList((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isHidden: updated.isHidden } : i))
      );
    } catch (err: any) {
      // Revert on error
      setMediaList((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isHidden: item.isHidden } : i))
      );
      alert(err.message);
    }
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    setEditForm({
      title: item.title,
      originalTitle: item.originalTitle || '',
      description: item.description || '',
      posterUrl: item.posterUrl || '',
      backdropUrl: item.backdropUrl || '',
      releaseDate: item.releaseDate || '',
      year: item.year ? String(item.year) : '',
      rating: item.rating ? String(item.rating) : '',
      isAdult: Boolean(item.isAdult),
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
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка обновления медиа');

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
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#14131A] border border-[#252233]">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#9A94AA] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск произведения по названию..."
              className="w-full pl-9 pr-4 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] placeholder-[#656075] outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-white text-xs font-semibold"
          >
            Найти
          </button>
        </form>

        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
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
            onChange={(e) => { setVisibilityFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
          >
            <option value="ALL">Вся видимость</option>
            <option value="VISIBLE">Видимые в каталоге</option>
            <option value="HIDDEN">Скрытые из поиска</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="text-xs text-[#9A94AA] flex items-center justify-between px-1">
        <span>Найдено: <strong className="text-[#F3F1F8]">{totalCount}</strong> медиа-объектов</span>
        <span>Страница {page} из {totalPages}</span>
      </div>

      {/* Media Catalog Table */}
      <div className="rounded-2xl bg-[#14131A] border border-[#252233] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <RotateCw className="w-6 h-6 text-[#9B6BFF] animate-spin" />
            <span className="text-xs text-[#9A94AA]">Загрузка каталога...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-xs">{error}</div>
        ) : mediaList.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-xs">Медиа-объекты не найдены</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#252233] bg-[#0F0E12]/80 text-[#656075] uppercase tracking-wider font-mono text-[10px]">
                  <th className="py-3 px-4">Произведение</th>
                  <th className="py-3 px-3">Категория</th>
                  <th className="py-3 px-3 text-center">Год</th>
                  <th className="py-3 px-3 text-center">Рейтинг</th>
                  <th className="py-3 px-3 text-center">В трекере</th>
                  <th className="py-3 px-3">Статус</th>
                  <th className="py-3 px-4 text-right">Управление</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252233]/60">
                {mediaList.map((m) => (
                  <tr key={m.id} className="hover:bg-[#191724] transition-colors">
                    {/* Media Title & Poster */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {m.posterUrl ? (
                          <img
                            src={m.posterUrl}
                            alt={m.title}
                            className="w-9 h-12 rounded-lg object-cover border border-[#252233] shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-12 rounded-lg bg-[#0F0E12] border border-[#252233] flex items-center justify-center text-[#656075] shrink-0">
                            <Film className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-[#F3F1F8] truncate">{m.title}</div>
                          {m.originalTitle && (
                            <div className="text-[11px] text-[#9A94AA] truncate">{m.originalTitle}</div>
                          )}
                          <div className="text-[10px] text-[#656075] font-mono mt-0.5">ID: #{m.id}</div>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-[#0F0E12] border border-[#252233] text-[10px] font-mono text-purple-300 font-bold">
                        {m.type}
                      </span>
                    </td>

                    {/* Year */}
                    <td className="py-3 px-3 text-center font-mono text-[#9A94AA]">
                      {m.year || '—'}
                    </td>

                    {/* Rating */}
                    <td className="py-3 px-3 text-center font-mono font-bold text-amber-400">
                      {m.rating ? Number(m.rating).toFixed(1) : '—'}
                    </td>

                    {/* Tracker count */}
                    <td className="py-3 px-3 text-center font-mono text-[#F3F1F8]">
                      {m.trackerCount || 0}
                    </td>

                    {/* Visibility */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {m.isHidden ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Скрыто
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400">
                          Активно
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Edit metadata */}
                        <button
                          onClick={() => handleOpenEdit(m)}
                          title="Редактировать метаданные"
                          className="p-1.5 rounded-lg bg-[#0F0E12] hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* External IDs */}
                        <button
                          onClick={() => handleOpenExternalIds(m)}
                          title="Внешние ID провайдеров"
                          className="p-1.5 rounded-lg bg-[#0F0E12] hover:bg-blue-950/40 text-[#9A94AA] hover:text-blue-300"
                        >
                          <Link className="w-3.5 h-3.5" />
                        </button>

                        {/* Toggle hide */}
                        <button
                          onClick={() => handleToggleHide(m)}
                          title={m.isHidden ? 'Восстановить в поиске' : 'Скрыть из каталога'}
                          className={`p-1.5 rounded-lg transition-colors ${
                            m.isHidden
                              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                              : 'bg-[#0F0E12] text-[#9A94AA] hover:text-amber-400 hover:bg-amber-950/40'
                          }`}
                        >
                          {m.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
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
        <div className="p-4 border-t border-[#252233] flex items-center justify-between text-xs text-[#9A94AA]">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-xl bg-[#0F0E12] border border-[#252233] hover:bg-[#191724] disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Назад
          </button>
          <span>
            Страница {page} из {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-xl bg-[#0F0E12] border border-[#252233] hover:bg-[#191724] disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1"
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
          <div className="w-full max-w-lg bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[#252233]">
              <h3 className="text-base font-bold text-[#F3F1F8]">
                Метаданные #{editingItem.id}: {editingItem.title}
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1 rounded-lg hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Название на русском *</label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Оригинальное название</label>
                <input
                  type="text"
                  value={editForm.originalTitle}
                  onChange={(e) => setEditForm({ ...editForm, originalTitle: e.target.value })}
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1">Год релиза</label>
                  <input
                    type="number"
                    value={editForm.year}
                    onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                    className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1">Рейтинг (0.0 - 10.0)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={editForm.rating}
                    onChange={(e) => setEditForm({ ...editForm, rating: e.target.value })}
                    className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">URL постера (Poster URL)</label>
                <input
                  type="url"
                  value={editForm.posterUrl}
                  onChange={(e) => setEditForm({ ...editForm, posterUrl: e.target.value })}
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Описание сюжета</label>
                <textarea
                  rows={4}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">18+</span>
                    <span className="text-xs font-bold text-[#F3F1F8]">Маркировка 18+ (Adult Content)</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.isAdult}
                      onChange={(e) => setEditForm({ ...editForm, isAdult: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#252233] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>
                <div>
                  <label className="text-[11px] text-[#9A94AA] block mb-1">Возрастной рейтинг (Age Rating)</label>
                  <input
                    type="text"
                    placeholder="Например: 18+, 16+, R18, M"
                    value={editForm.ageRating}
                    onChange={(e) => setEditForm({ ...editForm, ageRating: e.target.value })}
                    className="w-full p-2 bg-[#14131A] border border-[#252233] rounded-lg text-xs text-[#F3F1F8] outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#252233]">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8]"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-xs font-bold text-white flex items-center gap-1.5"
                >
                  {savingEdit && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
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
          <div className="w-full max-w-md bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#252233]">
              <h3 className="text-sm font-bold text-[#F3F1F8]">
                Внешние ID: {externalIdsModalItem.title}
              </h3>
              <button
                onClick={() => setExternalIdsModalItem(null)}
                className="p-1 rounded-lg hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of current IDs */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {externalIds.length === 0 ? (
                <div className="text-xs text-[#656075] p-3 rounded-xl bg-[#0F0E12] text-center">
                  Внешние привязки отсутствуют
                </div>
              ) : (
                externalIds.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F0E12] border border-[#252233] text-xs"
                  >
                    <div>
                      <span className="font-bold text-indigo-300 mr-2">{item.provider}:</span>
                      <span className="font-mono text-[#F3F1F8]">{item.externalId}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteExternalId(item.id)}
                      className="p-1 text-[#656075] hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add New ID */}
            <form onSubmit={handleAddExternalId} className="space-y-3 pt-3 border-t border-[#252233]">
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  className="p-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
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
                  className="col-span-2 p-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs font-mono text-[#F3F1F8] outline-none"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={savingExtId || !newExtId.trim()}
                  className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-xs font-bold text-white flex items-center gap-1.5"
                >
                  {savingExtId && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
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
