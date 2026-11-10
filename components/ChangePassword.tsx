import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../services/api';

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-surface text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500';

/** Same rule as the server (server/utils/passwordPolicy.js), checked here so the person sees it before sending. */
const problemWith = (pw: string): string | null => {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use at least one letter and one number.';
  return null;
};

export const ChangePasswordForm: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const problem = problemWith(next);
    if (problem) return setError(problem);
    if (next !== confirm) return setError('The two new passwords do not match.');
    if (next === current) return setError('Choose a password different from the current one.');
    setSaving(true);
    try {
      await api.changePassword(current, next);
      setDone(true);
      setCurrent(''); setNext(''); setConfirm('');
      onDone?.();
    } catch (err: any) {
      setError(err?.message || 'Could not change the password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 max-w-sm">
      <div>
        <label htmlFor="pw-current" className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
        <input id="pw-current" type="password" autoComplete="current-password" className={inputClass} value={current} onChange={e => setCurrent(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="pw-new" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
        <input id="pw-new" type="password" autoComplete="new-password" className={inputClass} value={next} onChange={e => setNext(e.target.value)} required />
        <p className="text-xs text-gray-500 mt-1">At least 8 characters, with a letter and a number.</p>
      </div>
      <div>
        <label htmlFor="pw-confirm" className="block text-sm font-medium text-gray-700 mb-1">Repeat new password</label>
        <input id="pw-confirm" type="password" autoComplete="new-password" className={inputClass} value={confirm} onChange={e => setConfirm(e.target.value)} required />
      </div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      {done && <p role="status" className="text-sm text-emerald-600">Password changed. Other devices have been signed out.</p>}
      <button type="submit" disabled={saving || !current || !next || !confirm} className="btn-tri-primary h-10 px-5 inline-flex items-center gap-2 text-sm font-semibold disabled:opacity-40">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />} Change password
      </button>
    </form>
  );
};

/** Shown instead of the app when the account is flagged "must change password" (new users, admin resets). */
export const ForcedPasswordChange: React.FC<{ email?: string; onDone: () => void; onSignOut: () => void }> = ({ email, onDone, onSignOut }) => (
  <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg,#f7f5f0)]">
    <div className="w-full max-w-md bg-surface rounded-2xl shadow-lg border border-gray-200 p-8">
      <h1 className="font-heading text-2xl font-semibold text-gray-900">Choose a new password</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">{email ? `${email}: ` : ''}your password was set by an administrator. Pick your own before continuing.</p>
      <ChangePasswordForm onDone={onDone} />
      <button onClick={onSignOut} className="mt-6 text-sm text-gray-500 underline hover:text-gray-800">Sign out</button>
    </div>
  </div>
);
