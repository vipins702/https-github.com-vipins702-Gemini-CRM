import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { api } from '../services/api';
import { getViewAs, setViewAs, isRealAdmin } from '../services/permissions';
import { Role } from '../types';

/** Admin-only picker: preview the whole app as any role, to see what that role can see and do. */
export const ViewAsSelect: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const active = getViewAs();

  useEffect(() => {
    if (!isRealAdmin()) return;
    api.getRoles().then(setRoles).catch(() => setRoles([]));
  }, []);

  if (!isRealAdmin() || roles.length === 0) return null;

  const change = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    setViewAs(role ? { roleId: role.id, name: role.name, permissions: role.permissions || {} } : null);
    window.location.reload(); // every screen re-reads what it may show
  };

  return (
    <label className="shrink-0 hidden sm:flex items-center gap-1.5 text-xs font-medium text-gray-500" title="Preview the app as one of your roles">
      <Eye className="w-4 h-4" aria-hidden="true" />
      <span className="sr-only">View as</span>
      <select
        aria-label="View as role"
        value={active?.roleId || ''}
        onChange={e => change(e.target.value)}
        className="h-9 max-w-[160px] rounded-lg border border-gray-200 bg-surface text-sm text-gray-900 px-2"
      >
        <option value="">Myself (Admin)</option>
        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </label>
  );
};

/** Shown on every screen while previewing, so nobody forgets they are looking through a role. */
export const ViewAsBanner: React.FC = () => {
  const active = isRealAdmin() ? getViewAs() : null;
  if (!active) return null;
  return (
    <div role="status" className="flex items-center justify-between gap-3 px-4 py-2 text-sm bg-amber-100 text-amber-900 border-b border-amber-300">
      <span className="flex items-center gap-2 min-w-0">
        <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="truncate">
          Previewing as <strong>{active.name}</strong>: you see exactly what this role sees. Nothing can be changed.
        </span>
      </span>
      <button
        onClick={() => { setViewAs(null); window.location.reload(); }}
        className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
      >
        Exit preview
      </button>
    </div>
  );
};
