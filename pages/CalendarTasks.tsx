import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalIcon, ChevronLeft, ChevronRight, Plus, Loader2,
  CheckCircle2, Circle, User, X, Filter, Link2 as LinkIcon,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { api } from '../services/api';
import { TaskItem, User as AppUser, ViewState } from '../types';

interface Props { onNavigate?: (view: ViewState, params?: any) => void; }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DONE = ['Completed', 'Done', 'Resolved', 'Closed'];
const isDone = (s: string) => DONE.includes(s);
const priorityJob = (p: string) => (p === 'High' ? '#D97706' : p === 'Low' ? '#6E7490' : '#4F46E5');

export const CalendarTasks: React.FC<Props> = ({ onNavigate }) => {
  const today = new Date();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string>(ymd(today));
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [showNew, setShowNew] = useState(false);
  const [busyId, setBusyId] = useState<string>('');

  const myId = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('flowcrm_session') || '{}').user?.id || ''; } catch { return ''; }
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [t, u] = await Promise.all([api.getTasks(), api.getUsers().catch(() => [])]);
      setTasks(t);
      setUsers(u);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => tasks.filter(t => {
    if (scope === 'mine' && t.assigneeId !== myId) return false;
    if (assigneeFilter && t.assigneeId !== assigneeFilter) return false;
    return true;
  }), [tasks, scope, assigneeFilter, myId]);

  const byDay = useMemo(() => {
    const m: Record<string, TaskItem[]> = {};
    filtered.forEach(t => { if (t.dueDate) (m[t.dueDate] ||= []).push(t); });
    return m;
  }, [filtered]);

  // Month grid cells
  const cells = useMemo(() => {
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const startPad = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const arr: (string | null)[] = [];
    for (let i = 0; i < startPad; i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push(ymd(new Date(year, month, d)));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  const dayTasks = (byDay[selectedDay] || []).slice().sort((a, b) => {
    if (!a.dueTime && !b.dueTime) return 0;
    if (!a.dueTime) return 1;
    if (!b.dueTime) return -1;
    return a.dueTime.localeCompare(b.dueTime);
  });
  const undated = filtered.filter(t => !t.dueDate);

  const reassign = async (t: TaskItem, assigneeId: string) => {
    const u = users.find(x => x.id === assigneeId);
    setBusyId(t.id);
    try {
      await api.assignTask(t.id, { assigneeId, assigneeName: u?.name || '' });
      await load();
    } finally { setBusyId(''); }
  };

  const toggleDone = async (t: TaskItem) => {
    setBusyId(t.id);
    try {
      await api.assignTask(t.id, { status: isDone(t.status) ? 'In Progress' : 'Completed' });
      await load();
    } finally { setBusyId(''); }
  };

  const openRelated = (t: TaskItem) => {
    if (!t.relatedId) return;
    if (t.relatedEntity === 'customer') onNavigate?.('customer-360', { customerId: t.relatedId });
    else if (t.relatedEntity === 'lead') onNavigate?.('lead-360', { leadId: t.relatedId });
    else if (t.relatedEntity === 'case') onNavigate?.('case' as ViewState, { recordId: t.relatedId });
    else if (t.relatedEntity === 'quote') onNavigate?.('quotes' as ViewState, { recordId: t.relatedId });
    else onNavigate?.(t.relatedEntity as ViewState, { recordId: t.relatedId });
  };

  return (
    <div className="p-6 lg:p-8 font-sans">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2.5">
            <span className="tri-ring-sq w-9 h-9"><span className="flex items-center justify-center"><CalIcon className="w-[18px] h-[18px] text-[#4F46E5]" /></span></span>
            Calendar & Tasks
          </h1>
          <p className="text-ink-muted text-sm mt-1">Allocate work to your team and track what's due.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* scope toggle */}
          <div className="flex rounded-full bg-slate-100 p-0.5 text-sm">
            <button onClick={() => setScope('all')} className={`px-3 py-1.5 rounded-full font-medium transition-colors ${scope === 'all' ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'}`}>All</button>
            <button onClick={() => setScope('mine')} className={`px-3 py-1.5 rounded-full font-medium transition-colors ${scope === 'mine' ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'}`}>My tasks</button>
          </div>
          <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowNew(true)}>New Task</Button>
        </div>
      </div>

      {/* Assignee filter */}
      {scope === 'all' && users.length > 0 && (
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Filter className="w-4 h-4 text-ink-muted" />
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="!h-9 !w-56">
            <option value="">All team members</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 lg:col-span-8"><Skeleton variant="card" className="h-96" /></div>
          <div className="col-span-12 lg:col-span-4"><Skeleton variant="card" className="h-96" /></div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-5">
          {/* Calendar */}
          <div className="col-span-12 lg:col-span-8 glass-showcase p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-extrabold text-lg text-ink">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="p-2 rounded-lg hover:bg-slate-100 text-ink-soft"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelectedDay(ymd(d)); }} className="px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-slate-100 text-ink-soft">Today</button>
                <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="p-2 rounded-lg hover:bg-slate-100 text-ink-soft"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DOW.map(d => <div key={d} className="mono-label text-center py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) => {
                if (!cell) return <div key={i} className="aspect-square" />;
                const items = byDay[cell] || [];
                const isToday = cell === ymd(today);
                const isSel = cell === selectedDay;
                const dayNum = Number(cell.slice(-2));
                return (
                  <button key={i} onClick={() => setSelectedDay(cell)}
                    className={`aspect-square rounded-xl border p-1.5 text-left transition-all flex flex-col ${isSel ? 'border-[#4F46E5] bg-[#4F46E5]/[0.06]' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                    <span className={`text-xs font-semibold mb-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full ${isToday ? 'bg-[#4F46E5] text-white' : 'text-ink-soft'}`}>{dayNum}</span>
                    <div className="flex-1 space-y-0.5 overflow-hidden">
                      {items.slice(0, 3).map(t => (
                        <div key={t.id} className="flex items-center gap-1 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: isDone(t.status) ? '#0D9488' : priorityJob(t.priority) }} />
                          <span className={`text-[10px] truncate ${isDone(t.status) ? 'line-through text-ink-muted' : 'text-ink-soft'}`}>
                            {t.dueTime ? `${fmtTime(t.dueTime)} ` : ''}{t.subject}
                          </span>
                        </div>
                      ))}
                      {items.length > 3 && <span className="text-[10px] text-ink-muted">+{items.length - 3} more</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day / task list */}
          <div className="col-span-12 lg:col-span-4 glass-showcase p-5 flex flex-col">
            <h3 className="font-heading font-bold text-[15px] text-ink mb-0.5">
              {new Date(selectedDay + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <p className="mono-label mb-3">{dayTasks.length} task{dayTasks.length !== 1 ? 's' : ''} due</p>

            <div className="space-y-2 overflow-y-auto flex-1 -mr-1 pr-1">
              {dayTasks.length === 0 && (
                <p className="text-sm text-ink-muted py-6 text-center">Nothing due this day.</p>
              )}
              {dayTasks.map(t => (
                <TaskRow key={t.id} t={t} users={users} busy={busyId === t.id}
                  onToggle={() => toggleDone(t)} onReassign={(uid) => reassign(t, uid)}
                  onOpen={() => onNavigate?.('task' as ViewState, { recordId: t.id })}
                  onOpenRelated={() => openRelated(t)} />
              ))}

              {undated.length > 0 && (
                <div className="pt-3 mt-3 border-t border-slate-200">
                  <p className="mono-label mb-2">No due date ({undated.length})</p>
                  <div className="space-y-2">
                    {undated.slice(0, 8).map(t => (
                      <TaskRow key={t.id} t={t} users={users} busy={busyId === t.id}
                        onToggle={() => toggleDone(t)} onReassign={(uid) => reassign(t, uid)}
                        onOpen={() => onNavigate?.('task' as ViewState, { recordId: t.id })}
                        onOpenRelated={() => openRelated(t)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <NewTaskModal users={users} defaultDate={selectedDay} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />
      )}
    </div>
  );
};

// ─── Format time helper ───────────────────────────────────────────────────────
const fmtTime = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

// ─── Task row ─────────────────────────────────────────────────────────────────
const TaskRow: React.FC<{
  t: TaskItem; users: AppUser[]; busy: boolean;
  onToggle: () => void; onReassign: (uid: string) => void; onOpen: () => void; onOpenRelated: () => void;
}> = ({ t, users, busy, onToggle, onReassign, onOpen, onOpenRelated }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex items-start gap-2.5">
      <button onClick={onToggle} disabled={busy} className="mt-0.5 shrink-0 text-ink-muted hover:text-[#0D9488] transition-colors">
        {busy ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : isDone(t.status) ? <CheckCircle2 className="w-[18px] h-[18px] text-[#0D9488]" /> : <Circle className="w-[18px] h-[18px]" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <button onClick={onOpen} className={`text-sm font-semibold text-left hover:text-[#4F46E5] transition-colors ${isDone(t.status) ? 'line-through text-ink-muted' : 'text-ink'}`}>
            {t.subject}
          </button>
          {t.dueTime && (
            <span className="shrink-0 text-[11px] font-medium text-[#4F46E5] bg-blue-50 px-1.5 py-0.5 rounded-md">
              {fmtTime(t.dueTime)}
            </span>
          )}
        </div>
        {t.relatedId && (
          <button onClick={onOpenRelated} className="flex items-center gap-1 mt-1 text-xs text-[#4F46E5] hover:underline">
            <LinkIcon className="w-3 h-3" />
            {t.relatedName || t.relatedEntity}<span className="text-ink-muted">· {t.relatedEntity}</span>
          </button>
        )}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <Badge status={t.status} />
          <span className="status-pill" style={{ background: 'rgba(110,116,144,0.08)', color: priorityJob(t.priority), borderColor: 'transparent' }}>{t.priority}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <User className="w-3.5 h-3.5 text-ink-muted shrink-0" />
          <select
            value={t.assigneeId || ''}
            onChange={e => onReassign(e.target.value)}
            disabled={busy}
            className="!h-7 !text-xs !py-0 !px-2 flex-1 min-w-0"
          >
            <option value="">Unassigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  </div>
);

// ─── New task modal ───────────────────────────────────────────────────────────
const REL_TYPES = [
  { value: 'lead', label: 'Lead' },
  { value: 'customer', label: 'Customer' },
  { value: 'case', label: 'Case' },
  { value: 'quote', label: 'Quote' },
  { value: 'product', label: 'Product' },
];
const recordLabel = (r: any) =>
  r.name || [r.firstName, r.lastName].filter(Boolean).join(' ') || r.company || r.subject || r.title || r.id;

const NewTaskModal: React.FC<{
  users: AppUser[]; defaultDate: string; onClose: () => void; onCreated: () => void;
}> = ({ users, defaultDate, onClose, onCreated }) => {
  const [subject, setSubject] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState(defaultDate);
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [relEntity, setRelEntity] = useState('');
  const [relId, setRelId] = useState('');
  const [relOptions, setRelOptions] = useState<any[]>([]);
  const [loadingRel, setLoadingRel] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load records of the chosen related-entity type for the picker
  useEffect(() => {
    if (!relEntity) { setRelOptions([]); setRelId(''); return; }
    setLoadingRel(true);
    api.getRecords(relEntity).then(rows => setRelOptions(rows || [])).catch(() => setRelOptions([])).finally(() => setLoadingRel(false));
  }, [relEntity]);

  const create = async () => {
    if (!subject.trim()) return;
    setSaving(true);
    try {
      const u = users.find(x => x.id === assigneeId);
      const rel = relOptions.find((r: any) => r.id === relId);
      await api.saveRecord('task', {
        subject: subject.trim(), name: subject.trim(),
        status: 'Not Started', priority, dueDate,
        dueTime: dueTime || '',
        assigneeId, assignee: u?.name || '',
        relatedEntity: relEntity || '', relatedId: relId || '',
        relatedName: rel ? recordLabel(rel) : '',
        ...(relEntity === 'customer' && relId ? { customerId: relId } : {}),
      } as any);
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[var(--elev-pop)] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-extrabold text-lg text-ink">New task</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-ink-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3.5">
          <div>
            <label className="mono-label block mb-1.5">Task</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Send proposal to Acme" autoFocus />
          </div>
          <div>
            <label className="mono-label block mb-1.5">Assign to</label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mono-label block mb-1.5">Related to</label>
              <select value={relEntity} onChange={e => setRelEntity(e.target.value)}>
                <option value="">— None —</option>
                {REL_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mono-label block mb-1.5">{loadingRel ? 'Loading…' : 'Record'}</label>
              <select value={relId} onChange={e => setRelId(e.target.value)} disabled={!relEntity || loadingRel}>
                <option value="">{relEntity ? 'Select…' : '—'}</option>
                {relOptions.map((r: any) => <option key={r.id} value={r.id}>{recordLabel(r)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mono-label block mb-1.5">Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="mono-label block mb-1.5">Time <span className="text-ink-muted font-normal">(optional)</span></label>
              <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mono-label block mb-1.5">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}>
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
          </div>
          <Button className="w-full" onClick={create} disabled={saving || !subject.trim()}
            icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}>
            Create task
          </Button>
        </div>
      </div>
    </div>
  );
};
