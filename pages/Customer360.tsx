import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Mail, Phone, Building, Target, Loader2, Send, Camera,
  FileText, MessageSquare, Activity as ActivityIcon, Clock, Globe,
  DollarSign, AlertCircle, Zap, Check, ChevronRight, ShoppingBag,
  Package, MapPin, Briefcase, Users, Star, TrendingUp,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { Attachments } from '../components/Attachments';
import { api } from '../services/api';
import { formatCurrency } from '../services/currency';
import { CRMRecord, RelatedActivity, Activity, ViewState } from '../types';

interface Props {
  customerId: string;
  onBack: () => void;
  onNavigate?: (view: ViewState, params?: any) => void;
}

// ── Colourful icon cell ──────────────────────────────────────────────────────
const IconCell: React.FC<{ icon: React.ElementType; bg: string; fg: string }> = ({ icon: Icon, bg, fg }) => (
  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
    <Icon className={`w-[18px] h-[18px] ${fg}`} />
  </div>
);

// ── Drillable row card ────────────────────────────────────────────────────────
const DrillRow: React.FC<{
  iconBg: string; iconFg: string; icon: React.ElementType;
  title: string; subtitle?: string; badge?: string; meta?: string;
  onClick?: () => void;
}> = ({ iconBg, iconFg, icon: Icon, title, subtitle, badge, meta, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 text-left transition-colors group"
  >
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
      <Icon className={`w-[18px] h-[18px] ${iconFg}`} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-ink truncate">{title}</div>
      {subtitle && <div className="text-xs text-ink-muted truncate">{subtitle}</div>}
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {badge && <Badge status={badge} />}
      {meta && <span className="text-xs font-bold text-[#0F766E] tnum">{meta}</span>}
      {onClick && <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />}
    </div>
  </button>
);

// ── Empty state ───────────────────────────────────────────────────────────────
const EmptyState: React.FC<{ icon: React.ElementType; label: string }> = ({ icon: Icon, label }) => (
  <div className="py-6 flex flex-col items-center gap-2 text-center">
    <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center">
      <Icon className="w-5 h-5 text-slate-300" />
    </div>
    <p className="text-xs text-ink-muted">{label}</p>
  </div>
);

export const Customer360: React.FC<Props> = ({ customerId, onBack, onNavigate }) => {
  const { addToast } = useToast();
  const [customer, setCustomer]     = useState<any>(null);
  const [activity, setActivity]     = useState<RelatedActivity | null>(null);
  const [timeline, setTimeline]     = useState<Activity[]>([]);
  const [relatedCases, setRelatedCases] = useState<any[]>([]);
  const [relatedLeads, setRelatedLeads] = useState<any[]>([]);
  const [relatedProducts, setRelatedProducts] = useState<{ id: string; name: string; qty: number; price: number; currency: string }[]>([]);
  const [loading, setLoading]       = useState(true);
  const [note, setNote]             = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [aiInsight, setAiInsight]   = useState<{ title: string; description: string; action: string; source: string } | null>(null);
  const [aiLoading, setAiLoading]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [rec, act, tl, cases, leads, quotes] = await Promise.all([
        api.getRecord('customer', customerId),
        api.getRelatedActivity('customer', customerId).catch(() => null),
        api.getActivities(customerId, 'customer').catch(() => []),
        api.getRecords('case').catch(() => []),
        api.getRecords('lead').catch(() => []),
        api.getRecords('quote').catch(() => []),
      ]);
      setCustomer(rec || null);
      setActivity(act);
      setTimeline(tl || []);

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
  const initials = (name || 'C').split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();

  const ltv = relatedLeads.reduce((s, l) => s + Number(l.value || 0), 0)
            + relatedProducts.reduce((s, p) => s + p.price * p.qty, 0);
  const openCasesCount = relatedCases.filter(c => !['Closed', 'Resolved'].includes(c.status || '')).length;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await api.uploadProfileImage('customer', customerId, file);
      setCustomer((prev: any) => ({ ...prev, profileImage: res.url }));
      addToast('Photo updated', 'success');
    } catch { addToast('Upload failed', 'error'); }
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
    <div className="p-6 lg:p-8 space-y-6">
      <Skeleton variant="card" className="h-40" />
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Skeleton variant="card" className="h-72" />
          <Skeleton variant="card" className="h-40" />
        </div>
        <div className="col-span-12 lg:col-span-8 space-y-4">
          <Skeleton variant="card" className="h-48" />
          <Skeleton variant="card" className="h-56" />
        </div>
      </div>
    </div>
  );

  if (!customer) return (
    <div className="p-8 text-center">
      <p className="text-ink-muted">Customer not found.</p>
      <Button variant="secondary" className="mt-4" icon={<ArrowLeft className="w-4 h-4" />} onClick={onBack}>Back</Button>
    </div>
  );

  const kpiChips = [
    { label: 'LTV', value: formatCurrency(ltv), color: 'text-[#0F766E]', bg: 'bg-emerald-50', icon: DollarSign },
    { label: 'Open Cases', value: openCasesCount, color: openCasesCount > 0 ? 'text-rose-600' : 'text-[#0F766E]', bg: openCasesCount > 0 ? 'bg-rose-50' : 'bg-emerald-50', icon: AlertCircle },
    { label: 'Leads', value: relatedLeads.length, color: 'text-[#3730A3]', bg: 'bg-blue-50', icon: Target },
    { label: 'Products', value: relatedProducts.length, color: 'text-[#7C3AED]', bg: 'bg-purple-50', icon: Package },
  ];

  // Info rows with distinct colours
  const infoRows = [
    { icon: Mail,      bg: 'bg-blue-100',   fg: 'text-blue-700',   label: 'Email',    value: customer.email },
    { icon: Phone,     bg: 'bg-emerald-100', fg: 'text-emerald-700',label: 'Phone',    value: customer.phone },
    { icon: Building,  bg: 'bg-orange-100',  fg: 'text-orange-700', label: 'Company',  value: customer.company },
    { icon: Briefcase, bg: 'bg-violet-100',  fg: 'text-violet-700', label: 'Industry', value: customer.industry },
    { icon: Globe,     bg: 'bg-cyan-100',    fg: 'text-cyan-700',   label: 'Website',  value: customer.website },
    { icon: MapPin,    bg: 'bg-rose-100',    fg: 'text-rose-700',   label: 'Address',  value: customer.address },
    { icon: Users,     bg: 'bg-amber-100',   fg: 'text-amber-700',  label: 'Segment',  value: customer.segment },
    { icon: Star,      bg: 'bg-yellow-100',  fg: 'text-yellow-700', label: 'Tier',     value: customer.tier },
  ].filter(r => r.value);

  return (
    <div className="p-6 lg:p-8 font-sans animate-in fade-in duration-300">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Customers
      </button>

      {/* ── Hero ── */}
      <div className="glass-showcase p-6 mb-6 flex flex-col md:flex-row md:items-start gap-5">
        {/* Avatar + persistent camera button */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="relative group">
            <span className="tri-ring w-20 h-20">
              {customer.profileImage
                ? <img src={customer.profileImage} className="w-full h-full object-cover rounded-full" alt={name} />
                : <span className="flex items-center justify-center font-heading font-extrabold text-2xl text-[#3730A3]">{initials}</span>
              }
            </span>
          </div>
          <label className="flex items-center gap-1 text-xs font-medium text-[#4F46E5] hover:text-[#3730A3] cursor-pointer transition-colors">
            <Camera className="w-3.5 h-3.5" />
            {customer.profileImage ? 'Change photo' : 'Add photo'}
            <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarUpload} />
          </label>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-1.5">
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink">{name}</h1>
            <Badge status={customer.status} />
            {customer.industry && <span className="status-pill">{customer.industry}</span>}
          </div>
          <div className="flex items-center gap-4 text-sm text-ink-muted flex-wrap mb-4">
            {customer.company && <span className="flex items-center gap-1.5"><Building className="w-3.5 h-3.5" />{customer.company}</span>}
            {customer.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{customer.email}</span>}
            {customer.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{customer.phone}</span>}
            {customer.website && <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />{customer.website}</span>}
          </div>

          {/* KPI chips */}
          <div className="flex gap-3 flex-wrap">
            {kpiChips.map(({ label, value, color, bg, icon: Icon }) => (
              <div key={label} className={`flex items-center gap-2 ${bg} rounded-xl px-3 py-2`}>
                <Icon className={`w-4 h-4 ${color}`} />
                <div>
                  <div className="mono-label text-[9px]">{label}</div>
                  <div className={`font-bold text-sm tnum leading-none ${color}`}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="grid grid-cols-12 gap-6">

        {/* LEFT col */}
        <div className="col-span-12 lg:col-span-4 space-y-6">

          {/* Key Info */}
          <Card title="Key Info">
            {infoRows.length === 0
              ? <p className="text-sm text-ink-muted text-center py-4">No details on record.</p>
              : (
                <div className="space-y-3">
                  {infoRows.map(({ icon: Icon, bg, fg, label, value }) => (
                    <div key={label} className="flex items-center gap-3 text-sm">
                      <IconCell icon={Icon} bg={bg} fg={fg} />
                      <div className="min-w-0">
                        <div className="mono-label text-[10px]">{label}</div>
                        <div className="text-ink font-medium truncate">{value}</div>
                      </div>
                    </div>
                  ))}
                  {ltv > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="mono-label text-[10px] mb-1">Lifetime Value</div>
                      <div className="font-heading text-2xl font-extrabold text-[#0F766E] tnum">{formatCurrency(ltv)}</div>
                    </div>
                  )}
                </div>
              )}
          </Card>

          {/* AI Next Best Action */}
          {(aiLoading || aiInsight) && (
            <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-28 h-28 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2 text-indigo-300">
                  <Zap className="w-4 h-4" />
                  <span className="mono-label text-[10px]">AI Next Best Action</span>
                  {aiLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                  {!aiLoading && aiInsight?.source === 'gemini' && (
                    <span className="ml-auto text-[9px] font-semibold uppercase tracking-widest bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full ring-1 ring-inset ring-indigo-400/30">Gemini</span>
                  )}
                </div>
                {aiInsight && (
                  <>
                    <h3 className="text-base font-bold mb-1.5 tracking-tight">{aiInsight.title}</h3>
                    <p className="text-slate-300 text-xs leading-relaxed mb-4">{aiInsight.description}</p>
                    <Button className="w-full bg-white hover:bg-indigo-50 text-indigo-950 font-semibold border-none rounded-xl">
                      {aiInsight.action || 'Execute Action'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Attachments */}
          <Card title="Attachments">
            <Attachments entityType="customer" recordId={customerId} />
          </Card>
        </div>

        {/* RIGHT col */}
        <div className="col-span-12 lg:col-span-8 space-y-6">

          {/* ── Cases card ── always visible ── */}
          <Card title={`Support Cases (${relatedCases.length})`}>
            {relatedCases.length === 0
              ? <EmptyState icon={AlertCircle} label="No support cases for this customer." />
              : (
                <div className="divide-y divide-slate-50">
                  {relatedCases.slice(0, 10).map((c: any) => (
                    <DrillRow
                      key={c.id}
                      icon={AlertCircle}
                      iconBg={['High', 'Critical'].includes(c.priority) ? 'bg-rose-100' : 'bg-amber-100'}
                      iconFg={['High', 'Critical'].includes(c.priority) ? 'text-rose-600' : 'text-amber-600'}
                      title={c.subject || c.primary_display || c.name || 'Case'}
                      subtitle={c.priority ? `Priority: ${c.priority}` : undefined}
                      badge={c.status}
                      onClick={() => onNavigate?.('case' as ViewState, { recordId: c.id })}
                    />
                  ))}
                </div>
              )}
          </Card>

          {/* ── Leads card ── always visible ── */}
          <Card title={`Related Leads (${relatedLeads.length})`}>
            {relatedLeads.length === 0
              ? <EmptyState icon={Target} label="No leads linked to this customer." />
              : (
                <div className="divide-y divide-slate-50">
                  {relatedLeads.slice(0, 10).map((lead: any) => {
                    const lName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.name || lead.primary_display || 'Lead';
                    return (
                      <DrillRow
                        key={lead.id}
                        icon={Target}
                        iconBg="bg-blue-100"
                        iconFg="text-blue-700"
                        title={lName}
                        subtitle={lead.company || lead.source || undefined}
                        badge={lead.status}
                        meta={lead.value > 0 ? formatCurrency(Number(lead.value)) : undefined}
                        onClick={() => onNavigate?.('lead-360', { leadId: lead.id })}
                      />
                    );
                  })}
                </div>
              )}
          </Card>

          {/* ── Products card ── always visible ── */}
          <Card title={`Purchased Products (${relatedProducts.length})`}>
            {relatedProducts.length === 0
              ? <EmptyState icon={Package} label="No products purchased yet. Products appear here from quotes." />
              : (
                <div className="divide-y divide-slate-50">
                  {relatedProducts.map(p => (
                    <div key={p.id} className="flex items-center gap-3 p-3">
                      <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                        <ShoppingBag className="w-[18px] h-[18px] text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-ink truncate">{p.name}</div>
                        <div className="text-xs text-ink-muted">Qty: {p.qty}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-[#0F766E] tnum">{formatCurrency(p.price * p.qty, p.currency)}</div>
                        <div className="text-[10px] text-ink-muted tnum">@ {formatCurrency(p.price, p.currency)}/unit</div>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-b-xl">
                    <span className="mono-label text-[10px]">Total Products Revenue</span>
                    <span className="font-heading font-extrabold text-[#0F766E] tnum">
                      {formatCurrency(relatedProducts.reduce((s, p) => s + p.price * p.qty, 0))}
                    </span>
                  </div>
                </div>
              )}
          </Card>

          {/* ── Activity & History ── */}
          <Card title="Activity & History">
            {!activity ? (
              <div className="py-6 text-center text-sm text-ink-muted flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="space-y-5">

                {/* Stage History */}
                <div>
                  <p className="mono-label text-[10px] mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-500" /> Stage History ({activity.stageHistory?.length || 0})
                  </p>
                  {(!activity.stageHistory || activity.stageHistory.length === 0)
                    ? <p className="text-xs text-ink-muted">No stage changes yet.</p>
                    : (
                      <div className="space-y-1.5">
                        {activity.stageHistory.slice(0, 6).map(hs => (
                          <div key={hs.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50">
                            <div className="flex-1 min-w-0 text-xs">
                              {hs.from && <span className="text-slate-400">{hs.from} → </span>}
                              <span className="font-semibold text-ink">{hs.to}</span>
                              {hs.note && <span className="text-ink-soft"> — "{hs.note}"</span>}
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0">{hs.actor} · {new Date(hs.created_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                </div>

                {/* Quotes */}
                {(activity.quotes?.length ?? 0) > 0 && (
                  <div>
                    <p className="mono-label text-[10px] mb-2 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-500" /> Quotes ({activity.quotes.length})
                    </p>
                    <div className="space-y-1">
                      {activity.quotes.slice(0, 5).map(q => (
                        <DrillRow
                          key={q.id}
                          icon={FileText}
                          iconBg="bg-emerald-100"
                          iconFg="text-emerald-700"
                          title={q.quoteNumber || 'Quote'}
                          badge={q.status}
                          meta={formatCurrency(q.total, q.currency)}
                          onClick={() => onNavigate?.('quotes', { recordId: q.id })}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Tasks */}
                {(activity.tasks?.length ?? 0) > 0 && (
                  <div>
                    <p className="mono-label text-[10px] mb-2 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-indigo-500" /> Tasks ({activity.tasks.length})
                    </p>
                    <div className="space-y-1">
                      {activity.tasks.slice(0, 5).map(tk => (
                        <div key={tk.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50">
                          <span className="text-xs text-ink truncate flex-1">{tk.subject}</span>
                          <Badge status={tk.status} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Emails */}
                {(activity.emails?.length ?? 0) > 0 && (
                  <div>
                    <p className="mono-label text-[10px] mb-2 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-blue-500" /> Emails ({activity.emails.length})
                    </p>
                    <div className="space-y-1">
                      {activity.emails.slice(0, 4).map(em => (
                        <div key={em.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50">
                          <Mail className={`w-3.5 h-3.5 shrink-0 ${em.direction === 'outbound' ? 'text-indigo-500' : 'text-slate-400'}`} />
                          <span className="text-xs text-ink truncate flex-1">{em.subject}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* WhatsApp */}
                {(activity.whatsapp?.length ?? 0) > 0 && (
                  <div>
                    <p className="mono-label text-[10px] mb-2 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-500" /> WhatsApp ({activity.whatsapp.length})
                    </p>
                    <div className="space-y-1">
                      {activity.whatsapp.slice(0, 4).map(w => (
                        <div key={w.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50">
                          <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${w.direction === 'outbound' ? 'text-emerald-500' : 'text-slate-400'}`} />
                          <span className="text-xs text-ink truncate flex-1">{w.body}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!activity.stageHistory?.length && !activity.quotes?.length && !activity.tasks?.length &&
                  !activity.emails?.length && !activity.whatsapp?.length && (
                  <EmptyState icon={ActivityIcon} label="No activity recorded yet." />
                )}
              </div>
            )}
          </Card>

          {/* ── Timeline ── */}
          <Card title="Notes & Timeline">
            <div className="flex gap-2 mb-4">
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNote()}
                placeholder="Add a note…"
                className="flex-1"
              />
              <Button
                icon={savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                onClick={addNote}
                disabled={savingNote || !note.trim()}
              >
                Add
              </Button>
            </div>
            {timeline.length === 0
              ? <p className="text-sm text-ink-muted text-center py-4">No notes yet.</p>
              : (
                <div className="space-y-3">
                  {timeline.slice(0, 20).map((a: any, i) => (
                    <div key={a.id || i} className="flex gap-3 text-sm">
                      <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                        <Clock className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-ink">
                          <span className="font-semibold capitalize">{a.action || 'note'}</span>
                          {a.details?.note && <span className="text-ink-soft"> — {a.details.note}</span>}
                          {a.details?.to && (
                            <span className="text-ink-soft"> — {a.details.from ? `${a.details.from} → ` : ''}{a.details.to}</span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {(a.timestamp || a.created_at) ? new Date(a.timestamp || a.created_at).toLocaleString() : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </Card>

        </div>
      </div>
    </div>
  );
};
