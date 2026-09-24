import React, { useEffect } from 'react';
import { X, Inbox, ChevronDown } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from './buttons.tsx';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionText?: string;
  actionLabel?: string;
  action?: React.ReactNode;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionText,
  actionLabel,
  action,
  onAction,
  className = '',
}) => {
  const finalActionLabel = actionText || actionLabel;

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-3xl bg-[#11152A]/60 border border-[#1E2442] space-y-3.5 my-4 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[#8B5CF6] shadow-inner">
        {icon || <Inbox className="w-6 h-6 text-[#64748B]" />}
      </div>

      <div className="max-w-md space-y-1">
        <h3 className="text-sm sm:text-base font-bold text-[#F8FAFC]">{title}</h3>
        {description && (
          <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {action && (
        <div className="pt-2">
          {action}
        </div>
      )}

      {!action && finalActionLabel && onAction && (
        <div className="pt-2">
          <PrimaryButton onClick={onAction} size="sm">
            {finalActionLabel}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
};

export interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div
      className={`animate-pulse bg-[#151932]/70 rounded-xl ${className}`}
    />
  );
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="rounded-2xl bg-[#11152A] border border-[#1E2442] p-2.5 space-y-3 animate-pulse">
      <div className="aspect-[2/3] w-full bg-[#151932] rounded-xl" />
      <div className="space-y-1.5 px-1">
        <div className="h-3.5 bg-[#151932] rounded w-3/4" />
        <div className="h-2.5 bg-[#151932]/70 rounded w-1/2" />
      </div>
    </div>
  );
};

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'lg',
  className = '',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
  }[maxWidth];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#080A18]/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidthClass} rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-2xl shadow-black/80 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div className="flex items-start justify-between p-4 sm:p-5 border-b border-[#1E2442] shrink-0 bg-[#11152A]">
            <div className="space-y-1 pr-6">
              {typeof title === 'string' ? (
                <h3 className="text-base sm:text-lg font-bold text-[#F8FAFC] tracking-tight">
                  {title}
                </h3>
              ) : (
                title
              )}
              {subtitle && <p className="text-xs text-[#94A3B8]">{subtitle}</p>}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] transition-colors"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-4 border-t border-[#1E2442] bg-[#11152A] flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface DropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: DropdownOption[];
  className?: string;
  size?: 'sm' | 'md';
}

export const Dropdown: React.FC<DropdownProps> = ({
  value,
  onChange,
  options,
  className = '',
  size = 'md',
}) => {
  const sizeClasses = size === 'sm' ? 'h-8 text-xs px-2.5' : 'h-10 text-xs px-3';

  return (
    <div className={`relative inline-block ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none rounded-xl bg-[#11152A] hover:bg-[#151932] text-[#F8FAFC] border border-[#1E2442] focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#8B5CF6] font-medium outline-none pr-8 cursor-pointer transition-colors ${sizeClasses}`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#11152A] text-[#F8FAFC]">
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B] pointer-events-none" />
    </div>
  );
};
