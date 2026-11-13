import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, RefreshCw, Loader2, FlaskConical, Phone, User, X, Search, UserPlus, CheckSquare, StickyNote, ArrowRightCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';
import { WaConversation, WaMessage, ViewState } from '../types';

interface Props {
  onNavigate?: (view: ViewState, params?: any) => void;
  /** Open this number's conversation (e.g. from a lead's 360 view). */
  initialPhone?: string;
}

const fmtTime = (s: string) => {
  const d = new Date(s.includes('Z') || s.includes('+') ? s : s + 'Z');
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

type Filter = 'all' | 'reply' | 'new' | 'unsaved';
type Panel = null | 'task' | 'note' | 'lead';

/** What this number is to us: a customer, a lead (new or worked), or nobody yet. */
const kindOf = (c?: WaConversation): 'customer' | 'new-lead' | 'lead' | 'unsaved' => {
  if (!c?.matched_id) return 'unsaved';
  if (c.matched_entity === 'customer') return 'customer';
  return c.record_status === 'New' ? 'new-lead' : 'lead';
};
const KIND_LABEL = { customer: 'Customer', 'new-lead': 'New lead', lead: 'Lead', unsaved: 'Not saved' } as const;
const KIND_STYLE = {
  customer: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'new-lead': 'bg-blue-50 text-blue-700 border-blue-200',
  lead: 'bg-slate-100 text-slate-600 border-slate-200',
  unsaved: 'bg-amber-50 text-amber-700 border-amber-200',
} as const;
const initialOf = (name: string) => (name.replace(/^WhatsApp\s*/, '').replace(/[^\p{L}\p{N}]/gu, '').charAt(0) || '#').toUpperCase();

export const WhatsAppInbox: React.FC<Props> = ({ onNavigate, initialPhone }) => {
  const { addToast } = useToast();
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [activePhone, setActivePhone] = useState<string>(initialPhone ? initialPhone.replace(/\D/g, '') : '');
  const [thread, setThread] = useState<WaMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'live' | 'simulated'>('simulated');
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [showSim, setShowSim] = useState(false);
  const [simFrom, setSimFrom] = useState('+91 98765 11111');
  const [simName, setSimName] = useState('Demo Prospect');
  const [simBody, setSimBody] = useState('Hi, I saw your ad. What does the premium plan cost?');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [taskSubject, setTaskSubject] = useState('');
  const [taskDue, setTaskDue] = useState('1');
  const [taskPriority, setTaskPriority] = useState('Medium');
  const [noteText, setNoteText] = useState('');
  const [leadName, setLeadName] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConv = useMemo(() => conversations.find(c => c.phone === activePhone), [conversations, activePhone]);
  const activeKind = kindOf(activeConv);

  const counts = useMemo(() => ({
    all: conversations.length,
    reply: conversations.filter(c => c.needs_reply).length,
    new: conversations.filter(c => kindOf(c) === 'new-lead').length,
    unsaved: conversations.filter(c => kindOf(c) === 'unsaved').length,
  }), [conversations]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return conversations.filter(c => {
      if (filter === 'reply' && !c.needs_reply) return false;
      if (filter === 'new' && kindOf(c) !== 'new-lead') return false;
      if (filter === 'unsaved' && kindOf(c) !== 'unsaved') return false;
      if (!q) return true;
      return c.display_name.toLowerCase().includes(q) || (digits.length > 2 && c.phone.includes(digits)) || (c.last_body || '').toLowerCase().includes(q);
    });
  }, [conversations, filter, query]);

  const loadConversations = async (selectFirst = false) => {
    try {
      const list = await api.getWhatsAppConversations();
      setConversations(list);
      if (selectFirst && list.length && !activePhone) setActivePhone(list[0].phone);
    } finally {
      setLoadingConvs(false);
    }
  };

  const loadThread = async (phone: string, silent = false) => {
    if (!phone) return;
    if (!silent) setLoadingThread(true);
    try {
      setThread(await api.getWhatsAppThread(phone));
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    api.getWhatsAppStatus().then(s => setMode(s.mode)).catch(() => {});
    loadConversations(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (activePhone) loadThread(activePhone); setPanel(null); }, [activePhone]);

  // Light polling while the inbox is open
  useEffect(() => {
    const t = setInterval(() => {
      loadConversations();
      if (activePhone) loadThread(activePhone, true);
    }, 8000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePhone]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread.length]);

  const refreshAll = async () => { await loadConversations(); if (activePhone) await loadThread(activePhone, true); };

  const send = async () => {
    if (!draft.trim() || !activePhone) return;
    setSending(true);
    try {
      await api.sendWhatsAppMessage(activePhone, draft.trim());
      setDraft('');
      await refreshAll();
    } catch (e: any) {
      addToast(e?.message || 'Could not send', 'error');
    } finally {
      setSending(false);
    }
  };

  const simulate = async () => {
    if (!simFrom.trim() || !simBody.trim()) return;
    await api.simulateWhatsAppIncoming(simFrom.trim(), simBody.trim(), simName.trim());
    setShowSim(false);
    await loadConversations(true);
    setActivePhone(simFrom.replace(/\D/g, ''));
  };

  const openRecord = () => {
    if (!activeConv?.matched_id || !onNavigate) return;
    if (activeConv.matched_entity === 'customer') onNavigate('customer-360', { customerId: activeConv.matched_id });
    else onNavigate('lead' as ViewState, { recordId: activeConv.matched_id });
  };

  // Run one action from the chat, then refresh and say what happened.
  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      addToast(await fn(), 'success');
      setPanel(null);
      await refreshAll();
    } catch (e: any) {
      addToast(e?.message || 'That did not work', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openPanel = (p: Panel) => {
    if (p === 'task') { setTaskSubject(''); setTaskDue('1'); setTaskPriority('Medium'); }
    if (p === 'note') setNoteText('');
    if (p === 'lead') setLeadName('');
    setPanel(panel === p ? null : p);
  };

  const createLead = () => act(async () => {
    const r = await api.createWhatsAppLead(activePhone, leadName.trim() || undefined);
    return r.existing ? `Already saved as ${r.name}` : `Lead created: ${r.name}`;
  });
  const addTask = () => act(async () => {
    const r = await api.addWhatsAppTask(activePhone, { subject: taskSubject.trim() || undefined, dueInDays: Number(taskDue), priority: taskPriority });
    return `Task created, due ${r.dueDate}`;
  });
  const addNote = () => act(async () => {
    await api.addWhatsAppNote(activePhone, noteText.trim());
    return 'Note added to the timeline';
  });
  const convert = () => act(async () => {
    const r = await api.convertLead(activeConv!.matched_id!);
    return r.alreadyConverted ? 'Already a customer' : `Converted to customer${r.customerName ? `: ${r.customerName}` : ''}`;
  });

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'reply', label: 'Needs reply' }, { key: 'new', label: 'New leads' }, { key: 'unsaved', label: 'Not saved' },
  ];

  return (
    <div className="page-shell font-sans h-[calc(100vh-64px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2.5">
            <span className="tri-ring-sq w-9 h-9"><span className="flex items-center justify-center"><MessageCircle className="w-[18px] h-[18px] text-accent" /></span></span>
            WhatsApp Inbox
          </h1>
          <p className="text-ink-muted text-sm mt-1">
            New numbers become leads automatically. Turn any chat into a task or a note.
            <span className={`ml-2 status-pill ${mode === 'live' ? 'status-green' : 'status-orange'}`}>{mode}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<FlaskConical className="w-4 h-4" />} onClick={() => setShowSim(true)}>Simulate Incoming</Button>
          <Button size="sm" variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={refreshAll}>Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5 flex-1 min-h-0">
        {/* Conversations */}
        <aside className="col-span-12 md:col-span-4 lg:col-span-3 glass-showcase overflow-hidden flex flex-col">
          <div className="px-3 pt-3 pb-2 space-y-2">
            <label className="relative block">
              <span className="sr-only">Search conversations</span>
              <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, number or message" className="w-full !pl-9 !py-2 text-sm" />
            </label>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter conversations">
              {filters.map(f => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${filter === f.key ? 'bg-accent text-white border-transparent' : 'bg-surface text-ink-muted border-slate-200 hover:border-slate-300'}`}
                >
                  {f.label}{counts[f.key] > 0 && <span className="ml-1 tnum opacity-80">{counts[f.key]}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            {loadingConvs ? (
              <div className="p-3 space-y-3"><Skeleton variant="text" /><Skeleton variant="text" /><Skeleton variant="text" /></div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-12 px-4">
                <MessageCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-ink-muted">No conversations yet.</p>
                <p className="text-xs text-ink-muted mt-1">When someone messages your WhatsApp number, they appear here and become a lead.</p>
              </div>
            ) : visible.length === 0 ? (
              <p className="text-center text-sm text-ink-muted py-10 px-4">Nothing matches.</p>
            ) : visible.map(c => {
              const k = kindOf(c);
              const active = activePhone === c.phone;
              return (
                <button
                  key={c.phone}
                  onClick={() => setActivePhone(c.phone)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${active
                    ? 'bg-accent/[0.06] border-accent/30'
                    : 'bg-surface border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${c.needs_reply ? 'font-bold' : 'font-semibold'} ${active ? 'text-accent-deep' : 'text-ink'}`}>
                      {c.display_name}
                    </span>
                    <span className="text-xs text-ink-muted shrink-0 tnum">{fmtTime(c.last_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-px rounded border ${KIND_STYLE[k]}`}>{KIND_LABEL[k]}</span>
                    <span className="text-[11px] text-ink-muted tnum truncate">{c.phone_display}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className="text-xs text-ink-muted truncate">
                      {c.last_direction === 'outbound' && <span className="text-accent">You: </span>}
                      {c.last_body}
                    </p>
                    {c.unreplied > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center tnum" aria-label={`${c.unreplied} unanswered`}>{c.unreplied}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Thread */}
        <section className="col-span-12 md:col-span-8 lg:col-span-9 glass-showcase overflow-hidden flex flex-col">
          {!activePhone ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3"><MessageCircle className="w-7 h-7 text-slate-300" /></div>
              <p className="text-ink font-medium">Select a conversation</p>
              <p className="text-ink-muted text-sm mt-1">Or simulate an incoming message to see the full flow.</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="px-5 py-3.5 border-b border-slate-200 shrink-0">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="tri-ring w-9 h-9 shrink-0"><span className="flex items-center justify-center font-heading font-bold text-sm text-accent-deep">
                      {initialOf(activeConv?.display_name || '')}
                    </span></span>
                    <div className="min-w-0">
                      <p className="font-heading font-bold text-[15px] text-ink truncate flex items-center gap-2">
                        {activeConv?.display_name || `+${activePhone}`}
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-px rounded border ${KIND_STYLE[activeKind]}`}>{KIND_LABEL[activeKind]}</span>
                      </p>
                      <p className="text-xs text-ink-muted flex items-center gap-1 tnum"><Phone className="w-3 h-3" /> {activeConv?.phone_display || `+${activePhone}`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeKind === 'unsaved' ? (
                      <Button size="sm" variant="primary" icon={<UserPlus className="w-4 h-4" />} onClick={() => openPanel('lead')}>Create lead</Button>
                    ) : (
                      <>
                        <Button size="sm" variant="secondary" icon={<CheckSquare className="w-4 h-4" />} onClick={() => openPanel('task')}>Add task</Button>
                        <Button size="sm" variant="secondary" icon={<StickyNote className="w-4 h-4" />} onClick={() => openPanel('note')}>Add note</Button>
                        {activeConv?.matched_entity === 'lead' && activeConv.record_status !== 'Won' && (
                          <Button size="sm" variant="secondary" icon={<ArrowRightCircle className="w-4 h-4" />} onClick={convert} disabled={busy}>Convert to customer</Button>
                        )}
                        <Button size="sm" variant="secondary" icon={<User className="w-4 h-4" />} onClick={openRecord}>
                          Open {activeConv?.matched_entity === 'customer' ? 'Customer' : 'Lead'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {panel === 'lead' && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-end gap-3">
                    <label className="flex-1 min-w-[200px]">
                      <span className="mono-label block mb-1.5">Name (optional)</span>
                      <input value={leadName} onChange={e => setLeadName(e.target.value)} placeholder="Leave empty to use their WhatsApp name" />
                    </label>
                    <Button size="sm" onClick={createLead} loading={busy}>Create lead</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
                  </div>
                )}
                {panel === 'task' && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-end gap-3">
                    <label className="flex-1 min-w-[220px]">
                      <span className="mono-label block mb-1.5">Task</span>
                      <input value={taskSubject} onChange={e => setTaskSubject(e.target.value)} placeholder={`Follow up on WhatsApp chat with ${activeConv?.display_name || ''}`} />
                    </label>
                    <label>
                      <span className="mono-label block mb-1.5">Due</span>
                      <select value={taskDue} onChange={e => setTaskDue(e.target.value)}>
                        <option value="0">Today</option><option value="1">Tomorrow</option><option value="3">In 3 days</option><option value="7">In a week</option>
                      </select>
                    </label>
                    <label>
                      <span className="mono-label block mb-1.5">Priority</span>
                      <select value={taskPriority} onChange={e => setTaskPriority(e.target.value)}>
                        <option>Low</option><option>Medium</option><option>High</option>
                      </select>
                    </label>
                    <Button size="sm" onClick={addTask} loading={busy}>Create task</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
                  </div>
                )}
                {panel === 'note' && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-end gap-3">
                    <label className="flex-1 min-w-[240px]">
                      <span className="mono-label block mb-1.5">Note on the {activeConv?.matched_entity === 'customer' ? 'customer' : 'lead'} timeline</span>
                      <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2} placeholder="What did they ask for? What did you promise?" />
                    </label>
                    <Button size="sm" onClick={addNote} loading={busy} disabled={!noteText.trim()}>Save note</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 bg-slate-50/60">
                {loadingThread ? (
                  <div className="space-y-3 pt-2"><Skeleton variant="text" className="w-1/2" /><Skeleton variant="text" className="w-2/3 ml-auto" /><Skeleton variant="text" className="w-1/2" /></div>
                ) : thread.map(m => (
                  <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[72%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed border ${m.direction === 'outbound'
                      ? 'bg-accent text-white border-transparent rounded-br-md'
                      : 'bg-surface text-ink border-slate-200 rounded-bl-md'}`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`text-xs mt-1 tnum ${m.direction === 'outbound' ? 'text-white/70' : 'text-ink-muted'}`}>
                        {fmtTime(m.created_at)}{m.status === 'simulated' ? ' · simulated' : m.status === 'failed' ? ' · failed' : ''}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="px-4 py-3 border-t border-slate-200 flex items-end gap-2 shrink-0">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={mode === 'simulated' ? 'Type a reply… (simulated mode — stored locally)' : 'Type a reply…'}
                  aria-label="Reply"
                  rows={1}
                  className="flex-1 resize-none !rounded-2xl max-h-32"
                />
                <Button icon={sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} onClick={send} disabled={sending || !draft.trim()}>
                  Send
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Simulate modal */}
      {showSim && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowSim(false)}>
          <div className="bg-surface rounded-2xl border border-slate-200 shadow-[var(--elev-pop)] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-extrabold text-lg text-ink">Simulate incoming message</h2>
              <button onClick={() => setShowSim(false)} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 text-ink-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3.5">
              <div>
                <label className="mono-label block mb-1.5">From number</label>
                <input value={simFrom} onChange={e => setSimFrom(e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="mono-label block mb-1.5">Profile name</label>
                <input value={simName} onChange={e => setSimName(e.target.value)} placeholder="Customer name" />
              </div>
              <div>
                <label className="mono-label block mb-1.5">Message</label>
                <textarea value={simBody} onChange={e => setSimBody(e.target.value)} rows={3} />
              </div>
              <p className="text-xs text-ink-muted">
                Unknown numbers auto-create a <span className="font-semibold text-ink">Lead</span> (source: WhatsApp), named from the profile name or from "my name is ..." in the message. Known numbers attach to the matched record.
              </p>
              <Button className="w-full" onClick={simulate}>Deliver message</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
