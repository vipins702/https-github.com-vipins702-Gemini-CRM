
import React, { useState } from 'react';
import { Hexagon, Lock, Mail, ArrowRight, Loader2, Eye, EyeOff, ShieldCheck, Zap, Workflow } from 'lucide-react';
import { api } from '../services/api';
import { AuthSession } from '../types';

interface LoginProps {
   onLogin: (session: AuthSession) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [showPassword, setShowPassword] = useState(false);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState('');
   const [shake, setShake] = useState(false);

   const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError('');
      try {
         const session = await api.login(email, password);
         onLogin(session);
      } catch (err) {
         setError(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.');
         setShake(true);
         setTimeout(() => setShake(false), 500);
      } finally {
         setLoading(false);
      }
   };

   const inputCls = "w-full h-12 pl-11 pr-4 text-[15px] border border-gray-200 rounded-xl outline-none transition-colors bg-surface placeholder:text-gray-400 focus:border-accent focus-ring";

   return (
      <div className="min-h-dvh flex items-center justify-center font-sans p-5 sm:p-8 relative overflow-hidden bg-hero">
         {/* Centered showcase glass panel */}
         <div className={`relative z-10 w-full max-w-4xl glass-hero panel-rise grid lg:grid-cols-2 overflow-hidden ${shake ? 'animate-shake' : ''}`}>
            {/* Left — brand / value prop */}
            <div className="hidden lg:flex flex-col justify-between p-10 xl:p-12 bg-surface/40 border-r border-gray-200/60">
               <div className="flex items-center gap-2.5">
                  <div className="tri-ring-sq w-10 h-10">
                     <div className="flex items-center justify-center"><Hexagon className="w-5 h-5 text-white" strokeWidth={2.4} /></div>
                  </div>
                  <span className="font-heading text-xl font-semibold tracking-tight text-gray-900">FlowCRM</span>
               </div>

               <div className="max-w-md">
                  <h1 className="font-heading text-[40px] font-bold tracking-tight leading-[1.08] text-ink">
                     The CRM that <span className="gradient-text">runs itself</span>.
                  </h1>
                  <p className="text-[15px] text-ink-soft leading-relaxed mt-5">
                     Custom layouts, automated journeys, and a unified customer view — all on one metadata-driven platform.
                  </p>
                  <ul className="mt-8 space-y-3">
                     {[
                        { icon: Workflow, text: 'Visual workflow automation', tint: 'text-accent bg-accent/10' },
                        { icon: Zap, text: 'AI lead capture & routing', tint: 'text-warning bg-warning/10' },
                        { icon: ShieldCheck, text: 'Role-based access & audit trail', tint: 'text-success bg-success/10' },
                     ].map(({ icon: Icon, text, tint }) => (
                        <li key={text} className="flex items-center gap-3 text-ink-soft text-sm font-medium">
                           <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tint}`}>
                              <Icon className="w-4 h-4" />
                           </span>
                           {text}
                        </li>
                     ))}
                  </ul>
               </div>

               <p className="text-sm text-gray-500">Leads, customers and conversations — in one place.</p>
            </div>

            {/* Right — form */}
            <div className="p-8 sm:p-10 xl:p-12 bg-surface/70">
               <div className="lg:hidden flex items-center gap-2.5 mb-8">
                  <div className="tri-ring-sq w-9 h-9"><div className="flex items-center justify-center"><Hexagon className="w-[18px] h-[18px] text-white" strokeWidth={2.4} /></div></div>
                  <span className="font-heading text-lg font-semibold tracking-tight text-gray-900">FlowCRM</span>
               </div>

               <div className="mb-8">
                  <h2 className="font-heading text-[28px] font-semibold tracking-tight text-ink">Welcome back</h2>
                  <p className="text-gray-500 mt-1 text-[15px]">Sign in to your workspace to continue.</p>
               </div>

               <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  <div className="space-y-1.5">
                     <label htmlFor="login-email" className="block text-sm font-medium text-ink-soft">Email address</label>
                     <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-[18px] h-[18px]" aria-hidden="true" />
                        <input
                           id="login-email" name="email" type="email" required autoComplete="email" inputMode="email"
                           value={email} onChange={(e) => setEmail(e.target.value)}
                           className={inputCls} placeholder="you@company.com"
                        />
                     </div>
                  </div>

                  <div className="space-y-1.5">
                     <div className="flex items-center justify-between">
                        <label htmlFor="login-password" className="block text-sm font-medium text-ink-soft">Password</label>
                        <a href="#" className="text-sm text-accent hover:text-accent-deep font-semibold">Forgot?</a>
                     </div>
                     <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-[18px] h-[18px]" aria-hidden="true" />
                        <input
                           id="login-password" name="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password"
                           value={password} onChange={(e) => setPassword(e.target.value)}
                           className={`${inputCls} !pr-11`} placeholder="••••••••"
                        />
                        <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}
                           className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md">
                           {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                        </button>
                     </div>
                  </div>

                  <label htmlFor="remember" className="flex items-center gap-2 text-sm text-ink-soft select-none cursor-pointer">
                     <input type="checkbox" id="remember" className="rounded border-slate-300 text-accent focus:ring-accent w-4 h-4" />
                     Keep me signed in
                  </label>

                  {error && (
                     <div role="alert" aria-live="assertive" className="p-3 bg-red-50 text-red-700 text-sm rounded-xl flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-1.5"></span>
                        <span className="font-medium">{error}</span>
                     </div>
                  )}

                  <button
                     type="submit" disabled={loading}
                     className="btn-tri-primary w-full h-12 text-[15px] font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed focus-ring"
                  >
                     {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign in <ArrowRight className="w-[18px] h-[18px]" /></>}
                  </button>
               </form>

               <p className="mt-8 text-center text-sm text-ink-muted">
                  Don't have an account? <a href="#" className="text-accent font-semibold hover:underline">Create a workspace</a>
               </p>

            </div>
         </div>
      </div>
   );
};
