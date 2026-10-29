

import React, { useState, useEffect } from 'react';
import { LayoutDefinition, EntityDefinition, FieldType, ComponentStyle, VisibilityRule } from '../types';
import { Button } from '../components/ui/Button';
import { GripVertical, Plus, Trash2, Columns, Monitor, Check, Palette, Eye, X, Bold, Italic, Link, Image as ImageIcon, Loader2, Code, Layout, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';

interface Selection {
   type: 'section' | 'column' | 'field';
   id: string; // sectionId, columnId, or fieldName
   parentId?: string; // sectionId for columns/fields
}

interface LayoutBuilderProps {
   initialEntity?: string;
}

export const LayoutBuilder: React.FC<LayoutBuilderProps> = ({ initialEntity }) => {
   // State
   const [activeEntity, setActiveEntity] = useState<string>('lead');
   const [schemas, setSchemas] = useState<Record<string, EntityDefinition>>({});
   const [layout, setLayout] = useState<LayoutDefinition | null>(null);

   const [selected, setSelected] = useState<Selection | null>(null);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);

   // Modal State for New Field
   const [isNewFieldModalOpen, setIsNewFieldModalOpen] = useState(false);
   const [newFieldConfig, setNewFieldConfig] = useState({ name: '', label: '', type: 'text' as FieldType });

   // Load Initial Data
   useEffect(() => {
      const fetchData = async () => {
         setLoading(true);
         const allSchemas = await api.getSchemas();
         setSchemas(allSchemas);

         // Determine initial active entity based on prop or default
         let targetEntity = 'lead';
         if (initialEntity && allSchemas[initialEntity]) {
            targetEntity = initialEntity;
         } else {
            targetEntity = Object.keys(allSchemas)[0] || 'lead';
         }

         setActiveEntity(targetEntity);
         const entityLayout = await api.getLayout(targetEntity);
         setLayout(entityLayout);
         setLoading(false);
      };
      fetchData();
   }, [initialEntity]);

   // Handle Entity Switch
   const handleEntityChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const type = e.target.value;
      setActiveEntity(type);
      setSelected(null);
      setLoading(true);
      const entityLayout = await api.getLayout(type);
      setLayout(entityLayout);
      setLoading(false);
   };

   // Save changes to API
   const handleSave = async () => {
      if (!layout) return;
      setSaving(true);
      try {
         await api.saveSchema(activeEntity, schemas[activeEntity]);
         await api.saveLayout(activeEntity, layout);
         alert('Layout saved successfully!');
      } catch (e) {
         alert('Failed to save layout');
      } finally {
         setSaving(false);
      }
   };

   const activeSchema = schemas[activeEntity];

   const handleAddSection = () => {
      if (!layout) return;
      const newSectionId = `s_${Date.now()}`;
      const newLayout = {
         ...layout,
         sections: [
            ...layout.sections,
            {
               id: newSectionId,
               title: 'New Section',
               columns: [{ id: `c_${Date.now()}`, width: 12, fields: [] }]
            }
         ]
      };
      setLayout(newLayout);
      setSelected({ type: 'section', id: newSectionId });
   };

   const handleAddFieldToLayout = (fieldName: string) => {
      if (!layout || !layout.sections.length) return;
      const newLayout = { ...layout };

      // Add to first column of first section by default if nothing selected
      // Or add to currently selected section/column context
      let targetSectionIdx = 0;
      let targetColIdx = 0;

      if (selected?.parentId) {
         targetSectionIdx = newLayout.sections.findIndex(s => s.id === selected.parentId);
         if (targetSectionIdx === -1) targetSectionIdx = 0;

         if (selected.type === 'column') {
            const colIdx = newLayout.sections[targetSectionIdx].columns.findIndex(c => c.id === selected.id);
            if (colIdx !== -1) targetColIdx = colIdx;
         }
      } else if (selected?.type === 'section') {
         targetSectionIdx = newLayout.sections.findIndex(s => s.id === selected.id);
         if (targetSectionIdx === -1) targetSectionIdx = 0;
      }

      const section = newLayout.sections[targetSectionIdx];
      if (section.columns.length > 0) {
         section.columns[targetColIdx].fields.push(fieldName);
      }
      setLayout(newLayout);
      setSelected({ type: 'field', id: fieldName, parentId: section.id });
   };

   const handleRemoveField = (sectionIdx: number, colIdx: number, fieldIdx: number, e: React.MouseEvent) => {
      if (!layout) return;
      e.stopPropagation();
      const newLayout = { ...layout };
      newLayout.sections[sectionIdx].columns[colIdx].fields.splice(fieldIdx, 1);
      setLayout(newLayout);
      if (selected?.type === 'field') setSelected(null);
   };

   const handleCreateNewField = () => {
      if (!newFieldConfig.name || !newFieldConfig.label) return;

      const fieldName = newFieldConfig.name.toLowerCase().replace(/\s+/g, '_');
      const newField = {
         name: fieldName,
         label: newFieldConfig.label,
         type: newFieldConfig.type,
         required: false
      };

      setSchemas(prev => ({
         ...prev,
         [activeEntity]: {
            ...prev[activeEntity],
            fields: [...prev[activeEntity].fields, newField]
         }
      }));

      setIsNewFieldModalOpen(false);
      setNewFieldConfig({ name: '', label: '', type: 'text' });
   };

   // --- Property Setters ---
   const updateFieldConfig = (fieldName: string, updates: Partial<any>) => {
      if (!layout) return;
      setLayout(prev => {
         if (!prev) return null;
         return {
            ...prev,
            fieldConfigs: {
               ...prev.fieldConfigs,
               [fieldName]: {
                  ...prev.fieldConfigs?.[fieldName],
                  ...updates
               }
            }
         };
      });
   };

   const updateSection = (sectionId: string, updates: Partial<any>) => {
      if (!layout) return;
      setLayout(prev => {
         if (!prev) return null;
         return {
            ...prev,
            sections: prev.sections.map(s => s.id === sectionId ? { ...s, ...updates } : s)
         };
      });
   };

   const updateColumn = (sectionId: string, columnId: string, updates: Partial<any>) => {
      if (!layout) return;
      setLayout(prev => {
         if (!prev) return null;
         const newSections = prev.sections.map(s => {
            if (s.id !== sectionId) return s;
            return {
               ...s,
               columns: s.columns.map(c => c.id === columnId ? { ...c, ...updates } : c)
            };
         });
         return { ...prev, sections: newSections };
      });
   };

   const addColumn = (sectionId: string) => {
      if (!layout) return;
      setLayout(prev => {
         if (!prev) return null;
         return {
            ...prev,
            sections: prev.sections.map(s => {
               if (s.id !== sectionId) return s;
               const newCol = { id: `c_${Date.now()}`, width: 6, fields: [] };
               // Adjust existing columns to fit if needed (simple logic)
               const existingCols = s.columns.map(c => ({ ...c, width: Math.max(1, Math.floor(12 / (s.columns.length + 1))) }));
               newCol.width = Math.max(1, Math.floor(12 / (s.columns.length + 1)));
               return { ...s, columns: [...existingCols, newCol] };
            })
         };
      });
   };

   if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;
   if (!layout || !activeSchema) return <div>Error loading layout</div>;

   // --- Render Properties Panel ---
   const renderPropertiesPanel = () => {
      if (!selected) {
         return (
            <div className="p-4 text-center text-gray-500 text-sm mt-10">
               <Palette className="w-8 h-8 mx-auto mb-2 text-gray-300" />
               Select an element to configure properties.
            </div>
         );
      }

      // --- SECTION PROPERTIES ---
      if (selected.type === 'section') {
         const section = layout.sections.find(s => s.id === selected.id);
         if (!section) return null;
         return (
            <div className="p-4 space-y-6">
               <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Section Title</label>
                  <input
                     className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                     value={section.title}
                     onChange={(e) => updateSection(section.id, { title: e.target.value })}
                  />
               </div>

               <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Columns</label>
                  <div className="flex gap-2 mb-2">
                     <Button size="sm" variant="secondary" onClick={() => addColumn(section.id)} icon={<Plus className="w-3 h-3" />}>Add Column</Button>
                  </div>
                  <p className="text-xs text-gray-400">Current: {section.columns.length} columns</p>
               </div>

               <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Background Color</label>
                  <div className="grid grid-cols-5 gap-2">
                     {['bg-surface', 'bg-gray-50', 'bg-blue-50', 'bg-green-50', 'bg-yellow-50'].map(bg => (
                        <button
                           key={bg}
                           className={`w-8 h-8 rounded border ${bg} ${section.styles?.backgroundColor === bg ? 'ring-2 ring-indigo-500' : 'border-gray-200'}`}
                           onClick={() => updateSection(section.id, { styles: { ...section.styles, backgroundColor: bg } })}
                        />
                     ))}
                  </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-2">
                     <Code className="w-3 h-3" /> Custom CSS Class
                  </label>
                  <input
                     className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono"
                     placeholder="e.g. border-b-4 border-red-500"
                     value={section.className || ''}
                     onChange={(e) => updateSection(section.id, { className: e.target.value })}
                  />
               </div>

               <Button variant="danger" size="sm" icon={<Trash2 className="w-3 h-3" />} onClick={() => {
                  setLayout(prev => prev ? ({ ...prev, sections: prev.sections.filter(s => s.id !== section.id) }) : null);
                  setSelected(null);
               }}>Delete Section</Button>
            </div>
         );
      }

      // --- COLUMN PROPERTIES ---
      if (selected.type === 'column') {
         const section = layout.sections.find(s => s.id === selected.parentId);
         const column = section?.columns.find(c => c.id === selected.id);
         if (!section || !column) return null;

         return (
            <div className="p-4 space-y-6 animate-in slide-in-from-right-5">
               <div className="border-b border-gray-100 pb-2 mb-2">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2"><Columns className="w-4 h-4" /> Column Settings</h3>
               </div>

               <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Width (Grid Span)</label>
                  <div className="flex items-center gap-3">
                     <input
                        type="range" min="1" max="12" step="1"
                        className="flex-1"
                        value={column.width}
                        onChange={(e) => updateColumn(section.id, column.id, { width: parseInt(e.target.value) })}
                     />
                     <span className="text-sm font-bold w-6">{column.width}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Total width across all columns in a row must be 12.</p>
               </div>

               <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-2">
                     <Code className="w-3 h-3" /> Custom CSS Class
                  </label>
                  <input
                     className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono"
                     placeholder="e.g. p-4 bg-gray-100"
                     value={column.className || ''}
                     onChange={(e) => updateColumn(section.id, column.id, { className: e.target.value })}
                  />
               </div>
            </div>
         );
      }

      // --- FIELD PROPERTIES ---
      if (selected.type === 'field') {
         const fieldDef = activeSchema.fields.find(f => f.name === selected.id);
         const config = layout.fieldConfigs?.[selected.id] || {};
         const rule = config.visibilityRule || { field: '', operator: '==', value: '' };

         // --- Validation helpers ---
         const PRESETS: Record<string, { pattern: string; msg: string }> = {
            email: { pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', msg: 'Please enter a valid email address' },
            phone: { pattern: '^[+]?[0-9\\s().-]{7,}$', msg: 'Please enter a valid phone number' },
            url: { pattern: '^https?://.+', msg: 'Please enter a valid URL (https://…)' },
            number: { pattern: '^[0-9]+$', msg: 'Numbers only' },
            alpha: { pattern: '^[A-Za-z\\s]+$', msg: 'Letters only' },
         };
         const currentPattern = config.validation?.pattern || '';
         const matchedPreset = Object.entries(PRESETS).find(([, p]) => p.pattern === currentPattern)?.[0] || (currentPattern ? 'custom' : '');
         const setVal = (patch: any) => updateFieldConfig(selected.id, { validation: { ...config.validation, ...patch } });
         const applyPreset = (key: string) => {
            if (!key) return setVal({ pattern: undefined, patternMessage: undefined });
            if (key === 'custom') return setVal({ pattern: config.validation?.pattern || '' });
            const p = PRESETS[key];
            setVal({ pattern: p.pattern, patternMessage: config.validation?.patternMessage || p.msg });
         };
         const isNumeric = fieldDef?.type === 'number' || fieldDef?.type === 'currency';

         return (
            <div className="p-4 space-y-6 animate-in slide-in-from-right-5 duration-200">
               <div className="border-b border-gray-100 pb-4">
                  <h3 className="font-semibold text-gray-900">{fieldDef?.label}</h3>
                  <p className="text-xs text-gray-500">Field Type: {fieldDef?.type}</p>
               </div>

               {/* Configuration Logic based on Type */}
               {(fieldDef?.type === 'iframe' || fieldDef?.type === 'lookup') && (
                  <div>
                     <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                        Configuration
                     </label>
                     <div className="p-3 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
                        {fieldDef.type === 'iframe' && (
                           <div>
                              <label className="block text-xs text-gray-600 mb-1">URL Template</label>
                              <input
                                 className="w-full text-xs border border-gray-300 rounded p-1"
                                 placeholder="https://example.com?id={id}"
                                 value={config.urlTemplate || fieldDef.urlTemplate || ''}
                                 onChange={(e) => updateFieldConfig(selected.id, { urlTemplate: e.target.value })}
                              />
                           </div>
                        )}
                        {fieldDef.type === 'lookup' && (
                           <div>
                              <label className="block text-xs text-gray-600 mb-1">Target Entity</label>
                              <select
                                 className="w-full text-xs border border-gray-300 rounded p-1"
                                 value={config.lookupTarget || fieldDef.lookupTarget || ''}
                                 onChange={(e) => updateFieldConfig(selected.id, { lookupTarget: e.target.value })}
                              >
                                 {Object.keys(schemas).map(k => <option key={k} value={k}>{schemas[k].label}</option>)}
                              </select>
                           </div>
                        )}
                     </div>
                  </div>
               )}

               {/* Validation */}
               <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                     <ShieldCheck className="w-3 h-3" /> Validation
                  </label>
                  <div className="p-3 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
                     {/* Required */}
                     <label className="flex items-center gap-2 text-xs text-gray-700 font-medium cursor-pointer">
                        <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500"
                           checked={!!config.validation?.required}
                           onChange={(e) => setVal({ required: e.target.checked })} />
                        Required field <span className="text-red-500">*</span>
                     </label>
                     {config.validation?.required && (
                        <input className="w-full text-xs border border-gray-300 rounded p-1.5"
                           placeholder="Message, e.g. Email is mandatory"
                           value={config.validation?.requiredMessage || ''}
                           onChange={(e) => setVal({ requiredMessage: e.target.value })} />
                     )}

                     {/* Format / Regex */}
                     <div>
                        <span className="text-xs text-gray-500 block mb-1">Format check (regex)</span>
                        <select className="w-full text-xs border border-gray-300 rounded p-1.5 bg-surface"
                           value={matchedPreset}
                           onChange={(e) => applyPreset(e.target.value)}>
                           <option value="">No format check</option>
                           <option value="email">Email</option>
                           <option value="phone">Phone</option>
                           <option value="url">URL</option>
                           <option value="number">Numbers only</option>
                           <option value="alpha">Letters only</option>
                           <option value="custom">Custom regex…</option>
                        </select>
                     </div>
                     {matchedPreset === 'custom' && (
                        <input className="w-full text-xs font-mono border border-gray-300 rounded p-1.5"
                           placeholder="^[A-Z0-9]+$"
                           value={config.validation?.pattern || ''}
                           onChange={(e) => setVal({ pattern: e.target.value })} />
                     )}
                     {config.validation?.pattern && (
                        <input className="w-full text-xs border border-gray-300 rounded p-1.5"
                           placeholder="Error message when format is invalid"
                           value={config.validation?.patternMessage || ''}
                           onChange={(e) => setVal({ patternMessage: e.target.value })} />
                     )}

                     {/* Length / Range */}
                     <div className="grid grid-cols-2 gap-2">
                        <div>
                           <span className="text-xs text-gray-400 block mb-1">{isNumeric ? 'Min value' : 'Min length'}</span>
                           <input type="number" className="w-full text-xs border border-gray-300 rounded p-1.5"
                              value={(isNumeric ? config.validation?.min : config.validation?.minLength) ?? ''}
                              onChange={(e) => {
                                 const n = e.target.value === '' ? undefined : Number(e.target.value);
                                 setVal(isNumeric ? { min: n } : { minLength: n });
                              }} />
                        </div>
                        <div>
                           <span className="text-xs text-gray-400 block mb-1">{isNumeric ? 'Max value' : 'Max length'}</span>
                           <input type="number" className="w-full text-xs border border-gray-300 rounded p-1.5"
                              value={(isNumeric ? config.validation?.max : config.validation?.maxLength) ?? ''}
                              onChange={(e) => {
                                 const n = e.target.value === '' ? undefined : Number(e.target.value);
                                 setVal(isNumeric ? { max: n } : { maxLength: n });
                              }} />
                        </div>
                     </div>
                  </div>
               </div>

               {/* Styling */}
               <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                     <Palette className="w-3 h-3" /> Styling
                  </label>
                  <div className="space-y-4">
                     <div>
                        <span className="text-xs text-gray-400 block mb-1">Background</span>
                        <div className="flex gap-2">
                           {['bg-transparent', 'bg-red-50', 'bg-blue-50', 'bg-green-50'].map(bg => (
                              <button
                                 key={bg}
                                 title={bg}
                                 className={`w-6 h-6 rounded border ${bg === 'bg-transparent' ? 'bg-surface bg-opacity-50' : bg} ${config.styles?.backgroundColor === bg ? 'ring-2 ring-indigo-500' : 'border-gray-200'}`}
                                 onClick={() => updateFieldConfig(selected.id, { styles: { ...config.styles, backgroundColor: bg } })}
                              >
                                 {bg === 'bg-transparent' && <X className="w-3 h-3 mx-auto text-gray-300" />}
                              </button>
                           ))}
                        </div>
                     </div>

                     <div>
                        <span className="text-xs text-gray-400 block mb-1">Text Style</span>
                        <div className="flex gap-2 bg-gray-50 p-1 rounded border border-gray-200 w-fit">
                           <button
                              className={`p-1 rounded ${config.styles?.fontWeight === 'bold' ? 'bg-surface shadow text-black' : 'text-gray-400 hover:text-gray-600'}`}
                              onClick={() => updateFieldConfig(selected.id, { styles: { ...config.styles, fontWeight: config.styles?.fontWeight === 'bold' ? 'normal' : 'bold' } })}
                              title="Bold"
                           >
                              <Bold className="w-4 h-4" />
                           </button>
                           <button
                              className={`p-1 rounded ${config.styles?.fontStyle === 'italic' ? 'bg-surface shadow text-black' : 'text-gray-400 hover:text-gray-600'}`}
                              onClick={() => updateFieldConfig(selected.id, { styles: { ...config.styles, fontStyle: config.styles?.fontStyle === 'italic' ? 'normal' : 'italic' } })}
                              title="Italic"
                           >
                              <Italic className="w-4 h-4" />
                           </button>
                        </div>
                     </div>
                     <div>
                        <span className="text-xs text-gray-400 block mb-1">Text Color</span>
                        <div className="flex gap-2">
                           {['text-gray-900', 'text-red-600', 'text-blue-600', 'text-green-600', 'text-indigo-600'].map(color => (
                              <button
                                 key={color}
                                 className={`w-6 h-6 rounded-full border ${color.replace('text', 'bg')} ${config.styles?.textColor === color ? 'ring-2 ring-offset-1 ring-gray-400' : 'border-transparent'}`}
                                 onClick={() => updateFieldConfig(selected.id, { styles: { ...config.styles, textColor: color } })}
                              />
                           ))}
                        </div>
                     </div>
                  </div>
               </div>

               {/* Visibility Rules */}
               <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                     <Eye className="w-3 h-3" /> Visibility Rule
                  </label>
                  <div className="p-3 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
                     <div>
                        <span className="text-xs text-gray-500">Show only when:</span>
                        <select
                           className="mt-1 w-full text-xs border border-gray-300 rounded p-1"
                           value={rule.field}
                           onChange={(e) => updateFieldConfig(selected.id, { visibilityRule: { ...rule, field: e.target.value } })}
                        >
                           <option value="">(Always Visible)</option>
                           {activeSchema.fields.filter(f => f.name !== selected.id).map(f => (
                              <option key={f.name} value={f.name}>{f.label}</option>
                           ))}
                        </select>
                     </div>
                     {rule.field && (
                        <div className="flex gap-2">
                           <select
                              className="w-1/3 text-xs border border-gray-300 rounded p-1"
                              value={rule.operator}
                              onChange={(e) => updateFieldConfig(selected.id, { visibilityRule: { ...rule, operator: e.target.value as any } })}
                           >
                              <option value="==">Equals</option>
                              <option value="!=">Not Equal</option>
                              <option value=">">Greater</option>
                              <option value="contains">Contains</option>
                           </select>
                           <input
                              className="w-2/3 text-xs border border-gray-300 rounded p-1"
                              placeholder="Value..."
                              value={String(rule.value || '')}
                              onChange={(e) => updateFieldConfig(selected.id, { visibilityRule: { ...rule, value: e.target.value } })}
                           />
                        </div>
                     )}
                  </div>
               </div>
            </div>
         );
      }
   };

   return (
      <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
         {/* Header */}
         <div className="h-16 bg-surface border-b border-gray-200 px-6 flex items-center justify-between shrink-0 z-20 relative">
            <div className="flex items-center gap-4">
               <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-indigo-600" />
                  Form Designer
               </h1>
               <div className="h-6 w-px bg-gray-300 mx-2"></div>
               <select
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2"
                  value={activeEntity}
                  onChange={handleEntityChange}
                  disabled={loading}
               >
                  {Object.values(schemas).map((s: EntityDefinition) => <option key={s.id} value={s.id}>{s.label}</option>)}
               </select>
            </div>
            <Button
               icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
               onClick={handleSave}
               disabled={saving}
            >
               {saving ? 'Saving...' : 'Save Layout'}
            </Button>
         </div>

         <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar: Toolbox */}
            <div className="w-72 bg-surface border-r border-gray-200 flex flex-col z-10">
               <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-gray-500">Fields</h3>
                  <button onClick={() => setIsNewFieldModalOpen(true)} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-medium hover:bg-indigo-100">+ New</button>
               </div>
               <div className="p-4 flex-1 overflow-y-auto space-y-2">
                  {activeSchema.fields.map(field => (
                     <div
                        key={field.name}
                        className="group flex items-center justify-between p-3 bg-surface border border-gray-200 rounded-lg shadow-sm hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all"
                        onClick={() => handleAddFieldToLayout(field.name)}
                     >
                        <div className="flex items-center gap-3">
                           <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-indigo-400" />
                           <div>
                              <p className="text-sm font-medium text-gray-900">{field.label}</p>
                              <p className="text-xs text-gray-400 capitalize bg-gray-100 px-1 rounded inline-block">{field.type}</p>
                           </div>
                        </div>
                        <Plus className="w-4 h-4 text-indigo-600 opacity-0 group-hover:opacity-100" />
                     </div>
                  ))}
               </div>
            </div>

            {/* Center Canvas */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-100/50">
               <div className="max-w-4xl mx-auto space-y-6 pb-20">
                  {layout.sections.map((section, sIdx) => (
                     <div
                        key={section.id}
                        className={`rounded-xl shadow-sm border transition-all cursor-pointer ${selected?.id === section.id
                              ? 'ring-2 ring-indigo-500 border-indigo-500'
                              : 'border-gray-200 hover:border-indigo-300'
                           } ${section.styles?.backgroundColor || 'bg-surface'} ${section.className || ''}`}
                        onClick={(e) => { e.stopPropagation(); setSelected({ type: 'section', id: section.id }); }}
                     >
                        <div className="px-6 py-4 border-b border-gray-100/50 flex items-center justify-between">
                           <h3 className="font-semibold text-gray-800">{section.title}</h3>
                           <div className="flex gap-2"><Columns className="w-4 h-4 text-gray-400" /></div>
                        </div>
                        <div className="p-6 grid grid-cols-12 gap-6 min-h-[100px]">
                           {section.columns.map((col, cIdx) => (
                              <div
                                 key={col.id}
                                 style={{ gridColumn: `span ${col.width}` }}
                                 className={`border-2 border-dashed border-gray-200/50 rounded-lg p-2 space-y-2 min-h-[80px] transition-all hover:bg-gray-50/50 ${selected?.id === col.id ? 'ring-2 ring-blue-400 bg-blue-50/30' : ''} ${col.className || ''}`}
                                 onClick={(e) => { e.stopPropagation(); setSelected({ type: 'column', id: col.id, parentId: section.id }); }}
                              >
                                 {col.fields.length === 0 && (
                                    <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">Drop fields here</div>
                                 )}
                                 {col.fields.map((fieldName, fIdx) => {
                                    const fieldDef = activeSchema.fields.find(f => f.name === fieldName);
                                    const fieldConfig = layout.fieldConfigs?.[fieldName];
                                    const bgClass = fieldConfig?.styles?.backgroundColor || 'bg-surface';

                                    const textStyle = {
                                       fontWeight: fieldConfig?.styles?.fontWeight,
                                       fontStyle: fieldConfig?.styles?.fontStyle,
                                       color: fieldConfig?.styles?.textColor === 'text-indigo-600' ? '#4f46e5' :
                                          fieldConfig?.styles?.textColor === 'text-red-600' ? '#dc2626' :
                                             fieldConfig?.styles?.textColor === 'text-green-600' ? '#16a34a' : 'inherit'
                                    };

                                    return (
                                       <div
                                          key={`${fieldName}-${fIdx}`}
                                          className={`border p-3 rounded flex items-center justify-between group/field cursor-pointer transition-all ${selected?.id === fieldName
                                                ? 'ring-2 ring-indigo-500 border-indigo-500 z-10 relative'
                                                : 'border-gray-200 hover:border-indigo-300'
                                             } ${bgClass}`}
                                          onClick={(e) => {
                                             e.stopPropagation();
                                             setSelected({ type: 'field', id: fieldName, parentId: section.id });
                                          }}
                                       >
                                          <div className="flex items-center gap-2">
                                             {fieldDef?.type === 'iframe' && <Monitor className="w-3 h-3 text-gray-400" />}
                                             {fieldDef?.type === 'lookup' && <Link className="w-3 h-3 text-gray-400" />}
                                             {fieldDef?.type === 'image' && <ImageIcon className="w-3 h-3 text-gray-400" />}
                                             <span className="text-sm text-gray-700" style={textStyle}>{fieldDef?.label || fieldName}</span>
                                          </div>
                                          <button
                                             onClick={(e) => handleRemoveField(sIdx, cIdx, fIdx, e)}
                                             className="text-gray-400 hover:text-red-500 opacity-0 group-hover/field:opacity-100"
                                          >
                                             <Trash2 className="w-3 h-3" />
                                          </button>
                                       </div>
                                    )
                                 })}
                              </div>
                           ))}
                        </div>
                     </div>
                  ))}

                  <button onClick={handleAddSection} className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50/20 flex flex-col items-center justify-center gap-2 transition-all">
                     <Plus className="w-6 h-6" /> <span className="font-medium">Add Section</span>
                  </button>
               </div>
            </div>

            {/* Right Sidebar: Properties */}
            <div className="w-72 bg-surface border-l border-gray-200 flex flex-col z-10">
               <div className="p-4 border-b border-gray-100 bg-gray-50">
                  <h3 className="text-xs font-bold text-gray-500">Properties</h3>
               </div>
               <div className="flex-1 overflow-y-auto">
                  {renderPropertiesPanel()}
               </div>
            </div>
         </div>

         {/* New Field Modal */}
         {isNewFieldModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
               <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between mb-6">
                     <h2 className="text-lg font-bold text-gray-900">Create New Field</h2>
                     <button onClick={() => setIsNewFieldModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                     </button>
                  </div>

                  <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Field Name (API)</label>
                        <input
                           type="text"
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                           placeholder="e.g. custom_field"
                           value={newFieldConfig.name}
                           onChange={(e) => setNewFieldConfig(prev => ({ ...prev, name: e.target.value }))}
                        />
                     </div>

                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Display Label</label>
                        <input
                           type="text"
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                           placeholder="e.g. Custom Field"
                           value={newFieldConfig.label}
                           onChange={(e) => setNewFieldConfig(prev => ({ ...prev, label: e.target.value }))}
                        />
                     </div>

                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Field Type</label>
                        <select
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                           value={newFieldConfig.type}
                           onChange={(e) => setNewFieldConfig(prev => ({ ...prev, type: e.target.value as FieldType }))}
                        >
                           <option value="text">Text</option>
                           <option value="number">Number</option>
                           <option value="email">Email</option>
                           <option value="phone">Phone</option>
                           <option value="textarea">Text Area</option>
                           <option value="select">Dropdown</option>
                           <option value="date">Date</option>
                           <option value="currency">Currency</option>
                           <option value="lookup">Lookup</option>
                           <option value="iframe">iFrame</option>
                           <option value="image">Image</option>
                        </select>
                     </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                     <Button variant="secondary" onClick={() => setIsNewFieldModalOpen(false)}>Cancel</Button>
                     <Button onClick={handleCreateNewField} disabled={!newFieldConfig.name || !newFieldConfig.label}>
                        Create Field
                     </Button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};
