import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  GitBranch, Plus, RefreshCw, Loader2, MessageSquare, X,
  Send, Clock, ArrowRight, ChevronRight, Phone, Mail, User,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { ConfirmationDialog } from '../components/ui/ConfirmationDialog';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';
import { ProcessStage, ViewState, RecordNote } from '../types';
import { formatCurrency } from '../services/currency';

interface Props { onNavigate?: (view: ViewState, params?: any) => void; }

interface KanbanCard {
  id: string;
  name: string;
  company: string;
  value: number;
  source: string;
  status: string;
  data: any;
}

const NOTE_KIND_ICON: Record<string, React.ReactNode> = {
  comment: <MessageSquare className="w-3.5 h-3.5" />,
  stage_change: <ArrowRight className="w-3.5 h-3.5" />,
  call: <Phone className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
};
const NOTE_KIND_COLOR: Record<string, string> = {
  comment: 'bg-blue-100 text-blue-700',
  stage_change: 'bg-amber-100 text-amber-700',
  call: 'bg-green-100 text-green-700',
  email: 'bg-violet-100 text-violet-700',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Notes Drawer ─────────────────────────────────────────────────────────────
const NotesDrawer: React.FC<{
  card: KanbanCard;
  currentStage: string;
  onClose: () => void;
  onOpenLead: () => void;
}> = ({ card, currentStage, onClose, onOpenLead }) => {
  const { addToast } = useToast();
  const [notes, setNotes] = useState<RecordNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'comment' | 'call' | 'email'>('comment');
  const [saving, setSaving] = useState(false);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try { setNotes(await api.getNotes('lead', card.id)); }
    finally { setLoading(false); }
  }, [card.id]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await api.addNote('lead', card.id, text.trim(), currentStage, kind);
      setText('');
      await loadNotes();
      // Fire AI task generation in the background
      api.generateLeadFollowupTasks(card.id).catch(console.error);
    } catch (e: any) { addToast(e?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  // Group notes by stage
  const byStage = useMemo(() => {
    const groups: Record<string, RecordNote[]> = {};
    for (const n of notes) {
      const key = n.stage_name || 'General';
      (groups[key] ||= []).push(n);
    }
    return groups;
  }, [notes]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch" onClick={onClose}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" />
      {/* Panel */}
      <div
        className="w-[420px] bg-surface shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <p className="font-heading font-bold text-ink truncate">{card.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {card.company && <span className="text-xs text-ink-muted truncate">{card.company}</span>}
              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">{currentStage}</span>
              {card.value > 0 && <span className="text-xs font-semibold text-emerald-700">{formatCurrency(card.value)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="secondary" onClick={onOpenLead} className="!py-1">
              Open Lead
            </Button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-10">
              <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-ink-muted">No notes yet.</p>
              <p className="text-xs text-ink-muted mt-1">Add a comment to track your conversation.</p>
            </div>
          ) : (
            (Object.entries(byStage) as [string, RecordNote[]][]).map(([stageName, stageNotes]) => (
              <div key={stageName}>
                {/* Stage divider */}
                <div className="flex items-center gap-2 mb-3">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-500">{stageName}</span>
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400">{stageNotes.length}</span>
                </div>
                {/* Notes */}
                <div className="space-y-3 pl-2">
                  {stageNotes.map(note => (
                    <div key={note.id} className="relative pl-4 border-l-2 border-slate-200">
                      <div className="flex items-start gap-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${NOTE_KIND_COLOR[note.kind] || NOTE_KIND_COLOR.comment}`}>
                          {NOTE_KIND_ICON[note.kind] || NOTE_KIND_ICON.comment}
                          {note.kind}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ink leading-relaxed">{note.note}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-ink-muted">{note.actor_name || 'System'}</span>
                            <span className="text-xs text-ink-muted flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />{timeAgo(note.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add note */}
        <div className="px-5 py-4 border-t border-slate-200 shrink-0 bg-slate-50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-slate-600">Activity type:</span>
            {(['comment', 'call', 'email'] as const).map(k => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${kind === k ? NOTE_KIND_COLOR[k] : 'bg-surface text-slate-500 border border-slate-200'}`}
              >
                {NOTE_KIND_ICON[k]}{k}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}
              placeholder={`Add ${kind} note... (Ctrl+Enter to save)`}
              className="flex-1 text-sm min-h-[60px] resize-none border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-surface"
              rows={2}
            />
            <button
              onClick={submit}
              disabled={saving || !text.trim()}
              className="px-3 bg-accent text-white rounded-lg hover:bg-accent-deep disabled:opacity-40 transition-colors self-end mb-0.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Pipeline Page ─────────────────────────────────────────────────────────────
export const Pipeline: React.FC<Props> = ({ onNavigate }) => {
  const { addToast } = useToast();
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [stages, setStages] = useState<ProcessStage[]>([]);
  const [processName, setProcessName] = useState('Sales Pipeline');
  const [loading, setLoading] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string>('');
  const [stageConfirm, setStageConfirm] = useState<{ card: KanbanCard; stage: string } | null>(null);
  const [noteModal, setNoteModal] = useState<{ card: KanbanCard; stage: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [notesDrawer, setNotesDrawer] = useState<KanbanCard | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [proc, rows] = await Promise.all([api.getProcess('lead'), api.getRecords('lead')]);
      setStages(proc.stages);
      setProcessName(proc.name);
      const firstStage = proc.stages[0]?.name || 'New';
      const parsed: KanbanCard[] = rows.map((r: any) => {
        const name = [r.firstName, r.lastName].filter(Boolean).join(' ') || r.name || r.company || 'Untitled';
        return { id: r.id, name, company: r.company || '', value: Number(r.value || 0), source: r.source || '', status: r.status || firstStage, data: r };
      });
      setCards(parsed);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const byStage = useMemo(() => {
    const m: Record<string, KanbanCard[]> = {};
    stages.forEach(s => (m[s.name] = []));
    cards.forEach(c => { (m[c.status] ||= []).push(c); });
    return m;
  }, [cards, stages]);

  const moveTo = async (card: KanbanCard, stage: string, note?: string) => {
    if (card.status === stage) return;
    const fromStatus = card.status;
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: stage } : c));
    setSavingId(card.id);
    try {
      await api.setRecordStatus('lead', card.id, stage, note);
      // Auto-log stage change as a note
      await api.addNote('lead', card.id, `Moved from "${fromStatus}" → "${stage}"${note ? `: ${note}` : ''}`, stage, 'stage_change');
    } catch (e: any) {
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: fromStatus } : c));
      addToast(e?.message || 'Could not move card', 'error');
    } finally { setSavingId(''); }
  };

  const onDrop = (stageName: string) => {
    const card = cards.find(c => c.id === draggedId);
    setOverStage(null); setDraggedId(null);
    if (!card || card.status === stageName) return;
    setStageConfirm({ card, stage: stageName });
  };

  const handleStageConfirm = async () => {
    if (!stageConfirm) return;
    const { card, stage } = stageConfirm;
    const def = stages.find(s => s.name === stage);
    setStageConfirm(null);
    if (def?.requireNote) { setNoteModal({ card, stage }); setNoteText(''); }
    else moveTo(card, stage);
  };

  return (
    <div className="p-6 lg:p-8 font-sans h-[calc(100vh-64px)] flex flex-col">
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2.5">
            <span className="tri-ring-sq w-9 h-9"><span className="flex items-center justify-center"><GitBranch className="w-[18px] h-[18px] text-accent" /></span></span>
            {processName}
          </h1>
          <p className="text-ink-muted text-sm mt-1">Drag leads across stages — click 💬 to add notes. Configure stages in Process Builder.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => onNavigate?.('lead' as ViewState)}>New Lead</Button>
          <Button size="sm" variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={load}>Refresh</Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 flex-1">
          {[0,1,2,3,4].map(s => <Skeleton key={s} variant="card" className="h-full" />)}
        </div>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0 overflow-x-auto pb-2">
          {stages.map(stage => {
            const items = byStage[stage.name] || [];
            const sum = items.reduce((s, c) => s + c.value, 0);
            const accent = stage.color || '#6E7490';
            const isOver = overStage === stage.name;
            return (
              <div
                key={stage.id}
                onDragOver={e => { e.preventDefault(); setOverStage(stage.name); }}
                onDragLeave={() => setOverStage(s => s === stage.name ? null : s)}
                onDrop={() => onDrop(stage.name)}
                className={`flex flex-col w-72 shrink-0 rounded-2xl border transition-colors ${isOver ? 'border-accent bg-accent/[0.04]' : 'border-slate-200 bg-slate-50/60'}`}
              >
                <div className="px-3.5 py-3 flex items-center justify-between sticky top-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                    <span className="font-heading font-bold text-sm text-ink truncate">{stage.name}</span>
                    <span className="text-xs text-ink-muted tnum">{items.length}</span>
                  </div>
                  {sum > 0 && <span className="text-xs font-semibold text-success-deep tnum">{formatCurrency(sum)}</span>}
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                  {items.length === 0 && (
                    <div className="text-center text-xs text-ink-muted py-8 border-2 border-dashed border-slate-200 rounded-xl">Drop here</div>
                  )}
                  {items.map(card => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => setDraggedId(card.id)}
                      onDragEnd={() => { setDraggedId(null); setOverStage(null); }}
                      className={`bg-surface border border-slate-200 rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all hover:border-slate-300 hover:shadow-sm group ${draggedId === card.id ? 'opacity-40' : ''}`}
                      style={{ borderLeft: `3px solid ${accent}` }}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p
                          className="text-sm font-semibold text-ink leading-snug flex-1 min-w-0 cursor-pointer hover:text-accent truncate"
                          onClick={() => onNavigate?.('lead-360', { leadId: card.id })}
                        >
                          {card.name}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          {savingId === card.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-muted" />}
                          <button
                            onClick={e => { e.stopPropagation(); setNotesDrawer(card); }}
                            className="p-1 text-slate-300 hover:text-accent hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="View / add notes"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {card.company && <p className="text-xs text-ink-muted mt-0.5 truncate">{card.company}</p>}
                      <div className="flex items-center justify-between mt-2">
                        {card.value > 0
                          ? <span className="text-sm font-bold text-success-deep tnum">{formatCurrency(card.value)}</span>
                          : <span />}
                        {card.source && <span className="text-xs text-ink-muted bg-slate-100 px-1.5 py-0.5 rounded">{card.source}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation before stage change */}
      <ConfirmationDialog
        isOpen={!!stageConfirm}
        title="Move to different stage?"
        message={stageConfirm ? `Move "${stageConfirm.card.name}" to "${stageConfirm.stage}"?` : ''}
        confirmText="Move"
        onConfirm={handleStageConfirm}
        onCancel={() => setStageConfirm(null)}
      />

      {/* Reason / note required to enter this stage */}
      {noteModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setNoteModal(null)}>
          <div className="bg-surface rounded-2xl border border-slate-200 shadow-[var(--elev-pop)] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-heading font-extrabold text-lg text-ink mb-1">Add a note</h2>
            <p className="text-sm text-ink-muted mb-4">
              Moving <strong>{noteModal.card.name}</strong> to <strong>{noteModal.stage}</strong> requires a reason.
            </p>
            <textarea autoFocus value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
              placeholder="e.g. Price too high / chose competitor" className="w-full" />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setNoteModal(null)}>Cancel</Button>
              <Button disabled={!noteText.trim()} onClick={() => { const m = noteModal; setNoteModal(null); moveTo(m.card, m.stage, noteText.trim()); }}>
                Confirm move
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Drawer */}
      {notesDrawer && (
        <NotesDrawer
          card={notesDrawer}
          currentStage={notesDrawer.status}
          onClose={() => setNotesDrawer(null)}
          onOpenLead={() => { setNotesDrawer(null); onNavigate?.('lead-360', { leadId: notesDrawer.id }); }}
        />
      )}
    </div>
  );
};
