import React, { useState } from 'react';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';
import { AuthSession } from '../types';
import { AuthLayout, AuthError, authHeading, authDisplay, authInput, authButton, authLink, authLabel } from '../components/AuthLayout';

interface LoginProps {
   onLogin: (session: AuthSession) => void;
}

type Mode = 'signin' | 'forgot' | 'sent';

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
   const [mode, setMode] = useState<Mode>('signin');
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [showPassword, setShowPassword] = useState(false);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState('');

   const switchTo = (m: Mode) => { setMode(m); setError(''); };

   const signIn = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || !password) { setError('Enter your e-mail and password.'); return; }
      setLoading(true);
      setError('');
      try {
         onLogin(await api.login(email.trim(), password));
      } catch (err) {
         setError(err instanceof Error && err.message ? err.message : 'Sign-in failed. Try again.');
      } finally {
         setLoading(false);
      }
   };

   const sendLink = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setError('Enter the e-mail address you sign in with.'); return; }
      setLoading(true);
      setError('');
      try {
         await api.forgotPassword(email.trim());
         setMode('sent');
      } catch (err) {
         setError(err instanceof Error && err.message ? err.message : 'The link could not be sent. Try again.');
      } finally {
         setLoading(false);
      }
   };

   return (
      <AuthLayout>
         {mode === 'signin' && (
            <>
               <h2 className={authHeading} style={authDisplay}>Sign in</h2>
               <p className="mt-2 text-[15px] text-[#5f6d7b]">Use the e-mail address your workspace invited.</p>
               <form onSubmit={signIn} className="mt-8 space-y-5" noValidate>
                  <div>
                     <label htmlFor="login-email" className={authLabel}>E-mail</label>
                     <input id="login-email" name="email" type="email" autoComplete="email" inputMode="email" required
                        value={email} onChange={e => setEmail(e.target.value)} className={authInput} placeholder="you@company.com" />
                  </div>
                  <div>
                     <div className="flex items-baseline justify-between mb-1.5">
                        <label htmlFor="login-password" className="text-sm font-semibold text-[#0d2b3e]">Password</label>
                        <button type="button" onClick={() => switchTo('forgot')} className={`text-sm ${authLink}`}>Forgot password?</button>
                     </div>
                     <div className="relative">
                        <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                           value={password} onChange={e => setPassword(e.target.value)} className={`${authInput} pr-12`} />
                        <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}
                           className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-[#5f6d7b] hover:text-[#0d2b3e]">
                           {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                        </button>
                     </div>
                  </div>
                  {error && <AuthError message={error} />}
                  <button type="submit" disabled={loading} className={authButton}>
                     {loading && <Loader2 className="w-5 h-5 animate-spin" />} Sign in
                  </button>
               </form>
               <p className="mt-10 text-sm text-[#5f6d7b]">
                  No account yet? <a href="/#demo" className={authLink}>Book a demo</a> and we will set up your workspace.
               </p>
            </>
         )}

         {mode === 'forgot' && (
            <>
               <h2 className={authHeading} style={authDisplay}>Reset your password</h2>
               <p className="mt-2 text-[15px] text-[#5f6d7b]">We will e-mail you a link to choose a new one. It works for 30 minutes.</p>
               <form onSubmit={sendLink} className="mt-8 space-y-5" noValidate>
                  <div>
                     <label htmlFor="forgot-email" className={authLabel}>E-mail</label>
                     <input id="forgot-email" type="email" autoComplete="email" inputMode="email" required autoFocus
                        value={email} onChange={e => setEmail(e.target.value)} className={authInput} placeholder="you@company.com" />
                  </div>
                  {error && <AuthError message={error} />}
                  <button type="submit" disabled={loading} className={authButton}>
                     {loading && <Loader2 className="w-5 h-5 animate-spin" />} Send reset link
                  </button>
               </form>
               <button type="button" onClick={() => switchTo('signin')} className={`mt-8 text-sm ${authLink}`}>Back to sign in</button>
            </>
         )}

         {mode === 'sent' && (
            <div role="status">
               <h2 className={authHeading} style={authDisplay}>Check your e-mail</h2>
               <p className="mt-3 text-[15px] leading-relaxed text-[#5f6d7b]">
                  If <b className="text-[#253341]">{email.trim()}</b> has an account, a reset link is on its way. Open it within 30 minutes. Nothing there? Check spam, or ask your workspace admin.
               </p>
               <button type="button" onClick={() => switchTo('signin')} className={`mt-8 ${authButton}`}>Back to sign in</button>
            </div>
         )}
      </AuthLayout>
   );
};
