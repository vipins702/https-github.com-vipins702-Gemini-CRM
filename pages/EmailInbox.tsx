import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Send, RefreshCw, Loader2, PenSquare, User, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { api } from '../services/api';
import { EmailConversation, EmailMessage, ViewState } from '../types';

interface Props {
  onNavigate?: (view: ViewState, params?: any) => void;
}

const fmtTime = (s: string) => {
  const d = new Date(s.includes('Z') || s.includes('+') ? s : s + 'Z');
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const EmailInbox: React.FC<Props> = ({ onNavigate }) => {
  const [conversations, setConversations] = useState<EmailConversation[]>([]);
  const [activeEmail, setActiveEmail] = useState<string>('');
  const [thread, setThread] = useState<EmailMessage[]>([]);
  const [mode, setMode] = useState<'live' | 'simulated'>('simulated');
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCompose, setShowCompose] = useState(false);

  // composer (reply or new)
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConv = useMemo(() => conversations.find(c => c.contact_email === activeEmail), [conversations, activeEmail]);

  const loadConversations = async (selectFirst = false) => {
    try {
      const list = await api.getEmailConversations();
      setConversations(list);
      if (selectFirst && list.length && !activeEmail) setActiveEmail(list[0].contact_email);
    } finally {
      setLoadingConvs(false);
    }
  };

  const loadThread = async (email: string, silent = false) => {
    if (!email) return;
    if (!silent) setLoadingThread(true);
    try {
      setThread(await api.getEmailThread(email));
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    api.getEmailStatus().then(s => setMode(s.mode)).catch(() => {});
    loadConversations(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (activeEmail) loadThread(activeEmail); }, [activeEmail]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread.length]);

  // Reply: prefill subject with Re: of the latest message
  const openReply = () => {
    setTo(activeEmail);
    const last = thread[thread.length - 1];
    setSubject(last ? (last.subject.startsWith('Re:') ? last.subject : `Re: ${last.subject}`) : '');
    setBody('');
    setShowCompose(true);
  };

  const openCompose = () => {
    setTo(activeEmail || '');
    setSubject('');
    setBody('');
    setShowCompose(true);
  };

  const send = async () => {
    if (!to.trim() || !subject.trim()) return;
    setSending(true);
    try {
      await api.sendEmail(to.trim(), subject.trim(), body);
      setShowCompose(false);
      const target = to.trim().toLowerCase();
      await loadConversations();
      setActiveEmail(target);
      await loadThread(target, true);
    } finally {
      setSending(false);
    }
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
            <span className="tri-ring-sq w-9 h-9"><span className="flex items-center justify-center"><Mail className="w-[18px] h-[18px] text-[#4F46E5]" /></span></span>
            Email
          </h1>
          <p className="text-ink-muted text-sm mt-1">
            Emails matched to leads & customers, logged to their timeline.
            <span className={`ml-2 status-pill ${mode === 'live' ? 'status-green' : 'status-orange'}`}>{mode}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={<PenSquare className="w-4 h-4" />} onClick={openCompose}>Compose</Button>
          <Button size="sm" variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={() => { loadConversations(); if (activeEmail) loadThread(activeEmail, true); }}>Refresh</Button>
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
                <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-ink-muted">No emails yet.</p>
                <p className="text-xs text-ink-muted mt-1">Use "Compose" to send one.</p>
              </div>
            ) : conversations.map(c => (
              <button
                key={c.contact_email}
                onClick={() => setActiveEmail(c.contact_email)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${activeEmail === c.contact_email
                  ? 'bg-[#4F46E5]/[0.06] border-[#4F46E5]/30'
                  : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold truncate ${activeEmail === c.contact_email ? 'text-[#3730A3]' : 'text-ink'}`}>
                    {c.contact_email}
                  </span>
                  <span className="text-[10px] text-ink-muted shrink-0 tnum">{fmtTime(c.last_at)}</span>
                </div>
                <p className="text-xs text-ink-muted truncate mt-0.5">{c.last_subject}</p>
              </button>
            ))}
          </div>
        </aside>

        {/* Thread */}
        <section className="col-span-12 md:col-span-8 lg:col-span-9 glass-showcase overflow-hidden flex flex-col">
          {!activeEmail ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3"><Mail className="w-7 h-7 text-slate-300" /></div>
              <p className="text-ink font-medium">Select a conversation</p>
              <p className="text-ink-muted text-sm mt-1">Or compose a new email to a lead or customer.</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="tri-ring w-9 h-9 shrink-0"><span className="flex items-center justify-center font-heading font-bold text-sm text-[#3730A3]">
                    {activeEmail.charAt(0).toUpperCase()}
                  </span></span>
                  <div className="min-w-0">
                    <p className="font-heading font-bold text-[15px] text-ink truncate">{activeEmail}</p>
                    {activeConv?.matched_entity && (
                      <p className="text-xs text-ink-muted">Linked to {activeConv.matched_entity}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {activeConv?.matched_id && (
                    <Button size="sm" variant="secondary" icon={<User className="w-4 h-4" />} onClick={openRecord}>
                      Open {activeConv.matched_entity === 'customer' ? 'Customer' : 'Lead'}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" icon={<Send className="w-4 h-4" />} onClick={openReply}>Reply</Button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50/60">
                {loadingThread ? (
                  <div className="space-y-3 pt-2"><Skeleton variant="card" className="h-24" /><Skeleton variant="card" className="h-24" /></div>
                ) : thread.map(m => (
                  <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className={`status-pill ${m.direction === 'outbound' ? 'status-blue' : 'status-neutral'}`}>
                        {m.direction === 'outbound' ? 'Sent' : 'Received'}
                      </span>
                      <span className="text-[11px] text-ink-muted tnum">
                        {fmtTime(m.created_at)}{m.status === 'simulated' ? ' · simulated' : m.status === 'failed' ? ' · failed' : ''}
                      </span>
                    </div>
                    <p className="font-heading font-bold text-[15px] text-ink mb-1">{m.subject}</p>
                    <div className="text-sm text-ink-soft leading-relaxed whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: m.body }} />
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </>
          )}
        </section>
      </div>

      {/* Compose modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowCompose(false)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-[var(--elev-pop)] w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-extrabold text-lg text-ink">Compose email</h2>
              <button onClick={() => setShowCompose(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-ink-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3.5">
              <div>
                <label className="mono-label block mb-1.5">To</label>
                <input value={to} onChange={e => setTo(e.target.value)} placeholder="contact@company.com" />
              </div>
              <div>
                <label className="mono-label block mb-1.5">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line" />
              </div>
              <div>
                <label className="mono-label block mb-1.5">Message</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} placeholder="Write your message…" />
              </div>
              <p className="text-xs text-ink-muted">
                {mode === 'simulated'
                  ? 'Simulated mode — the email is stored and logged to the contact timeline, not actually sent. Add SMTP settings to send for real.'
                  : 'This will be sent via your configured mail server and logged to the contact timeline.'}
              </p>
              <Button className="w-full" onClick={send} disabled={sending || !to.trim() || !subject.trim()}
                icon={sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}>
                {mode === 'simulated' ? 'Send (simulated)' : 'Send email'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
