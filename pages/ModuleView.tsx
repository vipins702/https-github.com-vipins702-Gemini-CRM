

import React, { useState, useEffect } from 'react';
import { EntityType, LayoutDefinition, EntityDefinition, CRMRecord, FieldDefinition, VisibilityRule, LayoutFieldConfig, Activity } from '../types';
import { formatCurrency, getCurrencySymbol } from '../services/currency';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Plus, Filter, Download, Search, MoreHorizontal, ArrowLeft, Save, Upload, ExternalLink, Paperclip, Loader2, Phone, Mail, MapPin, Calendar, Clock, MessageSquare, Briefcase, User, Link, Image as ImageIcon, X, CloudUpload, Check, Eye, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

interface ModuleViewProps {
   entityType: EntityType;
   onNavigate?: (view: string, params?: any) => void;
}

export const ModuleView: React.FC<ModuleViewProps> = ({ entityType, onNavigate }) => {
   // Metadata & Data State
   const [schema, setSchema] = useState<EntityDefinition | null>(null);
   const [layout, setLayout] = useState<LayoutDefinition | null>(null);
   const [data, setData] = useState<CRMRecord[]>([]);
   const [activities, setActivities] = useState<Activity[]>([]);
   const [relatedRecords, setRelatedRecords] = useState<Record<string, CRMRecord[]>>({});
   const [loading, setLoading] = useState(true);

   // UI State
   const [view, setView] = useState<'list' | 'detail'>('list');
   const [detailTab, setDetailTab] = useState<'overview' | 'timeline' | 'related'>('overview');
   const [selectedRecord, setSelectedRecord] = useState<CRMRecord | null>(null);
   const [searchTerm, setSearchTerm] = useState('');
   const [isSaving, setIsSaving] = useState(false);
   const [errors, setErrors] = useState<Record<string, string>>({});
   const { addToast } = useToast();

   // Lookup values state - keyed by lookupId
   const [lookupValues, setLookupValues] = useState<Record<string, { value_id: string; value: string }[]>>({});

   // Fetch Data on Entity Change
   useEffect(() => {
      const loadModule = async () => {
         setLoading(true);
         setView('list'); // Reset view on module switch
         setSelectedRecord(null);
         try {
            const [loadedSchema, loadedLayout, loadedData] = await Promise.all([
               api.getSchemas(),
               api.getLayout(entityType),
               api.getRecords(entityType)
            ]);

            setSchema(loadedSchema[entityType] || null);
            setLayout(loadedLayout || null);
            setData(loadedData);

            // Fetch lookup values for all lookup-type fields
            const lookupFields = loadedSchema[entityType]?.fields?.filter((f: FieldDefinition) => f.type === 'lookup') || [];
            const lookupValuesMap: Record<string, { value_id: string; value: string }[]> = {};
            for (const field of lookupFields) {
               const lookupId = `${entityType}_${field.name}`;
               try {
                  const values = await api.getLookupValues(lookupId);
                  lookupValuesMap[field.name] = values.map(v => ({ value_id: v.value_id, value: v.value }));
               } catch (e) {
                  lookupValuesMap[field.name] = []; // No values yet
               }
            }
            setLookupValues(lookupValuesMap);
         } catch (e) {
            console.error("Failed to load module data", e);
         } finally {
            setLoading(false);
         }
      };
      loadModule();
   }, [entityType]);

   const loadActivities = async (id: string) => {
      const acts = await api.getActivities(id, entityType);
      setActivities(acts);
   };

   const loadRelatedRecords = async (recordId: string) => {
      try {
         const [allCases, allTasks, allLeads, allProducts] = await Promise.all([
            api.getRecords('case'),
            api.getRecords('task'),
            api.getRecords('lead'),
            api.getRecords('product')
         ]);
         
         const isRelated = (r: CRMRecord, cid: string) => {
            if (!r.data) return false;
            try {
               const dataObj = JSON.parse(r.data);
               return dataObj.customerId === cid || dataObj.relatedCustomer === cid;
            } catch (e) {}
            return false;
         };
         
         setRelatedRecords({
            case: allCases.filter(c => isRelated(c, recordId)),
            task: allTasks.filter(t => isRelated(t, recordId)),
            lead: allLeads.filter(l => isRelated(l, recordId)),
            product: allProducts.filter(p => isRelated(p, recordId))
         });
      } catch (e) {
         console.error(e);
      }
   };

   const validateForm = (): boolean => {
      if (!schema || !selectedRecord) return true;
      const newErrors: Record<string, string> = {};

      // Determine which fields are on the form (layout fields, else all schema fields)
      const layoutFieldNames = new Set<string>();
      (layout?.sections || []).forEach(s => s.columns.forEach(c => c.fields.forEach(f => layoutFieldNames.add(f))));
      const fieldNames = layoutFieldNames.size ? Array.from(layoutFieldNames) : schema.fields.map(f => f.name);

      for (const fieldName of fieldNames) {
         const fieldDef = schema.fields.find(f => f.name === fieldName);
         if (!fieldDef) continue;
         const fc = layout?.fieldConfigs?.[fieldName];
         if (fc?.hidden) continue;
         if (fc?.visibilityRule && !checkVisibility(fc.visibilityRule, selectedRecord)) continue;

         const v = fc?.validation || {};
         const raw = selectedRecord[fieldName];
         const val = raw === undefined || raw === null ? '' : String(raw);

         const isRequired = v.required || fieldDef.required;
         if (isRequired && val.trim() === '') {
            newErrors[fieldName] = v.requiredMessage || `${fieldDef.label} is required`;
            continue;
         }
         if (val.trim() === '') continue; // skip remaining checks when empty & optional

         if (v.pattern) {
            try {
               if (!new RegExp(v.pattern).test(val)) {
                  newErrors[fieldName] = v.patternMessage || `${fieldDef.label} format is invalid`;
               }
            } catch { /* invalid regex configured — ignore */ }
         }
         if (!newErrors[fieldName] && v.minLength != null && val.length < v.minLength)
            newErrors[fieldName] = `${fieldDef.label} must be at least ${v.minLength} characters`;
         if (!newErrors[fieldName] && v.maxLength != null && val.length > v.maxLength)
            newErrors[fieldName] = `${fieldDef.label} must be at most ${v.maxLength} characters`;
         if (!newErrors[fieldName] && (fieldDef.type === 'number' || fieldDef.type === 'currency')) {
            const num = Number(val);
            if (v.min != null && num < v.min) newErrors[fieldName] = `${fieldDef.label} must be ≥ ${v.min}`;
            else if (v.max != null && num > v.max) newErrors[fieldName] = `${fieldDef.label} must be ≤ ${v.max}`;
         }
      }

      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) {
         addToast('Please fix the highlighted fields', 'error');
         return false;
      }
      return true;
   };

   const handleSave = async () => {
      if (!selectedRecord || !schema) return;
      if (!validateForm()) return;
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
         addToast('Record saved successfully!', 'success');
      } catch (error) {
         console.error(error);
         addToast('Failed to save record.', 'error');
      } finally {
         setIsSaving(false);
      }
   };

   const updateRecordField = (field: string, value: any) => {
      if (!selectedRecord) return;
      setSelectedRecord({ ...selectedRecord, [field]: value });
      if (errors[field]) {
         setErrors(prev => {
            const next = { ...prev };
            delete next[field];
            return next;
         });
      }
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
         const display = field.type === 'currency' && value !== '' && value != null
            ? formatCurrency(value, record?.currency)
            : (value || '-');
         return <div className="py-2 text-sm text-gray-900 font-medium border-b border-gray-100">{display}</div>;
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
                  <span className="absolute left-3 top-2 text-gray-500 text-sm">{getCurrencySymbol(record?.currency)}</span>
                  <input type="number" className={`${baseClasses} pl-10`} value={value || ''} onChange={handleChange} />
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
                                 <X className="w-4 h-4" />
                              </Button>
                           )}
                        </div>
                     </div>
                     <p className="text-[11px] text-gray-400 flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-500" /> Supports JPG, PNG, WebP or direct URLs.
                     </p>
                  </div>
               </div>
            );
         case 'lookup':
            const options = lookupValues[field.name] || [];
            return (
               <select className={baseClasses} value={value || ''} onChange={handleChange}>
                  <option value="">- Select -</option>
                  {options.map(opt => <option key={opt.value_id} value={opt.value_id}>{opt.value}</option>)}
               </select>
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

   if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;
   if (!schema || !layout) return <div className="p-10 text-red-500">Failed to load module configuration.</div>;

   // --- 360 DETAIL VIEW ---
   if (view === 'detail' && selectedRecord) {
      const primaryField = schema.fields[0].name; // e.g. Name

      // Attempt to find an image field for the avatar
      const imageField = schema.fields.find(f => f.type === 'image');
      const imageUrl = imageField ? selectedRecord[imageField.name] : null;

      return (
         <div className="min-h-screen animate-in fade-in duration-200">
            {/* TOP HEADER */}
            <div className="bg-slate-900 relative overflow-hidden">
               <div className="absolute -top-24 right-10 w-72 h-72 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>

               <div className="max-w-7xl mx-auto px-6 py-6 relative z-10">
                  {/* Back button */}
                  <button
                     onClick={() => { setView('list'); setSelectedRecord(null); }}
                     className="flex items-center gap-2 text-white/80 hover:text-white mb-6 transition-colors"
                  >
                     <ArrowLeft className="w-4 h-4" />
                     <span className="text-sm font-medium">Back to {schema.pluralLabel}</span>
                  </button>

                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-5">
                        {/* Avatar */}
                        <div className="relative">
                           {imageUrl ? (
                              <img src={imageUrl} alt="Profile" className="w-20 h-20 rounded-2xl object-cover border-4 border-white/20 shadow-2xl" />
                           ) : (
                              <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center text-white text-2xl font-bold border border-white/30 shadow-2xl">
                                 {(selectedRecord[primaryField] || 'U')[0].toUpperCase()}
                              </div>
                           )}
                           {/* Status indicator */}
                           <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-3 border-white ${selectedRecord['status'] === 'Active' || selectedRecord['status'] === 'Qualified' || selectedRecord['status'] === 'Open'
                                 ? 'bg-emerald-500'
                                 : 'bg-gray-400'
                              }`}></div>
                        </div>

                        <div className="text-white">
                           <h1 className="text-2xl font-bold flex items-center gap-3">
                              {selectedRecord[primaryField]} {selectedRecord['lastName'] || ''}
                              {selectedRecord['status'] && (
                                 <span className="px-2.5 py-1 bg-white/20 backdrop-blur rounded-lg text-xs font-medium">
                                    {selectedRecord['status']}
                                 </span>
                              )}
                           </h1>
                           <div className="flex items-center gap-4 mt-2 text-white/80 text-sm">
                              {selectedRecord['title'] && (
                                 <span className="font-medium">{selectedRecord['title']}</span>
                              )}
                              {selectedRecord['company'] && (
                                 <span className="flex items-center gap-1.5">
                                    <Briefcase className="w-3.5 h-3.5" /> {selectedRecord['company']}
                                 </span>
                              )}
                              {selectedRecord['email'] && (
                                 <span className="flex items-center gap-1.5">
                                    <Mail className="w-3.5 h-3.5" /> {selectedRecord['email']}
                                 </span>
                              )}
                           </div>
                        </div>
                     </div>

                     <div className="flex gap-2">
                        {entityType === 'customer' && onNavigate && (
                           <Button
                              variant="secondary"
                              className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                              icon={<Eye className="w-4 h-4" />}
                              onClick={() => onNavigate('customer-360', { customerId: selectedRecord.id })}
                           >
                              360° View
                           </Button>
                        )}
                        <Button variant="secondary" className="bg-white/20 border-white/30 text-white hover:bg-white/30" onClick={() => setView('list')}>Cancel</Button>
                        <Button
                           className="bg-white text-indigo-600 hover:bg-white/90"
                           icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                           onClick={handleSave}
                           disabled={isSaving}
                        >
                           Save Changes
                        </Button>
                     </div>
                  </div>
               </div>
            </div>

            {/* TABS - Sticky below TopBar */}
            <div className="bg-white/90 backdrop-blur border-b border-slate-200/70 sticky top-16 z-20">
               <div className="max-w-7xl mx-auto px-6">
                  <div className="flex gap-6" role="tablist">
                     {['overview', 'timeline', 'related'].map((tab) => (
                        <button
                           key={tab}
                           role="tab"
                           aria-selected={detailTab === tab}
                           onClick={() => setDetailTab(tab as any)}
                           className={`py-3.5 text-sm font-medium border-b-2 transition-colors capitalize ${detailTab === tab
                                 ? 'border-indigo-600 text-indigo-600'
                                 : 'border-transparent text-slate-500 hover:text-slate-800'
                              }`}
                        >
                           {tab}
                        </button>
                     ))}
                  </div>
               </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-12 gap-8">

               {/* LEFT COLUMN: Quick Info Card */}
               <div className="col-span-12 lg:col-span-3 space-y-6">
                  <Card title="Quick Info">
                     <div className="space-y-3.5">
                        {[
                           { icon: Mail, label: 'Email', value: selectedRecord['email'], tint: 'text-blue-600 bg-blue-50' },
                           { icon: Phone, label: 'Phone', value: selectedRecord['phone'], tint: 'text-emerald-600 bg-emerald-50' },
                           { icon: MapPin, label: 'Location', value: selectedRecord['address'] || selectedRecord['location'] || selectedRecord['city'], tint: 'text-violet-600 bg-violet-50' },
                        ].map(({ icon: Icon, label, value, tint }) => (
                           <div key={label} className="flex items-center gap-3 text-sm">
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tint}`}>
                                 <Icon className="w-[18px] h-[18px]" />
                              </div>
                              <div className="min-w-0">
                                 <div className="text-[11px] text-slate-400 uppercase tracking-wider">{label}</div>
                                 <div className="text-slate-900 font-medium truncate">{value || '-'}</div>
                              </div>
                           </div>
                        ))}

                        <div className="pt-3.5 border-t border-slate-100">
                           <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Status</label>
                           <Badge status={selectedRecord['status']} />
                        </div>

                        {selectedRecord['score'] && (
                           <div>
                              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Score</label>
                              <div className="flex items-end gap-2">
                                 <div className="text-3xl font-semibold text-indigo-600 leading-none tnum">{selectedRecord['score']}</div>
                                 <div className="text-xs text-emerald-600 font-semibold mb-1">High Potential</div>
                              </div>
                              <div className="h-1.5 w-full bg-slate-100 rounded-full mt-2 overflow-hidden">
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
                                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                                   {fieldConfig?.labelOverride || fieldDef.label} {(fieldDef.required || fieldConfig?.validation?.required) && <span className="text-rose-500">*</span>}
                                                   {fieldDef.type === 'image' && <ImageIcon className="w-3 h-3 text-indigo-400" />}
                                                </label>
                                                {renderFieldInput(fieldDef, selectedRecord[fieldName], false, fieldConfig, selectedRecord)}
                                                {errors[fieldName] && (
                                                   <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                                                      <AlertCircle className="w-3 h-3 shrink-0" /> {errors[fieldName]}
                                                   </p>
                                                )}
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
                        <Card title="Activity Stream" action={<Button size="sm" variant="secondary" icon={<Plus className="w-3 h-3" />}>Add Note</Button>}>
                           <div className="space-y-6">
                              {activities.map((act) => (
                                 <div key={act.id} className="flex gap-4">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${act.type === 'email' ? 'bg-blue-100 text-blue-600' : act.type === 'call' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                                       {act.type === 'email' ? <Mail className="w-4 h-4" /> : act.type === 'call' ? <Phone className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
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
                        {Object.entries(relatedRecords).map(([type, list]: [string, CRMRecord[]]) => {
                           if (list.length === 0) return null;
                           return (
                              <Card key={type} title={`Related ${type.charAt(0).toUpperCase() + type.slice(1)}s`}>
                                 <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-slate-100">
                                       <thead className="bg-slate-50/50">
                                          <tr>
                                             <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Name/Subject</th>
                                             <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                                          </tr>
                                       </thead>
                                       <tbody className="divide-y divide-slate-100 bg-white">
                                          {list.map(r => {
                                             let rData: any = {};
                                             try { rData = JSON.parse(r.data); } catch (e) {}
                                             return (
                                                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors duration-200">
                                                   <td className="px-4 py-3 text-sm font-semibold text-slate-700">
                                                      {r.primary_display || rData.name || rData.subject || r.id}
                                                   </td>
                                                   <td className="px-4 py-3">
                                                      <Badge status={rData.status || r.status} />
                                                   </td>
                                                </tr>
                                             );
                                          })}
                                       </tbody>
                                    </table>
                                 </div>
                              </Card>
                           );
                        })}
                        {Object.values(relatedRecords).every((l: CRMRecord[]) => l.length === 0) && (
                           <Card title="Related Records">
                              <div className="p-8 text-center text-slate-400 font-semibold border-2 border-dashed border-slate-100 rounded-2xl">
                                 No related records found.
                              </div>
                           </Card>
                        )}
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

   // Calculate stats
   const totalRecords = data.length;
   const activeRecords = data.filter(r => r.status === 'Active' || r.status === 'Qualified' || r.status === 'Open').length;
   const newThisWeek = data.filter(r => {
      if (!r.created_at) return false;
      const created = new Date(r.created_at);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return created > weekAgo;
   }).length;

   const listStats = [
      { icon: User, label: `Total ${schema.pluralLabel}`, value: totalRecords, tint: 'text-indigo-600 bg-indigo-50' },
      { icon: Check, label: 'Active', value: activeRecords, tint: 'text-emerald-600 bg-emerald-50' },
      { icon: Plus, label: 'New this week', value: newThisWeek, tint: 'text-blue-600 bg-blue-50' },
      { icon: Briefcase, label: 'Showing', value: filteredData.length, tint: 'text-violet-600 bg-violet-50' },
   ];

   return (
      <div className="min-h-screen">
         {/* Page Header */}
         <div className="bg-white border-b border-slate-200/70">
            <div className="max-w-7xl mx-auto px-6 py-5">
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                     <h1 className="text-xl font-semibold tracking-tight text-slate-900 flex items-center gap-2.5">
                        {schema.pluralLabel}
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-md tnum">
                           {totalRecords}
                        </span>
                     </h1>
                     <p className="text-slate-500 text-sm mt-1">Manage and track your {schema.pluralLabel.toLowerCase()}.</p>
                  </div>
                  <div className="flex gap-2">
                     <Button variant="secondary" icon={<Filter className="w-4 h-4" />}>Filter</Button>
                     <Button variant="secondary" icon={<Download className="w-4 h-4" />}>Export</Button>
                     <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => { setSelectedRecord({ id: '' } as CRMRecord); setRelatedRecords({}); setActivities([]); setView('detail'); }}>
                        New {schema.label}
                     </Button>
                  </div>
               </div>
            </div>
         </div>

         <div className="max-w-7xl mx-auto px-6 py-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
               {listStats.map(({ icon: Icon, label, value, tint }) => (
                  <div key={label} className="bg-white border border-slate-200/70 rounded-xl shadow-[var(--elev-1)] p-4 flex items-center gap-3.5">
                     <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tint}`}>
                        <Icon className="w-5 h-5" />
                     </div>
                     <div className="min-w-0">
                        <div className="text-xl font-semibold text-slate-900 tnum leading-none">{value}</div>
                        <div className="text-[13px] text-slate-500 mt-1 truncate">{label}</div>
                     </div>
                  </div>
               ))}
            </div>

            {/* Search & Table Card */}
            <Card className="overflow-hidden" noPadding>
               <div className="px-4 py-3 border-b border-slate-100 flex flex-col md:flex-row gap-3 items-center">
                  <div className="relative flex-1 w-full">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                     <input
                        type="text"
                        placeholder={`Search ${schema.pluralLabel.toLowerCase()}…`}
                        className="pl-9 pr-4 h-10 w-full text-sm border border-transparent bg-slate-100/80 rounded-lg outline-none transition-colors focus:bg-white focus:border-slate-300 focus-ring"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                     />
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500 shrink-0 tnum">
                     <span>{filteredData.length} results</span>
                  </div>
               </div>

               {/* Table */}
               <div className="overflow-x-auto">
                  <table className="min-w-full">
                     <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-100">
                           <th className="px-4 py-3 text-left w-10">
                              <input type="checkbox" aria-label="Select all" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                           </th>
                           {columns.map(col => (
                              <th key={col.name} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                                 {col.label}
                              </th>
                           ))}
                           <th className="relative px-4 py-3 w-16">
                              <span className="sr-only">Actions</span>
                           </th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {filteredData.length === 0 ? (
                           <tr>
                              <td colSpan={columns.length + 2} className="px-6 py-16 text-center">
                                 <div className="flex flex-col items-center">
                                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                                       <Search className="w-7 h-7 text-slate-300" />
                                    </div>
                                    <p className="text-slate-700 font-medium">No {schema.pluralLabel.toLowerCase()} found</p>
                                    <p className="text-slate-400 text-sm mt-1">Try adjusting your search, or create a new record.</p>
                                    <Button
                                       variant="primary"
                                       className="mt-4"
                                       icon={<Plus className="w-4 h-4" />}
                                       onClick={() => { setSelectedRecord({ id: '' } as CRMRecord); setRelatedRecords({}); setActivities([]); setView('detail'); }}
                                    >
                                       Create {schema.label}
                                    </Button>
                                 </div>
                              </td>
                           </tr>
                        ) : (
                           filteredData.map((record) => (
                              <tr
                                 key={record.id}
                                 className="group hover:bg-slate-50 transition-colors cursor-pointer"
                                 onClick={() => { setSelectedRecord(record); loadActivities(record.id); loadRelatedRecords(record.id); setView('detail'); }}
                              >
                                 <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                    <input type="checkbox" aria-label={`Select ${record[columns[0]?.name] || 'row'}`} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                                 </td>
                                 {columns.map((col, colIdx) => (
                                    <td key={col.name} className="px-4 py-3 whitespace-nowrap">
                                       {col.type === 'status' ? (
                                          <Badge status={record[col.name]} variant="dot" />
                                       ) : colIdx === 0 ? (
                                          <div className="flex items-center gap-3">
                                             <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center text-white text-xs font-semibold shrink-0">
                                                {(record[col.name] || 'U')[0].toUpperCase()}
                                             </div>
                                             <span className="text-slate-900 font-medium group-hover:text-indigo-600 transition-colors">
                                                {record[col.name]}
                                             </span>
                                          </div>
                                       ) : col.type === 'currency' ? (
                                          <span className="text-slate-900 font-medium tnum">{formatCurrency(record[col.name], record.currency)}</span>
                                       ) : col.type === 'email' ? (
                                          <span className="text-slate-500 text-sm">{record[col.name]}</span>
                                       ) : (
                                          <span className="text-slate-600 text-sm">{record[col.name] || '-'}</span>
                                       )}
                                    </td>
                                 ))}
                                 <td className="px-4 py-3 text-right">
                                    <button aria-label="Row actions" className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                                       <MoreHorizontal className="w-4 h-4 text-slate-400" />
                                    </button>
                                 </td>
                              </tr>
                           ))
                        )}
                     </tbody>
                  </table>
               </div>

               {/* Pagination Footer */}
               {filteredData.length > 0 && (
                  <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
                     <div className="text-sm text-slate-500">
                        Showing <span className="font-medium text-slate-900 tnum">{filteredData.length}</span> of <span className="font-medium text-slate-900 tnum">{totalRecords}</span> {schema.pluralLabel.toLowerCase()}
                     </div>
                     <div className="flex gap-2">
                        <Button variant="secondary" size="sm" disabled>Previous</Button>
                        <Button variant="secondary" size="sm" disabled>Next</Button>
                     </div>
                  </div>
               )}
            </Card>
         </div>
      </div>
   );
};
