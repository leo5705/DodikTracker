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
    setSettings((prev) => {
      const next = { ...prev, [key]: val };
      if (key === 'site_access_mode') next.siteAccessMode = val;
      if (key === 'siteAccessMode') next.site_access_mode = val;
      if (key === 'site_name') next.siteName = val;
      if (key === 'siteName') next.site_name = val;
      if (key === 'site_motto') next.siteMotto = val;
      if (key === 'siteMotto') next.site_motto = val;
      if (key === 'allow_guest_reviews') next.allowGuestReviews = val;
      if (key === 'allowGuestReviews') next.allow_guest_reviews = val;
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения настроек');

      if (data.settings) {
        setSettings(data.settings);
      }
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
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <RotateCw className="w-8 h-8 text-[#8B5CF6] animate-spin" />
        <span className="text-sm text-[#94A3B8]">Загрузка параметров конфигурации...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 w-full animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-purple-500/15 text-[#A78BFA] flex items-center justify-center">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#F8FAFC]">Конфигурация системы Dodik Tracker</h3>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              Глобальные политики безопасности, регистрации и режимы работы сервиса
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="h-11 px-6 rounded-2xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-950/40"
        >
          {saving ? <RotateCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Сохранить изменения
        </button>
      </div>

      {success && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm flex items-center gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Registration & Auth Policies */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-lg">
          <h4 className="text-sm font-bold text-[#F8FAFC] uppercase tracking-wider flex items-center gap-2">
            <UserPlus className="w-4.5 h-4.5 text-indigo-400" />
            Регистрация и Доступ
          </h4>

          <div className="space-y-3">
            <h5 className="text-xs font-bold text-[#94A3B8] mb-2 uppercase tracking-wider">Режим доступа к сайту</h5>

            <label className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#11152A] border border-[#1E2442]/70 cursor-pointer hover:border-[#8B5CF6]/50 transition-colors">
              <input
                type="radio"
                name="site_access_mode"
                value="OPEN"
                checked={settings.site_access_mode === 'OPEN'}
                onChange={(e) => handleChange('site_access_mode', e.target.value)}
                className="mt-1"
              />
              <div>
                <span className="text-sm font-bold text-[#F8FAFC] block">Открытая регистрация</span>
                <span className="text-xs text-[#94A3B8]">Любой посетитель может зарегистрироваться и войти.</span>
              </div>
            </label>

            <label className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#11152A] border border-[#1E2442]/70 cursor-pointer hover:border-[#8B5CF6]/50 transition-colors">
              <input
                type="radio"
                name="site_access_mode"
                value="INVITE_ONLY"
                checked={settings.site_access_mode === 'INVITE_ONLY'}
                onChange={(e) => handleChange('site_access_mode', e.target.value)}
                className="mt-1"
              />
              <div>
                <span className="text-sm font-bold text-[#F8FAFC] block">Только по инвайтам</span>
                <span className="text-xs text-[#94A3B8]">Самостоятельная регистрация запрещена. Нужен действующий инвайт-код.</span>
              </div>
            </label>

            <label className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#11152A] border border-[#1E2442]/70 cursor-pointer hover:border-[#8B5CF6]/50 transition-colors">
              <input
                type="radio"
                name="site_access_mode"
                value="CLOSED"
                checked={settings.site_access_mode === 'CLOSED'}
                onChange={(e) => handleChange('site_access_mode', e.target.value)}
                className="mt-1"
              />
              <div>
                <span className="text-sm font-bold text-[#F8FAFC] block">Регистрация закрыта</span>
                <span className="text-xs text-[#94A3B8]">Новые пользователи не могут регистрироваться. Существующие могут входить.</span>
              </div>
            </label>

            <label className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#11152A] border border-[#1E2442]/70 cursor-pointer hover:border-red-500/50 transition-colors">
              <input
                type="radio"
                name="site_access_mode"
                value="MAINTENANCE"
                checked={settings.site_access_mode === 'MAINTENANCE'}
                onChange={(e) => handleChange('site_access_mode', e.target.value)}
                className="mt-1"
              />
              <div>
                <span className="text-sm font-bold text-rose-400 block">Технические работы</span>
                <span className="text-xs text-[#94A3B8]">Сайт закрыт для всех обычных пользователей. Вход только для администраторов.</span>
              </div>
            </label>

            {settings.site_access_mode === 'MAINTENANCE' && (
              <div className="mt-3">
                <label className="text-xs text-[#94A3B8] font-semibold block mb-1.5">Сообщение о тех. работах:</label>
                <input
                  type="text"
                  value={settings.maintenance_message || ''}
                  onChange={(e) => handleChange('maintenance_message', e.target.value)}
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
                  placeholder="Сервис находится на техническом обслуживании"
                />
              </div>
            )}
          </div>
        </div>

        {/* 2. Community & Moderation Policies */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-lg">
          <h4 className="text-sm font-bold text-[#F8FAFC] uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4.5 h-4.5 text-emerald-400" />
            Сообщество и Модерация
          </h4>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#11152A] border border-[#1E2442]/70">
              <div>
                <span className="text-sm font-bold text-[#F8FAFC] block">Гостевой доступ к отзывам</span>
                <span className="text-xs text-[#94A3B8]">
                  Разрешить просмотр отзывов без авторизации
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.allowGuestReviews ?? true}
                onChange={() => handleToggle('allowGuestReviews')}
                className="w-5 h-5 rounded cursor-pointer"
              />
            </div>

            <div>
              <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">
                Лимит комментариев в минуту (анти-спам):
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={settings.maxCommentsPerMinute ?? 5}
                onChange={(e) => handleChange('maxCommentsPerMinute', parseInt(e.target.value, 10))}
                className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">
                Максимальный размер аватара (МБ):
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={settings.maxAvatarSizeMb ?? 5}
                onChange={(e) => handleChange('maxAvatarSizeMb', parseInt(e.target.value, 10))}
                className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none font-mono"
              />
            </div>
          </div>
        </div>

        {/* 3. Branding & Site Info */}
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 md:col-span-2 shadow-lg">
          <h4 className="text-sm font-bold text-[#F8FAFC] uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-4.5 h-4.5 text-purple-400" />
            Брендинг и информация
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">Название платформы:</label>
              <input
                type="text"
                value={settings.siteName ?? 'Dodik Tracker'}
                onChange={(e) => handleChange('siteName', e.target.value)}
                className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
              />
            </div>

            <div>
              <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">Слоган платформы:</label>
              <input
                type="text"
                value={settings.siteMotto ?? 'Трекер фильмов, аниме, сериалов и игр'}
                onChange={(e) => handleChange('siteMotto', e.target.value)}
                className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
