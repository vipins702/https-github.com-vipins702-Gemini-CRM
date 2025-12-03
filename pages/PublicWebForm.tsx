
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Campaign, EntityDefinition, LayoutDefinition, CRMRecord } from '../types';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/Button';

// Note: In a real app, this would use `useParams` from react-router
export const PublicWebForm: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leadSchema, setLeadSchema] = useState<EntityDefinition | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Extract ID from URL path since we are in a router context
    const pathParts = window.location.pathname.split('/');
    const campaignId = pathParts[pathParts.length - 1];
    
    loadForm(campaignId);
  }, []);

  const loadForm = async (campaignId: string) => {
    try {
      const campaigns = await api.getCampaigns();
      const found = campaigns.find(c => c.id === campaignId);
      const schemas = await api.getSchemas();
      
      setCampaign(found || null);
      setLeadSchema(schemas['lead']);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaign) return;
    setSubmitting(true);
    setError(null);

    try {
      await api.submitWebForm(campaign.id, formData);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600"/></div>;
  if (!campaign || !leadSchema) return <div className="min-h-screen flex items-center justify-center text-red-500">Form not found or disabled.</div>;

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center animate-in zoom-in-95">
           <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
              <CheckCircle className="w-8 h-8"/>
           </div>
           <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h2>
           <p className="text-gray-600 mb-6">Your information has been received. We will be in touch shortly.</p>
           <Button onClick={() => window.location.reload()}>Submit Another</Button>
        </div>
      </div>
    );
  }

  // Parse Template HTML to inject form
  // We look for <div id="flowcrm-web-form"></div> in the templateHtml
  const parts = campaign.templateHtml.split('<div id="flowcrm-web-form"></div>');
  const headerHtml = parts[0];
  const footerHtml = parts[1] || '';

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
       <div className="max-w-4xl mx-auto shadow-2xl min-h-screen flex flex-col md:flex-row overflow-hidden bg-white">
          
          {/* Left Side: Branding / Template Content */}
          <div className="md:w-1/2 bg-slate-900 text-white p-12 flex flex-col justify-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full bg-indigo-600/20 z-0"></div>
              <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-500/30 rounded-full blur-3xl z-0"></div>
              
              <div className="relative z-10 prose prose-invert">
                 <div dangerouslySetInnerHTML={{ __html: headerHtml }} />
              </div>
          </div>

          {/* Right Side: The Dynamic Form */}
          <div className="md:w-1/2 p-12 bg-gray-50 flex flex-col justify-center overflow-y-auto">
             <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Get in touch</h2>
                <p className="text-gray-500 text-sm">Fill out the form below.</p>
             </div>

             <form onSubmit={handleSubmit} className="space-y-5">
                {leadSchema.fields.filter(f => !f.system && f.type !== 'lookup' && f.type !== 'iframe').map(field => (
                   <div key={field.name}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                         {field.label} {field.required && <span className="text-red-500">*</span>}
                      </label>
                      {field.type === 'textarea' ? (
                         <textarea 
                           className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                           rows={3}
                           required={field.required}
                           onChange={e => setFormData({...formData, [field.name]: e.target.value})}
                         />
                      ) : field.type === 'select' || field.type === 'status' ? (
                         <select 
                           className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-white"
                           required={field.required}
                           onChange={e => setFormData({...formData, [field.name]: e.target.value})}
                         >
                            <option value="">Select...</option>
                            {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                         </select>
                      ) : (
                         <input 
                           type={field.type === 'number' || field.type === 'currency' ? 'number' : field.type === 'email' ? 'email' : 'text'}
                           className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                           required={field.required}
                           onChange={e => setFormData({...formData, [field.name]: e.target.value})}
                         />
                      )}
                   </div>
                ))}
                
                {error && (
                   <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4"/> {error}
                   </div>
                )}

                <Button className="w-full py-3" disabled={submitting}>
                   {submitting ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Submit'}
                </Button>
             </form>
             
             <div className="mt-8 text-center text-xs text-gray-400">
                Powered by FlowCRM
             </div>
          </div>
       </div>
    </div>
  );
};
