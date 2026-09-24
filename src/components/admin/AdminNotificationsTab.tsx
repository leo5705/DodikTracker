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
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      {/* Header & Sender Box */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Compose */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
          <div className="flex items-center gap-3 pb-3 border-b border-[#1E2442]">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/15 text-[#A78BFA] flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#F8FAFC]">Центр рассылки уведомлений</h3>
              <p className="text-xs sm:text-sm text-[#94A3B8]">
                Отправка адресных и массовых системных push-уведомлений на платформе
              </p>
            </div>
          </div>

          {feedback && (
            <div
              className={`p-4 rounded-2xl text-sm flex items-center gap-2.5 ${
                feedback.success
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-red-500/15 text-red-300 border border-red-500/30'
              }`}
            >
              {feedback.success ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
              <span>{feedback.message}</span>
            </div>
          )}

          <form onSubmit={handleSend} className="space-y-4">
            {/* Target Select */}
            <div>
              <label className="text-xs sm:text-sm text-[#94A3B8] block mb-2 font-semibold">Аудитория получателей:</label>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setTarget('ALL')}
                  className={`h-11 rounded-2xl border text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    target === 'ALL'
                      ? 'bg-[#8B5CF6] text-white border-[#8B5CF6] shadow-lg shadow-purple-950/40'
                      : 'bg-[#11152A] text-[#94A3B8] border-[#1E2442] hover:border-[#8B5CF6]/40'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Все (Broadcast)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTarget('ROLE')}
                  className={`h-11 rounded-2xl border text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    target === 'ROLE'
                      ? 'bg-[#8B5CF6] text-white border-[#8B5CF6] shadow-lg shadow-purple-950/40'
                      : 'bg-[#11152A] text-[#94A3B8] border-[#1E2442] hover:border-[#8B5CF6]/40'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>По роли</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTarget('SPECIFIC')}
                  className={`h-11 rounded-2xl border text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    target === 'SPECIFIC'
                      ? 'bg-[#8B5CF6] text-white border-[#8B5CF6] shadow-lg shadow-purple-950/40'
                      : 'bg-[#11152A] text-[#94A3B8] border-[#1E2442] hover:border-[#8B5CF6]/40'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Конкретному</span>
                </button>
              </div>
            </div>

            {/* Target Sub-inputs */}
            {target === 'ROLE' && (
              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">Выберите целевую роль:</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
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
                <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">Имя пользователя (username):</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите никнейм пользователя..."
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">Заголовок *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Важное системное уведомление..."
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
                />
              </div>

              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">Ссылка перехода (опционально)</label>
                <input
                  type="text"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="/calendar или https://..."
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs sm:text-sm text-[#94A3B8] block mb-1.5 font-semibold">Текст сообщения *</label>
              <textarea
                required
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Текст оповещения для пользователя..."
                className="w-full p-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none resize-none custom-scrollbar"
              />
            </div>

            <div className="pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs sm:text-sm text-blue-300 font-medium">
                <input
                  type="checkbox"
                  checked={sendTelegram}
                  onChange={(e) => setSendTelegram(e.target.checked)}
                  className="w-4 h-4 rounded border-[#1E2442] bg-[#11152A] text-[#8B5CF6]"
                />
                <span>Дублировать в Telegram (пользователям с привязанным ботом)</span>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={sending || !title.trim() || !body.trim()}
                className="h-11 px-6 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-40 text-white text-sm font-bold transition-colors flex items-center gap-2 shadow-lg shadow-purple-950/40 cursor-pointer"
              >
                {sending ? <RotateCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Отправить уведомление</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right: Live Preview Box */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] flex flex-col justify-between space-y-4 shadow-xl">
          <div>
            <h4 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-3">
              Предпросмотр уведомления
            </h4>

            <div className="p-4 sm:p-5 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-2.5">
              <div className="flex items-center gap-2.5 text-sm font-bold text-[#F8FAFC]">
                <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-[#A78BFA] flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <span className="truncate">{title.trim() || 'Заголовок оповещения'}</span>
              </div>

              <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
                {body.trim() || 'Здесь будет отображаться текст уведомления, как его увидит пользователь в панели.'}
              </p>

              {link.trim() && (
                <div className="text-xs text-[#A78BFA] flex items-center gap-1.5 font-semibold pt-1">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{link.trim()}</span>
                </div>
              )}
            </div>
          </div>

          <div className="text-xs text-[#64748B] border-t border-[#1E2442] pt-3 leading-relaxed">
            Уведомления сохраняются в базу данных, рассылаются через Server-Sent Events (SSE) в реальном времени и отображаются в колокольчике пользователя.
          </div>
        </div>
      </div>

      {/* Recent Notifications Sent */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
        <h3 className="text-base font-bold text-[#F8FAFC]">История отправленных уведомлений</h3>

        {loadingHistory ? (
          <div className="py-12 text-center text-sm text-[#94A3B8]">Загрузка истории...</div>
        ) : history.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#64748B]">Уведомлений пока не отправлялось</div>
        ) : (
          <div className="space-y-2.5">
            {history.map((h) => (
              <div
                key={h.id}
                className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="font-bold text-base text-[#F8FAFC] flex items-center gap-2">
                    <span>{h.title}</span>
                    {h.recipientUsername && (
                      <span className="text-xs text-[#A78BFA] font-mono">@{h.recipientUsername}</span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-[#94A3B8] truncate mt-0.5">{h.body}</p>
                </div>
                <span className="text-xs text-[#64748B] whitespace-nowrap font-mono">
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
