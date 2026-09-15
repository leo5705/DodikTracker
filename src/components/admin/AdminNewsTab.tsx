import React, { useState, useEffect } from 'react';
import {
  Newspaper,
  Plus,
  Search,
  Eye,
  Edit2,
  Trash2,
  Pin,
  Star,
  RotateCw,
  X,
  FileText,
  Calendar,
  Sparkles,
  ExternalLink,
  Archive,
  Send,
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
    cover: '',
    tags: '',
    status: 'PUBLISHED',
    publishedAt: '',
    isPinned: false,
    isFeatured: false,
    sendNotification: true,
  });
  const [saving, setSaving] = useState(false);

  // Preview Modal state
  const [previewArticle, setPreviewArticle] = useState<any | null>(null);

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

  const handleOpenCreate = (initialStatus = 'PUBLISHED') => {
    setEditingArticleId(null);
    setFormData({
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      cover: '',
      tags: '',
      status: initialStatus,
      publishedAt: initialStatus === 'PUBLISHED' ? new Date().toISOString().slice(0, 16) : '',
      isPinned: false,
      isFeatured: false,
      sendNotification: initialStatus === 'PUBLISHED',
    });
    setIsEditorOpen(true);
  };

  const handleOpenEdit = async (article: any) => {
    setEditingArticleId(article.id);

    let content = article.content || '';
    if (!content) {
      try {
        const res = await authFetch(`/api/admin/news/${article.id}`);
        if (res.ok) {
          const full = await res.json();
          content = full.content || '';
        }
      } catch {}
    }

    let parsedTags = '';
    if (Array.isArray(article.tags)) {
      parsedTags = article.tags.join(', ');
    } else if (typeof article.tags === 'string') {
      try {
        const arr = JSON.parse(article.tags);
        if (Array.isArray(arr)) parsedTags = arr.join(', ');
        else parsedTags = article.tags;
      } catch {
        parsedTags = article.tags;
      }
    }

    setFormData({
      title: article.title || '',
      slug: article.slug || '',
      excerpt: article.excerpt || '',
      content,
      cover: article.cover || article.coverImage || '',
      tags: parsedTags,
      status: article.status || 'PUBLISHED',
      publishedAt: article.publishedAt ? new Date(article.publishedAt).toISOString().slice(0, 16) : '',
      isPinned: Boolean(article.isPinned),
      isFeatured: Boolean(article.isFeatured),
      sendNotification: false,
    });
    setIsEditorOpen(true);
  };

  const handleTitleChange = (val: string) => {
    if (!editingArticleId) {
      // Auto generate slug on create
      const ruMap: Record<string, string> = {
        а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
        з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
        п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
        ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
      };
      const autoSlug = val
        .toLowerCase()
        .split('')
        .map((char) => ruMap[char] || char)
        .join('')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);

      setFormData((prev) => ({ ...prev, title: val, slug: autoSlug }));
    } else {
      setFormData((prev) => ({ ...prev, title: val }));
    }
  };

  const handleSaveArticle = async (overrideStatus?: string) => {
    const finalStatus = overrideStatus || formData.status || 'PUBLISHED';
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('Пожалуйста, заполните заголовок и текст новости');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: formData.title.trim(),
        slug: formData.slug.trim(),
        excerpt: formData.excerpt.trim() || null,
        content: formData.content.trim(),
        cover: formData.cover.trim() || null,
        tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
        status: finalStatus,
        publishedAt: formData.publishedAt ? new Date(formData.publishedAt).toISOString() : (finalStatus === 'PUBLISHED' ? new Date().toISOString() : null),
        isPinned: formData.isPinned,
        isFeatured: formData.isFeatured,
        broadcastNotification: formData.sendNotification,
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
      await fetchArticles();
    } catch (err: any) {
      alert(err.message || 'Ошибка при сохранении новости');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (article: any) => {
    const nextStatus = article.status === 'PUBLISHED' ? 'ARCHIVED' : 'PUBLISHED';
    const actionLabel = nextStatus === 'PUBLISHED' ? 'опубликовать' : 'снять с публикации (в архив)';
    if (!confirm(`Вы действительно хотите ${actionLabel} новость «${article.title}»?`)) return;

    try {
      const res = await authFetch(`/api/admin/news/${article.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка изменения статуса');
      }
      await fetchArticles();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Вы уверены, что хотите безвозвратно удалить новость «${title}»?`)) return;
    try {
      const res = await authFetch(`/api/admin/news/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка удаления новости');
      }
      await fetchArticles();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Опубликовано
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <FileText className="w-3 h-3" />
            Черновик
          </span>
        );
      case 'ARCHIVED':
      case 'UNPUBLISHED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-zinc-700/30 border border-zinc-600/30 text-zinc-400">
            <Archive className="w-3 h-3" />
            Снято с публикации
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 border border-blue-500/30 text-blue-400">
            <Calendar className="w-3 h-3" />
            Запланировано
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-zinc-800 text-zinc-400">
            {st}
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#14131A] border border-[#252233]">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#9A94AA] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по заголовку или slug..."
              className="w-full pl-9 pr-4 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] placeholder-[#656075] outline-none focus:border-[#9B6BFF] transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-white text-xs font-semibold transition-colors"
          >
            Найти
          </button>
        </form>

        <div className="flex items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none cursor-pointer focus:border-[#9B6BFF]"
          >
            <option value="ALL">Все статусы</option>
            <option value="PUBLISHED">Опубликованные</option>
            <option value="DRAFT">Черновики</option>
            <option value="ARCHIVED">Снятые / В архиве</option>
            <option value="SCHEDULED">Запланированные</option>
          </select>

          <button
            onClick={() => handleOpenCreate('DRAFT')}
            className="px-3.5 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-zinc-300 text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
            title="Создать черновик"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Черновик</span>
          </button>

          <button
            onClick={() => handleOpenCreate('PUBLISHED')}
            className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 shadow-lg shadow-purple-900/20"
          >
            <Plus className="w-4 h-4" />
            Создать новость
          </button>
        </div>
      </div>

      {/* Articles List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3 bg-[#14131A] rounded-2xl border border-[#252233]">
          <RotateCw className="w-6 h-6 text-[#9B6BFF] animate-spin" />
          <span className="text-xs text-[#9A94AA]">Загрузка новостей...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-400 text-xs bg-red-500/10 rounded-2xl border border-red-500/20">{error}</div>
      ) : articles.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#14131A] border border-[#252233] text-zinc-500 text-xs space-y-3">
          <Newspaper className="w-12 h-12 mx-auto text-zinc-600" />
          <div>
            <p className="font-bold text-sm text-zinc-300">Новостей пока нет</p>
            <p className="text-xs text-zinc-500 mt-1">
              Создайте первую публикацию или сохраните черновик для будущих анонсов.
            </p>
          </div>
          <button
            onClick={() => handleOpenCreate('PUBLISHED')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#9B6BFF] text-white font-semibold text-xs mt-2"
          >
            <Plus className="w-4 h-4" />
            Создать первую новость
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((art) => (
            <div
              key={art.id}
              className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] hover:border-[#3A344E] transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-4 min-w-0 flex-1">
                {art.cover ? (
                  <img
                    src={art.cover}
                    alt={art.title}
                    className="w-20 h-14 rounded-xl object-cover border border-[#252233] shrink-0 bg-[#0F0E12]"
                  />
                ) : (
                  <div className="w-20 h-14 rounded-xl bg-[#0F0E12] border border-[#252233] flex items-center justify-center text-[#656075] shrink-0">
                    <Newspaper className="w-6 h-6 text-zinc-600" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-bold text-sm text-[#F3F1F8] break-words line-clamp-1">{art.title}</h4>
                    {art.isPinned && (
                      <span title="Закреплена вверху" className="flex items-center text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                        <Pin className="w-3 h-3 mr-1 fill-amber-400" /> Пин
                      </span>
                    )}
                    {art.isFeatured && (
                      <span title="Главная новость" className="flex items-center text-[10px] text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded">
                        <Star className="w-3 h-3 mr-1 fill-purple-400" /> Главное
                      </span>
                    )}
                  </div>

                  {art.excerpt && (
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-1 break-words">
                      {art.excerpt}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 mt-2 text-xs text-[#9A94AA]">
                    {getStatusBadge(art.status)}
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-300 font-mono text-[11px]">slug: /{art.slug}</span>
                    <span className="text-zinc-600">•</span>
                    <span>Автор: @{art.authorUsername || 'admin'}</span>
                    <span className="text-zinc-600">•</span>
                    <span className="flex items-center gap-1 text-zinc-400">
                      <Eye className="w-3 h-3" />
                      {art.viewsCount || 0}
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-[11px]">
                      {art.publishedAt
                        ? `Опубл.: ${new Date(art.publishedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                        : `Создано: ${new Date(art.createdAt).toLocaleDateString('ru-RU')}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                {/* Preview */}
                <button
                  onClick={() => setPreviewArticle(art)}
                  className="p-2 rounded-xl bg-[#0F0E12] hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
                  title="Предпросмотр статьи"
                >
                  <Eye className="w-4 h-4" />
                </button>

                {/* Toggle Publish / Unpublish */}
                {art.status === 'PUBLISHED' ? (
                  <button
                    onClick={() => handleTogglePublish(art)}
                    className="px-3 py-1.5 rounded-xl bg-[#0F0E12] hover:bg-amber-950/40 border border-[#252233] hover:border-amber-700/50 text-amber-300 text-xs font-semibold transition-all flex items-center gap-1.5"
                    title="Снять с публикации (перенести в архив)"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Снять</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleTogglePublish(art)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-all flex items-center gap-1.5"
                    title="Опубликовать новость"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Опубликовать</span>
                  </button>
                )}

                {/* Edit */}
                <button
                  onClick={() => handleOpenEdit(art)}
                  className="p-2 rounded-xl bg-[#0F0E12] hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
                  title="Редактировать"
                >
                  <Edit2 className="w-4 h-4" />
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(art.id, art.title)}
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
          <div className="w-full max-w-3xl bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-4 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#252233] shrink-0">
              <div className="flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-[#9B6BFF]" />
                <h3 className="text-base font-bold text-[#F3F1F8]">
                  {editingArticleId ? 'Редактирование новости' : 'Создание публикации'}
                </h3>
              </div>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="p-1 rounded-lg hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveArticle();
              }}
              className="space-y-4 overflow-y-auto pr-1 flex-1"
            >
              <div>
                <label className="text-xs text-[#9A94AA] block mb-1 font-semibold">Заголовок статьи *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Например: Обновление Dodik Tracker — новые возможности каталога"
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none focus:border-[#9B6BFF]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1 font-semibold">URL Slug (уникальный адрес)</label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="obnovlenie-kataloga"
                    className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] font-mono outline-none focus:border-[#9B6BFF]"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1 font-semibold">Статус публикации</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none focus:border-[#9B6BFF]"
                  >
                    <option value="PUBLISHED">PUBLISHED (Опубликовано)</option>
                    <option value="DRAFT">DRAFT (Черновик)</option>
                    <option value="ARCHIVED">ARCHIVED (Снято с публикации / Архив)</option>
                    <option value="SCHEDULED">SCHEDULED (Запланировано)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-[#9A94AA] block mb-1 font-semibold">URL обложки (Cover Image)</label>
                <input
                  type="url"
                  value={formData.cover}
                  onChange={(e) => setFormData({ ...formData, cover: e.target.value })}
                  placeholder="https://images.unsplash.com/photo-..."
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none focus:border-[#9B6BFF]"
                />
              </div>

              <div>
                <label className="text-xs text-[#9A94AA] block mb-1 font-semibold">Краткое описание (Excerpt)</label>
                <input
                  type="text"
                  value={formData.excerpt}
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                  placeholder="Короткий анонс для карточки в списке новостей..."
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none focus:border-[#9B6BFF]"
                />
              </div>

              <div>
                <label className="text-xs text-[#9A94AA] block mb-1 font-semibold">Текст новости (Markdown) *</label>
                <textarea
                  required
                  rows={9}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Подробный текст новости. Поддерживается Markdown (# Заголовок, **жирный**, списки, цитаты)..."
                  className="w-full p-3 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] font-mono outline-none focus:border-[#9B6BFF] leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1 font-semibold">Теги (через запятую)</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="обновление, релиз, игры, сообщество"
                    className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none focus:border-[#9B6BFF]"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1 font-semibold">Дата публикации</label>
                  <input
                    type="datetime-local"
                    value={formData.publishedAt}
                    onChange={(e) => setFormData({ ...formData, publishedAt: e.target.value })}
                    className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none focus:border-[#9B6BFF]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#F3F1F8]">
                  <input
                    type="checkbox"
                    checked={formData.isPinned}
                    onChange={(e) => setFormData({ ...formData, isPinned: e.target.checked })}
                    className="rounded border-[#252233] text-[#9B6BFF] focus:ring-0"
                  />
                  <span>Закрепить новость вверху</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#F3F1F8]">
                  <input
                    type="checkbox"
                    checked={formData.isFeatured}
                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                    className="rounded border-[#252233] text-[#9B6BFF] focus:ring-0"
                  />
                  <span>Отметить как «Главная новость»</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-purple-300 font-semibold">
                  <input
                    type="checkbox"
                    checked={formData.sendNotification}
                    onChange={(e) => setFormData({ ...formData, sendNotification: e.target.checked })}
                    className="rounded border-[#252233] text-[#9B6BFF] focus:ring-0"
                  />
                  <span>Отправить системное уведомление пользователям</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#252233] shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8] transition-colors"
                >
                  Отмена
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveArticle('DRAFT')}
                    className="px-4 py-2 rounded-xl bg-[#1E1B29] hover:bg-[#2B273D] border border-[#3A344E] text-xs font-bold text-amber-300 flex items-center gap-1.5 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Сохранить черновик
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveArticle('PUBLISHED')}
                    className="px-5 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-xs font-bold text-white flex items-center gap-1.5 shadow-lg shadow-purple-900/30 transition-colors"
                  >
                    {saving && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                    <Send className="w-3.5 h-3.5" />
                    {editingArticleId ? 'Сохранить и опубликовать' : 'Опубликовать'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Article Preview Modal */}
      {previewArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#252233]">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#9A94AA]">Предпросмотр:</span>
                {getStatusBadge(previewArticle.status)}
              </div>
              <button
                onClick={() => setPreviewArticle(null)}
                className="p-1 rounded-lg hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {previewArticle.cover && (
              <img
                src={previewArticle.cover}
                alt={previewArticle.title}
                className="w-full h-48 sm:h-64 object-cover rounded-xl border border-[#252233]"
              />
            )}

            <div>
              <h2 className="text-xl font-bold text-[#F3F1F8]">{previewArticle.title}</h2>
              <div className="flex items-center gap-3 text-xs text-[#9A94AA] mt-2">
                <span>Автор: @{previewArticle.authorUsername || 'admin'}</span>
                <span>•</span>
                <span>
                  {previewArticle.publishedAt
                    ? new Date(previewArticle.publishedAt).toLocaleDateString('ru-RU')
                    : 'Черновик'}
                </span>
                <span>•</span>
                <span>{previewArticle.viewsCount || 0} просмотров</span>
              </div>
            </div>

            {previewArticle.excerpt && (
              <p className="text-xs text-zinc-300 font-medium italic border-l-2 border-[#9B6BFF] pl-3 py-1">
                {previewArticle.excerpt}
              </p>
            )}

            <div className="text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed border-t border-[#252233] pt-4 font-sans">
              {previewArticle.content}
            </div>

            <div className="flex justify-end pt-4 border-t border-[#252233]">
              <button
                onClick={() => setPreviewArticle(null)}
                className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8]"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

