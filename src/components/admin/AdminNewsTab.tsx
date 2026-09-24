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
    setFormData({
      title: article.title || '',
      slug: article.slug || '',
      excerpt: article.excerpt || '',
      content: article.content || '',
      cover: article.cover || '',
      tags: Array.isArray(article.tags) ? article.tags.join(', ') : '',
      status: article.status || 'PUBLISHED',
      publishedAt: article.publishedAt ? new Date(article.publishedAt).toISOString().slice(0, 16) : '',
      isPinned: !!article.isPinned,
      isFeatured: !!article.isFeatured,
      sendNotification: false,
    });
    setIsEditorOpen(true);
  };

  const handleTitleChange = (val: string) => {
    setFormData((prev) => {
      const newForm = { ...prev, title: val };
      if (!editingArticleId && !prev.slug) {
        const translit = val
          .toLowerCase()
          .replace(/[а-яё]/g, (c) => {
            const map: Record<string, string> = {
              а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
              и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
              с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
              ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
            };
            return map[c] || c;
          })
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        newForm.slug = translit;
      }
      return newForm;
    });
  };

  const handleSaveArticle = async (statusOverride?: string) => {
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('Пожалуйста, заполните заголовок и текст статьи.');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        title: formData.title.trim(),
        slug: formData.slug.trim() || undefined,
        excerpt: formData.excerpt.trim() || undefined,
        content: formData.content.trim(),
        cover: formData.cover.trim() || undefined,
        tags: formData.tags ? formData.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        status: statusOverride || formData.status,
        publishedAt: formData.publishedAt ? new Date(formData.publishedAt).toISOString() : undefined,
        isPinned: formData.isPinned,
        isFeatured: formData.isFeatured,
        sendNotification: formData.sendNotification,
      };

      let res;
      if (editingArticleId) {
        res = await authFetch(`/api/admin/news/${editingArticleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch('/api/admin/news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Опубликовано
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <FileText className="w-3.5 h-3.5" />
            Черновик
          </span>
        );
      case 'ARCHIVED':
      case 'UNPUBLISHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#11152A] border border-[#1E2442] text-[#94A3B8]">
            <Archive className="w-3.5 h-3.5" />
            Снято с публикации
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/15 border border-blue-500/30 text-blue-400">
            <Calendar className="w-3.5 h-3.5" />
            Запланировано
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#11152A] border border-[#1E2442] text-[#94A3B8]">
            {st}
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 w-full animate-in fade-in duration-200">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4.5 h-4.5 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по заголовку или slug..."
              className="w-full h-11 pl-10 pr-4 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] placeholder-[#64748B] outline-none focus:border-[#8B5CF6] transition-colors"
            />
          </div>
          <button
            type="submit"
            className="h-11 px-5 rounded-xl bg-[#151932] hover:bg-[#191D38] border border-[#1E2442] text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            Найти
          </button>
        </form>

        <div className="flex items-center gap-2.5 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs sm:text-sm text-[#F8FAFC] outline-none cursor-pointer focus:border-[#8B5CF6] font-medium"
          >
            <option value="ALL">Все статусы</option>
            <option value="PUBLISHED">Опубликованные</option>
            <option value="DRAFT">Черновики</option>
            <option value="ARCHIVED">Снятые / В архиве</option>
            <option value="SCHEDULED">Запланированные</option>
          </select>

          <button
            onClick={() => handleOpenCreate('DRAFT')}
            className="h-11 px-4 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
            title="Создать черновик"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Черновик</span>
          </button>

          <button
            onClick={() => handleOpenCreate('PUBLISHED')}
            className="h-11 px-5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs sm:text-sm font-bold transition-all flex items-center gap-2 shrink-0 shadow-md shadow-[#7C3AED]/25 cursor-pointer"
          >
            <Plus className="w-4.5 h-4.5" />
            Создать новость
          </button>
        </div>
      </div>

      {/* Articles List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3 bg-[#0B0D20] rounded-2xl border border-[#1E2442]">
          <RotateCw className="w-8 h-8 text-[#8B5CF6] animate-spin" />
          <span className="text-sm text-[#94A3B8]">Загрузка новостей...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-400 text-sm bg-rose-500/10 rounded-2xl border border-rose-500/20">
          {error}
        </div>
      ) : articles.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#0B0D20] border border-[#1E2442] text-[#64748B] text-sm space-y-3">
          <Newspaper className="w-12 h-12 mx-auto text-[#64748B]" />
          <div>
            <p className="font-bold text-base text-[#F8FAFC]">Новостей пока нет</p>
            <p className="text-xs sm:text-sm text-[#94A3B8] mt-1">
              Создайте первую публикацию или сохраните черновик для будущих анонсов.
            </p>
          </div>
          <button
            onClick={() => handleOpenCreate('PUBLISHED')}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-[#7C3AED] text-white font-bold text-sm mt-2 cursor-pointer hover:bg-[#6D28D9] transition-colors shadow-md"
          >
            <Plus className="w-4.5 h-4.5" />
            Создать первую новость
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {articles.map((art) => (
            <div
              key={art.id}
              className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg"
            >
              <div className="flex items-start gap-4 min-w-0 flex-1">
                {art.cover ? (
                  <img
                    src={art.cover}
                    alt={art.title}
                    className="w-24 h-16 sm:w-28 sm:h-20 rounded-2xl object-cover border border-[#1E2442] shrink-0 bg-[#11152A]"
                  />
                ) : (
                  <div className="w-24 h-16 sm:w-28 sm:h-20 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-center text-[#64748B] shrink-0">
                    <Newspaper className="w-7 h-7 text-[#64748B]" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-bold text-base text-[#F8FAFC] break-words line-clamp-1">{art.title}</h4>
                    {art.isPinned && (
                      <span title="Закреплена вверху" className="flex items-center text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-md font-semibold">
                        <Pin className="w-3.5 h-3.5 mr-1 fill-amber-400" /> Пин
                      </span>
                    )}
                    {art.isFeatured && (
                      <span title="Главная новость" className="flex items-center text-xs text-[#A78BFA] bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 px-2 py-0.5 rounded-md font-semibold">
                        <Star className="w-3.5 h-3.5 mr-1 fill-[#A78BFA]" /> Главное
                      </span>
                    )}
                  </div>

                  {art.excerpt && (
                    <p className="text-xs sm:text-sm text-[#94A3B8] mt-1 line-clamp-1 break-words">
                      {art.excerpt}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 mt-2.5 text-xs sm:text-sm text-[#94A3B8]">
                    {getStatusBadge(art.status)}
                    <span className="text-[#1E2442]">•</span>
                    <span className="text-[#CBD5E1] font-mono text-xs">slug: /{art.slug}</span>
                    <span className="text-[#1E2442]">•</span>
                    <span>Автор: @{art.authorUsername || 'admin'}</span>
                    <span className="text-[#1E2442]">•</span>
                    <span className="flex items-center gap-1 text-[#94A3B8]">
                      <Eye className="w-3.5 h-3.5" />
                      {art.viewsCount || 0}
                    </span>
                    <span className="text-[#1E2442]">•</span>
                    <span className="text-xs font-mono text-[#64748B]">
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
                  className="p-2.5 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                  title="Предпросмотр статьи"
                >
                  <Eye className="w-4 h-4" />
                </button>

                {/* Toggle Publish / Unpublish */}
                {art.status === 'PUBLISHED' ? (
                  <button
                    onClick={() => handleTogglePublish(art)}
                    className="h-10 px-4 rounded-xl bg-[#11152A] hover:bg-amber-950/40 border border-[#1E2442] hover:border-amber-700/50 text-amber-300 text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Снять с публикации (перенести в архив)"
                  >
                    <Archive className="w-4 h-4" />
                    <span>Снять</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleTogglePublish(art)}
                    className="h-10 px-4 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Опубликовать новость"
                  >
                    <Send className="w-4 h-4" />
                    <span>Опубликовать</span>
                  </button>
                )}

                {/* Edit */}
                <button
                  onClick={() => handleOpenEdit(art)}
                  className="p-2.5 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                  title="Редактировать"
                >
                  <Edit2 className="w-4 h-4" />
                </button>

                {/* Delete (DANGER ACTION) */}
                <button
                  onClick={() => handleDelete(art.id, art.title)}
                  className="p-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 transition-colors cursor-pointer"
                  title="Удалить новость"
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
          <div className="w-full max-w-4xl bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 sm:p-7 space-y-4 my-8 max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#1E2442] shrink-0">
              <div className="flex items-center gap-2.5">
                <Newspaper className="w-6 h-6 text-[#8B5CF6]" />
                <h3 className="text-lg font-bold text-[#F8FAFC]">
                  {editingArticleId ? 'Редактирование новости' : 'Создание публикации'}
                </h3>
              </div>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="p-2 rounded-xl hover:bg-[#151932] text-[#64748B] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveArticle();
              }}
              className="space-y-4 overflow-y-auto pr-1 flex-1 custom-scrollbar"
            >
              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">Заголовок статьи *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Например: Обновление Dodik Tracker — новые возможности каталога"
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none focus:border-[#8B5CF6]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">URL Slug (уникальный адрес)</label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="obnovlenie-kataloga"
                    className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] font-mono outline-none focus:border-[#8B5CF6]"
                  />
                </div>

                <div>
                  <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">Статус публикации</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none focus:border-[#8B5CF6]"
                  >
                    <option value="PUBLISHED">PUBLISHED (Опубликовано)</option>
                    <option value="DRAFT">DRAFT (Черновик)</option>
                    <option value="ARCHIVED">ARCHIVED (Снято с публикации / Архив)</option>
                    <option value="SCHEDULED">SCHEDULED (Запланировано)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">URL обложки (Cover Image)</label>
                <input
                  type="url"
                  value={formData.cover}
                  onChange={(e) => setFormData({ ...formData, cover: e.target.value })}
                  placeholder="https://images.unsplash.com/photo-..."
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none focus:border-[#8B5CF6]"
                />
              </div>

              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">Краткое описание (Excerpt)</label>
                <input
                  type="text"
                  value={formData.excerpt}
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                  placeholder="Короткий анонс для карточки в списке новостей..."
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none focus:border-[#8B5CF6]"
                />
              </div>

              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">Текст новости (Markdown) *</label>
                <textarea
                  required
                  rows={9}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Подробный текст новости. Поддерживается Markdown (# Заголовок, **жирный**, списки, цитаты)..."
                  className="w-full p-4 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] font-mono outline-none focus:border-[#8B5CF6] leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">Теги (через запятую)</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="обновление, релиз, игры, сообщество"
                    className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none focus:border-[#8B5CF6]"
                  />
                </div>

                <div>
                  <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">Дата публикации</label>
                  <input
                    type="datetime-local"
                    value={formData.publishedAt}
                    onChange={(e) => setFormData({ ...formData, publishedAt: e.target.value })}
                    className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-[#F8FAFC]">
                  <input
                    type="checkbox"
                    checked={formData.isPinned}
                    onChange={(e) => setFormData({ ...formData, isPinned: e.target.checked })}
                    className="w-4 h-4 rounded border-[#1E2442] text-[#8B5CF6] focus:ring-0"
                  />
                  <span>Закрепить новость вверху</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-[#F8FAFC]">
                  <input
                    type="checkbox"
                    checked={formData.isFeatured}
                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                    className="w-4 h-4 rounded border-[#1E2442] text-[#8B5CF6] focus:ring-0"
                  />
                  <span>Отметить как «Главная новость»</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-[#A78BFA] font-semibold">
                  <input
                    type="checkbox"
                    checked={formData.sendNotification}
                    onChange={(e) => setFormData({ ...formData, sendNotification: e.target.checked })}
                    className="w-4 h-4 rounded border-[#1E2442] text-[#8B5CF6] focus:ring-0"
                  />
                  <span>Отправить системное уведомление пользователям</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#1E2442] shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="h-11 px-5 rounded-xl bg-[#151932] hover:bg-[#191D38] border border-[#1E2442] text-sm font-semibold text-[#F8FAFC] transition-colors cursor-pointer"
                >
                  Отмена
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveArticle('DRAFT')}
                    className="h-11 px-5 rounded-xl bg-[#151932] hover:bg-[#191D38] border border-[#1E2442] text-sm font-bold text-amber-300 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    Сохранить черновик
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveArticle('PUBLISHED')}
                    className="h-11 px-6 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-sm font-bold text-white flex items-center gap-2 shadow-md shadow-[#7C3AED]/25 transition-all cursor-pointer"
                  >
                    {saving && <RotateCw className="w-4 h-4 animate-spin" />}
                    <Send className="w-4 h-4" />
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
          <div className="w-full max-w-3xl bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 sm:p-7 space-y-4 my-8 max-h-[90vh] overflow-y-auto shadow-2xl custom-scrollbar">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#1E2442]">
              <div className="flex items-center gap-2.5">
                <span className="text-sm text-[#94A3B8]">Предпросмотр:</span>
                {getStatusBadge(previewArticle.status)}
              </div>
              <button
                onClick={() => setPreviewArticle(null)}
                className="p-2 rounded-xl hover:bg-[#151932] text-[#64748B] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {previewArticle.cover && (
              <img
                src={previewArticle.cover}
                alt={previewArticle.title}
                className="w-full h-56 sm:h-72 object-cover rounded-2xl border border-[#1E2442]"
              />
            )}

            <div>
              <h2 className="text-2xl font-bold text-[#F8FAFC]">{previewArticle.title}</h2>
              <div className="flex items-center gap-3 text-xs sm:text-sm text-[#94A3B8] mt-2">
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
              <p className="text-sm text-[#CBD5E1] font-medium italic border-l-2 border-[#8B5CF6] pl-3.5 py-1">
                {previewArticle.excerpt}
              </p>
            )}

            <div className="text-sm text-[#CBD5E1] whitespace-pre-wrap leading-relaxed border-t border-[#1E2442] pt-4 font-sans">
              {previewArticle.content}
            </div>

            <div className="flex justify-end pt-4 border-t border-[#1E2442]">
              <button
                onClick={() => setPreviewArticle(null)}
                className="h-11 px-6 rounded-xl bg-[#151932] hover:bg-[#191D38] border border-[#1E2442] text-sm font-bold text-[#F8FAFC] cursor-pointer"
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
