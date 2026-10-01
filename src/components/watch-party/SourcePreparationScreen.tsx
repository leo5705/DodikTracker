import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, Play, RefreshCw, HardDrive, HelpCircle } from 'lucide-react';
import { TorrentSourceState } from '../../types/watchParty.ts';

interface SourcePreparationScreenProps {
  torrentState: TorrentSourceState | null;
  torrentFile: { name: string; index: number; path: string; sizeBytes?: number } | null;
  torrentErrorMessage: string | null;
  isHost: boolean;
  onRetry: () => void;
  onCancel: () => void;
  onOpenSourceModal?: () => void;
  torrentFallbackCount?: number;
  torrentRetryCount?: number;
}

// Strictly parses release information from the title to avoid fake data
function parseReleaseInfo(name?: string) {
  if (!name) return null;
  const nameLower = name.toLowerCase();
  
  let resolution = '';
  if (nameLower.includes('2160p') || nameLower.includes('4k') || nameLower.includes('uhd')) resolution = '2160p';
  else if (nameLower.includes('1080p')) resolution = '1080p';
  else if (nameLower.includes('720p')) resolution = '720p';
  else if (nameLower.includes('480p')) resolution = '480p';

  let source = '';
  if (nameLower.includes('web-dl') || nameLower.includes('webdl')) source = 'WEB-DL';
  else if (nameLower.includes('webrip') || nameLower.includes('web-rip')) source = 'WEBRip';
  else if (nameLower.includes('bluray') || nameLower.includes('blu-ray') || nameLower.includes('bdrip')) source = 'BluRay';
  else if (nameLower.includes('hdtv')) source = 'HDTV';

  let codec = '';
  if (nameLower.includes('x265') || nameLower.includes('h265') || nameLower.includes('hevc')) codec = 'x265';
  else if (nameLower.includes('x264') || nameLower.includes('h264') || nameLower.includes('avc')) codec = 'x264';

  return {
    resolution: resolution || null,
    source: source || null,
    codec: codec || null,
  };
}

