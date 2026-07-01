
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { User, Role, EntityDefinition, DataScope } from '../types';
import { api } from '../services/api';
import {
  Users, Shield, Plus, Edit2, Check, X, Loader2,
  UserCog, ChevronRight, ToggleLeft, ToggleRight
} from 'lucide-react';

// ─── Module color map ────────────────────────────────────────────────────────
const MODULE_COLORS: Record<string, { bg: string; text: string }> = {
  lead:           { bg: 'bg-blue-100',    text: 'text-blue-700' },
  customer:       { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  case:           { bg: 'bg-rose-100',    text: 'text-rose-700' },
  task:           { bg: 'bg-amber-100',   text: 'text-amber-700' },
  product:        { bg: 'bg-violet-100',  text: 'text-violet-700' },
  quote:          { bg: 'bg-orange-100',  text: 'text-orange-700' },
  users:          { bg: 'bg-slate-100',   text: 'text-slate-600' },
  'object-manager':{ bg: 'bg-slate-100',  text: 'text-slate-600' },
  'menu-manager': { bg: 'bg-slate-100',   text: 'text-slate-600' },
  lookups:        { bg: 'bg-slate-100',   text: 'text-slate-600' },
  autoflow:       { bg: 'bg-slate-100',   text: 'text-slate-600' },
  layout:         { bg: 'bg-slate-100',   text: 'text-slate-600' },
  'web-presenter':{ bg: 'bg-slate-100',   text: 'text-slate-600' },
};

const getModuleColor = (id: string) =>
  MODULE_COLORS[id] ?? { bg: 'bg-indigo-100', text: 'text-indigo-700' };

// ─── CRUD chip ────────────────────────────────────────────────────────────────
const CrudChip: React.FC<{ label: string; checked: boolean; onClick: () => void }> = ({
  label, checked, onClick
}) => (
  <button
    onClick={onClick}
    className={`status-pill transition-all cursor-pointer select-none ${
      checked ? 'status-blue' : 'status-neutral opacity-60 hover:opacity-90'
    }`}
  >
    {checked && <Check className="w-2.5 h-2.5" />}
    {label}
  </button>
);

// ─── FLS chip ─────────────────────────────────────────────────────────────────
const FlsChip: React.FC<{ label: string; checked: boolean; color: string; onClick: () => void; disabled?: boolean }> = ({
  label, checked, color, onClick, disabled
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`status-pill transition-all cursor-pointer select-none ${
      disabled
        ? 'status-neutral opacity-30 cursor-not-allowed'
        : checked
          ? color
          : 'status-neutral opacity-60 hover:opacity-90'
    }`}
  >
    {checked && <Check className="w-2.5 h-2.5" />}
    {label}
  </button>
);

export const UserManagement: React.FC = () => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [schemas, setSchemas] = useState<Record<string, EntityDefinition>>({});

  // Modal / Edit States
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  interface UserFormData extends Partial<User> {
    password?: string;
  }
  const [editingUser, setEditingUser] = useState<UserFormData>({});

  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isSavingRole, setIsSavingRole] = useState(false);

  // Field Level Security Modal
  const [isFLSModalOpen, setIsFLSModalOpen] = useState(false);
  const [flsEntityId, setFlsEntityId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [u, r, s] = await Promise.all([
      api.getUsers(),
      api.getRoles(),
      api.getSchemas()
    ]);
    setUsers(u);
    setRoles(r);

    // Inject System Modules for Permission Management
    const systemSchemas: Record<string, EntityDefinition> = {
      'users':         { id: 'users',         label: 'Users & Roles',  pluralLabel: 'Users & Roles',  fields: [] },
      'object-manager':{ id: 'object-manager', label: 'Object Manager', pluralLabel: 'Object Manager', fields: [] },
      'menu-manager':  { id: 'menu-manager',   label: 'Menu Builder',   pluralLabel: 'Menu Builder',   fields: [] },
      'lookups':       { id: 'lookups',        label: 'Lookup Manager', pluralLabel: 'Lookup Manager', fields: [] },
      'autoflow':      { id: 'autoflow',       label: 'Workflows',      pluralLabel: 'Workflows',      fields: [] },
      'layout':        { id: 'layout',         label: 'Form Designer',  pluralLabel: 'Form Designer',  fields: [] },
      'web-presenter': { id: 'web-presenter',  label: 'Web Presenter',  pluralLabel: 'Web Presenter',  fields: [] },
    };

    setSchemas({ ...systemSchemas, ...s });
    if (r.length > 0 && !selectedRole) setSelectedRole(r[0]);
    setLoading(false);
  };

  const handleSaveUser = async () => {
    if (!editingUser.name || !editingUser.email || !editingUser.roleId) return;
    await api.saveUser(editingUser as User & { password?: string });
    setIsUserModalOpen(false);
    addToast('User saved successfully', 'success');
    loadData();
  };

  const handleSaveRole = async () => {
    if (!selectedRole) return;
    setIsSavingRole(true);

    // If ID is temporary client-side ID, remove it so backend generates a real one
    const roleToSave = { ...selectedRole };
    if (roleToSave.id.startsWith('new_')) {
      roleToSave.id = '';
    }

    await api.saveRole(roleToSave);
    setIsSavingRole(false);
    addToast('Role permissions saved!', 'success');
    loadData();
  };

  // Helper to toggle permission
  const togglePermission = (entityId: string, type: 'read' | 'create' | 'edit' | 'delete') => {
    if (!selectedRole) return;

    const currentRolePerms = selectedRole.permissions || {};
    const currentEntityPerms = currentRolePerms[entityId] || { read: false, create: false, edit: false, delete: false, scope: 'all' };

    const updatedEntityPerms = { ...currentEntityPerms, [type]: !currentEntityPerms[type] };

    // Auto-enable read if others are enabled
    if (updatedEntityPerms.create || updatedEntityPerms.edit || updatedEntityPerms.delete) {
      updatedEntityPerms.read = true;
    }

    setSelectedRole({
      ...selectedRole,
      permissions: {
        ...currentRolePerms,
        [entityId]: updatedEntityPerms
      }
    });
  };

  const updateScope = (entityId: string, scope: DataScope) => {
    if (!selectedRole) return;
    const currentRolePerms = selectedRole.permissions || {};
    const currentEntityPerms = currentRolePerms[entityId] || { read: false, create: false, edit: false, delete: false, scope: 'all' };

    setSelectedRole({
      ...selectedRole,
      permissions: {
        ...currentRolePerms,
        [entityId]: { ...currentEntityPerms, scope }
      }
    });
  };

  const toggleFieldPermission = (entityId: string, fieldName: string, type: 'read' | 'edit') => {
    if (!selectedRole) return;
    const currentRolePerms = selectedRole.permissions || {};
    const modulePerms = currentRolePerms[entityId] || { read: false, create: false, edit: false, delete: false, scope: 'all' };
    const fieldPerms = modulePerms.fields || {};
    const currentField = fieldPerms[fieldName] || { read: true, edit: true };

    const updatedField = { ...currentField, [type]: !currentField[type] };

    setSelectedRole({
      ...selectedRole,
      permissions: {
        ...currentRolePerms,
        [entityId]: {
          ...modulePerms,
          fields: {
            ...fieldPerms,
            [fieldName]: updatedField
          }
        }
      }
    });
  };

  const getUserCount = (roleId: string) => users.filter(u => u.roleId === roleId).length;

  const formatLastActive = (user: User) => {
    const ts = (user as any).lastLoginAt;
    if (!ts) return 'Never';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-[#2563EB] w-7 h-7" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--surface-muted)] overflow-hidden">

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="h-16 bg-[var(--surface)] border-b border-[var(--border)] px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="tri-ring-sq w-9 h-9 shrink-0">
            <div className="flex items-center justify-center w-full h-full">
              <UserCog className="w-[18px] h-[18px] text-white" />
            </div>
          </div>
          <div>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink leading-none">
              User Management
            </h1>
            <p className="text-xs text-ink-muted mt-0.5">Manage access, roles, and security policies</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-[var(--surface-muted)] p-1 rounded-xl border border-[var(--border)]">
          {(['users', 'roles'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-[var(--surface)] shadow-sm text-[#2563EB] border border-[var(--border)]'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {tab === 'users' ? 'Users' : 'Roles & Permissions'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">

          {/* ════════════════════ USERS TAB ════════════════════ */}
          {activeTab === 'users' && (
            <div className="space-y-5">
              <div className="flex justify-end">
                <Button
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => { setEditingUser({ isActive: true }); setIsUserModalOpen(true); }}
                >
                  Add User
                </Button>
              </div>

              <div className="glass-showcase overflow-hidden">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-6 py-3.5 text-left">
                        <span className="mono-label">User</span>
                      </th>
                      <th className="px-6 py-3.5 text-left">
                        <span className="mono-label">Role</span>
                      </th>
                      <th className="px-6 py-3.5 text-left">
                        <span className="mono-label">Status</span>
                      </th>
                      <th className="px-6 py-3.5 text-left">
                        <span className="mono-label">Last Active</span>
                      </th>
                      <th className="px-6 py-3.5 text-right">
                        <span className="mono-label">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {users.map(user => {
                      const roleName = roles.find(r => r.id === user.roleId)?.name || user.roleId;
                      const initials = (user.name || '?')
                        .split(' ')
                        .map((w: string) => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase();
                      const isAdmin = roleName.toLowerCase().includes('admin');

                      return (
                        <tr key={user.id} className="hover:bg-[var(--surface-muted)] transition-colors">
                          {/* User cell */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="tri-ring w-9 h-9 shrink-0">
                                <div className="flex items-center justify-center w-full h-full">
                                  <span className="text-[11px] font-bold text-[#1E40AF]">{initials}</span>
                                </div>
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-ink">{user.name || 'Unknown User'}</div>
                                <div className="text-xs text-ink-muted">{user.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Role cell */}
                          <td className="px-6 py-4">
                            <span className={`status-pill ${isAdmin ? 'status-blue' : 'status-neutral'}`}>
                              {roleName}
                            </span>
                          </td>

                          {/* Status cell */}
                          <td className="px-6 py-4">
                            <span className="flex items-center gap-1.5 text-xs font-medium">
                              <span className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                              <span className={user.isActive ? 'text-emerald-700' : 'text-rose-600'}>
                                {user.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </span>
                          </td>

                          {/* Last Active */}
                          <td className="px-6 py-4">
                            <span className="text-xs text-ink-muted font-mono-data">
                              {formatLastActive(user)}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              {/* Lock / Unlock toggle */}
                              <button
                                onClick={async () => {
                                  await api.saveUser({ ...user, isActive: !user.isActive });
                                  addToast(
                                    user.isActive ? `${user.name} deactivated` : `${user.name} activated`,
                                    user.isActive ? 'warning' : 'success'
                                  );
                                  loadData();
                                }}
                                title={user.isActive ? 'Deactivate user' : 'Activate user'}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  user.isActive
                                    ? 'text-emerald-600 hover:bg-emerald-50'
                                    : 'text-rose-500 hover:bg-rose-50'
                                }`}
                              >
                                {user.isActive
                                  ? <ToggleRight className="w-5 h-5" />
                                  : <ToggleLeft className="w-5 h-5" />
                                }
                              </button>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Edit2 className="w-3.5 h-3.5" />}
                                onClick={() => { setEditingUser(user); setIsUserModalOpen(true); }}
                              >
                                Edit
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-ink-muted text-sm">
                          No users found. Add your first user to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════════════════════ ROLES TAB ════════════════════ */}
          {activeTab === 'roles' && (
            <div className="flex gap-6 h-[calc(100vh-200px)]">

              {/* ── Left: Role list ────────────────────────────── */}
              <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto pr-1">
                {/* Add role button */}
                <Button
                  variant="secondary"
                  icon={<Plus className="w-4 h-4" />}
                  className="w-full"
                  onClick={() => {
                    const tempId = `new_` + Math.random().toString(36).substr(2, 9);
                    const newRole: Role = {
                      id: tempId,
                      name: 'New Role',
                      description: 'Description...',
                      permissions: {},
                      isSystem: false,
                      createdAt: new Date().toISOString()
                    };
                    setRoles([...roles, newRole]);
                    setSelectedRole(newRole);
                  }}
                >
                  New Role
                </Button>

                {roles.map(role => {
                  const isSelected = selectedRole?.id === role.id;
                  const count = getUserCount(role.id);
                  return (
                    <button
                      key={role.id}
                      onClick={() => setSelectedRole(role)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all ${
                        isSelected
                          ? 'border-[#2563EB] bg-blue-50 shadow-sm'
                          : 'border-[var(--border)] bg-[var(--surface)] hover:border-slate-300 hover:bg-[var(--surface-muted)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-[#2563EB] text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            <Shield className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className={`text-sm font-semibold truncate ${isSelected ? 'text-[#1E40AF]' : 'text-ink'}`}>
                              {role.name}
                            </div>
                            {role.description && (
                              <div className="text-xs text-ink-muted truncate mt-0.5">{role.description}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`status-pill ${isSelected ? 'status-blue' : 'status-neutral'}`}>
                            {count} user{count !== 1 ? 's' : ''}
                          </span>
                          {isSelected && <ChevronRight className="w-3.5 h-3.5 text-[#2563EB]" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* ── Right: Permission matrix ────────────────────── */}
              <div className="flex-1 flex flex-col min-w-0">
                {selectedRole ? (
                  <div className="glass-showcase flex flex-col overflow-hidden h-full">

                    {/* Role header + save */}
                    <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between gap-4 shrink-0">
                      <div className="flex-1 min-w-0">
                        <input
                          className="font-heading text-lg font-bold text-ink w-full bg-transparent border border-transparent hover:border-[var(--border)] focus:border-[#2563EB] rounded-lg px-2 py-1 -ml-2 focus:outline-none focus:ring-1 focus:ring-[#2563EB] transition-all placeholder-ink-muted"
                          value={selectedRole.name}
                          placeholder="Role Name"
                          onChange={e => {
                            const updated = { ...selectedRole, name: e.target.value };
                            setSelectedRole(updated);
                            setRoles(roles.map(r => r.id === updated.id ? updated : r));
                          }}
                        />
                        <input
                          className="text-sm text-ink-muted w-full bg-transparent border border-transparent hover:border-[var(--border)] focus:border-[#2563EB] rounded-lg px-2 py-1 -ml-2 mt-0.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] transition-all placeholder-ink-muted"
                          value={selectedRole.description || ''}
                          placeholder="Add a description..."
                          onChange={e => {
                            const updated = { ...selectedRole, description: e.target.value };
                            setSelectedRole(updated);
                            setRoles(roles.map(r => r.id === updated.id ? updated : r));
                          }}
                        />
                      </div>
                      <Button
                        onClick={handleSaveRole}
                        disabled={isSavingRole}
                        icon={isSavingRole ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      >
                        Save Permissions
                      </Button>
                    </div>

                    {/* Permission table */}
                    <div className="flex-1 overflow-y-auto">
                      <table className="min-w-full">
                        <thead className="sticky top-0 z-10 bg-[var(--surface)]">
                          <tr className="border-b border-[var(--border)]">
                            <th className="px-5 py-3 text-left w-48">
                              <span className="mono-label">Module</span>
                            </th>
                            <th className="px-3 py-3 text-center">
                              <span className="mono-label">Read</span>
                            </th>
                            <th className="px-3 py-3 text-center">
                              <span className="mono-label">Create</span>
                            </th>
                            <th className="px-3 py-3 text-center">
                              <span className="mono-label">Edit</span>
                            </th>
                            <th className="px-3 py-3 text-center">
                              <span className="mono-label">Delete</span>
                            </th>
                            <th className="px-5 py-3 text-left">
                              <span className="mono-label">Data Scope</span>
                            </th>
                            <th className="px-5 py-3 text-center">
                              <span className="mono-label">FLS</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {Object.values(schemas).map((schema: EntityDefinition) => {
                            const perms = selectedRole.permissions?.[schema.id] || {
                              read: false, create: false, edit: false, delete: false, scope: 'all'
                            };
                            const mc = getModuleColor(schema.id);
                            const currentScope = (perms.scope || 'all') as DataScope;
                            const hasFields = schemas[schema.id]?.fields?.length > 0;

                            return (
                              <tr key={schema.id} className="hover:bg-[var(--surface-muted)] transition-colors">

                                {/* Module */}
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${mc.bg}`}>
                                      <span className={`text-[11px] font-bold ${mc.text}`}>
                                        {schema.pluralLabel.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                    <span className="text-sm font-medium text-ink">{schema.pluralLabel}</span>
                                  </div>
                                </td>

                                {/* CRUD chips */}
                                {(['read', 'create', 'edit', 'delete'] as const).map(type => (
                                  <td key={type} className="px-3 py-3.5 text-center">
                                    <div className="flex justify-center">
                                      <CrudChip
                                        label={type.charAt(0).toUpperCase() + type.slice(1)}
                                        checked={!!perms[type]}
                                        onClick={() => togglePermission(schema.id, type)}
                                      />
                                    </div>
                                  </td>
                                ))}

                                {/* Scope button group */}
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-0.5 bg-[var(--surface-muted)] rounded-lg p-0.5 w-fit">
                                    {(['all', 'team', 'own'] as const).map(scope => (
                                      <button
                                        key={scope}
                                        onClick={() => updateScope(schema.id, scope)}
                                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all ${
                                          currentScope === scope
                                            ? 'bg-[#2563EB] text-white shadow-sm'
                                            : 'text-ink-muted hover:text-ink'
                                        }`}
                                      >
                                        {scope.charAt(0).toUpperCase() + scope.slice(1)}
                                      </button>
                                    ))}
                                  </div>
                                </td>

                                {/* FLS button */}
                                <td className="px-5 py-3.5 text-center">
                                  <button
                                    onClick={() => { setFlsEntityId(schema.id); setIsFLSModalOpen(true); }}
                                    disabled={!hasFields}
                                    title={hasFields ? 'Configure Field Security' : 'No fields to configure'}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-colors ${
                                      hasFields
                                        ? 'bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-[#2563EB]'
                                        : 'bg-slate-50 text-slate-300 cursor-not-allowed'
                                    }`}
                                  >
                                    <Shield className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-3 glass-showcase border-dashed text-ink-muted">
                    <Shield className="w-10 h-10 opacity-30" />
                    <p className="text-sm">Select a role to configure permissions</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════ USER MODAL ════════════════════ */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="tri-ring-sq w-9 h-9 shrink-0">
                  <div className="flex items-center justify-center w-full h-full">
                    <Users className="w-[18px] h-[18px] text-white" />
                  </div>
                </div>
                <h3 className="font-heading text-lg font-bold text-ink">
                  {editingUser.id ? 'Edit User' : 'Add New User'}
                </h3>
              </div>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">Full Name</label>
                <input
                  className="w-full border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm text-ink focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB] outline-none transition-all bg-[var(--surface)] placeholder-ink-muted"
                  placeholder="John Smith"
                  value={editingUser.name || ''}
                  onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">Email Address</label>
                <input
                  type="email"
                  className="w-full border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm text-ink focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB] outline-none transition-all bg-[var(--surface)] placeholder-ink-muted"
                  placeholder="user@company.com"
                  value={editingUser.email || ''}
                  onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">
                  Password
                  {editingUser.id && (
                    <span className="ml-2 text-xs font-normal text-ink-muted">(leave blank to keep current)</span>
                  )}
                </label>
                <input
                  type="password"
                  className="w-full border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm text-ink focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB] outline-none transition-all bg-[var(--surface)] placeholder-ink-muted"
                  placeholder={editingUser.id ? '••••••••' : 'Enter password'}
                  value={editingUser.password || ''}
                  onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">Role</label>
                <select
                  className="w-full border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm text-ink focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB] outline-none transition-all bg-[var(--surface)] cursor-pointer"
                  value={editingUser.roleId || ''}
                  onChange={e => setEditingUser({ ...editingUser, roleId: e.target.value })}
                >
                  <option value="">Select a role...</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id} disabled={r.id.startsWith('new_')}>
                      {r.name}{r.id.startsWith('new_') ? ' (Please Save Role First)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between p-3.5 bg-[var(--surface-muted)] rounded-xl border border-[var(--border)]">
                <div>
                  <div className="text-sm font-semibold text-ink">Active User</div>
                  <div className="text-xs text-ink-muted mt-0.5">User can log in and access the system</div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingUser({ ...editingUser, isActive: !editingUser.isActive })}
                  className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${
                    editingUser.isActive ? 'bg-[#2563EB]' : 'bg-slate-200'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    editingUser.isActive ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-[var(--border-subtle)]">
              <Button variant="secondary" onClick={() => setIsUserModalOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSaveUser}
                disabled={!editingUser.name || !editingUser.email || !editingUser.roleId}
                icon={<Check className="w-4 h-4" />}
              >
                Save User
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════ FLS MODAL ════════════════════ */}
      {isFLSModalOpen && selectedRole && flsEntityId && schemas[flsEntityId] && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] overflow-hidden">

            {/* Header */}
            <div className="px-6 py-5 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-bold text-ink">Field Level Security</h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Configure visibility for{' '}
                    <span className="font-semibold text-ink">{schemas[flsEntityId].label}</span> fields
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFLSModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Field list */}
            <div className="flex-1 overflow-y-auto">
              <table className="min-w-full">
                <thead className="sticky top-0 z-10 bg-white border-b border-[var(--border)]">
                  <tr>
                    <th className="px-6 py-3 text-left"><span className="mono-label">Field</span></th>
                    <th className="px-6 py-3 text-center"><span className="mono-label">Read</span></th>
                    <th className="px-6 py-3 text-center"><span className="mono-label">Edit</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {schemas[flsEntityId].fields.map(field => {
                    const perms = selectedRole.permissions[flsEntityId]?.fields?.[field.name] || { read: true, edit: true };
                    return (
                      <tr key={field.name} className="hover:bg-[var(--surface-muted)] transition-colors">
                        <td className="px-6 py-3.5">
                          <span className="text-sm font-medium text-ink">{field.label}</span>
                          <span className="ml-2 text-xs text-ink-muted font-mono-data">({field.name})</span>
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          <div className="flex justify-center">
                            <FlsChip
                              label="Read"
                              checked={perms.read}
                              color="status-green"
                              onClick={() => toggleFieldPermission(flsEntityId, field.name, 'read')}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          <div className="flex justify-center">
                            <FlsChip
                              label="Edit"
                              checked={perms.edit}
                              color="status-blue"
                              onClick={() => toggleFieldPermission(flsEntityId, field.name, 'edit')}
                              disabled={!perms.read}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {schemas[flsEntityId].fields.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-10 text-center text-sm text-ink-muted">
                        No configurable fields for this module.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex justify-end shrink-0">
              <Button onClick={() => setIsFLSModalOpen(false)} icon={<Check className="w-4 h-4" />}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
