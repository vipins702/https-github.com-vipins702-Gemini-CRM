import React from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  variant?: 'default' | 'glass' | 'showcase' | 'gradient' | 'bordered';
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
  const baseStyles = "overflow-hidden";

  const variants = {
    // WORK surface — flat white, light elevation (default for data screens)
    default: "glass-work",
    bordered: "rounded-2xl bg-white border border-[var(--border)] transition-colors duration-200 hover:border-slate-300",
    // Standard data card — flat white, hairline border
    glass: "glass-showcase",
    showcase: "glass-showcase",
    // Accent (blue job)
    gradient: "rounded-2xl bg-[linear-gradient(135deg,#1E40AF_0%,#2563EB_55%,#3B82F6_100%)] text-white border-0 shadow-[var(--elev-3)]",
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`}>
      {title && (
        <div className={`px-5 py-4 border-b ${variant === 'gradient' ? 'border-white/20' : 'border-[var(--border-subtle)]'} flex justify-between items-center gap-3`}>
          <div className="min-w-0">
            <h3 className={`font-heading text-[15px] font-bold tracking-tight truncate ${variant === 'gradient' ? 'text-white' : 'text-ink'}`}>
              {title}
            </h3>
            {subtitle && (
              <p className={`text-xs mt-0.5 truncate ${variant === 'gradient' ? 'text-white/70' : 'text-ink-muted'}`}>{subtitle}</p>
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
