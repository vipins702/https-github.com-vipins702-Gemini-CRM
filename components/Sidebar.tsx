import React, { useEffect, useState } from 'react';
import * as Icons from 'lucide-react';
import { ViewState, MenuItem, User } from '../types';
import { api } from '../services/api';

interface SidebarProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView }) => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const init = async () => {
      const menu = await api.getMenu();
      const session = await api.getSession();
      setMenuItems(menu);
      setCurrentUser(session?.user || null);
    };
    init();
  }, []);

  const hasAccess = (allowedRoles?: string[]) => {
    if (!allowedRoles || allowedRoles.length === 0 || allowedRoles.includes('*')) return true;
    if (!currentUser) return false;
    if (currentUser.roleId === 'admin') return true;
    return allowedRoles.includes(currentUser.roleId);
  };

  const getIconColor = (id: string) => {
    const colors: Record<string, string> = {
      dashboard: 'text-sky-400 group-hover:text-sky-300',
      lead: 'text-orange-400 group-hover:text-orange-300',
      customer: 'text-emerald-400 group-hover:text-emerald-300',
      case: 'text-rose-400 group-hover:text-rose-300',
      task: 'text-violet-400 group-hover:text-violet-300',
      product: 'text-pink-400 group-hover:text-pink-300',
      campaigns: 'text-yellow-400 group-hover:text-yellow-300',
      autoflow: 'text-blue-400 group-hover:text-blue-300',
      'object-manager': 'text-cyan-400 group-hover:text-cyan-300',
      settings: 'text-slate-400 group-hover:text-slate-200',
      'web-presenter': 'text-teal-400 group-hover:text-teal-300',
      users: 'text-fuchsia-400 group-hover:text-fuchsia-300',
      'menu-manager': 'text-lime-400 group-hover:text-lime-300',
      layout: 'text-indigo-400 group-hover:text-indigo-300'
    };
    // Default fallback
    return colors[id] || 'text-indigo-400 group-hover:text-indigo-300';
  };

  const renderIcon = (iconName?: string, id?: string, isActive?: boolean) => {
    if (!iconName) return null;
    const IconComponent = (Icons as any)[iconName];
    // If active, we usually force white or keep the color but brighter. Let's force white for high contrast on active.
    const colorClass = isActive ? 'text-white' : (id ? getIconColor(id) : 'text-slate-400');
    
    if (!IconComponent) return <Icons.Circle className={`w-2 h-2 ${colorClass}`} />;
    
    return (
      <div className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110 group-hover:rotate-3'}`}>
        <IconComponent className={`w-5 h-5 ${colorClass} transition-colors duration-200`} />
      </div>
    );
  };

  const renderItem = (item: MenuItem, depth = 0) => {
    if (!hasAccess(item.allowedRoles)) return null;

    if (item.type === 'group') {
      const visibleChildren = item.children?.filter(c => hasAccess(c.allowedRoles)) || [];
      if (visibleChildren.length === 0) return null;

      return (
        <div key={item.id} className="mb-6 animate-in slide-in-from-left-2 duration-500">
          <div className="px-4 mb-3 flex items-center gap-2">
             <div className="h-px bg-slate-800 flex-1"></div>
             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{item.label}</span>
             <div className="h-px bg-slate-800 flex-1"></div>
          </div>
          <div className="space-y-1">
            {visibleChildren.map(child => renderItem(child, depth + 1))}
          </div>
        </div>
      );
    }

    const isActive = currentView === item.view;
    return (
      <button
        key={item.id}
        onClick={() => item.view && onChangeView(item.view)}
        className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ease-out overflow-hidden ${
          isActive 
            ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] translate-x-1' 
            : 'text-slate-400 hover:bg-white/5 hover:text-white hover:translate-x-1'
        }`}
      >
        {/* Active Indicator Bar */}
        {isActive && (
           <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-indigo-500 rounded-r-full shadow-[0_0_10px_#6366f1]"></div>
        )}
        
        {/* Icon Container */}
        <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-300 ${isActive ? 'bg-indigo-600 shadow-lg shadow-indigo-500/40' : 'bg-slate-800/50 group-hover:bg-slate-800'}`}>
           {renderIcon(item.icon, item.view || item.id, isActive)}
        </div>

        <span className="relative z-10">{item.label}</span>
        
        {/* Hover Gradient Effect */}
        <div className={`absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
      </button>
    );
  };

  return (
    <aside className="w-72 bg-[#0f172a] text-white flex flex-col h-screen fixed left-0 top-0 border-r border-slate-800 z-50 shadow-2xl">
      {/* Brand Header */}
      <div className="p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -translate-y-10 translate-x-10 pointer-events-none"></div>
        
        <div className="flex items-center gap-3 relative z-10">
          <div className="group relative">
             <div className="absolute inset-0 bg-indigo-500 rounded-xl blur opacity-40 group-hover:opacity-75 transition-opacity duration-500"></div>
             <div className="relative p-2.5 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl shadow-inner border border-white/10">
                <Icons.Hexagon className="w-7 h-7 text-white fill-indigo-400 animate-pulse-slow" />
             </div>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">FlowCRM</h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Enterprise Edition</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 pb-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {menuItems.map(item => renderItem(item))}
      </nav>

      <div className="p-4 border-t border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <button 
           onClick={() => onChangeView('settings')}
           className={`group flex items-center gap-3 px-3 py-3 w-full rounded-xl text-sm font-medium transition-all duration-300 ${currentView === 'settings' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
        >
          <div className={`p-1.5 rounded-lg ${currentView === 'settings' ? 'bg-white/20' : 'bg-slate-800 group-hover:bg-slate-700'}`}>
            <Icons.Settings className={`w-4 h-4 ${currentView === 'settings' ? 'animate-spin-slow' : 'group-hover:rotate-90 transition-transform duration-500'}`} />
          </div>
          <span>Settings</span>
        </button>
        
        <div className="mt-4 flex items-center gap-3 px-3">
           <div className="relative">
             <div className="w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-slate-900 absolute bottom-0 right-0 z-10"></div>
             <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-cyan-400 flex items-center justify-center text-xs font-bold shadow-lg">
                {currentUser ? currentUser.name.charAt(0) : 'U'}
             </div>
           </div>
           <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate text-slate-200">{currentUser?.name || 'User'}</p>
              <p className="text-xs text-slate-500 truncate">{currentUser?.email || 'user@flowcrm.com'}</p>
           </div>
           <button className="text-slate-500 hover:text-red-400 transition-colors">
              <Icons.LogOut className="w-4 h-4" />
           </button>
        </div>
      </div>
    </aside>
  );
};