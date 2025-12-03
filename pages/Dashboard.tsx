
import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TrendingUp, Users, DollarSign, Activity, Settings, Save, Eye, EyeOff, GripVertical } from 'lucide-react';
import { WidgetConfig } from '../types';
import { api } from '../services/api';
import { MOCK_LEADS } from '../constants';

const data = [
  { name: 'Jan', uv: 4000, pv: 2400, amt: 2400 },
  { name: 'Feb', uv: 3000, pv: 1398, amt: 2210 },
  { name: 'Mar', uv: 2000, pv: 9800, amt: 2290 },
  { name: 'Apr', uv: 2780, pv: 3908, amt: 2000 },
  { name: 'May', uv: 1890, pv: 4800, amt: 2181 },
  { name: 'Jun', uv: 2390, pv: 3800, amt: 2500 },
  { name: 'Jul', uv: 3490, pv: 4300, amt: 2100 },
];

interface StatCardProps {
  title: string;
  value: string;
  icon: any;
  trend: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, trend }) => (
  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between h-full">
    <div>
      <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
      <p className="text-sm text-green-600 mt-2 font-medium flex items-center">
        <TrendingUp className="w-4 h-4 mr-1" /> {trend}
      </p>
    </div>
    <div className="p-3 bg-indigo-50 rounded-lg">
      <Icon className="w-6 h-6 text-indigo-600" />
    </div>
  </div>
);

export const Dashboard: React.FC = () => {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [counts, setCounts] = useState({ leads: 0, customers: 0 });
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    const init = async () => {
      const [w, leads, customers] = await Promise.all([
         api.getDashboardConfig(),
         api.getRecords('lead'),
         api.getRecords('customer')
      ]);
      setWidgets(w);
      setCounts({ leads: leads.length, customers: customers.length });
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
        if (widget.title === 'Total Revenue') return <StatCard title="Total Revenue" value="$84,230" icon={DollarSign} trend="+12.5%" />;
        if (widget.title === 'Active Leads') return <StatCard title="Active Leads" value={counts.leads.toString()} icon={Users} trend="+8.2%" />;
        if (widget.title === 'Conversion Rate') return <StatCard title="Total Customers" value={counts.customers.toString()} icon={Activity} trend="+2.4%" />;
        return null;
      case 'chart':
        return (
          <Card title={widget.title} className="h-full">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="uv" stroke="#6366f1" fillOpacity={1} fill="url(#colorUv)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );
      case 'list':
        return (
          <Card title={widget.title} className="h-full">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {MOCK_LEADS.slice(0, 4).map((lead) => (
                    <tr key={lead.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{lead.firstName} {lead.lastName}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">${lead.value.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {lead.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Overview of your performance</p>
        </div>
        <div className="flex gap-3">
           {isEditMode ? (
             <Button icon={<Save className="w-4 h-4"/>} onClick={saveLayout}>Save Layout</Button>
           ) : (
             <Button variant="secondary" icon={<Settings className="w-4 h-4"/>} onClick={() => setIsEditMode(true)}>Configure</Button>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleWidgets.map((widget) => {
           const colSpan = widget.width === 'half' ? 'lg:col-span-2 md:col-span-1' : widget.width === 'full' ? 'col-span-full' : 'col-span-1';
           
           return (
              <div key={widget.id} className={`${colSpan} relative group`}>
                 {isEditMode && (
                   <div className="absolute -top-3 -right-3 z-10 flex gap-1 bg-white shadow-md rounded-lg p-1 border border-gray-200">
                      <button onClick={() => toggleVisibility(widget.id)} className={`p-1 rounded hover:bg-gray-100 ${!widget.visible ? 'text-red-500' : 'text-gray-500'}`}>
                         {widget.visible ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
                      </button>
                      <div className="cursor-move p-1 text-gray-400">
                         <GripVertical className="w-4 h-4" />
                      </div>
                   </div>
                 )}
                 <div className={`${isEditMode && !widget.visible ? 'opacity-50 grayscale border-2 border-dashed border-gray-300 rounded-xl' : ''}`}>
                    {renderWidgetContent(widget)}
                 </div>
              </div>
           );
        })}
      </div>
    </div>
  );
};
