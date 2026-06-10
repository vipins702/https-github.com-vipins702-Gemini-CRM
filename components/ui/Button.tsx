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
  const baseStyles = "inline-flex items-center justify-center font-medium rounded-lg transition-[background-color,box-shadow,transform,filter] duration-150 ease-out focus:outline-none disabled:opacity-50 disabled:pointer-events-none [touch-action:manipulation] select-none active:scale-[0.985] tnum";

  const variants = {
    primary: "btn-primary-brand text-white shadow-[var(--elev-1)] hover:brightness-[1.07]",
    secondary: "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 shadow-[var(--elev-1)]",
    outline: "bg-transparent text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:ring-slate-400",
    danger: "bg-rose-600 text-white shadow-[var(--elev-1)] hover:bg-rose-700",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    gradient: "btn-gradient text-white shadow-[var(--elev-1)] hover:brightness-[1.07]",
  };

  const sizes = {
    sm: "h-8 px-3 text-[13px] gap-1.5",
    md: "h-10 px-4 text-sm gap-2",
    lg: "h-11 px-5 text-[15px] gap-2",
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
