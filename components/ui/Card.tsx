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
    // White card with soft shadow (graphite in dark mode) — default for data screens
    default: "glass-showcase",
    bordered: "rounded-2xl bg-surface border border-gray-200 transition-colors duration-200 hover:border-gray-300",
    glass: "glass-showcase",
    showcase: "glass-showcase",
    // Accent highlight card
    gradient: "rounded-2xl bg-gradient-to-b from-accent-500 to-accent-600 text-white border-0 shadow-[var(--elev-3)]",
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`}>
      {title && (
        <div className={`px-5 py-4 border-b ${variant === 'gradient' ? 'border-white/20' : 'border-gray-100'} flex justify-between items-center gap-3`}>
          <div className="min-w-0">
            <h3 className={`font-heading text-[17px] font-semibold tracking-tight truncate ${variant === 'gradient' ? 'text-white' : 'text-ink'}`}>
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
