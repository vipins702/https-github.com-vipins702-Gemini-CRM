import React, { useEffect, useState } from 'react';
import { Workflow, Plus, Trash2, Loader2, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { JourneySummary } from '../types';
import { WorkflowBuilder } from './WorkflowBuilder';

// Configuration → Journeys: every automation of the workspace. A journey starts when something happens to a record
// (created, status changes, a date arrives, …), optionally checks conditions, then runs steps over time: send,
// update, notify, assign, wait, If / Else. Field Triggers (before a save) are the other half; see that page.

export const Journeys: React.FC = () => {
  const { addToast } = useToast();
  const [list, setList] = useState<JourneySummary[] | null>(null);
  // undefined = list, null = a new journey, string = editing that one
  const [editing, setEditing] = useState<string | null | undefined>(undefined);

  const load = () => api.getJourneys().then(setList).catch(e => { addToast(e.message, 'error'); setList([]); });
  useEffect(() => { if (editing === undefined) load(); }, [editing]);

  if (editing !== undefined) return <WorkflowBuilder key={editing || 'new'} journeyId={editing} onBack={() => setEditing(undefined)} />;

  const toggle = async (j: JourneySummary) => {
    try { await api.setJourneyActive(j.id, !j.isActive); load(); } catch (e: any) { addToast(e.message, 'error'); }
  };
  const remove = async (j: JourneySummary) => {
    const waiting = j.runs.waiting + j.runs.running;
    if (!window.confirm(`Delete "${j.name}"?${waiting ? ` ${waiting} record(s) are waiting in it; they will be stopped.` : ''} This cannot be undone.`)) return;
    try { await api.deleteJourney(j.id); addToast('Journey deleted', 'success'); load(); } catch (e: any) { addToast(e.message, 'error'); }
  };

  return (
    <div className="page-shell font-sans space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1>Journeys</h1>
          <p className="page-subtitle">Automations that run after something happens to a record: follow-ups, reminders, hand-offs. They can wait days between steps.</p>
        </div>
        <Button className="whitespace-nowrap" icon={<Plus className="w-4 h-4" />} onClick={() => setEditing(null)}>New journey</Button>
      </div>

      {list === null ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : list.length === 0 ? (
        <Card>
          <div className="py-10 text-center max-w-md mx-auto">
            <div className="mx-auto w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center"><Workflow className="w-5 h-5 text-accent" /></div>
            <p className="mt-3 font-medium text-gray-900">No journeys yet</p>
            <p className="text-sm text-gray-500 mt-1">Example: when a new lead is created, wait 2 days, and if it is still "New", create a task for its owner.</p>
            <Button className="mt-4" icon={<Plus className="w-4 h-4" />} onClick={() => setEditing(null)}>Build your first journey</Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map(j => (
            <Card key={j.id}>
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <button className="flex-1 min-w-0 text-left" onClick={() => setEditing(j.id)}>
                  <p className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">{j.name}{!j.isActive && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold">Off</span>}</p>
                  <p className="text-sm text-gray-500 mt-0.5">Starts when {j.trigger} · {j.steps} step{j.steps === 1 ? '' : 's'}</p>
                </button>
                <div className="flex items-center gap-3 text-xs shrink-0 flex-wrap">
                  {j.runs.waiting > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><Clock className="w-3.5 h-3.5" aria-hidden="true" />{j.runs.waiting} waiting</span>}
                  {j.runs.failed > 0 && <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />{j.runs.failed} failed</span>}
                  {j.runs.done > 0 && <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />{j.runs.done} done</span>}
                  {Object.values(j.runs).every(n => n === 0) && <span className="text-gray-400">Not run yet</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" role="switch" aria-checked={j.isActive} aria-label={j.isActive ? `Turn off ${j.name}` : `Turn on ${j.name}`} onClick={() => toggle(j)} className={`relative w-9 h-5 rounded-full transition-colors ${j.isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${j.isActive ? 'translate-x-4' : ''}`} />
                  </button>
                  <Button variant="secondary" size="sm" className="ml-2" onClick={() => setEditing(j.id)}>Edit</Button>
                  <button aria-label={`Delete ${j.name}`} onClick={() => remove(j)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Journeys;
