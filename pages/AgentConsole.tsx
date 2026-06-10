import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { ViewState } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import {
  Phone, PhoneIncoming, Search, User, Building, Mail, Loader2, UserCheck,
  Sparkles, ArrowRight, PhoneCall, History, CheckCircle2, Briefcase, Target,
} from 'lucide-react';

interface AgentConsoleProps {
  onNavigate?: (view: ViewState, params?: any) => void;
}

type Match = { match: string | null; entityType?: string; recordId?: string; name?: string; status?: string; data?: any };

export const AgentConsole: React.FC<AgentConsoleProps> = ({ onNavigate }) => {
  const { addToast } = useToast();
  const [phone, setPhone] = useState('');
  const [looking, setLooking] = useState(false);
  const [match, setMatch] = useState<Match | null>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('Interested');
  const [logging, setLogging] = useState(false);
  const [converting, setConverting] = useState(false);
  const [upsell, setUpsell] = useState<{ product: string; reason: string; source: string } | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeResult, setRouteResult] = useState<any>(null);
  const pollRef = useRef<any>(null);

  const loadCalls = async () => {
    try { setCalls(await api.getRecentCalls()); } catch { /* ignore */ }
  };

  useEffect(() => {
    loadCalls();
    pollRef.current = setInterval(loadCalls, 5000); // poll for inbound calls
    return () => clearInterval(pollRef.current);
  }, []);

  const doLookup = async (num?: string) => {
    const q = (num ?? phone).trim();
    if (!q) { addToast('Enter a phone number', 'error'); return; }
    setPhone(q);
    setLooking(true);
    setUpsell(null);
    try {
      const res = await api.ctiLookup(q);
      setMatch(res);
      if (!res.match) addToast('No match — new caller', 'info');
    } catch (e: any) {
      addToast(e.message || 'Lookup failed', 'error');
    } finally {
      setLooking(false);
    }
  };

  const simulateCall = async () => {
    const q = phone.trim();
    if (!q) { addToast('Enter a phone number', 'error'); return; }
    setLooking(true); setUpsell(null); setRouteResult(null);
    try {
      const res = await api.simulateIncomingCall(q);
      await loadCalls();
      if (res.recordId) {
        const m = await api.ctiLookup(q);
        setMatch(m);
        addToast(res.isNew ? `New caller → lead created: ${res.name}` : `Caller identified: ${res.name}`, res.isNew ? 'success' : 'info');
      } else {
        setMatch({ match: null });
      }
    } catch (e: any) {
      addToast(e.message || 'Call failed', 'error');
    } finally {
      setLooking(false);
    }
  };

  const handleRoute = async (manualIntent?: 'support' | 'sales') => {
    if (!match?.recordId) return;
    setRouting(true);
    try {
      const res = await api.routeInbound({ recordId: match.recordId, entityType: match.entityType, name: match.name, text: notes, manualIntent });
      setRouteResult(res);
      addToast(`${res.created === 'case' ? 'Support Case' : 'Opportunity'} created: ${res.title}`, 'success');
      await loadCalls();
    } catch (e: any) {
      addToast(e.message || 'Routing failed', 'error');
    } finally {
      setRouting(false);
    }
  };

  const handleLogCall = async () => {
    setLogging(true);
    try {
      await api.logCall({
        from: phone, direction: 'inbound', status: 'completed', outcome, notes,
        entityType: match?.entityType, recordId: match?.recordId, name: match?.name,
      });
      addToast('Call logged', 'success');
      setNotes('');
      await loadCalls();
    } catch (e: any) {
      addToast(e.message || 'Failed to log call', 'error');
    } finally {
      setLogging(false);
    }
  };

  const handleConvert = async () => {
    if (!match?.recordId) return;
    setConverting(true);
    try {
      const res = await api.convertLead(match.recordId);
      if (res.alreadyConverted) {
        addToast('Lead already converted', 'info');
      } else {
        setUpsell(res.upsell || null);
        addToast(`Converted to customer: ${res.customerName}`, 'success');
        // refresh the match to reflect the new customer
        await doLookup(phone);
      }
    } catch (e: any) {
      addToast(e.message || 'Conversion failed', 'error');
    } finally {
      setConverting(false);
    }
  };

  const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
  const d = match?.data || {};

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/30"><PhoneCall className="w-6 h-6 text-white" /></div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Agent Console</h1>
          <p className="text-sm text-slate-500">Incoming call → caller identified → log → convert lead → AI upsell.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: incoming calls + lookup */}
        <div className="space-y-6">
          <Card title="Identify Caller">
            <input className={inputCls} placeholder="Phone number…" value={phone}
              onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doLookup()} />
            <div className="flex gap-2 mt-2">
              <Button variant="secondary" className="flex-1 justify-center" icon={<Search className="w-4 h-4" />} onClick={() => doLookup()} disabled={looking}>Look up</Button>
              <Button className="flex-1 justify-center" icon={looking ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneIncoming className="w-4 h-4" />} onClick={simulateCall} disabled={looking}>Simulate Call</Button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2"><strong>Simulate Call</strong> = an inbound call: unknown number auto-creates a lead. A real call from Exotel hits <code>/api/cti/incoming</code> and does the same.</p>
          </Card>

          <Card title="Recent Calls" action={<History className="w-4 h-4 text-slate-400" />}>
            {calls.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No calls yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto -mx-2">
                {calls.map((c) => (
                  <button key={c.id} onClick={() => doLookup(c.from_number)} className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-slate-50 text-left transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${c.matched_id ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      <PhoneIncoming className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 truncate">{c.matched_name || c.from_number || 'Unknown'}</div>
                      <div className="text-[11px] text-slate-400">{c.from_number} · {c.outcome || c.status}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: screen-pop */}
        <div className="lg:col-span-2">
          {!match ? (
            <Card>
              <div className="py-20 text-center text-slate-400">
                <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Enter or click a number to identify the caller.</p>
              </div>
            </Card>
          ) : match.match ? (
            <Card>
              {/* Matched header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-xl font-semibold shrink-0">
                    {(match.name || '?')[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold text-slate-900">{match.name}</h2>
                      <Badge status={match.match === 'customer' ? 'Customer' : 'Lead'} />
                      {match.status && <Badge status={match.status} />}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">Identified by phone {phone}</p>
                  </div>
                </div>
                {match.entityType === 'customer' && onNavigate && (
                  <Button variant="secondary" icon={<ArrowRight className="w-4 h-4" />} onClick={() => onNavigate('customer-360', { customerId: match.recordId })}>
                    Open 360
                  </Button>
                )}
              </div>

              {/* Key info */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                {[
                  { icon: <Mail className="w-4 h-4" />, label: 'Email', value: d.email },
                  { icon: <Phone className="w-4 h-4" />, label: 'Phone', value: d.phone || d.mobile },
                  { icon: <Building className="w-4 h-4" />, label: 'Company', value: d.company },
                  { icon: <User className="w-4 h-4" />, label: 'Owner', value: d.accountManager || d.assignedto || '—' },
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-slate-400 ring-1 ring-slate-100">{f.icon}</div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{f.label}</div>
                      <div className="text-sm font-medium text-slate-700 truncate">{f.value || '—'}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* What did the caller want? → route to Case (support) or Opportunity (sales) */}
              <div className="mt-6 pt-5 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">What did the caller want?</label>
                <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. 'My internet plan keeps disconnecting' (support)  or  'Interested in your premium insurance plan' (sales)" />
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button size="sm" icon={routing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} onClick={() => handleRoute()} disabled={routing}>AI Route</Button>
                  <Button size="sm" variant="secondary" icon={<Briefcase className="w-4 h-4" />} onClick={() => handleRoute('support')} disabled={routing}>Support Case</Button>
                  <Button size="sm" variant="secondary" icon={<Target className="w-4 h-4" />} onClick={() => handleRoute('sales')} disabled={routing}>New Opportunity</Button>
                </div>
                {routeResult && (
                  <div className={`mt-3 p-3 rounded-xl ring-1 ring-inset ${routeResult.created === 'case' ? 'bg-orange-50 ring-orange-100' : 'bg-emerald-50 ring-emerald-100'}`}>
                    <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      {routeResult.created === 'case' ? <Briefcase className="w-4 h-4 text-orange-600" /> : <Target className="w-4 h-4 text-emerald-600" />}
                      {routeResult.created === 'case' ? 'Support Case' : 'New Opportunity'} created: {routeResult.title}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {routeResult.intent?.reason}
                      {routeResult.intent?.source === 'gemini' && <span className="text-indigo-600 font-semibold"> · Gemini</span>}
                      {routeResult.intent?.product && <> · Product: {routeResult.intent.product}</>}
                    </p>
                  </div>
                )}
              </div>

              {/* Convert (leads only) */}
              {match.match === 'lead' && (
                <div className="mt-5 p-4 rounded-xl bg-indigo-50/60 ring-1 ring-inset ring-indigo-100 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-2"><UserCheck className="w-4 h-4 text-indigo-600" /> Qualify this lead?</div>
                    <p className="text-xs text-slate-500 mt-0.5">Convert to a customer and get an AI upsell recommendation.</p>
                  </div>
                  <Button icon={converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} onClick={handleConvert} disabled={converting}>
                    Convert to Customer
                  </Button>
                </div>
              )}

              {/* AI upsell result */}
              {upsell && (
                <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-indigo-950 to-slate-900 text-white">
                  <div className="flex items-center gap-2 text-indigo-300 text-[10px] font-semibold uppercase tracking-widest mb-2">
                    <Sparkles className="w-3.5 h-3.5" /> AI Upsell {upsell.source === 'gemini' && <span className="bg-indigo-500/30 px-1.5 rounded">Gemini</span>}
                  </div>
                  <div className="font-semibold text-lg">{upsell.product}</div>
                  <p className="text-slate-300 text-xs mt-1">{upsell.reason}</p>
                  <p className="text-emerald-300 text-xs mt-2 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Follow-up task created on the new customer.</p>
                </div>
              )}

              {/* Log call outcome (uses the notes above) */}
              <div className="mt-6 pt-5 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Log this call</div>
                <div className="flex gap-2">
                  <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                    {['Interested', 'Not Interested', 'Call Back', 'No Answer', 'Resolved'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <Button variant="secondary" onClick={handleLogCall} disabled={logging} icon={logging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}>Log Call</Button>
                </div>
              </div>
            </Card>
          ) : (
            // No match -> new caller
            <Card>
              <div className="py-10 text-center">
                <div className="inline-flex p-4 bg-amber-50 rounded-2xl mb-3"><PhoneIncoming className="w-8 h-8 text-amber-500" /></div>
                <h3 className="text-lg font-semibold text-slate-800">New caller — {phone}</h3>
                <p className="text-sm text-slate-500 mt-1 mb-5">No existing lead or customer matches this number.</p>
                <Button icon={<ArrowRight className="w-4 h-4" />} onClick={() => onNavigate && onNavigate('lead', { prefillPhone: phone })}>Create New Lead</Button>
                <div className="mt-4">
                  <Button variant="ghost" size="sm" onClick={handleLogCall} disabled={logging}>Just log the call</Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
