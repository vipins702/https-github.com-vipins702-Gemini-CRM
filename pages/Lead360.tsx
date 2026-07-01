import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Mail, Phone, Building, Target, Loader2, Send, UserPlus, Check,
  FileText, MessageSquare, Activity as ActivityIcon, Clock, Globe, Hash, Camera,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { ConfirmationDialog } from '../components/ui/ConfirmationDialog';
import { Attachments } from '../components/Attachments';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';
import { formatCurrency } from '../services/currency';
import { CRMRecord, RelatedActivity, Activity, ViewState } from '../types';

interface Props {
  leadId: string;
  onBack: () => void;
  onNavigate?: (view: ViewState, params?: any) => void;
}

export const Lead360: React.FC<Props> = ({ leadId, onBack, onNavigate }) => {
  const { addToast } = useToast();
  const [lead, setLead] = useState<any>(null);
  const [activity, setActivity] = useState<RelatedActivity | null>(null);
  const [timeline, setTimeline] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [converting, setConverting] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const res = await api.uploadProfileImage('lead', leadId, file);
      setLead((prev: any) => ({ ...prev, profileImage: res.url }));
      addToast('Photo updated', 'success');
    } catch { addToast('Upload failed', 'error'); }
    finally { setUploadingAvatar(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [rec, act, tl] = await Promise.all([
        api.getRecord('lead', leadId),               // flattened: fields top-level
        api.getRelatedActivity('lead', leadId).catch(() => null),
        api.getActivities(leadId, 'lead').catch(() => []),
      ]);
      setLead(rec || null);
      setActivity(act);
      setTimeline(tl || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);

  const name = lead ? ([lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.name || lead.company || 'Lead') : '';
  const initials = (name || 'L').split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();

  const addNote = async () => {
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      await api.createActivity(leadId, { note: note.trim() }, 'lead', 'note');
      setNote('');
      setTimeline(await api.getActivities(leadId, 'lead'));
      // Fire AI task generation in the background
      api.generateLeadFollowupTasks(leadId).catch(console.error);
    } finally { setSavingNote(false); }
  };

  const convert = async () => {
    setConverting(true);
    try {
      const r = await api.convertLead(leadId);
      addToast(r.alreadyConverted ? 'Already converted to a customer' : `Converted → ${r.customerName || 'customer'}`, 'success');
      await load();
      if (r.customerId && onNavigate) onNavigate('customer-360', { customerId: r.customerId });
    } catch (e: any) {
      addToast(e?.message || 'Convert failed', 'error');
    } finally { setConverting(false); }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton variant="card" className="h-32" />
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-4"><Skeleton variant="card" className="h-64" /></div>
          <div className="col-span-12 lg:col-span-8"><Skeleton variant="card" className="h-64" /></div>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-8 text-center">
        <p className="text-ink-muted">Lead not found.</p>
        <Button variant="secondary" className="mt-4" icon={<ArrowLeft className="w-4 h-4" />} onClick={onBack}>Back</Button>
      </div>
    );
  }

  const isConverted = !!lead._converted_to_customer;
  const score = Number(lead.score || 0);

  return (
    <div className="p-6 lg:p-8 font-sans animate-in fade-in duration-300">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to pipeline
      </button>

      {/* Hero header */}
      <div className="glass-showcase p-6 mb-6 flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="tri-ring w-16 h-16">
            {lead.profileImage
              ? <img src={lead.profileImage} className="w-full h-full object-cover rounded-full" alt={name} />
              : <span className="flex items-center justify-center font-heading font-extrabold text-xl text-[#1E40AF]">{initials}</span>
            }
          </span>
          <label className="flex items-center gap-1 cursor-pointer text-[10px] text-[#2563EB] hover:underline font-medium">
            {uploadingAvatar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
            {lead.profileImage ? 'Change photo' : 'Add photo'}
            <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
          </label>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink">{name}</h1>
            <Badge status={lead.status} />
            {isConverted && <span className="status-pill status-green">Converted</span>}
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-sm text-ink-muted flex-wrap">
            {lead.company && <span className="flex items-center gap-1.5"><Building className="w-3.5 h-3.5" />{lead.company}</span>}
            {lead.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{lead.email}</span>}
            {lead.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{lead.phone}</span>}
            {lead.source && <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />{lead.source}</span>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {!isConverted && (
            <Button icon={converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} onClick={() => setShowConvertConfirm(true)} disabled={converting}>
              Convert to Customer
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* LEFT: key facts */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card title="Key Info">
            <div className="space-y-3.5">
              {[
                { icon: Mail,     label: 'Email',    value: lead.email,    color: 'bg-blue-100 text-blue-700' },
                { icon: Phone,    label: 'Phone',    value: lead.phone,    color: 'bg-emerald-100 text-emerald-700' },
                { icon: Building, label: 'Company',  value: lead.company,  color: 'bg-orange-100 text-orange-700' },
                { icon: Globe,    label: 'Source',   value: lead.source,   color: 'bg-violet-100 text-violet-700' },
                { icon: Target,   label: 'Industry', value: lead.industry, color: 'bg-rose-100 text-rose-700' },
                { icon: Hash,     label: 'Title',    value: lead.title,    color: 'bg-cyan-100 text-cyan-700' },
              ].filter(r => r.value || ['Email','Phone','Company','Source'].includes(r.label)).map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="flex items-center gap-3 text-sm">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}><Icon className="w-[18px] h-[18px]" /></div>
                  <div className="min-w-0">
                    <div className="mono-label text-[10px]">{label}</div>
                    <div className="text-ink font-medium truncate">{value || '—'}</div>
                  </div>
                </div>
              ))}
              {lead.value > 0 && (
                <div className="pt-3.5 border-t border-slate-100">
                  <div className="mono-label text-[10px] mb-1">Deal Value</div>
                  <div className="font-heading text-2xl font-extrabold text-[#047857] tnum">{formatCurrency(Number(lead.value))}</div>
                </div>
              )}
              {score > 0 && (
                <div className="pt-3.5 border-t border-slate-100">
                  <div className="mono-label text-[10px] mb-1.5 flex items-center gap-1"><Target className="w-3 h-3" /> Lead Score</div>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-extrabold text-[#1E40AF] tnum leading-none">{score}</div>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-[#2563EB] rounded-full" style={{ width: `${Math.min(score, 100)}%` }} /></div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="Attachments">
            <Attachments entityType="lead" recordId={leadId} />
          </Card>
        </div>

        {/* RIGHT: activity + timeline */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Related activity incl. stage history */}
          <Card title="Activity & History" >
            {!activity ? (
              <div className="py-6 text-center text-sm text-ink-muted flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Stage history */}
                <div className="md:col-span-2">
                  <p className="mono-label mb-2 flex items-center gap-1.5"><ActivityIcon className="w-3.5 h-3.5" /> Stage History ({activity.stageHistory?.length || 0})</p>
                  {(!activity.stageHistory || activity.stageHistory.length === 0) ? (
                    <p className="text-xs text-ink-muted">No stage changes yet. Move this lead on the Pipeline to build history.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {activity.stageHistory.slice(0, 8).map(hs => (
                        <div key={hs.id} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50/60">
                          <span className="text-xs text-slate-600">
                            {hs.from && <span className="text-slate-400">{hs.from} → </span>}
                            <span className="font-semibold text-ink">{hs.to}</span>
                            {hs.note && <span className="text-ink-soft"> — “{hs.note}”</span>}
                          </span>
                          <span className="ml-auto text-[10px] text-slate-400 shrink-0">{hs.actor} · {new Date(hs.created_at).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {activity.quotes.length > 0 && (
                  <div>
                    <p className="mono-label mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Quotes ({activity.quotes.length})</p>
                    <div className="space-y-1.5">
                      {activity.quotes.slice(0, 5).map(q => (
                        <button key={q.id} onClick={() => onNavigate?.('quotes', { recordId: q.id })} className="w-full flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-slate-50 text-left">
                          <span className="text-xs font-semibold text-ink truncate">{q.quoteNumber}</span>
                          <span className="flex items-center gap-2 shrink-0"><span className="text-xs font-bold text-[#047857] tnum">{formatCurrency(q.total, q.currency)}</span><Badge status={q.status} /></span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {activity.tasks.length > 0 && (
                  <div>
                    <p className="mono-label mb-2 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Tasks ({activity.tasks.length})</p>
                    <div className="space-y-1.5">
                      {activity.tasks.slice(0, 5).map(tk => (
                        <div key={tk.id} className="flex items-center justify-between gap-2 p-2 rounded-lg">
                          <span className="text-xs text-ink truncate">{tk.subject}</span><Badge status={tk.status} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {activity.emails.length > 0 && (
                  <div>
                    <p className="mono-label mb-2 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Emails ({activity.emails.length})</p>
                    <div className="space-y-1.5">
                      {activity.emails.slice(0, 5).map(em => (
                        <div key={em.id} className="flex items-center gap-2 p-2 rounded-lg">
                          <Mail className={`w-3.5 h-3.5 shrink-0 ${em.direction === 'outbound' ? 'text-indigo-500' : 'text-slate-400'}`} />
                          <span className="text-xs text-ink truncate flex-1">{em.subject}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {activity.whatsapp.length > 0 && (
                  <div>
                    <p className="mono-label mb-2 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp ({activity.whatsapp.length})</p>
                    <div className="space-y-1.5">
                      {activity.whatsapp.slice(0, 5).map(w => (
                        <div key={w.id} className="flex items-center gap-2 p-2 rounded-lg">
                          <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${w.direction === 'outbound' ? 'text-emerald-500' : 'text-slate-400'}`} />
                          <span className="text-xs text-ink truncate flex-1">{w.body}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Timeline + note */}
          <Card title="Timeline">
            <div className="flex gap-2 mb-4">
              <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()} placeholder="Add a note…" className="flex-1" />
              <Button icon={savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} onClick={addNote} disabled={savingNote || !note.trim()}>Add</Button>
            </div>
            {timeline.length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-4">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {timeline.slice(0, 20).map((a: any, i) => (
                  <div key={a.id || i} className="flex gap-3 text-sm">
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><Clock className="w-3.5 h-3.5 text-slate-400" /></div>
                    <div className="min-w-0">
                      <p className="text-ink">
                        <span className="font-semibold capitalize">{a.action || 'note'}</span>
                        {a.details?.note && <span className="text-ink-soft"> — {a.details.note}</span>}
                        {a.details?.to && <span className="text-ink-soft"> — {a.details.from ? `${a.details.from} → ` : ''}{a.details.to}{a.details.note ? ` (“${a.details.note}”)` : ''}</span>}
                      </p>
                      <p className="text-[11px] text-slate-400">{a.timestamp || a.created_at ? new Date(a.timestamp || a.created_at).toLocaleString() : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ConfirmationDialog
        isOpen={showConvertConfirm}
        title="Convert to Customer?"
        message={`Convert "${name}" from a lead to a customer record? This will create a customer profile and link all activity.`}
        confirmText="Convert"
        onConfirm={async () => {
          await convert();
          setShowConvertConfirm(false);
        }}
        onCancel={() => setShowConvertConfirm(false)}
        isLoading={converting}
      />
    </div>
  );
};
