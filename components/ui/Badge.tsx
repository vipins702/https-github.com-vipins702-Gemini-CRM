import React from 'react';

interface BadgeProps {
  status: string;
  variant?: 'default' | 'dot' | 'outline';
  size?: 'sm' | 'md';
}

type Job = 'blue' | 'green' | 'orange' | 'red' | 'neutral';

/**
 * Map a status string to its tri-color JOB (per the design system):
 *  - orange = attention/new        (NEW, HOT, HIGH, PENDING, WARNING)
 *  - blue   = trust/in-flight      (QUALIFIED, OPEN, CONTACTED, IN PROGRESS, NEGOTIATION, MEDIUM)
 *  - green  = money/success        (WON, DONE, COMPLETED, RESOLVED, ACTIVE, PAID, APPROVED, LOW)
 *  - red    = lost/error           (LOST, ERROR, FAILED, CRITICAL, REJECTED, OVERDUE)
 *  - neutral= dormant              (INACTIVE, CLOSED, DRAFT, default)
 */
const jobOf = (status: string): Job => {
  const s = (status || '').toUpperCase().trim();
  if (['NEW', 'HOT', 'HIGH', 'PENDING', 'WARNING', 'NEGOTIATION'].includes(s)) return 'orange';
  if (['QUALIFIED', 'OPEN', 'CONTACTED', 'IN PROGRESS', 'MEDIUM', 'INFO', 'REVIEW'].includes(s)) return 'blue';
  if (['WON', 'DONE', 'COMPLETED', 'RESOLVED', 'ACTIVE', 'PAID', 'APPROVED', 'SUCCESS', 'LOW', 'CLOSED WON'].includes(s)) return 'green';
  if (['LOST', 'ERROR', 'FAILED', 'CRITICAL', 'REJECTED', 'OVERDUE', 'CLOSED LOST'].includes(s)) return 'red';
  return 'neutral';
};

const dotColor: Record<Job, string> = {
  blue: 'bg-[#4F46E5]',
  green: 'bg-[#0D9488]',
  orange: 'bg-[#D97706]',
  red: 'bg-[#DC2626]',
  neutral: 'bg-[#64668A]',
};

export const Badge: React.FC<BadgeProps> = ({ status, variant = 'default', size = 'sm' }) => {
  const job = jobOf(status);

  if (variant === 'dot') {
    return (
      <span className="status-pill status-neutral !bg-transparent !border-transparent !text-ink-soft !px-0">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor[job]}`}></span>
        {status}
      </span>
    );
  }

  // default + outline both render as the mono status pill, colored by job
  const pad = size === 'md' ? '!text-[11px] !px-2.5 !py-1' : '';
  return <span className={`status-pill status-${job} ${pad}`}>{status}</span>;
};
