import React, { useState, useEffect } from 'react';
import { CRMRecord, SystemSettings, ViewState } from '../types';
import { api } from '../services/api';
import { formatCurrency } from '../services/currency';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
    ArrowLeft, Phone, Mail, MapPin, Building, Calendar, Clock,
    MessageSquare, Briefcase, User, Plus, Edit3, Loader2,
    DollarSign, Target, Activity, CreditCard, Wallet, Shield, Settings, Zap, Send,
    CheckCircle, AlertCircle, TrendingUp
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
    PieChart, Pie, Cell, Legend
} from 'recharts';

interface Customer360Props {
    customerId: string;
    onBack: () => void;
    onNavigate?: (view: ViewState, params?: any) => void;
}

interface WidgetProps {
    title: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    action?: React.ReactNode;
}

const Widget: React.FC<WidgetProps> = ({ title, icon, children, className = '', action }) => (
    <div className="bg-white/90 backdrop-blur-xl border border-slate-100 shadow-xl shadow-slate-100/30 rounded-3xl overflow-hidden flex flex-col h-full group hover:shadow-2xl hover:shadow-slate-200/40 transition-all duration-300">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div className="flex items-center gap-3">
                {icon && <div className="text-indigo-600 group-hover:scale-110 transition-transform">{icon}</div>}
                <h3 className="font-semibold text-slate-800 text-sm tracking-tight">{title}</h3>
            </div>
            {action}
        </div>
        <div className="p-6 flex-1 flex flex-col justify-between">
            {children}
        </div>
    </div>
);

