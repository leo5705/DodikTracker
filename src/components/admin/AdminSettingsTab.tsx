import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Save,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  UserPlus,
  Sliders,
  MessageSquare,
  Globe,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export const AdminSettingsTab: React.FC = () => {
  const { authFetch } = useAuth();
  const [settings, setSettings] = useState<{ [key: string]: any }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/settings');
      if (!res.ok) throw new Error('Ошибка загрузки настроек');
      const data = await res.json();
      setSettings(data || {});
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить настройки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleToggle = (key: string) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleChange = (key: string, val: any) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authFetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения настроек');

      setSuccess('Настройки системы успешно сохранены и применены!');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <RotateCw className="w-8 h-8 text-[#9B6BFF] animate-spin" />
        <span className="text-xs text-[#9A94AA]">Загрузка параметров конфигурации...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-[#14131A] border border-[#252233]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-[#AC82FF] flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#F3F1F8]">Конфигурация системы Dodik Tracker</h3>
            <p className="text-xs text-[#9A94AA]">
              Глобальные политики безопасности, регистрации и режимы работы сервиса
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-colors flex items-center gap-2"
        >
          {saving ? <RotateCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Сохранить изменения
        </button>
      </div>

      {success && (
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Registration & Auth Policies */}
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4">
          <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-indigo-400" />
            Регистрация и Доступ
          </h4>

          <div className="space-y-3">
            <h5 className="text-[11px] font-bold text-[#9A94AA] mb-2 uppercase tracking-wider">Режим доступа к сайту</h5>
            
            <label className="flex items-start gap-3 p-3 rounded-xl bg-[#0F0E12] border border-[#252233]/70 cursor-pointer hover:border-[#3A344E] transition-colors">
              <input
                type="radio"
                name="site_access_mode"
                value="OPEN"
                checked={settings.site_access_mode === 'OPEN' || !settings.site_access_mode}
                onChange={(e) => handleChange('site_access_mode', e.target.value)}
                className="mt-0.5"
              />
              <div>
                <span className="text-xs font-bold text-[#F3F1F8] block">Открытая регистрация</span>
                <span className="text-[10px] text-[#9A94AA]">Любой посетитель может зарегистрироваться и войти.</span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-[#0F0E12] border border-[#252233]/70 cursor-pointer hover:border-[#3A344E] transition-colors">
              <input
                type="radio"
                name="site_access_mode"
                value="INVITE_ONLY"
                checked={settings.site_access_mode === 'INVITE_ONLY'}
                onChange={(e) => handleChange('site_access_mode', e.target.value)}
                className="mt-0.5"
              />
              <div>
                <span className="text-xs font-bold text-[#F3F1F8] block">Только по инвайтам</span>
                <span className="text-[10px] text-[#9A94AA]">Самостоятельная регистрация запрещена. Нужен действующий инвайт-код.</span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-[#0F0E12] border border-[#252233]/70 cursor-pointer hover:border-[#3A344E] transition-colors">
              <input
                type="radio"
                name="site_access_mode"
                value="CLOSED"
                checked={settings.site_access_mode === 'CLOSED'}
                onChange={(e) => handleChange('site_access_mode', e.target.value)}
                className="mt-0.5"
              />
              <div>
                <span className="text-xs font-bold text-[#F3F1F8] block">Регистрация закрыта</span>
                <span className="text-[10px] text-[#9A94AA]">Новые пользователи не могут регистрироваться. Существующие могут входить.</span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-[#0F0E12] border border-[#252233]/70 cursor-pointer hover:border-red-500/50 transition-colors">
              <input
                type="radio"
                name="site_access_mode"
                value="MAINTENANCE"
                checked={settings.site_access_mode === 'MAINTENANCE'}
                onChange={(e) => handleChange('site_access_mode', e.target.value)}
                className="mt-0.5"
              />
              <div>
                <span className="text-xs font-bold text-rose-400 block">Технические работы</span>
                <span className="text-[10px] text-[#9A94AA]">Сайт закрыт для всех обычных пользователей. Вход только для администраторов.</span>
              </div>
            </label>
            
            {settings.site_access_mode === 'MAINTENANCE' && (
              <div className="mt-2">
                <label className="text-[10px] text-[#9A94AA] block mb-1">Сообщение о тех. работах:</label>
                <input
                  type="text"
                  value={settings.maintenance_message || ''}
                  onChange={(e) => handleChange('maintenance_message', e.target.value)}
                  className="w-full p-2 bg-[#0F0E12] border border-[#252233] rounded-lg text-xs text-[#F3F1F8] outline-none"
                  placeholder="Сервис находится на техническом обслуживании"
                />
              </div>
            )}
          </div>
        </div>

        {/* 2. Community & Moderation Policies */}
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4">
          <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            Сообщество и Модерация
          </h4>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#0F0E12] border border-[#252233]/70">
              <div>
                <span className="text-xs font-bold text-[#F3F1F8] block">Гостевой доступ к отзывам</span>
                <span className="text-[11px] text-[#9A94AA]">
                  Разрешить просмотр отзывов без авторизации
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.allowGuestReviews ?? true}
                onChange={() => handleToggle('allowGuestReviews')}
                className="w-4 h-4 rounded"
              />
            </div>

            <div>
              <label className="text-xs text-[#9A94AA] block mb-1">
                Лимит комментариев в минуту (анти-спам):
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={settings.maxCommentsPerMinute ?? 5}
                onChange={(e) => handleChange('maxCommentsPerMinute', parseInt(e.target.value, 10))}
                className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-[#9A94AA] block mb-1">
                Максимальный размер аватара (МБ):
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={settings.maxAvatarSizeMb ?? 5}
                onChange={(e) => handleChange('maxAvatarSizeMb', parseInt(e.target.value, 10))}
                className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
              />
            </div>
          </div>
        </div>

        {/* 3. Branding & Site Info */}
        <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4 md:col-span-2">
          <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-4 h-4 text-purple-400" />
            Брендинг и информация
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#9A94AA] block mb-1">Название платформы:</label>
              <input
                type="text"
                value={settings.siteName ?? 'Dodik Tracker'}
                onChange={(e) => handleChange('siteName', e.target.value)}
                className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-[#9A94AA] block mb-1">Слоган платформы:</label>
              <input
                type="text"
                value={settings.siteMotto ?? 'Трекер фильмов, аниме, сериалов и игр'}
                onChange={(e) => handleChange('siteMotto', e.target.value)}
                className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
