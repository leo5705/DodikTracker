import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export const PrimaryButton: React.FC<ButtonProps> = ({
  children,
  className = '',
  loading = false,
  disabled,
  size = 'md',
  icon,
  ...props
}) => {
  const sizeClasses = {
    sm: 'h-9 px-3.5 text-xs font-semibold gap-2 rounded-xl',
    md: 'h-11 px-5 text-sm font-semibold gap-2.5 rounded-xl',
    lg: 'h-12 px-6 text-base font-bold gap-3 rounded-2xl',
  }[size];

  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer select-none active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25 hover:shadow-lg hover:shadow-[#7C3AED]/35 hover:brightness-110 border border-violet-400/20 whitespace-nowrap ${sizeClasses} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      <span>{children}</span>
    </button>
  );
};

export const SecondaryButton: React.FC<ButtonProps> = ({
  children,
  className = '',
  loading = false,
  disabled,
  size = 'md',
  icon,
  ...props
}) => {
  const sizeClasses = {
    sm: 'h-9 px-3.5 text-xs font-semibold gap-2 rounded-xl',
    md: 'h-11 px-5 text-sm font-semibold gap-2.5 rounded-xl',
    lg: 'h-12 px-6 text-base font-bold gap-3 rounded-2xl',
  }[size];

  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer select-none active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none bg-[#151932] hover:bg-[#191D38] text-[#F8FAFC] hover:text-white border border-[#1E2442] hover:border-[#2E3660] shadow-sm whitespace-nowrap ${sizeClasses} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin text-[#94A3B8]" /> : icon}
      <span>{children}</span>
    </button>
  );
};

export const DestructiveButton: React.FC<ButtonProps> = ({
  children,
  className = '',
  loading = false,
  disabled,
  size = 'md',
  icon,
  ...props
}) => {
  const sizeClasses = {
    sm: 'h-9 px-3.5 text-xs font-semibold gap-2 rounded-xl',
    md: 'h-11 px-5 text-sm font-semibold gap-2.5 rounded-xl',
    lg: 'h-12 px-6 text-base font-bold gap-3 rounded-2xl',
  }[size];

  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer select-none active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-100 border border-rose-800/40 hover:border-rose-700/60 whitespace-nowrap ${sizeClasses} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      <span>{children}</span>
    </button>
  );
};

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  variant?: 'panel' | 'ghost' | 'violet';
  children: React.ReactNode;
}

export const IconButton: React.FC<IconButtonProps> = ({
  size = 'md',
  active = false,
  variant = 'panel',
  className = '',
  disabled,
  children,
  ...props
}) => {
  const sizeClasses = {
    sm: 'w-9 h-9 rounded-xl',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-12 h-12 rounded-2xl',
  }[size];

  const variantClasses = {
    panel: active
      ? 'bg-[#191D38] text-[#A78BFA] border border-[#8B5CF6]/40 shadow-sm'
      : 'bg-[#11152A] hover:bg-[#151932] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2442] hover:border-[#2E3660]',
    ghost: active
      ? 'bg-[#151932] text-[#A78BFA]'
      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932]',
    violet: active
      ? 'bg-[#7C3AED] text-white shadow-md shadow-violet-950/40'
      : 'bg-violet-500/10 hover:bg-violet-500/20 text-[#A78BFA] hover:text-white border border-violet-500/20',
  }[variant];

  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center transition-all duration-150 cursor-pointer select-none active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
