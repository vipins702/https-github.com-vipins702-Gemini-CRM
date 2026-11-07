// What the signed-in user may do, read from the session saved at login. The server makes the
// real decision on every request; this only decides what to show, grey out or hide.
// Keep in step with server/middleware/access.js.
export type PermAction = 'read' | 'create' | 'edit' | 'delete';

const sessionUser = (): any => {
  try { return JSON.parse(localStorage.getItem('flowcrm_session') || 'null')?.user || null; } catch { return null; }
};

export const isAdminUser = (): boolean => {
  const u = sessionUser();
  return !!(u && (u.isSuperadmin || u.role === 'admin' || u.permissions?.admin));
};

export const can = (entity: string, action: PermAction): boolean => {
  if (isAdminUser()) return true;
  const p = sessionUser()?.permissions?.[entity];
  if (!p || typeof p !== 'object') return false;
  if (p.manage) return true;
  if (action === 'read') return !!(p.read || p.write);
  if (action === 'create') return !!(p.create || p.write);
  if (action === 'edit') return !!(p.edit || p.write);
  return !!p.delete;
};

/** Field-level rule for the current role (everything is allowed unless the role says otherwise). */
export const fieldAccess = (entity: string, field: string): { read: boolean; edit: boolean } => {
  if (isAdminUser()) return { read: true, edit: true };
  const f = sessionUser()?.permissions?.[entity]?.fields?.[field];
  const read = f?.read !== false;
  return { read, edit: read && f?.edit !== false };
};

const hasAnyAccess = (): boolean => {
  if (isAdminUser()) return true;
  const perms = sessionUser()?.permissions || {};
  return Object.values(perms).some((p: any) => p && typeof p === 'object' && (p.read || p.create || p.edit || p.delete || p.manage || p.write));
};

// Screens that are configuration rather than data: left to the menu's own role list.
const CONFIG_VIEWS = new Set(['autoflow', 'layout', 'settings', 'web-presenter', 'users', 'object-manager', 'menu-manager', 'lookups', 'processes', 'categories', 'integrations', 'platform', 'audit-log', 'lead-rules', 'scoring-rules', 'assignment-rules']);

/**
 * May the user open this screen? true / false, or null when permissions have no opinion
 * (configuration screens). A screen named after a record type needs "read" on it.
 */
export const canOpenView = (view?: string): boolean | null => {
  if (!view) return null;
  if (isAdminUser()) return true;
  // Configuration screens belong to administrators; Settings stays open (theme, own preferences).
  if (CONFIG_VIEWS.has(view)) return view === 'settings' ? null : false;
  switch (view) {
    case 'dashboard':
    case 'reports':
      return hasAnyAccess();
    case 'pipeline':
    case 'lead-360':
    case 'campaigns':
    case 'lead-capture':
    case 'agent-console':
    case 'sequences':
      return can('lead', 'read');
    case 'calendar':
      return can('task', 'read');
    case 'quotes':
    case 'customer-360':
      return can('customer', 'read');
    case 'whatsapp':
    case 'email-inbox':
      return can('lead', 'read') || can('customer', 'read');
    default:
      return can(view, 'read'); // a record type: lead, customer, case, task, product, custom ones
  }
};
