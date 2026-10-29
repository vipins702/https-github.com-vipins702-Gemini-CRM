import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Mail, Phone, Building, Target, Loader2, Globe, DollarSign, AlertCircle, Sparkles,
  ChevronRight, ShoppingBag, Package, MapPin, Briefcase, Users, Star, FileText, CheckCircle2,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { Attachments } from '../components/Attachments';
import {
  Avatar360, QuickActions, contactActions, StageProgress, StatTile, AboutList, ActivityTimeline,
} from '../components/Record360';
import { api } from '../services/api';
import { formatCurrency } from '../services/currency';
import { RelatedActivity, Activity, ViewState, ProcessStage } from '../types';

interface Props {
  customerId: string;
  onBack: () => void;
  onNavigate?: (view: ViewState, params?: any) => void;
}

// ── Row in the "Related" list ────────────────────────────────────────────────
const RelatedRow: React.FC<{
  icon: React.ElementType; tone: string; title: string; subtitle?: string; badge?: string; meta?: string; onClick?: () => void;
}> = ({ icon: Icon, tone, title, subtitle, badge, meta, onClick }) => {
  const body = (
    <>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}><Icon className="w-[18px] h-[18px]" aria-hidden="true" /></div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{title}</div>
        {subtitle && <div className="text-xs text-gray-500 truncate">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {meta && <span className="text-sm font-semibold text-gray-900 tnum">{meta}</span>}
        {badge && <Badge status={badge} />}
        {onClick && <ChevronRight className="w-4 h-4 text-gray-300" aria-hidden="true" />}
      </div>
    </>
  );
  return onClick
    ? <button onClick={onClick} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors">{body}</button>
    : <div className="flex items-center gap-3 px-5 py-3">{body}</div>;
};

const EmptyRelated: React.FC<{ icon: React.ElementType; label: string }> = ({ icon: Icon, label }) => (
  <div className="py-10 flex flex-col items-center gap-2 text-center">
    <div className="w-11 h-11 rounded-2xl bg-gray-100 flex items-center justify-center"><Icon className="w-5 h-5 text-gray-400" aria-hidden="true" /></div>
    <p className="text-sm text-gray-500">{label}</p>
  </div>
);

