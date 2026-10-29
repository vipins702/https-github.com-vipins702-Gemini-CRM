import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { Shield, Clock, User, Filter, ChevronDown, ChevronRight, Search, RefreshCw, ArrowUpDown } from 'lucide-react';

interface AuditLog {
  id: string;
  entity_type: string;
  record_id: string;
  action: string;
  actor_id: string;
  actor_email: string;
  actor_first: string;
  actor_last: string;
  details: any;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  note: 'bg-purple-100 text-purple-700',
  call: 'bg-amber-100 text-amber-700',
  email: 'bg-indigo-100 text-indigo-700',
  login: 'bg-slate-100 text-slate-700',
};

const getToken = () => {
  try { return JSON.parse(localStorage.getItem('flowcrm_session') || '{}').token || ''; } catch { return ''; }
};

export const AuditLog: React.FC = () => {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Filters
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { addToast } = useToast();

  const load = async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('pageSize', String(PAGE_SIZE));
      if (entityType) params.set('entityType', entityType);
      if (action) params.set('action', action);
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const res = await fetch(`/api/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch {
      addToast('Failed to load audit logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1); setPage(1); }, [entityType, action, from, to]);

  const filtered = search
    ? rows.filter(r =>
        r.entity_type.includes(search.toLowerCase()) ||
        r.action.includes(search.toLowerCase()) ||
        (r.actor_email || '').toLowerCase().includes(search.toLowerCase()) ||
        r.record_id.includes(search)
      )
    : rows;

  const actorName = (r: AuditLog) =>
    [r.actor_first, r.actor_last].filter(Boolean).join(' ') || r.actor_email || r.actor_id || 'System';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-surface border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">Audit Log</h1>
              <p className="text-sm text-slate-500">{total.toLocaleString()} total events tracked</p>
            </div>
            <button
              onClick={() => load(page)}
              className="ml-auto p-2 hover:bg-slate-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search…"
                className="pl-9 pr-4 h-9 w-56 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:bg-surface focus:border-indigo-400"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:bg-surface focus:border-indigo-400"
              value={entityType}
              onChange={e => setEntityType(e.target.value)}
            >
              <option value="">All Entities</option>
              {['lead', 'customer', 'task', 'case', 'quote', 'campaign', 'user'].map(e => (
                <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
              ))}
            </select>
            <select
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:bg-surface focus:border-indigo-400"
              value={action}
              onChange={e => setAction(e.target.value)}
            >
              <option value="">All Actions</option>
              {['create', 'update', 'delete', 'note', 'call', 'email', 'login'].map(a => (
                <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
              ))}
            </select>
            <input
              type="date"
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:bg-surface focus:border-indigo-400"
              value={from}
              onChange={e => setFrom(e.target.value)}
              placeholder="From date"
            />
            <input
              type="date"
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:bg-surface focus:border-indigo-400"
              value={to}
              onChange={e => setTo(e.target.value)}
            />
            {(entityType || action || from || to || search) && (
              <button
                onClick={() => { setEntityType(''); setAction(''); setFrom(''); setTo(''); setSearch(''); }}
                className="h-9 px-3 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-surface rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-slate-400">
              <RefreshCw className="animate-spin w-6 h-6 mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <Shield className="w-10 h-10 mb-2 opacity-30" />
              <p className="font-medium">No audit events found</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="w-8 px-4 py-3" />
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400">Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(row => (
                  <React.Fragment key={row.id}>
                    <tr
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    >
                      <td className="px-4 py-3 text-slate-400">
                        {expandedId === row.id
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-300" />
                          {new Date(row.created_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 text-xs font-bold">
                            {actorName(row)[0]?.toUpperCase() || '?'}
                          </div>
                          <span className="text-sm font-medium text-slate-700">{actorName(row)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-xs font-medium capitalize">
                          {row.entity_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${ACTION_COLORS[row.action] || 'bg-slate-100 text-slate-600'}`}>
                          {row.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 font-mono text-xs truncate max-w-xs">
                        {row.record_id}
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr className="bg-indigo-50/40">
                        <td colSpan={6} className="px-8 py-4">
                          <div className="bg-surface rounded-xl border border-slate-200 p-4">
                            <p className="text-xs font-bold text-slate-400 mb-2">Change Details</p>
                            <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono overflow-auto max-h-64">
                              {JSON.stringify(row.details, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-sm text-slate-500">
                Page {page} · {total.toLocaleString()} total events
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => { const p = page - 1; setPage(p); load(p); }}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                >Previous</button>
                <button
                  disabled={page * PAGE_SIZE >= total}
                  onClick={() => { const p = page + 1; setPage(p); load(p); }}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                >Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
