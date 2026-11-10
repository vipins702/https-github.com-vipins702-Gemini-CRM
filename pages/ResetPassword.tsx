import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { AuthLayout, AuthError, authHeading, authDisplay, authInput, authButton, authLink, authLabel } from '../components/AuthLayout';

/** Opened from the reset e-mail: /reset-password?token=... */
export const ResetPassword: React.FC = () => {
  // Read once: the address bar is cleaned below, so later renders would no longer find it.
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [state, setState] = useState<'checking' | 'invalid' | 'form' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Keep the token out of the address bar and browser history once it has been read.
    window.history.replaceState(null, '', '/reset-password');
    if (!token) { setState('invalid'); return; }
    api.checkResetToken(token).then(ok => setState(ok ? 'form' : 'invalid')).catch(() => setState('form'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) { setError('Use at least 8 characters, with a letter and a number.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setSaving(true);
    try {
      await api.resetPassword(token, password);
      setState('done');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The password could not be changed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout>
      {state === 'checking' && <p className="text-[#5f6d7b] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking your link</p>}

      {state === 'invalid' && (
        <div>
          <h2 className={authHeading} style={authDisplay}>This link has expired</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#5f6d7b]">Reset links work once and for 30 minutes. Ask for a new one from the sign-in page.</p>
          <a href="/login" className={`mt-8 ${authButton}`}>Go to sign in</a>
        </div>
      )}

      {state === 'form' && (
        <>
          <h2 className={authHeading} style={authDisplay}>Choose a new password</h2>
          <p className="mt-2 text-[15px] text-[#5f6d7b]">At least 8 characters, with a letter and a number. You will be signed out on other devices.</p>
          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            <div>
              <label htmlFor="reset-new" className={authLabel}>New password</label>
              <input id="reset-new" type="password" autoComplete="new-password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} className={authInput} />
            </div>
            <div>
              <label htmlFor="reset-confirm" className={authLabel}>Repeat new password</label>
              <input id="reset-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} className={authInput} />
            </div>
            {error && <AuthError message={error} />}
            <button type="submit" disabled={saving} className={authButton}>
              {saving && <Loader2 className="w-5 h-5 animate-spin" />} Save new password
            </button>
          </form>
        </>
      )}

      {state === 'done' && (
        <div role="status">
          <h2 className={authHeading} style={authDisplay}>Password saved</h2>
          <p className="mt-3 text-[15px] text-[#5f6d7b]">Sign in with your new password.</p>
          <a href="/login" className={`mt-8 ${authButton}`}>Sign in</a>
          <p className="mt-6 text-sm text-[#5f6d7b]">Did not ask for this? <a className={authLink} href="/login">Sign in</a> and change your password from Settings.</p>
        </div>
      )}
    </AuthLayout>
  );
};
