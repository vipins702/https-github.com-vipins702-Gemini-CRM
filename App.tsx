

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ViewAsBanner } from './components/ViewAsRole';
import { ForcedPasswordChange } from './components/ChangePassword';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { ModuleView } from './pages/ModuleView';
import { Journeys } from './pages/Journeys';
import { LayoutBuilder } from './pages/LayoutBuilder';
import { WebPresenter } from './pages/WebPresenter';
import { UserManagement } from './pages/UserManagement';
import { ObjectManager } from './pages/ObjectManager';
import { Campaigns } from './pages/Campaigns';
import { MenuManager } from './pages/MenuManager';
import { LookupManager } from './pages/LookupManager';
import { PublicWebForm } from './pages/PublicWebForm';
import { Settings } from './pages/Settings';
import { Customer360 } from './pages/Customer360';
import { Lead360 } from './pages/Lead360';
import { CategoryManager } from './pages/CategoryManager';
import { Integrations } from './pages/Integrations';
import { Platform } from './pages/Platform';
import { LeadRules } from './pages/LeadRules';
import { FieldTriggers } from './pages/FieldTriggers';
import { IndustryPacks } from './pages/IndustryPacks';
import { LeadCapture } from './pages/LeadCapture';
import { AgentConsole } from './pages/AgentConsole';
import { Reports } from './pages/Reports';
import { WhatsAppInbox } from './pages/WhatsAppInbox';
import { EmailInbox } from './pages/EmailInbox';
import { CalendarTasks } from './pages/CalendarTasks';
import { Quotes } from './pages/Quotes';
import { Pipeline } from './pages/Pipeline';
import { ProcessBuilder } from './pages/ProcessBuilder';
import { Login } from './pages/Login';
import { AuditLog } from './pages/AuditLog';
import { ScoringRules } from './pages/ScoringRules';
import { AssignmentRules } from './pages/AssignmentRules';
import { Sequences } from './pages/Sequences';
import { ViewState, WidgetConfig, EntityDefinition, EntityType, AuthSession } from './types';
import { api } from './services/api';
import { applySettings } from './services/theme';

