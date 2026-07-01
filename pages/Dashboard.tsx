import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import {
  TrendingUp, Save, Eye, EyeOff, GripVertical, Calendar,
  Plus, X, BarChart3, Table2, Hash, Settings2, RefreshCw,
  ChevronRight, Database,
} from 'lucide-react';
import {
  WidgetConfig, PackResult, PackDefinition, KpiColumnMeta,
  KpiDataset, TimeseriesDataset, AggregateDataset, TableDataset,
} from '../types';
import { api } from '../services/api';
import { formatCurrency } from '../services/currency';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TRI   = ['#2563EB', '#059669', '#EA7317', '#1E40AF', '#047857', '#C75D08'];
const ACCENT = { blue: '#2563EB', green: '#059669', orange: '#EA7317' } as Record<string, string>;
const ORB    = { blue: 'bg-[#2563EB]', green: 'bg-[#059669]', orange: 'bg-[#EA7317]' } as Record<string, string>;
const ICON_BG = { blue: 'bg-[#2563EB]/12 text-[#1E40AF]', green: 'bg-[#059669]/12 text-[#047857]', orange: 'bg-[#EA7317]/14 text-[#C75D08]' } as Record<string, string>;
const axisTick = { fill: '#6E7490', fontSize: 11, fontWeight: 500 };
const tipStyle = { backgroundColor: '#101528', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '12px' } as React.CSSProperties;

const WIDTH_CYCLE: Array<WidgetConfig['width']> = ['third', 'half', 'full'];
const WIDTH_LABEL: Record<string, string> = { third: '1/3', half: '1/2', full: 'Full' };
const colSpan = (w?: string) =>
  w === 'full' ? 'col-span-full' : w === 'half' ? 'lg:col-span-2 md:col-span-1' : 'col-span-1';

function fmtKpi(type: string, v: any): string {
  if (v === null || v === undefined) return '—';
  if (type === 'currency') return formatCurrency(Number(v));
  if (type === 'percent')  return `${Number(v).toFixed(1)}%`;
  if (type === 'number')   return Number(v).toLocaleString();
  return String(v);
}

// ─── KPI Metrics strip — one row, N columns ───────────────────────────────────
const KpiStrip: React.FC<{ ds: KpiDataset; title: string }> = ({ ds, title }) => (
  <Card variant="showcase" title={title} className="h-full">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
      {ds.columns.map(col => {
        const accent = col.accent || 'blue';
        return (
          <div key={col.key} className="relative overflow-hidden">
            <div className={`absolute -right-4 -top-4 w-14 h-14 rounded-full blur-xl opacity-20 ${ORB[accent] || ORB.blue}`} />
            <p className="mono-label text-[10px]">{col.label}</p>
            <p className={`font-heading text-xl font-extrabold tnum mt-1 ${accent === 'green' ? 'text-[#047857]' : accent === 'orange' ? 'text-[#C75D08]' : 'text-ink'}`}>
              {fmtKpi(col.type, ds.row[col.key])}
            </p>
          </div>
        );
      })}
    </div>
  </Card>
);

// ─── Single KPI stat card (one column from kpi dataset) ──────────────────────
const KpiStatCard: React.FC<{ col: KpiColumnMeta; value: any; trend?: string }> = ({ col, value, trend }) => {
  const accent = col.accent || 'blue';
  return (
    <div className={`relative overflow-hidden glass-showcase lift p-5 flex items-start justify-between gap-4 h-full`}>
      <div className={`absolute -right-7 -top-7 w-24 h-24 rounded-full blur-2xl opacity-25 ${ORB[accent] || ORB.blue}`} />
      <div className="min-w-0 relative z-10">
        <p className="mono-label">{col.label}</p>
        <h3 className="font-heading text-[30px] leading-tight font-extrabold text-ink tracking-tight tnum mt-1.5">
          {fmtKpi(col.type, value)}
        </h3>
        {trend && (
          <div className="flex items-center gap-1.5 mt-3">
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#047857] bg-[#059669]/10 ring-1 ring-inset ring-[#059669]/20 px-1.5 py-0.5 rounded-md">
              <TrendingUp className="w-3.5 h-3.5" />{trend}
            </span>
            <span className="text-[11px] font-medium text-ink-muted">vs last month</span>
          </div>
        )}
      </div>
      <div className={`shrink-0 p-3 rounded-xl relative z-10 ${ICON_BG[accent] || ICON_BG.blue}`}>
        <Hash className="w-5 h-5" />
      </div>
    </div>
  );
};

