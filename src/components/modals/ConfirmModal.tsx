import React from 'react';
import { AlertTriangle, AlertCircle, Info, Loader2, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-rose-400" />,
          iconBg: 'bg-rose-950/60 border border-rose-800/50',
          confirmBtn:
            'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40 border border-rose-500/50',
        };
      case 'warning':
        return {
          icon: <AlertCircle className="w-6 h-6 text-amber-400" />,
          iconBg: 'bg-amber-950/60 border border-amber-800/50',
          confirmBtn:
            'bg-amber-600 hover:bg-amber-500 text-black font-bold shadow-lg shadow-amber-950/40 border border-amber-500/50',
        };
      case 'primary':
      default:
        return {
          icon: <Info className="w-6 h-6 text-[#AC82FF]" />,
          iconBg: 'bg-purple-950/60 border border-purple-800/50',
          confirmBtn:
            'bg-[#9B6BFF] hover:bg-[#8A55FF] text-white shadow-lg shadow-purple-950/40 border border-purple-500/50',
        };
    }
  };

  const { icon, iconBg, confirmBtn } = getVariantStyles();

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-[#14131A] border border-[#252233] p-6 shadow-2xl space-y-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9A94AA] hover:text-white hover:bg-[#252233] transition-colors"
          title="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3.5">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${iconBg}`}>
            {icon}
          </div>
          <div className="space-y-1 pr-6">
            <h3 className="text-base font-bold text-[#F3F1F8] font-mono leading-snug">{title}</h3>
            <p className="text-xs text-[#9A94AA] leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#252233]">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-[#191724] hover:bg-[#252233] border border-[#252233] text-xs font-semibold text-[#D5D0E3] transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 ${confirmBtn}`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
