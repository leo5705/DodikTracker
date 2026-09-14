
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
  Power
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
  const [testResults, setTestResults] = useState<{ [key: string]: { ok: boolean; message: string; latency?: number } }>({});

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
          message: data.ok ? 'Соединение успешно!' : (data.error || 'Ошибка ответа сервиса'),
          latency: data.latencyMs
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

  const getProviderDescription = (provider: string) => {
    const p = provider.toUpperCase();
    if (p === 'TMDB') return 'Главный источник данных о фильмах и сериалах (API Key).';
    if (p === 'KINOPOISK') return 'Дополнительные данные, рейтинги и русские описания.';
    if (p === 'RAWG') return 'База данных видеоигр, скриншоты, разработчики.';
    if (p === 'IGDB') return 'Twitch база данных игр. Введите в формате ClientID:ClientSecret';
    if (p === 'OPENLIBRARY') return 'Открытая база данных книг (не требует ключа).';
    if (p === 'ANILIST') return 'База данных аниме и манги (GraphQL).';
    if (p === 'ITUNES') return 'Поиск музыкальных альбомов и треков.';
    return 'Интеграция контента.';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-[#AC82FF] flex items-center justify-center">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#F3F1F8]">Внешние API & Интеграции</h3>
            <p className="text-xs text-[#9A94AA]">
              Управление API ключами к контент-провайдерам.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <RotateCw className="w-6 h-6 text-[#9B6BFF] animate-spin" />
          <span className="text-xs text-[#9A94AA]">Загрузка статуса провайдеров...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-400 text-xs bg-red-500/10 rounded-2xl border border-red-500/20">{error}</div>
      ) : (
        <div className="space-y-4">
          {integrations.map((item) => {
            const hasAnyKey = item.hasKey || item.hasClientId;
            const currentTest = testResults[item.provider];
            
            return (
              <div
                key={item.provider}
                className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="font-bold text-sm text-[#F3F1F8] flex items-center gap-2">
                      {item.provider}
                      {item.supportedTypes.map(t => (
                        <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#252233] text-[#9A94AA] uppercase">
                          {t}
                        </span>
                      ))}
                    </div>
                    
                    {!item.requiresKey ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Public API (Ключ не нужен)
                      </span>
                    ) : hasAnyKey ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Ключ установлен
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center gap-1">
                        Ключ отсутствует
                      </span>
                    )}
                    
                    {item.enabled ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-[#AC82FF] border border-purple-500/20">
                        Активно
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                        Выключено
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleEnabled(item.provider, item.enabled)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        item.enabled 
                          ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      {item.enabled ? 'Выключить' : 'Включить'}
                    </button>
                    
                    <button
                      onClick={() => handleTestConnection(item.provider)}
                      disabled={testingKey === item.provider || (item.requiresKey && !hasAnyKey)}
                      className="px-3 py-1.5 rounded-xl bg-[#0F0E12] border border-[#252233] hover:border-[#3A344E] text-[#9A94AA] hover:text-[#F3F1F8] text-xs font-semibold disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center gap-1.5"
                    >
                      {testingKey === item.provider ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Тест
                    </button>
                  </div>
                </div>
                
                <p className="text-xs text-[#9A94AA]">{getProviderDescription(item.provider)}</p>

                {/* Status / Errors from DB */}
                {(item.lastCheckedAt || item.lastError) && !currentTest && (
                  <div className="flex items-center gap-3 text-[11px] text-[#656075]">
                    {item.lastCheckedAt && (
                      <span>Последняя проверка: {new Date(item.lastCheckedAt).toLocaleString('ru-RU')}</span>
                    )}
                    {item.lastError && (
                      <span className="text-red-400">Ошибка: {item.lastError}</span>
                    )}
                  </div>
                )}

                {/* Current Test Result Message */}
                {currentTest && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      currentTest.ok
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-300 border border-red-500/20'
                    }`}
                  >
                    {currentTest.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{currentTest.message}</span>
                    {currentTest.latency !== undefined && (
                      <span className="ml-auto opacity-70 font-mono text-[10px]">{currentTest.latency}ms</span>
                    )}
                  </div>
                )}

                {/* Key editor */}
                {item.requiresKey && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
                    <div className="relative flex-1">
                      <input
                        type={showKeys[item.provider] ? 'text' : 'password'}
                        value={keyValues[item.provider] !== undefined ? keyValues[item.provider] : (item.maskedKey || item.maskedClientId || '')}
                        onChange={(e) => setKeyValues({ ...keyValues, [item.provider]: e.target.value })}
                        placeholder={item.provider === 'IGDB' ? 'ClientID:ClientSecret' : 'API Key или Token'}
                        className="w-full p-2.5 pr-10 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] font-mono outline-none focus:border-[#AC82FF] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeys({ ...showKeys, [item.provider]: !showKeys[item.provider] })}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#656075] hover:text-[#F3F1F8]"
                      >
                        {showKeys[item.provider] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    
                    <button
                      onClick={() => handleSaveKey(item.provider)}
                      disabled={savingKey === item.provider || !keyValues[item.provider]}
                      className="px-4 py-2.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shrink-0"
                    >
                      {savingKey === item.provider ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Сохранить
                    </button>
                    
                    {hasAnyKey && (
                      <button
                        onClick={() => handleRemoveKey(item.provider)}
                        disabled={savingKey === item.provider}
                        className="px-3 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors flex items-center justify-center"
                        title="Удалить ключ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
