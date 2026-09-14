import React, { useState, useEffect } from 'react';
import {
  Bell,
  Send,
  Users,
  User,
  Shield,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export const AdminNotificationsTab: React.FC = () => {
  const { authFetch } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Form state
  const [target, setTarget] = useState<'ALL' | 'ROLE' | 'SPECIFIC'>('ALL');
  const [role, setRole] = useState('USER');
  const [username, setUsername] = useState('');
  const [type, setType] = useState('SYSTEM');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [sendTelegram, setSendTelegram] = useState(false);

  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await authFetch('/api/admin/notifications/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setFeedback(null);

    try {
      const payload: any = {
        target,
        type,
        title: title.trim(),
        body: body.trim(),
        link: link.trim() || undefined,
        sendTelegram,
      };

      if (target === 'ROLE') payload.role = role;
      if (target === 'SPECIFIC') payload.username = username.trim();

      const res = await authFetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка отправки уведомления');

      setFeedback({ success: true, message: data.message || 'Уведомление успешно доставлено' });
      setTitle('');
      setBody('');
      setLink('');
      setUsername('');
      fetchHistory();
    } catch (err: any) {
      setFeedback({ success: false, message: err.message || 'Не удалось отправить' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Sender Box */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Compose */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[#252233]">
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-[#AC82FF] flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#F3F1F8]">Центр рассылки уведомлений</h3>
              <p className="text-xs text-[#9A94AA]">
                Отправка адресных и массовых системных push-уведомлений на платформе
              </p>
            </div>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                feedback.success
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-red-500/15 text-red-300 border border-red-500/30'
              }`}
            >
              {feedback.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{feedback.message}</span>
            </div>
          )}

          <form onSubmit={handleSend} className="space-y-3.5">
            {/* Target Select */}
            <div>
              <label className="text-xs text-[#9A94AA] block mb-1.5 font-semibold">Аудитория получателей:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTarget('ALL')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    target === 'ALL'
                      ? 'bg-[#9B6BFF] text-white border-[#9B6BFF]'
                      : 'bg-[#0F0E12] text-[#9A94AA] border-[#252233] hover:border-[#3A344E]'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Все (Broadcast)
                </button>

                <button
                  type="button"
                  onClick={() => setTarget('ROLE')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    target === 'ROLE'
                      ? 'bg-[#9B6BFF] text-white border-[#9B6BFF]'
                      : 'bg-[#0F0E12] text-[#9A94AA] border-[#252233] hover:border-[#3A344E]'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  По роли
                </button>

                <button
                  type="button"
                  onClick={() => setTarget('SPECIFIC')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    target === 'SPECIFIC'
                      ? 'bg-[#9B6BFF] text-white border-[#9B6BFF]'
                      : 'bg-[#0F0E12] text-[#9A94AA] border-[#252233] hover:border-[#3A344E]'
                  }`}
                >
                  <User className="w-4 h-4" />
                  Конкретному
                </button>
              </div>
            </div>

            {/* Target Sub-inputs */}
            {target === 'ROLE' && (
              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Выберите целевую роль:</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                >
                  <option value="USER">USER (Все обычные пользователи)</option>
                  <option value="NEWS_EDITOR">NEWS_EDITOR (Редакторы новостей)</option>
                  <option value="CONTENT_MANAGER">CONTENT_MANAGER (Контент-менеджеры)</option>
                  <option value="MODERATOR">MODERATOR (Модераторы)</option>
                  <option value="ADMIN">ADMIN (Администраторы)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Суперадмины)</option>
                </select>
              </div>
            )}

            {target === 'SPECIFIC' && (
              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Имя пользователя (username):</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите никнейм пользователя..."
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#9A94AA] block mb-1 font-semibold">Заголовок *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Важное системное уведомление..."
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-[#9A94AA] block mb-1 font-semibold">Ссылка перехода (опционально)</label>
                <input
                  type="text"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="/calendar или https://..."
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-[#9A94AA] block mb-1 font-semibold">Текст сообщения *</label>
              <textarea
                required
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Текст оповещения для пользователя..."
                className="w-full p-3 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
              />
            </div>

            <div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-blue-300 font-medium">
                <input
                  type="checkbox"
                  checked={sendTelegram}
                  onChange={(e) => setSendTelegram(e.target.checked)}
                />
                <span>Дублировать в Telegram (пользователям с привязанным ботом)</span>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={sending || !title.trim() || !body.trim()}
                className="px-6 py-2.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] disabled:opacity-40 text-white text-xs font-bold transition-colors flex items-center gap-2"
              >
                {sending ? <RotateCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Отправить уведомление
              </button>
            </div>
          </form>
        </div>

        {/* Right: Live Preview Box */}
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] flex flex-col justify-between space-y-4">
          <div>
            <h4 className="text-xs font-bold text-[#656075] uppercase tracking-wider mb-3">
              Предпросмотр уведомления
            </h4>

            <div className="p-4 rounded-xl bg-[#0F0E12] border border-[#252233] space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#F3F1F8]">
                <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-[#AC82FF] flex items-center justify-center shrink-0">
                  <Bell className="w-3.5 h-3.5" />
                </div>
                <span className="truncate">{title.trim() || 'Заголовок оповещения'}</span>
              </div>

              <p className="text-xs text-[#9A94AA] leading-relaxed">
                {body.trim() || 'Здесь будет отображаться текст уведомления, как его увидит пользователь в панели.'}
              </p>

              {link.trim() && (
                <div className="text-[11px] text-[#AC82FF] flex items-center gap-1 font-semibold pt-1">
                  <ExternalLink className="w-3 h-3" />
                  {link.trim()}
                </div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-[#656075] border-t border-[#252233] pt-3">
            Уведомления сохраняются в базу данных, рассылаются через Server-Sent Events (SSE) в реальном времени и отображаются в колокольчике пользователя.
          </div>
        </div>
      </div>

      {/* Recent Notifications Sent */}
      <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-3">
        <h3 className="text-sm font-bold text-[#F3F1F8]">История отправленных уведомлений</h3>

        {loadingHistory ? (
          <div className="py-8 text-center text-xs text-[#9A94AA]">Загрузка истории...</div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#656075]">Уведомлений пока не отправлялось</div>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233]/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-bold text-[#F3F1F8] flex items-center gap-2">
                    <span>{h.title}</span>
                    {h.recipientUsername && (
                      <span className="text-[10px] text-[#AC82FF] font-mono">@{h.recipientUsername}</span>
                    )}
                  </div>
                  <p className="text-[#9A94AA] truncate mt-0.5">{h.body}</p>
                </div>
                <span className="text-[11px] text-[#656075] whitespace-nowrap">
                  {new Date(h.createdAt).toLocaleString('ru-RU')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
