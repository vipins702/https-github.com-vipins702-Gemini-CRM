
import { GateBuilder, emptyGate, toGate } from '../components/GateBuilder';
import { FieldMapper, toRows, toObject } from '../components/FieldMapper';
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
import { Play, Save, Trash2, Zap, GitBranch, Mail, Clock, UserPlus, FileText, Loader2, CheckCircle, X, Settings, MousePointerClick, AlertCircle, Bell, UserCheck, Globe, MessageCircle, ArrowLeft, History } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { FlowNodeData, JourneyRun, JourneyStep, User } from '../types';
import { api } from '../services/api';

// --- CUSTOM NODE COMPONENTS ---

/** One line under a step's name saying what it does, read from its settings. */
const stepSummary = (data: FlowNodeData): string => {
  const c: any = data.config || {};
  switch (data.type) {
    case 'trigger': {
      const when: Record<string, string> = { create: 'is created', update: 'is updated', delete: 'is deleted', status_change: `status changes${c.to ? ` to ${c.to}` : ''}`, field_change: `${c.field || 'a field'} changes`, date_arrives: `${Math.abs(c.offsetDays || 0)} day(s) ${(c.offsetDays || 0) < 0 ? 'before' : 'after'} ${c.field || 'a date'}`, inactive: `${c.days || '?'} days without activity` };
      return c.entityType ? `When a ${c.entityType} ${when[c.triggerType || 'create'] || ''}` : 'Choose a record type';
    }
    case 'wait': return c.amount ? `${c.amount} ${c.unit || 'days'}` : 'Set how long';
    case 'action':
      switch (c.type) {
        case 'email': return c.subject ? `“${c.subject}”` : 'Write the e-mail';
        case 'whatsapp': return c.body ? `“${String(c.body).slice(0, 40)}”` : 'Write the message';
        case 'create_task': return c.subject ? `“${c.subject}”${c.dueInDays ? `, due in ${c.dueInDays} day(s)` : ''}` : 'Name the task';
        case 'update_record': { const k = Object.keys(c.fields || {}).filter(Boolean); return k.length ? `Sets ${k.slice(0, 3).join(', ')}${k.length > 3 ? '…' : ''}` : 'Choose fields to set'; }
        case 'create_lead': return 'New lead';
        case 'create_record': return c.entityType ? `New ${c.entityType}` : 'Choose a record type';
        case 'notify': return c.message ? `“${String(c.message).slice(0, 40)}”` : 'Write the notification';
        case 'assign_owner': return c.mode === 'rules' ? 'By assignment rules' : c.userId ? 'To a chosen person' : 'Choose who';
        case 'webhook': return c.url ? String(c.url).replace(/^https?:\/\//, '').slice(0, 36) : 'Enter the address';
        default: return 'Choose what this step does';
      }
    default: return '';
  }
};


const TriggerNode = ({ data, selected }: NodeProps<FlowNodeData>) => (
  <div className={`relative group min-w-[230px] max-w-[280px] transition-transform duration-200 ${selected ? 'scale-[1.03]' : ''}`}>
    <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 border bg-[#0d2b3e] ${selected ? 'border-[#f4a621] ring-2 ring-[#f4a621]/40' : 'border-white/10'} shadow-[0_6px_18px_-8px_rgba(13,43,62,0.6)]`}>
       <div className="p-2 rounded-xl bg-[#f4a621] text-[#0d2b3e] shrink-0"><Zap className="w-4 h-4" fill="currentColor" /></div>
       <div className="min-w-0">
          <div className="text-white font-semibold text-sm leading-tight truncate">{data.label}</div>
          <div className="text-[11px] text-white/70 leading-snug truncate">{stepSummary(data)}</div>
       </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-[#f4a621] !border-2 !border-white" />
  </div>
);

const ActionNode = ({ data, selected }: NodeProps<FlowNodeData>) => (
  <div className={`relative group min-w-[220px] transition-all duration-200 ${selected ? 'ring-2 ring-indigo-500 ring-offset-2 rounded-xl' : ''}`}>
    <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white" />
    
    <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
       <div className="h-1 bg-accent w-full"></div>
       <div className="p-4 flex items-start gap-3">
          <div className={`p-2 rounded-lg shrink-0 ${
             data.icon === 'mail' ? 'bg-blue-50 text-blue-600' : data.icon === 'user-plus' || data.icon === 'user-check' ? 'bg-green-50 text-green-600' : data.icon === 'bell' ? 'bg-amber-50 text-amber-600' : data.icon === 'message-circle' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-600'
          }`}>
             {data.icon === 'mail' && <Mail className="w-5 h-5"/>}
             {data.icon === 'user-plus' && <UserPlus className="w-5 h-5"/>}
             {data.icon === 'file-text' && <FileText className="w-5 h-5"/>}
             {data.icon === 'bell' && <Bell className="w-5 h-5"/>}
             {data.icon === 'user-check' && <UserCheck className="w-5 h-5"/>}
             {data.icon === 'globe' && <Globe className="w-5 h-5"/>}
             {data.icon === 'message-circle' && <MessageCircle className="w-5 h-5"/>}
             {!['mail', 'user-plus', 'file-text', 'bell', 'user-check', 'globe', 'message-circle'].includes(data.icon || '') && <Settings className="w-5 h-5"/>}
          </div>
          <div className="min-w-0">
             <div className="font-semibold text-slate-900 text-sm leading-tight truncate">{data.label}</div>
             <div className="text-[11px] text-slate-500 leading-snug mt-0.5 truncate max-w-[190px]">{stepSummary(data)}</div>
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
      bg-amber-50 border-2 border-amber-200 rounded-xl px-4 pt-3 pb-6 shadow-sm text-center
      ${selected ? 'ring-2 ring-amber-400' : ''}
    `}>
       <div className="flex flex-col items-center justify-center gap-1">
          <GitBranch className="w-5 h-5 text-amber-600" />
          <span className="font-bold text-amber-900 text-sm">{data.label}</span>
          {!(data.config as any)?.conditions?.children?.length && <span className="text-[11px] text-amber-700">Add the condition</span>}
       </div>
    </div>
    
    {/* Two source handles for True/False branches */}
    <div className="absolute -bottom-3 left-1/4 -translate-x-1/2 flex flex-col items-center">
       <span className="text-xs font-bold text-green-600 bg-green-50 px-1 rounded mb-1">YES</span>
       <Handle type="source" id="true" position={Position.Bottom} className="!relative !left-0 !transform-none !w-3 !h-3 !bg-green-500 !border-2 !border-white" />
    </div>
    <div className="absolute -bottom-3 right-1/4 translate-x-1/2 flex flex-col items-center">
       <span className="text-xs font-bold text-red-600 bg-red-50 px-1 rounded mb-1">NO</span>
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
       <span className="text-xs text-slate-500">· {stepSummary(data)}</span>
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

// --- TEST RUN + RUN HISTORY PANELS ---

const STATUS_STYLE: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700', waiting: 'bg-amber-100 text-amber-700', done: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-600',
};
const RESULT_STYLE: Record<string, string> = {
  ok: 'text-green-600', YES: 'text-green-600', NO: 'text-red-600', waiting: 'text-amber-600', 'would wait': 'text-amber-600',
  'would run': 'text-indigo-600', failed: 'text-red-600', blocked: 'text-red-600', cancelled: 'text-gray-500',
};

export const StepList: React.FC<{ steps: JourneyStep[] }> = ({ steps }) => (
  <ol className="space-y-1.5">
    {steps.map((st, i) => (
      <li key={i} className="flex gap-2 text-xs">
        <span className={`shrink-0 w-16 font-semibold ${RESULT_STYLE[st.result] || 'text-gray-500'}`}>{st.result}</span>
        <span className="min-w-0"><span className="font-medium text-gray-800">{st.label}</span>{st.note && <span className="text-gray-500"> · {st.note}</span>}</span>
      </li>
    ))}
  </ol>
);

const JourneySidePanel: React.FC<{ mode: 'test' | 'runs'; journeyId: string; entityType?: string; onClose: () => void }> = ({ mode, journeyId, entityType, onClose }) => {
  const [records, setRecords] = useState<any[]>([]);
  const [recordId, setRecordId] = useState('');
  const [result, setResult] = useState<{ startsHere: boolean; steps: JourneyStep[] } | null>(null);
  const [runs, setRuns] = useState<JourneyRun[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadRuns = () => api.getJourneyRuns(journeyId).then(setRuns).catch((e) => setErr(e.message));
  useEffect(() => {
    if (mode === 'test' && entityType) api.getRecords(entityType).then(r => setRecords((r || []).slice(0, 200))).catch(() => setRecords([]));
    if (mode === 'runs') loadRuns();
  }, [mode, journeyId]);

  const nameOf = (r: any) => r.name || [r.firstName, r.lastName].filter(Boolean).join(' ') || r.subject || r.email || r.id;
  const runTest = async () => {
    setBusy(true); setErr(''); setResult(null);
    try { setResult(await api.testJourney(journeyId, recordId)); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed right-0 top-0 h-full w-96 max-w-full bg-surface shadow-2xl border-l border-gray-200 z-40 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-900">{mode === 'test' ? 'Test on a record' : 'Runs'}</h3>
          <p className="text-xs text-gray-500">{mode === 'test' ? 'Shows what would happen. Nothing is sent or changed.' : 'Every time this journey started on a record.'}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full text-gray-400 hover:bg-gray-200"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-5 space-y-4 overflow-y-auto flex-1">
        {err && <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</p>}
        {mode === 'test' && (
          <>
            {!entityType ? <p className="text-xs text-gray-500">Choose the record type on the Start Trigger and save first.</p> : (
              <div className="flex gap-2">
                <select className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2.5 py-2 text-sm bg-surface" value={recordId} onChange={(e) => { setRecordId(e.target.value); setResult(null); }}>
                  <option value="">Pick a record…</option>
                  {records.map((r) => <option key={r.id} value={r.id}>{nameOf(r)}</option>)}
                </select>
                <Button onClick={runTest} disabled={!recordId || busy} icon={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}>Test</Button>
              </div>
            )}
            {result && (
              <div className="space-y-3">
                {!result.startsHere && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">This record does not match the start conditions, so the journey would not start.</p>}
                <StepList steps={result.steps} />
              </div>
            )}
          </>
        )}
        {mode === 'runs' && (runs === null ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : runs.length === 0 ? (
          <p className="text-sm text-gray-500">No runs yet. When a record triggers this journey it appears here.</p>
        ) : runs.map((r) => (
          <div key={r.id} className="border border-gray-200 rounded-lg">
            <button className="w-full text-left px-3 py-2.5 flex items-center gap-2" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900">{r.recordName || r.recordId}</span>
              <span className="text-[11px] text-gray-400">{r.createdAt ? new Date(r.createdAt.includes('T') ? r.createdAt : r.createdAt + 'Z').toLocaleDateString() : ''}</span>
            </button>
            {open === r.id && (
              <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2.5">
                {r.status === 'waiting' && r.dueAt && <p className="text-xs text-amber-700">Continues {new Date(r.dueAt).toLocaleString()}</p>}
                {r.error && <p className="text-xs text-red-700">{r.error}</p>}
                <StepList steps={r.steps} />
                {(r.status === 'waiting' || r.status === 'running') && <button className="text-xs font-semibold text-red-600 hover:underline" onClick={async () => { await api.cancelJourneyRun(r.id).catch(() => {}); loadRuns(); }}>Cancel this run</button>}
              </div>
            )}
          </div>
        )))}
      </div>
    </div>
  );
};

// --- MAIN BUILDER COMPONENT ---

export const WorkflowBuilder: React.FC<{ journeyId?: string | null; onBack?: () => void }> = ({ journeyId: initialId = null, onBack }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [schemas, setSchemas] = useState<Record<string, any>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [journeyId, setJourneyId] = useState<string | null>(initialId);
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [problems, setProblems] = useState<string[]>([]);
  const [savedNote, setSavedNote] = useState('');
  const [panel, setPanel] = useState<null | 'test' | 'runs'>(null);
  const [lookupOpts, setLookupOpts] = useState<Record<string, { value: string; label: string }[]>>({});

  // Load the journey (or a blank one with its Start Trigger)
  useEffect(() => {
    const load = async () => {
        setLoading(true);
        const [journey, loadedSchemas, people] = await Promise.all([
          initialId ? api.getJourney(initialId) : Promise.resolve(null),
          api.getSchemas().catch(() => ({})),
          api.getUsers().catch(() => [] as User[]),
        ]);
        const startNodes = journey ? journey.nodes : [{ id: 'trigger', type: 'trigger', position: { x: 250, y: 40 }, data: { label: 'Start Trigger', type: 'trigger', icon: 'zap', config: { entityType: 'lead', triggerType: 'create' } } }];
        setNodes(startNodes.map((n: any) => ({ ...n, type: n.type || n.data?.type || 'default' })));
        setEdges(journey ? journey.edges : []);
        setName(journey?.name || '');
        setIsActive(journey ? journey.isActive : true);
        setSchemas(loadedSchemas || {});
        setUsers(people || []);
        setLoading(false);
    };
    load();
  }, [initialId, setNodes, setEdges]);

  const handleSave = async () => {
     setSaving(true); setProblems([]); setSavedNote('');
     try {
        const saved = await api.saveJourney({ id: journeyId || undefined, name: name.trim(), nodes, edges, isActive });
        setJourneyId(saved.id);
        if (!name.trim()) setName(saved.name);
        setSavedNote('Saved');
        setTimeout(() => setSavedNote(''), 2500);
     } catch (e: any) {
        const msg = String(e?.message || 'Could not save');
        const [head, rest] = msg.split(' Details: ');
        setProblems(rest ? rest.split(',').map(x => x.trim()).filter(Boolean) : [head]);
     } finally {
        setSaving(false);
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
        data: {
          label: config.label, type: config.category, icon: config.icon,
          ...(config.actionType ? { config: { type: config.actionType, ...(config.actionType === 'email' ? { to: '{email}' } : config.actionType === 'whatsapp' ? { to: '{phone}' } : {}) } } : {}),
          ...(config.category === 'wait' ? { config: { amount: 1, unit: 'days' } } : {}),
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes]
  );

  const onDragStart = (event: React.DragEvent, nodeConfig: any) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(nodeConfig));
    event.dataTransfer.effectAllowed = 'move';
  };

  const tools = [
     { label: 'Start Trigger', category: 'trigger', icon: 'zap' },
     { label: 'Update Field', category: 'action', icon: 'file-text', actionType: 'update_record' },
     { label: 'Send Email', category: 'action', icon: 'mail', actionType: 'email' },
     { label: 'Send WhatsApp', category: 'action', icon: 'message-circle', actionType: 'whatsapp' },
     { label: 'Create Task', category: 'action', icon: 'user-plus', actionType: 'create_task' },
     { label: 'Notify a User', category: 'action', icon: 'bell', actionType: 'notify' },
     { label: 'Assign Owner', category: 'action', icon: 'user-check', actionType: 'assign_owner' },
     { label: 'Call Webhook', category: 'action', icon: 'globe', actionType: 'webhook' },
     { label: 'Wait / Delay', category: 'wait', icon: 'clock' },
     { label: 'If / Else', category: 'condition', icon: 'git-branch' },
  ];

  // --- Node config wiring ---
  const selected = selectedNode ? (nodes.find((n) => n.id === selectedNode.id) || selectedNode) : null;
  const cfg = (selected?.data?.config || {}) as any;

  const updateNodeData = (patch: any) => {
    if (!selectedNode) return;
    setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...patch } } : n)));
  };
  const updateNodeConfig = (patch: any) => {
    if (!selectedNode) return;
    setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, config: { ...(n.data.config || {}), ...patch } } } : n)));
  };

  const fieldsToText = (fields: Record<string, any> = {}) =>
    Object.entries(fields).map(([k, v]) => `${k} = ${v}`).join('\n');
  const textToFields = (text: string) => {
    const o: Record<string, string> = {};
    text.split('\n').forEach((line) => {
      const i = line.indexOf('=');
      if (i > 0) {
        const k = line.slice(0, i).trim();
        const v = line.slice(i + 1).trim();
        if (k) o[k] = v;
      }
    });
    return o;
  };

  const ACTION_TYPES = [
    { value: 'email', label: 'Send Email' },
    { value: 'whatsapp', label: 'Send WhatsApp' },
    { value: 'create_task', label: 'Create Task' },
    { value: 'update_record', label: 'Update Record' },
    { value: 'create_lead', label: 'Create Lead' },
    { value: 'create_record', label: 'Create Any Record' },
    { value: 'notify', label: 'Notify a User' },
    { value: 'assign_owner', label: 'Assign Owner' },
    { value: 'webhook', label: 'Call Webhook' },
  ];
  const OPERATORS = ['==', '!=', '>', '<', '>=', '<=', 'contains', 'not_contains', 'is_empty', 'is_not_empty'];

  const entityOptions = Object.values(schemas) as any[];
  // The trigger step decides which record type every condition in the journey is about.
  const triggerCfg = ((nodes.find((n) => n.type === 'trigger')?.data?.config) || {}) as any;
  const triggerEntity = triggerCfg.entityType as string | undefined;
  useEffect(() => { if (triggerEntity) api.getLookupOptions(triggerEntity).then(setLookupOpts).catch(() => setLookupOpts({})); }, [triggerEntity]);
  const triggerEntityFields = (schemas[selected?.type === 'trigger' ? cfg.entityType : triggerCfg.entityType]?.fields || []) as any[];
  const gateFields = [{ name: 'status', label: 'Status' }, ...triggerEntityFields.filter((f: any) => f.name !== 'status')].map((f: any) => ({ name: f.name, label: f.label, options: lookupOpts[f.name]?.length ? lookupOpts[f.name] : f.options }));
  const gateOperators = OPERATORS.map(o => ({ v: o, label: ({ '==': 'is', '!=': 'is not', '>': 'greater than', '<': 'less than', '>=': 'at least', '<=': 'at most', contains: 'contains', not_contains: 'does not contain', is_empty: 'is empty', is_not_empty: 'has a value' } as Record<string, string>)[o] || o, needsValue: !['is_empty', 'is_not_empty'].includes(o) }));

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-surface outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600"/></div>;

  return (
    <div className="flex h-[calc(100dvh-4rem)] overflow-hidden bg-surface">
      {/* Sidebar Tool Palette */}
      <div className="w-72 bg-surface border-r border-gray-200 flex flex-col z-20 shadow-xl">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50 space-y-3">
          <div className="flex items-center gap-2">
             {onBack && <button onClick={onBack} aria-label="Back to all journeys" className="p-1.5 -ml-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><ArrowLeft className="w-4 h-4" /></button>}
             <div className="bg-indigo-600 p-1.5 rounded-lg"><GitBranch className="w-4 h-4 text-white" /></div>
             <h2 className="text-base font-bold text-gray-900">Journey</h2>
          </div>
          <input
             value={name}
             onChange={(e) => setName(e.target.value)}
             placeholder="Name, e.g. New lead follow-up"
             maxLength={120}
             aria-label="Journey name"
             className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-surface font-medium outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <label className="flex items-center justify-between text-xs text-gray-600 cursor-pointer">
             <span>{isActive ? 'On: runs automatically' : 'Off: paused'}</span>
             <button type="button" role="switch" aria-checked={isActive} onClick={() => setIsActive(!isActive)} className={`relative w-9 h-5 rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isActive ? 'translate-x-4' : ''}`} />
             </button>
          </label>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto flex-1">
          <div>
             <div className="text-xs font-bold text-gray-400 mb-3 px-1">Triggers</div>
             <div 
               className="p-3 bg-gray-900 text-surface rounded-lg cursor-grab active:cursor-grabbing hover:shadow-lg hover:scale-[1.02] transition-all flex items-center gap-3"
               onDragStart={(event) => onDragStart(event, tools[0])} 
               draggable
             >
                <Zap className="w-5 h-5 text-indigo-400"/>
                <span className="font-semibold text-sm">Start Trigger</span>
             </div>
          </div>

          <div>
             <div className="text-xs font-bold text-gray-400 mb-3 px-1">Logic</div>
             <div className="space-y-2">
                {tools.filter(t => t.category === 'wait' || t.category === 'condition').map((tool) => (
                   <div 
                     key={tool.label}
                     className="p-3 border border-gray-200 bg-surface rounded-lg cursor-grab active:cursor-grabbing hover:border-indigo-500 hover:shadow-md transition-all flex items-center gap-3"
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
             <div className="text-xs font-bold text-gray-400 mb-3 px-1">Actions</div>
             <div className="space-y-2">
                {tools.filter(t => t.category === 'action').map((tool) => (
                   <div 
                     key={tool.label}
                     className="p-3 border border-gray-200 bg-surface rounded-lg cursor-grab active:cursor-grabbing hover:border-indigo-500 hover:shadow-md transition-all flex items-center gap-3"
                     onDragStart={(event) => onDragStart(event, tool)} 
                     draggable
                   >
                      <div className={`p-1.5 rounded ${tool.icon === 'mail' ? 'bg-blue-100 text-blue-600' : tool.icon === 'user-plus' || tool.icon === 'user-check' ? 'bg-green-100 text-green-600' : tool.icon === 'bell' ? 'bg-amber-100 text-amber-600' : tool.icon === 'message-circle' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-600'}`}>
                         {tool.icon === 'mail' && <Mail className="w-4 h-4"/>}
                         {tool.icon === 'user-plus' && <UserPlus className="w-4 h-4"/>}
                         {tool.icon === 'file-text' && <FileText className="w-4 h-4"/>}
                         {tool.icon === 'bell' && <Bell className="w-4 h-4"/>}
                         {tool.icon === 'user-check' && <UserCheck className="w-4 h-4"/>}
                         {tool.icon === 'globe' && <Globe className="w-4 h-4"/>}
                         {tool.icon === 'message-circle' && <MessageCircle className="w-4 h-4"/>}
                      </div>
                      <span className="font-medium text-gray-700 text-sm">{tool.label}</span>
                   </div>
                ))}
             </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 space-y-2.5">
           {problems.length > 0 && (
              <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 space-y-1 max-h-40 overflow-y-auto">
                 <p className="font-semibold">Fix this before saving:</p>
                 <ul className="list-disc pl-4 space-y-0.5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
           )}
           <Button
              className="w-full justify-center"
              icon={saving ? <Loader2 className="w-4 h-4 animate-spin"/> : savedNote ? <CheckCircle className="w-4 h-4"/> : <Save className="w-4 h-4"/>}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : savedNote || 'Save Journey'}
            </Button>
           <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" className="justify-center" icon={<Play className="w-4 h-4"/>} disabled={!journeyId} onClick={() => setPanel('test')} title={journeyId ? 'See what this journey would do for one record' : 'Save the journey first'}>Test</Button>
              <Button variant="secondary" className="justify-center" icon={<History className="w-4 h-4"/>} disabled={!journeyId} onClick={() => setPanel('runs')} title={journeyId ? 'Every time this journey ran' : 'Save the journey first'}>Runs</Button>
           </div>
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
              <Controls className="bg-surface border border-gray-200 shadow-md rounded-lg overflow-hidden m-4" showInteractive={false} />
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
      <div className={`fixed right-0 top-0 h-full w-80 bg-surface shadow-2xl border-l border-gray-200 transform transition-transform duration-300 ease-in-out z-30 ${selectedNode ? 'translate-x-0' : 'translate-x-full'}`}>
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
                 <label className="block text-xs font-bold text-gray-500 mb-2">Step Label</label>
                 <input
                   type="text"
                   value={selected?.data?.label || ''}
                   onChange={(e) => updateNodeData({ label: e.target.value })}
                   className={inputCls}
                 />
               </div>
               
               {/* Contextual Config */}
               {selectedNode.type === 'trigger' && (
                  <div className="space-y-4">
                     <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2">Record type</label>
                        <select className={inputCls} value={cfg.entityType || ''} onChange={(e) => updateNodeConfig({ entityType: e.target.value, field: undefined, to: undefined, conditions: emptyGate(), exitConditions: undefined })}>
                           <option value="">Select a record type…</option>
                           {entityOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2">Starts when</label>
                        <select className={inputCls} value={cfg.triggerType || 'create'} onChange={(e) => updateNodeConfig({ triggerType: e.target.value })}>
                           <option value="create">A record is created</option>
                           <option value="update">A record is updated</option>
                           <option value="delete">A record is deleted</option>
                           <option value="status_change">The status changes</option>
                           <option value="field_change">A field changes</option>
                           <option value="date_arrives">A date arrives</option>
                           <option value="inactive">A record has had no activity</option>
                        </select>
                        {cfg.triggerType === 'status_change' && (
                           <select className={`${inputCls} mt-2`} value={cfg.to || ''} onChange={(e) => updateNodeConfig({ to: e.target.value || undefined })}>
                              <option value="">to any status</option>
                              {(triggerEntityFields.find((f: any) => f.type === 'status')?.options || []).map((o: string) => <option key={o} value={o}>to {o}</option>)}
                           </select>
                        )}
                        {cfg.triggerType === 'field_change' && (
                           <div className="mt-2 grid grid-cols-2 gap-2">
                              <select className={inputCls} value={cfg.field || ''} onChange={(e) => updateNodeConfig({ field: e.target.value })}>
                                 <option value="">Field…</option>
                                 {triggerEntityFields.map((f: any) => <option key={f.name} value={f.name}>{f.label}</option>)}
                              </select>
                              <input className={inputCls} value={cfg.to || ''} placeholder="to (any)" onChange={(e) => updateNodeConfig({ to: e.target.value || undefined })} />
                           </div>
                        )}
                        {cfg.triggerType === 'date_arrives' && (
                           <div className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                              <input type="number" min={0} className={inputCls} value={Math.abs(cfg.offsetDays ?? 0)} onChange={(e) => { const n = Math.max(0, Number(e.target.value) || 0); updateNodeConfig({ offsetDays: (cfg.offsetDays ?? 0) < 0 ? -n : n }); }} />
                              <select className={inputCls} value={(cfg.offsetDays ?? 0) < 0 ? 'before' : 'after'} onChange={(e) => { const n = Math.abs(cfg.offsetDays ?? 0); updateNodeConfig({ offsetDays: e.target.value === 'before' ? -n : n }); }}>
                                 <option value="before">days before</option>
                                 <option value="after">days after (0 = on the day)</option>
                              </select>
                              <select className={`${inputCls} col-span-2`} value={cfg.field || ''} onChange={(e) => updateNodeConfig({ field: e.target.value, offsetDays: cfg.offsetDays ?? 0 })}>
                                 <option value="">the date in…</option>
                                 {triggerEntityFields.filter((f: any) => ['date', 'datetime'].includes(f.type)).map((f: any) => <option key={f.name} value={f.name}>{f.label}</option>)}
                              </select>
                           </div>
                        )}
                        {cfg.triggerType === 'inactive' && (
                           <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                              <input type="number" min={1} className={`${inputCls} w-20`} value={cfg.days ?? ''} onChange={(e) => updateNodeConfig({ days: Number(e.target.value) || undefined })} placeholder="14" />
                              days without any change
                           </div>
                        )}
                     </div>

                     <div>
                        <label className="text-xs font-bold text-gray-500 block mb-2">Only when (optional)</label>
                        {!cfg.entityType ? (
                           <p className="text-xs text-gray-400">Choose a record type first.</p>
                        ) : (
                           <GateBuilder compact value={toGate(cfg.conditions).children.length ? toGate(cfg.conditions) : emptyGate(triggerEntityFields[0]?.name || '')} onChange={(g) => updateNodeConfig({ conditions: g })} fields={gateFields} operators={gateOperators} />
                        )}
                     </div>

                     {cfg.entityType && (
                        <div>
                           <label className="text-xs font-bold text-gray-500 block mb-1">Stop early when (optional)</label>
                           <p className="text-xs text-gray-400 mb-2">Checked when a wait ends: if true, the journey stops instead of continuing (for example once the status is Won).</p>
                           {toGate(cfg.exitConditions).children.length === 0 ? (
                              <button type="button" onClick={() => updateNodeConfig({ exitConditions: emptyGate(triggerEntityFields[0]?.name || '') })} className="text-xs font-semibold text-indigo-600 hover:underline">+ Add a stop condition</button>
                           ) : (
                              <>
                                 <GateBuilder compact value={toGate(cfg.exitConditions)} onChange={(g) => updateNodeConfig({ exitConditions: g })} fields={gateFields} operators={gateOperators} />
                                 <button type="button" onClick={() => updateNodeConfig({ exitConditions: undefined })} className="mt-2 text-xs text-red-600 hover:underline">Remove stop condition</button>
                              </>
                           )}
                        </div>
                     )}
                  </div>
               )}

               {selectedNode.type === 'action' && (
                 <div className="space-y-4">
                    <div>
                       <label className="block text-xs font-bold text-gray-500 mb-2">Action Type</label>
                       <select className={inputCls} value={cfg.type || ''} onChange={(e) => updateNodeConfig({ type: e.target.value })}>
                         <option value="">Select action…</option>
                         {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                       </select>
                    </div>

                    {cfg.type === 'email' && (
                       <>
                          <div>
                             <label className="block text-xs font-bold text-gray-500 mb-2">To</label>
                             <input className={inputCls} value={cfg.to ?? '{email}'} onChange={(e) => updateNodeConfig({ to: e.target.value })} placeholder="{email}" />
                          </div>
                          <div>
                             <label className="block text-xs font-bold text-gray-500 mb-2">Subject</label>
                             <input className={inputCls} value={cfg.subject ?? ''} onChange={(e) => updateNodeConfig({ subject: e.target.value })} placeholder="Welcome {firstName}" />
                          </div>
                          <div>
                             <label className="block text-xs font-bold text-gray-500 mb-2">Body</label>
                             <textarea className={inputCls} rows={4} value={cfg.body ?? ''} onChange={(e) => updateNodeConfig({ body: e.target.value })} placeholder="Hi {firstName}, …" />
                          </div>
                       </>
                    )}

                    {cfg.type === 'whatsapp' && (
                       <>
                          <div>
                             <label className="block text-xs font-bold text-gray-500 mb-2">To</label>
                             <input className={inputCls} value={cfg.to ?? '{phone}'} onChange={(e) => updateNodeConfig({ to: e.target.value })} placeholder="{phone}" />
                          </div>
                          <div>
                             <label className="block text-xs font-bold text-gray-500 mb-2">Message</label>
                             <textarea className={inputCls} rows={4} value={cfg.body ?? ''} onChange={(e) => updateNodeConfig({ body: e.target.value })} placeholder="Hi {firstName}, thanks for your interest…" />
                          </div>
                       </>
                    )}

                    {cfg.type === 'create_task' && (
                       <>
                          <div>
                             <label className="block text-xs font-bold text-gray-500 mb-2">Task Subject</label>
                             <input className={inputCls} value={cfg.subject ?? ''} onChange={(e) => updateNodeConfig({ subject: e.target.value })} placeholder="Follow up with {firstName}" />
                          </div>
                          <div>
                             <label className="block text-xs font-bold text-gray-500 mb-2">Due in (days)</label>
                             <input type="number" min={0} className={inputCls} value={cfg.dueInDays ?? ''} onChange={(e) => updateNodeConfig({ dueInDays: e.target.value })} placeholder="2" />
                          </div>
                       </>
                    )}

                    {cfg.type === 'notify' && (
                       <>
                          <div>
                             <label className="block text-xs font-bold text-gray-500 mb-2">Notify</label>
                             <select className={inputCls} value={cfg.userId || ''} onChange={(e) => updateNodeConfig({ userId: e.target.value || undefined })}>
                                <option value="">The record's owner</option>
                                {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                             </select>
                          </div>
                          <div>
                             <label className="block text-xs font-bold text-gray-500 mb-2">Title</label>
                             <input className={inputCls} value={cfg.title ?? ''} onChange={(e) => updateNodeConfig({ title: e.target.value })} placeholder="Follow-up due" />
                          </div>
                          <div>
                             <label className="block text-xs font-bold text-gray-500 mb-2">Message</label>
                             <textarea className={inputCls} rows={3} value={cfg.message ?? ''} onChange={(e) => updateNodeConfig({ message: e.target.value })} placeholder="Please call {firstName} today" />
                          </div>
                       </>
                    )}

                    {cfg.type === 'assign_owner' && (
                       <div>
                          <label className="block text-xs font-bold text-gray-500 mb-2">Assign to</label>
                          <select className={inputCls} value={cfg.mode === 'rules' ? '__rules' : (cfg.userId || '')} onChange={(e) => updateNodeConfig(e.target.value === '__rules' ? { mode: 'rules', userId: undefined } : { mode: undefined, userId: e.target.value || undefined })}>
                             <option value="">Choose a person…</option>
                             <option value="__rules">By assignment rules (leads only)</option>
                             {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                          </select>
                       </div>
                    )}

                    {cfg.type === 'webhook' && (
                       <div>
                          <label className="block text-xs font-bold text-gray-500 mb-2">Address (POST, JSON)</label>
                          <input className={inputCls} value={cfg.url ?? ''} onChange={(e) => updateNodeConfig({ url: e.target.value })} placeholder="https://example.com/hook" />
                          <p className="text-xs text-gray-400 mt-1.5">Sends the journey name, the record type and the record. Internal and private addresses are refused.</p>
                       </div>
                    )}

                    {cfg.type === 'create_record' && (
                       <div>
                          <label className="block text-xs font-bold text-gray-500 mb-2">Record type to create</label>
                          <select className={inputCls} value={cfg.entityType || ''} onChange={(e) => updateNodeConfig({ entityType: e.target.value, fields: {} })}>
                             <option value="">Choose…</option>
                             {entityOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                          </select>
                       </div>
                    )}

                    {(cfg.type === 'update_record' || cfg.type === 'create_lead' || (cfg.type === 'create_record' && cfg.entityType)) && (() => {
                       const targetType = cfg.type === 'update_record' ? triggerCfg.entityType : cfg.type === 'create_lead' ? 'lead' : cfg.entityType;
                       const targetFields = ((schemas[targetType]?.fields || []) as any[]).filter((f) => !['formula', 'rollup', 'autonumber', 'image', 'iframe', 'attachment'].includes(f.type));
                       const same = targetType === triggerCfg.entityType;
                       return (
                          <div>
                             <label className="block text-xs font-bold text-gray-500 mb-2">
                                {cfg.type === 'update_record' ? 'Fields to set on the record' : `Fields of the new ${schemas[targetType]?.label || 'record'}`}
                             </label>
                             {!targetType ? <p className="text-xs text-amber-600">Choose the record type on the Start Trigger first.</p> : (
                                <FieldMapper
                                   compact
                                   value={toRows(cfg.fields)}
                                   onChange={(rows) => updateNodeConfig({ fields: toObject(rows) })}
                                   targets={[...(targetFields.some((f) => f.name === 'status') ? [] : [{ name: 'status', label: 'Status', type: 'status' }]), ...targetFields].map((f: any) => ({ name: f.name, label: f.label, type: f.type, options: same && lookupOpts[f.name]?.length ? lookupOpts[f.name] : f.options }))}
                                   sources={triggerEntityFields.map((f: any) => ({ name: f.name, label: f.label, type: f.type }))}
                                />
                             )}
                             <p className="text-xs text-gray-400 mt-1.5">Pick a field, then give it a value, copy another field of the record, or use a date such as today plus 3 days.</p>
                          </div>
                       );
                    })()}

                    {!cfg.type && (
                       <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                          <AlertCircle className="w-4 h-4 inline mr-1 mb-0.5"/>
                          Pick an action type to configure what this step does.
                       </div>
                    )}
                 </div>
               )}

               {selectedNode.type === 'condition' && (
                 <div className="space-y-3">
                    <p className="text-xs text-gray-500">Checks the record when the journey reaches this step. Connect the <b className="text-green-600">YES</b> handle to what happens when it is true and the <b className="text-red-600">NO</b> handle to what happens otherwise.</p>
                    {!triggerCfg.entityType ? (
                       <p className="text-xs text-amber-600">Choose the record type on the Start Trigger first.</p>
                    ) : (
                       <GateBuilder compact value={toGate(cfg.conditions).children.length ? toGate(cfg.conditions) : emptyGate(triggerEntityFields[0]?.name || '')} onChange={(g) => updateNodeConfig({ conditions: g })} fields={gateFields} operators={gateOperators} />
                    )}
                 </div>
               )}

               {selectedNode.type === 'wait' && (
                  <div>
                     <label className="block text-xs font-bold text-gray-500 mb-2">Wait for</label>
                     <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                        <input type="number" min={1} className={inputCls} value={cfg.amount ?? ''} onChange={(e) => updateNodeConfig({ amount: Number(e.target.value) || undefined })} placeholder="2" />
                        <select className={inputCls} value={cfg.unit || 'days'} onChange={(e) => updateNodeConfig({ unit: e.target.value })}>
                           <option value="minutes">minutes</option>
                           <option value="hours">hours</option>
                           <option value="days">days</option>
                        </select>
                     </div>
                     <p className="text-xs text-gray-400 mt-1.5">The journey pauses here and carries on by itself afterwards, even if the server restarts. The record is re-read when it resumes.</p>
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
      {panel && journeyId && (
        <JourneySidePanel mode={panel} journeyId={journeyId} entityType={triggerCfg.entityType} onClose={() => setPanel(null)} />
      )}
    </div>
  );
};
