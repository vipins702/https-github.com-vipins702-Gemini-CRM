
import React, { useState } from 'react';
import { Hexagon, Lock, Mail, ArrowRight, Loader2, Eye, EyeOff, ShieldCheck, Zap, Workflow } from 'lucide-react';
import { api } from '../services/api';
import { AuthSession } from '../types';

interface LoginProps {
   onLogin: (session: AuthSession) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
   const [email, setEmail] = useState('admin@flowcrm.com');
   const [password, setPassword] = useState('Admin@123');
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
         setError('Invalid credentials. Try admin@flowcrm.com / Admin@123');
         setShake(true);
         setTimeout(() => setShake(false), 500);
      } finally {
         setLoading(false);
      }
   };

   const inputCls = "w-full h-12 pl-11 pr-4 text-[15px] border border-[#dbe3ef] rounded-xl outline-none transition-colors bg-white/90 placeholder:text-ink-muted/70 focus:border-[#4F46E5] focus-ring";

   return (
      <div className="min-h-dvh flex items-center justify-center font-sans p-5 sm:p-8 relative overflow-hidden bg-hero">
         {/* Centered showcase glass panel */}
         <div className={`relative z-10 w-full max-w-4xl glass-hero panel-rise grid lg:grid-cols-2 overflow-hidden ${shake ? 'animate-shake' : ''}`}>
            {/* Left — brand / value prop */}
            <div className="hidden lg:flex flex-col justify-between p-10 xl:p-12 bg-white/20 border-r border-white/40">
               <div className="flex items-center gap-2.5">
                  <div className="tri-ring-sq w-10 h-10">
                     <div className="flex items-center justify-center"><Hexagon className="w-5 h-5 text-[#4F46E5]" strokeWidth={2.4} /></div>
                  </div>
                  <span className="font-heading text-xl font-extrabold tracking-tight gradient-text">FlowCRM</span>
               </div>

               <div className="max-w-md">
                  <h1 className="font-heading text-4xl font-extrabold tracking-tight leading-[1.08] text-ink">
                     The CRM that <span className="gradient-text">runs itself</span>.
                  </h1>
                  <p className="text-[15px] text-ink-soft leading-relaxed mt-5">
                     Custom layouts, automated journeys, and a unified customer view — all on one metadata-driven platform.
                  </p>
                  <ul className="mt-8 space-y-3">
                     {[
                        { icon: Workflow, text: 'Visual workflow automation', tint: 'text-[#4F46E5] bg-[#4F46E5]/10' },
                        { icon: Zap, text: 'AI lead capture & routing', tint: 'text-[#D97706] bg-[#D97706]/10' },
                        { icon: ShieldCheck, text: 'Role-based access & audit trail', tint: 'text-[#0D9488] bg-[#0D9488]/10' },
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

               <div className="flex gap-8 border-t border-white/50 pt-6">
                  <div><div className="font-heading text-2xl font-extrabold text-ink tnum">10x</div><p className="mono-label !text-[10px] mt-0.5">Faster setup</p></div>
                  <div><div className="font-heading text-2xl font-extrabold text-ink tnum">100%</div><p className="mono-label !text-[10px] mt-0.5">Configurable</p></div>
                  <div><div className="font-heading text-2xl font-extrabold text-ink tnum">SOC 2</div><p className="mono-label !text-[10px] mt-0.5">Ready</p></div>
               </div>
            </div>

            {/* Right — form */}
            <div className="p-8 sm:p-10 xl:p-12 bg-white/55">
               <div className="lg:hidden flex items-center gap-2.5 mb-8">
                  <div className="tri-ring-sq w-9 h-9"><div className="flex items-center justify-center"><Hexagon className="w-[18px] h-[18px] text-[#4F46E5]" strokeWidth={2.4} /></div></div>
                  <span className="font-heading text-lg font-extrabold tracking-tight gradient-text">FlowCRM</span>
               </div>

               <div className="mb-8">
                  <h2 className="font-heading text-2xl font-extrabold tracking-tight text-ink">Welcome back</h2>
                  <p className="text-ink-muted mt-1.5 text-sm">Sign in to your workspace to continue.</p>
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
                        <a href="#" className="text-sm text-[#4F46E5] hover:text-[#3730A3] font-semibold">Forgot?</a>
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
                     <input type="checkbox" id="remember" className="rounded border-slate-300 text-[#4F46E5] focus:ring-[#4F46E5] w-4 h-4" />
                     Keep me signed in
                  </label>

                  {error && (
                     <div role="alert" aria-live="assertive" className="p-3 bg-rose-50 text-rose-700 text-sm rounded-xl flex items-start gap-2.5 border border-rose-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5"></span>
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
                  Don't have an account? <a href="#" className="text-[#4F46E5] font-semibold hover:underline">Create a workspace</a>
               </p>

               <div className="mt-8 pt-6 border-t border-white/50">
                  <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
                     <span className="mono-label !text-[10px]">Demo</span>
                     <button onClick={() => { setEmail('admin@flowcrm.com'); setPassword('Admin@123'); }} className="font-medium text-ink-soft hover:text-[#4F46E5] transition-colors">admin@flowcrm.com</button>
                     <span className="text-slate-300">·</span>
                     <button onClick={() => { setEmail('sarah@flowcrm.com'); setPassword('Admin@123'); }} className="font-medium text-ink-soft hover:text-[#4F46E5] transition-colors">sarah@flowcrm.com</button>
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
};
