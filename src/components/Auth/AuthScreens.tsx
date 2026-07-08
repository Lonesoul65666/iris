import { useState } from 'react';
import { connectDatabase, setupAccounts, login, changePassword, type AuthUser } from '../../lib/authClient';

/** Minimum password length — mirrors MIN_PASSWORD_LEN on the server. */
export const MIN_PASSWORD_LEN = 10;

// The auth surfaces. Full-screen, on-brand (dark + accent).

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-surface-0 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md animate-fadeIn">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-indigo-500 flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4 shadow-xl shadow-accent/25">I</div>
          <h1 className="text-3xl font-bold gradient-text">{title}</h1>
          <p className="text-text-secondary mt-2 text-sm">{subtitle}</p>
        </div>
        <div className="glass-card p-6">{children}</div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 rounded-lg bg-surface-1 border border-glass-border text-text-primary text-sm focus:outline-none focus:border-accent/60 transition-colors';
const btnCls = 'w-full px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-wait';

/** Fresh host: enter the database connection string. */
export function ConnectScreen({ onConnected }: { onConnected: () => void }) {
  const [cs, setCs] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!cs.trim()) return;
    setBusy(true); setError('');
    const r = await connectDatabase(cs.trim());
    setBusy(false);
    if (r.ok) onConnected();
    else setError(r.message ?? 'Could not connect.');
  };

  return (
    <Shell title="Connect Iris" subtitle="Point this machine at your database to get started">
      <label className="block text-xs text-text-muted mb-1.5">Database connection string</label>
      <input className={inputCls} type="password" value={cs} placeholder="postgresql://…"
        onChange={(e) => setCs(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus />
      <p className="text-[11px] text-text-muted mt-2">Your Supabase Session Pooler URI. Everything else — budgets, your AI key, all of it — comes with it. Saved locally so you only enter it once on this machine.</p>
      {error && <p className="text-negative text-xs mt-3">{error}</p>}
      <button className={`${btnCls} mt-4`} onClick={submit} disabled={busy || !cs.trim()}>{busy ? 'Connecting…' : 'Connect'}</button>
    </Shell>
  );
}

interface AccountRow { username: string; password: string; confirm: string }

/** First run: create the login accounts (any names). */
export function SetupScreen({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<AccountRow[]>([{ username: '', password: '', confirm: '' }, { username: '', password: '', confirm: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (i: number, field: keyof AccountRow, v: string) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: v } : r)));
  const addRow = () => setRows((prev) => [...prev, { username: '', password: '', confirm: '' }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, j) => j !== i));

  const submit = async () => {
    const clean = rows.filter((r) => r.username.trim() && r.password);
    if (clean.length === 0) { setError('Add at least one name and password.'); return; }
    if (clean.some((r) => r.password.length < MIN_PASSWORD_LEN)) { setError(`Passwords must be at least ${MIN_PASSWORD_LEN} characters.`); return; }
    if (clean.some((r) => r.password !== r.confirm)) { setError("Password and confirmation don't match — check for a typo."); return; }
    setBusy(true); setError('');
    const r = await setupAccounts(clean.map((c) => ({ username: c.username.trim(), password: c.password, displayName: c.username.trim() })));
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.message ?? 'Setup failed.');
  };

  return (
    <Shell title="Set up Iris" subtitle="Create the logins for this household">
      <div className="space-y-4">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-1 space-y-2">
              <input className={inputCls} placeholder="Name (e.g. Scott)" value={row.username}
                onChange={(e) => update(i, 'username', e.target.value)} autoFocus={i === 0} />
              <input className={inputCls} type="password" placeholder={`Password (${MIN_PASSWORD_LEN}+ chars)`} value={row.password}
                onChange={(e) => update(i, 'password', e.target.value)} />
              <input className={inputCls} type="password" placeholder="Confirm password" value={row.confirm}
                onChange={(e) => update(i, 'confirm', e.target.value)} />
            </div>
            {rows.length > 1 && (
              <button onClick={() => removeRow(i)} title="Remove" className="text-text-muted hover:text-negative text-lg leading-none mt-2 px-1">×</button>
            )}
          </div>
        ))}
      </div>
      <button onClick={addRow} className="text-xs text-accent hover:text-accent-light mt-3">+ Add another person</button>
      {error && <p className="text-negative text-xs mt-3">{error}</p>}
      <button className={`${btnCls} mt-4`} onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create accounts'}</button>
    </Shell>
  );
}

/** Shared password-change form (current → new → confirm). Reused by the forced
 *  re-set screen and the voluntary Settings panel. Returns success via onDone. */
export function ChangePasswordForm({ onDone, onCancel, compact }: { onDone?: () => void; onCancel?: () => void; compact?: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!current || !next) return;
    if (next.length < MIN_PASSWORD_LEN) { setError(`New password must be at least ${MIN_PASSWORD_LEN} characters.`); return; }
    if (next !== confirm) { setError("New password and confirmation don't match — check for a typo."); return; }
    setBusy(true); setError('');
    const r = await changePassword(current, next);
    setBusy(false);
    if (r.ok) {
      setDone(true); setCurrent(''); setNext(''); setConfirm('');
      onDone?.();
    } else {
      setError(r.message ?? 'Could not change password.');
    }
  };

  return (
    <div className="space-y-3">
      <input className={inputCls} type="password" placeholder="Current password" value={current}
        onChange={(e) => { setCurrent(e.target.value); setDone(false); }} autoFocus={!compact} />
      <input className={inputCls} type="password" placeholder={`New password (${MIN_PASSWORD_LEN}+ chars)`} value={next}
        onChange={(e) => { setNext(e.target.value); setDone(false); }} />
      <input className={inputCls} type="password" placeholder="Confirm new password" value={confirm}
        onChange={(e) => { setConfirm(e.target.value); setDone(false); }}
        onKeyDown={(e) => e.key === 'Enter' && submit()} />
      {error && <p className="text-negative text-xs">{error}</p>}
      {done && <p className="text-positive text-xs">Password updated.</p>}
      <div className="flex items-center gap-2">
        <button className={btnCls} onClick={submit} disabled={busy || !current || !next}>{busy ? 'Saving…' : 'Update password'}</button>
        {onCancel && (
          <button onClick={onCancel} className="px-4 py-2.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-glass-border text-sm text-text-secondary transition-colors">Cancel</button>
        )}
      </div>
    </div>
  );
}

/** Forced full-screen re-set when a password has aged out (reuse allowed). */
export function ForcedChangePasswordScreen({ onDone }: { onDone: () => void }) {
  return (
    <Shell title="Time to refresh your password" subtitle="It's been a while — set a new one to keep going (you can reuse the same one)">
      <ChangePasswordForm onDone={onDone} />
    </Shell>
  );
}

/** Returning: log in. */
export function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!username.trim() || !password) return;
    setBusy(true); setError('');
    const r = await login(username.trim(), password);
    setBusy(false);
    if (r.ok && r.user) onAuthenticated(r.user);
    else setError(r.message ?? 'Wrong username or password.');
  };

  return (
    <Shell title="Iris" subtitle="Welcome back — log in to continue">
      <div className="space-y-3">
        <input className={inputCls} placeholder="Name" value={username} autoFocus
          onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <input className={inputCls} type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </div>
      {error && <p className="text-negative text-xs mt-3">{error}</p>}
      <button className={`${btnCls} mt-4`} onClick={submit} disabled={busy || !username.trim() || !password}>{busy ? 'Logging in…' : 'Log in'}</button>
    </Shell>
  );
}