export const Customer360: React.FC<Props> = ({ customerId, onBack, onNavigate }) => {
  const { addToast } = useToast();
  const [customer, setCustomer]     = useState<any>(null);
  const [activity, setActivity]     = useState<RelatedActivity | null>(null);
  const [timeline, setTimeline]     = useState<Activity[]>([]);
  const [stages, setStages]         = useState<ProcessStage[]>([]);
  const [relatedCases, setRelatedCases] = useState<any[]>([]);
  const [relatedLeads, setRelatedLeads] = useState<any[]>([]);
  const [relatedProducts, setRelatedProducts] = useState<{ id: string; name: string; qty: number; price: number; currency: string }[]>([]);
  const [loading, setLoading]       = useState(true);
  const [note, setNote]             = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [aiInsight, setAiInsight]   = useState<{ title: string; description: string; action: string; source: string } | null>(null);
  const [aiLoading, setAiLoading]   = useState(false);
  const [relatedTab, setRelatedTab] = useState<'cases' | 'leads' | 'products' | 'quotes' | 'tasks'>('cases');
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [rec, act, tl, cases, leads, quotes, proc] = await Promise.all([
        api.getRecord('customer', customerId),
        api.getRelatedActivity('customer', customerId).catch(() => null),
        api.getActivities(customerId, 'customer').catch(() => []),
        api.getRecords('case').catch(() => []),
        api.getRecords('lead').catch(() => []),
        api.getRecords('quote').catch(() => []),
        api.getProcess('customer').catch(() => null),
      ]);
      setCustomer(rec || null);
      setActivity(act);
      setTimeline(tl || []);
      setStages(proc?.stages || []);

      // Broad match for related cases
      setRelatedCases((cases as any[]).filter((c: any) =>
        c.customerId === customerId || c.customer_id === customerId ||
        c.accountId === customerId || c.relatedCustomer === customerId
      ));

      // Broad match for related leads
      setRelatedLeads((leads as any[]).filter((l: any) =>
        l.customerId === customerId || l.customer_id === customerId ||
        l.convertedCustomerId === customerId || l.relatedCustomer === customerId
      ));

      // Products from this customer's quotes — aggregate line items
      const custQuotes = (quotes as any[]).filter((q: any) =>
        q.customerId === customerId || q.customer_id === customerId
      );
      const prodMap: Record<string, { id: string; name: string; qty: number; price: number; currency: string }> = {};
      for (const q of custQuotes) {
        let items: any[] = [];
        try { items = typeof q.lineItems === 'string' ? JSON.parse(q.lineItems) : (q.lineItems || []); } catch {}
        for (const li of items) {
          const pid = li.productId || li.id || li.name;
          if (!pid) continue;
          if (prodMap[pid]) { prodMap[pid].qty += Number(li.qty || li.quantity || 1); }
          else {
            prodMap[pid] = {
              id: pid,
              name: li.productName || li.name || 'Product',
              qty: Number(li.qty || li.quantity || 1),
              price: Number(li.unitPrice || li.price || 0),
              currency: q.currency || 'USD',
            };
          }
        }
      }
      setRelatedProducts(Object.values(prodMap));

      if (rec) {
        setAiLoading(true);
        api.getCustomerInsight({ name: rec.name || rec.primary_display, industry: rec.industry, status: rec.status })
          .then(r => setAiInsight(r?.insight ?? null)).catch(() => setAiInsight(null))
          .finally(() => setAiLoading(false));
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [customerId]);

  const name = customer
    ? (customer.name || customer.primary_display || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Customer')
    : '';

  const ltv = relatedLeads.reduce((s, l) => s + Number(l.value || 0), 0)
            + relatedProducts.reduce((s, p) => s + p.price * p.qty, 0);
  const openCasesCount = relatedCases.filter(c => !['Closed', 'Resolved'].includes(c.status || '')).length;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const res = await api.uploadProfileImage('customer', customerId, file);
      setCustomer((prev: any) => ({ ...prev, profileImage: res.url }));
      addToast('Photo updated', 'success');
    } catch { addToast('Upload failed', 'error'); }
    finally { setUploadingAvatar(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      await api.createActivity(customerId, { note: note.trim() }, 'customer', 'note');
      setNote('');
      setTimeline(await api.getActivities(customerId, 'customer'));
    } finally { setSavingNote(false); }
  };

  if (loading) return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <Skeleton variant="card" className="h-56" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} variant="card" className="h-20" />)}</div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4"><Skeleton variant="card" className="h-72" /></div>
        <div className="col-span-12 lg:col-span-8"><Skeleton variant="card" className="h-72" /></div>
      </div>
    </div>
  );

  if (!customer) return (
    <div className="p-8 text-center">
      <p className="text-ink-muted">Customer not found.</p>
      <Button variant="secondary" className="mt-4" icon={<ArrowLeft className="w-4 h-4" />} onClick={onBack}>Back</Button>
    </div>
  );

  const phone = customer.phone || customer.mobile;
  const relatedTabs = [
    { id: 'cases' as const, label: 'Cases', count: relatedCases.length },
    { id: 'leads' as const, label: 'Leads', count: relatedLeads.length },
    { id: 'products' as const, label: 'Products', count: relatedProducts.length },
    { id: 'quotes' as const, label: 'Quotes', count: activity?.quotes?.length || 0 },
    { id: 'tasks' as const, label: 'Tasks', count: activity?.tasks?.length || 0 },
  ];

  return (
    <div className="p-6 lg:p-8 font-sans max-w-[1400px] mx-auto panel-rise">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-deep transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <section className="glass-showcase p-6 mb-5" aria-label="Customer summary">
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <Avatar360 name={name} image={customer.profileImage} onUpload={handleAvatarUpload} uploading={uploadingAvatar} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-heading text-[28px] leading-tight font-semibold tracking-tight text-gray-900 truncate">{name}</h1>
              {customer.status && <Badge status={customer.status} />}
              {customer.industry && <span className="status-pill status-neutral">{customer.industry}</span>}
            </div>
            {customer.company && customer.company !== name && <p className="text-[15px] text-gray-600 mt-0.5 truncate">{customer.company}</p>}
            <div className="flex items-center gap-x-4 gap-y-1 mt-2 text-sm text-gray-500 flex-wrap">
              {customer.email && <span className="flex items-center gap-1.5 min-w-0"><Mail className="w-4 h-4 shrink-0" /><span className="truncate">{customer.email}</span></span>}
              {phone && <span className="flex items-center gap-1.5"><Phone className="w-4 h-4" />{phone}</span>}
              {customer.website && <span className="flex items-center gap-1.5"><Globe className="w-4 h-4" />{customer.website}</span>}
            </div>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-gray-100 flex flex-col xl:flex-row xl:items-center gap-5">
          <QuickActions actions={contactActions({
            phone,
            email: customer.email,
            onWhatsApp: onNavigate && (() => onNavigate('whatsapp', { phone })),
            onEmail: onNavigate && (() => onNavigate('email-inbox', { email: customer.email })),
            onNote: () => noteRef.current?.focus(),
            onEdit: onNavigate && (() => onNavigate('customer', { editId: customerId })),
          })} />
          {stages.length > 0 && <div className="flex-1 min-w-0"><StageProgress stages={stages} current={customer.status} /></div>}
        </div>
      </section>

      {/* Key numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Lifetime value" value={formatCurrency(ltv)} icon={DollarSign} tone="green" />
        <StatTile label="Open cases" value={openCasesCount} sub={`${relatedCases.length} total`} icon={AlertCircle} tone={openCasesCount > 0 ? 'pink' : 'teal'} />
        <StatTile label="Leads" value={relatedLeads.length} icon={Target} tone="accent" />
        <StatTile label="Products" value={relatedProducts.length} icon={Package} tone="purple" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card title="About">
            <AboutList rows={[
              { icon: Mail, label: 'Email', value: customer.email, href: customer.email ? `mailto:${customer.email}` : undefined },
              { icon: Phone, label: 'Phone', value: phone, href: phone ? `tel:${phone}` : undefined },
              { icon: Building, label: 'Company', value: customer.company },
              { icon: Briefcase, label: 'Industry', value: customer.industry },
              ...(customer.website ? [{ icon: Globe, label: 'Website', value: customer.website, href: /^https?:/.test(customer.website) ? customer.website : `https://${customer.website}` }] : []),
              ...(customer.address ? [{ icon: MapPin, label: 'Address', value: customer.address }] : []),
              ...(customer.segment ? [{ icon: Users, label: 'Segment', value: customer.segment }] : []),
              ...(customer.tier ? [{ icon: Star, label: 'Tier', value: customer.tier }] : []),
            ]} />
          </Card>

          {(aiLoading || aiInsight) && (
            <section className="rounded-2xl p-5 bg-gradient-to-b from-purple-50 to-accent-50 shadow-[var(--elev-1)]" aria-label="Suggested next step">
              <div className="flex items-center gap-2 text-purple-700">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span className="text-xs font-semibold">Suggested next step</span>
                {aiLoading && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" />}
              </div>
              {aiInsight && (
                <>
                  <h3 className="text-[15px] font-semibold text-gray-900 mt-2">{aiInsight.title}</h3>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{aiInsight.description}</p>
                  {aiInsight.source !== 'gemini' && <p className="text-xs text-gray-500 mt-2">Based on simple rules — connect AI in Settings for tailored suggestions.</p>}
                </>
              )}
            </section>
          )}

          <Card title="Files">
            <Attachments entityType="customer" recordId={customerId} />
          </Card>
        </div>

        {/* Right */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <ActivityTimeline
            timeline={timeline}
            activity={activity}
            note={note}
            onNoteChange={setNote}
            onAddNote={addNote}
            savingNote={savingNote}
            noteInputRef={noteRef}
          />

          {/* Everything linked to this customer, one tab at a time */}
          <section className="glass-showcase overflow-hidden" aria-label="Related records">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100">
              <h3 className="font-heading text-[17px] font-semibold text-gray-900">Related</h3>
              <div className="mt-3 inline-flex p-0.5 rounded-xl bg-gray-100 gap-0.5 flex-wrap" role="tablist" aria-label="Related records">
                {relatedTabs.map(t => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={relatedTab === t.id}
                    onClick={() => setRelatedTab(t.id)}
                    className={`h-8 px-3 rounded-[10px] text-sm font-medium transition-colors ${relatedTab === t.id ? 'bg-surface text-gray-900 shadow-[var(--elev-1)]' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    {t.label} <span className="text-gray-400 tnum">{t.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {relatedTab === 'cases' && (relatedCases.length === 0
                ? <EmptyRelated icon={AlertCircle} label="No support cases for this customer." />
                : relatedCases.slice(0, 20).map((c: any) => (
                  <RelatedRow key={c.id} icon={AlertCircle}
                    tone={['High', 'Critical'].includes(c.priority) ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'}
                    title={c.subject || c.primary_display || c.name || 'Case'}
                    subtitle={c.priority ? `Priority: ${c.priority}` : undefined}
                    badge={c.status}
                    onClick={() => onNavigate?.('case' as ViewState, { editId: c.id })} />
                )))}

              {relatedTab === 'leads' && (relatedLeads.length === 0
                ? <EmptyRelated icon={Target} label="No leads linked to this customer." />
                : relatedLeads.slice(0, 20).map((lead: any) => (
                  <RelatedRow key={lead.id} icon={Target} tone="bg-accent-50 text-accent-700"
                    title={[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.name || lead.primary_display || 'Lead'}
                    subtitle={lead.company || lead.source || undefined}
                    badge={lead.status}
                    meta={lead.value > 0 ? formatCurrency(Number(lead.value)) : undefined}
                    onClick={() => onNavigate?.('lead-360', { leadId: lead.id })} />
                )))}

              {relatedTab === 'products' && (relatedProducts.length === 0
                ? <EmptyRelated icon={Package} label="No products yet. Products appear here from quotes." />
                : <>
                  {relatedProducts.map(p => (
                    <RelatedRow key={p.id} icon={ShoppingBag} tone="bg-purple-50 text-purple-700"
                      title={p.name} subtitle={`${p.qty} × ${formatCurrency(p.price, p.currency)}`}
                      meta={formatCurrency(p.price * p.qty, p.currency)} />
                  ))}
                  <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
                    <span className="text-sm font-medium text-gray-600">Total</span>
                    <span className="text-sm font-semibold text-gray-900 tnum">{formatCurrency(relatedProducts.reduce((s, p) => s + p.price * p.qty, 0))}</span>
                  </div>
                </>)}

              {relatedTab === 'quotes' && (!activity?.quotes?.length
                ? <EmptyRelated icon={FileText} label="No quotes yet." />
                : activity.quotes.slice(0, 20).map(q => (
                  <RelatedRow key={q.id} icon={FileText} tone="bg-green-50 text-green-700"
                    title={q.quoteNumber || 'Quote'} badge={q.status} meta={formatCurrency(q.total, q.currency)}
                    onClick={() => onNavigate?.('quotes', { recordId: q.id })} />
                )))}

              {relatedTab === 'tasks' && (!activity?.tasks?.length
                ? <EmptyRelated icon={CheckCircle2} label="No tasks yet." />
                : activity.tasks.slice(0, 20).map(t => (
                  <RelatedRow key={t.id} icon={CheckCircle2}
                    tone={/complete|done/i.test(t.status) ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}
                    title={t.subject} subtitle={t.dueDate ? `Due ${new Date(t.dueDate).toLocaleDateString()}` : undefined} badge={t.status} />
                )))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
