import React, { useState, useEffect } from 'react';
import {
  Radio,
  Plus,
  AlertTriangle,
  RotateCw,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Bell,
  Send,
  X,
  Clock,
  ExternalLink,
  Eye,
  Megaphone,
  Archive,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export interface AnnouncementItem {
  id: number;
  title: string;
  content: string;
  message?: string;
  priority: 'NORMAL' | 'IMPORTANT' | 'CRITICAL';
  severity?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  targetAudience: 'ALL' | 'USERS' | 'ADMINS';
  isActive: boolean;
  publishedAt?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  showBanner: boolean;
  sendTelegram: boolean;
  createdAt: string;
  updatedAt: string;
  readCount?: number;
  author?: {
    id: number;
    username: string;
    avatar?: string | null;
    role?: string;
  };
}

export const AdminAnnouncementsTab: React.FC = () => {
  const { authFetch } = useAuth();
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    priority: 'NORMAL' as 'NORMAL' | 'IMPORTANT' | 'CRITICAL',
    status: 'PUBLISHED' as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    targetAudience: 'ALL' as 'ALL' | 'USERS' | 'ADMINS',
    showBanner: true,
    sendTelegram: false,
    startAt: '',
    endAt: '',
  });
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const fetchAnnouncements = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/announcements');
      if (!res.ok) throw new Error('Ошибка загрузки объявлений');
      const data = await res.json();
      setItems(data || []);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить объявления');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      title: '',
      content: '',
      priority: 'NORMAL',
      status: 'PUBLISHED',
      targetAudience: 'ALL',
      showBanner: true,
      sendTelegram: false,
      startAt: new Date().toISOString().slice(0, 16),
      endAt: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (ann: AnnouncementItem) => {
    setEditingId(ann.id);
    setFormData({
      title: ann.title || '',
      content: ann.content || ann.message || '',
      priority: ann.priority || 'NORMAL',
      status: ann.status || 'PUBLISHED',
      targetAudience: ann.targetAudience || 'ALL',
      showBanner: ann.showBanner !== false,
      sendTelegram: false,
      startAt: ann.startAt ? new Date(ann.startAt).toISOString().slice(0, 16) : '',
      endAt: ann.endAt ? new Date(ann.endAt).toISOString().slice(0, 16) : '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('Заполните заголовок и текст объявления.');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        priority: formData.priority,
        status: formData.status,
        targetAudience: formData.targetAudience,
        showBanner: formData.showBanner,
        sendTelegram: formData.sendTelegram,
        startAt: formData.startAt ? new Date(formData.startAt).toISOString() : null,
        endAt: formData.endAt ? new Date(formData.endAt).toISOString() : null,
      };

      let res;
      if (editingId) {
        res = await authFetch(`/api/admin/announcements/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch('/api/admin/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка при сохранении объявления');

      setIsModalOpen(false);
      await fetchAnnouncements();
    } catch (err: any) {
      alert(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (id: number) => {
    setActionLoadingId(id);
    try {
      const res = await authFetch(`/api/admin/announcements/${id}/publish`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка публикации');
      await fetchAnnouncements();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUnpublish = async (id: number) => {
    setActionLoadingId(id);
    try {
      const res = await authFetch(`/api/admin/announcements/${id}/unpublish`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка снятия с публикации');
      await fetchAnnouncements();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Вы действительно хотите безвозвратно удалить это объявление?')) return;
    setActionLoadingId(id);
    try {
      const res = await authFetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка удаления');
      await fetchAnnouncements();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            Критический
          </span>
        );
      case 'IMPORTANT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Важно
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
            <Megaphone className="w-3.5 h-3.5 text-sky-400" />
            Обычное
          </span>
        );
    }
  };

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (status === 'PUBLISHED' && isActive) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Опубликовано
        </span>
      );
    }
    if (status === 'ARCHIVED' || !isActive) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#11152A] text-[#94A3B8] border border-[#1E2442]">
          <Archive className="w-3.5 h-3.5 text-[#94A3B8]" />
          В архиве
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#11152A] text-zinc-400 border border-[#1E2442]">
        <Clock className="w-3.5 h-3.5 text-zinc-400" />
        Черновик
      </span>
    );
  };

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Megaphone className="w-6 h-6 text-[#8B5CF6]" />
            <h3 className="text-lg font-bold text-[#F8FAFC]">Системные объявления</h3>
          </div>
          <p className="text-xs sm:text-sm text-[#94A3B8] max-w-2xl leading-relaxed">
            Короткие системные сообщения от администрации (технические работы, важные обновления, предупреждения). Отделены от новостных статей.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="h-11 px-5 rounded-2xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-bold transition-all flex items-center gap-2 shrink-0 shadow-lg shadow-purple-950/40 cursor-pointer"
        >
          <Plus className="w-4.5 h-4.5" />
          Создать объявление
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3 bg-[#0B0D20] rounded-3xl border border-[#1E2442]">
          <RotateCw className="w-8 h-8 text-[#8B5CF6] animate-spin" />
          <span className="text-sm text-[#94A3B8]">Загрузка объявлений из базы данных...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-400 text-sm bg-red-500/10 rounded-2xl border border-red-500/20">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="p-16 text-center rounded-3xl bg-[#0B0D20] border border-[#1E2442] text-zinc-500 text-sm space-y-3">
          <Radio className="w-12 h-12 mx-auto text-zinc-600" />
          <p className="font-bold text-base text-zinc-300">Нет объявлений в базе данных</p>
          <p className="text-xs sm:text-sm text-zinc-500 max-w-md mx-auto">
            Создайте первое объявление, чтобы уведомить пользователей о технических работах, важных изменениях или нововведениях.
          </p>
          <button
            onClick={handleOpenCreate}
            className="h-11 px-5 rounded-xl bg-[#1E2442] text-white text-sm font-bold hover:bg-[#322E45] transition-colors cursor-pointer"
          >
            Создать объявление
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((ann) => {
            const isCurrentlyPublished = ann.status === 'PUBLISHED' && ann.isActive;
            return (
              <div
                key={ann.id}
                className={`p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border transition-all duration-200 space-y-4 shadow-lg ${
                  ann.priority === 'CRITICAL' && isCurrentlyPublished
                    ? 'border-rose-500/40 bg-gradient-to-br from-rose-950/10 via-[#0B0D20] to-[#0B0D20]'
                    : ann.priority === 'IMPORTANT' && isCurrentlyPublished
                    ? 'border-amber-500/40 bg-gradient-to-br from-amber-950/10 via-[#0B0D20] to-[#0B0D20]'
                    : isCurrentlyPublished
                    ? 'border-[#8B5CF6]/30'
                    : 'border-[#1E2442] opacity-85'
                }`}
              >
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                    {getPriorityBadge(ann.priority)}
                    {getStatusBadge(ann.status, ann.isActive)}
                    <h4 className="font-bold text-base text-[#F8FAFC]">{ann.title}</h4>
                    <span className="text-xs px-2.5 py-0.5 rounded-md bg-[#11152A] text-zinc-400 font-mono border border-[#1E2442]">
                      Аудитория: {ann.targetAudience === 'ALL' ? 'Все' : ann.targetAudience === 'USERS' ? 'Пользователи' : 'Администраторы'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isCurrentlyPublished ? (
                      <button
                        onClick={() => handleUnpublish(ann.id)}
                        disabled={actionLoadingId === ann.id}
                        className="h-10 px-4 rounded-xl text-xs sm:text-sm font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="Снять с публикации"
                      >
                        {actionLoadingId === ann.id ? (
                          <RotateCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        <span>Снять с публикации</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePublish(ann.id)}
                        disabled={actionLoadingId === ann.id}
                        className="h-10 px-4 rounded-xl text-xs sm:text-sm font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="Опубликовать"
                      >
                        {actionLoadingId === ann.id ? (
                          <RotateCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>Опубликовать</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenEdit(ann)}
                      className="p-2.5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2442] transition-colors cursor-pointer"
                      title="Изменить"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {/* Delete (DANGER ACTION) */}
                    <button
                      onClick={() => handleDelete(ann.id)}
                      disabled={actionLoadingId === ann.id}
                      className="p-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35 transition-colors cursor-pointer"
                      title="Удалить объявление"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Content body */}
                <div className="text-sm text-[#C5C0D3] bg-[#11152A] p-4 rounded-2xl border border-[#1E2442]/70 leading-relaxed whitespace-pre-wrap font-sans">
                  {ann.content || ann.message}
                </div>

                {/* Metadata footer */}
                <div className="flex flex-wrap items-center justify-between text-xs sm:text-sm text-[#7E7890] pt-1.5 gap-2 border-t border-[#1E2442]/50">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1 text-[#94A3B8]">
                      <User className="w-3.5 h-3.5 text-[#8B5CF6]" />
                      Автор: <strong className="text-[#F8FAFC]">@{ann.author?.username || 'admin'}</strong>
                    </span>
                    <span>•</span>
                    <span>Баннер в шапке: <strong className="text-[#D8D4E2]">{ann.showBanner ? 'Да' : 'Нет'}</strong></span>
                    <span>•</span>
                    <span>Прочитано: <strong className="text-[#8B5CF6]">{ann.readCount || 0}</strong> польз.</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span>
                      Создано: {new Date(ann.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    {ann.publishedAt && (
                      <span>
                        • Опубликовано: {new Date(ann.publishedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#1E2442]">
              <div className="flex items-center gap-2.5">
                <Megaphone className="w-6 h-6 text-[#8B5CF6]" />
                <h3 className="text-lg font-bold text-[#F8FAFC]">
                  {editingId ? 'Редактировать объявление' : 'Создать объявление'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl hover:bg-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs sm:text-sm font-semibold text-[#94A3B8] block mb-1.5">
                  Заголовок объявления <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Например: Плановые технические работы в 03:00"
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] placeholder-[#5A5568] outline-none focus:border-[#8B5CF6] transition-colors"
                />
              </div>

              <div>
                <label className="text-xs sm:text-sm font-semibold text-[#94A3B8] block mb-1.5">
                  Текст сообщения (content) <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Опишите суть системного сообщения, сроки и рекомендации для пользователей..."
                  className="w-full p-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] placeholder-[#5A5568] outline-none focus:border-[#8B5CF6] transition-colors leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-[#94A3B8] block mb-1.5">
                    Приоритет (Priority)
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none focus:border-[#8B5CF6]"
                  >
                    <option value="NORMAL">Обычное (NORMAL / Информационное)</option>
                    <option value="IMPORTANT">Важное (IMPORTANT / Предупреждение)</option>
                    <option value="CRITICAL">Критическое (CRITICAL / Высокий приоритет)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs sm:text-sm font-semibold text-[#94A3B8] block mb-1.5">
                    Статус публикации (Status)
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none focus:border-[#8B5CF6]"
                  >
                    <option value="PUBLISHED">Опубликовано (Активно для пользователей)</option>
                    <option value="DRAFT">Черновик (Не видно пользователям)</option>
                    <option value="ARCHIVED">В архиве (Снято с публикации)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-[#94A3B8] block mb-1.5">Целевая аудитория</label>
                  <select
                    value={formData.targetAudience}
                    onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value as any })}
                    className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none focus:border-[#8B5CF6]"
                  >
                    <option value="ALL">Все посетители сайта</option>
                    <option value="USERS">Только авторизованные пользователи</option>
                    <option value="ADMINS">Только персонал (Staff / Модераторы)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs sm:text-sm font-semibold text-[#94A3B8] block mb-1.5">Период действия (опционально)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="datetime-local"
                      value={formData.startAt}
                      onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                      placeholder="С"
                      className="w-full h-11 px-2.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs text-[#F8FAFC] outline-none"
                    />
                    <input
                      type="datetime-local"
                      value={formData.endAt}
                      onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                      placeholder="По"
                      className="w-full h-11 px-2.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs text-[#F8FAFC] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-[#1E2442]">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-[#F8FAFC]">
                  <input
                    type="checkbox"
                    checked={formData.showBanner}
                    onChange={(e) => setFormData({ ...formData, showBanner: e.target.checked })}
                    className="w-4 h-4 rounded border-[#1E2442] text-[#8B5CF6] focus:ring-[#8B5CF6]"
                  />
                  <span>Показывать плавающий баннер в верхней части сайта</span>
                </label>

                {!editingId && (
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm text-sky-300 font-medium">
                    <input
                      type="checkbox"
                      checked={formData.sendTelegram}
                      onChange={(e) => setFormData({ ...formData, sendTelegram: e.target.checked })}
                      className="w-4 h-4 rounded border-[#1E2442] text-sky-500 focus:ring-sky-500"
                    />
                    <span>Отправить уведомление в Telegram (канал / бот) при публикации</span>
                  </label>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-[#1E2442]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-11 px-5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-sm font-semibold text-[#F8FAFC] border border-[#1E2442] transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-11 px-6 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-sm font-bold text-white flex items-center gap-2 shadow-lg shadow-purple-950/40 transition-all cursor-pointer"
                >
                  {saving && <RotateCw className="w-4 h-4 animate-spin" />}
                  {editingId ? 'Сохранить изменения' : formData.status === 'PUBLISHED' ? 'Создать и опубликовать' : 'Сохранить как черновик'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