// ─── Timeseries tile ──────────────────────────────────────────────────────────
const TimeseriesTile: React.FC<{ ds: TimeseriesDataset; title: string }> = ({ ds, title }) => {
  const rows   = ds.rows || [];
  const first  = ds.measures[0];
  const second = ds.measures[1];
  return (
    <Card variant="showcase" title={title} subtitle={ds.measures.map(m => m.label).join(' vs ')} className="h-full">
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={rows}>
          <defs>
            {ds.measures.map(m => (
              <linearGradient key={m.key} id={`grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={m.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={m.color} stopOpacity={0}   />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#cdd7e6" />
          <XAxis dataKey="period" axisLine={false} tickLine={false} tick={axisTick} />
          <YAxis axisLine={false} tickLine={false} tick={axisTick} />
          <Tooltip contentStyle={tipStyle} />
          {first  && <Area type="monotone" dataKey={first.key}  stroke={first.color}  strokeWidth={2.5} fill={`url(#grad-${first.key})`}  dot={false} isAnimationActive animationDuration={1400} />}
          {second && <Area type="monotone" dataKey={second.key} stroke={second.color} strokeWidth={2}   fill={`url(#grad-${second.key})`} dot={false} isAnimationActive animationDuration={1600} />}
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2 pl-1">
        {ds.measures.map(m => (
          <span key={m.key} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
            {m.label}
          </span>
        ))}
      </div>
    </Card>
  );
};

// ─── Aggregate tile (bar / pie) ───────────────────────────────────────────────
const AggregateTile: React.FC<{ ds: AggregateDataset; title: string }> = ({ ds, title }) => {
  const accent = ACCENT[ds.accent] || ACCENT.blue;
  const valueCol = ds.columns.find(c => c.type === 'currency' || c.type === 'number');
  const nameCol  = ds.columns.find(c => c.type === 'text');
  const vKey     = valueCol?.key || 'count';
  const nKey     = nameCol?.key  || 'name';
  const fmt      = (v: any) => valueCol?.type === 'currency' ? formatCurrency(v) : Number(v).toLocaleString();

  if (ds.viz === 'pie') {
    return (
      <Card variant="showcase" title={title} className="h-full">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={ds.rows} dataKey={vKey} nameKey={nKey} cx="50%" cy="50%"
              outerRadius={72} innerRadius={38} paddingAngle={2}>
              {ds.rows.map((_, i) => <Cell key={i} fill={TRI[i % TRI.length]} />)}
            </Pie>
            <Tooltip formatter={(v: any) => fmt(v)} contentStyle={tipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </Card>
    );
  }

  return (
    <Card variant="showcase" title={title} className="h-full">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={ds.rows}>
          <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#cdd7e6" />
          <XAxis dataKey={nKey} axisLine={false} tickLine={false} tick={axisTick} />
          <YAxis axisLine={false} tickLine={false} tick={axisTick} />
          <Tooltip formatter={(v: any) => fmt(v)} cursor={{ fill: 'rgba(37,99,235,0.06)' }} contentStyle={tipStyle} />
          <Bar dataKey={vKey} fill={accent} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive animationDuration={1100} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};

// ─── Table tile ───────────────────────────────────────────────────────────────
const TableTile: React.FC<{ ds: TableDataset; title: string }> = ({ ds, title }) => {
  const cols = (ds.columns || []).slice(0, 4);
  return (
    <Card variant="showcase" title={title} className="h-full" noPadding>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-200">
              {cols.map(c => <th key={c.key} className="px-3 py-2 text-left mono-label text-[10px]">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(ds.rows || []).slice(0, 6).map((r, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                {cols.map(c => (
                  <td key={c.key} className="px-3 py-2 text-xs text-ink truncate max-w-[160px]">
                    {c.type === 'status'   ? <Badge status={r[c.key]} /> :
                     c.type === 'currency' ? <span className="text-[#047857] font-semibold tnum">{formatCurrency(r[c.key])}</span> :
                     c.type === 'date'     ? new Date(r[c.key]).toLocaleDateString() :
                     String(r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(ds.total || 0) > 6 && (
        <p className="px-3 py-2 text-[11px] text-ink-muted border-t border-slate-100">
          +{ds.total - 6} more rows
        </p>
      )}
      {ds._cached && (
        <p className="px-3 py-1.5 text-[10px] text-ink-muted border-t border-slate-100 flex items-center gap-1">
          <Database className="w-3 h-3" /> cached {ds._cacheAge ? `${ds._cacheAge}s ago` : ''}
        </p>
      )}
    </Card>
  );
};

// ─── Pack Tile — routes to the right sub-component ───────────────────────────
const PackTile: React.FC<{ widget: WidgetConfig; packResult: PackResult | null; loading: boolean }> = ({ widget, packResult, loading }) => {
  if (loading) return (
    <div className="glass-showcase p-5 h-full min-h-[160px]">
      <Skeleton variant="text" className="w-1/3 mb-3" />
      <Skeleton variant="card" className="h-28" />
    </div>
  );

  if (!packResult || !widget.datasetId) return (
    <div className="glass-showcase p-5 h-full min-h-[160px] flex items-center justify-center">
      <p className="text-sm text-ink-muted">No data</p>
    </div>
  );

  const ds = packResult.datasets[widget.datasetId];
  if (!ds) return (
    <div className="glass-showcase p-5 h-full min-h-[160px] flex items-center justify-center">
      <p className="text-sm text-ink-muted">Dataset "{widget.datasetId}" not found</p>
    </div>
  );

  const title = widget.title;

  if (ds.type === 'kpi') {
    const kpiDs = ds as KpiDataset;
    // Single column KPI stat card
    if (widget.kpiColumn) {
      const col = kpiDs.columns.find(c => c.key === widget.kpiColumn);
      if (col) return <KpiStatCard col={col} value={kpiDs.row[col.key]} />;
    }
    // Full metrics strip
    return <KpiStrip ds={kpiDs} title={title} />;
  }

  if (ds.type === 'timeseries') return <TimeseriesTile ds={ds as TimeseriesDataset} title={title} />;
  if (ds.type === 'aggregate')  return <AggregateTile  ds={ds as AggregateDataset}  title={title} />;
  if (ds.type === 'table')      return <TableTile      ds={ds as TableDataset}       title={title} />;

  return null;
};

// ─── Add Widget Panel ─────────────────────────────────────────────────────────
interface AddPanelProps {
  open: boolean; onClose: () => void;
  onAdd: (w: WidgetConfig) => void;
  packs: PackDefinition[];
  existingIds: Set<string>;
}

const TileOption: React.FC<{ title: string; desc: string; icon: React.ReactNode; added: boolean; onAdd: () => void }> = ({ title, desc, icon, added, onAdd }) => (
  <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
    <div className="shrink-0 mt-0.5 p-2 rounded-lg bg-[#2563EB]/10 text-[#1E40AF]">{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-ink leading-snug">{title}</p>
      <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{desc}</p>
    </div>
    <button onClick={onAdd} disabled={added}
      className={`shrink-0 mt-0.5 h-7 w-7 flex items-center justify-center rounded-lg transition-colors ${
        added ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-[#2563EB] text-white hover:bg-[#1E40AF]'
      }`}>
      {added ? '✓' : <Plus className="w-3.5 h-3.5" />}
    </button>
  </div>
);

const AddPanel: React.FC<AddPanelProps> = ({ open, onClose, onAdd, packs, existingIds }) => {
  const mkId = (base: string) => `${base}-${Date.now()}`;

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />}
      <aside className={`fixed inset-y-0 right-0 w-80 z-50 flex flex-col bg-white border-l border-slate-200 shadow-[var(--elev-pop)] transform transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200/60">
          <h2 className="font-heading font-extrabold text-base text-ink">Add Widget</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-ink-muted"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {packs.map(pack => (
            <section key={pack.id}>
              <p className="mono-label mb-2">{pack.name.toUpperCase()}</p>
              <p className="text-xs text-ink-muted mb-3 -mt-1">{pack.description}</p>
              <div className="space-y-2">
                {pack.datasets.map(ds => {
                  const widId = `pack-${pack.id}-${ds.id}`;

                  if (ds.type === 'kpi') {
                    const cols = ds.columns || [];
                    return (
                      <div key={ds.id} className="p-3 rounded-xl bg-white border border-slate-200">
                        <p className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
                          <Hash className="w-4 h-4 text-[#1E40AF]" /> {ds.label}
                        </p>
                        <div className="pl-6 space-y-1.5">
                          {/* full KPI strip */}
                          <TileOption title="All metrics (strip)" desc="All KPI columns in one row"
                            icon={<BarChart3 className="w-3.5 h-3.5" />} added={existingIds.has(widId)}
                            onAdd={() => onAdd({ id: mkId(widId), title: ds.label, type: 'pack', visible: true, order: 9999, width: 'full', packId: pack.id, datasetId: ds.id })} />
                          {/* individual stat cards */}
                          {cols.map(col => {
                            const cId = `${widId}-${col.key}`;
                            return (
                              <TileOption key={col.key} title={col.label} desc={`Single KPI — ${col.type}`}
                                icon={<Hash className="w-3.5 h-3.5" />} added={existingIds.has(cId)}
                                onAdd={() => onAdd({ id: mkId(cId), title: col.label, type: 'pack', visible: true, order: 9999, width: 'third', packId: pack.id, datasetId: ds.id, kpiColumn: col.key })} />
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  const dsIcon = ds.type === 'table' ? <Table2 className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />;
                  const defaultWidth: WidgetConfig['width'] = ds.type === 'table' ? 'half' : 'half';
                  return (
                    <TileOption key={ds.id} title={ds.label} desc={`${ds.type} · ${ds.viz || ds.type}`}
                      icon={dsIcon} added={existingIds.has(widId)}
                      onAdd={() => onAdd({ id: mkId(widId), title: ds.label, type: 'pack', visible: true, order: 9999, width: defaultWidth, packId: pack.id, datasetId: ds.id })} />
                  );
                })}
              </div>
            </section>
          ))}

          {packs.length === 0 && (
            <p className="text-sm text-ink-muted text-center py-6">No report packs available.</p>
          )}
        </div>
      </aside>
    </>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const Dashboard: React.FC = () => {
  const [widgets,     setWidgets]     = useState<WidgetConfig[]>([]);
  const [packs,       setPacks]       = useState<PackDefinition[]>([]);
  const [packResults, setPackResults] = useState<Record<string, PackResult>>({});
  const [packLoading, setPackLoading] = useState<Record<string, boolean>>({});
  const [isEditMode,  setIsEditMode]  = useState(false);
  const [showPanel,   setShowPanel]   = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [userName,    setUserName]    = useState('Workspace');
  const [draggedId,   setDraggedId]   = useState<string | null>(null);
  const [dragOverId,  setDragOverId]  = useState<string | null>(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('flowcrm_session') || '{}');
      if (s.user?.name) setUserName(s.user.name);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [w, p] = await Promise.all([
          api.getDashboardConfig(),
          api.listReportPacks().catch(() => [] as PackDefinition[]),
        ]);
        setWidgets(w);
        setPacks(p);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // ── Fetch pack data whenever widgets change ────────────────────────────────
  useEffect(() => {
    const packWidgets = widgets.filter(w => w.type === 'pack' && w.packId);
    const uniquePackIds = [...new Set(packWidgets.map(w => `${w.packId}|${JSON.stringify(w.packParams || {})}`))] ;

    uniquePackIds.forEach(async (key: string) => {
      const parts    = key.split('|');
      const packId   = parts[0];
      const params   = JSON.parse(parts.slice(1).join('|') || '{}') as Record<string, string>;
      if (!packId || packResults[key]) return;

      setPackLoading(prev => ({ ...prev, [key]: true }));
      try {
        const result = await api.runReportPack(packId, { params });
        setPackResults(prev => ({ ...prev, [key]: result }));
      } catch (e) {
        console.error('Pack fetch error:', e);
      } finally {
        setPackLoading(prev => ({ ...prev, [key]: false }));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets.map(w => `${w.id}:${w.packId}:${w.datasetId}`).join(',')]);

  const getPackResult = (w: WidgetConfig) => {
    const key = `${w.packId}|${JSON.stringify(w.packParams || {})}`;
    return { result: packResults[key] || null, loading: packLoading[key] || false };
  };

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const onDragStart = (id: string) => setDraggedId(id);
  const onDragOver  = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
    if (!draggedId || draggedId === id) return;
    setWidgets(prev => {
      const arr = [...prev];
      const fi = arr.findIndex(w => w.id === draggedId);
      const ti = arr.findIndex(w => w.id === id);
      if (fi < 0 || ti < 0) return prev;
      const [item] = arr.splice(fi, 1);
      arr.splice(ti, 0, item);
      return arr.map((w, i) => ({ ...w, order: i }));
    });
    setDraggedId(id);
  };
  const onDragEnd = () => { setDraggedId(null); setDragOverId(null); };

  // ── Mutations ──────────────────────────────────────────────────────────────
  const toggleVis    = (id: string) => setWidgets(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  const cycleWidth   = (id: string) => setWidgets(prev => prev.map(w => {
    if (w.id !== id) return w;
    return { ...w, width: WIDTH_CYCLE[(WIDTH_CYCLE.indexOf(w.width || 'third') + 1) % WIDTH_CYCLE.length] };
  }));
  const removeWidget = (id: string) => setWidgets(prev => prev.filter(w => w.id !== id).map((w, i) => ({ ...w, order: i })));
  const addWidget    = (w: WidgetConfig) => setWidgets(prev => [...prev, { ...w, order: prev.length }]);

  const saveLayout = async () => {
    await api.saveDashboardConfig(widgets);
    setIsEditMode(false);
    setShowPanel(false);
  };

  const refreshAll = async () => {
    await api.invalidateReportCache();
    setPackResults({});
  };

  const existingIds = useMemo(() => new Set(widgets.map(w => w.id)), [widgets]);

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
  };

  // ── Content renderer ───────────────────────────────────────────────────────
  const renderTile = (widget: WidgetConfig) => {
    if (widget.type === 'pack') {
      const { result, loading: pl } = getPackResult(widget);
      return <PackTile widget={widget} packResult={result} loading={pl} />;
    }
    return null;
  };

  if (loading) return (
    <div className="p-8 space-y-8">
      <Skeleton variant="card" className="h-28 w-full" />
      <div className="grid grid-cols-3 gap-6">
        <Skeleton variant="card" className="h-32" /><Skeleton variant="card" className="h-32" /><Skeleton variant="card" className="h-32" />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Skeleton variant="card" className="h-64" /><Skeleton variant="card" className="h-64" />
      </div>
    </div>
  );

  const visible = widgets.filter(w => w.visible || isEditMode).sort((a, b) => a.order - b.order);

  return (
    <div className="p-6 lg:p-8 font-sans animate-in fade-in duration-500">
      {/* ── Hero ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-7 bg-[linear-gradient(110deg,#0b1220_0%,#10204a_55%,#0b1220_100%)] p-7 rounded-3xl text-white shadow-[0_18px_40px_-16px_rgba(30,50,120,0.45)] relative overflow-hidden panel-rise">
        <div className="absolute right-0 top-0 w-72 h-72 bg-[#2563EB]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -right-10 bottom-0 w-56 h-56 bg-[#3B82F6]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="z-10">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">
            {greeting()}, <span className="gradient-text">{userName}</span>
          </h1>
          <p className="text-slate-300 text-sm mt-1.5 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-[#60A5FA]" />
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2 z-10">
          {isEditMode ? (
            <>
              <Button size="sm" variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10" onClick={() => { setIsEditMode(false); setShowPanel(false); }}>Cancel</Button>
              <Button size="sm" variant="secondary" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={refreshAll}>Refresh Data</Button>
              <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => setShowPanel(true)}>Add Widget</Button>
              <Button size="sm" icon={<Save className="w-4 h-4" />} onClick={saveLayout}>Save Layout</Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" icon={<Settings2 className="w-4 h-4" />} onClick={() => setIsEditMode(true)}>Configure</Button>
          )}
        </div>
      </div>

      {/* ── Edit hint ── */}
      {isEditMode && (
        <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl bg-[#2563EB]/8 border border-[#2563EB]/20 text-[#1E40AF] text-sm font-medium">
          <GripVertical className="w-4 h-4 shrink-0" />
          Drag to reorder · click size to cycle width · eye to hide · ✕ to remove
        </div>
      )}

      {/* ── Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {visible.map((widget, i) => {
          const isDragging = draggedId  === widget.id;
          const isOver     = dragOverId === widget.id && draggedId !== widget.id;
          return (
            <div key={widget.id}
              className={`${colSpan(widget.width)} relative group transition-all duration-200 panel-rise stagger-${Math.min(i + 1, 6)} ${isDragging ? 'opacity-40 scale-[0.97]' : ''} ${isOver ? 'ring-2 ring-[#2563EB]/50 rounded-2xl' : ''}`}
              draggable={isEditMode}
              onDragStart={() => onDragStart(widget.id)}
              onDragOver={e  => onDragOver(e, widget.id)}
              onDrop={e      => { e.preventDefault(); onDragEnd(); }}
              onDragEnd={onDragEnd}
            >
              {isEditMode && (
                <div className="absolute -top-2.5 -right-2.5 z-20 flex items-center gap-0.5 bg-white shadow-md rounded-xl p-1 border border-slate-200 animate-in zoom-in duration-200">
                  <span className="cursor-grab p-1.5 text-slate-400"><GripVertical className="w-3.5 h-3.5" /></span>
                  <button onClick={() => cycleWidth(widget.id)} className="px-1.5 py-1 text-[11px] font-bold text-slate-500 hover:text-[#1E40AF] rounded-lg" title="Cycle width">
                    {WIDTH_LABEL[widget.width || 'third']}
                  </button>
                  <button onClick={() => toggleVis(widget.id)} className={`p-1.5 rounded-lg hover:bg-slate-50 ${!widget.visible ? 'text-red-400' : 'text-slate-400'}`}>
                    {widget.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => removeWidget(widget.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
              <div className={`h-full ${isEditMode && !widget.visible ? 'opacity-35 grayscale' : ''}`}>
                {renderTile(widget)}
              </div>
            </div>
          );
        })}

        {isEditMode && visible.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <BarChart3 className="w-8 h-8 text-slate-300" />
            </div>
            <p className="font-heading font-bold text-lg text-ink">Dashboard is empty</p>
            <p className="text-sm text-ink-muted mt-1 mb-5">Add widgets from the report packs</p>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowPanel(true)}>Add Widget</Button>
          </div>
        )}
      </div>

      <AddPanel open={showPanel} onClose={() => setShowPanel(false)} onAdd={addWidget} packs={packs} existingIds={existingIds} />
    </div>
  );
};
