
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Campaign, EntityDefinition } from '../types';
import { api } from '../services/api';
import { 
  Megaphone, Plus, Edit3, Code, Eye, Loader2, Copy, Check, 
  FileText, Smartphone, Monitor, Columns, Layout, Save, X, 
  ChevronLeft, Settings, Hash, Braces, RefreshCw
} from 'lucide-react';

export const Campaigns: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadSchema, setLeadSchema] = useState<EntityDefinition | null>(null);
  const [leadFields, setLeadFields] = useState<string[]>([]);
  
  // Editor State
  const [editingCampaign, setEditingCampaign] = useState<Partial<Campaign> | null>(null);
  const [activeView, setActiveView] = useState<'split' | 'code' | 'preview'>('split');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewMode, setPreviewMode] = useState<'data' | 'vars'>('data'); // Toggle between seeing {{var}} or "John"
  
  // Embed Modal State
  const [showEmbedCode, setShowEmbedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Refs for insertion
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [camps, schemas] = await Promise.all([api.getCampaigns(), api.getSchemas()]);
    setCampaigns(camps);
    
    // Extract actual fields from Lead schema for variables
    const lead = schemas['lead'];
    if (lead) {
      setLeadSchema(lead);
      setLeadFields(lead.fields.map(f => `{{${f.name}}}`));
    }
    
    setLoading(false);
  };

  const handleCreate = () => {
    setEditingCampaign({
      name: 'New Campaign',
      subject: 'Exciting News inside!',
      status: 'Draft',
      templateHtml: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .header { text-align: center; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #1e293b; margin: 0; }
    .btn { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
    .footer { margin-top: 40px; font-size: 12px; text-align: center; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Campaign Headline</h1>
    </div>
    
    <p>Hi {{firstName}},</p>
    
    <p>We are excited to share our latest updates with you. This template is fully customizable HTML.</p>
    
    <a href="#" class="btn">Learn More</a>
    
    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
    
    <h3>Interested? Sign up below:</h3>
    <!-- The CRM Form will be injected into this container -->
    <div id="flowcrm-web-form"></div>
    
    <div class="footer">
      <p>&copy; 2024 FlowCRM Inc. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      stats: { sent: 0, opened: 0, clicked: 0, submissions: 0 }
    });
  };

  const handleSave = async () => {
    if (!editingCampaign || !editingCampaign.name) return;
    await api.saveCampaign(editingCampaign as Campaign);
    setEditingCampaign(null);
    loadData();
  };

  const insertAtCursor = (text: string) => {
    if (textAreaRef.current) {
      const start = textAreaRef.current.selectionStart;
      const end = textAreaRef.current.selectionEnd;
      const currentVal = editingCampaign?.templateHtml || '';
      const newVal = currentVal.substring(0, start) + text + currentVal.substring(end);
      
      setEditingCampaign({ ...editingCampaign, templateHtml: newVal });
      
      // Defer focus back to allow state update
      setTimeout(() => {
        if (textAreaRef.current) {
          textAreaRef.current.focus();
          textAreaRef.current.setSelectionRange(start + text.length, start + text.length);
        }
      }, 0);
    }
  };

  // --- PREVIEW GENERATION ---
  const getPreviewHtml = (html: string) => {
    if (previewMode === 'vars') return html;

    let preview = html;

    // 1. Mock Data Substitution
    const mocks: Record<string, string> = {
       '{{firstName}}': 'John',
       '{{lastName}}': 'Doe',
       '{{email}}': 'john.doe@acme.com',
       '{{phone}}': '(555) 123-4567',
       '{{company}}': 'Acme Corp',
       '{{title}}': 'Director of Operations',
       '{{status}}': 'New',
       '{{source}}': 'Web',
       '{{score}}': '85'
    };

    // Replace known mocks
    Object.keys(mocks).forEach(key => {
       preview = preview.split(key).join(mocks[key]);
    });
    
    // Replace unknown {{...}} with generic placeholder
    preview = preview.replace(/\{\{.*?\}\}/g, '<span style="background:#e0e7ff; color:#4338ca; padding:0 4px; border-radius:4px; font-size:0.9em;">[Data]</span>');

    // 2. Form Injection
    // We generate a dummy form based on the Lead Schema to show the user what it looks like
    if (leadSchema) {
       const formFieldsHtml = leadSchema.fields
          .filter(f => !f.system && f.type !== 'lookup' && f.type !== 'iframe')
          .map(f => `
             <div style="margin-bottom: 12px;">
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
                   ${f.label} ${f.required ? '<span style="color:#ef4444">*</span>' : ''}
                </label>
                <input type="text" disabled placeholder="User types ${f.label} here..." 
                   style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#f8fafc; color:#94a3b8; font-size:14px; box-sizing:border-box;">
             </div>
          `).join('');

       const formHtml = `
          <div style="background:#fff; border:1px dashed #cbd5e1; padding:20px; border-radius:8px;">
             <div style="text-align:center; margin-bottom:15px; color:#64748b; font-size:11px; text-transform:uppercase; font-weight:bold; letter-spacing:0.5px;">
                Web-to-Lead Form Preview
             </div>
             ${formFieldsHtml}
             <button disabled style="width:100%; background:#4f46e5; color:white; padding:10px; border:none; border-radius:6px; font-weight:600; cursor:not-allowed; opacity:0.8;">
                Submit Application
             </button>
          </div>
       `;
       
       // Use regex to replace the div, handling potential attributes
       preview = preview.replace(/<div[^>]*id="flowcrm-web-form"[^>]*><\/div>/, formHtml);
    }

    return preview;
  };

  const handleGenerateEmbed = (id: string) => {
    const origin = window.location.origin;
    const code = `<!-- FlowCRM Web-to-Lead Embed -->
<iframe 
  src="${origin}/form/${id}" 
  width="100%" 
  height="600px" 
  frameborder="0" 
  style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #eee;"
></iframe>
<script>
  window.addEventListener('message', e => {
    if(e.data.type === 'flowcrm-resize') {
       document.querySelector('iframe[src*="${id}"]').style.height = e.data.height + 'px';
    }
  });
</script>`;
    setShowEmbedCode(code);
    setCopied(false);
  };

  const copyToClipboard = () => {
    if (showEmbedCode) {
      navigator.clipboard.writeText(showEmbedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // --- EDITOR VIEW ---
  if (editingCampaign) {
    return (
      <div className="h-screen flex flex-col bg-slate-900 text-white overflow-hidden">
        {/* Top Bar */}
        <div className="h-16 border-b border-slate-700 bg-slate-900 px-6 flex items-center justify-between shrink-0">
           <div className="flex items-center gap-4">
              <button onClick={() => setEditingCampaign(null)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                 <ChevronLeft className="w-5 h-5"/>
              </button>
              <div>
                 <input 
                   className="bg-transparent border-none p-0 text-white font-bold focus:ring-0 text-lg placeholder-slate-500 w-64"
                   value={editingCampaign.name}
                   onChange={(e) => setEditingCampaign({...editingCampaign, name: e.target.value})}
                   placeholder="Campaign Name"
                 />
                 <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className={`w-2 h-2 rounded-full ${editingCampaign.status === 'Active' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                    {editingCampaign.status}
                 </div>
              </div>
           </div>

           <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
              <button 
                onClick={() => setActiveView('code')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeView === 'code' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                 <Code className="w-4 h-4"/> Code
              </button>
              <button 
                onClick={() => setActiveView('split')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeView === 'split' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                 <Columns className="w-4 h-4"/> Split
              </button>
              <button 
                onClick={() => setActiveView('preview')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeView === 'preview' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                 <Eye className="w-4 h-4"/> Preview
              </button>
           </div>

           <div className="flex items-center gap-3">
              <Button variant="secondary" className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white" onClick={() => setEditingCampaign(null)}>
                 Discard
              </Button>
              <Button icon={<Save className="w-4 h-4"/>} onClick={handleSave}>
                 Save Changes
              </Button>
           </div>
        </div>

        {/* Main Workspace */}
        <div className="flex-1 flex overflow-hidden">
           
           {/* Sidebar: Settings */}
           <div className="w-72 bg-slate-900 border-r border-slate-700 flex flex-col z-10">
              <div className="p-4 border-b border-slate-700 font-bold text-sm text-slate-300 uppercase tracking-wider flex items-center gap-2">
                 <Settings className="w-4 h-4"/> Settings
              </div>
              <div className="p-4 space-y-6 overflow-y-auto flex-1">
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email Subject</label>
                    <input 
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={editingCampaign.subject}
                      onChange={(e) => setEditingCampaign({...editingCampaign, subject: e.target.value})}
                    />
                 </div>
                 
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Campaign Status</label>
                    <select 
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={editingCampaign.status}
                      onChange={(e) => setEditingCampaign({...editingCampaign, status: e.target.value as any})}
                    >
                       <option value="Draft">Draft</option>
                       <option value="Active">Active</option>
                       <option value="Completed">Completed</option>
                    </select>
                 </div>

                 <div className="border-t border-slate-700 pt-6">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Insert Variables (Lead)</label>
                    <div className="grid grid-cols-1 gap-2">
                       {leadFields.length > 0 ? leadFields.map(tag => (
                          <button 
                            key={tag}
                            onClick={() => insertAtCursor(tag)}
                            className="text-left px-3 py-2 bg-slate-800 border border-slate-700 rounded hover:bg-indigo-900 hover:border-indigo-500 text-xs font-mono text-indigo-300 transition-colors flex items-center justify-between group"
                          >
                             {tag}
                             <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100"/>
                          </button>
                       )) : (
                         <span className="text-xs text-slate-500 italic">No variables available.</span>
                       )}
                    </div>
                 </div>

                 <div className="border-t border-slate-700 pt-6">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Web Form</label>
                    <div className="p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg">
                       <p className="text-xs text-indigo-300 mb-2">Inject the lead capture form.</p>
                       <button 
                         onClick={() => insertAtCursor('<div id="flowcrm-web-form"></div>')}
                         className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold flex items-center justify-center gap-2"
                       >
                          <Layout className="w-3 h-3"/> Insert Form
                       </button>
                    </div>
                 </div>
              </div>
           </div>

           {/* Code Editor Area */}
           {(activeView === 'code' || activeView === 'split') && (
              <div className="flex-1 flex flex-col bg-[#1e1e1e] border-r border-slate-700 relative">
                 <div className="h-8 bg-[#252526] flex items-center px-4 text-xs text-slate-400 border-b border-[#333]">
                    <span className="flex items-center gap-1"><Code className="w-3 h-3"/> HTML Source</span>
                 </div>
                 <textarea 
                   ref={textAreaRef}
                   className="flex-1 w-full bg-[#1e1e1e] text-gray-300 font-mono text-sm p-4 outline-none resize-none leading-relaxed"
                   spellCheck={false}
                   value={editingCampaign.templateHtml}
                   onChange={(e) => setEditingCampaign({...editingCampaign, templateHtml: e.target.value})}
                 />
              </div>
           )}

           {/* Preview Area */}
           {(activeView === 'preview' || activeView === 'split') && (
              <div className={`flex flex-col bg-gray-100 relative transition-all duration-300 ${activeView === 'split' ? 'w-1/2' : 'flex-1'}`}>
                 <div className="h-8 bg-white border-b border-gray-200 flex items-center justify-between px-4 text-xs">
                    <span className="font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                       <Eye className="w-3 h-3"/> Live Preview
                    </span>
                    <div className="flex gap-4 items-center">
                       {/* Mode Toggle */}
                       <div className="flex bg-gray-100 rounded p-0.5 border border-gray-200">
                          <button 
                            onClick={() => setPreviewMode('data')}
                            title="Show Mock Data"
                            className={`p-1 px-2 rounded flex items-center gap-1 text-[10px] font-bold uppercase ${previewMode === 'data' ? 'bg-white shadow text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                             Data
                          </button>
                          <button 
                            onClick={() => setPreviewMode('vars')}
                            title="Show Raw Variables"
                            className={`p-1 px-2 rounded flex items-center gap-1 text-[10px] font-bold uppercase ${previewMode === 'vars' ? 'bg-white shadow text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                             <Braces className="w-3 h-3"/> Vars
                          </button>
                       </div>

                       {/* Device Toggle */}
                       <div className="flex bg-gray-100 rounded p-0.5 border border-gray-200">
                          <button 
                            onClick={() => setPreviewDevice('desktop')}
                            className={`p-1 rounded ${previewDevice === 'desktop' ? 'bg-white shadow text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                             <Monitor className="w-3 h-3"/>
                          </button>
                          <button 
                            onClick={() => setPreviewDevice('mobile')}
                            className={`p-1 rounded ${previewDevice === 'mobile' ? 'bg-white shadow text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                             <Smartphone className="w-3 h-3"/>
                          </button>
                       </div>
                    </div>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-8 flex items-start justify-center">
                    <div 
                      className={`bg-white shadow-2xl transition-all duration-300 overflow-hidden ${
                         previewDevice === 'mobile' ? 'w-[375px] h-[667px] rounded-3xl border-8 border-gray-800' : 'w-full h-full rounded-lg border border-gray-200'
                      }`}
                    >
                       <iframe 
                         srcDoc={getPreviewHtml(editingCampaign.templateHtml || '')}
                         className="w-full h-full bg-white"
                         title="Preview"
                         sandbox="allow-scripts"
                       />
                    </div>
                 </div>
              </div>
           )}
        </div>
      </div>
    );
  }

  // --- DASHBOARD VIEW ---
  return (
    <div className="p-8 h-screen flex flex-col bg-gray-50 overflow-hidden">
      <div className="flex justify-between items-center mb-8 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns & Web Forms</h1>
          <p className="text-gray-500">Manage marketing campaigns, email templates, and web-to-lead forms.</p>
        </div>
        <Button icon={<Plus className="w-4 h-4"/>} onClick={handleCreate}>New Campaign</Button>
      </div>

      <div className="flex-1 overflow-y-auto">
         {loading ? (
            <div className="flex justify-center p-10"><Loader2 className="animate-spin text-indigo-600"/></div>
         ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
               {campaigns.map(campaign => (
                  <Card key={campaign.id} className="flex flex-col h-full hover:border-indigo-300 transition-all group">
                     <div className="p-6 flex-1">
                        <div className="flex justify-between items-start mb-4">
                           <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                              <Megaphone className="w-5 h-5"/>
                           </div>
                           <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                              campaign.status === 'Active' ? 'bg-green-100 text-green-700' : 
                              campaign.status === 'Completed' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-700'
                           }`}>
                              {campaign.status}
                           </span>
                        </div>
                        <h3 className="font-bold text-lg text-gray-900 mb-1">{campaign.name}</h3>
                        <p className="text-sm text-gray-500 mb-6 line-clamp-2 h-10">{campaign.subject || 'No subject'}</p>

                        <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-4">
                           <div className="text-center">
                              <div className="text-lg font-bold text-gray-900">{campaign.stats.sent}</div>
                              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Sent</div>
                           </div>
                           <div className="text-center border-l border-gray-100">
                              <div className="text-lg font-bold text-gray-900">{campaign.stats.opened}</div>
                              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Opened</div>
                           </div>
                           <div className="text-center border-l border-gray-100">
                              <div className="text-lg font-bold text-indigo-600">{campaign.stats.submissions}</div>
                              <div className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider">Leads</div>
                           </div>
                        </div>
                     </div>
                     <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex justify-between items-center backdrop-blur-sm">
                        <button 
                           onClick={() => setEditingCampaign(campaign)}
                           className="text-sm font-semibold text-gray-600 hover:text-indigo-600 flex items-center gap-2 transition-colors"
                        >
                           <Edit3 className="w-4 h-4"/> Design
                        </button>
                        <div className="flex gap-2">
                           <button 
                              onClick={() => window.open(`/form/${campaign.id}`, '_blank')}
                              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                              title="View Public Page"
                           >
                              <Eye className="w-4 h-4"/>
                           </button>
                           <button 
                              onClick={() => handleGenerateEmbed(campaign.id)}
                              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                              title="Get Embed Code"
                           >
                              <Code className="w-4 h-4"/>
                           </button>
                        </div>
                     </div>
                  </Card>
               ))}
               {campaigns.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border-2 border-dashed border-gray-200">
                     <Megaphone className="w-12 h-12 mb-4 opacity-20"/>
                     <p className="text-lg font-medium text-gray-900">No campaigns yet</p>
                     <p className="text-sm mb-6">Create your first marketing campaign to generate leads.</p>
                     <Button onClick={handleCreate}>Create Campaign</Button>
                  </div>
               )}
            </div>
         )}
      </div>

      {/* Embed Code Modal */}
      {showEmbedCode && (
         <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 animate-in zoom-in-95 border border-gray-200">
               <div className="flex justify-between items-start mb-4">
                  <div>
                     <h3 className="text-lg font-bold text-gray-900">Embed Web-to-Lead Form</h3>
                     <p className="text-sm text-gray-500">Copy this code to your website to capture leads directly.</p>
                  </div>
                  <button onClick={() => setShowEmbedCode(null)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5"/></button>
               </div>
               
               <div className="bg-slate-900 rounded-lg p-4 mb-6 relative group border border-slate-700 shadow-inner">
                  <pre className="text-xs font-mono text-indigo-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-[200px] scrollbar-thin scrollbar-thumb-slate-700">
                     {showEmbedCode}
                  </pre>
                  <div className="absolute top-2 right-2">
                     <button 
                       onClick={copyToClipboard}
                       className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${copied ? 'bg-green-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                     >
                       {copied ? <><Check className="w-3 h-3"/> Copied</> : <><Copy className="w-3 h-3"/> Copy</>}
                     </button>
                  </div>
               </div>

               <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-700">
                  <div className="flex items-center gap-2">
                     <Layout className="w-4 h-4"/>
                     <span>Form styling inherits from the Campaign Template.</span>
                  </div>
                  <a href="#" className="font-semibold underline hover:text-blue-800">Preview Form</a>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};
