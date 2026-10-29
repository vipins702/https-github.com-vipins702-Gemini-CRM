

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EntityDefinition, ObjectManagerProps } from '../types';
import { api } from '../services/api';
import { Plus, Box, Settings, ArrowRight, Loader2, Database, LayoutTemplate, Network, Link as LinkIcon, X, Check, List, LayoutGrid } from 'lucide-react';
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
   <div className={`min-w-[180px] rounded-lg border-2 shadow-sm bg-surface overflow-hidden ${data.isSystem ? 'border-gray-200' : 'border-indigo-200'}`}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-gray-300 !border-2 !border-white" />
      <div className={`px-4 py-2 border-b text-xs font-bold uppercase tracking-wider flex justify-between items-center ${data.isSystem ? 'bg-gray-50 text-gray-500 border-gray-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
         {data.label}
         {data.isSystem && <span className="text-xs bg-gray-200 px-1.5 rounded text-gray-600">SYS</span>}
      </div>
      <div className="p-3 text-sm text-gray-600">
         <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-gray-400" />
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
   const [objView, setObjView] = useState<'grid' | 'table'>('table');
   const [schemas, setSchemas] = useState<Record<string, EntityDefinition>>({});
   const [loading, setLoading] = useState(true);

   // Create Object Modal
   const [isModalOpen, setIsModalOpen] = useState(false);
   const [newObj, setNewObj] = useState({ label: '', plural: '' });
   const [creating, setCreating] = useState(false);

   // Relationship Modal
   const [isRelModalOpen, setIsRelModalOpen] = useState(false);
   const [relConfig, setRelConfig] = useState<{
      source: string;
      target: string;
      sourceField: string;
      targetField: string;
      label: string;
      relationshipType: 'lookup' | 'master-detail';
      cascadeDelete: boolean;
      displayField: string;
   } | null>(null);

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
                  isSystem: ['lead', 'customer', 'case', 'task', 'product'].includes(schema.id)
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

      // Open Modal to Configure Relation with column mapping defaults
      setRelConfig({
         source: params.source,
         target: params.target,
         sourceField: `${params.target}_id`,
         targetField: 'id',
         label: `Related ${targetSchema.label}`,
         relationshipType: 'lookup',
         cascadeDelete: false,
         displayField: 'name'
      });
      setIsRelModalOpen(true);
   };

   const handleCreateRelation = async () => {
      if (!relConfig) return;
      try {
         await api.createRelationship({
            name: `${relConfig.source}_${relConfig.target}`,
            sourceEntity: relConfig.source,
            targetEntity: relConfig.target,
            sourceField: relConfig.sourceField,
            targetField: relConfig.targetField,
            relationshipType: relConfig.relationshipType,
            cascadeDelete: relConfig.cascadeDelete,
            displayField: relConfig.displayField
         });
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

   if (loading && Object.keys(schemas).length === 0) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

   return (
      <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
         {/* Header */}
         <div className="h-16 bg-surface border-b border-gray-200 px-8 flex items-center justify-between shrink-0 z-20">
            <div>
               <h1 className="text-xl font-bold text-gray-900">Object Manager</h1>
               <p className="text-xs text-gray-500">Manage data schema and relationships.</p>
            </div>
            <div className="flex bg-gray-100 p-1 rounded-lg">
               <button
                  onClick={() => setActiveTab('list')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'list' ? 'bg-surface shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
               >
                  <LayoutTemplate className="w-4 h-4" /> Objects
               </button>
               <button
                  onClick={() => setActiveTab('graph')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'graph' ? 'bg-surface shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
               >
                  <Network className="w-4 h-4" /> Schema Graph
               </button>
            </div>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setIsModalOpen(true)}>Create Object</Button>
         </div>

         <div className="flex-1 overflow-hidden relative">

            {/* LIST VIEW */}
            {activeTab === 'list' && (
               <div className="h-full overflow-y-auto p-8">
                  <div className="max-w-6xl mx-auto">
                  {/* View toggle */}
                  <div className="flex justify-end mb-4">
                     <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button onClick={() => setObjView('table')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${objView === 'table' ? 'bg-surface shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                           <List className="w-4 h-4" /> List
                        </button>
                        <button onClick={() => setObjView('grid')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${objView === 'grid' ? 'bg-surface shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                           <LayoutGrid className="w-4 h-4" /> Grid
                        </button>
                     </div>
                  </div>

                  {objView === 'table' ? (
                     <div className="bg-surface rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                           <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                 <th className="px-6 py-3 text-left font-semibold text-gray-700">Object</th>
                                 <th className="px-6 py-3 text-left font-semibold text-gray-700">API Name</th>
                                 <th className="px-6 py-3 text-left font-semibold text-gray-700">Type</th>
                                 <th className="px-6 py-3 text-left font-semibold text-gray-700">Fields</th>
                                 <th className="px-6 py-3 text-right font-semibold text-gray-700">Actions</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-100">
                              {Object.values(schemas).map((schema: EntityDefinition) => {
                                 const isSystem = ['lead', 'customer', 'case', 'task', 'product'].includes(schema.id);
                                 return (
                                    <tr key={schema.id} className="hover:bg-gray-50/60 transition-colors cursor-pointer" onClick={() => handleConfigure(schema.id)}>
                                       <td className="px-6 py-3.5">
                                          <div className="flex items-center gap-3">
                                             <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 shrink-0"><Box className="w-5 h-5" /></div>
                                             <div>
                                                <div className="font-semibold text-gray-900">{schema.label}</div>
                                                <div className="text-xs text-gray-400">{schema.pluralLabel}</div>
                                             </div>
                                          </div>
                                       </td>
                                       <td className="px-6 py-3.5 font-mono text-xs text-gray-500">{schema.id}</td>
                                       <td className="px-6 py-3.5">
                                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md ring-1 ring-inset ${isSystem ? 'bg-gray-100 text-gray-600 ring-gray-500/20' : 'bg-indigo-50 text-indigo-700 ring-indigo-600/20'}`}>
                                             {isSystem ? 'SYSTEM' : 'CUSTOM'}
                                          </span>
                                       </td>
                                       <td className="px-6 py-3.5 text-gray-700">{schema.fields.length}</td>
                                       <td className="px-6 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                          <button onClick={() => handleConfigure(schema.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                                             <Settings className="w-3.5 h-3.5" /> Configure
                                          </button>
                                       </td>
                                    </tr>
                                 );
                              })}
                           </tbody>
                        </table>
                     </div>
                  ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                     {Object.values(schemas).map((schema: EntityDefinition) => {
                        const isSystem = ['lead', 'customer', 'case', 'task', 'product'].includes(schema.id);
                        return (
                           <div key={schema.id} className="bg-surface rounded-xl border border-gray-200 p-6 shadow-sm hover:border-indigo-500 hover:shadow-md transition-all group relative overflow-hidden">
                              <div className={`absolute top-0 right-0 p-2 rounded-bl-xl text-xs font-bold ${isSystem ? 'bg-gray-100 text-gray-500' : 'bg-indigo-100 text-indigo-600'}`}>
                                 {isSystem ? 'SYSTEM' : 'CUSTOM'}
                              </div>

                              <div className="flex items-center gap-4 mb-4">
                                 <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                    <Box className="w-6 h-6" />
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
                  )}
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
                     <Controls className="bg-surface border-gray-200 shadow-xl rounded-lg" />

                     {/* Instructions Overlay */}
                     <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-surface px-4 py-2 rounded-full shadow-lg border border-gray-200 text-xs font-medium text-gray-500 flex items-center gap-2">
                        <Network className="w-4 h-4 text-indigo-500" />
                        Drag a line between objects to create a Lookup Relationship
                     </div>
                  </ReactFlow>
               </div>
            )}
         </div>

         {/* Create Object Modal */}
         {isModalOpen && (
            <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
               <div className="bg-surface rounded-xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95">
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
                           onChange={e => setNewObj({ ...newObj, label: e.target.value })}
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Plural Label</label>
                        <input
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                           placeholder="e.g. Projects"
                           value={newObj.plural}
                           onChange={e => setNewObj({ ...newObj, plural: e.target.value })}
                        />
                     </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-8">
                     <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                     <Button onClick={handleCreate} disabled={creating || !newObj.label}>
                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Object'}
                     </Button>
                  </div>
               </div>
            </div>
         )}

         {/* Relationship Modal */}
         {isRelModalOpen && relConfig && (
            <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
               <div className="bg-surface rounded-xl shadow-2xl max-w-2xl w-full p-6 animate-in zoom-in-95">
                  <div className="flex justify-between items-start mb-6">
                     <div>
                        <h3 className="text-lg font-bold text-gray-900">Create Relationship</h3>
                        <p className="text-sm text-gray-500">
                           Connect <span className="font-semibold text-gray-900">{schemas[relConfig.source]?.label}</span> to <span className="font-semibold text-gray-900">{schemas[relConfig.target]?.label}</span>
                        </p>
                     </div>
                     <button onClick={() => setIsRelModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                     </button>
                  </div>

                  {/* Column Mapping Section */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                     <label className="block text-xs font-bold text-gray-500 mb-3">Column Mapping</label>
                     <div className="grid grid-cols-5 gap-4 items-center">
                        {/* Source Entity */}
                        <div className="col-span-2">
                           <div className="bg-surface border border-indigo-200 rounded-lg p-3">
                              <div className="text-xs font-bold text-indigo-600 mb-2">{schemas[relConfig.source]?.label} Fields</div>
                              <select
                                 className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-surface"
                                 value={relConfig.sourceField}
                                 onChange={e => setRelConfig({ ...relConfig, sourceField: e.target.value })}
                              >
                                 <option value={`${relConfig.target}_id`}>{relConfig.target}_id (New Field)</option>
                                 {schemas[relConfig.source]?.fields?.map(f => (
                                    <option key={f.name} value={f.name}>{f.name}</option>
                                 ))}
                              </select>
                           </div>
                        </div>

                        {/* Arrow */}
                        <div className="flex justify-center">
                           <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                              <ArrowRight className="w-5 h-5 text-indigo-600" />
                           </div>
                        </div>

                        {/* Target Entity */}
                        <div className="col-span-2">
                           <div className="bg-surface border border-green-200 rounded-lg p-3">
                              <div className="text-xs font-bold text-green-600 mb-2">{schemas[relConfig.target]?.label} Fields</div>
                              <select
                                 className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-surface"
                                 value={relConfig.targetField}
                                 onChange={e => setRelConfig({ ...relConfig, targetField: e.target.value })}
                              >
                                 <option value="id">id (Primary Key)</option>
                                 {schemas[relConfig.target]?.fields?.filter(f => f.name !== 'id').map(f => (
                                    <option key={f.name} value={f.name}>{f.name}</option>
                                 ))}
                              </select>
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Field Label</label>
                        <input
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                           value={relConfig.label}
                           onChange={e => setRelConfig({ ...relConfig, label: e.target.value })}
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Display Field</label>
                        <select
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                           value={relConfig.displayField}
                           onChange={e => setRelConfig({ ...relConfig, displayField: e.target.value })}
                        >
                           {schemas[relConfig.target]?.fields?.map(f => (
                              <option key={f.name} value={f.name}>{f.label}</option>
                           ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Shown in dropdowns</p>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Relationship Type</label>
                        <select
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                           value={relConfig.relationshipType}
                           onChange={e => setRelConfig({ ...relConfig, relationshipType: e.target.value as any })}
                        >
                           <option value="lookup">Lookup (Many-to-One)</option>
                           <option value="master-detail">Master-Detail</option>
                        </select>
                     </div>
                     <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer">
                           <input
                              type="checkbox"
                              checked={relConfig.cascadeDelete}
                              onChange={e => setRelConfig({ ...relConfig, cascadeDelete: e.target.checked })}
                              className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                           />
                           <span className="text-sm text-gray-700">Cascade Delete</span>
                        </label>
                     </div>
                  </div>

                  <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-lg mb-6">
                     <strong>Summary:</strong> When a record in <b>{schemas[relConfig.source]?.label}</b> has a value in the <code className="bg-blue-100 px-1 rounded">{relConfig.sourceField}</code> field, it will link to the <b>{schemas[relConfig.target]?.label}</b> record with matching <code className="bg-blue-100 px-1 rounded">{relConfig.targetField}</code>.
                  </div>

                  <div className="flex justify-end gap-3">
                     <Button variant="secondary" onClick={() => setIsRelModalOpen(false)}>Cancel</Button>
                     <Button onClick={handleCreateRelation} icon={<Check className="w-4 h-4" />}>Create Relationship</Button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};
