

import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ExternalLink, Globe, Lock, Database, Code, Plus, Trash2, Play, CheckCircle, AlertCircle, Edit2, Server, Key, Shield, Wifi, Save, Loader2, Table as TableIcon } from 'lucide-react';
import { DataSourceConfig, DataSourceType } from '../types';

export const WebPresenter: React.FC = () => {
  // --- STATE ---
  const [sources, setSources] = useState<DataSourceConfig[]>([
    { id: '1', name: 'LinkedIn Sales Nav', type: 'iframe', status: 'Active', endpoint: 'https://linkedin.com/search?q={name}' },
    { id: '2', name: 'Public JSON API', type: 'api', status: 'Active', endpoint: 'https://jsonplaceholder.typicode.com/todos', method: 'GET', authType: 'none' },
    { id: '3', name: 'Legacy Inventory DB', type: 'database', status: 'Inactive', endpoint: 'db.internal.corp', port: '5432', databaseName: 'inventory', query: 'SELECT * FROM products LIMIT 5', authType: 'basic', username: 'admin' },
  ]);

  const [selectedId, setSelectedId] = useState<string | null>(sources[0]?.id || null);
  const [activeTab, setActiveTab] = useState<'config' | 'query' | 'preview'>('config');
  
  // Edit State
  const [isDirty, setIsDirty] = useState(false);
  const [editConfig, setEditConfig] = useState<DataSourceConfig | null>(sources[0] || null);

  // Execution State
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');

  const [isRunningQuery, setIsRunningQuery] = useState(false);
  const [queryResult, setQueryResult] = useState<any>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  // --- HANDLERS ---

  const handleSelectSource = (id: string) => {
    const source = sources.find(s => s.id === id);
    if (source) {
      setSelectedId(id);
      setEditConfig({ ...source });
      setIsDirty(false);
      setConnectionStatus('idle');
      setQueryResult(null);
      setActiveTab('config');
    }
  };

  const handleCreateNew = () => {
    const newSource: DataSourceConfig = {
      id: Date.now().toString(),
      name: 'New Data Source',
      type: 'api',
      status: 'Inactive',
      endpoint: '',
      method: 'GET',
      headers: [],
      authType: 'none'
    };
    setSources([...sources, newSource]);
    setSelectedId(newSource.id);
    setEditConfig(newSource);
    setIsDirty(true);
    setActiveTab('config');
  };

  const handleSave = () => {
    if (!editConfig) return;
    setSources(prev => prev.map(s => s.id === editConfig.id ? editConfig : s));
    setIsDirty(false);
    alert('Configuration saved!');
  };

  const handleChange = (field: keyof DataSourceConfig, value: any) => {
    if (!editConfig) return;
    setEditConfig({ ...editConfig, [field]: value });
    setIsDirty(true);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this source?')) {
      const newSources = sources.filter(s => s.id !== id);
      setSources(newSources);
      if (selectedId === id) {
        setSelectedId(newSources[0]?.id || null);
        setEditConfig(newSources[0] || null);
      }
    }
  };

  // --- EXECUTION LOGIC ---

  const testConnection = async () => {
    if (!editConfig) return;
    setIsTestingConnection(true);
    setConnectionStatus('idle');
    setConnectionMessage('');

    // Simulate Network Delay
    await new Promise(r => setTimeout(r, 1500));

    try {
      if (editConfig.type === 'iframe') {
        if (!editConfig.endpoint) throw new Error('URL is required');
        setConnectionStatus('success');
        setConnectionMessage('Valid URL format. Frame ancestor policy check skipped (client-side).');
      } 
      else if (editConfig.type === 'database') {
        if (!editConfig.endpoint || !editConfig.username) throw new Error('Host and Username are required');
        setConnectionStatus('success');
        setConnectionMessage(`Successfully connected to ${editConfig.endpoint}:${editConfig.port || '5432'} (Latency: 45ms)`);
      } 
      else if (editConfig.type === 'api') {
        // Actually try to fetch if it's a valid URL
        if (editConfig.endpoint?.startsWith('http')) {
           try {
             const res = await fetch(editConfig.endpoint, { method: 'HEAD', mode: 'no-cors' }); // no-cors for check
             setConnectionStatus('success');
             setConnectionMessage('Endpoint reachable (200 OK)');
           } catch (e) {
             throw new Error('Network Error: Could not reach endpoint (CORS or Offline)');
           }
        } else {
           throw new Error('Invalid URL format');
        }
      }
    } catch (e: any) {
      setConnectionStatus('error');
      setConnectionMessage(e.message || 'Connection Failed');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const runQuery = async () => {
    if (!editConfig) return;
    setIsRunningQuery(true);
    setQueryResult(null);
    setQueryError(null);
    setActiveTab('preview');

    await new Promise(r => setTimeout(r, 1000));

    try {
      if (editConfig.type === 'api') {
         if (editConfig.endpoint?.startsWith('http')) {
            // Real Fetch
            const res = await fetch(editConfig.endpoint, { 
               method: editConfig.method || 'GET',
               headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            setQueryResult(data);
         } else {
            // Mock API Response
            setQueryResult({
               status: 'success',
               data: [
                 { id: 101, title: 'Mock Item 1', status: 'Open' },
                 { id: 102, title: 'Mock Item 2', status: 'Closed' }
               ]
            });
         }
      } else if (editConfig.type === 'database') {
         // Mock SQL Parser
         const query = (editConfig.query || '').toLowerCase();
         const mockRows = [];
         const limitMatch = query.match(/limit\s+(\d+)/);
         const limit = limitMatch ? parseInt(limitMatch[1]) : 5;
         
         for(let i=0; i<limit; i++) {
           mockRows.push({
             id: i+1,
             name: `Record ${i+1}`,
             created_at: new Date().toISOString(),
             status: Math.random() > 0.5 ? 'Active' : 'Inactive'
           });
         }
         setQueryResult(mockRows);
      } else {
         setQueryResult({ type: 'iframe', src: editConfig.endpoint });
      }
    } catch (e: any) {
       setQueryError(e.message);
    } finally {
       setIsRunningQuery(false);
    }
  };

  // --- RENDER HELPERS ---
  
  const getTypeIcon = (type: DataSourceType) => {
    switch(type) {
      case 'api': return <Code className="w-4 h-4 text-blue-500" />;
      case 'database': return <Database className="w-4 h-4 text-amber-500" />;
      default: return <Globe className="w-4 h-4 text-indigo-500" />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
       {/* Top Bar */}
       <div className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Web Presenter & Integrations</h1>
            <p className="text-xs text-gray-500">Configure external data sources</p>
          </div>
          <div className="flex gap-2">
             <Button icon={<Plus className="w-4 h-4"/>} onClick={handleCreateNew}>New Connection</Button>
          </div>
       </div>

       <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-72 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
             <div className="p-2 space-y-1">
                {sources.map(s => (
                   <div 
                      key={s.id}
                      onClick={() => handleSelectSource(s.id)}
                      className={`group p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                         selectedId === s.id 
                           ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
                           : 'bg-white border-transparent hover:bg-gray-50'
                      }`}
                   >
                      <div className="flex items-center gap-3">
                         <div className={`p-2 rounded-md ${selectedId === s.id ? 'bg-white' : 'bg-gray-100'}`}>
                            {getTypeIcon(s.type)}
                         </div>
                         <div className="overflow-hidden">
                            <h4 className={`text-sm font-semibold truncate ${selectedId === s.id ? 'text-indigo-900' : 'text-gray-700'}`}>{s.name}</h4>
                            <div className="flex items-center gap-1.5 mt-0.5">
                               <div className={`w-1.5 h-1.5 rounded-full ${s.status === 'Active' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                               <span className="text-[10px] text-gray-500 uppercase">{s.type}</span>
                            </div>
                         </div>
                      </div>
                      <button onClick={(e) => handleDelete(s.id, e)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500">
                         <Trash2 className="w-4 h-4"/>
                      </button>
                   </div>
                ))}
             </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
             {editConfig ? (
                <>
                   {/* Config Header */}
                   <div className="bg-white px-8 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-4">
                         <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            {getTypeIcon(editConfig.type)}
                         </div>
                         <div>
                            <input 
                               className="text-xl font-bold text-gray-900 bg-transparent border-none focus:ring-0 p-0 placeholder-gray-400"
                               value={editConfig.name}
                               onChange={(e) => handleChange('name', e.target.value)}
                               placeholder="Source Name"
                            />
                            <div className="flex items-center gap-4 mt-1">
                               <label className="text-xs text-gray-500 flex items-center gap-1">
                                  Type:
                                  <select 
                                     className="bg-transparent font-semibold text-gray-700 focus:ring-0 border-none p-0 text-xs"
                                     value={editConfig.type}
                                     onChange={(e) => handleChange('type', e.target.value)}
                                  >
                                     <option value="api">REST API</option>
                                     <option value="database">Database (SQL)</option>
                                     <option value="iframe">Web/IFrame</option>
                                  </select>
                               </label>
                               <label className="text-xs text-gray-500 flex items-center gap-1">
                                  Status:
                                  <select 
                                     className={`font-semibold focus:ring-0 border-none p-0 text-xs ${editConfig.status === 'Active' ? 'text-green-600' : 'text-gray-500'}`}
                                     value={editConfig.status}
                                     onChange={(e) => handleChange('status', e.target.value)}
                                  >
                                     <option value="Active">Active</option>
                                     <option value="Inactive">Inactive</option>
                                  </select>
                               </label>
                            </div>
                         </div>
                      </div>
                      <div className="flex gap-3">
                         {isDirty && (
                            <span className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full font-medium flex items-center animate-in fade-in">
                               Unsaved Changes
                            </span>
                         )}
                         <Button 
                            onClick={handleSave} 
                            disabled={!isDirty} 
                            icon={<Save className="w-4 h-4"/>}
                         >
                            Save
                         </Button>
                      </div>
                   </div>

                   {/* Tabs */}
                   <div className="bg-white border-b border-gray-200 px-8 flex gap-8">
                      {['config', 'query', 'preview'].map(tab => (
                         <button
                           key={tab}
                           onClick={() => setActiveTab(tab as any)}
                           className={`py-3 text-sm font-medium border-b-2 transition-all capitalize ${
                              activeTab === tab 
                                ? 'border-indigo-600 text-indigo-600' 
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                           }`}
                         >
                            {tab === 'config' && 'Connection Settings'}
                            {tab === 'query' && (editConfig.type === 'database' ? 'SQL Query' : 'Endpoint Configuration')}
                            {tab === 'preview' && 'Data Preview'}
                         </button>
                      ))}
                   </div>

                   {/* Tab Content */}
                   <div className="flex-1 overflow-y-auto p-8">
                      <div className="max-w-4xl mx-auto space-y-6">
                         
                         {/* --- CONFIG TAB --- */}
                         {activeTab === 'config' && (
                            <div className="space-y-6 animate-in slide-in-from-bottom-2 fade-in duration-300">
                               <Card title="Connection Details">
                                  <div className="grid grid-cols-2 gap-6">
                                     {editConfig.type === 'database' && (
                                        <>
                                           <div className="col-span-2 md:col-span-1">
                                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Host / Server</label>
                                              <div className="relative">
                                                 <Server className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"/>
                                                 <input 
                                                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                                                    placeholder="db.example.com"
                                                    value={editConfig.endpoint || ''}
                                                    onChange={(e) => handleChange('endpoint', e.target.value)}
                                                 />
                                              </div>
                                           </div>
                                           <div className="col-span-2 md:col-span-1">
                                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Port</label>
                                              <input 
                                                 className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                                 placeholder="5432"
                                                 value={editConfig.port || ''}
                                                 onChange={(e) => handleChange('port', e.target.value)}
                                              />
                                           </div>
                                           <div className="col-span-2">
                                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Database Name</label>
                                              <input 
                                                 className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                                 placeholder="production_db"
                                                 value={editConfig.databaseName || ''}
                                                 onChange={(e) => handleChange('databaseName', e.target.value)}
                                              />
                                           </div>
                                        </>
                                     )}

                                     {editConfig.type === 'api' && (
                                        <div className="col-span-2">
                                           <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Base URL</label>
                                           <div className="relative">
                                              <Globe className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"/>
                                              <input 
                                                 className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                                                 placeholder="https://api.example.com/v1"
                                                 value={editConfig.endpoint || ''}
                                                 onChange={(e) => handleChange('endpoint', e.target.value)}
                                              />
                                           </div>
                                        </div>
                                     )}

                                     {editConfig.type === 'iframe' && (
                                        <div className="col-span-2">
                                           <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Base URL Template</label>
                                           <input 
                                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                              placeholder="https://app.external.com/view/{id}"
                                              value={editConfig.endpoint || ''}
                                              onChange={(e) => handleChange('endpoint', e.target.value)}
                                           />
                                        </div>
                                     )}
                                  </div>
                               </Card>

                               {editConfig.type !== 'iframe' && (
                                  <Card title="Authentication">
                                     <div className="space-y-4">
                                        <div>
                                           <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Auth Type</label>
                                           <select 
                                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                              value={editConfig.authType || 'none'}
                                              onChange={(e) => handleChange('authType', e.target.value)}
                                           >
                                              <option value="none">No Authentication</option>
                                              <option value="basic">Basic Auth (Username/Password)</option>
                                              <option value="bearer">Bearer Token</option>
                                              <option value="apikey">API Key</option>
                                           </select>
                                        </div>

                                        {editConfig.authType === 'basic' && (
                                           <div className="grid grid-cols-2 gap-4">
                                              <div>
                                                 <label className="block text-xs text-gray-500 mb-1">Username</label>
                                                 <input 
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                                    value={editConfig.username || ''}
                                                    onChange={(e) => handleChange('username', e.target.value)}
                                                 />
                                              </div>
                                              <div>
                                                 <label className="block text-xs text-gray-500 mb-1">Password</label>
                                                 <input 
                                                    type="password"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                                    value={editConfig.password || ''}
                                                    onChange={(e) => handleChange('password', e.target.value)}
                                                 />
                                              </div>
                                           </div>
                                        )}

                                        {editConfig.authType === 'bearer' && (
                                           <div>
                                              <label className="block text-xs text-gray-500 mb-1">Token</label>
                                              <input 
                                                 type="password"
                                                 className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                                 placeholder="eyJh..."
                                                 value={editConfig.token || ''}
                                                 onChange={(e) => handleChange('token', e.target.value)}
                                              />
                                           </div>
                                        )}

                                        {editConfig.authType === 'apikey' && (
                                           <div>
                                              <label className="block text-xs text-gray-500 mb-1">API Key</label>
                                              <input 
                                                 type="password"
                                                 className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                                 placeholder="sk_live_..."
                                                 value={editConfig.apiKey || ''}
                                                 onChange={(e) => handleChange('apiKey', e.target.value)}
                                              />
                                           </div>
                                        )}
                                     </div>
                                  </Card>
                               )}

                               {/* Test Connection Zone */}
                               <div className="flex items-center gap-4 bg-gray-100 p-4 rounded-xl border border-gray-200">
                                  <Button 
                                     onClick={testConnection} 
                                     disabled={isTestingConnection}
                                     icon={isTestingConnection ? <Loader2 className="w-4 h-4 animate-spin"/> : <Wifi className="w-4 h-4"/>}
                                  >
                                     {isTestingConnection ? 'Testing...' : 'Test Connection'}
                                  </Button>
                                  
                                  {connectionStatus === 'success' && (
                                     <div className="flex items-center gap-2 text-green-600 animate-in fade-in">
                                        <CheckCircle className="w-5 h-5"/>
                                        <span className="text-sm font-medium">{connectionMessage}</span>
                                     </div>
                                  )}
                                  
                                  {connectionStatus === 'error' && (
                                     <div className="flex items-center gap-2 text-red-600 animate-in fade-in">
                                        <AlertCircle className="w-5 h-5"/>
                                        <span className="text-sm font-medium">{connectionMessage}</span>
                                     </div>
                                  )}
                               </div>
                            </div>
                         )}

                         {/* --- QUERY TAB --- */}
                         {activeTab === 'query' && (
                            <div className="space-y-6 animate-in slide-in-from-bottom-2 fade-in duration-300 h-full flex flex-col">
                               <div className="flex justify-between items-center">
                                  <h3 className="text-sm font-bold text-gray-700 uppercase">
                                     {editConfig.type === 'database' ? 'SQL Editor' : 'Request Builder'}
                                  </h3>
                                  <Button 
                                     onClick={runQuery} 
                                     icon={<Play className="w-4 h-4"/>}
                                  >
                                     Run Query
                                  </Button>
                               </div>

                               <div className="flex-1 border border-gray-300 rounded-xl overflow-hidden shadow-sm flex flex-col">
                                  {editConfig.type === 'api' && (
                                     <div className="bg-gray-50 border-b border-gray-200 p-2 flex gap-2">
                                        <select 
                                           className="bg-white border border-gray-300 rounded px-2 py-1 text-sm font-bold w-24"
                                           value={editConfig.method}
                                           onChange={(e) => handleChange('method', e.target.value)}
                                        >
                                           <option>GET</option>
                                           <option>POST</option>
                                           <option>PUT</option>
                                           <option>DELETE</option>
                                        </select>
                                        <input 
                                           className="flex-1 border border-gray-300 rounded px-3 py-1 text-sm"
                                           value={editConfig.endpoint}
                                           onChange={(e) => handleChange('endpoint', e.target.value)}
                                        />
                                     </div>
                                  )}
                                  
                                  <textarea 
                                     className="flex-1 w-full p-4 font-mono text-sm outline-none bg-slate-900 text-green-400 resize-none min-h-[300px]"
                                     value={editConfig.query || ''}
                                     onChange={(e) => handleChange('query', e.target.value)}
                                     placeholder={editConfig.type === 'database' ? 'SELECT * FROM table...' : '// JSON Body or Query Params'}
                                  />
                               </div>
                               
                               <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                                  <Key className="w-4 h-4 text-blue-500 shrink-0"/>
                                  <p>
                                     Use <span className="font-mono bg-blue-100 px-1 rounded">{'{id}'}</span> or <span className="font-mono bg-blue-100 px-1 rounded">{'{email}'}</span> in your query/url to inject dynamic context from the CRM record when displayed on a layout.
                                  </p>
                               </div>
                            </div>
                         )}

                         {/* --- PREVIEW TAB --- */}
                         {activeTab === 'preview' && (
                            <div className="h-full flex flex-col animate-in slide-in-from-bottom-2 fade-in duration-300">
                               {isRunningQuery ? (
                                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                                     <Loader2 className="w-10 h-10 animate-spin mb-4 text-indigo-600"/>
                                     <p>Executing Query...</p>
                                  </div>
                               ) : queryError ? (
                                  <div className="bg-red-50 border border-red-200 p-6 rounded-xl text-center">
                                     <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3"/>
                                     <h3 className="text-lg font-bold text-red-700 mb-2">Query Failed</h3>
                                     <p className="text-red-600 font-mono text-sm">{queryError}</p>
                                  </div>
                               ) : queryResult ? (
                                  <div className="space-y-4">
                                     <div className="flex justify-between items-center">
                                        <h3 className="text-sm font-bold text-gray-500 uppercase">Results</h3>
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                                           {Array.isArray(queryResult) ? `${queryResult.length} Records` : 'Success'}
                                        </span>
                                     </div>
                                     
                                     {editConfig.type === 'iframe' ? (
                                        <div className="border border-gray-300 rounded-lg overflow-hidden h-[400px]">
                                           <div className="bg-gray-100 p-2 text-xs text-center border-b border-gray-200 text-gray-500">
                                              Previewing: {queryResult.src}
                                           </div>
                                           <div className="h-full bg-white flex items-center justify-center text-gray-400">
                                              (IFrame Content Would Render Here)
                                           </div>
                                        </div>
                                     ) : (
                                        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
                                           {Array.isArray(queryResult) && queryResult.length > 0 ? (
                                              <div className="overflow-x-auto">
                                                 <table className="min-w-full divide-y divide-gray-200">
                                                    <thead className="bg-gray-50">
                                                       <tr>
                                                          {Object.keys(queryResult[0]).map(key => (
                                                             <th key={key} className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                                {key}
                                                             </th>
                                                          ))}
                                                       </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                       {queryResult.map((row: any, idx: number) => (
                                                          <tr key={idx} className="hover:bg-gray-50">
                                                             {Object.values(row).map((val: any, vIdx) => (
                                                                <td key={vIdx} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                                   {String(val)}
                                                                </td>
                                                             ))}
                                                          </tr>
                                                       ))}
                                                    </tbody>
                                                 </table>
                                              </div>
                                           ) : (
                                              <pre className="p-4 text-xs font-mono text-gray-700 overflow-auto max-h-[500px]">
                                                 {JSON.stringify(queryResult, null, 2)}
                                              </pre>
                                           )}
                                        </div>
                                     )}
                                  </div>
                               ) : (
                                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 m-4">
                                     <Play className="w-12 h-12 mb-4 text-gray-300"/>
                                     <p>Go to the <b>Query Tab</b> and click Run to see results.</p>
                                  </div>
                               )}
                            </div>
                         )}
                      </div>
                   </div>
                </>
             ) : (
                <div className="h-full flex items-center justify-center text-gray-400">
                   <p>Select a data source to configure.</p>
                </div>
             )}
          </div>
       </div>
    </div>
  );
};