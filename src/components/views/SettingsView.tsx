import React, { useState, useEffect } from 'react';
import {
  User,
  Shield,
  Bell,
  Send,
  Check,
  Loader2,
  Sparkles,
  Info,
  Volume2,
  VolumeX,
  Smartphone,
  Monitor,
  Radio,
  Sliders,
  Ticket,
  Copy,
  ExternalLink,
  AlertCircle,
  Unlink,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { UserInvitesSection } from '../invites/UserInvitesSection.tsx';
import {
  NOTIFICATION_TYPE_DEFINITIONS,
  NotificationPreferences,
  getDefaultNotificationPreferences,
  normalizeNotificationPreferences,
} from '../../types/notification.ts';

interface SettingsViewProps {
  onNavigateProfile: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigateProfile }) => {
  const { dbUser, authFetch, logout, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'privacy' | 'notifications' | 'invites'>('profile');

  // Profile Form state
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');

  // Privacy Form state
  const [profileVisibility, setProfileVisibility] = useState('PUBLIC');
  const [libraryVisibility, setLibraryVisibility] = useState('PUBLIC');
  const [ratingVisibility, setRatingVisibility] = useState('PUBLIC');
  const [activityVisibility, setActivityVisibility] = useState('PUBLIC');
  const [listVisibility, setListVisibility] = useState('PUBLIC');
  const [statisticsVisibility, setStatisticsVisibility] = useState('PUBLIC');

  // Telegram & Notifications state
  const { soundEnabled, setSoundEnabled, triggerTestToast } = useNotifications();
  const [telegramChatId, setTelegramChatId] = useState('');
  const [notificationSettings, setNotificationSettings] = useState<Record<string, boolean>>({ friendRequests: true, friendReviews: true, likes: true, comments: true, newReleases: true, lists: true });
  const [notifPreferences, setNotifPreferences] = useState<NotificationPreferences>(getDefaultNotificationPreferences);
  const [globalChannels, setGlobalChannels] = useState<{ inApp: boolean; toast: boolean; telegram: boolean }>({
    inApp: true,
    toast: true,
    telegram: true,
  });
  const [notifCategoryFilter, setNotifCategoryFilter] = useState<'all' | 'social' | 'content' | 'achievements' | 'system'>('all');
  
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestSuccess, setTelegramTestSuccess] = useState<string | null>(null);
  const [linkCodeInfo, setLinkCodeInfo] = useState<{ code: string; botUsername: string; botUrl?: string } | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [verifyingLink, setVerifyingLink] = useState(false);
  const [unlinkingTelegram, setUnlinkingTelegram] = useState(false);
  const [telegramLinkError, setTelegramLinkError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

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
      if (dbUser.notificationSettings) {
        setNotificationSettings(dbUser.notificationSettings);
      }
      // Load unified notification preferences
      authFetch('/api/notifications/settings')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            const rawPrefs = data.preferences || data.settings;
            if (rawPrefs) setNotifPreferences(normalizeNotificationPreferences(rawPrefs));
            if (data.channels) setGlobalChannels(data.channels);
          }
        })
        .catch(() => {});
    }
  }, [dbUser]);

  const handleSaveNotificationPreferences = async () => {
    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);
    try {
      const res = await authFetch('/api/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: notifPreferences,
          settings: notifPreferences,
          channels: globalChannels,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Не удалось сохранить настройки уведомлений');
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка при сохранении настроек');
    } finally {
      setSaving(false);
    }
  };

  const toggleTypeChannel = (type: string, channel: 'inApp' | 'toast' | 'telegram') => {
    setNotifPreferences((prev) => {
      const current = prev[type] || { inApp: true, toast: true, telegram: true };
      return {
        ...prev,
        [type]: {
          ...current,
          [channel]: !current[channel],
        },
      };
    });
  };

  const toggleGlobalChannel = (channel: 'inApp' | 'toast' | 'telegram') => {
    setGlobalChannels((prev) => ({
      ...prev,
      [channel]: !prev[channel],
    }));
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
          notificationSettings: JSON.stringify(notificationSettings)
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Не удалось сохранить настройки');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Произошла ошибка при сохранении');
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
      setTelegramTestSuccess('Тестовое сообщение успешно отправлено!');
      setTimeout(() => setTelegramTestSuccess(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка');
    } finally {
      setTestingTelegram(false);
    }
  };

  // Auto-poll status when linkCodeInfo is active
  useEffect(() => {
    if (!linkCodeInfo?.code) return;
    let cancelled = false;

    const intervalId = setInterval(async () => {
      try {
        const res = await authFetch(`/api/auth/telegram/link-status?code=${linkCodeInfo.code}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.status === 409 || data.status === 'ALREADY_LINKED') {
          clearInterval(intervalId);
          setLinkCodeInfo(null);
          setTelegramLinkError(data.error || 'Этот Telegram уже привязан к другому аккаунту.');
          return;
        }

        if (data.status === 'LINKED') {
          clearInterval(intervalId);
          setLinkCodeInfo(null);
          setTelegramLinkError(null);
          setTelegramTestSuccess('Telegram успешно привязан!');
          await refreshProfile();
          setTimeout(() => setTelegramTestSuccess(null), 5000);
          return;
        }

        if (data.status === 'EXPIRED') {
          clearInterval(intervalId);
          setLinkCodeInfo(null);
          setTelegramLinkError('Срок действия кода истек. Запросите новый код.');
          return;
        }
      } catch (_err) {
        // silent polling error
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [linkCodeInfo?.code]);

  const handleGenerateLinkCode = async () => {
    setGeneratingCode(true);
    setTelegramLinkError(null);
    setErrorMessage(null);
    try {
      const res = await authFetch('/api/auth/telegram/link-code', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось получить код привязки');
      }
      setLinkCodeInfo({
        code: data.code,
        botUsername: data.botUsername,
        botUrl: data.botUrl || `https://t.me/${data.botUsername}?start=link_${data.code}`,
      });
    } catch (err: any) {
      setTelegramLinkError(err.message || 'Ошибка генерации кода');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleConfirmLink = async () => {
    if (!linkCodeInfo?.code) return;
    setVerifyingLink(true);
    setTelegramLinkError(null);
    try {
      const res = await authFetch('/api/auth/telegram/confirm-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: linkCodeInfo.code }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setLinkCodeInfo(null);
          setTelegramLinkError(data.error || 'Этот Telegram уже привязан к другому аккаунту.');
          return;
        }
        throw new Error(data.error || 'Привязка ещё не подтверждена в боте.');
      }
      setLinkCodeInfo(null);
      setTelegramLinkError(null);
      setTelegramTestSuccess('Telegram успешно привязан!');
      await refreshProfile();
      setTimeout(() => setTelegramTestSuccess(null), 5000);
    } catch (err: any) {
      setTelegramLinkError(err.message || 'Ошибка проверки привязки');
    } finally {
      setVerifyingLink(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!window.confirm('Вы действительно хотите отвязать Telegram от вашего аккаунта?')) {
      return;
    }
    setUnlinkingTelegram(true);
    setTelegramLinkError(null);
    try {
      const res = await authFetch('/api/auth/telegram/unlink', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось отвязать Telegram');
      }
      setTelegramTestSuccess('Telegram успешно отвязан от вашего аккаунта.');
      setTelegramChatId('');
      await refreshProfile();
      setTimeout(() => setTelegramTestSuccess(null), 5000);
    } catch (err: any) {
      setTelegramLinkError(err.message || 'Ошибка при отвязке');
    } finally {
      setUnlinkingTelegram(false);
    }
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const tabs = [
    { id: 'profile', label: 'Профиль', icon: User },
    { id: 'privacy', label: 'Приватность', icon: Shield },
    { id: 'notifications', label: 'Уведомления', icon: Bell },
    { id: 'invites', label: 'Мои приглашения', icon: Ticket },
  ];

  if (!dbUser) return null;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-[#F3F1F8] tracking-tight">Настройки</h1>
        <p className="text-[#9A94AA] text-sm">Управление профилем, приватностью и уведомлениями</p>
      </div>

      <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-2 border-b border-[#252233]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-[#191724] text-white border border-[#3A344E]'
                : 'text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#191724]/50 border border-transparent'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {saveSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-200 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4" />
          <span>Настройки успешно сохранены</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-900/40 text-red-200 text-sm">
          {errorMessage}
        </div>
      )}

      {activeTab === 'profile' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#14131A] border border-[#252233] space-y-5">
            <h3 className="text-sm font-bold text-[#F3F1F8] uppercase tracking-wider font-mono pb-2 border-b border-[#252233]">
              Основная информация
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#D5D0E3]">Имя пользователя</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-sm text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF] transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#D5D0E3]">Аватар (URL)</label>
                <input
                  type="text"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-sm text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF] transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#D5D0E3]">О себе</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-sm text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF] transition-colors resize-none"
                  placeholder="Расскажите немного о себе..."
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-[#F3F1F8] hover:bg-white text-[#0F0E12] font-bold text-sm shadow-[0_0_20px_rgba(243,241,248,0.15)] transition-all disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </div>
        </form>
      )}

      {activeTab === 'privacy' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#14131A] border border-[#252233] space-y-5">
            <h3 className="text-sm font-bold text-[#F3F1F8] uppercase tracking-wider font-mono pb-2 border-b border-[#252233]">
              Настройки видимости
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                { id: 'profileVisibility', label: 'Профиль', value: profileVisibility, setter: setProfileVisibility },
                { id: 'libraryVisibility', label: 'Медиатека', value: libraryVisibility, setter: setLibraryVisibility },
                { id: 'activityVisibility', label: 'Активность', value: activityVisibility, setter: setActivityVisibility },
                { id: 'ratingVisibility', label: 'Оценки', value: ratingVisibility, setter: setRatingVisibility },
                { id: 'listVisibility', label: 'Списки', value: listVisibility, setter: setListVisibility },
                { id: 'statisticsVisibility', label: 'Статистика', value: statisticsVisibility, setter: setStatisticsVisibility },
              ].map((setting) => (
                <div key={setting.id} className="space-y-2">
                  <label className="text-xs font-semibold text-[#D5D0E3]">{setting.label}</label>
                  <select
                    value={setting.value}
                    onChange={(e) => setting.setter(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-sm text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF] transition-colors appearance-none cursor-pointer"
                  >
                    <option value="PUBLIC">Видно всем</option>
                    <option value="FRIENDS">Только друзьям</option>
                    <option value="PRIVATE">Только мне</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-[#F3F1F8] hover:bg-white text-[#0F0E12] font-bold text-sm shadow-[0_0_20px_rgba(243,241,248,0.15)] transition-all disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : 'Применить настройки'}
            </button>
          </div>
        </form>
      )}

      {activeTab === 'notifications' && (
        <div className="space-y-6">
          {/* 1. Global Master Channels Card */}
          <div className="p-6 rounded-2xl bg-[#14131A] border border-[#252233] space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#252233]">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#9B6BFF]" />
                <h3 className="text-sm font-bold text-[#F3F1F8] uppercase tracking-wider font-mono">
                  Глобальные каналы доставки
                </h3>
              </div>
              <span className="text-xs text-[#7A748E]">
                Включение или отключение каналов для всех уведомлений
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* In-App Channel */}
              <div
                onClick={() => toggleGlobalChannel('inApp')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  globalChannels.inApp
                    ? 'bg-[#191724] border-[#9B6BFF]/40 text-white shadow-md shadow-purple-950/20'
                    : 'bg-[#14131A] border-[#252233] text-[#656075]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${globalChannels.inApp ? 'bg-purple-500/20 text-[#AC82FF] border-purple-500/30' : 'bg-[#191724] text-[#656075] border-[#252233]'}`}>
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold">In-App (Сайт)</h4>
                    <p className="text-[11px] text-[#7A748E]">Колокольчик и списки</p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${globalChannels.inApp ? 'bg-[#9B6BFF] border-[#9B6BFF] text-white' : 'border-[#3A344E]'}`}>
                  {globalChannels.inApp && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              {/* Toast Channel */}
              <div
                onClick={() => toggleGlobalChannel('toast')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  globalChannels.toast
                    ? 'bg-[#191724] border-sky-500/40 text-white shadow-md shadow-sky-950/20'
                    : 'bg-[#14131A] border-[#252233] text-[#656075]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${globalChannels.toast ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' : 'bg-[#191724] text-[#656075] border-[#252233]'}`}>
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold">Toast (Всплывающие)</h4>
                    <p className="text-[11px] text-[#7A748E]">Окно в углу экрана</p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${globalChannels.toast ? 'bg-sky-500 border-sky-500 text-white' : 'border-[#3A344E]'}`}>
                  {globalChannels.toast && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              {/* Telegram Channel */}
              <div
                onClick={() => toggleGlobalChannel('telegram')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  globalChannels.telegram
                    ? 'bg-[#191724] border-emerald-500/40 text-white shadow-md shadow-emerald-950/20'
                    : 'bg-[#14131A] border-[#252233] text-[#656075]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${globalChannels.telegram ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-[#191724] text-[#656075] border-[#252233]'}`}>
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold">Telegram Бот</h4>
                    <p className="text-[11px] text-[#7A748E]">Мгновенно в мессенджер</p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${globalChannels.telegram ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-[#3A344E]'}`}>
                  {globalChannels.telegram && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>
            </div>

            {/* Quick sound & Live test options */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#252233]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                    soundEnabled
                      ? 'bg-[#191724] border-[#9B6BFF]/40 text-[#AC82FF]'
                      : 'bg-[#14131A] border-[#252233] text-[#7A748E]'
                  }`}
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  <span>{soundEnabled ? 'Звук уведомлений включен' : 'Звук отключен'}</span>
                </button>

                <button
                  type="button"
                  onClick={triggerTestToast}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#191724] hover:bg-[#252233] border border-[#2E2A40] text-xs font-semibold text-[#D5D0E3] hover:text-white transition-colors"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Проверить Toast</span>
                </button>
              </div>

              <span className="text-[11px] text-[#7A748E]">
                Для Telegram требуется привязка аккаунта ниже
              </span>
            </div>
          </div>

          {/* 2. Granular Notification Types Matrix */}
          <div className="p-6 rounded-2xl bg-[#14131A] border border-[#252233] space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#252233]">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#9B6BFF]" />
                <h3 className="text-sm font-bold text-[#F3F1F8] uppercase tracking-wider font-mono">
                  Типы уведомлений
                </h3>
              </div>

              {/* Category Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1">
                {[
                  { id: 'all', label: 'Все' },
                  { id: 'social', label: 'Социальные' },
                  { id: 'content', label: 'Контент и релизы' },
                  { id: 'achievements', label: 'Достижения' },
                  { id: 'system', label: 'Системные' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setNotifCategoryFilter(tab.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      notifCategoryFilter === tab.id
                        ? 'bg-[#9B6BFF] text-white'
                        : 'bg-[#191724] text-[#7A748E] hover:text-[#F3F1F8]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table / List Header */}
            <div className="hidden sm:grid sm:grid-cols-12 gap-3 text-[11px] font-mono font-semibold text-[#656075] uppercase px-3">
              <div className="sm:col-span-6">Событие / Описание</div>
              <div className="sm:col-span-2 text-center">In-App</div>
              <div className="sm:col-span-2 text-center">Toast</div>
              <div className="sm:col-span-2 text-center">Telegram</div>
            </div>

            {/* Rows */}
            <div className="space-y-2">
              {NOTIFICATION_TYPE_DEFINITIONS.filter(
                (def) => notifCategoryFilter === 'all' || def.category === notifCategoryFilter
              ).map((def) => {
                const prefs = notifPreferences[def.type] || def.defaultSettings;

                return (
                  <div
                    key={def.type}
                    className="p-3.5 rounded-xl bg-[#191724]/60 border border-[#252233] hover:border-[#3A344E] transition-colors flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:items-center"
                  >
                    <div className="sm:col-span-6 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#F3F1F8]">{def.label}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#252233] text-[#7A748E]">
                          {def.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#7A748E] leading-relaxed">
                        {def.description}
                      </p>
                    </div>

                    {/* In-App Toggle */}
                    <div className="sm:col-span-2 flex sm:justify-center items-center justify-between pt-1 sm:pt-0 border-t sm:border-t-0 border-[#252233]">
                      <span className="sm:hidden text-xs text-[#9A94AA]">In-App</span>
                      <button
                        type="button"
                        onClick={() => toggleTypeChannel(def.type, 'inApp')}
                        className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors ${
                          prefs.inApp ? 'bg-[#9B6BFF]' : 'bg-[#252233]'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            prefs.inApp ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Toast Toggle */}
                    <div className="sm:col-span-2 flex sm:justify-center items-center justify-between pt-1 sm:pt-0">
                      <span className="sm:hidden text-xs text-[#9A94AA]">Toast (Пуш)</span>
                      <button
                        type="button"
                        onClick={() => toggleTypeChannel(def.type, 'toast')}
                        className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors ${
                          prefs.toast ? 'bg-sky-500' : 'bg-[#252233]'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            prefs.toast ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Telegram Toggle */}
                    <div className="sm:col-span-2 flex sm:justify-center items-center justify-between pt-1 sm:pt-0">
                      <span className="sm:hidden text-xs text-[#9A94AA]">Telegram</span>
                      <button
                        type="button"
                        onClick={() => toggleTypeChannel(def.type, 'telegram')}
                        className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors ${
                          prefs.telegram ? 'bg-emerald-500' : 'bg-[#252233]'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            prefs.telegram ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="button"
                onClick={handleSaveNotificationPreferences}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#F3F1F8] hover:bg-white text-[#0F0E12] font-bold text-sm shadow-[0_0_20px_rgba(243,241,248,0.15)] transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{saving ? 'Сохранение...' : 'Сохранить настройки уведомлений'}</span>
              </button>
            </div>
          </div>

          {/* Telegram Integration Card */}
          <div className="p-6 rounded-2xl bg-[#14131A] border border-[#252233] space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#252233]">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-[#F3F1F8] uppercase tracking-wider font-mono">
                  Telegram-уведомления
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#9A94AA]">Telegram:</span>
                {dbUser?.telegramId || dbUser?.telegramChatId ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                    <Check className="w-3 h-3" />
                    [Привязан]
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-mono">
                    [Не привязан]
                  </span>
                )}
              </div>
            </div>

            {/* Error banner (e.g. ALREADY_LINKED) */}
            {telegramLinkError && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-rose-300">{telegramLinkError}</div>
                  <div className="text-[11px] text-rose-300/80">
                    Никаких молчаливых перепривязок. Если этот Telegram принадлежит вам, войдите под тем аккаунтом или отвяжите его в настройках.
                  </div>
                </div>
              </div>
            )}

            {/* Success banner */}
            {telegramTestSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-200 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-medium">{telegramTestSuccess}</span>
              </div>
            )}

            {/* Case 1: ALREADY LINKED */}
            {dbUser?.telegramId || dbUser?.telegramChatId ? (
              <div className="p-4 rounded-xl bg-[#191724] border border-[#2E2A40] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-[#A29DB5]">Привязанный профиль Telegram:</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-sky-300 font-mono">
                        {dbUser.telegramUsername ? `@${dbUser.telegramUsername}` : `ID: ${dbUser.telegramId || dbUser.telegramChatId}`}
                      </span>
                      {dbUser.telegramId && (
                        <span className="text-[10px] text-[#7A748E] font-mono">
                          (ID: {dbUser.telegramId})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTestTelegramNotification}
                      disabled={testingTelegram}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#252233] hover:bg-[#2E2A40] text-sky-300 text-xs font-semibold border border-sky-500/20 transition-colors disabled:opacity-50"
                    >
                      {testingTelegram ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Тест</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleUnlinkTelegram}
                      disabled={unlinkingTelegram}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 text-xs font-semibold border border-rose-800/40 transition-colors disabled:opacity-50"
                    >
                      {unlinkingTelegram ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Unlink className="w-3.5 h-3.5" />
                      )}
                      <span>Отвязать</span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-[#7A748E]">
                  Ваш Telegram успешно подключен. Вы будете получать важные уведомления и сможете легко восстанавливать доступ.
                </p>
              </div>
            ) : (
              /* Case 2: NOT LINKED */
              <div className="space-y-4">
                {!linkCodeInfo ? (
                  <div className="p-4 rounded-xl bg-[#191724] border border-[#2E2A40] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-[#F3F1F8]">
                        Привязка Telegram к вашему аккаунту
                      </div>
                      <p className="text-xs text-[#A29DB5] max-w-md">
                        Подключите Telegram, чтобы получать мгновенные уведомления о релизах, комментариях и активности друзей.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateLinkCode}
                      disabled={generatingCode}
                      className="shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-950/40 transition-colors disabled:opacity-50"
                    >
                      {generatingCode ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      <span>Привязать Telegram</span>
                    </button>
                  </div>
                ) : (
                  /* Active Link Code Flow */
                  <div className="p-5 rounded-2xl bg-purple-950/20 border border-purple-800/40 space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-purple-800/30">
                      <div className="text-xs font-bold text-purple-200 uppercase tracking-wide flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        Одноразовый код привязки
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setLinkCodeInfo(null);
                          setTelegramLinkError(null);
                        }}
                        className="text-[11px] text-zinc-400 hover:text-white transition-colors"
                      >
                        Отмена
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-black/40 border border-purple-900/40">
                      <div>
                        <div className="text-[11px] text-zinc-400">Ваш код:</div>
                        <div className="text-3xl font-black font-mono tracking-widest text-purple-300">
                          {linkCodeInfo.code}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => handleCopyCode(`/link ${linkCodeInfo.code}`)}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 border border-zinc-700 transition-colors"
                        >
                          {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>/link {linkCodeInfo.code}</span>
                        </button>

                        <a
                          href={linkCodeInfo.botUrl || `https://t.me/${linkCodeInfo.botUsername}?start=link_${linkCodeInfo.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow transition-colors"
                        >
                          <span>Открыть бота</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    <div className="text-xs text-zinc-300 space-y-1.5">
                      <div className="font-semibold text-zinc-200">Инструкция:</div>
                      <div className="text-[11px] text-zinc-400 space-y-1">
                        <div>1. Откройте бота <a href={`https://t.me/${linkCodeInfo.botUsername}`} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline font-mono">@{linkCodeInfo.botUsername}</a> в Telegram.</div>
                        <div>2. Отправьте команду <span className="text-purple-300 font-mono font-bold">/link {linkCodeInfo.code}</span> (или нажмите «Начать / Start» по ссылке выше).</div>
                        <div>3. Привязка подтвердится автоматически или нажмите кнопку ниже.</div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2 text-xs text-purple-300">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Ожидаем подтверждения в Telegram-боте...</span>
                      </div>

                      <button
                        type="button"
                        onClick={handleConfirmLink}
                        disabled={verifyingLink}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {verifyingLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        <span>Проверить привязку</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'invites' && <UserInvitesSection />}
    </div>
  );
};
