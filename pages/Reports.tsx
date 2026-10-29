import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';
import { formatCurrency } from '../services/currency';
import {
  ReportDefinition, RunReportOptions, ReportResult, EntityDefinition,
  SavedReport, ReportColumnDef, ReportFilterDef,
} from '../types';
import {
  BarChart3, RefreshCw, Loader2, Download, Inbox, Plus, Save, Play,
  Trash2, Table2, TrendingUp, PieChart as PieIcon, Eye, GripVertical, X, Filter,
} from 'lucide-react';

// ─── Colour palette ──────────────────────────────────────────────────────────
const TRI = ['#4F46E5', '#0D9488', '#D97706', '#3730A3', '#0F766E', '#B45309'];
const ACCENT: Record<string, string> = { blue: '#4F46E5', green: '#0D9488', orange: '#D97706' };
const axisTick = { fill: '#6E7490', fontSize: 12, fontWeight: 500 };
const tipStyle = { backgroundColor: '#101528', border: 'none', borderRadius: '12px', color: '#fff' } as React.CSSProperties;

const EmptyViz: React.FC = () => (
  <div className="h-72 flex flex-col items-center justify-center text-center">
    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
      <Inbox className="w-7 h-7 text-slate-300" />
    </div>
    <p className="text-ink font-medium">No data yet</p>
    <p className="text-ink-muted text-sm mt-1">No matching records for the selected filters.</p>
  </div>
);

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props { schemas: Record<string, EntityDefinition> }

