
import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Hexagon, Lock, Mail, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { AuthSession } from '../types';

interface LoginProps {
  onLogin: (session: AuthSession) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('admin@flowcrm.com');
  const [password, setPassword] = useState('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
       // Mock password check
       const session = await api.login(email);
       onLogin(session);
    } catch (err) {
       setError('Invalid credentials. Try admin@flowcrm.com');
    } finally {
       setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left Panel - Visuals */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative overflow-hidden items-center justify-center">
         <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/90 to-slate-900/90 z-10"></div>
         {/* Abstract Shapes */}
         <div className="absolute top-[-20%] left-[-20%] w-[800px] h-[800px] rounded-full bg-indigo-500/20 blur-3xl z-0 animate-pulse"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-blue-500/20 blur-3xl z-0"></div>

         <div className="relative z-20 text-white max-w-lg p-12">
            <div className="w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center mb-8 shadow-xl shadow-indigo-500/30">
               <Hexagon className="w-10 h-10 text-white fill-indigo-500" />
            </div>
            <h1 className="text-5xl font-bold mb-6 tracking-tight leading-tight">Automate your <br/> <span className="text-indigo-400">entire business</span></h1>
            <p className="text-lg text-slate-300 leading-relaxed mb-8">
               Build custom CRM layouts, design automated journeys, and manage everything from a single metadata-driven platform.
            </p>
            
            <div className="grid grid-cols-2 gap-6 border-t border-white/10 pt-8">
               <div>
                  <h4 className="text-2xl font-bold">10x</h4>
                  <p className="text-slate-400 text-sm">Faster Development</p>
               </div>
               <div>
                  <h4 className="text-2xl font-bold">100%</h4>
                  <p className="text-slate-400 text-sm">Configurable</p>
               </div>
            </div>
         </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
         <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
            <div className="text-center mb-10">
               <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
               <p className="text-gray-500 mt-2">Sign in to your account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
               <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Email Address</label>
                  <div className="relative">
                     <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5"/>
                     <input 
                       type="email" 
                       required
                       value={email}
                       onChange={(e) => setEmail(e.target.value)}
                       className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                       placeholder="you@company.com"
                     />
                  </div>
               </div>

               <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Password</label>
                  <div className="relative">
                     <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5"/>
                     <input 
                       type="password" 
                       required
                       value={password}
                       onChange={(e) => setPassword(e.target.value)}
                       className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                       placeholder="••••••••"
                     />
                  </div>
               </div>

               <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center">
                     <input type="checkbox" id="remember" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"/>
                     <label htmlFor="remember" className="ml-2 text-gray-600">Remember me</label>
                  </div>
                  <a href="#" className="text-indigo-600 hover:text-indigo-700 font-medium">Forgot password?</a>
               </div>

               {error && (
                  <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-red-600"></div>
                     {error}
                  </div>
               )}

               <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
               >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : <>Sign In <ArrowRight className="w-5 h-5"/></>}
               </button>
            </form>

            <div className="mt-8 text-center text-sm text-gray-500">
               Don't have an account? <a href="#" className="text-indigo-600 font-medium hover:underline">Create a workspace</a>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100">
               <div className="flex justify-center gap-4 text-xs text-gray-400">
                  <span>Demo Accounts:</span>
                  <button onClick={() => setEmail('admin@flowcrm.com')} className="hover:text-indigo-600">admin@flowcrm.com</button>
                  <button onClick={() => setEmail('sarah@flowcrm.com')} className="hover:text-indigo-600">sarah@flowcrm.com</button>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};
