import React from 'react';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children, className = '' }) => {
  return (
    <div className={`tooltip-wrapper ${className}`}>
      {children}
      <div className="tooltip-content">{text}</div>
    </div>
  );
};
