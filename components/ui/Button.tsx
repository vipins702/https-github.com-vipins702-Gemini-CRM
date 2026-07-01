import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  icon,
  loading = false,
  disabled,
  ...props
}) => {
  const baseStyles = "inline-flex items-center justify-center font-semibold rounded-full transition-[background-color,box-shadow,transform,filter] duration-200 [transition-timing-function:cubic-bezier(.22,1,.36,1)] focus:outline-none disabled:opacity-50 disabled:pointer-events-none [touch-action:manipulation] select-none active:translate-y-0 tnum";

  const variants = {
    primary: "btn-tri-primary",
    secondary: "btn-glass",
    outline: "btn-glass",
    danger: "text-white border border-[#DC2626]/40 bg-[linear-gradient(180deg,#ef4444,#DC2626)] shadow-[0_10px_22px_-10px_rgba(220,38,38,0.7),inset_0_1px_0_rgba(255,255,255,0.4)] hover:brightness-[1.05] hover:-translate-y-px",
    ghost: "text-ink-soft hover:bg-white/60 hover:text-ink",
    gradient: "btn-tri-primary",
  };

  const sizes = {
    sm: "h-8 px-3.5 text-[13px] gap-1.5",
    md: "h-10 px-[18px] text-sm gap-2",
    lg: "h-11 px-[22px] text-[15px] gap-2",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : icon ? (
        <span className="-ml-0.5">{icon}</span>
      ) : null}
      {children}
    </button>
  );
};
