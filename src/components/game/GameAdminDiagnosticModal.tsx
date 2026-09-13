import React, { useState, useEffect } from 'react';
import {
  Activity,
  X,
  CheckCircle2,
  AlertCircle,
  Database,
  Clock,
  Layers,
  Sparkles,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { GameAdminDiagnostic } from '../../types/unifiedGame.ts';

interface GameAdminDiagnosticModalProps {
  gameIdOrSlug: string;
  isOpen: boolean;
  onClose: () => void;
}

export const GameAdminDiagnosticModal: React.FC<GameAdminDiagnosticModalProps> = ({
  gameIdOrSlug,
  isOpen,
  onClose,
}) => {
  const [diagnostic, setDiagnostic] = useState<GameAdminDiagnostic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnostic = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(gameIdOrSlug)}/diagnostic`);
      if (!res.ok) {
        throw new Error(`Ошибка загрузки диагностики: HTTP ${res.status}`);
      }
      const data = await res.json();
      setDiagnostic(data);
    } catch (err: any) {
      setError(err.message || 'Не удалось получить диагностику');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDiagnostic();
    }
  }, [isOpen, gameIdOrSlug]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-950/50 border border-purple-800/40 text-purple-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">
                Диагностика источников данных (RAWG + TheGamesDB / GMDB)
              </h3>
              <p className="text-xs text-zinc-400">
                Единая игровая подсистема Dodik Tracker
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDiagnostic}
              disabled={loading}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              title="Обновить диагностику"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && !diagnostic ? (
            <div className="py-16 flex flex-col items-center justify-center text-zinc-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              <span className="text-sm">Опрос провайдеров RAWG и GMDB...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : diagnostic ? (
            <>
              {/* Provider Health Statuses */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* RAWG Status */}
                <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-200">RAWG Game API</span>
                    {diagnostic.providerHealth.rawg.ok ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>OK ({diagnostic.providerHealth.rawg.latencyMs}ms)</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-rose-950/60 border border-rose-800/40 text-rose-400 text-[10px] font-bold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Ошибка</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    External ID:{' '}
                    <span className="font-mono text-purple-300">
                      {diagnostic.externalIds.rawg || 'Не привязан'}
                    </span>
                  </div>
                  {diagnostic.providerHealth.rawg.lastError && (
                    <div className="text-[10px] text-rose-400 font-mono">
                      {diagnostic.providerHealth.rawg.lastError}
                    </div>
                  )}
                </div>

                {/* GMDB / TheGamesDB Status */}
                <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-200">TheGamesDB / GMDB API</span>
                    {diagnostic.providerHealth.gmdb.ok ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>OK ({diagnostic.providerHealth.gmdb.latencyMs}ms)</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-rose-950/60 border border-rose-800/40 text-rose-400 text-[10px] font-bold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Ошибка</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    External ID:{' '}
                    <span className="font-mono text-sky-300">
                      {diagnostic.externalIds.gmdb || 'Не привязан'}
                    </span>
                  </div>
                  {diagnostic.providerHealth.gmdb.lastError && (
                    <div className="text-[10px] text-rose-400 font-mono">
                      {diagnostic.providerHealth.gmdb.lastError}
                    </div>
                  )}
                </div>
              </div>

              {/* Cache & Sync Information */}
              <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                  <Clock className="w-4 h-4 text-purple-400" />
                  <span>Состояние кэша и синхронизации</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-zinc-500">Кэш в Cloud SQL: </span>
                    <span className="font-semibold text-zinc-200">
                      {diagnostic.cacheInfo.isCached ? 'Активен (HIT)' : 'Промах (MISS)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Синхронизировано: </span>
                    <span className="font-semibold text-zinc-200 font-mono">
                      {new Date(diagnostic.lastSyncedAt).toLocaleTimeString('ru-RU')}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Уверенность матчинга: </span>
                    <span className="font-semibold text-emerald-400">
                      {diagnostic.matchingConfidence || 'HIGH'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Field Provenance Table */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                  <Database className="w-4 h-4 text-purple-400" />
                  <span>Происхождение полей (Field Provenance)</span>
                </div>
                <div className="rounded-2xl border border-zinc-800 overflow-hidden bg-zinc-950/60">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400">
                        <th className="p-3 font-semibold">Поле</th>
                        <th className="p-3 font-semibold">Источник данных</th>
                        <th className="p-3 font-semibold">Статус fallback</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                      {Object.entries(diagnostic.fieldProvenance).map(([field, prov]) => (
                        <tr key={field} className="hover:bg-zinc-900/30 transition-colors">
                          <td className="p-3 font-mono text-purple-300">{field}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                prov.source === 'RAWG'
                                  ? 'bg-purple-950/60 text-purple-300 border border-purple-800/40'
                                  : prov.source === 'GMDB'
                                  ? 'bg-sky-950/60 text-sky-300 border border-sky-800/40'
                                  : prov.source === 'LOCAL'
                                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                                  : 'bg-zinc-800 text-zinc-300'
                              }`}
                            >
                              {prov.source}
                            </span>
                          </td>
                          <td className="p-3">
                            {prov.isFallback ? (
                              <span className="text-amber-400 font-medium text-[11px]">
                                Сработал Fallback (GMDB)
                              </span>
                            ) : (
                              <span className="text-zinc-500 text-[11px]">Основной источник</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
