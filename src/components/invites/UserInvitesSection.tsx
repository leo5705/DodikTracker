import React, { useState, useEffect } from 'react';
import {
  Ticket,
  UserPlus,
  Copy,
  Check,
  Sparkles,
  Share2,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ExternalLink,
  Users,
  RefreshCw,
  Send,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface InviteCodeItem {
  id: number;
  code: string;
  isUsed: boolean;
  isActive: boolean;
  createdAt: string;
  usedAt: string | null;
  usedById: number | null;
  usedByUsername: string | null;
  usedByAvatar: string | null;
}

interface UserInvitesData {
  invitesLeft: number;
  totalLimit: number;
  totalCreated: number;
  activeCount: number;
  usedCount: number;
  canGenerate: boolean;
  isUnlimited: boolean;
  codes: InviteCodeItem[];
}

export const UserInvitesSection: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const [data, setData] = useState<UserInvitesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<number | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchInvites = async () => {
    try {
      setError(null);
      const res = await authFetch('/api/invites/my');
      if (!res.ok) {
        throw new Error('Не удалось загрузить данные об инвайтах');
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки инвайтов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await authFetch('/api/invites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Не удалось сгенерировать инвайт');
      }

      setSuccessMsg(`Новый инвайт-код успешно создан: ${json.invite.code}`);
      setTimeout(() => setSuccessMsg(null), 5000);
      await fetchInvites();
    } catch (err: any) {
      setError(err.message || 'Ошибка создания инвайта');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string, id: number, type: 'code' | 'link') => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCodeId(id);
      setTimeout(() => setCopiedCodeId(null), 2000);
    } else {
      setCopiedLinkId(id);
      setTimeout(() => setCopiedLinkId(null), 2000);
    }
  };

  const shareTelegram = (code: string) => {
    const inviteUrl = `${window.location.origin}/?invite=${code}`;
    const text = encodeURIComponent(`Привет! Присоединяйся ко мне на Dodik Tracker по личному инвайту:\n${inviteUrl}`);
    window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${text}`, '_blank');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <RefreshCw className="w-8 h-8 text-[#8B5CF6] animate-spin" />
        <span className="text-xs text-[#94A3B8] font-mono">Загрузка ваших приглашений...</span>
      </div>
    );
  }

  const isAdmin = data?.isUnlimited || dbUser?.role === 'ADMIN' || dbUser?.role === 'SUPER_ADMIN';
  const invitesLeft = data?.invitesLeft ?? 0;
  const totalCreated = data?.totalCreated ?? 0;
  const activeCount = data?.activeCount ?? 0;
  const usedCount = data?.usedCount ?? 0;
  const canGenerate = data?.canGenerate ?? false;
  const isLimitReached = !isAdmin && (invitesLeft <= 0 || totalCreated >= 3);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[#A78BFA] flex items-center justify-center shrink-0 mt-0.5">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#F8FAFC]">Мои приглашения</h2>
                {isAdmin ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-mono">
                    <ShieldCheck className="w-3 h-3" />
                    Admin Unlimited
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#151932] text-[#A78BFA] border border-[#1E2442] font-mono">
                    Лимит: 3 инвайта
                  </span>
                )}
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">
                Приглашайте друзей в Dodik Tracker. Каждый код можно использовать один раз.
              </p>
            </div>
          </div>

          <div>
            <button
              onClick={handleGenerate}
              disabled={generating || !canGenerate}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md cursor-pointer ${
                canGenerate
                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white shadow-[#7C3AED]/25 active:scale-[0.98]'
                  : 'bg-[#11152A] text-[#64748B] border border-[#1E2442] cursor-not-allowed opacity-70'
              }`}
            >
              {generating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Генерация...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {isLimitReached ? 'Лимит исчерпан (3 из 3)' : 'Сгенерировать инвайт'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#0B0D20] border border-[#1E2442]">
          <span className="text-[11px] font-semibold text-[#94A3B8] block mb-1">Доступно инвайтов</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-[#F8FAFC] tabular-nums">
              {isAdmin ? '∞' : invitesLeft}
            </span>
            {!isAdmin && (
              <span className="text-xs text-[#64748B]">из 3</span>
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0B0D20] border border-[#1E2442]">
          <span className="text-[11px] font-semibold text-[#94A3B8] block mb-1">Активные коды</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-emerald-400 tabular-nums">{activeCount}</span>
            <span className="text-xs text-[#64748B]">готовы к отправке</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0B0D20] border border-[#1E2442]">
          <span className="text-[11px] font-semibold text-[#94A3B8] block mb-1">Использовано</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-[#A78BFA] tabular-nums">{usedCount}</span>
            <span className="text-xs text-[#64748B]">друзей вступило</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0B0D20] border border-[#1E2442]">
          <span className="text-[11px] font-semibold text-[#94A3B8] block mb-1">Всего создано</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-[#F8FAFC] tabular-nums">{totalCreated}</span>
            {!isAdmin && (
              <span className="text-xs text-[#64748B]">/ 3 макс.</span>
            )}
          </div>
        </div>
      </div>

      {/* When Limit Reached Info */}
      {isLimitReached && (
        <div className="p-4 rounded-xl bg-[#11152A] border border-[#8B5CF6]/30 text-xs flex items-start gap-3">
          <div className="w-6 h-6 rounded-lg bg-[#8B5CF6]/20 text-[#A78BFA] flex items-center justify-center shrink-0 mt-0.5">
            <Lock className="w-3.5 h-3.5" />
          </div>
          <div className="space-y-0.5">
            <span className="font-bold text-[#F8FAFC]">Все инвайты использованы</span>
            <p className="text-[#94A3B8] leading-relaxed">
              Вы создали максимальное количество инвайтов (3 из 3). Если вам требуются дополнительные приглашения, обратитесь к администрации проекта.
            </p>
          </div>
        </div>
      )}

      {/* Invites List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
            Список ваших кодов ({data?.codes.length || 0})
          </h3>
          <button
            onClick={fetchInvites}
            className="text-[11px] text-[#A78BFA] hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Обновить
          </button>
        </div>

        {data?.codes.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#0B0D20] border border-dashed border-[#1E2442] text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#8B5CF6]/10 text-[#A78BFA] flex items-center justify-center mx-auto">
              <Ticket className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[#F8FAFC]">У вас пока нет созданных инвайтов</h4>
              <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
                Нажмите кнопку «Сгенерировать инвайт», чтобы получить персональный код и пригласить своего первого друга.
              </p>
            </div>
            {canGenerate && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md inline-flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Создать первый инвайт
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {data?.codes.map((item) => {
              const inviteUrl = `${window.location.origin}/?invite=${item.code}`;
              const isUsed = item.isUsed;
              const isDisabled = !item.isActive;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isUsed
                      ? 'bg-[#0B0D20]/60 border-[#1E2442] opacity-85'
                      : isDisabled
                      ? 'bg-[#0B0D20]/40 border-red-500/20 opacity-70'
                      : 'bg-[#0B0D20] border-[#1E2442] hover:border-[#8B5CF6]/40 shadow-sm'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Code & Status */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono text-sm font-bold tracking-wider text-[#F8FAFC] px-2.5 py-1 rounded-lg bg-[#11152A] border border-[#1E2442]">
                          {item.code}
                        </span>

                        {isUsed ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/30 flex items-center gap-1 font-mono">
                            <Check className="w-3 h-3" />
                            Использован
                          </span>
                        ) : isDisabled ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-500/15 text-red-300 border border-red-500/30 flex items-center gap-1 font-mono">
                            <AlertCircle className="w-3 h-3" />
                            Отключен
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Активен
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-[#94A3B8] flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#64748B]" />
                          Создан: {formatDate(item.createdAt)}
                        </span>

                        {isUsed && (
                          <span className="flex items-center gap-1 text-[#A78BFA]">
                            <Users className="w-3 h-3" />
                            Использован: {item.usedByUsername ? `@${item.usedByUsername}` : 'пользователем'} {item.usedAt ? `(${formatDate(item.usedAt)})` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    {!isUsed && !isDisabled && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => copyToClipboard(item.code, item.id, 'code')}
                          title="Скопировать код"
                          className="px-2.5 py-1.5 rounded-lg bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-semibold text-[#F8FAFC] transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          {copiedCodeId === item.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Скопирован</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-[#8B5CF6]" />
                              <span>Код</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => copyToClipboard(inviteUrl, item.id, 'link')}
                          title="Скопировать ссылку для регистрации"
                          className="px-2.5 py-1.5 rounded-lg bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-semibold text-[#F8FAFC] transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          {copiedLinkId === item.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Ссылка скопирована</span>
                            </>
                          ) : (
                            <>
                              <ExternalLink className="w-3.5 h-3.5 text-[#8B5CF6]" />
                              <span>Ссылка</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => shareTelegram(item.code)}
                          title="Отправить в Telegram"
                          className="p-1.5 rounded-lg bg-[#11152A] hover:bg-sky-500/20 border border-[#1E2442] hover:border-sky-500/40 text-sky-400 transition-colors cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rules & Help Card */}
      <div className="p-4 rounded-xl bg-[#0B0D20] border border-[#1E2442] space-y-2 text-xs">
        <h4 className="font-bold text-[#F8FAFC] flex items-center gap-1.5">
          <Ticket className="w-4 h-4 text-[#8B5CF6]" />
          Как работает система инвайтов
        </h4>
        <ul className="space-y-1.5 text-[#94A3B8] list-disc list-inside">
          <li>Каждый зарегистрированный пользователь получает <strong>3 персональных инвайта</strong>.</li>
          <li>Инвайт-код одноразовый: после того как приглашённый создаст аккаунт, код отмечается как использованный.</li>
          <li>Вы увидите имя пользователя, который воспользовался вашим приглашением, а также получите уведомление.</li>
          <li>Поделиться можно как текстовым кодом, так и готовой ссылкой для быстрой регистрации.</li>
        </ul>
      </div>
    </div>
  );
};
