

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EntityDefinition, ObjectManagerProps } from '../types';
import { api } from '../services/api';
import { Plus, Box, Settings, ArrowRight, Loader2, Database, LayoutTemplate, Network, Link as LinkIcon, X, Check } from 'lucide-react';
import ReactFlow, { 
  Node, 
  Edge, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Connection, 
  MarkerType,
  Handle,
  Position 
} from 'reactflow';

// Custom Node for Schema Graph
const EntityNode = ({ data }: { data: { label: string, fields: number, isSystem: boolean } }) => (
  <div className={`min-w-[180px] rounded-lg border-2 shadow-sm bg-white overflow-hidden ${data.isSystem ? 'border-gray-200' : 'border-indigo-200'}`}>
     <Handle type="target" position={Position.Left} className="w-3 h-3 bg-gray-300 !border-2 !border-white" />
     <div className={`px-4 py-2 border-b text-xs font-bold uppercase tracking-wider flex justify-between items-center ${data.isSystem ? 'bg-gray-50 text-gray-500 border-gray-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
        {data.label}
        {data.isSystem && <span className="text-[10px] bg-gray-200 px-1.5 rounded text-gray-600">SYS</span>}
     </div>
     <div className="p-3 text-sm text-gray-600">
        <div className="flex items-center gap-2">
           <Box className="w-4 h-4 text-gray-400"/>
           <span>{data.fields} Fields</span>
        </div>
     </div>
     <Handle type="source" position={Position.Right} className="w-3 h-3 bg-indigo-500 !border-2 !border-white" />
  </div>
);

const nodeTypes = {
  entity: EntityNode
};

export const ObjectManager: React.FC<ObjectManagerProps> = ({ onNavigate, onRefreshSchemas }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'graph'>('list');
  const [schemas, setSchemas] = useState<Record<string, EntityDefinition>>({});
  const [loading, setLoading] = useState(true);
  
  // Create Object Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newObj, setNewObj] = useState({ label: '', plural: '' });
  const [creating, setCreating] = useState(false);

  // Relationship Modal
  const [isRelModalOpen, setIsRelModalOpen] = useState(false);
  const [relConfig, setRelConfig] = useState<{ source: string, target: string, fieldName: string, label: string } | null>(null);

  // Graph State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    loadData();
  }, [activeTab]); // Reload when tab changes to refresh graph

  const loadData = async () => {
    setLoading(true);
    const s = await api.getSchemas();
    setSchemas(s);
    
    // Build Graph Data
    if (activeTab === 'graph') {
       const newNodes: Node[] = [];
       const newEdges: Edge[] = [];
       const entities = Object.values(s) as EntityDefinition[];
       
       // Simple grid layout
       entities.forEach((schema, idx) => {
          const col = idx % 3;
          const row = Math.floor(idx / 3);
          
          newNodes.push({
             id: schema.id,
             type: 'entity',
             position: { x: col * 300 + 50, y: row * 200 + 50 },
             data: { 
                label: schema.label, 
                fields: schema.fields.length,
                isSystem: ['lead','customer','case','task','product'].includes(schema.id)
             }
          });

          // Edges (Lookups)
          schema.fields.forEach(field => {
             if (field.type === 'lookup' && field.lookupTarget) {
                newEdges.push({
                   id: `e-${schema.id}-${field.name}`,
                   source: schema.id,
                   target: field.lookupTarget,
                   label: field.label,
                   type: 'smoothstep',
                   markerEnd: { type: MarkerType.ArrowClosed },
                   style: { stroke: '#6366f1', strokeWidth: 2 }
                });
             }
          });
       });
       setNodes(newNodes);
       setEdges(newEdges);
    }

    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newObj.label || !newObj.plural) return;
    setCreating(true);
    try {
       await api.createEntity(newObj.label, newObj.plural);
       // Refresh App State
       await onRefreshSchemas();
       
       alert('Custom Object Created!');
       setIsModalOpen(false);
       setNewObj({ label: '', plural: '' });
       loadData();
    } catch (e: any) {
       alert(e.message || 'Failed to create object');
    } finally {
       setCreating(false);
    }
  };

  const onConnect = (params: Connection) => {
     if (!params.source || !params.target) return;
     if (params.source === params.target) return; // No self reference for now

     const sourceSchema = schemas[params.source];
     const targetSchema = schemas[params.target];
     
     // Open Modal to Configure Relation
     setRelConfig({
        source: params.source,
        target: params.target,
        fieldName: `related_${params.target}`,
        label: `Related ${targetSchema.label}`
     });
     setIsRelModalOpen(true);
  };

  const handleCreateRelation = async () => {
     if (!relConfig) return;
     try {
        await api.createRelation(relConfig.source, relConfig.target, relConfig.fieldName, relConfig.label);
        await onRefreshSchemas();
        setIsRelModalOpen(false);
        setRelConfig(null);
        loadData(); // Reload graph
     } catch (e) {
        alert('Failed to create relationship');
     }
  };

  const handleConfigure = (entityId: string) => {
     if (onNavigate) {
        onNavigate('layout', { entity: entityId });
     }
  };

  if (loading && Object.keys(schemas).length === 0) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600"/></div>;

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
       {/* Header */}
       <div className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between shrink-0 z-20">
          <div>
             <h1 className="text-xl font-bold text-gray-900">Object Manager</h1>
             <p className="text-xs text-gray-500">Manage data schema and relationships.</p>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-lg">
             <button 
               onClick={() => setActiveTab('list')}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'list' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
             >
                <LayoutTemplate className="w-4 h-4"/> Objects
             </button>
             <button 
               onClick={() => setActiveTab('graph')}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'graph' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
             >
                <Network className="w-4 h-4"/> Schema Graph
             </button>
          </div>
          <Button icon={<Plus className="w-4 h-4"/>} onClick={() => setIsModalOpen(true)}>Create Object</Button>
       </div>

       <div className="flex-1 overflow-hidden relative">
          
          {/* LIST VIEW */}
          {activeTab === 'list' && (
             <div className="h-full overflow-y-auto p-8">
                <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   {Object.values(schemas).map((schema: EntityDefinition) => {
                      const isSystem = ['lead','customer','case','task','product'].includes(schema.id);
                      return (
                         <div key={schema.id} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:border-indigo-500 hover:shadow-md transition-all group relative overflow-hidden">
                            <div className={`absolute top-0 right-0 p-2 rounded-bl-xl text-xs font-bold ${isSystem ? 'bg-gray-100 text-gray-500' : 'bg-indigo-100 text-indigo-600'}`}>
                               {isSystem ? 'SYSTEM' : 'CUSTOM'}
                            </div>
                            
                            <div className="flex items-center gap-4 mb-4">
                               <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                  <Box className="w-6 h-6"/>
                               </div>
                               <div>
                                  <h3 className="font-bold text-gray-900 text-lg">{schema.label}</h3>
                                  <p className="text-xs text-gray-500 font-mono">ID: {schema.id}</p>
                               </div>
                            </div>

                            <div className="space-y-2 mb-6">
                               <div className="flex justify-between text-sm">
                                  <span className="text-gray-500">Fields</span>
                                  <span className="font-semibold text-gray-900">{schema.fields.length}</span>
                               </div>
                               <div className="flex justify-between text-sm">
                                  <span className="text-gray-500">Plural Name</span>
                                  <span className="font-semibold text-gray-900">{schema.pluralLabel}</span>
                               </div>
                            </div>
                            
                            <div className="pt-4 border-t border-gray-100 flex gap-2">
                                <button 
                                   onClick={() => handleConfigure(schema.id)}
                                   className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
                                >
                                   <Settings className="w-4 h-4" /> Configure
                                </button>
                            </div>
                         </div>
                      );
                   })}
                </div>
             </div>
          )}

          {/* GRAPH VIEW */}
          {activeTab === 'graph' && (
             <div className="h-full w-full bg-slate-50">
                <ReactFlow
                   nodes={nodes}
                   edges={edges}
                   onNodesChange={onNodesChange}
                   onEdgesChange={onEdgesChange}
                   onConnect={onConnect}
                   nodeTypes={nodeTypes}
                   fitView
                >
                   <Background color="#cbd5e1" gap={20} size={1} />
                   <Controls className="bg-white border-gray-200 shadow-xl rounded-lg" />
                   
                   {/* Instructions Overlay */}
                   <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow-lg border border-gray-200 text-xs font-medium text-gray-500 flex items-center gap-2">
                      <Network className="w-4 h-4 text-indigo-500"/>
                      Drag a line between objects to create a Lookup Relationship
                   </div>
                </ReactFlow>
             </div>
          )}
       </div>

       {/* Create Object Modal */}
       {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95">
                <div className="flex items-center gap-3 mb-6">
                   <div className="p-3 bg-indigo-100 rounded-lg text-indigo-600">
                      <Database className="w-6 h-6" />
                   </div>
                   <div>
                      <h3 className="text-xl font-bold text-gray-900">New Custom Object</h3>
                      <p className="text-sm text-gray-500">Define a new entity to track.</p>
                   </div>
                </div>
                
                <div className="space-y-5">
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Singular Label</label>
                      <input 
                         autoFocus
                         className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                         placeholder="e.g. Project"
                         value={newObj.label}
                         onChange={e => setNewObj({...newObj, label: e.target.value})}
                      />
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Plural Label</label>
                      <input 
                         className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                         placeholder="e.g. Projects"
                         value={newObj.plural}
                         onChange={e => setNewObj({...newObj, plural: e.target.value})}
                      />
                   </div>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                   <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                   <Button onClick={handleCreate} disabled={creating || !newObj.label}>
                      {creating ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Create Object'}
                   </Button>
                </div>
             </div>
          </div>
       )}

       {/* Relationship Modal */}
       {isRelModalOpen && relConfig && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95">
                <div className="flex justify-between items-start mb-6">
                    <div>
                       <h3 className="text-lg font-bold text-gray-900">Create Relationship</h3>
                       <p className="text-sm text-gray-500">
                          Connect <span className="font-semibold text-gray-900">{schemas[relConfig.source]?.label}</span> to <span className="font-semibold text-gray-900">{schemas[relConfig.target]?.label}</span>
                       </p>
                    </div>
                    <div className="bg-indigo-50 p-2 rounded-full text-indigo-600">
                       <LinkIcon className="w-5 h-5"/>
                    </div>
                </div>

                <div className="space-y-4">
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Field Label (on {schemas[relConfig.source]?.label})</label>
                      <input 
                         className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                         value={relConfig.label}
                         onChange={e => setRelConfig({...relConfig, label: e.target.value})}
                      />
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Field Name (API)</label>
                      <input 
                         className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50"
                         value={relConfig.fieldName}
                         readOnly
                      />
                   </div>
                   <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-lg">
                      This will create a <b>Lookup</b> field on {schemas[relConfig.source]?.label} pointing to {schemas[relConfig.target]?.label}.
                   </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                   <Button variant="secondary" onClick={() => setIsRelModalOpen(false)}>Cancel</Button>
                   <Button onClick={handleCreateRelation}>Create Relationship</Button>
                </div>
             </div>
          </div>
       )}
    </div>
  );
};
