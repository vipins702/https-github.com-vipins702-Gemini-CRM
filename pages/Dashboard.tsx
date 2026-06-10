import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TrendingUp, Users, DollarSign, Activity, Settings, Save, Eye, EyeOff, GripVertical, Calendar } from 'lucide-react';
import { WidgetConfig } from '../types';
import { api } from '../services/api';
import { Skeleton } from '../components/ui/Skeleton';
import { formatCurrency } from '../services/currency';

interface StatCardProps {
  title: string;
  value: string;
  icon: any;
  trend: string;
  gradient: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, trend, gradient }) => (
  <div className="relative overflow-hidden bg-white p-5 rounded-2xl border border-slate-200/70 shadow-[var(--elev-2)] flex items-start justify-between gap-4 h-full transition-shadow duration-200 hover:shadow-[var(--elev-3)]">
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
      <h3 className="text-[28px] leading-tight font-semibold text-slate-900 tracking-tight tnum mt-1.5">{value}</h3>
      <div className="flex items-center gap-1.5 mt-3">
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 px-1.5 py-0.5 rounded-md tnum">
          <TrendingUp className="w-3.5 h-3.5" /> {trend}
        </span>
        <span className="text-[11px] font-medium text-slate-400">vs last month</span>
      </div>
    </div>
    <div className={`shrink-0 p-3 bg-gradient-to-br ${gradient} rounded-xl text-white shadow-[var(--elev-1)]`}>
      <Icon className="w-5 h-5" />
    </div>
  </div>
);

export const Dashboard: React.FC = () => {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [stats, setStats] = useState({ totalRevenue: 0, leadCount: 0, customerCount: 0, conversionRate: 0 });
  const [chartData, setChartData] = useState<{ name: string; uv: number }[]>([]);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Workspace Admin');

  useEffect(() => {
    const sessionStr = localStorage.getItem('flowcrm_session');
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        if (session.user && session.user.name) {
          setUserName(session.user.name);
        }
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [w, s, cd, leads] = await Promise.all([
          api.getDashboardConfig(),
          api.getDashboardStats(),
          api.getDashboardChartData(),
          api.getRecords('lead')
        ]);
        setWidgets(w);
        setStats(s);
        setChartData(cd);
        
        // Parse leads and sort by created_at desc to show top 4 recent
        const parsedLeads = leads.map((l: any) => {
          let dataObj: any = {};
          try { dataObj = JSON.parse(l.data); } catch (e) {}
          return {
            id: l.id,
            firstName: dataObj.firstName || '',
            lastName: dataObj.lastName || '',
            company: dataObj.company || '',
            status: dataObj.status || l.status || '',
            value: Number(dataObj.value || 0),
            created_at: l.created_at
          };
        }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        setRecentLeads(parsedLeads.slice(0, 4));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const saveLayout = async () => {
    await api.saveDashboardConfig(widgets);
    setIsEditMode(false);
  };

  const toggleVisibility = (id: string) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const visibleWidgets = widgets.filter(w => w.visible || isEditMode).sort((a, b) => a.order - b.order);

  const renderWidgetContent = (widget: WidgetConfig) => {
    switch (widget.type) {
      case 'stat':
        if (widget.title === 'Total Revenue') {
          return <StatCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} trend="+12.5%" gradient="from-indigo-600 to-violet-500" />;
        }
        if (widget.title === 'Active Leads') {
          return <StatCard title="Active Leads" value={stats.leadCount.toString()} icon={Users} trend="+8.2%" gradient="from-blue-600 to-cyan-500" />;
        }
        if (widget.title === 'Conversion Rate') {
          return <StatCard title="Conversion Rate" value={`${stats.conversionRate}%`} icon={Activity} trend="+2.4%" gradient="from-fuchsia-600 to-pink-500" />;
        }
        return null;
      case 'chart':
        return (
          <Card title={widget.title} className="h-full border border-slate-100 shadow-xl shadow-slate-100/50">
            <div className="h-64 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} 
                    labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                  />
                  <Area type="monotone" dataKey="uv" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );
      case 'list':
        return (
          <Card title={widget.title} className="h-full border border-slate-100 shadow-xl shadow-slate-100/50">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Value</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {recentLeads.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400 font-medium">
                        No recent leads found.
                      </td>
                    </tr>
                  ) : (
                    recentLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors duration-200">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-700">{lead.firstName} {lead.lastName}</td>
                        <td className="px-4 py-3 text-sm text-slate-900 font-bold">{formatCurrency(lead.value)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 inline-flex text-[10px] font-bold uppercase rounded-full tracking-wider ${
                            lead.status === 'Won' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            lead.status === 'Lost' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                            lead.status === 'Qualified' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                            'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}>
                            {lead.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        );
      default:
        return null;
    }
  };

  const getWelcomeMessage = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return 'Good Morning';
    if (hrs < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getFormattedDate = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="p-8 space-y-8 animate-pulse">
        <div className="h-16 w-1/3 bg-slate-100 rounded-xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton variant="card" className="h-32" />
          <Skeleton variant="card" className="h-32" />
          <Skeleton variant="card" className="h-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton variant="card" className="h-80" />
          <Skeleton variant="card" className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 animate-in fade-in duration-500 font-sans">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"></div>
        <div className="z-10">
          <h1 className="text-3xl font-black tracking-tight">{getWelcomeMessage()}, {userName}</h1>
          <p className="text-slate-300 text-sm mt-1.5 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-indigo-400" />
            {getFormattedDate()}
          </p>
        </div>
        <div className="flex gap-3 z-10">
          {isEditMode ? (
            <Button icon={<Save className="w-4 h-4" />} onClick={saveLayout} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]">Save Layout</Button>
          ) : (
            <Button variant="secondary" icon={<Settings className="w-4 h-4" />} onClick={() => setIsEditMode(true)} className="bg-white/10 hover:bg-white/20 border-white/10 text-white font-bold px-5 py-2.5 rounded-xl transition-all">Configure</Button>
          )}
        </div>
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleWidgets.map((widget) => {
          const colSpan = widget.width === 'half' ? 'lg:col-span-2 md:col-span-1' : widget.width === 'full' ? 'col-span-full' : 'col-span-1';

          return (
            <div key={widget.id} className={`${colSpan} relative group`}>
              {isEditMode && (
                <div className="absolute -top-3 -right-3 z-10 flex gap-1 bg-white shadow-lg rounded-xl p-1.5 border border-slate-200 animate-in zoom-in duration-200">
                  <button onClick={() => toggleVisibility(widget.id)} className={`p-1.5 rounded-lg hover:bg-slate-100 ${!widget.visible ? 'text-red-500' : 'text-slate-500'}`}>
                    {widget.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <div className="cursor-move p-1.5 text-slate-400">
                    <GripVertical className="w-4 h-4" />
                  </div>
                </div>
              )}
              <div className={`${isEditMode && !widget.visible ? 'opacity-40 grayscale border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden' : ''}`}>
                {renderWidgetContent(widget)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