export const Customer360: React.FC<Customer360Props> = ({ customerId, onBack, onNavigate }) => {
    const [customer, setCustomer] = useState<CRMRecord | null>(null);
    const [customerData, setCustomerData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [relatedCases, setRelatedCases] = useState<CRMRecord[]>([]);
    const [relatedTasks, setRelatedTasks] = useState<CRMRecord[]>([]);
    const [relatedLeads, setRelatedLeads] = useState<CRMRecord[]>([]);
    const [relatedProducts, setRelatedProducts] = useState<CRMRecord[]>([]);
    const [timeline, setTimeline] = useState<any[]>([]);
    const [noteText, setNoteText] = useState('');
    const [sendingNote, setSendingNote] = useState(false);
    const [aiInsight, setAiInsight] = useState<{ title: string; description: string; action: string; source: string } | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [profileTab, setProfileTab] = useState<'key' | 'financial'>('key');

    useEffect(() => {
        loadData();
    }, [customerId]);

    const isRelatedToCustomer = (r: CRMRecord, cid: string) => {
        if (!r.data) return false;
        try {
            const dataObj = JSON.parse(r.data);
            return dataObj.customerId === cid || dataObj.relatedCustomer === cid;
        } catch (e) {}
        return false;
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const [record, sysSettings, allCases, allTasks, allLeads, allProducts, activities] = await Promise.all([
                api.getRecord('customer', customerId),
                api.getSettings(),
                api.getRecords('case'),
                api.getRecords('task'),
                api.getRecords('lead'),
                api.getRecords('product'),
                api.getActivities(customerId, 'customer')
            ]);
            
            setCustomer(record || null);
            setSettings(sysSettings);
            
            let parsed: any = {};
            if (record) {
                try { parsed = JSON.parse(record.data); } catch (e) {}
                setCustomerData({
                    ...record,
                    ...parsed,
                    name: record.primary_display || (parsed as any).name || 'Unknown Account'
                });
            }

            // Filter cases, tasks, leads, and products by customerId
            const filteredCases = allCases.filter(c => isRelatedToCustomer(c, customerId));
            const filteredTasks = allTasks.filter(t => isRelatedToCustomer(t, customerId));
            const filteredLeads = allLeads.filter(l => isRelatedToCustomer(l, customerId));
            const filteredProducts = allProducts.filter(p => isRelatedToCustomer(p, customerId));

            setRelatedCases(filteredCases);
            setRelatedTasks(filteredTasks);
            setRelatedLeads(filteredLeads);
            setRelatedProducts(filteredProducts);
            setTimeline(activities || []);

            // Fetch AI next-best-action (graceful: null when AI disabled/fails)
            void fetchAIInsight(record, parsed, filteredCases, filteredLeads, filteredProducts);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAIInsight = async (
        record: CRMRecord | undefined,
        parsed: any,
        cases: CRMRecord[],
        leads: CRMRecord[],
        products: CRMRecord[]
    ) => {
        setAiLoading(true);
        try {
            const parseData = (r: CRMRecord) => { try { return JSON.parse((r as any).data); } catch { return {}; } };
            const ltv = leads.reduce((s, l) => s + Number(parseData(l).value || 0), 0)
                + products.reduce((s, p) => s + Number(parseData(p).price || 0), 0);
            const openCount = cases.filter(c => {
                const s = parseData(c).status || (c as any).status || 'New';
                return s !== 'Closed' && s !== 'Resolved';
            }).length;
            const pendingCount = leads.filter(l => {
                const s = parseData(l).status || (l as any).status || 'New';
                return !['Won', 'Lost', 'Closed'].includes(s);
            }).length;

            const res = await api.getCustomerInsight({
                name: parsed?.name || record?.primary_display,
                industry: parsed?.industry,
                status: parsed?.status,
                ltv,
                openCases: openCount,
                pendingLeads: pendingCount,
                risk: openCount > 2 ? 'High' : openCount > 0 ? 'Medium' : 'Low',
                ownedProducts: products.map(p => parseData(p).name || (p as any).primary_display).filter(Boolean),
            });
            setAiInsight(res.insight);
        } catch (e) {
            setAiInsight(null);
        } finally {
            setAiLoading(false);
        }
    };

    const handleCreateCase = () => {
        if (onNavigate) {
            onNavigate('case' as any, { customerId, mode: 'create' });
        }
    };

    const handleCreateTask = () => {
        if (onNavigate) {
            onNavigate('task' as any, { customerId, mode: 'create' });
        }
    };

    const handleViewRecord = (entityType: string, recordId: string) => {
        if (onNavigate) {
            onNavigate(entityType as any, { recordId });
        }
    };

    const handleAddNote = async () => {
        if (!noteText.trim()) return;
        setSendingNote(true);
        try {
            await api.createActivity(customerId, { note: noteText.trim() }, 'customer', 'note');
            setNoteText('');
            // Reload activities
            const activities = await api.getActivities(customerId, 'customer');
            setTimeline(activities || []);
        } catch (e) {
            console.error('Failed to log note:', e);
        } finally {
            setSendingNote(false);
        }
    };

    const getRelativeTime = (dateTimeStr: string) => {
        const d = new Date(dateTimeStr);
        if (isNaN(d.getTime())) return 'Just now';
        const diffMs = Date.now() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHours = Math.floor(diffMin / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    };

    const formatTimelineItem = (item: any) => {
        let title = '';
        let desc = '';
        let detailsObj: any = {};
        try { detailsObj = JSON.parse(item.details); } catch (e) {}

        const actorName = item.actor_first_name 
            ? `${item.actor_first_name} ${item.actor_last_name}` 
            : item.actor_email || 'System';

        let iconColor = 'bg-slate-500';
        let iconType = 'note';

        if (item.action === 'note') {
            title = `Note from ${actorName}`;
            desc = detailsObj.note || detailsObj.content || 'Logged a note';
            iconColor = 'bg-amber-500';
            iconType = 'note';
        } else if (item.action === 'create') {
            title = `Customer Registered`;
            desc = `Created by ${actorName}`;
            iconColor = 'bg-indigo-500';
            iconType = 'create';
        } else if (item.action === 'update') {
            title = `Profile Updated`;
            const changedFields = Object.keys(detailsObj).join(', ');
            desc = changedFields ? `Updated: ${changedFields}` : `Modified details`;
            iconColor = 'bg-sky-500';
            iconType = 'update';
        } else {
            title = `${item.action.toUpperCase()} action`;
            desc = detailsObj.content || JSON.stringify(detailsObj);
            iconColor = 'bg-slate-500';
            iconType = 'other';
        }

        const timeStr = getRelativeTime(item.created_at);

        return {
            title,
            desc,
            time: timeStr,
            iconColor,
            iconType
        };
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;
    if (!customer || !customerData) return <div className="p-8 text-center text-red-500 font-semibold">Customer not found</div>;

    // Compute Metrics
    const computedLtv = relatedLeads.reduce((sum, l: any) => {
        let data: any = {};
        try { data = JSON.parse(l.data); } catch (e) {}
        return sum + Number(data.value || 0);
    }, 0) + relatedProducts.reduce((sum, p: any) => {
        let data: any = {};
        try { data = JSON.parse(p.data); } catch (e) {}
        return sum + Number(data.price || 0);
    }, 0);

    const openCases = relatedCases.filter(c => {
        let data: any = {};
        try { data = JSON.parse(c.data); } catch (e) {}
        const status = data.status || c.status || 'New';
        return status !== 'Closed' && status !== 'Resolved';
    }).length;

    const computedRisk = openCases > 2 ? 'High' : openCases > 0 ? 'Medium' : 'Low';
    
    // Tenure calculation
    const getTenureString = (createdAt: string) => {
        const createdDate = new Date(createdAt);
        if (isNaN(createdDate.getTime())) return 'New';
        const diffMs = Date.now() - createdDate.getTime();
        const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.4375));
        if (diffMonths < 1) return 'New';
        if (diffMonths < 12) return `${diffMonths}m`;
        const years = Math.floor(diffMonths / 12);
        const remMonths = diffMonths % 12;
        return remMonths > 0 ? `${years}y ${remMonths}m` : `${years}y`;
    };
    const tenureStr = getTenureString(customer.created_at);

    // Financial breakdown
    const totalAssets = computedLtv || 5000;
    const deposits = Math.round(totalAssets * 0.6);
    const investments = totalAssets - deposits;

    // AI recommendation content
    let aiRecTitle = 'Upsell Premium Support';
    let aiRecDesc = 'Customer is highly engaged with zero open cases. Recommending a migration to our Enterprise SLA model.';
    if (computedRisk === 'High') {
        aiRecTitle = 'Risk Mitigation Action';
        aiRecDesc = `Customer has ${openCases} open support tickets. Schedule an urgent call with Account Manager to resolve concerns.`;
    } else if (totalAssets > 80000) {
        aiRecTitle = 'Premium Tier Upgrade';
        aiRecDesc = `High LTV detected. Recommend introducing them to our dedicated technical account team.`;
    }

    // Health Score calculation (Max 100, drops by 25 points per open case)
    const healthScore = Math.max(10, 100 - (openCases * 25));
    const strokeDashoffset = 251.2 - (251.2 * healthScore) / 100;

    // KPI strip metrics (CRMNEXT-style)
    const pendingLeads = relatedLeads.filter(l => {
        let d: any = {};
        try { d = JSON.parse(l.data); } catch (e) {}
        const s = d.status || l.status || 'New';
        return !['Won', 'Lost', 'Closed'].includes(s);
    }).length;
    const lastContacted = timeline && timeline.length ? getRelativeTime(timeline[0].created_at) : '—';
    const ltvDisplay = computedLtv >= 1000 ? `$${(computedLtv / 1000).toFixed(1)}k` : `$${computedLtv}`;

    const kpis = [
        { label: 'Customer Lifetime Value', value: ltvDisplay, icon: <DollarSign className="w-5 h-5" />, accent: 'text-emerald-600 bg-emerald-50' },
        { label: 'Active Cases', value: openCases, icon: <Briefcase className="w-5 h-5" />, accent: 'text-orange-600 bg-orange-50' },
        { label: 'Leads Pending', value: pendingLeads, icon: <Target className="w-5 h-5" />, accent: 'text-indigo-600 bg-indigo-50' },
        { label: 'Last Contacted', value: lastContacted, icon: <Clock className="w-5 h-5" />, accent: 'text-sky-600 bg-sky-50' },
    ];

    // Chart data (data-driven from related records)
    const engagementData = [
        { name: 'Leads', value: relatedLeads.length },
        { name: 'Cases', value: relatedCases.length },
        { name: 'Tasks', value: relatedTasks.length },
        { name: 'Products', value: relatedProducts.length },
    ];

    const leadStatusCounts: Record<string, number> = {};
    relatedLeads.forEach(l => {
        let d: any = {};
        try { d = JSON.parse(l.data); } catch (e) {}
        const s = d.status || l.status || 'New';
        leadStatusCounts[s] = (leadStatusCounts[s] || 0) + 1;
    });
    const leadStatusData = Object.entries(leadStatusCounts).map(([name, value]) => ({ name, value }));
    const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#a855f7', '#ef4444'];

    // Product-ownership catalog (CRMNEXT-style grid). Ownership derived from related products.
    const ownsProduct = (key: string) => relatedProducts.some(p => {
        let d: any = {};
        try { d = JSON.parse(p.data); } catch (e) {}
        const hay = `${d.name || ''} ${d.category || ''} ${d.type || ''} ${p.primary_display || ''}`.toLowerCase();
        return hay.includes(key);
    });
    const productCatalog = [
        { key: 'insurance', label: 'Insurance', icon: <Shield className="w-6 h-6" /> },
        { key: 'investment', label: 'Investment', icon: <TrendingUp className="w-6 h-6" /> },
        { key: 'liabilit', label: 'Liability', icon: <Wallet className="w-6 h-6" /> },
        { key: 'asset', label: 'Asset Products', icon: <Briefcase className="w-6 h-6" /> },
        { key: 'credit', label: 'Credit Cards', icon: <CreditCard className="w-6 h-6" /> },
        { key: 'deposit', label: 'Deposit', icon: <DollarSign className="w-6 h-6" /> },
    ];

    return (
        <div className="min-h-screen bg-slate-50 p-6 overflow-x-hidden font-sans">
            {/* Subtle background tint */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[800px] h-[600px] bg-indigo-500/[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
            </div>

            <div className="max-w-[1600px] mx-auto relative z-10 space-y-6">
                {/* Header Bar */}
                <div className="flex items-center justify-between">
                    <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-semibold text-sm">
                        <ArrowLeft className="w-4 h-4" /> Back to Accounts
                    </button>
                    <div className="flex gap-3">
                        <Button variant="outline" icon={<Settings className="w-4 h-4" />} className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-semibold px-4 py-2 text-sm rounded-xl">Customize View</Button>
                        <Button variant="gradient" icon={<Plus className="w-4 h-4" />} onClick={() => onNavigate && onNavigate('lead' as any, { customerId })} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 text-sm rounded-xl shadow-lg shadow-indigo-600/10">New Opportunity</Button>
                    </div>
                </div>

                {/* KPI Strip (CRMNEXT-style) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {kpis.map((kpi, i) => (
                        <div key={i} className="group relative bg-white rounded-2xl px-5 py-4 shadow-sm ring-1 ring-slate-200/70 hover:ring-indigo-200 hover:shadow-md transition-all overflow-hidden">
                            <div className="flex items-center justify-between">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kpi.accent}`}>
                                    {kpi.icon}
                                </div>
                            </div>
                            <div className="mt-3">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest truncate">{kpi.label}</div>
                                <div className="text-2xl font-semibold text-slate-900 tracking-tight truncate mt-0.5 tnum">{kpi.value}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* 3-Column Layout */}
                <div className="grid grid-cols-12 gap-6 pb-20">

                    {/* COLUMN 1: Profile & Key Metrics (3 cols) */}
                    <div className="col-span-12 lg:col-span-3 space-y-6">
                        {/* Profile Card */}
                        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-100/50 border border-slate-100 text-center relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                            {/* Circular health ring */}
                            <div className="relative inline-block mb-4">
                                <svg className="w-28 h-28 transform -rotate-90">
                                    <circle cx="56" cy="56" r="40" stroke="#f1f5f9" strokeWidth="8" fill="transparent" />
                                    <circle cx="56" cy="56" r="40" 
                                            stroke={healthScore > 70 ? "#10b981" : healthScore > 40 ? "#f59e0b" : "#ef4444"} 
                                            strokeWidth="8" fill="transparent" 
                                            strokeDasharray="251.2" 
                                            strokeDashoffset={strokeDashoffset} 
                                            strokeLinecap="round"
                                            className="transition-all duration-1000 ease-out" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-2xl font-bold text-slate-800 tracking-tight">{healthScore}</span>
                                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Health</span>
                                </div>
                            </div>

                            <h2 className="text-2xl font-semibold text-slate-800 mb-1 leading-tight">{customerData.name}</h2>
                            <p className="text-slate-400 text-xs font-semibold mb-4">{customerData.industry || 'Enterprise'} Industry</p>

                            <div className="flex justify-center gap-2 mb-6">
                                <Badge status={customerData.status || 'Active'} size="sm" />
                                <Badge status={healthScore > 70 ? 'Satisfied' : 'Risk Warning'} size="sm" />
                            </div>

                            <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-6">
                                <div>
                                    <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-widest mb-1">LTV</div>
                                    <div className="text-lg font-bold text-slate-800 tracking-tight">${computedLtv >= 1000 ? `${(computedLtv/1000).toFixed(1)}k` : computedLtv}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-widest mb-1">Risk</div>
                                    <div className={`text-lg font-bold tracking-tight ${
                                        computedRisk === 'High' ? 'text-red-500' : computedRisk === 'Medium' ? 'text-amber-500' : 'text-emerald-500'
                                    }`}>{computedRisk}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-widest mb-1">Tenure</div>
                                    <div className="text-lg font-bold text-slate-800 tracking-tight">{tenureStr}</div>
                                </div>
                            </div>
                        </div>

                        {/* Profile Info Tabs (Key Info / Financial Info) */}
                        <div className="bg-white/90 backdrop-blur-xl border border-slate-100 shadow-xl shadow-slate-100/30 rounded-3xl overflow-hidden">
                            <div className="flex border-b border-slate-100">
                                <button
                                    onClick={() => setProfileTab('key')}
                                    className={`flex-1 px-4 py-3.5 text-xs font-semibold uppercase tracking-widest transition-colors ${profileTab === 'key' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/40' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    Key Info
                                </button>
                                <button
                                    onClick={() => setProfileTab('financial')}
                                    className={`flex-1 px-4 py-3.5 text-xs font-semibold uppercase tracking-widest transition-colors ${profileTab === 'financial' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/40' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    Financial Info
                                </button>
                            </div>
                            <div className="p-6">
                                {profileTab === 'key' ? (
                                    <div className="space-y-4 animate-in fade-in duration-200">
                                        {[
                                            { icon: <Mail className="w-4 h-4" />, label: "Email Address", value: customerData.email },
                                            { icon: <Phone className="w-4 h-4" />, label: "Phone Number", value: customerData.phone },
                                            { icon: <MapPin className="w-4 h-4" />, label: "Billing Address", value: customerData.address || '—' },
                                            { icon: <Building className="w-4 h-4" />, label: "Industry", value: customerData.industry || '—' },
                                            { icon: <User className="w-4 h-4" />, label: "Account Owner", value: customerData.accountManager || customerData.assignedto || 'System Admin' },
                                        ].map((item, i) => (
                                            <div key={i} className="flex items-center gap-4 group cursor-pointer hover:bg-slate-50 p-2 rounded-xl transition-all duration-200 -mx-2">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                                    {item.icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">{item.label}</div>
                                                    <div className="text-sm font-semibold text-slate-700 truncate">{item.value || '-'}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in duration-200">
                                        {[
                                            { icon: <DollarSign className="w-4 h-4" />, label: "Lifetime Value", value: formatCurrency(computedLtv) },
                                            { icon: <Wallet className="w-4 h-4" />, label: "Total Assets", value: formatCurrency(totalAssets) },
                                            { icon: <CreditCard className="w-4 h-4" />, label: "Deposits", value: formatCurrency(deposits) },
                                            { icon: <TrendingUp className="w-4 h-4" />, label: "Investments", value: formatCurrency(investments) },
                                            { icon: <Briefcase className="w-4 h-4" />, label: "Annual Revenue", value: customerData.annualRevenue ? formatCurrency(customerData.annualRevenue) : '—' },
                                            { icon: <Shield className="w-4 h-4" />, label: "Risk Level", value: computedRisk },
                                        ].map((item, i) => (
                                            <div key={i} className="flex items-center gap-4 group p-2 rounded-xl hover:bg-slate-50 transition-all duration-200 -mx-2">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                                                    {item.icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">{item.label}</div>
                                                    <div className="text-sm font-semibold text-slate-700 truncate">{item.value}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Next Best Action (AI) */}
                        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:scale-125 transition-transform duration-500"></div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-3 text-indigo-300">
                                    <Zap className="w-4.5 h-4.5" />
                                    <span className="text-[10px] font-semibold uppercase tracking-widest">AI Next Best Action</span>
                                    {aiLoading && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" />}
                                    {!aiLoading && aiInsight?.source === 'gemini' && (
                                        <span className="ml-auto text-[9px] font-semibold uppercase tracking-widest bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full ring-1 ring-inset ring-indigo-400/30">Gemini</span>
                                    )}
                                </div>
                                <h3 className="text-lg font-bold mb-2 tracking-tight">{aiInsight?.title || aiRecTitle}</h3>
                                <p className="text-slate-300 text-xs leading-relaxed mb-5">{aiInsight?.description || aiRecDesc}</p>
                                <Button className="w-full bg-white hover:bg-indigo-50 text-indigo-950 font-semibold border-none py-2.5 rounded-xl shadow-lg shadow-white/5" onClick={() => onNavigate && onNavigate('lead' as any, { customerId })}>
                                    {aiInsight?.action || 'Execute Action'}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* COLUMN 2: Operation Center (5 cols) */}
                    <div className="col-span-12 lg:col-span-5 space-y-6">

                        {/* Quick Actions Grid */}
                        <Widget title="Workspace Utilities" icon={<Zap className="w-4 h-4" />}>
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={handleCreateTask} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 border border-slate-100 hover:border-slate-200 hover:shadow-lg hover:shadow-slate-100/50 transition-all duration-300 text-left group">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform shadow-sm">
                                        <CheckCircle className="w-5 h-5" />
                                    </div>
                                    <span className="font-semibold text-sm text-slate-700 group-hover:text-slate-900">New Task</span>
                                </button>
                                <button onClick={handleCreateCase} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 border border-slate-100 hover:border-slate-200 hover:shadow-lg hover:shadow-slate-100/50 transition-all duration-300 text-left group">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-50 text-orange-600 group-hover:scale-110 transition-transform shadow-sm">
                                        <AlertCircle className="w-5 h-5" />
                                    </div>
                                    <span className="font-semibold text-sm text-slate-700 group-hover:text-slate-900">Create Case</span>
                                </button>
                                <button className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 border border-slate-100 hover:border-slate-200 hover:shadow-lg hover:shadow-slate-100/50 transition-all duration-300 text-left group">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform shadow-sm">
                                        <Phone className="w-5 h-5" />
                                    </div>
                                    <span className="font-semibold text-sm text-slate-700 group-hover:text-slate-900">Log Call</span>
                                </button>
                                <button className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 border border-slate-100 hover:border-slate-200 hover:shadow-lg hover:shadow-slate-100/50 transition-all duration-300 text-left group">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-50 text-purple-600 group-hover:scale-110 transition-transform shadow-sm">
                                        <Mail className="w-5 h-5" />
                                    </div>
                                    <span className="font-semibold text-sm text-slate-700 group-hover:text-slate-900">Send Email</span>
                                </button>
                            </div>
                        </Widget>

                        {/* Analytics Charts */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <Widget title="Engagement Overview" icon={<Activity className="w-4 h-4" />}>
                                <div className="h-56">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={engagementData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                cursor={{ fill: '#f8fafc' }}
                                                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
                                            />
                                            <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#6366f1" maxBarSize={48} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Widget>

                            <Widget title="Leads by Status" icon={<Target className="w-4 h-4" />}>
                                <div className="h-56">
                                    {leadStatusData.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs font-medium">
                                            <Target className="w-8 h-8 mb-2 text-slate-200" />
                                            No lead data yet
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={leadStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                                                    {leadStatusData.map((entry, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                                                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </Widget>
                        </div>

                        {/* Product Holdings Grid (CRMNEXT-style) */}
                        <Widget title="Products" icon={<CreditCard className="w-4 h-4" />}>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {productCatalog.map(prod => {
                                    const owned = ownsProduct(prod.key);
                                    return (
                                        <div
                                            key={prod.key}
                                            className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all ${owned ? 'bg-white border-slate-200 shadow-sm hover:shadow-md' : 'bg-slate-50/50 border-slate-100'}`}
                                        >
                                            {owned && (
                                                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                                                    <CheckCircle className="w-3.5 h-3.5 text-white" />
                                                </span>
                                            )}
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${owned ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-300'}`}>
                                                {prod.icon}
                                            </div>
                                            <span className={`text-xs font-semibold text-center ${owned ? 'text-slate-700' : 'text-slate-400'}`}>{prod.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </Widget>

                        {/* Holdings / Products */}
                        <div className="grid grid-cols-2 gap-4">
                            <Widget title="Portfolio Balance" icon={<Wallet className="w-4 h-4" />}>
                                <div className="space-y-4">
                                    <div className="p-3 bg-gradient-to-r from-slate-50 to-slate-100/50 rounded-2xl border border-slate-100">
                                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">Total Assets</div>
                                        <div className="text-2xl font-bold text-slate-800 tracking-tight">{formatCurrency(totalAssets)}</div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-semibold text-slate-600">
                                            <span>Deposits</span>
                                            <span>{formatCurrency(deposits)}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '60%' }}></div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-semibold text-slate-600">
                                            <span>Investments</span>
                                            <span>{formatCurrency(investments)}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                            <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: '40%' }}></div>
                                        </div>
                                    </div>
                                </div>
                            </Widget>

                            <Widget title="Active Products" icon={<CreditCard className="w-4 h-4" />}>
                                <div className="space-y-3">
                                    {relatedProducts.length === 0 ? (
                                        <div className="text-center py-8 text-slate-400 font-medium text-xs">
                                            <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                                            No active products
                                        </div>
                                    ) : (
                                        relatedProducts.map(prod => {
                                            let pData: any = {};
                                            try { pData = JSON.parse(prod.data); } catch (e) {}
                                            return (
                                                <div key={prod.id} className="flex items-center gap-3 p-2 hover:bg-slate-50/50 rounded-xl cursor-pointer transition-colors duration-200" onClick={() => handleViewRecord('product', prod.id)}>
                                                    <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm shrink-0">
                                                        <Shield className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-semibold text-xs text-slate-700 truncate">{pData.name || prod.primary_display}</div>
                                                        <div className="text-[10px] text-indigo-600 font-semibold">{formatCurrency(pData.price)}</div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </Widget>
                        </div>

                        {/* Opportunities / Leads Widget */}
                        <Widget
                            title="Deals & Opportunities"
                            icon={<Target className="w-4 h-4" />}
                            action={<Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => onNavigate && onNavigate('lead' as any, { customerId })}>New</Button>}
                        >
                            <div className="space-y-3">
                                {relatedLeads.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400 font-medium text-xs">
                                        <Target className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                                        No active opportunities
                                    </div>
                                ) : (
                                    relatedLeads.map(lead => {
                                        let lData: any = {};
                                        try { lData = JSON.parse(lead.data); } catch (e) {}
                                        return (
                                            <div key={lead.id} className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 hover:shadow-lg hover:shadow-slate-100/50 transition-all cursor-pointer bg-white" onClick={() => handleViewRecord('lead', lead.id)}>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                                                        {(lData.firstName || 'L')[0]}
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-slate-800 text-xs">{lData.firstName} {lData.lastName}</div>
                                                        <div className="text-[10px] text-slate-400 font-semibold">{formatCurrency(lData.value)} • {lData.title || 'Lead'}</div>
                                                    </div>
                                                </div>
                                                <Badge status={lData.status || lead.status} size="sm" />
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </Widget>

                        {/* Service Requests Table */}
                        <Widget
                            title="Active Support Cases"
                            icon={<Briefcase className="w-4 h-4" />}
                            action={<Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={handleCreateCase}>New</Button>}
                        >
                            <div className="overflow-x-auto">
                                {relatedCases.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400 font-medium text-xs">
                                        <Briefcase className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                                        No active cases found
                                    </div>
                                ) : (
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-50/50 text-slate-400 font-semibold uppercase tracking-wider">
                                            <tr>
                                                <th className="px-3 py-2.5 rounded-l-lg">Subject</th>
                                                <th className="px-3 py-2.5">Status</th>
                                                <th className="px-3 py-2.5 rounded-r-lg text-right">Priority</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {relatedCases.slice(0, 5).map((caseRecord) => {
                                                let cData: any = {};
                                                try { cData = JSON.parse(caseRecord.data); } catch (e) {}
                                                return (
                                                    <tr
                                                        key={caseRecord.id}
                                                        className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                                                        onClick={() => handleViewRecord('case', caseRecord.id)}
                                                    >
                                                        <td className="px-3 py-3 font-semibold text-slate-700">{cData.subject || caseRecord.subject}</td>
                                                        <td className="px-3 py-3"><Badge status={cData.status || caseRecord.status} size="sm" /></td>
                                                        <td className="px-3 py-3 text-right text-slate-500 font-medium">{cData.priority || caseRecord.priority || '-'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </Widget>
                    </div>

                    {/* COLUMN 3: Activity & Timeline (4 cols) */}
                    <div className="col-span-12 lg:col-span-4 space-y-6">

                        {/* Timeline Widget */}
                        <Widget title="Engagement History" icon={<Clock className="w-4 h-4" />}>
                            <div className="relative space-y-6 pl-4 before:absolute before:left-[19px] before:top-4 before:bottom-4 before:w-0.5 before:bg-gradient-to-b before:from-slate-200 before:to-transparent max-h-[450px] overflow-y-auto pr-2">
                                {timeline.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400 font-semibold text-xs">
                                        <Clock className="w-8 h-8 mx-auto mb-2 text-slate-200 animate-pulse" />
                                        No interactions logged yet
                                    </div>
                                ) : (
                                    timeline.map((item, i) => {
                                        const timelineItem = formatTimelineItem(item);
                                        return (
                                            <div key={item.id || i} className="relative pl-8 group animate-in fade-in slide-in-from-left duration-300">
                                                <div className={`absolute left-0 top-1 w-10 h-10 rounded-full border-4 border-white shadow-md flex items-center justify-center text-white z-10 ${timelineItem.iconColor} transition-transform group-hover:scale-110`}>
                                                    {timelineItem.iconType === 'note' && <MessageSquare className="w-3.5 h-3.5" />}
                                                    {timelineItem.iconType === 'create' && <User className="w-3.5 h-3.5" />}
                                                    {timelineItem.iconType === 'update' && <Edit3 className="w-3.5 h-3.5" />}
                                                    {timelineItem.iconType === 'other' && <Activity className="w-3.5 h-3.5" />}
                                                </div>
                                                <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 group-hover:shadow-lg group-hover:shadow-slate-100/50 transition-all relative">
                                                    <div className="absolute left-[-6px] top-4 w-3 h-3 bg-slate-50/50 border-l border-b border-slate-100 transform rotate-45"></div>
                                                    <h4 className="font-semibold text-slate-800 text-xs leading-snug">{timelineItem.title}</h4>
                                                    <p className="text-slate-500 text-xs leading-relaxed mt-1">{timelineItem.desc}</p>
                                                    <span className="text-[10px] font-semibold text-slate-400 mt-3.5 block uppercase tracking-widest">{timelineItem.time}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            <div className="mt-6 pt-4 border-t border-slate-100">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Add a timeline note..."
                                        value={noteText}
                                        onChange={(e) => setNoteText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                                        disabled={sendingNote}
                                        className="flex-1 bg-slate-50 border border-transparent focus:border-indigo-300 focus:bg-white rounded-xl px-3.5 py-2 text-xs font-medium transition-all outline-none disabled:opacity-50"
                                    />
                                    <Button size="sm" onClick={handleAddNote} disabled={sendingNote || !noteText.trim()} icon={sendingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Send className="w-3.5 h-3.5" />} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/10 shrink-0"></Button>
                                </div>
                            </div>
                        </Widget>

                        {/* Upcoming Tasks */}
                        <Widget
                            title="Assigned Tasks"
                            icon={<Calendar className="w-4 h-4" />}
                            action={<Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={handleCreateTask}>New</Button>}
                        >
                            <div className="space-y-3">
                                {relatedTasks.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400 font-medium text-xs">
                                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                                        No tasks created yet
                                    </div>
                                ) : (
                                    relatedTasks.slice(0, 5).map((task, i) => {
                                        let tData: any = {};
                                        try { tData = JSON.parse(task.data); } catch (e) {}
                                        return (
                                            <div
                                                key={task.id}
                                                className={`flex gap-3 items-start p-3 rounded-2xl border cursor-pointer hover:shadow-lg hover:shadow-slate-100/50 transition-all duration-300 ${i === 0 ? 'bg-indigo-50/30 border-indigo-100' : 'bg-slate-50/50 border-slate-100'}`}
                                                onClick={() => handleViewRecord('task', task.id)}
                                            >
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${tData.status === 'Completed' ? 'bg-emerald-100 text-emerald-600 shadow-sm' : 'bg-indigo-100 text-indigo-600 shadow-sm'}`}>
                                                    <CheckCircle className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="font-semibold text-slate-700 text-xs leading-snug truncate">{tData.subject || task.subject}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Badge status={tData.status || task.status} size="sm" />
                                                        {tData.dueDate && <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Due: {tData.dueDate}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </Widget>

                    </div>
                </div>
            </div>
        </div>
    );
};
