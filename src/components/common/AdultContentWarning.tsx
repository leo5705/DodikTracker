import React from 'react';
import { ShieldAlert, ArrowLeft, Settings, AlertTriangle } from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';

interface AdultContentWarningProps {
  mode: 'restricted' | 'confirm';
  title?: string;
  onConfirm?: () => void;
  onBack?: () => void;
}

export const AdultContentWarning: React.FC<AdultContentWarningProps> = ({
  mode,
  title,
  onConfirm,
  onBack,
}) => {
  const { navigate, goBack } = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      goBack();
    }
  };

  if (mode === 'restricted') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-3xl bg-[#14131A] border border-red-500/20 shadow-2xl text-center space-y-6 animate-fade-in">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-lg shadow-red-950/40">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-black tracking-widest uppercase">
              🔞 18+ Доступ ограничен
            </div>
            <h2 className="text-xl font-bold text-[#F3F1F8]">
              {title ? `«${title}» — Контент 18+` : 'Контент 18+ скрыт'}
            </h2>
            <p className="text-xs text-[#9A94AA] leading-relaxed">
              Этот материал содержит возрастное ограничение 18+. Чтобы разблокировать доступ, включите отображение 18+ контента в настройках профиля.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 pt-2">
            <button
              onClick={() => navigate('/settings')}
              className="w-full py-3 px-4 rounded-xl bg-[#9B6BFF] hover:bg-[#8B5AEB] text-white font-bold text-sm shadow-lg shadow-purple-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>Перейти в настройки профиля</span>
            </button>
            <button
              onClick={handleBack}
              className="w-full py-2.5 px-4 rounded-xl bg-[#191724] hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8] border border-[#2E2A40] font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Вернуться назад</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-3xl bg-[#14131A] border border-amber-500/30 shadow-2xl text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-950/40">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black tracking-widest uppercase">
            🔞 Предупреждение 18+
          </div>
          <h2 className="text-xl font-bold text-[#F3F1F8]">
            {title ? `«${title}»` : 'Материал для взрослых'}
          </h2>
          <p className="text-xs text-[#9A94AA] leading-relaxed">
            Этот материал предназначен только для лиц старше 18 лет. Продолжая, вы подтверждаете, что хотите просмотреть этот контент.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          <button
            onClick={onConfirm}
            className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-lg shadow-red-950/50 transition-all cursor-pointer"
          >
            Продолжить просмотр
          </button>
          <button
            onClick={handleBack}
            className="w-full py-2.5 px-4 rounded-xl bg-[#191724] hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8] border border-[#2E2A40] font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Вернуться назад</span>
          </button>
        </div>
      </div>
    </div>
  );
};
