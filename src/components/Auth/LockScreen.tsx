import { useEffect, useState, useRef } from 'react';
import { getSetting } from '../../stores/portfolioStore';

/**
 * Optional PIN lock screen. Reads configured users + PINs from settings
 * (`auth_users` = `{ name: pin, ... }`). When that setting is empty, the
 * parent App skips this entirely. UI for configuring the PINs is opt-in
 * (future Settings panel). No names are hardcoded.
 */

interface LockUser {
  name: string;
  emoji: string;
  color: string;
}

const DEFAULT_EMOJI_PALETTE = ['👤', '🧑', '👩', '👨‍💻', '🧑‍💼', '👩‍🎨', '🧑‍🚀'];
const DEFAULT_COLOR_PALETTE = [
  'from-accent to-indigo-500',
  'from-pink-500 to-rose-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-violet-500 to-purple-500',
];

export default function LockScreen({ onUnlock }: { onUnlock: (user: string) => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [users, setUsers] = useState<LockUser[]>([]);
  const [pins, setPins] = useState<Record<string, string>>({});
  const pinRef = useRef('');

  useEffect(() => {
    (async () => {
      const stored = await getSetting<Record<string, string>>('auth_users');
      if (!stored || Object.keys(stored).length === 0) return;
      const names = Object.keys(stored);
      setPins(stored);
      setUsers(names.map((name, i) => ({
        name,
        emoji: DEFAULT_EMOJI_PALETTE[i % DEFAULT_EMOJI_PALETTE.length],
        color: DEFAULT_COLOR_PALETTE[i % DEFAULT_COLOR_PALETTE.length],
      })));
    })();
  }, []);

  if (!selectedUser) {
    if (users.length === 0) {
      // No users configured — fail safe. Parent App should never render us in
      // this state, but if it does, signal to skip auth.
      return (
        <div className="fixed inset-0 bg-surface-0 flex items-center justify-center z-50">
          <div className="text-center">
            <p className="text-text-muted">No users configured.</p>
            <button onClick={() => onUnlock('You')} className="mt-3 text-accent hover:underline text-sm">Continue without auth</button>
          </div>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 bg-surface-0 flex items-center justify-center z-50">
        <div className="text-center space-y-8 animate-fadeIn">
          <div>
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-accent to-indigo-500 flex items-center justify-center text-white font-bold text-4xl mx-auto mb-6 shadow-xl shadow-accent/25">I</div>
            <h1 className="text-5xl font-bold gradient-text">Iris</h1>
            <p className="text-text-secondary mt-3 text-lg">Your family's financial intelligence</p>
            <p className="text-text-muted mt-2 text-sm max-w-sm mx-auto">Budget tracking, investment health, and AI-powered insights — all in one place.</p>
          </div>
          <div>
            <p className="text-text-muted text-xs uppercase tracking-widest mb-5 font-medium">Who's checking in?</p>
            <div className="flex gap-6 justify-center flex-wrap">
              {users.map(user => (
                <button key={user.name} onClick={() => setSelectedUser(user.name)}
                  className="glass-card p-8 w-44 hover:border-white/15 hover:scale-105 transition-all duration-200 group cursor-pointer">
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${user.color} flex items-center justify-center text-3xl mx-auto mb-3 group-hover:shadow-lg transition-shadow`}>
                    {user.emoji}
                  </div>
                  <div className="text-text-primary font-semibold text-lg">{user.name}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectedUserData = users.find(u => u.name === selectedUser);

  return (
    <div className="fixed inset-0 bg-surface-0 flex items-center justify-center z-50">
      <div className="text-center space-y-6 animate-fadeIn">
        <div>
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${selectedUserData?.color || 'from-accent to-indigo-500'} flex items-center justify-center text-2xl mx-auto mb-4`}>
            {selectedUserData?.emoji || '👤'}
          </div>
          <h2 className="text-xl font-bold text-text-primary">Hey, {selectedUser}</h2>
          <p className="text-text-secondary text-sm mt-1">Enter your PIN</p>
        </div>
        <div className="flex justify-center gap-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-colors ${
              i < pin.length ? 'bg-accent border-accent' : 'border-glass-border'
            }`} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 max-w-[200px] mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((key, i) => (
            key === null ? <div key={i} /> :
            <button key={i} onClick={() => {
              if (key === 'del') { pinRef.current = pinRef.current.slice(0, -1); setPin(pinRef.current); return; }
              const next = pinRef.current + key;
              pinRef.current = next;
              setPin(next);
              if (next.length === 4) {
                if (next === pins[selectedUser!]) { onUnlock(selectedUser!); }
                else { setError('Wrong PIN'); pinRef.current = ''; setPin(''); setTimeout(() => setError(''), 2000); }
              }
            }}
              className="w-14 h-14 rounded-xl bg-surface-1 border border-glass-border text-text-primary font-semibold text-lg hover:bg-white/[0.06] transition-colors flex items-center justify-center">
              {key === 'del' ? '←' : key}
            </button>
          ))}
        </div>
        {error && <p className="text-negative text-sm font-medium animate-fadeIn">{error}</p>}
        <button onClick={() => { setSelectedUser(null); setPin(''); pinRef.current = ''; }} className="text-text-muted text-xs hover:text-text-secondary">
          ← Switch user
        </button>
      </div>
    </div>
  );
}
