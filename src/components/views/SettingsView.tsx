import React, { useState, useEffect } from 'react';
import {
  Settings,
  User,
  Shield,
  Bell,
  Send,
  Lock,
  Globe,
  Users,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
  CheckCheck,
  ExternalLink,
  Sparkles,
  Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface SettingsViewProps {
  onNavigateProfile?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigateProfile }) => {
  const { dbUser, authFetch, refreshProfile, login } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'privacy' | 'notifications'>('profile');

  // Profile Form state
  const [username, setUsername] = useState(dbUser?.username || '');
  const [bio, setBio] = useState(dbUser?.bio || '');
  const [avatar, setAvatar] = useState(dbUser?.avatar || '');

  // Privacy Form state
  const [profileVisibility, setProfileVisibility] = useState(dbUser?.profileVisibility || 'PUBLIC');
  const [libraryVisibility, setLibraryVisibility] = useState(dbUser?.libraryVisibility || 'PUBLIC');
  const [ratingVisibility, setRatingVisibility] = useState(dbUser?.ratingVisibility || 'PUBLIC');
  const [activityVisibility, setActivityVisibility] = useState(dbUser?.activityVisibility || 'PUBLIC');
  const [listVisibility, setListVisibility] = useState(dbUser?.listVisibility || 'PUBLIC');
  const [statisticsVisibility, setStatisticsVisibility] = useState(dbUser?.statisticsVisibility || 'PUBLIC');

  // Telegram & Notifications state
  const [telegramChatId, setTelegramChatId] = useState(dbUser?.telegramChatId || '');
  const [notificationsList, setNotificationsList] = useState<any[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestSuccess, setTelegramTestSuccess] = useState<string | null>(null);
  const [linkCodeInfo, setLinkCodeInfo] = useState<{ code: string; botUsername: string } | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  // Status state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (dbUser) {
      setUsername(dbUser.username || '');
      setBio(dbUser.bio || '');
      setAvatar(dbUser.avatar || '');
      setProfileVisibility(dbUser.profileVisibility || 'PUBLIC');
      setLibraryVisibility(dbUser.libraryVisibility || 'PUBLIC');
      setRatingVisibility(dbUser.ratingVisibility || 'PUBLIC');
      setActivityVisibility(dbUser.activityVisibility || 'PUBLIC');
      setListVisibility(dbUser.listVisibility || 'PUBLIC');
      setStatisticsVisibility(dbUser.statisticsVisibility || 'PUBLIC');
      setTelegramChatId(dbUser.telegramChatId || '');
    }
  }, [dbUser]);

  const fetchNotifications = async () => {
    if (!dbUser) return;
    setNotificationsLoading(true);
    try {
      const res = await authFetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotificationsList(data);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'notifications') {
      fetchNotifications();
    }
  }, [activeTab]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbUser) return;

    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const res = await authFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          bio: bio.trim(),
          avatar: avatar.trim() || null,
          profileVisibility,
          libraryVisibility,
          ratingVisibility,
          activityVisibility,
          listVisibility,
          statisticsVisibility,
          telegramChatId: telegramChatId.trim() || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Не удалось сохранить настройки');
      }

      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegramNotification = async () => {
    if (!telegramChatId.trim()) {
      setErrorMessage('Сначала укажите Telegram Chat ID и сохраните настройки');
      return;
    }
    setTestingTelegram(true);
    setTelegramTestSuccess(null);
    setErrorMessage(null);

    try {
      const res = await authFetch('/api/notifications/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: telegramChatId.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось отправить тестовое сообщение');
      }

      setTelegramTestSuccess('Тестовое уведомление успешно отправлено в Telegram!');
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleGenerateLinkCode = async () => {
    setGeneratingCode(true);
    setErrorMessage(null);
    setTelegramTestSuccess(null);
    try {
      const res = await authFetch('/api/auth/telegram/link-code', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось сгенерировать код привязки');
      }
      setLinkCodeInfo({ code: data.code, botUsername: data.botUsername });
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      const res = await authFetch('/api/notifications/read-all', { method: 'PUT' });
      if (res.ok) {
        setNotificationsList((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleDeleteNotification = async (id: number) => {
    try {
      const res = await authFetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotificationsList((prev) => prev.filter((n) => n.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const avatarPresets = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
  ];

  if (!dbUser) {
    return (
      <div className="py-24 text-center space-y-4">
        <h2 className="text-xl font-bold text-[#F3F1F8]">Требуется авторизация</h2>
        <p className="text-xs text-[#9A94AA]">Войдите в аккаунт, чтобы управлять настройками.</p>
        <button
          onClick={() => login()}
          className="px-5 py-2.5 rounded-xl bg-[#9B6BFF] text-white text-xs font-semibold"
        >
          Войти через Google
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#F3F1F8] font-mono tracking-tight">
            НАСТРОЙКИ АККАУНТА
          </h1>
          <p className="text-xs text-[#9A94AA] mt-0.5">
            Управляйте публичным профилем, конфиденциальностью и уведомлениями
          </p>
        </div>

        {onNavigateProfile && (
          <button
            onClick={onNavigateProfile}
            className="text-xs px-3.5 py-2 rounded-xl bg-[#14131A] hover:bg-[#191724] border border-[#252233] text-[#AC82FF] font-semibold transition-colors"
          >
            Открыть мой профиль
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#252233] pb-2">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'profile'
              ? 'bg-[#9B6BFF] text-white shadow-md'
              : 'text-[#9A94AA] hover:text-[#F3F1F8] bg-[#14131A] border border-[#252233]'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          Профиль
        </button>

        <button
          onClick={() => setActiveTab('privacy')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'privacy'
              ? 'bg-[#9B6BFF] text-white shadow-md'
              : 'text-[#9A94AA] hover:text-[#F3F1F8] bg-[#14131A] border border-[#252233]'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Приватность
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'notifications'
              ? 'bg-[#9B6BFF] text-white shadow-md'
              : 'text-[#9A94AA] hover:text-[#F3F1F8] bg-[#14131A] border border-[#252233]'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          Уведомления & Telegram
        </button>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/50 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-200 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>Настройки успешно сохранены и применены!</span>
        </div>
      )}

      {/* TAB 1: PROFILE */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#14131A] border border-[#252233] space-y-5">
            <h3 className="text-sm font-bold text-[#F3F1F8] uppercase tracking-wider font-mono">
              Основные данные
            </h3>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#D5D0E3]">Имя пользователя (Никнейм)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs text-[#9A94AA] font-mono">@</span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-8 pr-4 py-2 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs font-mono text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                />
              </div>
              <p className="text-[11px] text-[#9A94AA]">
                Ваш уникальный идентификатор в системе. Используется для поиска и ссылок на профиль.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#D5D0E3]">Аватарка</label>
              <div className="flex items-center gap-4">
                {avatar ? (
                  <img
                    src={avatar}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-2xl object-cover border border-[#3A344E]"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-purple-900/60 border border-purple-500/40 flex items-center justify-center text-lg font-bold text-purple-200">
                    {username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <input
                    type="url"
                    placeholder="https://example.com/avatar.jpg"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#656075] focus:outline-none focus:border-[#9B6BFF]"
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#9A94AA]">Пресеты:</span>
                    {avatarPresets.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAvatar(preset)}
                        className="w-6 h-6 rounded-lg overflow-hidden border border-[#2E2A40] hover:scale-110 transition-transform"
                      >
                        <img src={preset} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#D5D0E3]">О себе (Био)</label>
              <textarea
                rows={3}
                placeholder="Расскажите о ваших любимых франшизах, играх или режиссерах..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#656075] focus:outline-none focus:border-[#9B6BFF] resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold shadow-lg shadow-purple-950/40 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Сохранить изменения
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: PRIVACY */}
      {activeTab === 'privacy' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#14131A] border border-[#252233] space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-[#252233]">
              <Shield className="w-4 h-4 text-[#9B6BFF]" />
              <h3 className="text-sm font-bold text-[#F3F1F8] uppercase tracking-wider font-mono">
                Матрица конфиденциальности (Backend-enforced)
              </h3>
            </div>

            <p className="text-xs text-[#9A94AA] leading-relaxed">
              Все ограничения приватности проверяются и принудительно исполняются на стороне сервера. Данные не отдаются в API посторонним пользователям, если доступ ограничен.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Profile Visibility */}
              <div className="p-4 rounded-xl bg-[#191724] border border-[#2E2A40] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#F3F1F8]">Видимость профиля</label>
                  <Lock className="w-3.5 h-3.5 text-[#AC82FF]" />
                </div>
                <p className="text-[11px] text-[#9A94AA]">
                  Кто может открывать страницу вашего профиля.
                </p>
                <select
                  value={profileVisibility}
                  onChange={(e) => setProfileVisibility(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                >
                  <option value="PUBLIC">Публичный (виден всем)</option>
                  <option value="FRIENDS">Только для друзей</option>
                  <option value="PRIVATE">Приватный (только для меня)</option>
                </select>
              </div>

              {/* Library Visibility */}
              <div className="p-4 rounded-xl bg-[#191724] border border-[#2E2A40] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#F3F1F8]">Видимость библиотеки</label>
                  <Lock className="w-3.5 h-3.5 text-[#AC82FF]" />
                </div>
                <p className="text-[11px] text-[#9A94AA]">
                  Кто может просматривать добавленные фильмы, игры, аниме и книги.
                </p>
                <select
                  value={libraryVisibility}
                  onChange={(e) => setLibraryVisibility(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                >
                  <option value="PUBLIC">Публичная (видна всем)</option>
                  <option value="FRIENDS">Только для друзей</option>
                  <option value="PRIVATE">Приватная (только для меня)</option>
                </select>
              </div>

              {/* Rating & Reviews Visibility */}
              <div className="p-4 rounded-xl bg-[#191724] border border-[#2E2A40] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#F3F1F8]">Оценки и рецензии</label>
                  <Lock className="w-3.5 h-3.5 text-[#AC82FF]" />
                </div>
                <p className="text-[11px] text-[#9A94AA]">
                  Кто видит ваши персональные баллы (1-10) и написанные отзывы.
                </p>
                <select
                  value={ratingVisibility}
                  onChange={(e) => setRatingVisibility(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                >
                  <option value="PUBLIC">Публичные (видны всем)</option>
                  <option value="FRIENDS">Только для друзей</option>
                  <option value="PRIVATE">Приватные (только для меня)</option>
                </select>
              </div>

              {/* Activities Visibility */}
              <div className="p-4 rounded-xl bg-[#191724] border border-[#2E2A40] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#F3F1F8]">Активность в ленте</label>
                  <Lock className="w-3.5 h-3.5 text-[#AC82FF]" />
                </div>
                <p className="text-[11px] text-[#9A94AA]">
                  Будут ли ваши действия (добавления, прогресс) отображаться в общей ленте.
                </p>
                <select
                  value={activityVisibility}
                  onChange={(e) => setActivityVisibility(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                >
                  <option value="PUBLIC">Публичная (видят все)</option>
                  <option value="FRIENDS">Только для друзей</option>
                  <option value="PRIVATE">Приватная (не выводить в ленту)</option>
                </select>
              </div>

              {/* Lists Visibility */}
              <div className="p-4 rounded-xl bg-[#191724] border border-[#2E2A40] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#F3F1F8]">Списки и Тир-листы</label>
                  <Lock className="w-3.5 h-3.5 text-[#AC82FF]" />
                </div>
                <p className="text-[11px] text-[#9A94AA]">
                  Видимость ваших кастомных коллекций и тир-листов.
                </p>
                <select
                  value={listVisibility}
                  onChange={(e) => setListVisibility(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                >
                  <option value="PUBLIC">Публичные (видны всем)</option>
                  <option value="FRIENDS">Только для друзей</option>
                  <option value="PRIVATE">Приватные</option>
                </select>
              </div>

              {/* Statistics Visibility */}
              <div className="p-4 rounded-xl bg-[#191724] border border-[#2E2A40] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#F3F1F8]">Статистика профиля</label>
                  <Lock className="w-3.5 h-3.5 text-[#AC82FF]" />
                </div>
                <p className="text-[11px] text-[#9A94AA]">
                  Показывать ли распределение категорий и часы другим пользователям.
                </p>
                <select
                  value={statisticsVisibility}
                  onChange={(e) => setStatisticsVisibility(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#14131A] border border-[#2E2A40] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                >
                  <option value="PUBLIC">Публичная (видна всем)</option>
                  <option value="FRIENDS">Только для друзей</option>
                  <option value="PRIVATE">Приватная</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold shadow-lg shadow-purple-950/40 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Применить настройки приватности
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: NOTIFICATIONS & TELEGRAM */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          {/* Telegram Integration Card */}
          <div className="p-6 rounded-2xl bg-[#14131A] border border-[#252233] space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-[#252233]">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-[#F3F1F8] uppercase tracking-wider font-mono">
                  Telegram-уведомления
                </h3>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-300 font-mono">
                TELEGRAM BOT
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-sky-950/20 border border-sky-800/30 text-xs text-sky-200/90 space-y-2">
              <p className="font-semibold flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Способы подключения Telegram-бота:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-lg bg-[#191724]/80 border border-[#2E2A40] space-y-1.5">
                  <div className="font-semibold text-sky-300 text-[11px]">Способ 1: Быстрый код</div>
                  <p className="text-[11px] text-[#A29DB5]">
                    Сгенерируйте код и отправьте его боту командой <span className="font-mono text-sky-300">/link КОД</span>
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateLinkCode}
                    disabled={generatingCode}
                    className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/30 hover:bg-sky-600/50 text-sky-200 text-xs font-semibold border border-sky-500/40 transition-colors disabled:opacity-50"
                  >
                    {generatingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Получить код привязки
                  </button>
                </div>
                <div className="p-3 rounded-lg bg-[#191724]/80 border border-[#2E2A40] space-y-1.5">
                  <div className="font-semibold text-sky-300 text-[11px]">Способ 2: Вручную через Chat ID</div>
                  <p className="text-[11px] text-[#A29DB5]">
                    Отправьте <span className="font-mono text-sky-300">/start</span> боту, скопируйте свой Chat ID и вставьте в поле ниже.
                  </p>
                </div>
              </div>

              {linkCodeInfo && (
                <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-800/40 text-xs space-y-1 mt-2">
                  <div className="text-zinc-300">
                    Ваш одноразовый код привязки: <span className="font-mono font-bold text-lg text-purple-300 px-2 py-0.5 bg-black/40 rounded">{linkCodeInfo.code}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Отправьте команду <span className="font-mono text-purple-300">/link {linkCodeInfo.code}</span> боту{' '}
                    <a
                      href={`https://t.me/${linkCodeInfo.botUsername}?start=${linkCodeInfo.code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-sky-300 hover:text-sky-200"
                    >
                      @{linkCodeInfo.botUsername}
                    </a>
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#D5D0E3]">Ваш Telegram Chat ID</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Например: 123456789"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs font-mono text-[#F3F1F8] placeholder-[#656075] focus:outline-none focus:border-[#9B6BFF]"
                />
                <button
                  type="button"
                  onClick={handleTestTelegramNotification}
                  disabled={testingTelegram}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#191724] hover:bg-[#1E1B2B] border border-[#2E2A40] text-xs font-medium text-sky-300 transition-colors disabled:opacity-50"
                >
                  {testingTelegram ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Тест
                </button>
              </div>
            </div>

            {telegramTestSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-200 text-xs flex items-center gap-2">
                <Check className="w-3.5 h-3.5" />
                <span>{telegramTestSuccess}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Сохранить Chat ID
              </button>
            </div>
          </div>

          {/* In-App Notifications Center Card */}
          <div className="p-6 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#252233]">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#9B6BFF]" />
                <h3 className="text-sm font-bold text-[#F3F1F8] uppercase tracking-wider font-mono">
                  Центр уведомлений ({notificationsList.length})
                </h3>
              </div>

              {notificationsList.length > 0 && (
                <button
                  onClick={handleMarkAllNotificationsRead}
                  className="flex items-center gap-1.5 text-xs text-[#AC82FF] hover:text-white transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Отметить все прочитанными
                </button>
              )}
            </div>

            {notificationsLoading ? (
              <div className="py-8 flex items-center justify-center text-[#9A94AA]">
                <Loader2 className="w-5 h-5 animate-spin text-[#9B6BFF]" />
              </div>
            ) : notificationsList.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#9A94AA]">
                Нет новых уведомлений. Все спокойно!
              </div>
            ) : (
              <div className="space-y-2.5">
                {notificationsList.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3.5 rounded-xl border transition-colors flex items-start justify-between gap-3 ${
                      notif.isRead
                        ? 'bg-[#191724]/40 border-[#252233] text-[#9A94AA]'
                        : 'bg-[#191724] border-[#3A344E] text-[#F3F1F8]'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#F3F1F8]">{notif.title}</span>
                        {!notif.isRead && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#9B6BFF]" />
                        )}
                      </div>
                      <p className="text-xs text-[#D5D0E3] leading-relaxed">{notif.content}</p>
                      <p className="text-[10px] text-[#9A94AA]">
                        {new Date(notif.createdAt).toLocaleString('ru-RU')}
                      </p>
                    </div>

                    <button
                      onClick={() => handleDeleteNotification(notif.id)}
                      className="p-1.5 text-[#9A94AA] hover:text-red-400 transition-colors rounded-lg"
                      title="Удалить уведомление"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
