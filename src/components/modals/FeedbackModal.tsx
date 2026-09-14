import React, { useState } from 'react';
import { MessageSquare, AlertTriangle, Send, X, ShieldAlert, Sparkles, Lightbulb } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const { authFetch } = useAuth();
  const [type, setType] = useState<'SUGGESTION' | 'BUG' | 'COMPLAINT'>('SUGGESTION');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await authFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'SYSTEM',
          targetId: type,
          reason: type === 'SUGGESTION' ? 'OTHER' : type === 'BUG' ? 'OTHER' : 'RULES_VIOLATION',
          description: description.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка отправки обращения');
      }
      
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
        setIsSuccess(false);
        setDescription('');
      }, 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка при отправке сообщения. Попробуйте позже.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualCloseSuccess = () => {
    onClose();
    setIsSuccess(false);
    setDescription('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#14131A] border border-[#252233] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in-up">
        <div className="p-5 border-b border-[#252233] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#191724] border border-[#252233] flex items-center justify-center text-[#AC82FF]">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#F3F1F8]">Обратная связь</h2>
              <p className="text-xs text-[#9A94AA]">Помогите нам стать лучше</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#252233] rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="p-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <Sparkles className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-[#F3F1F8]">Успешно отправлено!</h3>
              <p className="text-sm text-[#9A94AA] max-w-xs">Спасибо за ваше обращение. Сообщение сохранено и передано администрации платформы.</p>
            </div>
            <button
              type="button"
              onClick={handleManualCloseSuccess}
              className="mt-2 px-6 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-colors"
            >
              Закрыть
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#9A94AA] uppercase tracking-wider">Тип обращения</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('SUGGESTION')}
                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                  type === 'SUGGESTION'
                    ? 'bg-purple-500/10 border-purple-500/30 text-[#AC82FF]'
                    : 'bg-[#191724] border-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]'
                }`}
              >
                <Lightbulb className={`w-5 h-5 ${type === 'SUGGESTION' ? 'text-purple-400' : ''}`} />
                Идея
              </button>
              <button
                type="button"
                onClick={() => setType('BUG')}
                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                  type === 'BUG'
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                    : 'bg-[#191724] border-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]'
                }`}
              >
                <AlertTriangle className={`w-5 h-5 ${type === 'BUG' ? 'text-orange-400' : ''}`} />
                Ошибка
              </button>
              <button
                type="button"
                onClick={() => setType('COMPLAINT')}
                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                  type === 'COMPLAINT'
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-[#191724] border-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]'
                }`}
              >
                <ShieldAlert className={`w-5 h-5 ${type === 'COMPLAINT' ? 'text-red-400' : ''}`} />
                Жалоба
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#9A94AA] uppercase tracking-wider">Подробное описание</label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === 'SUGGESTION' ? 'Опишите вашу идею по улучшению платформы...' :
                type === 'BUG' ? 'Где и при каких обстоятельствах возникла ошибка?' :
                'Опишите суть жалобы. Пожалуйста, укажите ссылки на контент, если применимо.'
              }
              className="w-full h-32 p-3 bg-[#0F0E12] border border-[#252233] rounded-xl text-sm text-[#F3F1F8] placeholder-[#656075] outline-none focus:border-[#9B6BFF] transition-colors resize-none custom-scrollbar"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#252233] transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !description.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#9B6BFF] text-white text-xs font-bold hover:bg-[#8B58F8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Отправка...' : 'Отправить'}
              {!isSubmitting && <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>)}
      </div>
    </div>
  );
};
