

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { ModuleView } from './pages/ModuleView';
import { WorkflowBuilder } from './pages/WorkflowBuilder';
import { LayoutBuilder } from './pages/LayoutBuilder';
import { WebPresenter } from './pages/WebPresenter';
import { UserManagement } from './pages/UserManagement';
import { ObjectManager } from './pages/ObjectManager';
import { Campaigns } from './pages/Campaigns';
import { MenuManager } from './pages/MenuManager';
import { PublicWebForm } from './pages/PublicWebForm';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { ViewState, WidgetConfig, EntityDefinition, EntityType, AuthSession } from './types';
import { api } from './services/api';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [viewParams, setViewParams] = useState<any>(null); // State to hold navigation parameters
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isPublicRoute, setIsPublicRoute] = useState(false);
  
  // System Metadata State
  const [isReady, setIsReady] = useState(false);
  const [schemas, setSchemas] = useState<Record<string, EntityDefinition>>({});

  useEffect(() => {
    // Check for Public Routes (e.g., /form/:id)
    const path = window.location.pathname;
    if (path.startsWith('/form/')) {
      setIsPublicRoute(true);
      setIsReady(true); // Skip bootstrap for public route in this simple router
      return;
    }

    const bootstrap = async () => {
      await api.initialize();
      const existingSession = await api.getSession();
      setSession(existingSession);
      
      // Load schemas
      await refreshSchemas();
      
      setIsReady(true);
    };
    bootstrap();
  }, []);

  const refreshSchemas = async () => {
    const loadedSchemas = await api.getSchemas();
    setSchemas(loadedSchemas);
  };

  const handleLogin = (newSession: AuthSession) => {
    setSession(newSession);
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
      <div className="h-screen flex items-center justify-center bg-gray-50 text-indigo-600">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="font-semibold animate-pulse">Bootstrapping FlowCRM...</div>
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
      case 'settings':
        return <Settings />;
      default:
        // Check if the current view matches an entity type
        if (schemas[currentView]) {
          return <ModuleView entityType={currentView as EntityType} />;
        }
        return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans text-gray-900">
      <Sidebar 
        currentView={currentView} 
        onChangeView={handleSidebarChange}
      />
      <main className="ml-64 w-full min-h-screen transition-all duration-300">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
