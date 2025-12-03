

import React, { useState, useEffect } from 'react';
import { EntityType, LayoutDefinition, EntityDefinition, CRMRecord, FieldDefinition, VisibilityRule, LayoutFieldConfig, Activity } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Plus, Filter, Download, Search, MoreHorizontal, ArrowLeft, Save, Upload, ExternalLink, Paperclip, Loader2, Phone, Mail, MapPin, Calendar, Clock, MessageSquare, Briefcase, User, Link, Image as ImageIcon, X, CloudUpload, Check } from 'lucide-react';
import { api } from '../services/api';

interface ModuleViewProps {
  entityType: EntityType;
}

export const ModuleView: React.FC<ModuleViewProps> = ({ entityType }) => {
  // Metadata & Data State
  const [schema, setSchema] = useState<EntityDefinition | null>(null);
  const [layout, setLayout] = useState<LayoutDefinition | null>(null);
  const [data, setData] = useState<CRMRecord[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // UI State
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [detailTab, setDetailTab] = useState<'overview' | 'timeline' | 'related'>('overview');
  const [selectedRecord, setSelectedRecord] = useState<CRMRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch Data on Entity Change
  useEffect(() => {
    const loadModule = async () => {
      setLoading(true);
      setView('list'); // Reset view on module switch
      try {
        const schemas = await api.getSchemas();
        const entityLayout = await api.getLayout(entityType);
        const records = await api.getRecords(entityType);
        
        setSchema(schemas[entityType]);
        setLayout(entityLayout);
        setData(records);
      } catch (e) {
        console.error("Failed to load module data", e);
      } finally {
        setLoading(false);
      }
    };
    loadModule();
  }, [entityType]);

  const loadActivities = async (id: string) => {
     const acts = await api.getActivities(id);
     setActivities(acts);
  };

  const handleSave = async () => {
    if (!selectedRecord || !schema) return;
    setIsSaving(true);
    try {
      const savedRecord = await api.saveRecord(entityType, selectedRecord);
      // Update local state
      const newData = [...data];
      const idx = newData.findIndex(r => r.id === savedRecord.id);
      if (idx >= 0) newData[idx] = savedRecord;
      else newData.unshift(savedRecord);
      
      setData(newData);
      setSelectedRecord(savedRecord); 
      alert('Record saved successfully!');
    } catch (error) {
      console.error(error);
      alert('Failed to save record.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateRecordField = (field: string, value: any) => {
    if (!selectedRecord) return;
    setSelectedRecord({ ...selectedRecord, [field]: value });
  };

  const checkVisibility = (rule: VisibilityRule | undefined, record: CRMRecord): boolean => {
    if (!rule || !rule.field) return true;
    const recordValue = record[rule.field];
    const targetValue = rule.value;
    switch (rule.operator) {
      case '==': return recordValue == targetValue;
      case '!=': return recordValue != targetValue;
      case '>': return Number(recordValue) > Number(targetValue);
      case '<': return Number(recordValue) < Number(targetValue);
      case 'contains': return String(recordValue).toLowerCase().includes(String(targetValue).toLowerCase());
      default: return true;
    }
  };

  const renderFieldInput = (field: FieldDefinition, value: any, readOnly = false, config: LayoutFieldConfig | undefined, record: CRMRecord) => {
    const baseClasses = `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-white ${config?.styles?.textColor || 'text-gray-900'} ${config?.styles?.fontWeight === 'bold' ? 'font-bold' : ''} ${config?.styles?.fontStyle === 'italic' ? 'italic' : ''}`;
    
    if (readOnly) {
      return <div className="py-2 text-sm text-gray-900 font-medium border-b border-gray-100">{value || '-'}</div>;
    }
    const handleChange = (e: any) => updateRecordField(field.name, e.target.value);

    switch (field.type) {
      case 'textarea':
        return <textarea className={baseClasses} rows={3} value={value || ''} onChange={handleChange} />;
      case 'select':
      case 'status':
        return (
          <select className={baseClasses} value={value || ''} onChange={handleChange}>
            <option value="">- Select -</option>
            {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'currency':
        return (
          <div className="relative">
             <span className="absolute left-3 top-2 text-gray-500">$</span>
             <input type="number" className={`${baseClasses} pl-7`} value={value || ''} onChange={handleChange} />
          </div>
        );
      case 'image':
        const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    updateRecordField(field.name, reader.result);
                };
                reader.readAsDataURL(file);
            }
        };

        return (
          <div className="flex items-start gap-4 p-4 border border-gray-200 rounded-xl bg-gray-50/50">
            {/* Preview / Drop Zone */}
            <div className="shrink-0 relative group">
                <div className={`
                    w-24 h-24 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all bg-white
                    ${!value ? 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50' : 'border-indigo-100 shadow-sm'}
                `}>
                    {value ? (
                        <img src={value} alt={field.label} className="w-full h-full object-cover" />
                    ) : (
                        <div className="text-center p-2">
                           <CloudUpload className="w-6 h-6 text-gray-400 mx-auto mb-1 group-hover:text-indigo-500 transition-colors" />
                           <span className="text-[10px] text-gray-400 font-medium uppercase group-hover:text-indigo-600">Upload</span>
                        </div>
                    )}
                    
                    {/* Overlay Action */}
                    <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer">
                         <span className="text-white text-xs font-semibold px-2 py-1 bg-white/20 rounded backdrop-blur-sm">Change</span>
                         <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </label>
                </div>
            </div>

            {/* Controls */}
            <div className="flex-1 space-y-3 pt-1">
                 <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Image Source</label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Link className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                            <input 
                                type="text" 
                                placeholder="Paste image URL..." 
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                value={value || ''}
                                onChange={handleChange}
                            />
                        </div>
                        {value && (
                           <Button 
                              variant="secondary" 
                              className="text-red-500 hover:bg-red-50 hover:border-red-200"
                              onClick={() => updateRecordField(field.name, '')}
                              title="Remove Image"
                           >
                              <X className="w-4 h-4"/>
                           </Button>
                        )}
                    </div>
                 </div>
                 <p className="text-[11px] text-gray-400 flex items-center gap-1">
                    <Check className="w-3 h-3 text-green-500"/> Supports JPG, PNG, WebP or direct URLs.
                 </p>
            </div>
          </div>
        );
      case 'lookup':
         return (
            <div className="flex gap-2">
               <input className={baseClasses} value={value || ''} onChange={handleChange} placeholder="Enter ID..." />
               <Button variant="secondary" icon={<Search className="w-4 h-4"/>}>Find</Button>
            </div>
         );
      case 'iframe':
         const urlTemplate = config?.urlTemplate || field.urlTemplate || '';
         let url = urlTemplate;
         Object.keys(record).forEach(key => { url = url.replace(`{${key}}`, encodeURIComponent(record[key] || '')); });
         if (!url) return <div className="text-gray-400 text-sm italic">No URL configured</div>;
         return <div className="w-full h-64 border rounded-lg bg-gray-100"><iframe src={url} className="w-full h-full" title={field.label} /></div>;
      default:
        return <input type={field.type} className={baseClasses} value={value || ''} onChange={handleChange} />;
    }
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-indigo-600"/></div>;
  if (!schema || !layout) return <div className="p-10 text-red-500">Failed to load module configuration.</div>;

  // --- 360 DETAIL VIEW ---
  if (view === 'detail' && selectedRecord) {
    const primaryField = schema.fields[0].name; // e.g. Name
    
    // Attempt to find an image field for the avatar
    const imageField = schema.fields.find(f => f.type === 'image');
    const imageUrl = imageField ? selectedRecord[imageField.name] : null;

    return (
      <div className="min-h-screen bg-gray-50 animate-in slide-in-from-right-4 duration-300">
        {/* TOP HEADER */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
           <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <button onClick={() => { setView('list'); setSelectedRecord(null); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                       <ArrowLeft className="w-5 h-5 text-gray-500" />
                    </button>
                    <div className="flex items-center gap-4">
                       <div className="relative group cursor-pointer">
                           {imageUrl ? (
                              <img src={imageUrl} alt="Profile" className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md group-hover:brightness-90 transition-all" />
                           ) : (
                              <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md">
                                 {selectedRecord[primaryField]?.[0]}
                              </div>
                           )}
                           {/* Tiny status indicator */}
                           <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${selectedRecord['status'] === 'Active' || selectedRecord['status'] === 'Qualified' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                       </div>
                       
                       <div>
                          <h1 className="text-xl font-bold text-gray-900 leading-none flex items-center gap-2">
                             {selectedRecord[primaryField]} {selectedRecord['lastName']}
                          </h1>
                          <p className="text-sm text-gray-500 mt-1 flex items-center gap-3">
                             {selectedRecord['title'] && <span className="font-medium text-gray-700">{selectedRecord['title']}</span>}
                             {selectedRecord['company'] && (
                                <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded text-gray-600 text-xs">
                                   <Briefcase className="w-3 h-3"/> {selectedRecord['company']}
                                </span>
                             )}
                          </p>
                       </div>
                    </div>
                 </div>
                 <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setView('list')}>Cancel</Button>
                    <Button icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4" />} onClick={handleSave} disabled={isSaving}>Save</Button>
                 </div>
              </div>

              {/* TABS */}
              <div className="flex gap-6 mt-6 border-b border-gray-100">
                 {['overview', 'timeline', 'related'].map((tab) => (
                    <button 
                       key={tab}
                       onClick={() => setDetailTab(tab as any)}
                       className={`pb-3 text-sm font-medium border-b-2 transition-all capitalize ${detailTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                       {tab}
                    </button>
                 ))}
              </div>
           </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-12 gap-8">
           
           {/* LEFT COLUMN: Profile Card (Static) */}
           <div className="col-span-12 lg:col-span-3 space-y-6">
              <Card>
                 <div className="space-y-4">
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                       <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                          <Mail className="w-4 h-4"/>
                       </div>
                       <span className="truncate">{selectedRecord['email'] || 'No email'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                       <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600 shrink-0">
                          <Phone className="w-4 h-4"/>
                       </div>
                       <span>{selectedRecord['phone'] || 'No phone'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                       <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                          <MapPin className="w-4 h-4"/>
                       </div>
                       <span>San Francisco, CA</span>
                    </div>
                    
                    <div className="pt-4 border-t border-gray-100">
                       <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Status</label>
                       <Badge status={selectedRecord['status']} />
                    </div>
                    
                    {selectedRecord['score'] && (
                       <div>
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Score</label>
                          <div className="flex items-end gap-2">
                             <div className="text-3xl font-bold text-indigo-600 leading-none">{selectedRecord['score']}</div>
                             <div className="text-xs text-green-500 font-bold mb-1">High Potential</div>
                          </div>
                          <div className="h-1.5 w-full bg-gray-100 rounded-full mt-2 overflow-hidden">
                             <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(selectedRecord['score'], 100)}%` }}></div>
                          </div>
                       </div>
                    )}
                 </div>
              </Card>

              {/* Next Best Action Widget */}
              <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl p-6 text-white shadow-lg relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-10 blur-2xl group-hover:bg-white/20 transition-all"></div>
                 <h4 className="font-bold text-xs uppercase opacity-70 mb-2 tracking-wider">Intelligence</h4>
                 <p className="font-bold text-lg mb-4 leading-tight">Schedule a follow-up call regarding the Q4 contract.</p>
                 <button className="w-full bg-white text-indigo-600 text-sm py-2.5 rounded-lg font-bold shadow hover:bg-indigo-50 transition-colors">
                    Execute Action
                 </button>
              </div>
           </div>

           {/* CENTER COLUMN: Dynamic Content */}
           <div className="col-span-12 lg:col-span-9 space-y-6">
              
              {detailTab === 'overview' && (
                 <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                    {layout.sections.map(section => (
                       <Card key={section.id} title={section.title} className={`${section.styles?.backgroundColor || 'bg-white'} ${section.className || ''}`}>
                          <div className="grid grid-cols-12 gap-6">
                             {section.columns.map(col => (
                                <div key={col.id} style={{ gridColumn: `span ${col.width}` }} className={`space-y-4 ${col.className || ''}`}>
                                   {col.fields.map(fieldName => {
                                      const fieldDef = schema.fields.find(f => f.name === fieldName);
                                      if (!fieldDef) return null;
                                      const fieldConfig = layout.fieldConfigs?.[fieldName];
                                      if (!checkVisibility(fieldConfig?.visibilityRule, selectedRecord)) return null;
                                      
                                      return (
                                         <div key={fieldName}>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                               {fieldConfig?.labelOverride || fieldDef.label} {fieldDef.required && <span className="text-red-500">*</span>}
                                               {fieldDef.type === 'image' && <ImageIcon className="w-3 h-3 text-indigo-400"/>}
                                            </label>
                                            {renderFieldInput(fieldDef, selectedRecord[fieldName], false, fieldConfig, selectedRecord)}
                                         </div>
                                      );
                                   })}
                                </div>
                             ))}
                          </div>
                       </Card>
                    ))}
                 </div>
              )}

              {detailTab === 'timeline' && (
                 <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                    <Card title="Activity Stream" action={<Button size="sm" variant="secondary" icon={<Plus className="w-3 h-3"/>}>Add Note</Button>}>
                       <div className="space-y-6">
                          {activities.map((act) => (
                             <div key={act.id} className="flex gap-4">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${act.type === 'email' ? 'bg-blue-100 text-blue-600' : act.type === 'call' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                                   {act.type === 'email' ? <Mail className="w-4 h-4"/> : act.type === 'call' ? <Phone className="w-4 h-4"/> : <MessageSquare className="w-4 h-4"/>}
                                </div>
                                <div className="flex-1">
                                   <div className="flex justify-between items-start">
                                      <span className="font-semibold text-gray-900 text-sm">{act.author}</span>
                                      <span className="text-xs text-gray-400">{act.timestamp}</span>
                                   </div>
                                   <p className="text-gray-600 text-sm mt-1">{act.content}</p>
                                </div>
                             </div>
                          ))}
                          {activities.length === 0 && <div className="text-center text-gray-400 py-4">No activities yet.</div>}
                       </div>
                    </Card>
                 </div>
              )}

              {detailTab === 'related' && (
                 <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                    <Card title="Related Records">
                       <div className="p-8 text-center text-gray-400 border-2 border-dashed border-gray-100 rounded-lg">
                          Related Lists (Tasks, Cases) Placeholder
                       </div>
                    </Card>
                 </div>
              )}

           </div>
        </div>
      </div>
    );
  }

  // --- LIST VIEW ---
  const filteredData = data.filter(record => 
    JSON.stringify(record).toLowerCase().includes(searchTerm.toLowerCase())
  );
  const columns = schema.fields.filter(f => !['image', 'iframe', 'attachment', 'textarea'].includes(f.type)).slice(0, 6);

  return (
    <div className="p-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{schema.pluralLabel}</h1>
          <p className="text-gray-500">Manage your {schema.pluralLabel.toLowerCase()} here.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon={<Filter className="w-4 h-4" />}>Filter</Button>
          <Button variant="secondary" icon={<Download className="w-4 h-4" />}>Export</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setSelectedRecord({ id: '' } as CRMRecord); setView('detail'); }}>New {schema.label}</Button>
        </div>
      </div>

      <Card className="mb-8">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text"
              placeholder={`Search ${schema.pluralLabel}...`}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left w-10"><input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></th>
                {columns.map(col => <th key={col.name} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{col.label}</th>)}
                <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => { setSelectedRecord(record); loadActivities(record.id); setView('detail'); }}>
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></td>
                  {columns.map((col, idx) => (
                    <td key={col.name} className="px-6 py-4 whitespace-nowrap">
                      {col.type === 'status' ? <Badge status={record[col.name]} /> : idx === 0 ? <span className="text-indigo-600 font-medium hover:underline">{record[col.name]}</span> : <span className="text-sm text-gray-500">{record[col.name]}</span>}
                    </td>
                  ))}
                  <td className="px-6 py-4 text-right"><MoreHorizontal className="w-5 h-5 text-gray-400" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
