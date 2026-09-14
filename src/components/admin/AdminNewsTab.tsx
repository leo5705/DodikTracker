import React, { useState, useEffect } from 'react';
import {
  Newspaper,
  Plus,
  Search,
  Filter,
  Eye,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  Pin,
  Star,
  RotateCw,
  Send,
  X,
  Calendar,
  Image,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export const AdminNewsTab: React.FC = () => {
  const { authFetch } = useAuth();
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Editor Modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    coverImage: '',
    tags: '',
    status: 'PUBLISHED',
    publishedAt: '',
    isPinned: false,
    isFeatured: false,
    sendNotification: true,
  });
  const [saving, setSaving] = useState(false);

  const fetchArticles = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        q: search.trim(),
      });
      const res = await authFetch(`/api/admin/news?${params.toString()}`);
      if (!res.ok) throw new Error('Ошибка загрузки новостей');
      const data = await res.json();
      setArticles(data.items || []);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить новости');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchArticles();
  };

  const handleOpenCreate = () => {
    setEditingArticleId(null);
    setFormData({
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      coverImage: '',
      tags: '',
      status: 'PUBLISHED',
      publishedAt: new Date().toISOString().slice(0, 16),
      isPinned: false,
      isFeatured: false,
      sendNotification: true,
    });
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (article: any) => {
    setEditingArticleId(article.id);
    setFormData({
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt || '',
      content: article.content,
      coverImage: article.coverImage || '',
      tags: Array.isArray(article.tags) ? article.tags.join(', ') : '',
      status: article.status,
      publishedAt: article.publishedAt ? new Date(article.publishedAt).toISOString().slice(0, 16) : '',
      isPinned: !!article.isPinned,
      isFeatured: !!article.isFeatured,
      sendNotification: false,
    });
    setIsEditorOpen(true);
  };

  const handleTitleChange = (val: string) => {
    if (!editingArticleId) {
      // Auto generate slug on create
      const autoSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9а-яё]/gi, '-')
        .replace(/-+/g, '-')
        .slice(0, 60);
      setFormData((prev) => ({ ...prev, title: val, slug: autoSlug }));
    } else {
      setFormData((prev) => ({ ...prev, title: val }));
    }
  };

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        title: formData.title,
        slug: formData.slug,
        excerpt: formData.excerpt,
        content: formData.content,
        coverImage: formData.coverImage,
        tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
        status: formData.status,
        publishedAt: formData.publishedAt ? new Date(formData.publishedAt).toISOString() : null,
        isPinned: formData.isPinned,
        isFeatured: formData.isFeatured,
        sendNotification: formData.sendNotification,
      };

      const url = editingArticleId
        ? `/api/admin/news/${editingArticleId}`
        : '/api/admin/news';
      const method = editingArticleId ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения новости');

      setIsEditorOpen(false);
      fetchArticles();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Вы уверены, что хотите удалить эту новость?')) return;
    try {
      const res = await authFetch(`/api/admin/news/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Ошибка удаления новости');
      fetchArticles();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'PUBLISHED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">Опубликовано</span>;
      case 'DRAFT':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400">Черновик</span>;
      case 'SCHEDULED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300">Запланировано</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400">{st}</span>;
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
              placeholder="Поиск по заголовку новости..."
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

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
          >
            <option value="ALL">Любой статус</option>
            <option value="PUBLISHED">Опубликованные</option>
            <option value="DRAFT">Черновики</option>
            <option value="SCHEDULED">Запланированные</option>
            <option value="ARCHIVED">Архив</option>
          </select>

          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Создать новость
          </button>
        </div>
      </div>

      {/* Articles List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <RotateCw className="w-6 h-6 text-[#9B6BFF] animate-spin" />
          <span className="text-xs text-[#9A94AA]">Загрузка статей...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-400 text-xs bg-red-500/10 rounded-2xl border border-red-500/20">{error}</div>
      ) : articles.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#14131A] border border-[#252233] text-zinc-500 text-xs space-y-2">
          <Newspaper className="w-10 h-10 mx-auto text-zinc-600" />
          <p className="font-semibold text-zinc-400">Новостей пока нет</p>
          <p className="text-[11px]">Нажмите кнопку «Создать новость», чтобы опубликовать первую статью.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((art) => (
            <div
              key={art.id}
              className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] hover:border-[#3A344E] transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                {art.coverImage ? (
                  <img
                    src={art.coverImage}
                    alt={art.title}
                    className="w-16 h-12 rounded-xl object-cover border border-[#252233] shrink-0"
                  />
                ) : (
                  <div className="w-16 h-12 rounded-xl bg-[#0F0E12] border border-[#252233] flex items-center justify-center text-[#656075] shrink-0">
                    <Newspaper className="w-5 h-5" />
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-[#F3F1F8] truncate">{art.title}</h4>
                    {art.isPinned && (
                      <span title="Закреплена" className="text-amber-400">
                        <Pin className="w-3.5 h-3.5 fill-amber-400" />
                      </span>
                    )}
                    {art.isFeatured && (
                      <span title="Главная новость" className="text-purple-400">
                        <Star className="w-3.5 h-3.5 fill-purple-400" />
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[#9A94AA]">
                    {getStatusBadge(art.status)}
                    <span>•</span>
                    <span>Автор: @{art.authorUsername || 'admin'}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {art.viewsCount || 0}
                    </span>
                    <span>•</span>
                    <span>{art.publishedAt ? new Date(art.publishedAt).toLocaleDateString('ru-RU') : 'Не опубликовано'}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={() => handleOpenEdit(art)}
                  className="p-2 rounded-xl bg-[#0F0E12] hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
                  title="Редактировать"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(art.id)}
                  className="p-2 rounded-xl bg-[#0F0E12] hover:bg-red-950/40 text-[#9A94AA] hover:text-red-400 transition-colors"
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[#252233]">
              <h3 className="text-base font-bold text-[#F3F1F8]">
                {editingArticleId ? 'Редактирование новости' : 'Новая публикация'}
              </h3>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="p-1 rounded-lg hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveArticle} className="space-y-4">
              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Заголовок статьи *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Обновление Dodik Tracker v2.5..."
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1">URL Slug</label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="obnovlenie-v2-5"
                    className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1">Статус публикации</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                  >
                    <option value="PUBLISHED">PUBLISHED (Опубликовано)</option>
                    <option value="DRAFT">DRAFT (Черновик)</option>
                    <option value="SCHEDULED">SCHEDULED (Запланировано)</option>
                    <option value="ARCHIVED">ARCHIVED (В архиве)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">URL обложки (Cover image)</label>
                <input
                  type="url"
                  value={formData.coverImage}
                  onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Краткое описание (Excerpt)</label>
                <input
                  type="text"
                  value={formData.excerpt}
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                  placeholder="Короткий анонс для списка новостей..."
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Текст новости (Markdown) *</label>
                <textarea
                  required
                  rows={8}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Подробный текст новости. Поддерживается разметка Markdown..."
                  className="w-full p-3 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] font-mono outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1">Теги (через запятую)</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="релиз, фичи, сообщество"
                    className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1">Дата публикации</label>
                  <input
                    type="datetime-local"
                    value={formData.publishedAt}
                    onChange={(e) => setFormData({ ...formData, publishedAt: e.target.value })}
                    className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#F3F1F8]">
                  <input
                    type="checkbox"
                    checked={formData.isPinned}
                    onChange={(e) => setFormData({ ...formData, isPinned: e.target.checked })}
                    className="rounded border-[#252233]"
                  />
                  <span>Закрепить новость вверху списка</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#F3F1F8]">
                  <input
                    type="checkbox"
                    checked={formData.isFeatured}
                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                    className="rounded border-[#252233]"
                  />
                  <span>Показывать в блоке «Главное»</span>
                </label>

                {!editingArticleId && (
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-purple-300 font-semibold">
                    <input
                      type="checkbox"
                      checked={formData.sendNotification}
                      onChange={(e) => setFormData({ ...formData, sendNotification: e.target.checked })}
                      className="rounded border-[#252233]"
                    />
                    <span>Отправить уведомление всем пользователям</span>
                  </label>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[#252233]">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8]"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-xs font-bold text-white flex items-center gap-1.5"
                >
                  {saving && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                  {editingArticleId ? 'Сохранить изменения' : 'Опубликовать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
