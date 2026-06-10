
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { User, Role, EntityDefinition, DataScope, FieldPermission } from '../types';
import { api } from '../services/api';
import { Users, Shield, Plus, Edit2, Lock, Check, X, Loader2, Eye, EyeOff, FileText, Database } from 'lucide-react';

export const UserManagement: React.FC = () => {
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
         'users': { id: 'users', label: 'Users & Roles', pluralLabel: 'Users & Roles', fields: [] },
         'object-manager': { id: 'object-manager', label: 'Object Manager', pluralLabel: 'Object Manager', fields: [] },
         'menu-manager': { id: 'menu-manager', label: 'Menu Builder', pluralLabel: 'Menu Builder', fields: [] },
         'lookups': { id: 'lookups', label: 'Lookup Manager', pluralLabel: 'Lookup Manager', fields: [] },
         'autoflow': { id: 'autoflow', label: 'Workflows', pluralLabel: 'Workflows', fields: [] },
         'layout': { id: 'layout', label: 'Form Designer', pluralLabel: 'Form Designer', fields: [] },
         'web-presenter': { id: 'web-presenter', label: 'Web Presenter', pluralLabel: 'Web Presenter', fields: [] },
      };

      setSchemas({ ...systemSchemas, ...s });
      if (r.length > 0 && !selectedRole) setSelectedRole(r[0]);
      setLoading(false);
   };

   const handleSaveUser = async () => {
      if (!editingUser.name || !editingUser.email || !editingUser.roleId) return;
      await api.saveUser(editingUser as User & { password?: string });
      setIsUserModalOpen(false);
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
      alert('Role permissions saved!');
      loadData();
   };

   // Helper to toggle permission
   const togglePermission = (entityId: string, type: 'read' | 'create' | 'edit' | 'delete') => {
      if (!selectedRole) return;

      // Ensure permissions object exists
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

   if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

   return (
      <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
         {/* Header */}
         <div className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between shrink-0">
            <div>
               <h1 className="text-xl font-bold text-gray-900">User Management</h1>
               <p className="text-xs text-gray-500">Manage system access, roles, and security policies.</p>
            </div>
            <div className="flex bg-gray-100 p-1 rounded-lg">
               <button
                  onClick={() => setActiveTab('users')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'users' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
               >
                  Users
               </button>
               <button
                  onClick={() => setActiveTab('roles')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'roles' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
               >
                  Roles & Permissions
               </button>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-7xl mx-auto">

               {/* --- USERS TAB --- */}
               {activeTab === 'users' && (
                  <div className="space-y-6">
                     <div className="flex justify-end">
                        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditingUser({ isActive: true }); setIsUserModalOpen(true); }}>Add User</Button>
                     </div>
                     <Card>
                        <table className="min-w-full divide-y divide-gray-200">
                           <thead className="bg-gray-50">
                              <tr>
                                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                 <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                              </tr>
                           </thead>
                           <tbody className="bg-white divide-y divide-gray-200">
                              {users.map(user => {
                                 const roleName = roles.find(r => r.id === user.roleId)?.name || user.roleId;
                                 return (
                                    <tr key={user.id}>
                                       <td className="px-6 py-4 whitespace-nowrap">
                                          <div className="flex items-center">
                                             <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                                {(user.name || '?').charAt(0)}
                                             </div>
                                             <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{user.name || 'Unknown User'}</div>
                                                <div className="text-sm text-gray-500">{user.email}</div>
                                             </div>
                                          </div>
                                       </td>
                                       <td className="px-6 py-4 whitespace-nowrap">
                                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                                             {roleName}
                                          </span>
                                       </td>
                                       <td className="px-6 py-4 whitespace-nowrap">
                                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                             {user.isActive ? 'Active' : 'Inactive'}
                                          </span>
                                       </td>
                                       <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                          <button
                                             onClick={() => { setEditingUser(user); setIsUserModalOpen(true); }}
                                             className="text-indigo-600 hover:text-indigo-900"
                                          >
                                             Edit
                                          </button>
                                       </td>
                                    </tr>
                                 );
                              })}
                           </tbody>
                        </table>
                     </Card>
                  </div>
               )}

               {/* --- ROLES TAB --- */}
               {activeTab === 'roles' && (
                  <div className="flex gap-6 h-[calc(100vh-200px)]">
                     {/* Roles List */}
                     <div className="w-1/4 space-y-4">
                        <Card className="h-full flex flex-col">
                           <div className="p-4 border-b border-gray-100 font-bold text-gray-700">Roles</div>
                           <div className="flex-1 p-2 space-y-1 overflow-y-auto">
                              {roles.map(role => (
                                 <button
                                    key={role.id}
                                    onClick={() => setSelectedRole(role)}
                                    className={`w-full text-left px-3 py-3 rounded-lg text-sm font-medium transition-all ${selectedRole?.id === role.id
                                       ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                       : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                                       }`}
                                 >
                                    {role.name}
                                 </button>
                              ))}
                           </div>
                           <div className="p-4 border-t border-gray-100">
                              <Button
                                 className="w-full"
                                 variant="secondary"
                                 icon={<Plus className="w-4 h-4" />}
                                 onClick={() => {
                                    const tempId = `new_` + Math.random().toString(36).substr(2, 9);
                                    const newRole: Role = {
                                       id: tempId, // unique temp ID
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
                           </div>
                        </Card>
                     </div>

                     {/* Permission Matrix */}
                     <div className="flex-1 flex flex-col">
                        {selectedRole ? (
                           <Card className="flex-1 flex flex-col overflow-hidden">
                              <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                                 <div className="flex-1">
                                    <input
                                       className="text-lg font-bold text-gray-900 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded px-2 py-1 -ml-2 mb-1 w-full placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                                       value={selectedRole.name}
                                       placeholder="Role Name"
                                       onChange={(e) => {
                                          const updated = { ...selectedRole, name: e.target.value };
                                          setSelectedRole(updated);
                                          setRoles(roles.map(r => r.id === updated.id ? updated : r));
                                       }}
                                    />
                                    <input
                                       className="text-sm text-gray-500 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded px-2 py-1 -ml-2 w-full placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                                       value={selectedRole.description || ''}
                                       placeholder="Add a description..."
                                       onChange={(e) => {
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

                              <div className="flex-1 overflow-y-auto p-6">
                                 <table className="min-w-full divide-y divide-gray-200">
                                    <thead>
                                       <tr>
                                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Module</th>
                                          <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Read</th>
                                          <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Create</th>
                                          <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Edit</th>
                                          <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Delete</th>
                                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Data Scope</th>
                                          <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Field Security</th>
                                       </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                       {Object.values(schemas).map((schema: EntityDefinition) => {
                                          const perms = selectedRole.permissions?.[schema.id] || { read: false, create: false, edit: false, delete: false, scope: 'all' };
                                          return (
                                             <tr key={schema.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-4 text-sm font-medium text-gray-900 flex items-center gap-2">
                                                   <span className="p-1 bg-gray-100 rounded text-gray-500 border border-gray-200">{schema.pluralLabel.charAt(0)}</span>
                                                   {schema.pluralLabel}
                                                </td>

                                                {/* CRUD Checkboxes */}
                                                {['read', 'create', 'edit', 'delete'].map((type) => (
                                                   <td key={type} className="px-4 py-4 text-center">
                                                      <input
                                                         type="checkbox"
                                                         checked={perms[type as 'read' | 'create' | 'edit' | 'delete'] as boolean}
                                                         onChange={() => togglePermission(schema.id, type as any)}
                                                         className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                      />
                                                   </td>
                                                ))}

                                                {/* Scope Dropdown */}
                                                <td className="px-4 py-4">
                                                   <select
                                                      className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:ring-indigo-500 focus:border-indigo-500 outline-none w-28"
                                                      value={perms.scope}
                                                      onChange={(e) => updateScope(schema.id, e.target.value as DataScope)}
                                                   >
                                                      <option value="all">All Records</option>
                                                      <option value="team">Team Only</option>
                                                      <option value="own">Own Only</option>
                                                   </select>
                                                </td>

                                                {/* FLS Button */}
                                                <td className="px-4 py-4 text-center">
                                                   <button
                                                      onClick={() => { setFlsEntityId(schema.id); setIsFLSModalOpen(true); }}
                                                      className="text-gray-400 hover:text-indigo-600 p-1 rounded hover:bg-indigo-50 transition-colors"
                                                      title="Configure Fields"
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
                           </Card>
                        ) : (
                           <div className="h-full flex items-center justify-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
                              Select a role to configure permissions
                           </div>
                        )}
                     </div>
                  </div>
               )}
            </div>
         </div>

         {/* User Modal */}
         {isUserModalOpen && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
               <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95">
                  <h3 className="text-lg font-bold text-gray-900 mb-6">{editingUser.id ? 'Edit User' : 'Add New User'}</h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                        <input
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                           value={editingUser.name || ''}
                           onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                           value={editingUser.email || ''}
                           onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password {editingUser.id && '(Leave blank to keep current)'}</label>
                        <input
                           type="password"
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                           value={editingUser.password || ''}
                           placeholder={editingUser.id ? 'Current Password Set' : 'Enter Password'}
                           onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                        <select
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                           value={editingUser.roleId || ''}
                           onChange={e => setEditingUser({ ...editingUser, roleId: e.target.value })}
                        >
                           <option value="">Select Role...</option>
                           {roles.map(r => (
                              <option key={r.id} value={r.id} disabled={r.id.startsWith('new_')}>
                                 {r.name} {r.id.startsWith('new_') ? '(Please Save Role First)' : ''}
                              </option>
                           ))}
                        </select>
                     </div>
                     <div className="flex items-center gap-2">
                        <input
                           type="checkbox"
                           id="isActive"
                           checked={editingUser.isActive}
                           onChange={e => setEditingUser({ ...editingUser, isActive: e.target.checked })}
                           className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Active User</label>
                     </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-8">
                     <Button variant="secondary" onClick={() => setIsUserModalOpen(false)}>Cancel</Button>
                     <Button onClick={handleSaveUser}>Save User</Button>
                  </div>
               </div>
            </div>
         )}

         {/* Field Level Security Modal */}
         {isFLSModalOpen && selectedRole && flsEntityId && schemas[flsEntityId] && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
               <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-0 animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                     <div>
                        <h3 className="text-lg font-bold text-gray-900">Field Level Security</h3>
                        <p className="text-sm text-gray-500">
                           Configure visibility for <span className="font-semibold text-gray-900">{schemas[flsEntityId].label}</span> fields
                        </p>
                     </div>
                     <button onClick={() => setIsFLSModalOpen(false)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-0">
                     <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                           <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Field Name</th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Visible (Read)</th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Editable (Write)</th>
                           </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                           {schemas[flsEntityId].fields.map(field => {
                              const perms = selectedRole.permissions[flsEntityId]?.fields?.[field.name] || { read: true, edit: true };
                              return (
                                 <tr key={field.name} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                       {field.label}
                                       <span className="ml-2 text-xs text-gray-400 font-normal">({field.name})</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                       <button
                                          onClick={() => toggleFieldPermission(flsEntityId, field.name, 'read')}
                                          className={`p-1.5 rounded-full transition-colors ${perms.read ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}
                                       >
                                          {perms.read ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                       </button>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                       <button
                                          onClick={() => toggleFieldPermission(flsEntityId, field.name, 'edit')}
                                          disabled={!perms.read} // Can't edit if can't read
                                          className={`p-1.5 rounded-full transition-colors ${perms.edit ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'} ${!perms.read ? 'opacity-30 cursor-not-allowed' : ''}`}
                                       >
                                          {perms.edit ? <Edit2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                       </button>
                                    </td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>

                  <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                     <Button onClick={() => setIsFLSModalOpen(false)}>Done</Button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};
