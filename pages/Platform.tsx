import React, { useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';
import { Tenant } from '../types';
import {
  Building2, Plus, Users, Database, Loader2, ShieldOff, ShieldCheck, X, Globe, Pencil, Check,
} from 'lucide-react';

interface Props { onNavigate?: (view: string, params?: any) => void; }

const CreateTenantModal: React.FC<{ onClose: () => void; onCreated: (t: Tenant) => void }> = ({ onClose, onCreated }) => {
  const { addToast } = useToast();
  const [name, setName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const valid = name.trim() && adminEmail.trim() && adminPassword.length >= 6;

  const submit = async () => {
    setSaving(true);
    try {
      const t = await api.createTenant({ name: name.trim(), adminEmail: adminEmail.trim(), adminPassword, adminName: adminName.trim() });
      addToast(`Tenant “${t.name}” created`, 'success');
      onCreated(t);
      onClose();
    } catch (e: any) {
      addToast(e?.message || 'Failed to create tenant', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="tri-ring-sq w-9 h-9 flex items-center justify-center text-[#3730A3]"><Building2 className="w-5 h-5" /></span>
            <h2 className="font-heading text-lg font-extrabold text-ink">New Tenant</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="mono-label text-[10px] mb-1 block">Workspace Name</label>
            <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Acme Corp" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="pt-2 border-t border-slate-100">
            <p className="mono-label text-[10px] mb-2">First Admin (tenant owner)</p>
            <div className="grid grid-cols-2 gap-3">
              <input className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Admin name" value={adminName} onChange={e => setAdminName(e.target.value)} />
              <input className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="admin@acme.com" type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} />
            </div>
            <input className="w-full mt-3 px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Temporary password (min 6 chars)" type="text" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} />
            <p className="text-[11px] text-ink-muted mt-1">The admin will be asked to change this on first login. A starter copy of the default workspace (modules, layouts, menus) is provisioned automatically.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || saving} icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}>Create Tenant</Button>
        </div>
      </div>
    </div>
  );
};

export const Platform: React.FC<Props> = () => {
  const { addToast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const load = async () => {
    setLoading(true); setError(null);
    try { setTenants(await api.getTenants()); }
    catch (e: any) {
      setError(/cannot (get|post)|404|not found/i.test(e?.message || '')
        ? 'The Platform API isn’t available. Restart the backend (npm run dev:all) so the new routes load.'
        : (e?.message || 'Failed to load tenants.'));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggleStatus = async (t: Tenant) => {
    const next = t.status === 'active' ? 'suspended' : 'active';
    setBusyId(t.id);
    try {
      const updated = await api.updateTenant(t.id, { status: next });
      setTenants(prev => prev.map(x => x.id === t.id ? { ...x, ...updated } : x));
      addToast(`${t.name} ${next === 'suspended' ? 'suspended' : 'reactivated'}`, 'success');
    } catch (e: any) { addToast(e?.message || 'Update failed', 'error'); }
    finally { setBusyId(null); }
  };

  const saveName = async (t: Tenant) => {
    if (!editName.trim() || editName === t.name) { setEditId(null); return; }
    setBusyId(t.id);
    try {
      const updated = await api.updateTenant(t.id, { name: editName.trim() });
      setTenants(prev => prev.map(x => x.id === t.id ? { ...x, ...updated } : x));
      addToast('Renamed', 'success');
    } catch (e: any) { addToast(e?.message || 'Rename failed', 'error'); }
    finally { setBusyId(null); setEditId(null); }
  };

  const totals = tenants.reduce((a, t) => ({ users: a.users + (t.userCount || 0), records: a.records + (t.recordCount || 0) }), { users: 0, records: 0 });

  return (
    <div className="p-6 lg:p-8 font-sans animate-in fade-in duration-300 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="tri-ring-sq w-9 h-9 flex items-center justify-center text-[#3730A3]"><Globe className="w-5 h-5" /></span>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink">Platform Console</h1>
          </div>
          <p className="text-sm text-ink-muted mt-1 ml-12">Manage every tenant workspace on this CRM.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} icon={<Plus className="w-4 h-4" />}>New Tenant</Button>
      </div>

      {!loading && !error && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Tenants', value: tenants.length, icon: Building2, color: 'bg-blue-100 text-blue-700' },
            { label: 'Total Users', value: totals.users, icon: Users, color: 'bg-emerald-100 text-emerald-700' },
            { label: 'Total Records', value: totals.records, icon: Database, color: 'bg-violet-100 text-violet-700' },
          ].map(k => (
            <Card key={k.label}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${k.color}`}><k.icon className="w-5 h-5" /></div>
                <div>
                  <div className="font-heading text-2xl font-extrabold text-ink tnum leading-none">{k.value}</div>
                  <div className="mono-label text-[10px] mt-1">{k.label}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {loading ? (
        <Skeleton variant="card" className="h-64" />
      ) : error ? (
        <Card>
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3"><Globe className="w-6 h-6" /></div>
            <p className="text-sm text-ink font-medium mb-1">Couldn’t load tenants</p>
            <p className="text-sm text-ink-muted max-w-md mx-auto">{error}</p>
            <Button variant="secondary" className="mt-4" onClick={load}>Retry</Button>
          </div>
        </Card>
      ) : (
        <div className="glass-showcase overflow-hidden rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="mono-label text-[10px] text-left px-5 py-3">Workspace</th>
                <th className="mono-label text-[10px] text-left px-3 py-3">Status</th>
                <th className="mono-label text-[10px] text-right px-3 py-3">Users</th>
                <th className="mono-label text-[10px] text-right px-3 py-3">Records</th>
                <th className="mono-label text-[10px] text-right px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-heading font-bold text-xs">
                        {t.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        {editId === t.id ? (
                          <div className="flex items-center gap-1">
                            <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName(t)} className="px-2 py-1 border border-slate-300 rounded text-sm w-40" />
                            <button onClick={() => saveName(t)} className="p-1 text-emerald-600"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditId(null)} className="p-1 text-slate-400"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group">
                            <span className="font-semibold text-ink truncate">{t.name}</span>
                            <button onClick={() => { setEditId(t.id); setEditName(t.name); }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-[#4F46E5]"><Pencil className="w-3 h-3" /></button>
                          </div>
                        )}
                        <div className="text-[11px] text-ink-muted font-mono truncate">{t.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {t.status === 'active'
                      ? <span className="status-pill status-green">Active</span>
                      : <span className="status-pill status-neutral">Suspended</span>}
                  </td>
                  <td className="px-3 py-3 text-right tnum text-ink">{t.userCount ?? 0}</td>
                  <td className="px-3 py-3 text-right tnum text-ink">{t.recordCount ?? 0}</td>
                  <td className="px-5 py-3 text-right">
                    {t.id === 'default' ? (
                      <span className="text-[11px] text-ink-muted">Primary</span>
                    ) : (
                      <Button
                        size="sm"
                        variant={t.status === 'active' ? 'secondary' : 'primary'}
                        disabled={busyId === t.id}
                        icon={busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t.status === 'active' ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        onClick={() => toggleStatus(t)}
                      >
                        {t.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateTenantModal onClose={() => setShowCreate(false)} onCreated={t => setTenants(prev => [...prev, t])} />
      )}
    </div>
  );
};
