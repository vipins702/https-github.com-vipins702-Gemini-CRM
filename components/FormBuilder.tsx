import React, { useState } from 'react';
import { Plus, Trash2, Eye, Code, Zap, ChevronDown, Loader2 } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { WebFormTemplate, FormField } from '../types';
import { PREDEFINED_TEMPLATES, TEMPLATE_OPTIONS } from '../services/webFormTemplates';

const genId = () => `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

interface FormBuilderProps {
  template: WebFormTemplate;
  onChange: (template: WebFormTemplate) => void;
  entityFields?: string[];
}

const FIELD_TYPES = [
  { id: 'text', label: 'Short Text' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'number', label: 'Number' },
  { id: 'textarea', label: 'Long Text' },
  { id: 'select', label: 'Dropdown' },
  { id: 'checkbox', label: 'Checkbox' },
];

export const FormBuilder: React.FC<FormBuilderProps> = ({ template, onChange, entityFields = [] }) => {
  const [tab, setTab] = useState<'template' | 'fields' | 'html' | 'preview'>('template');
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [htmlInput, setHtmlInput] = useState('');
  const [parsing, setParsing] = useState(false);

  const addField = () => {
    const newField: FormField = {
      id: genId(),
      name: `field_${template.fields.length + 1}`,
      label: 'New Field',
      type: 'text',
      required: true,
    };
    onChange({ ...template, fields: [...template.fields, newField] });
    setEditingField(newField);
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    onChange({
      ...template,
      fields: template.fields.map(f => f.id === id ? { ...f, ...updates } : f),
    });
  };

  const deleteField = (id: string) => {
    onChange({ ...template, fields: template.fields.filter(f => f.id !== id) });
    if (editingField?.id === id) setEditingField(null);
  };

  const loadTemplate = (templateId: string) => {
    const t = PREDEFINED_TEMPLATES[templateId];
    if (t) onChange({ ...t });
  };

  const parseHtml = async () => {
    if (!htmlInput.trim()) return;
    setParsing(true);
    try {
      // Extract form fields from HTML (basic extraction + AI would enhance this)
      const formFieldPattern = /<input[^>]*name=["']([^"']+)["'][^>]*(?:type=["']([^"']+)["'])?[^>]*(?:placeholder=["']([^"']+)["'])?/gi;
      const fields: FormField[] = [];
      let match;

      while ((match = formFieldPattern.exec(htmlInput)) !== null) {
        const [, name, type = 'text', placeholder] = match;
        fields.push({
          id: genId(),
          name: name.toLowerCase().replace(/\s+/g, '_'),
          label: name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          type: type as FormField['type'],
          placeholder,
          required: htmlInput.includes(`required`) && htmlInput.indexOf(name) < htmlInput.lastIndexOf('required'),
        });
      }

      if (fields.length > 0) {
        onChange({
          ...template,
          fields,
          description: 'Imported from HTML',
        });
        setHtmlInput('');
        setTab('fields');
      }
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {(['template', 'fields', 'html', 'preview'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'text-ink border-b-2 border-[#2563EB]'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t === 'template' && '📋 Template'}
            {t === 'fields' && '🎨 Fields'}
            {t === 'html' && '💻 HTML'}
            {t === 'preview' && '👁️ Preview'}
          </button>
        ))}
      </div>

      {/* Template Tab */}
      {tab === 'template' && (
        <Card title="Choose a Template (Easy Start)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Predefined Templates</label>
              <select
                onChange={(e) => loadTemplate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select a template...</option>
                {TEMPLATE_OPTIONS.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">{TEMPLATE_OPTIONS.find(t => t.id === template.id)?.description}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Form Title</label>
              <input
                type="text"
                value={template.title}
                onChange={(e) => onChange({ ...template, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Lead Capture Form"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={template.description || ''}
              onChange={(e) => onChange({ ...template, description: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Brief description shown on the form"
              rows={2}
            />
          </div>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">💡 Tip: Load a template above, then customize fields in the Fields tab.</p>
          </div>
        </Card>
      )}

      {/* Fields Tab */}
      {tab === 'fields' && (
        <div className="space-y-4">
          <Card title={`Form Fields (${template.fields.length})`}>
            <div className="space-y-3">
              {template.fields.length === 0 ? (
                <p className="text-sm text-gray-500">No fields yet. Click "Add Field" to start.</p>
              ) : (
                template.fields.map(field => (
                  <div key={field.id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{field.label}</p>
                      <p className="text-xs text-gray-500">Type: {field.type} {field.mapTo && `→ ${field.mapTo}`}</p>
                    </div>
                    <button
                      onClick={() => setEditingField(field)}
                      className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteField(field.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={addField} className="mt-4">
              Add Field
            </Button>
          </Card>

          {/* Field Editor */}
          {editingField && (
            <Card title="Edit Field" className="border-2 border-[#2563EB]">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Field Name (internal)</label>
                    <input
                      type="text"
                      value={editingField.name}
                      onChange={(e) => updateField(editingField.id, { name: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Label (shown to user)</label>
                    <input
                      type="text"
                      value={editingField.label}
                      onChange={(e) => updateField(editingField.id, { label: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Field Type</label>
                    <select
                      value={editingField.type}
                      onChange={(e) => updateField(editingField.id, { type: e.target.value as FormField['type'] })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      {FIELD_TYPES.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Map to Entity Field</label>
                    <select
                      value={editingField.mapTo || ''}
                      onChange={(e) => updateField(editingField.id, { mapTo: e.target.value || undefined })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">-- Select field --</option>
                      {entityFields.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Placeholder Text</label>
                  <input
                    type="text"
                    value={editingField.placeholder || ''}
                    onChange={(e) => updateField(editingField.id, { placeholder: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingField.required || false}
                    onChange={(e) => updateField(editingField.id, { required: e.target.checked })}
                  />
                  <span className="text-sm font-medium">Required field</span>
                </label>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* HTML Tab */}
      {tab === 'html' && (
        <Card title="Import HTML (Premium)">
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Paste HTML and we'll extract form fields automatically.</p>
            <textarea
              value={htmlInput}
              onChange={(e) => setHtmlInput(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="<input name='firstName' type='text' placeholder='First Name' />"
              rows={8}
            />
            <Button
              onClick={parseHtml}
              disabled={parsing || !htmlInput.trim()}
              icon={parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            >
              {parsing ? 'Extracting Fields...' : 'Extract Fields from HTML'}
            </Button>
          </div>
        </Card>
      )}

      {/* Preview Tab */}
      {tab === 'preview' && (
        <Card title="Form Preview">
          <div className="max-w-md mx-auto p-6 rounded-lg border border-gray-200">
            <h2 className="font-bold text-lg text-gray-900 mb-2">{template.title}</h2>
            <p className="text-sm text-gray-600 mb-6">{template.description}</p>
            <form className="space-y-4">
              {template.fields.map(field => (
                <div key={field.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      placeholder={field.placeholder}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      rows={3}
                      disabled
                    />
                  ) : field.type === 'select' ? (
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" disabled>
                      <option>{field.placeholder || 'Select...'}</option>
                    </select>
                  ) : field.type === 'checkbox' ? (
                    <input type="checkbox" className="h-4 w-4" disabled />
                  ) : (
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      disabled
                    />
                  )}
                </div>
              ))}
              <button
                type="button"
                className="w-full py-2 rounded-lg font-medium text-white"
                style={{ backgroundColor: template.theme?.buttonColor || '#2563EB' }}
                disabled
              >
                {template.theme?.buttonText || 'Submit'}
              </button>
            </form>
            <p className="text-center text-sm text-gray-500 mt-4">{template.successMessage}</p>
          </div>
        </Card>
      )}
    </div>
  );
};
