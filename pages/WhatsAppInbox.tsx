import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, RefreshCw, Loader2, FlaskConical, Phone, User, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
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

export const WhatsAppInbox: React.FC<Props> = ({ onNavigate, initialPhone }) => {
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
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConv = useMemo(() => conversations.find(c => c.phone === activePhone), [conversations, activePhone]);

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

  useEffect(() => { if (activePhone) loadThread(activePhone); }, [activePhone]);

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

  const send = async () => {
    if (!draft.trim() || !activePhone) return;
    setSending(true);
    try {
      await api.sendWhatsAppMessage(activePhone, draft.trim());
      setDraft('');
      await loadThread(activePhone, true);
      await loadConversations();
    } finally {
      setSending(false);
    }
  };

  const simulate = async () => {
    if (!simFrom.trim() || !simBody.trim()) return;
    await api.simulateWhatsAppIncoming(simFrom.trim(), simBody.trim(), simName.trim());
    setShowSim(false);
    await loadConversations(true);
    const p = simFrom.replace(/\D/g, '');
    setActivePhone(p);
  };

  const openRecord = () => {
    if (!activeConv?.matched_id || !onNavigate) return;
    if (activeConv.matched_entity === 'customer') onNavigate('customer-360', { customerId: activeConv.matched_id });
    else onNavigate('lead' as ViewState, { recordId: activeConv.matched_id });
  };

  return (
    <div className="p-6 lg:p-8 font-sans h-[calc(100vh-64px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2.5">
            <span className="tri-ring-sq w-9 h-9"><span className="flex items-center justify-center"><MessageCircle className="w-[18px] h-[18px] text-accent" /></span></span>
            WhatsApp Inbox
          </h1>
          <p className="text-ink-muted text-sm mt-1">
            Conversations matched to leads & customers.
            <span className={`ml-2 status-pill ${mode === 'live' ? 'status-green' : 'status-orange'}`}>{mode}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<FlaskConical className="w-4 h-4" />} onClick={() => setShowSim(true)}>Simulate Incoming</Button>
          <Button size="sm" variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={() => { loadConversations(); if (activePhone) loadThread(activePhone, true); }}>Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5 flex-1 min-h-0">
        {/* Conversations */}
        <aside className="col-span-12 md:col-span-4 lg:col-span-3 glass-showcase overflow-hidden flex flex-col">
          <p className="mono-label px-4 pt-4 pb-2">Conversations</p>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            {loadingConvs ? (
              <div className="p-3 space-y-3"><Skeleton variant="text" /><Skeleton variant="text" /><Skeleton variant="text" /></div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-12 px-4">
                <MessageCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-ink-muted">No conversations yet.</p>
                <p className="text-xs text-ink-muted mt-1">Use "Simulate Incoming" to try the flow.</p>
              </div>
            ) : conversations.map(c => (
              <button
                key={c.phone}
                onClick={() => setActivePhone(c.phone)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${activePhone === c.phone
                  ? 'bg-accent/[0.06] border-accent/30'
                  : 'bg-surface border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold truncate ${activePhone === c.phone ? 'text-accent-deep' : 'text-ink'}`}>
                    {c.profile_name || `+${c.phone}`}
                  </span>
                  <span className="text-xs text-ink-muted shrink-0 tnum">{fmtTime(c.last_at)}</span>
                </div>
                <p className="text-xs text-ink-muted truncate mt-0.5">
                  {c.last_direction === 'outbound' && <span className="text-accent">You: </span>}
                  {c.last_body}
                </p>
              </button>
            ))}
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
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="tri-ring w-9 h-9 shrink-0"><span className="flex items-center justify-center font-heading font-bold text-sm text-accent-deep">
                    {(activeConv?.profile_name || '#').charAt(0).toUpperCase()}
                  </span></span>
                  <div className="min-w-0">
                    <p className="font-heading font-bold text-[15px] text-ink truncate">{activeConv?.profile_name || `+${activePhone}`}</p>
                    <p className="text-xs text-ink-muted flex items-center gap-1"><Phone className="w-3 h-3" /> +{activePhone}</p>
                  </div>
                </div>
                {activeConv?.matched_id && (
                  <Button size="sm" variant="secondary" icon={<User className="w-4 h-4" />} onClick={openRecord}>
                    Open {activeConv.matched_entity === 'customer' ? 'Customer' : 'Lead'}
                  </Button>
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
              <button onClick={() => setShowSim(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-ink-muted"><X className="w-4 h-4" /></button>
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
                Unknown numbers auto-create a <span className="font-semibold text-ink">Lead</span> (source: WhatsApp). Known numbers attach to the matched record.
              </p>
              <Button className="w-full" onClick={simulate}>Deliver message</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
