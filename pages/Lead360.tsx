import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Mail, Phone, Building, Target, Loader2, UserPlus, Globe, Hash, Briefcase,
  DollarSign, Gauge, UserCircle, CalendarClock, FileText, CheckCircle2, ChevronRight,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { ConfirmationDialog } from '../components/ui/ConfirmationDialog';
import { Attachments } from '../components/Attachments';
import { useToast } from '../components/ui/Toast';
import {
  Avatar360, QuickActions, contactActions, StageProgress, StatTile, AboutList, ActivityTimeline, parseTs, timeAgo,
} from '../components/Record360';
import { api } from '../services/api';
import { formatCurrency } from '../services/currency';
import { RelatedActivity, Activity, ViewState, ProcessStage, User } from '../types';

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
  const [stages, setStages] = useState<ProcessStage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [converting, setConverting] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

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
      const [rec, act, tl, proc, us] = await Promise.all([
        api.getRecord('lead', leadId),               // flattened: fields top-level
        api.getRelatedActivity('lead', leadId).catch(() => null),
        api.getActivities(leadId, 'lead').catch(() => []),
        api.getProcess('lead').catch(() => null),
        api.getUsers().catch(() => []),
      ]);
      setLead(rec || null);
      setActivity(act);
      setTimeline(tl || []);
      setStages(proc?.stages || []);
      setUsers(us || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);

  const name = lead ? ([lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.name || lead.company || lead.email || lead.phone || 'Unnamed lead') : '';

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
      <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
        <Skeleton variant="card" className="h-56" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} variant="card" className="h-20" />)}</div>
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
  const value = Number(lead.value || 0);
  const owner = users.find(u => u.id === (lead.owner_id || lead.ownerId || lead.assigneeId));
  const created = parseTs(lead.created_at);
  const subtitle = [lead.title, lead.company].filter(Boolean).join(' · ');

  return (
    <div className="p-6 lg:p-8 font-sans max-w-[1400px] mx-auto panel-rise">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-deep transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header: who, where they are in the pipeline, and what you can do */}
      <section className="glass-showcase p-6 mb-5" aria-label="Lead summary">
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <Avatar360 name={name} image={lead.profileImage} onUpload={handleAvatarUpload} uploading={uploadingAvatar} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-heading text-[28px] leading-tight font-semibold tracking-tight text-gray-900 truncate">{name}</h1>
              {lead.status && <Badge status={lead.status} />}
              {isConverted && <span className="status-pill status-green">Converted</span>}
            </div>
            {subtitle && <p className="text-[15px] text-gray-600 mt-0.5 truncate">{subtitle}</p>}
            <div className="flex items-center gap-x-4 gap-y-1 mt-2 text-sm text-gray-500 flex-wrap">
              {lead.email && <span className="flex items-center gap-1.5 min-w-0"><Mail className="w-4 h-4 shrink-0" /><span className="truncate">{lead.email}</span></span>}
              {lead.phone && <span className="flex items-center gap-1.5"><Phone className="w-4 h-4" />{lead.phone}</span>}
              {lead.source && <span className="flex items-center gap-1.5"><Globe className="w-4 h-4" />{lead.source}</span>}
            </div>
          </div>
          {!isConverted && (
            <Button className="shrink-0" icon={converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} onClick={() => setShowConvertConfirm(true)} disabled={converting}>
              Convert to customer
            </Button>
          )}
        </div>

        <div className="mt-5 pt-5 border-t border-gray-100 flex flex-col xl:flex-row xl:items-center gap-5">
          <QuickActions actions={contactActions({
            phone: lead.phone || lead.mobile,
            email: lead.email,
            onWhatsApp: onNavigate && (() => onNavigate('whatsapp', { phone: lead.phone || lead.mobile })),
            onEmail: onNavigate && (() => onNavigate('email-inbox', { email: lead.email })),
            onNote: () => noteRef.current?.focus(),
            onEdit: onNavigate && (() => onNavigate('lead', { editId: leadId })),
          })} />
          {stages.length > 0 && <div className="flex-1 min-w-0"><StageProgress stages={stages} current={lead.status} /></div>}
        </div>
      </section>

      {/* Key numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Deal value" value={value > 0 ? formatCurrency(value) : '—'} icon={DollarSign} tone="green" />
        <StatTile label="Lead score" value={score > 0 ? score : '—'} icon={Gauge} tone="purple">
          {score > 0 && <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.min(score, 100)}%` }} /></div>}
        </StatTile>
        <StatTile label="Owner" value={owner ? (owner.name || owner.email) : 'Unassigned'} icon={UserCircle} tone="accent" />
        <StatTile label="Added" value={created ? timeAgo(created) : '—'} sub={created?.toLocaleDateString()} icon={CalendarClock} tone="orange" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left: details and related work */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card title="About">
            <AboutList rows={[
              { icon: Mail, label: 'Email', value: lead.email, href: lead.email ? `mailto:${lead.email}` : undefined },
              { icon: Phone, label: 'Phone', value: lead.phone || lead.mobile, href: (lead.phone || lead.mobile) ? `tel:${lead.phone || lead.mobile}` : undefined },
              { icon: Building, label: 'Company', value: lead.company },
              { icon: Briefcase, label: 'Title', value: lead.title },
              { icon: Globe, label: 'Source', value: lead.source },
              ...(lead.industry ? [{ icon: Target, label: 'Industry', value: lead.industry }] : []),
              ...(lead.website ? [{ icon: Hash, label: 'Website', value: lead.website, href: /^https?:/.test(lead.website) ? lead.website : `https://${lead.website}` }] : []),
            ]} />
          </Card>

          {!!activity?.tasks.length && (
            <Card title={`Tasks · ${activity.tasks.length}`} noPadding>
              <ul className="divide-y divide-gray-100">
                {activity.tasks.slice(0, 6).map(t => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <CheckCircle2 className={`w-5 h-5 shrink-0 ${/complete|done/i.test(t.status) ? 'text-green-500' : 'text-gray-300'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.subject}</p>
                      {t.dueDate && <p className="text-xs text-gray-500">Due {new Date(t.dueDate).toLocaleDateString()}</p>}
                    </div>
                    <Badge status={t.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {!!activity?.quotes.length && (
            <Card title={`Quotes · ${activity.quotes.length}`} noPadding>
              <ul className="divide-y divide-gray-100">
                {activity.quotes.slice(0, 6).map(q => (
                  <li key={q.id}>
                    <button onClick={() => onNavigate?.('quotes', { recordId: q.id })} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors">
                      <FileText className="w-5 h-5 text-purple-500 shrink-0" aria-hidden="true" />
                      <span className="text-sm font-medium text-gray-900 truncate flex-1">{q.quoteNumber}</span>
                      <span className="text-sm font-semibold text-gray-900 tnum">{formatCurrency(q.total, q.currency)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Files">
            <Attachments entityType="lead" recordId={leadId} />
          </Card>
        </div>

        {/* Right: everything that happened, in one place */}
        <div className="col-span-12 lg:col-span-8">
          <ActivityTimeline
            timeline={timeline}
            activity={activity}
            note={note}
            onNoteChange={setNote}
            onAddNote={addNote}
            savingNote={savingNote}
            noteInputRef={noteRef}
          />
        </div>
      </div>

      <ConfirmationDialog
        isOpen={showConvertConfirm}
        title="Convert to customer?"
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
