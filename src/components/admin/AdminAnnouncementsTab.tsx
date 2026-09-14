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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export const AdminAnnouncementsTab: React.FC = () => {
  const { authFetch } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    severity: 'INFO',
    targetAudience: 'ALL',
    showBanner: true,
    sendTelegram: false,
    isActive: true,
    startAt: '',
    endAt: '',
  });
  const [saving, setSaving] = useState(false);

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
      message: '',
      severity: 'INFO',
      targetAudience: 'ALL',
      showBanner: true,
      sendTelegram: false,
      isActive: true,
      startAt: new Date().toISOString().slice(0, 16),
      endAt: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (ann: any) => {
    setEditingId(ann.id);
    setFormData({
      title: ann.title,
      message: ann.message,
      severity: ann.severity,
      targetAudience: ann.targetAudience,
      showBanner: !!ann.showBanner,
      sendTelegram: false,
      isActive: !!ann.isActive,
      startAt: ann.startAt ? new Date(ann.startAt).toISOString().slice(0, 16) : '',
      endAt: ann.endAt ? new Date(ann.endAt).toISOString().slice(0, 16) : '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingId
        ? `/api/admin/announcements/${editingId}`
        : '/api/admin/announcements';
      const method = editingId ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения объявления');

      setIsModalOpen(false);
      fetchAnnouncements();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить это системное объявление?')) return;
    try {
      const res = await authFetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Ошибка удаления');
      fetchAnnouncements();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleActive = async (ann: any) => {
    try {
      await authFetch(`/api/admin/announcements/${ann.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !ann.isActive }),
      });
      fetchAnnouncements();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">КРИТИЧЕСКОЕ</span>;
      case 'WARNING':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">ПРЕДУПРЕЖДЕНИЕ</span>;
      case 'SUCCESS':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">УСПЕХ</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">ИНФО</span>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-[#14131A] border border-[#252233]">
        <div>
          <h3 className="text-sm font-bold text-[#F3F1F8]">Системные объявления и баннеры</h3>
          <p className="text-xs text-[#9A94AA]">
            Оповещения отображаются вверху страниц сервиса для всех пользователей или отдельных групп.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Создать объявление
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <RotateCw className="w-6 h-6 text-[#9B6BFF] animate-spin" />
          <span className="text-xs text-[#9A94AA]">Загрузка объявлений...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-400 text-xs bg-red-500/10 rounded-2xl border border-red-500/20">{error}</div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#14131A] border border-[#252233] text-zinc-500 text-xs space-y-2">
          <Radio className="w-10 h-10 mx-auto text-zinc-600" />
          <p className="font-semibold text-zinc-400">Нет активных объявлений</p>
          <p className="text-[11px]">Создайте объявление, чтобы уведомить пользователей о технических работах или обновлениях.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((ann) => (
            <div
              key={ann.id}
              className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] hover:border-[#3A344E] transition-all space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {getSeverityBadge(ann.severity)}
                  <h4 className="font-bold text-sm text-[#F3F1F8] truncate">{ann.title}</h4>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                    {ann.targetAudience}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(ann)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors ${
                      ann.isActive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {ann.isActive ? 'Активно' : 'Выключено'}
                  </button>

                  <button
                    onClick={() => handleOpenEdit(ann)}
                    className="p-1.5 rounded-lg bg-[#0F0E12] hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]"
                    title="Редактировать"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(ann.id)}
                    className="p-1.5 rounded-lg bg-[#0F0E12] hover:bg-red-950/40 text-[#9A94AA] hover:text-red-400"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="text-xs text-[#9A94AA] bg-[#0F0E12] p-3 rounded-xl border border-[#252233]/70 leading-relaxed whitespace-pre-wrap">
                {ann.message}
              </div>

              <div className="flex flex-wrap items-center justify-between text-[11px] text-[#656075] pt-1">
                <div className="flex items-center gap-3">
                  <span>Показывать баннером: {ann.showBanner ? 'Да' : 'Нет'}</span>
                  <span>•</span>
                  <span>Создал: @{ann.creatorUsername || 'admin'}</span>
                </div>
                <div>
                  Период: {ann.startAt ? new Date(ann.startAt).toLocaleDateString('ru-RU') : 'Бессрочно'} —{' '}
                  {ann.endAt ? new Date(ann.endAt).toLocaleDateString('ru-RU') : 'Без окончания'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#252233]">
              <h3 className="text-base font-bold text-[#F3F1F8]">
                {editingId ? 'Редактировать объявление' : 'Создать объявление'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Заголовок *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Техническое обслуживание..."
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Текст сообщения *</label>
                <textarea
                  required
                  rows={3}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Сервис будет временно недоступен с 03:00 до 05:00..."
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1">Тип важности</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                  >
                    <option value="INFO">INFO (Информация / Синий)</option>
                    <option value="SUCCESS">SUCCESS (Успех / Зеленый)</option>
                    <option value="WARNING">WARNING (Предупреждение / Желтый)</option>
                    <option value="CRITICAL">CRITICAL (Критический / Красный)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1">Целевая аудитория</label>
                  <select
                    value={formData.targetAudience}
                    onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                    className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                  >
                    <option value="ALL">Все посетители</option>
                    <option value="USERS">Только авторизованные</option>
                    <option value="ADMINS">Только персонал (Staff)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1">Дата начала</label>
                  <input
                    type="datetime-local"
                    value={formData.startAt}
                    onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                    className="w-full p-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#9A94AA] block mb-1">Дата окончания (опционально)</label>
                  <input
                    type="datetime-local"
                    value={formData.endAt}
                    onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                    className="w-full p-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-[#252233]">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#F3F1F8]">
                  <input
                    type="checkbox"
                    checked={formData.showBanner}
                    onChange={(e) => setFormData({ ...formData, showBanner: e.target.checked })}
                  />
                  <span>Показывать плавающий баннер в шапке сайта</span>
                </label>

                {!editingId && (
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-blue-300 font-medium">
                    <input
                      type="checkbox"
                      checked={formData.sendTelegram}
                      onChange={(e) => setFormData({ ...formData, sendTelegram: e.target.checked })}
                    />
                    <span>Отправить уведомление в Telegram-канал/чат</span>
                  </label>
                )}

                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#F3F1F8]">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  <span>Сразу сделать активным</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8]"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-xs font-bold text-white flex items-center gap-1.5"
                >
                  {saving && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                  {editingId ? 'Сохранить' : 'Опубликовать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
