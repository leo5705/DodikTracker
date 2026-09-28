import React, { useState } from 'react';
import {
  AlertTriangle,
  X,
  ShieldAlert,
  CheckCircle2,
  RotateCw,
  FileText,
  User,
  Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'MUSIC_REVIEW' | 'REVIEW' | 'COMMENT' | 'MESSAGE' | 'USER' | 'LIST' | 'TIER_LIST' | 'MEDIA' | string;
  targetId: number | string;
  targetTitle?: string;
  targetAuthorName?: string;
  targetContentPreview?: string;
  onReportSuccess?: () => void;
}

const REPORT_REASONS = [
  {
    id: 'SPAM',
    label: 'Спам / Реклама',
    desc: 'Бессмысленный текст, навязчивая реклама или сторонние ссылки',
  },
  {
    id: 'HARASSMENT',
    label: 'Оскорбления / Ненависть',
    desc: 'Прямые оскорбления, травля, угрозы или проявления дискриминации',
  },
  {
    id: 'NSFW',
    label: '18+ / Неприемлемый контент',
    desc: 'Шокирующие материалы, порнография, жестокость',
  },
  {
    id: 'RULES_VIOLATION',
    label: 'Нарушение правил платформы',
    desc: 'Недобросовестный отзыв, накрутка, троллинг или деструктивное поведение',
  },
  {
    id: 'OTHER',
    label: 'Другая причина',
    desc: 'Иная причина, требующая внимания модератора',
  },
];

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetTitle,
  targetAuthorName,
  targetContentPreview,
  onReportSuccess,
}) => {
  const { authFetch, dbUser } = useAuth();
  const [selectedReason, setSelectedReason] = useState<string>('RULES_VIOLATION');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbUser) {
      setError('Для отправки жалобы необходимо войти в систему');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await authFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetId: String(targetId),
          reason: selectedReason,
          subject: targetTitle || undefined,
          description: description.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Не удалось отправить жалобу');
      }

      setSuccess(true);
      if (onReportSuccess) {
        onReportSuccess();
      }

      setTimeout(() => {
        setSuccess(false);
        setDescription('');
        onClose();
      }, 1800);
    } catch (err: any) {
      setError(err.message || 'Ошибка при отправке жалобы');
    } finally {
      setSubmitting(false);
    }
  };

  const getTypeName = () => {
    switch (targetType) {
      case 'MUSIC_REVIEW':
        return 'музыкальный отзыв';
      case 'REVIEW':
        return 'отзыв';
      case 'COMMENT':
        return 'комментарий';
      case 'MESSAGE':
        return 'сообщение';
      case 'USER':
        return 'пользователя';
      case 'LIST':
        return 'список';
      case 'TIER_LIST':
        return 'тир-лист';
      default:
        return 'материал';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-2xl p-6 sm:p-7 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1E2442] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#F8FAFC]">
                Пожаловаться на {getTypeName()}
              </h3>
              <p className="text-xs text-[#94A3B8]">
                Жалоба будет направлена команде модераторов Dodik Tracker
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#151932] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Entity Summary Preview */}
        {(targetTitle || targetAuthorName || targetContentPreview) && (
          <div className="p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-1.5 text-xs">
            {targetTitle && (
              <div className="font-bold text-[#F8FAFC] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">{targetTitle}</span>
              </div>
            )}
            {targetAuthorName && (
              <div className="text-[#94A3B8] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0" />
                <span>Автор: <strong className="text-slate-200 font-medium">@{targetAuthorName}</strong></span>
              </div>
            )}
            {targetContentPreview && (
              <p className="text-slate-300 italic line-clamp-2 bg-[#080A18] p-2.5 rounded-xl border border-[#1E2442]/80 mt-1">
                «{targetContentPreview}»
              </p>
            )}
          </div>
        )}

        {/* Feedback / Alerts */}
        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2.5 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <span>Жалоба успешно отправлена и передана модераторам!</span>
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Reason Radio Group */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#CBD5E1] uppercase tracking-wider block">
                Выберите причину жалобы:
              </label>
              <div className="space-y-2">
                {REPORT_REASONS.map((r) => {
                  const isSelected = selectedReason === r.id;
                  return (
                    <label
                      key={r.id}
                      onClick={() => setSelectedReason(r.id)}
                      className={`flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-950/30 border-purple-500/60 shadow-md'
                          : 'bg-[#11152A] border-[#1E2442] hover:border-[#1E2442]/90 hover:bg-[#151932]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reportReason"
                        value={r.id}
                        checked={isSelected}
                        onChange={() => setSelectedReason(r.id)}
                        className="mt-0.5 accent-[#8B5CF6] cursor-pointer"
                      />
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-[#F8FAFC]">{r.label}</div>
                        <div className="text-[11px] text-[#94A3B8] leading-tight">{r.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Optional Comment */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#CBD5E1] flex items-center justify-between">
                <span>Дополнительный комментарий (необязательно)</span>
                <span className="text-[10px] text-slate-500 font-normal">{description.length}/500</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder="Опишите подробнее, что именно нарушает данный отзыв..."
                rows={3}
                className="w-full p-3 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] transition-colors resize-none leading-relaxed"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#1E2442]">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-xs font-semibold text-[#F8FAFC] border border-[#1E2442] transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="h-10 px-5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-red-600/25 disabled:opacity-50"
              >
                {submitting && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{submitting ? 'Отправка...' : 'Отправить жалобу'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
