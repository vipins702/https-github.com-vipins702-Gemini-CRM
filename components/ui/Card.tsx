import React from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  variant?: 'default' | 'glass' | 'gradient' | 'bordered';
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  children,
  className = '',
  action,
  variant = 'default',
  noPadding = false
}) => {
  const baseStyles = "rounded-2xl overflow-hidden";

  const variants = {
    default: "bg-white border border-slate-200/70 shadow-[var(--elev-2)]",
    glass: "glass-card",
    gradient: "bg-gradient-to-br from-indigo-500 to-violet-600 text-white border-0 shadow-[var(--elev-3)]",
    bordered: "bg-white border border-slate-200 transition-colors duration-200 hover:border-slate-300",
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`}>
      {title && (
        <div className={`px-5 py-4 border-b ${variant === 'gradient' ? 'border-white/20' : 'border-slate-100'} flex justify-between items-center gap-3`}>
          <div className="min-w-0">
            <h3 className={`text-[15px] font-semibold tracking-tight truncate ${variant === 'gradient' ? 'text-white' : 'text-slate-900'}`}>
              {title}
            </h3>
            {subtitle && (
              <p className={`text-xs mt-0.5 truncate ${variant === 'gradient' ? 'text-white/70' : 'text-slate-500'}`}>{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5'}>
        {children}
      </div>
    </div>
  );
};
