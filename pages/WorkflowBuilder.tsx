
import React, { useCallback, useState, useEffect } from 'react';
import ReactFlow, { 
  addEdge, 
  Background, 
  Controls, 
  MiniMap, 
  Connection, 
  Edge, 
  Node,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  NodeProps
} from 'reactflow';
import { Play, Save, Trash2, Zap, GitBranch, Mail, Clock, UserPlus, FileText, Loader2, CheckCircle, X, Settings, MousePointerClick, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { FlowNodeData } from '../types';
import { api } from '../services/api';

// --- CUSTOM NODE COMPONENTS ---

const TriggerNode = ({ data, selected }: NodeProps<FlowNodeData>) => (
  <div className={`relative group min-w-[200px] transition-all duration-200 ${selected ? 'scale-105' : ''}`}>
    <div className={`
       rounded-full px-6 py-3 shadow-lg flex items-center gap-3 justify-center border-2
       ${selected ? 'bg-indigo-600 border-indigo-400 ring-2 ring-indigo-200' : 'bg-slate-900 border-slate-800'}
    `}>
       <div className="p-1.5 bg-indigo-500 rounded-full text-white">
          <Zap className="w-4 h-4" fill="currentColor" />
       </div>
       <div className="text-white font-bold tracking-wide text-sm">{data.label}</div>
    </div>
    <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
  </div>
);

const ActionNode = ({ data, selected }: NodeProps<FlowNodeData>) => (
  <div className={`relative group min-w-[220px] transition-all duration-200 ${selected ? 'ring-2 ring-indigo-500 ring-offset-2 rounded-xl' : ''}`}>
    <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white" />
    
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
       <div className="h-1 bg-indigo-500 w-full"></div>
       <div className="p-4 flex items-start gap-3">
          <div className={`p-2 rounded-lg shrink-0 ${
             data.icon === 'mail' ? 'bg-blue-50 text-blue-600' : 
             data.icon === 'user-plus' ? 'bg-green-50 text-green-600' : 
             'bg-slate-50 text-slate-600'
          }`}>
             {data.icon === 'mail' && <Mail className="w-5 h-5"/>}
             {data.icon === 'user-plus' && <UserPlus className="w-5 h-5"/>}
             {data.icon === 'file-text' && <FileText className="w-5 h-5"/>}
             {!['mail', 'user-plus', 'file-text'].includes(data.icon || '') && <Settings className="w-5 h-5"/>}
          </div>
          <div>
             <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{data.type}</div>
             <div className="font-semibold text-slate-900 text-sm leading-tight">{data.label}</div>
          </div>
       </div>
    </div>

    <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
  </div>
);

const ConditionNode = ({ data, selected }: NodeProps<FlowNodeData>) => (
  <div className={`relative group min-w-[180px] transition-all duration-200 ${selected ? 'scale-105' : ''}`}>
    <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white" />
    
    <div className={`
      transform rotate-0 bg-amber-50 border-2 border-amber-200 rounded-lg p-3 shadow-sm text-center
      ${selected ? 'ring-2 ring-amber-400' : ''}
    `}>
       <div className="flex flex-col items-center justify-center gap-1">
          <GitBranch className="w-5 h-5 text-amber-600" />
          <span className="font-bold text-amber-900 text-sm">{data.label}</span>
       </div>
    </div>
    
    {/* Two source handles for True/False branches */}
    <div className="absolute -bottom-3 left-1/4 -translate-x-1/2 flex flex-col items-center">
       <span className="text-[9px] font-bold text-green-600 bg-green-50 px-1 rounded mb-1">YES</span>
       <Handle type="source" id="true" position={Position.Bottom} className="!relative !left-0 !transform-none !w-3 !h-3 !bg-green-500 !border-2 !border-white" />
    </div>
    <div className="absolute -bottom-3 right-1/4 translate-x-1/2 flex flex-col items-center">
       <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1 rounded mb-1">NO</span>
       <Handle type="source" id="false" position={Position.Bottom} className="!relative !left-0 !transform-none !w-3 !h-3 !bg-red-500 !border-2 !border-white" />
    </div>
  </div>
);

const WaitNode = ({ data, selected }: NodeProps<FlowNodeData>) => (
  <div className={`relative group min-w-[160px] ${selected ? 'ring-2 ring-indigo-500 ring-offset-2 rounded-full' : ''}`}>
    <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white" />
    
    <div className="bg-slate-100 border border-slate-300 rounded-full px-4 py-2 flex items-center justify-center gap-2 shadow-sm">
       <Clock className="w-4 h-4 text-slate-500" />
       <span className="text-sm font-medium text-slate-700">{data.label}</span>
    </div>

    <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
  </div>
);

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  wait: WaitNode,
  default: ActionNode, // Fallback
};

