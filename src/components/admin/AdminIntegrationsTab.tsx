import React, { useState, useEffect } from 'react';
import {
  Key,
  ShieldCheck,
  Send,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Cpu,
  RefreshCw,
  ExternalLink,
  Trash2,
  Power,
  Music,
  Radio,
  Search,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface IntegrationData {
  provider: string;
  supportedTypes: string[];
  requiresKey: boolean;
  enabled: boolean;
  hasKey: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  maskedKey?: string;
  maskedClientId?: string;
  lastCheckedAt?: string;
  lastError?: string;
  priority: number;
}

export const AdminIntegrationsTab: React.FC = () => {
  const { authFetch } = useAuth();
  const [integrations, setIntegrations] = useState<IntegrationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Key edits state
  const [keyValues, setKeyValues] = useState<{ [key: string]: string }>({});
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);

  // Technical Inspector state
  const [inspectId, setInspectId] = useState('');
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectResult, setInspectResult] = useState<any>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const [testResults, setTestResults] = useState<{
    [key: string]: { ok: boolean; message: string; latency?: number };
  }>({});

  const fetchIntegrations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/integrations');
      if (!res.ok) throw new Error('Ошибка загрузки настроек интеграций');
      const data = await res.json();
      setIntegrations(data || []);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить интеграции');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const handleSaveKey = async (provider: string) => {
    const val = keyValues[provider];
    if (!val) return;

    setSavingKey(provider);
    try {
      const res = await authFetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: val, enabled: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения ключа');

      setKeyValues((prev) => ({ ...prev, [provider]: '' }));
      await fetchIntegrations();
      handleTestConnection(provider); // Auto-test after save
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingKey(null);
    }
  };

  const handleRemoveKey = async (provider: string) => {
    if (!confirm(`Вы действительно хотите удалить ключи для ${provider}?`)) return;

    setSavingKey(provider);
    try {
      const res = await authFetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, removeKey: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка удаления ключа');
      }

      await fetchIntegrations();
      setTestResults((prev) => {
        const copy = { ...prev };
        delete copy[provider];
        return copy;
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleEnabled = async (provider: string, currentEnabled: boolean) => {
    try {
      const res = await authFetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, enabled: !currentEnabled }),
      });
      if (!res.ok) throw new Error('Ошибка изменения статуса');
      await fetchIntegrations();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleTestConnection = async (provider: string) => {
    setTestingKey(provider);
    setTestResults((prev) => {
      const copy = { ...prev };
      delete copy[provider];
      return copy;
    });

    try {
      const res = await authFetch('/api/admin/integrations/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();

      setTestResults((prev) => ({
        ...prev,
        [provider]: {
          ok: data.ok,
          message: data.ok ? 'Соединение успешно!' : data.error || 'Ошибка ответа сервиса',
          latency: data.latencyMs,
        },
      }));

      // Also refresh to update lastCheckedAt and lastError
      fetchIntegrations();
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [provider]: { ok: false, message: err.message || 'Ошибка сети' },
      }));
    } finally {
      setTestingKey(null);
    }
  };

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectId.trim()) return;

    setInspectLoading(true);
    setInspectResult(null);
    setInspectError(null);

    try {
      // Need a dedicated endpoint for inspection if we want to keep it in integrations
      // Let's use the one we kept (actually I deleted musicProviders route, so I should add it to integrationsRouter or use search)
      const res = await authFetch(`/api/admin/integrations/inspect/${encodeURIComponent(inspectId.trim())}`);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Объект не найден');
      }
      const data = await res.json();
      setInspectResult(data);
    } catch (err: any) {
      setInspectError(err.message || 'Ошибка инспекции внешнего ресурса');
    } finally {
      setInspectLoading(false);
    }
  };

  const getProviderDescription = (provider: string) => {
    const p = provider.toUpperCase();
    if (p === 'TMDB') return 'Главный источник данных о фильмах и сериалах (API Key).';
    if (p === 'KINOPOISK') return 'Дополнительные данные, рейтинги и русские описания.';
    if (p === 'RAWG') return 'База данных видеоигр, скриншоты, разработчики.';
    if (p === 'IGDB') return 'Twitch база данных игр. Введите в формате ClientID:ClientSecret';
    if (p === 'OPENLIBRARY') return 'Открытая база данных книг (не требует ключа).';
    if (p === 'ANILIST') return 'База данных аниме и манги (GraphQL).';
    if (p === 'ITUNES') return 'Поиск музыкальных альбомов и треков Apple Music/iTunes.';
    if (p === 'YOUTUBE MUSIC' || p === 'YOUTUBE') return 'Мировой каталог музыки и стриминг YouTube Music (Public API, ключ не требуется).';
    if (p === 'GENIUS') return 'Крупнейшая база текстов песен (Client Access Token из genius.com/api-clients). Тексты сопоставляются строго по названию и артисту.';
    return 'Интеграция контента.';
  };

  const isMusicProvider = (prov: string) => {
    const p = prov.toUpperCase();
    return p === 'YOUTUBE MUSIC' || p === 'YOUTUBE' || p === 'GENIUS';
  };

  const activeIntegrations = integrations.filter((i) => i.provider.toUpperCase() !== 'SOUNDCLOUD');
  const musicIntegrations = activeIntegrations.filter((i) => isMusicProvider(i.provider));
  const contentIntegrations = activeIntegrations.filter((i) => !isMusicProvider(i.provider));

  const renderProviderCard = (item: IntegrationData) => {
    const hasAnyKey = item.hasKey || item.hasClientId;
    const currentTest = testResults[item.provider];

    return (
      <div
        key={item.provider}
        className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#1E2442]/60">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-bold text-base text-[#F8FAFC] flex items-center gap-2">
              {item.provider}
              {item.supportedTypes.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded text-xs font-bold bg-[#11152A] text-[#94A3B8] uppercase border border-[#1E2442]"
                >
                  {t}
                </span>
              ))}
            </div>

            {!item.requiresKey ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Public API (Ключ не нужен)
              </span>
            ) : hasAnyKey ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Ключ установлен
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#11152A] text-zinc-400 border border-zinc-700 flex items-center gap-1.5">
                Ключ отсутствует
              </span>
            )}

            {item.enabled ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-[#A78BFA] border border-purple-500/20">
                Активно
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                Выключено
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleEnabled(item.provider, item.enabled)}
              className={`h-10 px-4 rounded-xl border text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                item.enabled
                  ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              }`}
            >
              <Power className="w-4 h-4" />
              {item.enabled ? 'Выключить' : 'Включить'}
            </button>

            <button
              onClick={() => handleTestConnection(item.provider)}
              disabled={testingKey === item.provider || (item.requiresKey && !hasAnyKey)}
              className="h-10 px-4 rounded-xl bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/50 text-[#94A3B8] hover:text-[#F8FAFC] text-xs sm:text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center gap-2 cursor-pointer"
            >
              {testingKey === item.provider ? (
                <RotateCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Тест
            </button>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
          {getProviderDescription(item.provider)}
        </p>

        {/* Status / Errors from DB */}
        {(item.lastCheckedAt || item.lastError) && !currentTest && (
          <div className="flex items-center gap-3 text-xs text-[#64748B] font-mono">
            {item.lastCheckedAt && (
              <span>
                Последняя проверка:{' '}
                {new Date(item.lastCheckedAt).toLocaleString('ru-RU')}
              </span>
            )}
            {item.lastError && <span className="text-red-400">Ошибка: {item.lastError}</span>}
          </div>
        )}

        {/* Current Test Result Message */}
        {currentTest && (
          <div
            className={`p-3.5 rounded-2xl text-xs sm:text-sm flex items-center gap-2.5 ${
              currentTest.ok
                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-300 border border-red-500/20'
            }`}
          >
            {currentTest.ok ? (
              <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
            )}
            <span>{currentTest.message}</span>
            {currentTest.latency !== undefined && (
              <span className="ml-auto opacity-80 font-mono text-xs font-bold">
                {currentTest.latency}ms
              </span>
            )}
          </div>
        )}

        {/* Key editor */}
        {item.requiresKey && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
            <div className="relative flex-1">
              <input
                type={showKeys[item.provider] ? 'text' : 'password'}
                value={
                  keyValues[item.provider] !== undefined
                    ? keyValues[item.provider]
                    : item.maskedKey || item.maskedClientId || ''
                }
                onChange={(e) =>
                  setKeyValues({ ...keyValues, [item.provider]: e.target.value })
                }
                placeholder={
                  item.provider === 'IGDB'
                    ? 'ClientID:ClientSecret'
                    : item.provider === 'GENIUS'
                    ? 'Client Access Token (Genius)'
                    : 'API Key или Token'
                }
                className="w-full h-11 pl-4 pr-11 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] font-mono outline-none focus:border-[#A78BFA] transition-colors"
              />
              <button
                type="button"
                onClick={() =>
                  setShowKeys({
                    ...showKeys,
                    [item.provider]: !showKeys[item.provider],
                  })
                }
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#F8FAFC] p-1 cursor-pointer"
              >
                {showKeys[item.provider] ? (
                  <EyeOff className="w-4.5 h-4.5" />
                ) : (
                  <Eye className="w-4.5 h-4.5" />
                )}
              </button>
            </div>

            <button
              onClick={() => handleSaveKey(item.provider)}
              disabled={savingKey === item.provider || !keyValues[item.provider]}
              className="h-11 px-6 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-bold transition-colors flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-md"
            >
              {savingKey === item.provider ? (
                <RotateCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Сохранить
            </button>

            {hasAnyKey && (
              <button
                onClick={() => handleRemoveKey(item.provider)}
                disabled={savingKey === item.provider}
                className="h-11 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 transition-colors flex items-center justify-center cursor-pointer"
                title="Удалить ключ (очистить)"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8 w-full animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-purple-500/15 text-[#A78BFA] flex items-center justify-center">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#F8FAFC]">Внешние API & Интеграции</h3>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              Единое управление API ключами, музыкальными сервисами и контент-провайдерами Dodik Tracker.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <RotateCw className="w-8 h-8 text-[#8B5CF6] animate-spin" />
          <span className="text-sm text-[#94A3B8]">Загрузка статуса провайдеров...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-400 text-sm bg-red-500/10 rounded-2xl border border-red-500/20">
          {error}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Section 1: Music Providers */}
          {musicIntegrations.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-white font-mono text-sm font-bold uppercase tracking-wider px-1">
                <Music className="w-4 h-4 text-purple-400" />
                <span>Музыкальные сервисы / Music Providers</span>
              </div>
              <div className="space-y-4">
                {musicIntegrations.map((item) => renderProviderCard(item))}
              </div>
            </div>
          )}

          {/* Section 2: Media & Content Providers */}
          {contentIntegrations.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-white font-mono text-sm font-bold uppercase tracking-wider px-1">
                <Radio className="w-4 h-4 text-indigo-400" />
                <span>Медиа и контент-провайдеры (Фильмы, Игры, Книги, Аниме)</span>
              </div>
              <div className="space-y-4">
                {contentIntegrations.map((item) => renderProviderCard(item))}
              </div>
            </div>
          )}

          {/* Technical Inspector (Admin Only) */}
          <div className="pt-8 border-t border-[#1E2442]">
            <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  <span>Инспектор внешних ресурсов (Technical Audit)</span>
                </h3>
                <p className="text-xs text-[#94A3B8]">
                  Исследование технических свойств внешних треков, фильмов или игр.
                </p>
              </div>

              <form onSubmit={handleInspect} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Provider Track ID или External ID"
                  value={inspectId}
                  onChange={(e) => setInspectId(e.target.value)}
                  className="flex-1 h-11 px-4 rounded-xl bg-[#11152A] text-sm font-mono text-white border border-[#1E2442] focus:border-[#8B5CF6]/50 outline-none transition-all"
                />
                <button
                  type="submit"
                  disabled={inspectLoading || !inspectId.trim()}
                  className="px-6 h-11 bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-40 text-white text-sm font-bold rounded-xl transition shadow-md cursor-pointer flex items-center gap-2"
                >
                  {inspectLoading ? (
                    <RotateCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  <span>Инспектировать</span>
                </button>
              </form>

              {inspectError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-2xl text-xs font-mono text-rose-300">
                  {inspectError}
                </div>
              )}

              {inspectResult && (
                <div className="p-5 rounded-2xl bg-[#080A18] border border-[#1E2442] space-y-3 text-xs font-mono">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-slate-300">
                    <div className="flex justify-between border-b border-[#1E2442]/40 pb-1">
                      <span className="text-slate-500">Provider:</span>
                      <span className="font-bold text-white">{inspectResult.provider}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#1E2442]/40 pb-1">
                      <span className="text-slate-500">External ID:</span>
                      <span className="font-bold text-purple-300">{inspectResult.providerTrackId || inspectResult.externalId}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#1E2442]/40 pb-1 sm:col-span-2">
                      <span className="text-slate-500">Title:</span>
                      <span className="font-bold text-white text-right ml-4">{inspectResult.title}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#1E2442]/40 pb-1 sm:col-span-2">
                      <span className="text-slate-500">Artist/Author:</span>
                      <span className="font-bold text-white text-right ml-4">{inspectResult.artist || inspectResult.author || '—'}</span>
                    </div>
                    {inspectResult.durationSeconds && (
                      <div className="flex justify-between border-b border-[#1E2442]/40 pb-1">
                        <span className="text-slate-500">Duration:</span>
                        <span>{inspectResult.durationSeconds}s</span>
                      </div>
                    )}
                    {inspectResult.lyricsProviderAvailable && (
                      <div className="flex justify-between border-b border-[#1E2442]/40 pb-1">
                        <span className="text-slate-500">Lyrics Mode:</span>
                        <span className="font-bold text-emerald-400">{inspectResult.lyricsProviderAvailable}</span>
                      </div>
                    )}
                  </div>
                  {inspectResult.youtubeUrl && (
                    <div className="pt-2 flex justify-end">
                      <a
                        href={inspectResult.youtubeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#A78BFA] hover:text-[#C4B5FD] flex items-center gap-1.5 transition-colors"
                      >
                        <span>Перейти к источнику</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
