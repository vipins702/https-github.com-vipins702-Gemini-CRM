import React, { useEffect, useState } from 'react';
import * as Icons from 'lucide-react';
import { ViewState, MenuItem, User } from '../types';
import { api } from '../services/api';
import { Tooltip } from './ui/Tooltip';

interface SidebarProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, isCollapsed, onToggle, onLogout }) => {
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

  const hasAccess = (item: MenuItem): boolean => {
    if (!currentUser) return false;
    const userRole = (currentUser as any).role || currentUser.roleId;

    // 1. Super Admin / System Admin
    if (userRole === 'admin') return true;
    if (currentUser.permissions?.admin) return true;

    // 2. Groups - Allow by default (logic delegates to children filtering)
    if (item.type === 'group') return true;

    // 3. Permission Check (Metadata Driven)
    // If a view is associated, check if user has 'read' permission for that module/entity
    if (item.view && currentUser.permissions && currentUser.permissions[item.view]) {
      if (currentUser.permissions[item.view].read) return true;
    }

    // 4. Legacy Role Check (Fallback)
    const allowedRoles = item.allowedRoles;
    if (!allowedRoles || allowedRoles.length === 0 || allowedRoles.includes('*')) return true;
    if (allowedRoles.includes(userRole)) return true;

    return false;
  };

  const renderIcon = (iconName?: string, isActive?: boolean) => {
    const IconComponent = (iconName && (Icons as any)[iconName]) || Icons.Circle;
    return (
      <IconComponent
        className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}
        strokeWidth={2}
        aria-hidden="true"
      />
    );
  };

  const renderItem = (item: MenuItem, depth = 0) => {
    if (!hasAccess(item)) return null;

    if (item.type === 'group') {
      const visibleChildren = item.children?.filter(c => hasAccess(c)) || [];
      if (visibleChildren.length === 0) return null;

      if (isCollapsed) {
        // In collapsed mode, we might skip group headers or just show valid children flattened?
        // For now, let's just render children
        return (
          <div key={item.id} className="mb-2">
            {visibleChildren.map(child => renderItem(child, depth + 1))}
          </div>
        );
      }

      return (
        <div key={item.id} className="mt-6 first:mt-1">
          <div className="px-3 mb-1.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.12em]">{item.label}</span>
          </div>
          <div className="space-y-0.5">
            {visibleChildren.map(child => renderItem(child, depth + 1))}
          </div>
        </div>
      );
    }

    const isActive = currentView === item.view;
    const buttonEl = (
      <button
        key={item.id}
        onClick={() => item.view && onChangeView(item.view)}
        aria-current={isActive ? 'page' : undefined}
        className={`nav-item group relative w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-start px-3 gap-3'} h-9 rounded-lg text-[13.5px] font-medium ${isActive
          ? 'nav-item-active'
          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
          }`}
      >
        {renderIcon(item.icon, isActive)}
        {!isCollapsed && <span className="truncate">{item.label}</span>}
      </button>
    );

    if (isCollapsed) {
      return (
        <Tooltip key={item.id} text={item.label}>
          {buttonEl}
        </Tooltip>
      );
    }

    return buttonEl;
  };

  return (
    <aside className={`${isCollapsed ? 'w-[72px]' : 'w-64'} bg-slate-950 text-white flex flex-col h-screen fixed left-0 top-0 border-r border-slate-800/70 z-50 transition-[width] duration-300 ease-in-out`}>
      {/* Brand Header */}
      <div className={`h-16 px-4 flex items-center shrink-0 border-b border-slate-800/70 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="relative p-2 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl shrink-0 ring-1 ring-white/10">
            <Icons.Hexagon className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold tracking-tight text-white leading-tight">FlowCRM</h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider leading-tight">Enterprise</p>
            </div>
          )}
        </div>

        {/* Toggle Button */}
        <button
          onClick={onToggle}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`${isCollapsed ? 'absolute -right-3 top-5 bg-slate-800 ring-1 ring-slate-700 hover:bg-slate-700' : 'text-slate-500 hover:text-white hover:bg-white/5'} p-1.5 rounded-lg transition-colors z-50`}
        >
          {isCollapsed ? <Icons.ChevronRight className="w-4 h-4 text-white" /> : <Icons.ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 px-3 py-3 overflow-y-auto overflow-x-hidden" aria-label="Primary">
        {menuItems.map(item => renderItem(item))}
      </nav>

      <div className="p-3 border-t border-slate-800/70 shrink-0">
        {(() => {
          const isSettings = currentView === 'settings';
          const settingsButtonEl = (
            <button
              onClick={() => onChangeView('settings')}
              aria-current={isSettings ? 'page' : undefined}
              className={`nav-item group flex items-center ${isCollapsed ? 'justify-center' : 'justify-start gap-3 px-3'} h-9 w-full rounded-lg text-[13.5px] font-medium ${isSettings ? 'nav-item-active' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'}`}
            >
              <Icons.Settings className={`w-[18px] h-[18px] shrink-0 ${isSettings ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} strokeWidth={2} aria-hidden="true" />
              {!isCollapsed && <span>Settings</span>}
            </button>
          );

          if (isCollapsed) {
            return <Tooltip text="Settings">{settingsButtonEl}</Tooltip>;
          }
          return settingsButtonEl;
        })()}

        <div className={`mt-2 pt-2 border-t border-slate-800/50 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-1'}`}>
          <div className="relative shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-950 absolute -bottom-0.5 -right-0.5 z-10"></span>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-xs font-semibold">
              {currentUser ? currentUser.name.charAt(0).toUpperCase() : 'U'}
            </div>
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate text-slate-200">{currentUser?.name || 'User'}</p>
                <p className="text-[11px] text-slate-500 truncate">{currentUser?.email || 'user@flowcrm.com'}</p>
              </div>
              <button onClick={onLogout} aria-label="Sign out" className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/5 transition-colors">
                <Icons.LogOut className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
};