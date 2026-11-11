import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from './ui/Card';
import { api } from '../services/api';
import { JourneyRun } from '../types';
import { StepList } from '../pages/WorkflowBuilder';

/** "Journeys" card on a record's page: which automations ran on it, what is still waiting, and anything that failed. */
const STATUS_STYLE: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700', waiting: 'bg-amber-100 text-amber-700', done: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-600',
};

export const JourneyHistory: React.FC<{ entityType: string; recordId: string }> = ({ entityType, recordId }) => {
  const [runs, setRuns] = useState<JourneyRun[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.getRecordJourneyRuns(entityType, recordId).then(r => live && setRuns(r || [])).catch(() => live && setRuns([]));
    return () => { live = false; };
  }, [entityType, recordId]);

  if (!runs.length) return null;
  const when = (s?: string | null) => (s ? new Date(s.includes('T') ? s : s + 'Z').toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
  return (
    <Card title={`Journeys · ${runs.length}`} noPadding>
      <ul className="divide-y divide-gray-100">
        {runs.map(r => (
          <li key={r.id}>
            <button className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-gray-50" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-gray-900 truncate">{r.journeyName}</span>
                <span className="block text-xs text-gray-500">
                  {r.status === 'waiting' && r.dueAt ? `Continues ${when(r.dueAt)}` : r.status === 'failed' && r.error ? r.error : `Started ${when(r.createdAt)}`}
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open === r.id ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {open === r.id && <div className="px-5 pb-4"><StepList steps={r.steps} /></div>}
          </li>
        ))}
      </ul>
    </Card>
  );
};
