import { useEffect, useState } from 'react';
import { getSetting, saveSetting } from '../../stores/portfolioStore';

/**
 * User + PIN management. Lets households add or remove users at any time
 * after onboarding, set/change/remove PINs, etc.
 *
 * Storage:
 *   - `auth_users` setting = { name: pin } map. When non-empty, the lock
 *     screen fires on launch. When empty (or user has no PIN), they get
 *     auto-logged in if they're the only user.
 */
export default function UserManagementPanel() {
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserUsePin, setNewUserUsePin] = useState(false);
  const [error, setError] = useState('');
  const [editingPinFor, setEditingPinFor] = useState<string | null>(null);
  const [editPinValue, setEditPinValue] = useState('');

  useEffect(() => {
    (async () => {
      const stored = await getSetting<Record<string, string>>('auth_users');
      setUsers(stored || {});
      setLoaded(true);
    })();
  }, []);

  const persist = async (next: Record<string, string>) => {
    setUsers(next);
    await saveSetting('auth_users', next);
  };

  const addUser = async () => {
    setError('');
    const name = newUserName.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    if (users[name]) {
      setError(`User "${name}" already exists.`);
      return;
    }
    if (newUserUsePin) {
      if (!/^\d{4}$/.test(newUserPin)) {
        setError('PIN must be exactly 4 digits.');
        return;
      }
    }
    const next = { ...users, [name]: newUserUsePin ? newUserPin : '' };
    await persist(next);
    setNewUserName('');
    setNewUserPin('');
    setNewUserUsePin(false);
  };

  const removeUser = async (name: string) => {
    if (!window.confirm(`Remove user "${name}"? This deletes their PIN. The user's transaction tags and data are not affected.`)) return;
    const next = { ...users };
    delete next[name];
    await persist(next);
  };

  const startEditPin = (name: string) => {
    setEditingPinFor(name);
    setEditPinValue('');
    setError('');
  };

  const saveEditPin = async () => {
    if (!editingPinFor) return;
    if (editPinValue !== '' && !/^\d{4}$/.test(editPinValue)) {
      setError('PIN must be empty (no PIN) or exactly 4 digits.');
      return;
    }
    const next = { ...users, [editingPinFor]: editPinValue };
    await persist(next);
    setEditingPinFor(null);
    setEditPinValue('');
  };

  const cancelEdit = () => {
    setEditingPinFor(null);
    setEditPinValue('');
    setError('');
  };

  if (!loaded) return null;

  const userList = Object.keys(users);
  const usersWithPins = userList.filter(n => users[n]).length;

  return (
    <div className="glass-card p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="text-2xl">👥</div>
        <div className="flex-1">
          <h3 className="font-semibold text-text-primary">Users & access</h3>
          <p className="text-xs text-text-muted mt-1">
            Add anyone in your household who'll use Iris. PIN protection is optional — leave blank for instant access. Each user has their own personalization.
          </p>
        </div>
        <span className="text-[10px] text-text-muted">
          {userList.length} {userList.length === 1 ? 'user' : 'users'} · {usersWithPins} with PIN
        </span>
      </div>

      {/* Existing users */}
      {userList.length > 0 && (
        <div className="space-y-2 mb-4">
          {userList.map(name => (
            <div key={name} className="bg-surface-2 rounded-lg p-3 border border-glass-border flex items-center gap-3">
              <span className="text-2xl">👤</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary">{name}</div>
                <div className="text-[11px] text-text-muted">
                  {users[name] ? `🔒 PIN protected` : `🔓 No PIN`}
                </div>
              </div>
              {editingPinFor === name ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={editPinValue}
                    onChange={e => setEditPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="New PIN or empty"
                    className="w-28 bg-surface-3 border border-glass-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent/50 font-mono"
                    autoFocus
                  />
                  <button onClick={saveEditPin} className="px-2 py-1 rounded bg-accent hover:bg-accent-dim text-white text-[11px] font-semibold">Save</button>
                  <button onClick={cancelEdit} className="px-2 py-1 rounded bg-surface-3 hover:bg-surface-2 text-text-muted text-[11px]">×</button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => startEditPin(name)}
                    className="px-2.5 py-1 rounded-md bg-surface-3 hover:bg-accent/20 hover:text-accent-light text-text-secondary text-[11px] font-semibold transition-colors"
                  >
                    {users[name] ? 'Change PIN' : 'Set PIN'}
                  </button>
                  <button
                    onClick={() => removeUser(name)}
                    className="px-2.5 py-1 rounded-md bg-surface-3 hover:bg-negative/15 hover:text-negative text-text-muted text-[11px] font-semibold transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add user */}
      <div className="bg-surface-2/50 rounded-xl p-4 border border-dashed border-glass-border">
        <div className="text-xs font-semibold text-text-secondary mb-2">+ Add a new user</div>
        <input
          type="text"
          value={newUserName}
          onChange={e => setNewUserName(e.target.value)}
          placeholder="First name"
          className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 mb-2"
        />
        <label className="flex items-center gap-2 cursor-pointer text-xs mb-2">
          <input
            type="checkbox"
            checked={newUserUsePin}
            onChange={e => setNewUserUsePin(e.target.checked)}
            className="rounded border-glass-border bg-surface-3 text-accent w-3.5 h-3.5"
          />
          <span className={newUserUsePin ? 'text-text-primary' : 'text-text-muted'}>Protect with a 4-digit PIN</span>
        </label>
        {newUserUsePin && (
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={newUserPin}
            onChange={e => setNewUserPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
            className="w-32 bg-surface-3 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 font-mono tracking-widest mb-2"
          />
        )}
        <button
          onClick={addUser}
          disabled={!newUserName.trim()}
          className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add user
        </button>
      </div>

      {error && (
        <div className="mt-3 text-[11px] text-negative p-2.5 rounded-lg bg-negative/10 border border-negative/20">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