import { ToastProvider } from './components/ui/Toast';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [viewParams, setViewParams] = useState<any>(null); // State to hold navigation parameters
  const [backStack, setBackStack] = useState<{ view: ViewState; params: any }[]>([]);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isPublicRoute, setIsPublicRoute] = useState(false);
  const [isResetRoute] = useState(() => typeof window !== 'undefined' && window.location.pathname.startsWith('/reset-password'));

  // System Metadata State
  const [isReady, setIsReady] = useState(false);
  const [schemas, setSchemas] = useState<Record<string, EntityDefinition>>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    typeof window !== 'undefined' && window.innerWidth < 1280
  );

  // Width of the open sidebar; the user drags the edge to change it and we remember it.
  const [sidebarWidth, setSidebarWidthState] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('flowcrm_sidebar_width'));
      return saved >= 200 && saved <= 420 ? saved : 256;
    } catch { return 256; }
  });
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  // Phones: the sidebar becomes a slide-out menu opened from the top bar.
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [phoneNavOpen, setPhoneNavOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => { setIsPhone(mq.matches); if (!mq.matches) setPhoneNavOpen(false); };
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const setSidebarWidth = (w: number) => {
    setSidebarWidthState(w);
    try { localStorage.setItem('flowcrm_sidebar_width', String(w)); } catch { /* private mode */ }
  };

  // Responsive: auto-collapse the sidebar to icons below 1280px
  useEffect(() => {
    const onResize = () => setIsSidebarCollapsed(window.innerWidth < 1280);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    // Check for Public Routes (e.g., /form/:id)
    const path = window.location.pathname;
    if (isResetRoute) { setIsReady(true); return; }
    if (path.startsWith('/form/')) {
      setIsPublicRoute(true);
      setIsReady(true); // Skip bootstrap for public route in this simple router
      return;
    }

    const bootstrap = async () => {
      try {
        await api.initialize();
        const existingSession = await api.getSession();

        // Only load schemas if user has a session
        if (existingSession) {
          try {
            await refreshSchemas();
            // Apply per-tenant theme/appearance settings
            try { applySettings(await api.getSettings()); } catch (e) { /* keep defaults */ }
            // Pick up role changes made since the last login; fall back to the saved copy offline.
            const live = await api.refreshSession().catch(() => null);
            setSession(live || existingSession); // Session is valid
          } catch (error: any) {
            // Session token is invalid/expired, clear it
            console.warn('Session expired, clearing...');
            await api.logout();
            setSession(null);
          }
        }

        setIsReady(true);
      } catch (error) {
        console.error("Failed to bootstrap application:", error);
        setIsReady(true); // Allow app to render login page even on error
      }
    };
    bootstrap();
  }, []);

  const refreshSchemas = async () => {
    const loadedSchemas = await api.getSchemas();
    setSchemas(loadedSchemas);
  };

  const handleLogin = async (newSession: AuthSession) => {
    setSession(newSession);
    // Load schemas after login
    await refreshSchemas();
    // Apply per-tenant theme/appearance settings
    try { applySettings(await api.getSettings()); } catch (e) { /* keep defaults */ }
  };

  const handleNavigate = (view: ViewState, params?: any) => {
    setBackStack(stack => [...stack.slice(-19), { view: currentView, params: viewParams }]);
    setCurrentView(view);
    setViewParams(params ?? null);
  };

  // "Back" returns to wherever the user came from (falls back when opened directly).
  const goBack = (fallback: ViewState) => {
    const prev = backStack[backStack.length - 1];
    setBackStack(stack => stack.slice(0, -1));
    setCurrentView(prev?.view || fallback);
    setViewParams(prev?.params ?? null);
  };

  // Helper wrapper for Sidebar which expects simple state setter
  const handleSidebarChange = (view: ViewState) => {
    setCurrentView(view);
    setBackStack([]);
    setViewParams(null); // Reset params on sidebar click
    setPhoneNavOpen(false);
  };

  // Keep the address bar honest: /app while signed in, /login while signed out.
  useEffect(() => {
    if (!isReady || isPublicRoute || isResetRoute) return;
    const want = session ? '/app' : '/login';
    if (window.location.pathname !== want) window.history.replaceState(null, '', want);
  }, [isReady, session, isPublicRoute, isResetRoute]);

  if (isResetRoute) {
    return <ResetPassword />;
  }

  if (!isReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas font-sans" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-4 animate-fadeIn">
          <img src="/site/mark.svg" alt="" width={56} height={56} className="rounded-2xl shadow-[var(--elev-3)]" />
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-accent animate-spin" aria-hidden="true" />
            Loading FlowCRM…
          </div>
        </div>
      </div>
    );
  }

  // PUBLIC ROUTE HANDLER
  if (isPublicRoute) {
    return <PublicWebForm />;
  }

  // Unauthenticated State
  if (!session) {
    return <Login onLogin={handleLogin} />;
  }

  // New users and admin resets must pick their own password before using the app.
  if (session.user?.mustChangePassword) {
    return (
      <ForcedPasswordChange
        email={session.user.email}
        onDone={async () => setSession(await api.getSession())}
        onSignOut={() => { api.logout(); setSession(null); }}
      />
    );
  }

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'autoflow':
        return <Journeys />;
      case 'layout':
        return <LayoutBuilder initialEntity={viewParams?.entity} />;
      case 'web-presenter':
        return <WebPresenter />;
      case 'users':
        return <UserManagement />;
      case 'campaigns':
        return <Campaigns />;
      case 'object-manager':
        return <ObjectManager onNavigate={handleNavigate} onRefreshSchemas={refreshSchemas} />;
      case 'menu-manager':
        return <MenuManager />;
      case 'lookups':
        return <LookupManager />;
      case 'field-triggers':
        return <FieldTriggers />;
      case 'packs':
        return <IndustryPacks />;
      case 'lead-rules':
        return <LeadRules />;
      case 'lead-capture':
        return <LeadCapture />;
      case 'agent-console':
        return <AgentConsole onNavigate={handleNavigate} />;
      case 'reports':
        return <Reports schemas={schemas} />;
      case 'whatsapp':
        return <WhatsAppInbox key={viewParams?.phone || 'inbox'} initialPhone={viewParams?.phone} onNavigate={handleNavigate} />;
      case 'email-inbox':
        return <EmailInbox key={viewParams?.email || 'inbox'} initialEmail={viewParams?.email} onNavigate={handleNavigate} />;
      case 'calendar':
        return <CalendarTasks onNavigate={handleNavigate} />;
      case 'quotes':
        return <Quotes onNavigate={handleNavigate} />;
      case 'pipeline':
        return <Pipeline onNavigate={handleNavigate} />;
      case 'processes':
        return <ProcessBuilder />;
      case 'customer-360':
        return <Customer360 customerId={viewParams?.customerId} onBack={() => goBack('customer')} onNavigate={handleNavigate} />;
      case 'lead-360':
        return <Lead360 key={viewParams?.leadId} leadId={viewParams?.leadId} onBack={() => goBack('lead')} onNavigate={handleNavigate} />;
      case 'categories':
        return <CategoryManager />;
      case 'integrations':
        return <Integrations onNavigate={handleNavigate} />;
      case 'platform':
        return <Platform onNavigate={handleNavigate} />;
      case 'settings':
        return <Settings />;
      case 'audit-log':
        return <AuditLog />;
      case 'scoring-rules':
        return <ScoringRules />;
      case 'assignment-rules':
        return <AssignmentRules />;
      case 'sequences':
        return <Sequences />;
      default:
        // Check if the current view matches an entity type
        if (schemas[currentView]) {
          return <ModuleView key={`${currentView}:${viewParams?.editId || ''}`} entityType={currentView as EntityType} editRecordId={viewParams?.editId} onNavigate={handleNavigate} />;
        }
        return <Dashboard />;
    }
  };


  return (
    <ToastProvider>
      <div className="relative z-[1] flex min-h-screen font-sans text-ink">
        <Sidebar
          currentView={currentView}
          onChangeView={handleSidebarChange}
          isCollapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          onCollapseChange={setIsSidebarCollapsed}
          onDragState={setIsDraggingSidebar}
          isPhone={isPhone}
          phoneOpen={phoneNavOpen}
          onClosePhone={() => setPhoneNavOpen(false)}
          onLogout={() => {
            api.logout();
            setSession(null);
          }}
        />
        <main
          style={{ marginLeft: isPhone ? 0 : isSidebarCollapsed ? 72 : sidebarWidth }}
          className={`flex-1 min-w-0 min-h-screen ${isDraggingSidebar ? '' : 'transition-[margin] duration-300 ease-in-out'}`}
        >
          <ViewAsBanner />
          <TopBar currentView={currentView} schemas={schemas} onNavigate={handleNavigate} onOpenMenu={isPhone ? () => setPhoneNavOpen(true) : undefined} />
          {renderContent()}
        </main>
        {isPhone && phoneNavOpen && (
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={() => setPhoneNavOpen(false)} aria-hidden="true" />
        )}
      </div>
    </ToastProvider>
  );
};

export default App;
