import React, { useState, useEffect } from 'react';
import { Lock, CheckCircle2, AlertCircle, Loader2, ArrowLeft, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';

interface ResetPasswordViewProps {
  token: string;
}

export const ResetPasswordView: React.FC<ResetPasswordViewProps> = ({ token }) => {
  const { navigate } = useRouter();
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [username, setUsername] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    const validateToken = async () => {
      try {
        const res = await fetch(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setValid(true);
          setUsername(data.username || '');
        } else {
          setValid(false);
          setErrorMessage(data.error || 'Ссылка недействительна или устарела');
        }
      } catch (err: any) {
        setValid(false);
        setErrorMessage('Ошибка проверки ссылки для сброса пароля');
      } finally {
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setErrorMessage('Пароль должен содержать не менее 6 символов');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Пароли не совпадают');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitSuccess(true);
      } else {
        setErrorMessage(data.error || 'Не удалось обновить пароль');
      }
    } catch (err) {
      setErrorMessage('Ошибка соединения с сервером');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080A18] flex flex-col items-center justify-center p-4 selection:bg-[#8B5CF6]/30 selection:text-white">
      <div className="w-full max-w-md bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 flex items-center justify-center mx-auto text-[#A78BFA]">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-[#F8FAFC] tracking-tight">Сброс пароля</h1>
          <p className="text-xs text-[#94A3B8]">
            {username ? `Установите новый пароль для аккаунта @${username}` : 'Установка нового пароля'}
          </p>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-[#94A3B8]">
            <Loader2 className="w-6 h-6 animate-spin text-[#8B5CF6]" />
            <span className="text-xs font-mono">Проверка ссылки...</span>
          </div>
        ) : submitSuccess ? (
          <div className="space-y-4 py-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#F8FAFC]">Пароль успешно изменен!</h3>
              <p className="text-xs text-[#94A3B8]">
                Теперь вы можете войти в систему с новым паролем.
              </p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[#7C3AED]/25 cursor-pointer"
            >
              Перейти ко входу
            </button>
          </div>
        ) : !valid ? (
          <div className="space-y-4 py-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-950/60 border border-rose-800/60 flex items-center justify-center mx-auto text-rose-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-rose-300">Ссылка недействительна</h3>
              <p className="text-xs text-[#94A3B8] max-w-xs mx-auto">
                {errorMessage || 'Срок действия ссылки истек или она уже была использована.'}
              </p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-medium text-[#F8FAFC] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Вернуться на главную
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-center gap-2.5 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#94A3B8] block">Новый пароль</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  required
                  minLength={6}
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#CBD5E1] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#94A3B8] block">Повторите новый пароль</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Повторите пароль"
                  required
                  minLength={6}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[#7C3AED]/25 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Сохранение...</span>
                </>
              ) : (
                <span>Установить пароль</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-2 text-center text-xs text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            >
              Отмена
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
