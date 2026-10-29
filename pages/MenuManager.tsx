

import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { MenuItem, Role, ViewState } from '../types';
import { api } from '../services/api';
import { Menu, Plus, Trash2, Edit2, GripVertical, Check, Folder, File, Shield, ChevronRight, ChevronDown } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export const MenuManager: React.FC = () => {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  
  // Edit State
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [m, r] = await Promise.all([api.getMenu(), api.getRoles()]);
    setMenu(m);
    setRoles(r);
    setLoading(false);
  };

  const handleSave = async () => {
    await api.saveMenu(menu);
    setIsDirty(false);
    addToast('Menu Configuration Saved!', 'success');
  };

  const handleCreate = (type: 'group' | 'item') => {
    const newItem: MenuItem = {
      id: `m_${Date.now()}`,
      label: type === 'group' ? 'New Group' : 'New Item',
      type,
      view: type === 'item' ? 'dashboard' : undefined,
      children: type === 'group' ? [] : undefined,
      allowedRoles: ['*'] // All by default
    };

    if (parentId) {
      setMenu(prev => prev.map(item => {
        if (item.id === parentId && item.children) {
          return { ...item, children: [...item.children, newItem] };
        }
        return item;
      }));
    } else {
      setMenu(prev => [...prev, newItem]);
    }
    
    setSelectedItem(newItem);
    setIsDirty(true);
  };

  const handleDelete = (id: string, parentId: string | null) => {
    if (!confirm('Are you sure?')) return;
    
    if (parentId) {
      setMenu(prev => prev.map(item => {
        if (item.id === parentId && item.children) {
          return { ...item, children: item.children.filter(c => c.id !== id) };
        }
        return item;
      }));
    } else {
      setMenu(prev => prev.filter(item => item.id !== id));
    }
    
    if (selectedItem?.id === id) setSelectedItem(null);
    setIsDirty(true);
  };

  const updateItem = (updates: Partial<MenuItem>) => {
    if (!selectedItem) return;
    const updated = { ...selectedItem, ...updates };
    setSelectedItem(updated);
    
    // Recursive update helper
    const updateRecursive = (items: MenuItem[]): MenuItem[] => {
      return items.map(item => {
        if (item.id === selectedItem.id) return updated;
        if (item.children) return { ...item, children: updateRecursive(item.children) };
        return item;
      });
    };
    
    setMenu(prev => updateRecursive(prev));
    setIsDirty(true);
  };

  const toggleRole = (roleId: string) => {
    if (!selectedItem) return;
    let currentRoles = selectedItem.allowedRoles || [];
    
    if (roleId === '*') {
       // Toggle "All"
       if (currentRoles.includes('*')) currentRoles = [];
       else currentRoles = ['*'];
    } else {
       // Remove '*' if selecting specific
       currentRoles = currentRoles.filter(r => r !== '*');
       
       if (currentRoles.includes(roleId)) {
         currentRoles = currentRoles.filter(r => r !== roleId);
       } else {
         currentRoles.push(roleId);
       }
    }
    
    updateItem({ allowedRoles: currentRoles });
  };

  const renderTreeItem = (item: MenuItem, parentId: string | null = null, depth = 0) => {
    const isSelected = selectedItem?.id === item.id;
    return (
      <div key={item.id} className="mb-1">
        <div 
           className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all ${isSelected ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-surface border-transparent hover:bg-gray-50'}`}
           style={{ marginLeft: `${depth * 16}px` }}
           onClick={() => { setSelectedItem(item); setParentId(parentId); }}
        >
           <GripVertical className="w-4 h-4 text-gray-300"/>
           {item.type === 'group' ? <Folder className="w-4 h-4 text-gray-400"/> : <File className="w-4 h-4 text-gray-400"/>}
           <span className="text-sm font-medium text-gray-700">{item.label}</span>
           <div className="ml-auto flex gap-1">
              {item.type === 'group' && (
                 <button 
                   onClick={(e) => { e.stopPropagation(); setParentId(item.id); handleCreate('item'); }}
                   className="p-1 hover:bg-gray-200 rounded text-gray-400"
                   title="Add Child Item"
                 >
                    <Plus className="w-3 h-3"/>
                 </button>
              )}
              <button 
                 onClick={(e) => { e.stopPropagation(); handleDelete(item.id, parentId); }}
                 className="p-1 hover:bg-red-50 hover:text-red-500 rounded text-gray-400"
              >
                 <Trash2 className="w-3 h-3"/>
              </button>
           </div>
        </div>
        {item.children && (
           <div className="mt-1">
              {item.children.map(child => renderTreeItem(child, item.id, depth + 1))}
           </div>
        )}
      </div>
    );
  };

  // Icon preview rendering
  const renderIconPreview = () => {
    if (!selectedItem || !selectedItem.icon) return null;
    const IconComponent = (Icons as any)[selectedItem.icon];
    if (!IconComponent) return null;
    return <IconComponent className="w-5 h-5" />;
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
       {/* Header */}
       <div className="h-16 bg-surface border-b border-gray-200 px-8 flex items-center justify-between shrink-0">
          <div>
             <h1 className="text-xl font-bold text-gray-900">Menu Manager</h1>
             <p className="text-xs text-gray-500">Configure sidebar navigation and visibility.</p>
          </div>
          <div className="flex gap-2">
             <Button variant="secondary" onClick={() => { setParentId(null); handleCreate('group'); }} icon={<Folder className="w-4 h-4"/>}>Add Group</Button>
             <Button variant="secondary" onClick={() => { setParentId(null); handleCreate('item'); }} icon={<Plus className="w-4 h-4"/>}>Add Root Item</Button>
             <Button onClick={handleSave} disabled={!isDirty} icon={<Check className="w-4 h-4"/>}>Save Changes</Button>
          </div>
       </div>

       <div className="flex-1 overflow-hidden p-8 flex gap-8">
          {/* Tree View */}
          <div className="w-1/3 bg-surface border border-gray-200 rounded-xl shadow-sm flex flex-col">
             <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                <h3 className="text-xs font-bold text-gray-500">Menu Structure</h3>
             </div>
             <div className="flex-1 overflow-y-auto p-4">
                {menu.map(item => renderTreeItem(item))}
             </div>
          </div>

          {/* Properties Panel */}
          <div className="flex-1">
             {selectedItem ? (
                <Card>
                   <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                      <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                         <Edit2 className="w-5 h-5"/>
                      </div>
                      <div>
                         <h3 className="font-bold text-gray-900">Edit Item: {selectedItem.label}</h3>
                         <p className="text-xs text-gray-500">ID: {selectedItem.id}</p>
                      </div>
                   </div>
                   
                   <div className="p-6 space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                            <input 
                               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                               value={selectedItem.label}
                               onChange={e => updateItem({ label: e.target.value })}
                            />
                         </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Icon (Lucide Name)</label>
                            <div className="flex gap-2">
                               <input 
                                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                  value={selectedItem.icon || ''}
                                  onChange={e => updateItem({ icon: e.target.value })}
                                  placeholder="e.g. Users, Home"
                               />
                               {selectedItem.icon && (Icons as any)[selectedItem.icon] && (
                                  <div className="w-10 h-10 border border-gray-300 rounded-lg bg-gray-50 flex items-center justify-center text-indigo-600 shrink-0 shadow-sm animate-in zoom-in duration-200">
                                     {renderIconPreview()}
                                  </div>
                               )}
                            </div>
                         </div>
                      </div>

                      {selectedItem.type === 'item' && (
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Target View (Internal)</label>
                            <input 
                               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                               value={selectedItem.view || ''}
                               onChange={e => updateItem({ view: e.target.value as ViewState })}
                               placeholder="e.g. lead, dashboard, settings"
                            />
                         </div>
                      )}

                      {/* Permissions */}
                      <div className="border-t border-gray-100 pt-6">
                         <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-4">
                            <Shield className="w-4 h-4 text-indigo-600"/> Visible To Roles
                         </label>
                         
                         <div className="flex flex-wrap gap-2">
                            <button 
                               onClick={() => toggleRole('*')}
                               className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                                  selectedItem.allowedRoles?.includes('*') 
                                    ? 'bg-indigo-600 text-white border-indigo-600' 
                                    : 'bg-surface text-gray-600 border-gray-300 hover:border-gray-400'
                               }`}
                            >
                               All Users
                            </button>
                            {roles.map(role => (
                               <button 
                                  key={role.id}
                                  onClick={() => toggleRole(role.id)}
                                  disabled={selectedItem.allowedRoles?.includes('*')}
                                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                                     selectedItem.allowedRoles?.includes(role.id) && !selectedItem.allowedRoles?.includes('*')
                                       ? 'bg-indigo-100 text-indigo-700 border-indigo-200' 
                                       : 'bg-surface text-gray-600 border-gray-300 hover:border-gray-400 disabled:opacity-50'
                                  }`}
                               >
                                  {role.name}
                               </button>
                            ))}
                         </div>
                      </div>
                   </div>
                </Card>
             ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-surface rounded-xl border-2 border-dashed border-gray-200">
                   <Menu className="w-12 h-12 mb-4 opacity-20"/>
                   <p>Select an item from the tree to edit properties.</p>
                </div>
             )}
          </div>
       </div>
    </div>
  );
};