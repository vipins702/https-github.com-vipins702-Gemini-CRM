import React from 'react';
import { LeadStatus } from '../../types';

interface BadgeProps {
  status: string;
  variant?: 'default' | 'dot' | 'outline';
  size?: 'sm' | 'md';
}

const statusColors: Record<string, { bg: string; text: string; dot: string; ring: string }> = {
  // Lead statuses
  [LeadStatus.NEW]: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', ring: 'ring-blue-600/20' },
  [LeadStatus.CONTACTED]: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500', ring: 'ring-indigo-600/20' },
  [LeadStatus.QUALIFIED]: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500', ring: 'ring-purple-600/20' },
  [LeadStatus.NEGOTIATION]: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', ring: 'ring-amber-600/20' },
  [LeadStatus.WON]: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-emerald-600/20' },
  [LeadStatus.LOST]: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', ring: 'ring-red-600/20' },
  // Generic statuses
  'Active': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-emerald-600/20' },
  'Inactive': { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400', ring: 'ring-gray-500/20' },
  'Pending': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', ring: 'ring-amber-600/20' },
  'Open': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', ring: 'ring-blue-600/20' },
  'Closed': { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400', ring: 'ring-gray-500/20' },
  'In Progress': { bg: 'bg-cyan-50', text: 'text-cyan-700', dot: 'bg-cyan-500', ring: 'ring-cyan-600/20' },
  'Completed': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-emerald-600/20' },
  'High': { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', ring: 'ring-red-600/20' },
  'Medium': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', ring: 'ring-amber-600/20' },
  'Low': { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500', ring: 'ring-green-600/20' },
  'Critical': { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', ring: 'ring-rose-600/20' },
};

const defaultColor = { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400', ring: 'ring-gray-500/20' };

export const Badge: React.FC<BadgeProps> = ({ status, variant = 'default', size = 'sm' }) => {
  const colors = statusColors[status] || defaultColor;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  if (variant === 'dot') {
    return (
      <span className={`inline-flex items-center gap-1.5 ${colors.text} ${sizeClasses[size]} font-medium`}>
        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`}></span>
        {status}
      </span>
    );
  }

  if (variant === 'outline') {
    return (
      <span className={`inline-flex items-center ${sizeClasses[size]} rounded-md font-medium ring-1 ring-inset ${colors.text} ${colors.ring}`}>
        {status}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center ${sizeClasses[size]} rounded-md font-medium ring-1 ring-inset ${colors.bg} ${colors.text} ${colors.ring}`}>
      {status}
    </span>
  );
};
