import React, { useState, useEffect } from 'react';
import { User, Shield, Bell, Send, Check, Loader2, Sparkles, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface SettingsViewProps {
  onNavigateProfile: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigateProfile }) => {
  const { dbUser, authFetch, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'privacy' | 'notifications'>('profile');

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
  const [telegramChatId, setTelegramChatId] = useState('');
  const [notificationSettings, setNotificationSettings] = useState<Record<string, boolean>>({ friendRequests: true, friendReviews: true, likes: true, comments: true, newReleases: true, lists: true });
  
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
      if (dbUser.notificationSettings) {
        setNotificationSettings(dbUser.notificationSettings);
      }
    }
  }, [dbUser]);

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

  const handleGenerateLinkCode = async () => {
    setGeneratingCode(true);
    setErrorMessage(null);
    try {
      const res = await authFetch('/api/auth/telegram/request-code', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось получить код привязки');
      }
      setLinkCodeInfo({ code: data.code, botUsername: data.botUsername });
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка');
    } finally {
      setGeneratingCode(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Профиль', icon: User },
    { id: 'privacy', label: 'Приватность', icon: Shield },
    { id: 'notifications', label: 'Уведомления', icon: Bell },
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
          {/* Notification Settings Card */}
          <div className="p-6 rounded-2xl bg-[#14131A] border border-[#252233] space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b border-[#252233]">
              <Bell className="w-4 h-4 text-[#9B6BFF]" />
              <h3 className="text-sm font-bold text-[#F3F1F8] uppercase tracking-wider font-mono">
                Настройки уведомлений
              </h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { id: 'friendRequests', label: 'Новые заявки в друзья' },
                { id: 'friendReviews', label: 'Отзывы друзей' },
                { id: 'likes', label: 'Лайки к вашим записям' },
                { id: 'comments', label: 'Комментарии и ответы' },
                { id: 'newReleases', label: 'Новые релизы' },
                { id: 'lists', label: 'Изменения в списках' },
              ].map((setting) => (
                <label key={setting.id} className="flex items-center justify-between p-3 rounded-xl bg-[#191724]/60 border border-[#252233] cursor-pointer hover:border-[#3A344E] transition-colors">
                  <span className="text-xs text-[#F3F1F8] font-medium">{setting.label}</span>
                  <div className="relative inline-flex items-center h-5 rounded-full w-9">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={notificationSettings[setting.id] ?? true}
                      onChange={(e) => setNotificationSettings({ ...notificationSettings, [setting.id]: e.target.checked })}
                    />
                    <div className="w-9 h-5 bg-[#252233] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#9B6BFF]"></div>
                  </div>
                </label>
              ))}
            </div>
            
            <div className="pt-4">
              <button
                onClick={() => handleSaveSettings()}
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-[#F3F1F8] hover:bg-white text-[#0F0E12] font-bold text-sm shadow-[0_0_20px_rgba(243,241,248,0.15)] transition-all disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : 'Применить настройки'}
              </button>
            </div>
          </div>

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
                onClick={() => handleSaveSettings()}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Сохранить Chat ID
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
