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
        className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${isActive ? 'text-[#6366F1]' : 'text-[#8B8BA3] group-hover:text-slate-200'}`}
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
            <span className="text-[10px] font-semibold text-[#6B6B85] uppercase tracking-[0.12em]">{item.label}</span>
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
        className={`nav-pill group relative w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-start px-3 gap-3'} h-9 text-[13.5px] font-medium ${isActive
          ? 'nav-pill-active'
          : 'text-[#8B8BA3] hover:bg-white/[0.06] hover:text-slate-100'
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
    <aside className={`${isCollapsed ? 'w-[72px]' : 'w-64'} bg-[#0E0D13] text-white flex flex-col h-screen fixed left-0 top-0 border-r border-[#1E1D2A] z-50 transition-[width] duration-300 ease-in-out`}>
      {/* Brand Header */}
      <div className={`h-16 px-4 flex items-center shrink-0 border-b border-[#1E1D2A] ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="tri-ring-sq w-9 h-9 shrink-0">
            <div className="flex items-center justify-center">
              <Icons.Hexagon className="w-[18px] h-[18px] text-[#6366F1]" strokeWidth={2.4} />
            </div>
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <h1 className="font-heading text-[16px] font-extrabold tracking-tight gradient-text leading-tight">FlowCRM</h1>
              <p className="mono-label !text-[9px] !text-[#5A5A72] leading-tight">Enterprise</p>
            </div>
          )}
        </div>

        {/* Toggle Button */}
        <button
          onClick={onToggle}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`${isCollapsed ? 'absolute -right-3 top-5 bg-[#1E1D2A] ring-1 ring-[#2D2C3A] hover:bg-[#2D2C3A]' : 'text-[#5A5A72] hover:text-white hover:bg-white/5'} p-1.5 rounded-lg transition-colors z-50`}
        >
          {isCollapsed ? <Icons.ChevronRight className="w-4 h-4 text-white" /> : <Icons.ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 px-3 py-3 overflow-y-auto overflow-x-hidden" aria-label="Primary">
        {menuItems.map(item => renderItem(item))}
      </nav>

      <div className="p-3 border-t border-[#1E1D2A] shrink-0">
        {(() => {
          const isSuper = !!currentUser && (currentUser as any).isSuperadmin;
          if (!isSuper) return null;
          const isActive = currentView === 'platform';
          const btn = (
            <button
              onClick={() => onChangeView('platform')}
              aria-current={isActive ? 'page' : undefined}
              className={`nav-pill group flex items-center ${isCollapsed ? 'justify-center' : 'justify-start gap-3 px-3'} h-9 w-full text-[13.5px] font-medium mb-1 ${isActive ? 'nav-pill-active' : 'text-[#8B8BA3] hover:bg-white/[0.06] hover:text-slate-100'}`}
            >
              <Icons.Globe className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[#6366F1]' : 'text-[#8B8BA3] group-hover:text-slate-200'}`} strokeWidth={2} aria-hidden="true" />
              {!isCollapsed && <span>Platform</span>}
            </button>
          );
          return isCollapsed ? <Tooltip text="Platform Console">{btn}</Tooltip> : btn;
        })()}
        {(() => {
          // Allow all tenant users to access Integrations for easy webhooks
          const isActive = currentView === 'integrations';
          const btn = (
            <button
              onClick={() => onChangeView('integrations')}
              aria-current={isActive ? 'page' : undefined}
              className={`nav-pill group flex items-center ${isCollapsed ? 'justify-center' : 'justify-start gap-3 px-3'} h-9 w-full text-[13.5px] font-medium mb-1 ${isActive ? 'nav-pill-active' : 'text-[#8B8BA3] hover:bg-white/[0.06] hover:text-slate-100'}`}
            >
              <Icons.Plug className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[#6366F1]' : 'text-[#8B8BA3] group-hover:text-slate-200'}`} strokeWidth={2} aria-hidden="true" />
              {!isCollapsed && <span>Integrations</span>}
            </button>
          );
          return isCollapsed ? <Tooltip text="Integrations">{btn}</Tooltip> : btn;
        })()}
        {(() => {
          const isSettings = currentView === 'settings';
          const settingsButtonEl = (
            <button
              onClick={() => onChangeView('settings')}
              aria-current={isSettings ? 'page' : undefined}
              className={`nav-pill group flex items-center ${isCollapsed ? 'justify-center' : 'justify-start gap-3 px-3'} h-9 w-full text-[13.5px] font-medium ${isSettings ? 'nav-pill-active' : 'text-[#8B8BA3] hover:bg-white/[0.06] hover:text-slate-100'}`}
            >
              <Icons.Settings className={`w-[18px] h-[18px] shrink-0 ${isSettings ? 'text-[#6366F1]' : 'text-[#8B8BA3] group-hover:text-slate-200'}`} strokeWidth={2} aria-hidden="true" />
              {!isCollapsed && <span>Settings</span>}
            </button>
          );

          if (isCollapsed) {
            return <Tooltip text="Settings">{settingsButtonEl}</Tooltip>;
          }
          return settingsButtonEl;
        })()}

        <div className={`mt-2 pt-2 border-t border-[#1E1D2A]/80 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-1'}`}>
          <div className="relative shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0D9488] ring-2 ring-[#0E0D13] absolute -bottom-0.5 -right-0.5 z-10"></span>
            <div className="tri-ring w-8 h-8">
              <div className="flex items-center justify-center text-xs font-semibold text-ink">
                {currentUser ? currentUser.name.charAt(0).toUpperCase() : 'U'}
              </div>
            </div>
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate text-slate-200">{currentUser?.name || 'User'}</p>
                <p className="text-[11px] text-[#5A5A72] truncate">{currentUser?.email || 'user@flowcrm.com'}</p>
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