// --- MAIN BUILDER COMPONENT ---

export const WorkflowBuilder: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Simulation State
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStep, setSimStep] = useState(0);

  // Load from API
  useEffect(() => {
    const loadFlow = async () => {
        setLoading(true);
        const flow = await api.getWorkflow();
        // Transform loaded nodes to use correct types if needed
        const formattedNodes = flow.nodes.map((n: any) => ({
           ...n,
           type: n.data.type || 'default' // Ensure type matches nodeTypes keys
        }));
        setNodes(formattedNodes);
        setEdges(flow.edges);
        setLoading(false);
    };
    loadFlow();
  }, [setNodes, setEdges]);

  // Save to API
  const handleSave = async () => {
     setSaving(true);
     try {
        await api.saveWorkflow(nodes, edges);
        // alert('Workflow saved!'); // Removed alert for cleaner UX
     } catch (e) {
        alert('Failed to save');
     } finally {
        setTimeout(() => setSaving(false), 500);
     }
  };

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({ 
    ...params, 
    type: 'smoothstep',
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 2, stroke: '#94a3b8' }
  }, eds)), [setEdges]);

  // Drag & Drop Handlers
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const typeData = event.dataTransfer.getData('application/reactflow');
      if (!typeData) return;
      
      const config = JSON.parse(typeData);
      const position = { x: event.clientX - 320, y: event.clientY - 100 }; // Adjust for sidebar offset
      
      const newNode: Node = {
        id: `${Date.now()}`,
        type: config.category, // Matches nodeTypes keys
        position,
        data: { label: config.label, type: config.category, icon: config.icon },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes]
  );

  const onDragStart = (event: React.DragEvent, nodeConfig: any) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(nodeConfig));
    event.dataTransfer.effectAllowed = 'move';
  };

  // Simulation Logic
  const runSimulation = async () => {
     if (isSimulating) return;
     setIsSimulating(true);
     setSimStep(0);
     
     // Reset Styles
     setEdges(eds => eds.map(e => ({ ...e, animated: false, style: { ...e.style, stroke: '#94a3b8' } })));
     
     // Simple BFS/Sequence Simulation
     // Find Start Node
     const startNode = nodes.find(n => n.type === 'trigger');
     if (!startNode) {
        alert("No Trigger Node found to start simulation.");
        setIsSimulating(false);
        return;
     }

     // Helper to delay
     const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

     let currentNodeId = startNode.id;
     let safety = 0;

     while(currentNodeId && safety < 20) {
        safety++;
        // Highlight Node
        setNodes(nds => nds.map(n => n.id === currentNodeId ? { ...n, selected: true } : { ...n, selected: false }));
        await wait(800);

        // Find outgoing edge
        const outEdges = edges.filter(e => e.source === currentNodeId);
        if (outEdges.length === 0) break;

        // For simulation, just take the first path (or 'true' path for conditions)
        let nextEdge = outEdges.find(e => e.sourceHandle === 'true') || outEdges[0];
        
        if (nextEdge) {
           // Animate Edge
           setEdges(eds => eds.map(e => e.id === nextEdge.id ? { ...e, animated: true, style: { ...e.style, stroke: '#6366f1', strokeWidth: 3 } } : e));
           await wait(800);
           currentNodeId = nextEdge.target;
        } else {
           break;
        }
     }

     setNodes(nds => nds.map(n => ({ ...n, selected: false })));
     setIsSimulating(false);
  };

  const tools = [
     { label: 'Start Trigger', category: 'trigger', icon: 'zap' },
     { label: 'Update Field', category: 'action', icon: 'file-text' },
     { label: 'Send Email', category: 'action', icon: 'mail' },
     { label: 'Create Task', category: 'action', icon: 'user-plus' },
     { label: 'Wait/Delay', category: 'wait', icon: 'clock' },
     { label: 'Check Condition', category: 'condition', icon: 'git-branch' },
  ];

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600"/></div>;

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar Tool Palette */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col z-20 shadow-xl">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2 mb-1">
             <div className="bg-indigo-600 p-1.5 rounded-lg">
                <GitBranch className="w-5 h-5 text-white" />
             </div>
             <h2 className="text-lg font-bold text-gray-900">Journey Builder</h2>
          </div>
          <p className="text-xs text-gray-500 ml-9">Automate your business processes.</p>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto flex-1">
          <div>
             <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Triggers</div>
             <div 
               className="p-3 bg-slate-900 text-white rounded-lg cursor-grab active:cursor-grabbing hover:shadow-lg hover:scale-[1.02] transition-all flex items-center gap-3"
               onDragStart={(event) => onDragStart(event, tools[0])} 
               draggable
             >
                <Zap className="w-5 h-5 text-indigo-400"/>
                <span className="font-semibold text-sm">Start Trigger</span>
             </div>
          </div>

          <div>
             <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Logic</div>
             <div className="space-y-2">
                {tools.slice(4).map((tool) => (
                   <div 
                     key={tool.label}
                     className="p-3 border border-gray-200 bg-white rounded-lg cursor-grab active:cursor-grabbing hover:border-indigo-500 hover:shadow-md transition-all flex items-center gap-3"
                     onDragStart={(event) => onDragStart(event, tool)} 
                     draggable
                   >
                      <div className={`p-1.5 rounded ${tool.icon === 'clock' ? 'bg-orange-100 text-orange-600' : 'bg-amber-100 text-amber-600'}`}>
                         {tool.icon === 'clock' && <Clock className="w-4 h-4"/>}
                         {tool.icon === 'git-branch' && <GitBranch className="w-4 h-4"/>}
                      </div>
                      <span className="font-medium text-gray-700 text-sm">{tool.label}</span>
                   </div>
                ))}
             </div>
          </div>

          <div>
             <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Actions</div>
             <div className="space-y-2">
                {tools.slice(1, 4).map((tool) => (
                   <div 
                     key={tool.label}
                     className="p-3 border border-gray-200 bg-white rounded-lg cursor-grab active:cursor-grabbing hover:border-indigo-500 hover:shadow-md transition-all flex items-center gap-3"
                     onDragStart={(event) => onDragStart(event, tool)} 
                     draggable
                   >
                      <div className={`p-1.5 rounded ${tool.icon === 'mail' ? 'bg-blue-100 text-blue-600' : tool.icon === 'user-plus' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                         {tool.icon === 'mail' && <Mail className="w-4 h-4"/>}
                         {tool.icon === 'user-plus' && <UserPlus className="w-4 h-4"/>}
                         {tool.icon === 'file-text' && <FileText className="w-4 h-4"/>}
                      </div>
                      <span className="font-medium text-gray-700 text-sm">{tool.label}</span>
                   </div>
                ))}
             </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 space-y-3">
           <Button 
              className="w-full justify-center" 
              icon={saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Workflow'}
            </Button>
           <Button 
              variant="secondary" 
              className="w-full justify-center" 
              icon={isSimulating ? <Loader2 className="w-4 h-4 animate-spin"/> : <Play className="w-4 h-4"/>}
              onClick={runSimulation}
              disabled={isSimulating}
           >
              {isSimulating ? 'Simulating...' : 'Run Test'}
           </Button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 h-full relative bg-slate-50">
         <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={(_e, node) => setSelectedNode(node)}
              onPaneClick={() => setSelectedNode(null)}
              nodeTypes={nodeTypes}
              fitView
              snapToGrid
              snapGrid={[15, 15]}
              defaultEdgeOptions={{ type: 'smoothstep', animated: false, style: { strokeWidth: 2, stroke: '#94a3b8' } }}
            >
              <Background color="#cbd5e1" gap={20} size={1} />
              <Controls className="bg-white border border-gray-200 shadow-md rounded-lg overflow-hidden m-4" showInteractive={false} />
              <MiniMap 
                 className="!bg-white !border !border-gray-200 !shadow-md !rounded-lg !overflow-hidden !m-4" 
                 nodeColor={(n) => {
                    if (n.type === 'trigger') return '#4f46e5';
                    if (n.type === 'condition') return '#d97706';
                    return '#e2e8f0';
                 }}
              />
            </ReactFlow>
         </ReactFlowProvider>
      </div>

      {/* Sliding Configuration Panel */}
      <div className={`fixed right-0 top-0 h-full w-80 bg-white shadow-2xl border-l border-gray-200 transform transition-transform duration-300 ease-in-out z-30 ${selectedNode ? 'translate-x-0' : 'translate-x-full'}`}>
         {selectedNode && (
           <div className="flex flex-col h-full">
             {/* Panel Header */}
             <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div>
                   <h3 className="font-bold text-gray-900">Configure Step</h3>
                   <p className="text-xs text-gray-500 uppercase font-medium">{selectedNode.data.type}</p>
                </div>
                <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full transition-colors">
                   <X className="w-5 h-5"/>
                </button>
             </div>
             
             {/* Panel Content */}
             <div className="p-6 space-y-6 flex-1 overflow-y-auto">
               <div>
                 <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Step Label</label>
                 <input 
                   type="text" 
                   value={selectedNode.data.label} 
                   onChange={(e) => {
                     setNodes((nds) => nds.map((n) => {
                       if (n.id === selectedNode.id) {
                         n.data = { ...n.data, label: e.target.value };
                       }
                       return n;
                     }));
                   }}
                   className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                 />
               </div>
               
               {/* Contextual Config */}
               {selectedNode.type === 'trigger' && (
                  <div className="space-y-4">
                     <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Trigger Entity</label>
                        <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none">
                           <option>Lead</option>
                           <option>Customer</option>
                           <option>Case</option>
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Event</label>
                        <div className="space-y-2">
                           {['Created', 'Updated', 'Deleted'].map(evt => (
                              <label key={evt} className="flex items-center gap-2 text-sm text-gray-700">
                                 <input type="radio" name="evt" defaultChecked={evt === 'Created'} className="text-indigo-600 focus:ring-indigo-500" />
                                 {evt}
                              </label>
                           ))}
                        </div>
                     </div>
                  </div>
               )}

               {selectedNode.type === 'action' && (
                 <div className="space-y-4">
                    <div>
                       <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Action Type</label>
                       <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none">
                         <option>Send Email</option>
                         <option>Create Task</option>
                         <option>Update Field</option>
                         <option>Webhook</option>
                       </select>
                    </div>
                    {/* Dynamic based on selection */}
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                       <AlertCircle className="w-4 h-4 inline mr-1 mb-0.5"/>
                       Configure the specific template or field values in the settings tab.
                    </div>
                 </div>
               )}
               
               {selectedNode.type === 'condition' && (
                 <div className="space-y-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Condition Logic</label>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg font-mono text-xs text-gray-600">
                       (Lead.Score &gt; 50) AND (Lead.Status == 'New')
                    </div>
                    <Button variant="secondary" size="sm" className="w-full">Edit Logic Expression</Button>
                 </div>
               )}

               {selectedNode.type === 'wait' && (
                  <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Duration</label>
                     <div className="flex gap-2">
                        <input type="number" className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" defaultValue={2} />
                        <select className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none">
                           <option>Minutes</option>
                           <option>Hours</option>
                           <option>Days</option>
                        </select>
                     </div>
                  </div>
               )}
             </div>

             {/* Panel Footer */}
             <div className="p-6 border-t border-gray-100 bg-gray-50">
                <Button 
                  variant="danger" 
                  className="w-full justify-center" 
                  icon={<Trash2 className="w-4 h-4"/>}
                  onClick={() => {
                    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                    setSelectedNode(null);
                  }}
                >
                  Delete Step
                </Button>
             </div>
           </div>
         )}
      </div>
    </div>
  );
};
