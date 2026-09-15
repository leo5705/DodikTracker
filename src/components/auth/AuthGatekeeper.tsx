import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  KeyRound,
  User,
  Ticket,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export const AuthGatekeeper: React.FC = () => {
  const { loginGoogle, loginPassword, registerPassword, loginTelegram, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<'LOGIN' | 'REGISTER' | 'TELEGRAM'>('LOGIN');
  const [regMode, setRegMode] = useState<string>('OPEN');
  const [loadingMode, setLoadingMode] = useState(true);

  // Form states
  const [identifier, setIdentifier] = useState(''); // email or username
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);

  // Telegram state
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [tgBotConfigured, setTgBotConfigured] = useState<boolean | null>(null);
  const [tgBotUsername, setTgBotUsername] = useState<string>('DodikTrackerBot');
  const [tgBotUrl, setTgBotUrl] = useState<string>('https://t.me/DodikTrackerBot');
  const [tgInviteCode, setTgInviteCode] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchMode = async () => {
      try {
        const res = await fetch('/api/auth/registration-mode');
        if (res.ok) {
          const data = await res.json();
          setRegMode(data.mode || 'INVITE_ONLY');
        }
      } catch (err) {
        console.error('Failed to load registration mode:', err);
      } finally {
        setLoadingMode(false);
      }
    };
    fetchMode();

    // Check URL search parameters for invite code
    const urlParams = new URLSearchParams(window.location.search);
    const urlInvite = urlParams.get('invite') || urlParams.get('code');
    if (urlInvite) {
      const code = urlInvite.trim().toUpperCase();
      setInviteCode(code);
      setTgInviteCode(code);
      setTab('REGISTER');
    }
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;

    setSubmitting(true);
    setError(null);
    try {
      await loginPassword(identifier.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Ошибка входа');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setPopupBlocked(false);
    try {
      await loginGoogle();
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-blocked' ||
        err?.message?.includes('popup-blocked') ||
        err?.message?.includes('auth/popup-blocked')
      ) {
        setPopupBlocked(true);
        setError('Браузер заблокировал всплывающее окно авторизации Google. Нажмите кнопку ниже, чтобы открыть приложение в новой вкладке, или воспользуйтесь входом по паролю / Telegram.');
      } else if (err.message && err.message.includes('Pending promise was never set')) {
        // Ignore this internal assertion
      } else {
        setError(err.message || 'Ошибка входа через Google');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regMode === 'CLOSED' || regMode === 'MAINTENANCE') {
      setError('Регистрация временно закрыта.');
      return;
    }
    if (regMode === 'INVITE_ONLY' && !inviteCode.trim()) {
      setError('Для регистрации требуется действующий инвайт-код.');
      return;
    }
    if (!password || !username.trim()) {
      setError('Заполните все обязательные поля');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await registerPassword(username.trim(), password, inviteCode.trim() || undefined);
    } catch (err: any) {
      setError(err.message || 'Ошибка регистрации');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestTelegramCode = async () => {
    setTgLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/telegram/request-code', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.configured) {
        setTgCode(data.code);
        setTgBotConfigured(true);
        if (data.botUsername) setTgBotUsername(data.botUsername);
        if (data.botUrl) setTgBotUrl(data.botUrl);
      } else {
        setTgBotConfigured(false);
        if (data.botUsername) setTgBotUsername(data.botUsername);
        setError(data.error || 'Telegram-бот сейчас не настроен или выключен. Воспользуйтесь входом по паролю или Google.');
      }
    } catch (err: any) {
      setTgBotConfigured(false);
      setError(err.message || 'Ошибка подключения к серверу авторизации');
    } finally {
      setTgLoading(false);
    }
  };

  const handleVerifyTelegram = async () => {
    if (!tgCode) return;
    setTgLoading(true);
    setError(null);
    try {
      await loginTelegram(tgCode, undefined, tgInviteCode.trim() || undefined);
    } catch (err: any) {
      setError(err.message || 'Авторизация ещё не подтверждена в Telegram-боте');
    } finally {
      setTgLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0A090D] text-[#F3F1F8] flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-purple-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#191724] border border-[#2E2A40] text-xs text-[#AC82FF] font-medium shadow-inner">
            <Lock className="w-3.5 h-3.5" />
            <span>Закрытый трекер медиа</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#F3F1F8] font-mono">
            DODIK TRACKER
          </h1>

          <p className="text-xs text-[#9A94AA] max-w-xs mx-auto leading-relaxed">
            Вход доступен только зарегистрированным участникам сообщества.
          </p>
        </div>

        {/* Status Mode Badge */}
        {!loadingMode && (
          <div className="text-center">
            {regMode === 'OPEN' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Свободная регистрация открыта
              </span>
            )}
            {regMode === 'INVITE_ONLY' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium bg-purple-500/10 border border-purple-500/30 text-[#AC82FF]">
                <Ticket className="w-3 h-3" />
                Регистрация только по инвайт-кодам
              </span>
            )}
            {regMode === 'CLOSED' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Shield className="w-3 h-3" />
                Новая регистрация закрыта администрацией
              </span>
            )}
            {regMode === 'MAINTENANCE' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <AlertCircle className="w-3 h-3" />
                Технические работы. Вход только для администраторов.
              </span>
            )}
          </div>
        )}

        {/* Main Auth Card */}
        <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] shadow-2xl space-y-5">
          {/* Tabs */}
          <div className="flex rounded-2xl bg-[#0F0E12] p-1 border border-[#252233]">
            <button
              onClick={() => {
                setTab('LOGIN');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                tab === 'LOGIN'
                  ? 'bg-[#9B6BFF] text-white shadow-md'
                  : 'text-[#9A94AA] hover:text-[#F3F1F8]'
              }`}
            >
              Вход
            </button>
            <button
              onClick={() => {
                setTab('REGISTER');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                tab === 'REGISTER'
                  ? 'bg-[#9B6BFF] text-white shadow-md'
                  : 'text-[#9A94AA] hover:text-[#F3F1F8]'
              }`}
            >
              Регистрация
            </button>
            <button
              onClick={() => {
                setTab('TELEGRAM');
                setError(null);
                if (!tgCode) handleRequestTelegramCode();
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                tab === 'TELEGRAM'
                  ? 'bg-[#9B6BFF] text-white shadow-md'
                  : 'text-[#9A94AA] hover:text-[#F3F1F8]'
              }`}
            >
              Telegram
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: LOGIN */}
          {tab === 'LOGIN' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#9A94AA]">Email или Username</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9A94AA]" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="vasya или user@example.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-[#AC82FF]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#9A94AA]">Пароль</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9A94AA]" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-[#AC82FF]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-all shadow-lg shadow-purple-950/50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Войти в аккаунт'}
              </button>
            </form>
          )}

          {/* TAB 2: REGISTER */}
          {tab === 'REGISTER' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#9A94AA]">Желаемый Username</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9A94AA]" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="dodik_master"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-[#AC82FF]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#9A94AA]">Пароль</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9A94AA]" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Минимум 6 символов"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-[#AC82FF]"
                  />
                </div>
              </div>

              {regMode === 'INVITE_ONLY' ? (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#AC82FF] flex items-center gap-1">
                    <Ticket className="w-3.5 h-3.5" />
                    Инвайт-код (обязательно)
                  </label>
                  <input
                    type="text"
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="Например: DODIK-X79K2L"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#191724] border border-[#AC82FF]/40 text-xs font-mono text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-[#AC82FF]"
                  />
                </div>
              ) : regMode === 'OPEN' ? (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#9A94AA] flex items-center gap-1">
                    <Ticket className="w-3.5 h-3.5" />
                    Инвайт-код (если есть)
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="Необязательно (например: DODIK-X79K2L)"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs font-mono text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-[#AC82FF]"
                  />
                </div>
              ) : null}

              {regMode === 'CLOSED' || regMode === 'MAINTENANCE' ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-center">
                  {regMode === 'MAINTENANCE' ? 'Регистрация отключена на время проведения технических работ.' : 'Регистрация новых участников временно приостановлена.'}
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-all shadow-lg shadow-purple-950/50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Зарегистрироваться'}
                </button>
              )}
            </form>
          )}

          {/* TAB 3: TELEGRAM */}
          {tab === 'TELEGRAM' && (
            <div className="space-y-4">
              <p className="text-xs text-[#9A94AA] text-center leading-relaxed">
                Быстрый и защищённый вход через Telegram-бота. Не требует ввода пароля.
              </p>

              {tgBotConfigured === false ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-3 text-center">
                  <AlertCircle className="w-6 h-6 mx-auto text-amber-400" />
                  <p className="font-medium">
                    Telegram-бот ещё не подключен или не настроен администратором.
                  </p>
                  <p className="text-[11px] text-amber-200/80">
                    Пожалуйста, выполните вход с помощью имени пользователя и пароля или через Google.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('LOGIN');
                      setError(null);
                    }}
                    className="w-full py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold border border-amber-500/30 transition-colors"
                  >
                    Перейти к обычному входу
                  </button>
                </div>
              ) : tgLoading && !tgCode ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-[#9A94AA] text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-[#AC82FF]" />
                  <span>Подключение к Telegram-боту...</span>
                </div>
              ) : tgCode ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-[#191724] border border-[#2E2A40] space-y-3 text-center">
                    <p className="text-[11px] text-[#9A94AA] uppercase font-semibold">Ваш одноразовый код:</p>
                    <div className="text-3xl font-mono font-black text-[#AC82FF] tracking-widest">
                      {tgCode}
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      <a
                        href={tgBotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2 px-3 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 hover:text-sky-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Открыть @{tgBotUsername}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>

                      <button
                        type="button"
                        onClick={() => copyToClipboard(`/login ${tgCode}`)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#252233] hover:bg-[#2E2A40] text-xs font-mono text-[#D5D0E3] transition-colors"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>/login {tgCode}</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#14131A] p-3 border border-[#252233] text-[11px] text-[#9A94AA] space-y-1">
                    <p className="text-[#F3F1F8] font-medium">Инструкция:</p>
                    <p>1. Нажмите «Открыть @{tgBotUsername}» или отправьте команду <span className="text-white font-mono">/login {tgCode}</span> боту.</p>
                    <p>2. Дождитесь подтверждения от бота в Telegram.</p>
                    <p>3. Нажмите кнопку «Проверить авторизацию» ниже.</p>
                  </div>

                  {regMode === 'INVITE_ONLY' && (
                    <div className="space-y-1 text-left">
                      <label className="text-[11px] font-medium text-[#9A94AA] flex items-center gap-1">
                        <Ticket className="w-3 h-3 text-[#AC82FF]" />
                        <span>Инвайт-код (если регистрируетесь впервые)</span>
                      </label>
                      <input
                        type="text"
                        value={tgInviteCode}
                        onChange={(e) => setTgInviteCode(e.target.value.toUpperCase())}
                        placeholder="Например: DODIK-..."
                        className="w-full px-3 py-2 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-[#AC82FF]"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleVerifyTelegram}
                    disabled={tgLoading}
                    className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-sky-950/40 flex items-center justify-center gap-2"
                  >
                    {tgLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Проверить авторизацию</span>
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={handleRequestTelegramCode}
                      className="text-[11px] text-[#6B667B] hover:text-[#9A94AA] transition-colors"
                    >
                      Получить новый код
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestTelegramCode}
                  className="w-full py-2.5 rounded-xl bg-[#191724] hover:bg-[#252233] text-xs font-bold text-[#F3F1F8] border border-[#2E2A40] transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4 text-sky-400" />
                  <span>Получить код входа</span>
                </button>
              )}
            </div>
          )}

          {/* Google Divider & Button */}
          <div className="pt-2 border-t border-[#252233] space-y-3">
            <div className="relative text-center">
              <span className="bg-[#14131A] px-2 text-[10px] text-[#6B667B] uppercase tracking-wider font-semibold">
                или через Google
              </span>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={authLoading || submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-[#191724] hover:bg-[#1E1C29] text-xs font-semibold text-[#F3F1F8] border border-[#2E2A40] hover:border-[#3A344E] transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.04h3.88c2.27-2.09 3.66-5.17 3.66-9.14z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.04c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.28c-.25-.72-.38-1.49-.38-2.28s.13-1.56.38-2.28V6.59H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.41l4.03-3.13z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.59l4.03 3.13c.95-2.83 3.6-4.97 6.72-4.97z"
                />
              </svg>
              <span>Войти в один клик через Google</span>
            </button>

            {popupBlocked && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 px-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-[#AC82FF] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Открыть приложение в новой вкладке</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[10px] text-[#6B667B]">
          Dodik Tracker &bull; Закрытое медиа-сообщество &bull; 2026
        </p>
      </div>
    </div>
  );
};