function formatBytes(bytes?: number): string | null {
  if (!bytes || isNaN(bytes) || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const num = bytes / Math.pow(1024, i);
  return `${num.toFixed(1)} ${units[i]}`;
}

export const SourcePreparationScreen: React.FC<SourcePreparationScreenProps> = ({
  torrentState,
  torrentFile,
  torrentErrorMessage,
  isHost,
  onRetry,
  onCancel,
  onOpenSourceModal,
  torrentFallbackCount = 0,
  torrentRetryCount = 0,
}) => {
  const parsed = parseReleaseInfo(torrentFile?.name);
  const formattedSize = formatBytes(torrentFile?.sizeBytes);

  // Mapped stage status calculations based on the source-specific torrent state
  const getStageStatus = (stageNum: number): 'done' | 'active' | 'pending' | 'failed' => {
    if (torrentState === 'FAILED') {
      // If failed, make active/pending stage show failed
      if (stageNum === 1 && (torrentErrorMessage?.includes('Prowlarr') || torrentErrorMessage?.includes('раздач'))) return 'failed';
      if (stageNum === 2 && torrentErrorMessage?.includes('метаданных')) return 'failed';
      if (stageNum === 3 && (torrentErrorMessage?.includes('видеопоток') || torrentErrorMessage?.includes('TorrServer'))) return 'failed';
      if (stageNum === 4) return 'pending';
      return 'done';
    }

    if (!torrentState) return 'pending';

    switch (stageNum) {
      case 1: // Поиск источника
        if (torrentState === 'DISCOVERING') return 'active';
        return 'done';
      case 2: // Проверка релиза
        if (torrentState === 'FOUND') return 'active';
        if (torrentState === 'DISCOVERING') return 'pending';
        return 'done';
      case 3: // Подготовка видео
        if (torrentState === 'LOADING') return 'active';
        if (torrentState === 'DISCOVERING' || torrentState === 'FOUND') return 'pending';
        return 'done';
      case 4: // Запуск воспроизведения
        if (torrentState === 'BUFFERING') return 'active';
        if (torrentState === 'READY' || torrentState === 'PLAYING') return 'done';
        return 'pending';
      default:
        return 'pending';
    }
  };

  // Safe mapping translations without internal names exposure
  const getDisplayStatusText = (): string => {
    if (!torrentState) return 'Инициализация…';
    switch (torrentState) {
      case 'DISCOVERING':
        return isHost ? 'Ищем источник…' : 'Ведущий подготавливает видео…';
      case 'FOUND':
        return 'Найден подходящий источник';
      case 'LOADING':
        return 'Подготавливаем видео…';
      case 'BUFFERING':
        return 'Буферизация…';
      case 'READY':
      case 'PLAYING':
        return 'Источник готов';
      case 'STOPPING':
      case 'STOPPED':
        return 'Подготовка остановлена';
      case 'FAILED':
        return 'Не удалось подготовить источник';
      default:
        return 'Загрузка…';
    }
  };

  const isFailed = torrentState === 'FAILED';

  return (
    <div className="w-full aspect-video rounded-3xl bg-[#080A18] border border-[#1E2442] flex items-center justify-center p-6 relative overflow-hidden shadow-2xl select-none min-h-[380px]">
      {/* Immersive subtle ambient background glow */}
      <div 
        className="absolute top-[-50%] left-[-20%] w-[140%] h-[200%] pointer-events-none opacity-25 filter blur-3xl" 
        style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 65%)' }} 
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={isFailed ? 'failed' : 'loading'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full max-w-lg bg-[#0B0D20] border border-[#1E2442] p-6 md:p-8 rounded-3xl shadow-2xl z-10 flex flex-col space-y-5"
        >
          {/* Top Title & Loader Icon */}
          <div className="flex items-center gap-4">
            <div className={`p-3.5 rounded-2xl shrink-0 border ${isFailed ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-[#8B5CF6]/10 text-[#A78BFA] border-[#8B5CF6]/30'}`}>
              {isFailed ? (
                <AlertCircle className="w-6 h-6 animate-pulse" />
              ) : (
                <Loader2 className="w-6 h-6 animate-spin text-[#8B5CF6]" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-white tracking-tight">
                {isFailed ? 'Не удалось настроить видеопоток' : 'Подготавливаем видео'}
              </h3>
              <p className="text-xs font-semibold text-[#94A3B8] mt-0.5">
                {getDisplayStatusText()}
              </p>
            </div>
          </div>

          {/* Progress Stages Checklist */}
          <div className="grid grid-cols-2 gap-3 py-3.5 px-4 bg-[#0F132A] border border-[#1E2442] rounded-2xl">
            {[
              { id: 1, label: 'Поиск источника' },
              { id: 2, label: 'Проверка релиза' },
              { id: 3, label: 'Подготовка видео' },
              { id: 4, label: 'Запуск воспроизведения' },
            ].map((stage) => {
              const status = getStageStatus(stage.id);
              return (
                <div key={stage.id} className="flex items-center gap-2">
                  {status === 'done' && (
                    <span className="text-emerald-400 text-sm font-bold w-4 h-4 flex items-center justify-center shrink-0">✓</span>
                  )}
                  {status === 'active' && (
                    <span className="text-[#A78BFA] text-sm font-bold w-4 h-4 flex items-center justify-center shrink-0 animate-pulse">●</span>
                  )}
                  {status === 'pending' && (
                    <span className="text-[#64748B] text-sm font-bold w-4 h-4 flex items-center justify-center shrink-0">○</span>
                  )}
                  {status === 'failed' && (
                    <span className="text-rose-400 text-sm font-bold w-4 h-4 flex items-center justify-center shrink-0">✗</span>
                  )}
                  <span 
                    className={`text-xs font-semibold transition-colors ${
                      status === 'done' 
                        ? 'text-[#CBD5E1]' 
                        : status === 'active' 
                        ? 'text-[#F8FAFC] font-bold' 
                        : status === 'failed'
                        ? 'text-rose-400'
                        : 'text-[#64748B]'
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Fallback Attempt Banner (Anti-Technical Log, Sleek UI Notification) */}
          {torrentFallbackCount > 1 && !isFailed && (
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/25 text-amber-300 text-xs flex items-center gap-2.5 animate-fadeIn">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
              <span className="font-medium">Источник не загрузился. Пробуем другой…</span>
            </div>
          )}

          {/* Safe release metadata badges (No fake data or internal URLs) */}
          {torrentFile?.name && !isFailed && (
            <div className="space-y-2">
              <div className="text-[11px] font-mono text-[#94A3B8] p-2.5 bg-[#080A18] rounded-xl border border-[#1E2442] truncate">
                Файл: {torrentFile.name}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {parsed?.resolution ? (
                  <span className="px-2.5 py-1 text-[10px] font-black font-mono tracking-wide rounded-lg bg-[#151932] border border-[#8B5CF6]/30 text-[#A78BFA] shadow-sm">
                    {parsed.resolution}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-[#151932] border border-[#1E2442] text-[#64748B]">
                    Качество неизвестно
                  </span>
                )}
                {parsed?.source && (
                  <span className="px-2.5 py-1 text-[10px] font-black font-mono tracking-wide rounded-lg bg-[#151932] border border-sky-500/30 text-sky-400 shadow-sm">
                    {parsed.source}
                  </span>
                )}
                {parsed?.codec && (
                  <span className="px-2.5 py-1 text-[10px] font-black font-mono tracking-wide rounded-lg bg-[#151932] border border-emerald-500/20 text-emerald-400 shadow-sm">
                    {parsed.codec}
                  </span>
                )}
                {formattedSize && (
                  <span className="px-2.5 py-1 text-[10px] font-black font-mono tracking-wide rounded-lg bg-[#151932] border border-amber-500/20 text-amber-400 shadow-sm inline-flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-amber-500" />
                    <span>{formattedSize}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Failure description message & CTAs */}
          {isFailed && (
            <div className="space-y-4">
              <p className="text-xs text-[#CBD5E1] leading-relaxed">
                {isHost 
                  ? 'Не удалось найти рабочий источник. Попробуйте повторить поиск.'
                  : 'Ведущий пока не смог запустить видео. Ожидайте повторной попытки.'}
              </p>
              
              <div className="flex items-center gap-2 pt-2 border-t border-[#1E2442]">
                {isHost ? (
                  <>
                    <button
                      onClick={onRetry}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white font-bold text-xs shadow-lg shadow-[#7C3AED]/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Повторить поиск</span>
                    </button>
                    {onOpenSourceModal && (
                      <button
                        onClick={onOpenSourceModal}
                        className="py-2.5 px-4 rounded-xl bg-[#151932] hover:bg-[#1E2442] border border-[#1E2442] text-[#CBD5E1] hover:text-white transition-colors text-xs font-bold cursor-pointer"
                      >
                        Выбрать другой
                      </button>
                    )}
                  </>
                ) : (
                  <div className="w-full text-center py-2.5 px-4 rounded-xl bg-[#080A18] text-amber-400 border border-amber-500/10 text-xs font-semibold animate-pulse">
                    Ожидаем действий от ведущего комнаты
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Host cancel control during active search */}
          {!isFailed && isHost && (
            <div className="pt-3.5 border-t border-[#1E2442] flex items-center justify-between gap-4">
              <span className="text-[10px] text-[#64748B] italic">Вы можете прервать фоновый поиск в любой момент</span>
              <button
                onClick={onCancel}
                className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 text-[10px] font-extrabold tracking-wide uppercase transition-all cursor-pointer"
              >
                Отменить
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
