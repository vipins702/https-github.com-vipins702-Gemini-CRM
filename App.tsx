

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Dashboard } from './pages/Dashboard';
import { ModuleView } from './pages/ModuleView';
import { WorkflowBuilder } from './pages/WorkflowBuilder';
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
import { ViewState, WidgetConfig, EntityDefinition, EntityType, AuthSession } from './types';
import { api } from './services/api';
import { applySettings } from './services/theme';

import { ToastProvider } from './components/ui/Toast';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [viewParams, setViewParams] = useState<any>(null); // State to hold navigation parameters
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isPublicRoute, setIsPublicRoute] = useState(false);

  // System Metadata State
  const [isReady, setIsReady] = useState(false);
  const [schemas, setSchemas] = useState<Record<string, EntityDefinition>>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    typeof window !== 'undefined' && window.innerWidth < 1280
  );

  // Responsive: auto-collapse the sidebar to icons below 1280px
  useEffect(() => {
    const onResize = () => setIsSidebarCollapsed(window.innerWidth < 1280);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    // Check for Public Routes (e.g., /form/:id)
    const path = window.location.pathname;
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
            setSession(existingSession); // Session is valid
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
    setCurrentView(view);
    if (params) {
      setViewParams(params);
    }
  };

  // Helper wrapper for Sidebar which expects simple state setter
  const handleSidebarChange = (view: ViewState) => {
    setCurrentView(view);
    setViewParams(null); // Reset params on sidebar click
  };

  if (!isReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950 font-sans">
        <div className="flex flex-col items-center gap-6 animate-in fade-in duration-700">
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/30 animate-pulse">
              <span className="text-white font-black text-2xl tracking-tighter">F</span>
            </div>
            <div className="absolute inset-0 w-16 h-16 rounded-2xl bg-indigo-500/30 blur-xl animate-ping -z-10"></div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="text-white font-extrabold text-base tracking-widest animate-pulse">BOOSTING FLOWCRM</div>
            <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Metadata Engine Initializing</div>
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

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'autoflow':
        return <WorkflowBuilder />;
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
      case 'lead-rules':
        return <LeadRules />;
      case 'lead-capture':
        return <LeadCapture />;
      case 'agent-console':
        return <AgentConsole onNavigate={handleNavigate} />;
      case 'reports':
        return <Reports schemas={schemas} />;
      case 'whatsapp':
        return <WhatsAppInbox onNavigate={handleNavigate} />;
      case 'email-inbox':
        return <EmailInbox onNavigate={handleNavigate} />;
      case 'calendar':
        return <CalendarTasks onNavigate={handleNavigate} />;
      case 'quotes':
        return <Quotes onNavigate={handleNavigate} />;
      case 'pipeline':
        return <Pipeline onNavigate={handleNavigate} />;
      case 'processes':
        return <ProcessBuilder />;
      case 'customer-360':
        return <Customer360 customerId={viewParams?.customerId} onBack={() => setCurrentView('customer')} onNavigate={handleNavigate} />;
      case 'lead-360':
        return <Lead360 leadId={viewParams?.leadId} onBack={() => setCurrentView('pipeline')} onNavigate={handleNavigate} />;
      case 'categories':
        return <CategoryManager />;
      case 'integrations':
        return <Integrations onNavigate={handleNavigate} />;
      case 'platform':
        return <Platform onNavigate={handleNavigate} />;
      case 'settings':
        return <Settings />;
      default:
        // Check if the current view matches an entity type
        if (schemas[currentView]) {
          return <ModuleView entityType={currentView as EntityType} onNavigate={handleNavigate} />;
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
          onLogout={() => {
            api.logout();
            setSession(null);
          }}
        />
        <main className={`${isSidebarCollapsed ? 'ml-[72px]' : 'ml-64'} w-full min-h-screen transition-[margin] duration-300 ease-in-out`}>
          <TopBar currentView={currentView} schemas={schemas} onNavigate={handleNavigate} />
          {renderContent()}
        </main>
      </div>
    </ToastProvider>
  );
};

export default App;
