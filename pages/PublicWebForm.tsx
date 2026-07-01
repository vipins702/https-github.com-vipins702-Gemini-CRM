
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { WebFormTemplate, FormField } from '../types';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

// Handles /form/campaign/:campaignId (web form submissions)
// and legacy /form/:id (old public form)
export const PublicWebForm: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<WebFormTemplate | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState('');

  useEffect(() => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    // /form/campaign/:id  →  parts = ['form', 'campaign', id]
    const id = parts[parts.length - 1];
    if (!id) { setLoading(false); return; }
    setCampaignId(id);

    api.getPublicForm(id)
      .then((data: any) => {
        if (data?.formTemplate) {
          setTemplate(data.formTemplate);
          setCampaignName(data.name || '');
        }
      })
      .catch(() => setError('Form not found or is no longer active.'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (field: FormField, val: string) => {
    setFormData(prev => ({ ...prev, [field.id]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.submitPublicForm(campaignId, formData);
      if (result.success) setSuccess(true);
      else setError(result.message || 'Submission failed.');
    } catch (err: any) {
      setError(err.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  if (error && !template) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Form Unavailable</h2>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-10 text-center animate-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {template?.successMessage ? template.successMessage : 'Thank you!'}
          </h2>
          <p className="text-slate-500 mb-8">Your response has been received. We'll be in touch shortly.</p>
          <button
            onClick={() => { setSuccess(false); setFormData({}); }}
            className="px-6 py-2.5 bg-[#2563EB] text-white rounded-lg font-medium hover:bg-[#1D4ED8] transition-colors"
          >
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-slate-500">Loading form...</div>
      </div>
    );
  }

  const btnColor = template.theme?.buttonColor || '#2563EB';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#2563EB] text-white font-black text-lg mb-4 shadow-lg">F</div>
          <h1 className="text-2xl font-extrabold text-slate-900">{template.title || campaignName}</h1>
          {template.description && <p className="text-slate-500 mt-2 text-sm">{template.description}</p>}
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200/60 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {template.fields.filter(f => !f.hidden).map(field => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {field.label}
                  {field.required && <span className="text-rose-500 ml-0.5">*</span>}
                </label>

                {field.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={formData[field.id] || ''}
                    onChange={e => handleChange(field, e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 outline-none transition-all resize-none"
                  />
                ) : field.type === 'select' ? (
                  <select
                    required={field.required}
                    value={formData[field.id] || ''}
                    onChange={e => handleChange(field, e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 outline-none transition-all bg-white appearance-none"
                  >
                    <option value="">Select an option...</option>
                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : field.type === 'checkbox' ? (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      required={field.required}
                      checked={formData[field.id] === 'true'}
                      onChange={e => handleChange(field, String(e.target.checked))}
                      className="w-4 h-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                    />
                    <span className="text-sm text-slate-600">{field.placeholder || field.label}</span>
                  </label>
                ) : (
                  <input
                    type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'number' ? 'number' : 'text'}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={formData[field.id] || ''}
                    onChange={e => handleChange(field, e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 outline-none transition-all"
                  />
                )}
              </div>
            ))}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-700 text-sm rounded-xl">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{ backgroundColor: btnColor }}
              className="w-full py-3.5 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60 shadow-md mt-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {template.theme?.buttonText || 'Submit'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">Powered by FlowCRM</p>
      </div>
    </div>
  );
};
