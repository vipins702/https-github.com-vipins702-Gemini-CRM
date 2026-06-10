import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'heading' | 'circle' | 'card' | 'table-row';
  count?: number;
}

const variantClasses: Record<string, string> = {
  text: 'skeleton skeleton-text w-full',
  heading: 'skeleton skeleton-heading',
  circle: 'skeleton skeleton-circle w-10 h-10',
  card: 'skeleton skeleton-card w-full',
  'table-row': 'skeleton skeleton-text w-full h-12',
};

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', variant = 'text', count = 1 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${variantClasses[variant]} ${className}`}
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
    </>
  );
};

// Preset skeleton layouts for common page sections
export const DashboardSkeleton: React.FC = () => (
  <div className="p-8 space-y-6 animate-fadeIn">
    <div className="flex justify-between items-center">
      <div className="space-y-2">
        <Skeleton variant="heading" className="w-48" />
        <Skeleton variant="text" className="w-64 h-4" />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Skeleton variant="card" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Skeleton variant="card" className="h-64" />
      <Skeleton variant="card" className="h-64" />
    </div>
  </div>
);

export const TableSkeleton: React.FC = () => (
  <div className="space-y-3 p-6">
    <Skeleton variant="text" className="w-full h-10" />
    <Skeleton variant="table-row" count={5} />
  </div>
);