// ─── Standard report tab ─────────────────────────────────────────────────────
const StandardReports: React.FC = () => {
  const [defs, setDefs] = useState<ReportDefinition[]>([]);
  const [activeId, setActiveId] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loadingDefs, setLoadingDefs] = useState(true);
  const [running, setRunning] = useState(false);

  const activeDef = useMemo(() => defs.find(d => d.id === activeId), [defs, activeId]);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.listReports();
        setDefs(list);
        if (list.length) setActiveId(list[0].id);
      } finally { setLoadingDefs(false); }
    })();
  }, []);

  useEffect(() => { setParams({}); setFilters({}); setPage(1); setResult(null); }, [activeId]);

  const run = async (toPage = page) => {
    if (!activeDef) return;
    setRunning(true);
    try {
      const filterArr = (Object.entries(filters) as [string, string][]).filter(([, v]) => v !== '').map(([key, value]) => ({ key, op: 'contains' as const, value }));
      const res = await api.runReport(activeDef.id, { params, filters: filterArr, page: toPage, pageSize: 25 });
      setResult(res); setPage(res.page || toPage);
    } finally { setRunning(false); }
  };

  useEffect(() => { if (activeDef) run(1); }, [activeId, JSON.stringify(params)]);

  const byCategory = useMemo(() => {
    const map: Record<string, ReportDefinition[]> = {};
    defs.forEach(d => { (map[d.category] ||= []).push(d); });
    return map;
  }, [defs]);

  const fmtCell = (type: string, v: any) => {
    if (v == null || v === '') return '—';
    if (type === 'currency') return formatCurrency(v);
    if (type === 'number') return Number(v).toLocaleString();
    if (type === 'date') return new Date(v).toLocaleDateString();
    return String(v);
  };

  const exportCsv = () => {
    if (!result) return;
    let headers: string[], lines: string[];
    if (result.mode === 'table' && result.columns) {
      headers = result.columns.map(c => c.label);
      lines = result.rows.map(r => result.columns!.map(c => JSON.stringify(r[c.key] ?? '')).join(','));
    } else {
      headers = [result.dimensionLabel || 'Name', result.measureLabel || 'Value'];
      lines = result.rows.map((r: any) => `${JSON.stringify(r.name)},${r.value}`);
    }
    const csv = [headers.join(','), ...lines].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${activeDef?.id || 'report'}.csv`;
    a.click();
  };

  const renderViz = () => {
    if (!result) return null;
    if (result.mode === 'aggregate') {
      const accent = ACCENT[result.accent || 'blue'];
      const tip = (v: any) => result.measureType === 'currency' ? formatCurrency(v) : Number(v).toLocaleString();
      if (!result.rows.length) return <EmptyViz />;
      if (result.viz === 'pie') return (
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie data={result.rows} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={56} paddingAngle={2}>
              {result.rows.map((_, i) => <Cell key={i} fill={TRI[i % TRI.length]} />)}
            </Pie>
            <Tooltip formatter={(v: any) => tip(v)} contentStyle={tipStyle} />
          </PieChart>
        </ResponsiveContainer>
      );
      if (result.viz === 'line') return (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={result.rows}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#cdd7e6" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} />
            <YAxis axisLine={false} tickLine={false} tick={axisTick} />
            <Tooltip formatter={(v: any) => tip(v)} contentStyle={tipStyle} />
            <Line type="monotone" dataKey="value" stroke={accent} strokeWidth={3} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      );
      return (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={result.rows}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#cdd7e6" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} />
            <YAxis axisLine={false} tickLine={false} tick={axisTick} />
            <Tooltip formatter={(v: any) => tip(v)} cursor={{ fill: 'rgba(37,99,235,0.06)' }} contentStyle={tipStyle} />
            <Bar dataKey="value" fill={accent} radius={[6, 6, 0, 0]} maxBarSize={64} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    const cols = result.columns || [];
    return (
      <div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200">
                {cols.map(c => <th key={c.key} className="px-4 py-3 text-left mono-label whitespace-nowrap">{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.length === 0 ? (
                <tr><td colSpan={cols.length} className="px-4 py-12 text-center text-ink-muted text-sm">No rows match.</td></tr>
              ) : result.rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {cols.map(c => (
                    <td key={c.key} className={`px-4 py-3 text-sm whitespace-nowrap ${c.type === 'currency' ? 'text-emerald-700 font-semibold' : 'text-ink'}`}>
                      {c.type === 'status' ? <Badge status={r[c.key]} /> : fmtCell(c.type, r[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200">
          <span className="text-sm text-ink-muted">{result.total} rows · page {result.page} of {result.pageCount}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={(result.page || 1) <= 1 || running} onClick={() => run((result.page || 1) - 1)}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={(result.page || 1) >= (result.pageCount || 1) || running} onClick={() => run((result.page || 1) + 1)}>Next</Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-12 lg:col-span-3 space-y-5">
        {loadingDefs ? <Card><div className="space-y-3"><Skeleton variant="text" /><Skeleton variant="text" /><Skeleton variant="text" /></div></Card>
          : (Object.entries(byCategory) as [string, ReportDefinition[]][]).map(([cat, items]) => (
            <div key={cat}>
              <p className="mono-label mb-2 px-1">{cat}</p>
              <div className="space-y-1.5">
                {items.map(d => (
                  <button key={d.id} onClick={() => setActiveId(d.id)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-all ${activeId === d.id ? 'bg-[#4F46E5]/[0.06] border-[#4F46E5]/30' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className={`text-sm font-semibold ${activeId === d.id ? 'text-[#3730A3]' : 'text-ink'}`}>{d.name}</div>
                    <div className="text-xs text-ink-muted mt-0.5 line-clamp-2">{d.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
      </aside>

      <section className="col-span-12 lg:col-span-9">
        {activeDef && (
          <Card variant="showcase" title={activeDef.name} subtitle={activeDef.description}
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={<Download className="w-4 h-4" />} onClick={exportCsv} disabled={!result}>CSV</Button>
                <Button size="sm" icon={running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} onClick={() => run(1)} disabled={running}>Run</Button>
              </div>
            }
          >
            {(activeDef.params.length > 0 || activeDef.filters.length > 0) && (
              <div className="flex flex-wrap gap-3 mb-5">
                {activeDef.params.map(p => (
                  <div key={p.name}>
                    <label className="mono-label block mb-1">{p.label}</label>
                    <input type={p.type === 'date' ? 'date' : p.type === 'number' ? 'number' : 'text'} value={params[p.name] || ''} onChange={e => setParams(s => ({ ...s, [p.name]: e.target.value }))} className="h-9 text-sm w-44" />
                  </div>
                ))}
                {activeDef.filters.map(f => (
                  <div key={f.key}>
                    <label className="mono-label block mb-1">{f.label} contains</label>
                    <input value={filters[f.key] || ''} onChange={e => setFilters(s => ({ ...s, [f.key]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && run(1)} placeholder="Filter…" className="h-9 text-sm w-40" />
                  </div>
                ))}
              </div>
            )}
            {running && !result ? <div className="h-72 flex items-center justify-center"><Skeleton variant="card" className="w-full h-full" /></div> : renderViz()}
          </Card>
        )}
      </section>
    </div>
  );
};

// ─── Viz type icons ───────────────────────────────────────────────────────────
const VIZ_ICONS: Record<string, React.ReactNode> = {
  table: <Table2 className="w-4 h-4" />,
  bar: <BarChart3 className="w-4 h-4" />,
  line: <TrendingUp className="w-4 h-4" />,
  pie: <PieIcon className="w-4 h-4" />,
  metric: <Eye className="w-4 h-4" />,
};
const CHART_COLORS = ['#4F46E5', '#14B8A6', '#F97316', '#8B5CF6', '#EF4444', '#06B6D4'];
const FILTER_OPS = ['eq', 'neq', 'contains', 'gt', 'lt'] as const;
const blankReport = (): SavedReport => ({ name: '', entityType: 'lead', columns: [], filters: [], groupBy: [], sortBy: [], vizType: 'table' });

// ─── Custom Builder tab ───────────────────────────────────────────────────────
const CustomBuilder: React.FC<{ schemas: Record<string, EntityDefinition> }> = ({ schemas }) => {
  const { addToast } = useToast();
  const [report, setReport] = useState<SavedReport>(blankReport());
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [result, setResult] = useState<{ rows: any[]; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTab, setSavedTab] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  const entityFields = useMemo(() => schemas[report.entityType]?.fields || [], [schemas, report.entityType]);

  const loadSaved = async () => {
    setLoadingList(true);
    try { setSavedReports(await api.getSavedReports()); }
    finally { setLoadingList(false); }
  };

  useEffect(() => { loadSaved(); }, []);

  const set = (patch: Partial<SavedReport>) => { setReport(prev => ({ ...prev, ...patch })); setResult(null); };

  const addColumn = (name: string) => {
    if (report.columns.find(c => c.field === name)) return;
    const fd = entityFields.find(f => f.name === name);
    set({ columns: [...report.columns, { field: name, label: fd?.label || name }] });
  };
  const removeColumn = (field: string) => set({ columns: report.columns.filter(c => c.field !== field) });
  const setAgg = (field: string, agg: ReportColumnDef['aggregate']) =>
    set({ columns: report.columns.map(c => c.field === field ? { ...c, aggregate: agg } : c) });

  const addFilter = () => set({ filters: [...report.filters, { field: entityFields[0]?.name || '', op: 'eq', value: '' }] });
  const removeFilter = (i: number) => set({ filters: report.filters.filter((_, idx) => idx !== i) });
  const updateFilter = (i: number, patch: Partial<ReportFilterDef>) =>
    set({ filters: report.filters.map((f, idx) => idx === i ? { ...f, ...patch } : f) });

  const run = async () => {
    setRunning(true);
    try {
      const r = await api.runBuilderReport({ entityType: report.entityType, columns: report.columns, filters: report.filters, groupBy: report.groupBy, sortBy: report.sortBy });
      setResult(r);
    } catch (e: any) { addToast(e?.message || 'Run failed', 'error'); }
    finally { setRunning(false); }
  };

  const save = async () => {
    if (!report.name.trim()) { addToast('Give the report a name first', 'error'); return; }
    if (!report.columns.length) { addToast('Add at least one column', 'error'); return; }
    setSaving(true);
    try { await api.saveReport(report); addToast('Report saved', 'success'); loadSaved(); }
    catch (e: any) { addToast(e?.message || 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  const loadReport = (r: any) => {
    setReport({ id: r.id, name: r.name, description: r.description, entityType: r.entity_type, columns: r.columns, filters: r.filters, groupBy: r.group_by || [], sortBy: r.sort_by || [], vizType: r.viz_type || 'table' });
    setResult(null); setSavedTab(false);
  };

  const deleteReport = async (id: string) => {
    await api.deleteReport(id);
    loadSaved();
    addToast('Deleted', 'success');
  };

  const renderChart = () => {
    if (!result?.rows.length || report.vizType === 'table') return null;
    const rows = result.rows;
    const keys = Object.keys(rows[0] || {}).filter(k => k !== 'id');
    const xKey = keys[0];

    if (report.vizType === 'metric') {
      const nums = keys.slice(1).filter(k => typeof rows[0][k] === 'number');
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs text-blue-700 font-medium mb-1">Total Rows</p>
            <p className="text-3xl font-extrabold text-blue-900">{result.total}</p>
          </div>
          {nums.slice(0, 3).map((k, i) => (
            <div key={k} style={{ background: ['#f0fdf4', '#fff7ed', '#eff6ff'][i] }} className="rounded-xl p-4">
              <p className="text-xs font-medium mb-1" style={{ color: ['#065f46', '#92400e', '#1e3a8a'][i] }}>{k}</p>
              <p className="text-2xl font-extrabold" style={{ color: ['#064e3b', '#78350f', '#1e3a8a'][i] }}>
                {formatCurrency(rows.reduce((s: number, r: any) => s + (Number(r[k]) || 0), 0))}
              </p>
            </div>
          ))}
        </div>
      );
    }

    if (report.vizType === 'pie') {
      const valKey = keys[1] || 'count';
      return (
        <div className="mb-5">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={rows} dataKey={valKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={100} label>
                {rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tipStyle} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    const valueKeys = keys.slice(1).length ? keys.slice(1) : ['count'];
    if (report.vizType === 'bar') return (
      <div className="mb-5">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey={xKey} tick={axisTick} />
            <YAxis tick={axisTick} />
            <Tooltip contentStyle={tipStyle} />
            <Legend />
            {valueKeys.map((k, i) => <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );

    return (
      <div className="mb-5">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey={xKey} tick={axisTick} />
            <YAxis tick={axisTick} />
            <Tooltip contentStyle={tipStyle} />
            <Legend />
            {valueKeys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Sub-tabs: Builder / Saved */}
      <div className="flex items-center gap-3">
        <button onClick={() => setSavedTab(false)} className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${!savedTab ? 'bg-slate-900 text-white' : 'text-ink-muted hover:bg-slate-100'}`}>
          Builder
        </button>
        <button onClick={() => { setSavedTab(true); loadSaved(); }} className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${savedTab ? 'bg-slate-900 text-white' : 'text-ink-muted hover:bg-slate-100'}`}>
          Saved {savedReports.length > 0 && <span className="ml-1 bg-slate-200 text-slate-700 text-xs px-1.5 rounded-full">{savedReports.length}</span>}
        </button>
      </div>

      {/* Saved Reports List */}
      {savedTab ? (
        <Card title="Saved Reports">
          {loadingList ? <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" /></div>
            : savedReports.length === 0 ? (
              <div className="py-10 text-center">
                <BarChart3 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-ink-muted text-sm">No saved reports yet.</p>
              </div>
            ) : (
              <table className="min-w-full">
                <thead><tr className="border-b border-slate-200 bg-slate-50">
                  {['Name', 'Entity', 'Visualization', 'Created'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-ink-muted uppercase tracking-wider">{h}</th>
                  ))}
                  <th />
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {savedReports.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => loadReport(r)}>
                      <td className="px-4 py-2.5 text-sm font-medium text-ink">{r.name}</td>
                      <td className="px-4 py-2.5 text-sm text-ink-muted capitalize">{r.entityType}</td>
                      <td className="px-4 py-2.5"><span className="flex items-center gap-1 text-xs text-ink-muted">{VIZ_ICONS[r.vizType]} {r.vizType}</span></td>
                      <td className="px-4 py-2.5 text-xs text-ink-muted">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={e => { e.stopPropagation(); deleteReport(r.id!); }} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </Card>
      ) : (
        <>
          {/* Config row */}
          <Card title="Report Configuration">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="mono-label block mb-1.5">Report Name</label>
                <input value={report.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Leads by Source" className="w-full" />
              </div>
              <div>
                <label className="mono-label block mb-1.5">Data Source</label>
                <select value={report.entityType} onChange={e => set({ entityType: e.target.value, columns: [], groupBy: [] })} className="w-full">
                  {Object.entries(schemas).length ? (Object.entries(schemas) as [string, EntityDefinition][]).map(([k, s]) => (
                    <option key={k} value={k}>{s.label}</option>
                  )) : (
                    <>
                      <option value="lead">Lead</option>
                      <option value="customer">Customer</option>
                      <option value="case">Case</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="mono-label block mb-1.5">Visualization</label>
                <div className="flex gap-1.5">
                  {(['table', 'bar', 'line', 'pie', 'metric'] as const).map(v => (
                    <button key={v} onClick={() => set({ vizType: v })}
                      className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${report.vizType === v ? 'border-[#4F46E5] bg-blue-50 text-[#4F46E5]' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                    >
                      {VIZ_ICONS[v]}
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Columns + Filters */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Columns / Measures">
              <div className="mb-3">
                <select className="w-full text-sm" onChange={e => { if (e.target.value) addColumn(e.target.value); e.currentTarget.value = ''; }} defaultValue="">
                  <option value="">+ Add column...</option>
                  {entityFields.filter(f => !report.columns.find(c => c.field === f.name)).map(f => (
                    <option key={f.name} value={f.name}>{f.label}</option>
                  ))}
                </select>
              </div>
              {report.columns.length === 0
                ? <p className="text-xs text-ink-muted py-3 text-center">No columns selected</p>
                : <div className="space-y-2">
                  {report.columns.map(col => (
                    <div key={col.field} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <GripVertical className="w-3.5 h-3.5 text-slate-300" />
                      <span className="flex-1 text-sm font-medium text-ink">{col.label}</span>
                      <select value={col.aggregate || ''} onChange={e => setAgg(col.field, (e.target.value || undefined) as any)} className="!text-xs !h-7 !py-0 !px-2 max-w-[80px]">
                        <option value="">—</option>
                        <option value="sum">Sum</option>
                        <option value="count">Count</option>
                        <option value="avg">Avg</option>
                        <option value="max">Max</option>
                      </select>
                      <button onClick={() => removeColumn(col.field)} className="text-slate-400 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              }
            </Card>

            <Card title="Filters">
              {report.filters.length === 0 && <p className="text-xs text-ink-muted py-2">No filters — showing all records.</p>}
              <div className="space-y-2 mb-3">
                {report.filters.map((f, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 items-center">
                    <select className="col-span-4 !text-xs !h-7 !py-0" value={f.field} onChange={e => updateFilter(i, { field: e.target.value })}>
                      <option value="">— field —</option>
                      {entityFields.map(fd => <option key={fd.name} value={fd.name}>{fd.label}</option>)}
                    </select>
                    <select className="col-span-3 !text-xs !h-7 !py-0" value={f.op} onChange={e => updateFilter(i, { op: e.target.value as any })}>
                      {FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                    <input className="col-span-4 !text-xs !h-7 !py-0 !px-2" value={f.value} onChange={e => updateFilter(i, { value: e.target.value })} placeholder="value" />
                    <button onClick={() => removeFilter(i)} className="col-span-1 text-slate-400 hover:text-rose-500 flex justify-center"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
              <button onClick={addFilter} className="text-sm text-[#4F46E5] hover:text-[#4338CA] font-medium flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Add filter
              </button>
            </Card>
          </div>

          {/* Group By + Sort */}
          <Card title="Grouping & Sort">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mono-label block mb-1.5">Group By</label>
                <select value={report.groupBy[0] || ''} onChange={e => set({ groupBy: e.target.value ? [e.target.value] : [] })} className="w-full">
                  <option value="">No grouping</option>
                  {entityFields.map(f => <option key={f.name} value={f.name}>{f.label}</option>)}
                </select>
                <p className="text-xs text-ink-muted mt-1">Aggregates rows and shows count per group</p>
              </div>
              <div>
                <label className="mono-label block mb-1.5">Sort By</label>
                <div className="flex gap-2">
                  <select className="flex-1" value={report.sortBy[0]?.field || ''} onChange={e => set({ sortBy: e.target.value ? [{ field: e.target.value, dir: report.sortBy[0]?.dir || 'desc' }] : [] })}>
                    <option value="">No sort</option>
                    {report.columns.map(c => <option key={c.field} value={c.field}>{c.label}</option>)}
                    {report.groupBy[0] && <option value="count">Count</option>}
                  </select>
                  {report.sortBy[0] && (
                    <select className="w-24" value={report.sortBy[0]?.dir || 'desc'} onChange={e => set({ sortBy: [{ ...report.sortBy[0], dir: e.target.value as any }] })}>
                      <option value="asc">↑ Asc</option>
                      <option value="desc">↓ Desc</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button icon={running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} onClick={run} disabled={running || !report.entityType}>
              Run Report
            </Button>
            <Button variant="secondary" icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} onClick={save} disabled={saving}>
              Save
            </Button>
            <Button variant="ghost" icon={<RefreshCw className="w-4 h-4" />} onClick={() => { setReport(blankReport()); setResult(null); }}>
              Reset
            </Button>
            {result && <span className="text-sm text-ink-muted">{result.total} row{result.total !== 1 ? 's' : ''}</span>}
          </div>

          {/* Results */}
          {result && (
            <Card title={`Results — ${result.total} rows`}>
              {renderChart()}
              {result.rows.length === 0
                ? <EmptyViz />
                : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          {Object.keys(result.rows[0]).filter(k => k !== 'id').map(k => (
                            <th key={k} className="px-3 py-2 text-left text-xs font-semibold text-ink-muted uppercase tracking-wider">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.rows.slice(0, 200).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            {Object.entries(row).filter(([k]) => k !== 'id').map(([k, v]) => (
                              <td key={k} className="px-3 py-2 text-ink">
                                {v == null ? '—' : String(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {result.rows.length > 200 && <p className="text-xs text-ink-muted p-3">Showing first 200 of {result.total} rows</p>}
                  </div>
                )}
            </Card>
          )}
        </>
      )}
    </div>
  );
};

// ─── Saved Reports Viewer (non-admin read-only) ───────────────────────────────
const SavedReportsViewer: React.FC<{ schemas: Record<string, EntityDefinition> }> = ({ schemas }) => {
  const { addToast } = useToast();
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SavedReport | null>(null);
  const [result, setResult] = useState<{ rows: any[]; total: number } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.getSavedReports().then(r => { setSaved(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const run = async (r: SavedReport) => {
    setSelected(r);
    setRunning(true);
    try {
      const res = await api.runBuilderReport({ entityType: r.entityType, columns: r.columns, filters: r.filters, groupBy: r.groupBy, sortBy: r.sortBy });
      setResult(res);
    } catch (e: any) { addToast(e?.message || 'Run failed', 'error'); }
    finally { setRunning(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#4F46E5]" /></div>;
  if (!saved.length) return (
    <Card>
      <div className="py-16 text-center">
        <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-ink font-medium">No saved reports</p>
        <p className="text-ink-muted text-sm mt-1">Ask your admin to create and save reports for your team.</p>
      </div>
    </Card>
  );

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-4 space-y-3">
        {saved.map(r => (
          <button key={r.id} onClick={() => run(r)}
            className={`w-full text-left p-4 rounded-xl border transition-colors ${selected?.id === r.id ? 'border-[#4F46E5] bg-blue-50' : 'border-slate-200 bg-white hover:border-[#4F46E5]/40'}`}>
            <div className="font-semibold text-sm text-ink">{r.name}</div>
            {r.description && <div className="text-xs text-ink-muted mt-0.5">{r.description}</div>}
            <div className="flex items-center gap-2 mt-2">
              <span className="status-pill status-blue">{r.entityType}</span>
              <span className="status-pill">{r.vizType || 'table'}</span>
            </div>
          </button>
        ))}
      </div>
      <div className="col-span-12 lg:col-span-8">
        {running && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#4F46E5]" /></div>}
        {!running && result && selected && (
          <Card title={selected.name}>
            {result.rows.length === 0 ? <EmptyViz /> : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {Object.keys(result.rows[0]).filter(k => k !== 'id').map(k => (
                        <th key={k} className="px-3 py-2 text-left text-xs font-semibold text-ink-muted uppercase tracking-wider">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {Object.entries(row).filter(([k]) => k !== 'id').map(([k, v]) => (
                          <td key={k} className="px-3 py-2 text-ink">{v == null ? '—' : String(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-ink-muted p-3">{result.total} row{result.total !== 1 ? 's' : ''}</p>
              </div>
            )}
          </Card>
        )}
        {!running && !result && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Eye className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-ink-muted text-sm">Select a report on the left to run it.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Reports page ────────────────────────────────────────────────────────
export const Reports: React.FC<Props> = ({ schemas }) => {
  const isAdmin = useMemo(() => {
    try {
      const s = JSON.parse(localStorage.getItem('flowcrm_session') || '{}');
      return s?.user?.role === 'admin' || s?.user?.permissions?.admin === true;
    } catch { return false; }
  }, []);

  const [tab, setTab] = useState<'standard' | 'builder'>('standard');

  return (
    <div className="p-6 lg:p-8 font-sans">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2.5">
            <span className="tri-ring-sq w-9 h-9"><span className="flex items-center justify-center"><BarChart3 className="w-[18px] h-[18px] text-[#4F46E5]" /></span></span>
            Reports
          </h1>
          <p className="text-ink-muted text-sm mt-1">Standard analytics &amp; custom configurable reports.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('standard')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === 'standard' ? 'bg-[#4F46E5] text-white' : 'text-ink-muted hover:bg-slate-100'}`}>
            Standard Reports
          </button>
          {isAdmin ? (
            <button onClick={() => setTab('builder')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === 'builder' ? 'bg-[#4F46E5] text-white' : 'text-ink-muted hover:bg-slate-100'}`}>
              <span className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Custom Builder</span>
            </button>
          ) : (
            <button onClick={() => setTab('builder')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === 'builder' ? 'bg-[#4F46E5] text-white' : 'text-ink-muted hover:bg-slate-100'}`}>
              <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Saved Reports</span>
            </button>
          )}
        </div>
      </div>

      {tab === 'standard' ? (
        <StandardReports />
      ) : isAdmin ? (
        <CustomBuilder schemas={schemas} />
      ) : (
        <SavedReportsViewer schemas={schemas} />
      )}
    </div>
  );
};
