import React, { useEffect } from 'react';
import {
  Trophy,
  UserPlus,
  UserCheck,
  MessageSquare,
  Star,
  Zap,
  Film,
  AtSign,
  ShieldAlert,
  Info,
  Heart,
  MessageCircle,
  X,
  ExternalLink,
  ListOrdered,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppNotification } from '../../types/notification.ts';

export interface ActiveToast {
  id: string;
  notification: AppNotification;
  createdAt: number;
}

interface NotificationToastProps {
  toast: ActiveToast;
  onClose: (id: string) => void;
  onAction?: (notification: AppNotification) => void;
}

export const getNotificationVisuals = (type: string) => {
  switch (type) {
    case 'ACHIEVEMENT_UNLOCKED':
      return {
        icon: Trophy,
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        borderColor: 'border-amber-500/40',
        gradient: 'from-amber-950/40 to-[#14131A]',
        categoryName: 'Достижение',
      };
    case 'FRIEND_REQUEST':
      return {
        icon: UserPlus,
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        borderColor: 'border-emerald-500/40',
        gradient: 'from-emerald-950/40 to-[#14131A]',
        categoryName: 'Заявка в друзья',
      };
    case 'FRIEND_ACCEPTED':
      return {
        icon: UserCheck,
        badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
        borderColor: 'border-teal-500/40',
        gradient: 'from-teal-950/40 to-[#14131A]',
        categoryName: 'Дружба принята',
      };
    case 'NEW_MESSAGE':
      return {
        icon: MessageSquare,
        badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
        borderColor: 'border-sky-500/40',
        gradient: 'from-sky-950/40 to-[#14131A]',
        categoryName: 'Сообщение',
      };
    case 'FRIEND_REVIEW':
      return {
        icon: Star,
        badgeColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
        borderColor: 'border-yellow-500/40',
        gradient: 'from-yellow-950/40 to-[#14131A]',
        categoryName: 'Отзыв друга',
      };
    case 'FRIEND_ACTIVITY':
      return {
        icon: Zap,
        badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
        borderColor: 'border-violet-500/40',
        gradient: 'from-violet-950/40 to-[#14131A]',
        categoryName: 'Активность друга',
      };
    case 'NEW_RELEASE':
      return {
        icon: Film,
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
        borderColor: 'border-indigo-500/40',
        gradient: 'from-indigo-950/40 to-[#14131A]',
        categoryName: 'Новый релиз',
      };
    case 'MENTION':
      return {
        icon: AtSign,
        badgeColor: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
        borderColor: 'border-pink-500/40',
        gradient: 'from-pink-950/40 to-[#14131A]',
        categoryName: 'Упоминание',
      };
    case 'ADMIN_ALERT':
      return {
        icon: ShieldAlert,
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        borderColor: 'border-rose-500/40',
        gradient: 'from-rose-950/40 to-[#14131A]',
        categoryName: 'Оповещение администрации',
      };
    case 'LIKE':
      return {
        icon: Heart,
        badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
        borderColor: 'border-red-500/40',
        gradient: 'from-red-950/40 to-[#14131A]',
        categoryName: 'Лайк',
      };
    case 'COMMENT':
      return {
        icon: MessageCircle,
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
        borderColor: 'border-cyan-500/40',
        gradient: 'from-cyan-950/40 to-[#14131A]',
        categoryName: 'Комментарий',
      };
    case 'LIST_INVITE':
      return {
        icon: ListOrdered,
        badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        borderColor: 'border-purple-500/40',
        gradient: 'from-purple-950/40 to-[#14131A]',
        categoryName: 'Приглашение в список',
      };
    case 'LIST_INVITE_ACCEPTED':
      return {
        icon: UserCheck,
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        borderColor: 'border-emerald-500/40',
        gradient: 'from-emerald-950/40 to-[#14131A]',
        categoryName: 'Приглашение принято',
      };
    case 'LIST_INVITE_DECLINED':
      return {
        icon: X,
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        borderColor: 'border-rose-500/40',
        gradient: 'from-rose-950/40 to-[#14131A]',
        categoryName: 'Приглашение отклонено',
      };
    default:
      return {
        icon: Info,
        badgeColor: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
        borderColor: 'border-[#3A344E]',
        gradient: 'from-zinc-900/40 to-[#14131A]',
        categoryName: 'Уведомление',
      };
  }
};

export const NotificationToastItem: React.FC<NotificationToastProps> = ({
  toast,
  onClose,
  onAction,
}) => {
  const notif = toast.notification;
  const visuals = getNotificationVisuals(notif.type);
  const IconComponent = visuals.icon;

  useEffect(() => {
    // Auto dismiss after 6.5 seconds
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 6500);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const handleClick = () => {
    if (onAction) {
      onAction(notif);
    }
    onClose(toast.id);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -15, scale: 0.95 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onClick={handleClick}
      className={`relative group w-80 sm:w-96 rounded-2xl bg-gradient-to-b ${visuals.gradient} bg-[#14131A] border ${visuals.borderColor} p-4 shadow-xl shadow-black/50 cursor-pointer overflow-hidden backdrop-blur-md hover:border-opacity-100 transition-all`}
    >
      {/* Top decorative glow */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="flex items-start gap-3">
        {/* Avatar or Icon */}
        <div className="relative shrink-0">
          {notif.senderAvatar ? (
            <img
              src={notif.senderAvatar}
              alt=""
              className="w-10 h-10 rounded-xl object-cover border border-[#2E2A40]"
            />
          ) : (
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${visuals.badgeColor}`}>
              <IconComponent className="w-5 h-5" />
            </div>
          )}
          {notif.senderAvatar && (
            <div className={`absolute -bottom-1 -right-1 p-0.5 rounded-full border ${visuals.badgeColor}`}>
              <IconComponent className="w-2.5 h-2.5" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border ${visuals.badgeColor}`}>
              {visuals.categoryName}
            </span>
            <span className="text-[10px] text-[#7A748E]">
              только что
            </span>
          </div>

          <h4 className="text-xs font-bold text-white tracking-tight truncate">
            {notif.title}
          </h4>

          <p className="text-xs text-[#C5C0D6] leading-relaxed line-clamp-2">
            {notif.body || notif.content}
          </p>
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose(toast.id);
          }}
          className="p-1 rounded-lg text-[#7A748E] hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Action cue */}
      {notif.link && (
        <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-[#A69FB8] group-hover:text-white transition-colors">
          <span>Нажмите, чтобы открыть</span>
          <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
        </div>
      )}
    </motion.div>
  );
};

export const NotificationToastContainer: React.FC<{
  toasts: ActiveToast[];
  onClose: (id: string) => void;
  onAction?: (notification: AppNotification) => void;
}> = ({ toasts, onClose, onAction }) => {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 pointer-events-none max-w-[calc(100vw-32px)]">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <NotificationToastItem
              toast={toast}
              onClose={onClose}
              onAction={onAction}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
};
