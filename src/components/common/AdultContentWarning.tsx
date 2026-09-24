import React, { useState } from 'react';
import { ShieldAlert, ArrowLeft, CheckCircle2, Lock, AlertTriangle } from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

export interface AdultContentWarningProps {
  title?: string;
  ageRating?: string;
  contentWarnings?: string[];
  onConfirm?: () => void;
  onBack?: () => void;
}

const WARNING_LABELS_MAP: Record<string, string> = {
  sexual_content: 'Сексуальный контент',
  nudity: 'Нагота',
  violence: 'Насилие и жестокость',
  explicit_language: 'Ненормативная лексика',
  disturbing_scenes: 'Шокирующие сцены',
  substance_use: 'Алкоголь / психоактивные вещества',
  sensitive_themes: 'Чувствительные темы',
  '18+ Adult Content': 'Контент 18+',
  '18+ Age Rating': 'Возрастной рейтинг 18+',
  'Explicit Lyrics / Audio': 'Ненормативная лексика в аудио',
  'Sexual Content': 'Сексуальный контент',
  'Nudity': 'Нагота',
  'Violence & Gore': 'Насилие и жестокость',
  'Explicit Language': 'Ненормативная лексика',
};

export const AdultContentWarning: React.FC<AdultContentWarningProps> = ({
  title,
  ageRating = '18+',
  contentWarnings = [],
  onConfirm,
  onBack,
}) => {
  const { goBack } = useRouter();
  const { authFetch, dbUser, refreshProfile } = useAuth();
  const [enabling, setEnabling] = useState(false);
  const [alwaysAllow, setAlwaysAllow] = useState(false);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      goBack();
    }
  };

  const handleProceed = async () => {
    // If user is authenticated and checked "always allow" or wants to enable it in account
    if (dbUser && !dbUser.showAdultContent && alwaysAllow) {
      setEnabling(true);
      try {
        await authFetch('/api/users/me/adult-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        });
        await refreshProfile();
      } catch (_e) {
      } finally {
        setEnabling(false);
      }
    }

    if (onConfirm) {
      onConfirm();
    }
  };

  const formattedWarnings = contentWarnings
    .map((w) => WARNING_LABELS_MAP[w] || w)
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070913]/95 backdrop-blur-2xl p-4 sm:p-6 select-none animate-fade-in">
      <div className="w-full max-w-lg p-8 sm:p-10 rounded-3xl bg-[#0D1022] border border-rose-500/30 shadow-2xl shadow-rose-950/50 text-center space-y-6 relative overflow-hidden">
        {/* Glow background accent */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* 18+ Icon & Badge */}
        <div className="relative mx-auto w-20 h-20 rounded-2xl bg-gradient-to-tr from-rose-600/25 to-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-950/50">
          <ShieldAlert className="w-10 h-10" />
          <span className="absolute -bottom-2.5 -right-2.5 px-2.5 py-0.5 rounded-lg bg-rose-600 text-white font-black text-xs font-mono shadow-lg border border-rose-400/50">
            {ageRating || '18+'}
          </span>
        </div>

        {/* Content Warning Text */}
        <div className="space-y-3 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-black tracking-widest uppercase font-mono">
            <Lock className="w-3.5 h-3.5" />
            <span>Контент для взрослых</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Контент для взрослых
          </h1>

          {title && (
            <p className="text-sm sm:text-base font-semibold text-rose-200/90 truncate px-4">
              «{title}»
            </p>
          )}

          <p className="text-sm text-[#94A3B8] leading-relaxed max-w-md mx-auto">
            Этот материал может содержать сексуальный контент, наготу, насилие или другие чувствительные материалы.
          </p>

          {/* Specific Warning Tags */}
          {formattedWarnings.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
              {formattedWarnings.map((warn, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#181B34] border border-rose-500/20 text-rose-300 text-xs font-medium"
                >
                  <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                  <span>{warn}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Account Setting Checkbox */}
        {dbUser && !dbUser.showAdultContent && (
          <label className="flex items-center justify-center gap-2.5 text-xs text-[#94A3B8] hover:text-white cursor-pointer select-none transition-colors relative z-10 pt-1">
            <input
              type="checkbox"
              checked={alwaysAllow}
              onChange={(e) => setAlwaysAllow(e.target.checked)}
              className="w-4 h-4 rounded border-[#2E3558] bg-[#141830] text-rose-600 focus:ring-rose-500 accent-rose-600"
            />
            <span>Запомнить выбор и включить показ 18+ в профиле</span>
          </label>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2 relative z-10">
          <button
            type="button"
            onClick={handleBack}
            className="flex-1 py-3.5 px-6 rounded-2xl bg-[#141830] hover:bg-[#1C2244] active:scale-[0.99] text-[#CBD5E1] hover:text-white border border-[#23294E] font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Вернуться</span>
          </button>

          <button
            type="button"
            onClick={handleProceed}
            disabled={enabling}
            className="flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-rose-950/60 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{enabling ? 'Сохранение...' : 'Продолжить'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
