import React from 'react';
import { Search, X, ChevronRight } from 'lucide-react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string; onClick?: () => void }>;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
  badge,
  className = '',
}) => {
  return (
    <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#1E2442] mb-7 ${className}`}>
      <div className="space-y-2 min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-2 text-xs sm:text-sm text-[#64748B] mb-1 font-medium">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-[#1E2442]" />}
                {crumb.onClick ? (
                  <button
                    onClick={crumb.onClick}
                    className="hover:text-[#A78BFA] transition-colors truncate cursor-pointer"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className={idx === breadcrumbs.length - 1 ? 'text-[#94A3B8] font-semibold' : ''}>
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-3.5 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F8FAFC]">
            {title}
          </h1>
          {badge}
        </div>

        {subtitle && (
          <p className="text-sm sm:text-base text-[#94A3B8] max-w-3xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
};

export interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  count?: number | string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
  count,
  actionText,
  onAction,
  className = '',
  children,
}) => {
  return (
    <div className={`flex items-center justify-between gap-3.5 mb-4 ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className="text-[#8B5CF6] shrink-0 text-base">{icon}</span>}
        <h2 className="text-base sm:text-lg font-bold text-[#F8FAFC] tracking-tight truncate">
          {title}
        </h2>
        {count !== undefined && (
          <span className="text-xs sm:text-sm font-mono font-bold px-2.5 py-0.5 rounded-lg bg-[#151932] text-[#A78BFA] border border-[#1E2442]">
            {count}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {children}
        {actionText && onAction && (
          <button
            onClick={onAction}
            className="text-xs sm:text-sm font-semibold text-[#A78BFA] hover:text-white hover:underline transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>{actionText}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export interface SearchBarProps {
  value: string;
  onChange: (val: string) => void;
  onSearch?: (val: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  onSearch,
  onClear,
  placeholder = 'Поиск по фильмам, сериалам, играм, книгам...',
  className = '',
  autoFocus = false,
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) onSearch(value);
  };

  return (
    <form onSubmit={handleSubmit} className={`relative flex items-center w-full ${className}`}>
      <Search className="absolute left-4 w-4.5 h-4.5 text-[#64748B] pointer-events-none" />
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 sm:h-12 pl-11 pr-10 rounded-xl bg-[#11152A] hover:bg-[#151932] focus:bg-[#11152A] text-sm sm:text-base text-[#F8FAFC] placeholder-[#64748B] border border-[#1E2442] focus:border-[#8B5CF6]/80 focus:ring-2 focus:ring-[#8B5CF6]/20 transition-all outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            if (onClear) onClear();
          }}
          className="absolute right-3 p-1.5 rounded-lg text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#151932] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </form>
  );
};

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
  size = 'md',
}) => {
  return (
    <div
      className={`inline-flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] overflow-x-auto max-w-full custom-scrollbar ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const padClasses = size === 'sm' ? 'px-3 py-1.5 text-xs font-semibold' : 'px-4.5 py-2.5 text-xs sm:text-sm font-bold';

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 rounded-xl transition-all duration-150 whitespace-nowrap cursor-pointer select-none ${padClasses} ${
              isActive
                ? 'bg-[#151932] text-[#F8FAFC] border border-[#8B5CF6]/50 shadow-sm text-shadow-sm'
                : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#11152A] border border-transparent'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-[#8B5CF6]/20 text-[#C4B5FD]' : 'bg-[#151932] text-[#64748B]'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({ children, className = '' }) => {
  return (
    <div
      className={`flex flex-wrap items-center gap-2.5 p-2.5 rounded-2xl bg-[#11152A] border border-[#1E2442] mb-6 ${className}`}
    >
      {children}
    </div>
  );
};
