
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

   const inputCls = "w-full h-12 pl-11 pr-4 text-[15px] border border-slate-300 rounded-xl outline-none transition-colors bg-white placeholder:text-slate-400 focus:border-indigo-500 focus-ring";

   return (
      <div className="min-h-dvh flex bg-white font-sans">
         {/* Left Panel — brand / value prop */}
         <div className="hidden lg:flex lg:w-[46%] bg-slate-950 relative overflow-hidden flex-col justify-between p-12 xl:p-16">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-slate-950 to-slate-950"></div>
            <div className="absolute -top-24 -left-24 w-[480px] h-[480px] rounded-full bg-indigo-600/10 blur-3xl"></div>

            <div className="relative z-10 flex items-center gap-2.5">
               <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center ring-1 ring-white/10">
                  <Hexagon className="w-6 h-6 text-white" />
               </div>
               <span className="text-white text-lg font-semibold tracking-tight">FlowCRM</span>
            </div>

            <div className="relative z-10 max-w-md">
               <h1 className="text-4xl xl:text-[2.75rem] font-semibold text-white tracking-tight leading-[1.1]">
                  The CRM that <span className="text-indigo-400">runs itself</span>.
               </h1>
               <p className="text-[15px] text-slate-400 leading-relaxed mt-5">
                  Custom layouts, automated journeys, and a unified customer view — all on one metadata-driven platform.
               </p>
               <ul className="mt-8 space-y-3">
                  {[
                     { icon: Workflow, text: 'Visual workflow automation' },
                     { icon: Zap, text: 'AI lead capture & routing' },
                     { icon: ShieldCheck, text: 'Role-based access & audit trail' },
                  ].map(({ icon: Icon, text }) => (
                     <li key={text} className="flex items-center gap-3 text-slate-300 text-sm">
                        <span className="w-7 h-7 rounded-lg bg-white/5 ring-1 ring-white/10 flex items-center justify-center">
                           <Icon className="w-4 h-4 text-indigo-400" />
                        </span>
                        {text}
                     </li>
                  ))}
               </ul>
            </div>

            <div className="relative z-10 flex gap-8 border-t border-white/10 pt-6">
               <div><div className="text-2xl font-semibold text-white tnum">10x</div><p className="text-slate-500 text-xs mt-0.5">Faster setup</p></div>
               <div><div className="text-2xl font-semibold text-white tnum">100%</div><p className="text-slate-500 text-xs mt-0.5">Configurable</p></div>
               <div><div className="text-2xl font-semibold text-white tnum">SOC 2</div><p className="text-slate-500 text-xs mt-0.5">Ready</p></div>
            </div>
         </div>

         {/* Right Panel — form */}
         <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
            <div className={`w-full max-w-sm ${shake ? 'animate-shake' : ''}`}>
               <div className="lg:hidden flex items-center gap-2.5 mb-10">
                  <div className="w-9 h-9 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center">
                     <Hexagon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-slate-900 text-lg font-semibold tracking-tight">FlowCRM</span>
               </div>

               <div className="mb-8">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h2>
                  <p className="text-slate-500 mt-1.5 text-sm">Sign in to your workspace to continue.</p>
               </div>

               <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  <div className="space-y-1.5">
                     <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">Email address</label>
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
                        <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">Password</label>
                        <a href="#" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">Forgot?</a>
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

                  <label htmlFor="remember" className="flex items-center gap-2 text-sm text-slate-600 select-none cursor-pointer">
                     <input type="checkbox" id="remember" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
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
                     className="btn-primary-brand w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 shadow-[var(--elev-1)] hover:brightness-[1.07] active:scale-[0.99] transition disabled:opacity-70 disabled:cursor-not-allowed focus-ring"
                  >
                     {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign in <ArrowRight className="w-[18px] h-[18px]" /></>}
                  </button>
               </form>

               <p className="mt-8 text-center text-sm text-slate-500">
                  Don't have an account? <a href="#" className="text-indigo-600 font-semibold hover:underline">Create a workspace</a>
               </p>

               <div className="mt-8 pt-6 border-t border-slate-100">
                  <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1.5 text-xs text-slate-400">
                     <span className="font-medium">Demo:</span>
                     <button onClick={() => { setEmail('admin@flowcrm.com'); setPassword('Admin@123'); }} className="font-medium text-slate-500 hover:text-indigo-600 transition-colors">admin@flowcrm.com</button>
                     <span className="text-slate-300">·</span>
                     <button onClick={() => { setEmail('sarah@flowcrm.com'); setPassword('Admin@123'); }} className="font-medium text-slate-500 hover:text-indigo-600 transition-colors">sarah@flowcrm.com</button>
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
};
