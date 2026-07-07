import { useCallback, useEffect, useState } from 'react';
import { getAuthStatus, logout as apiLogout, type AuthStatus, type AuthUser } from '../../lib/authClient';
import { ConnectScreen, SetupScreen, LoginScreen } from './AuthScreens';

/**
 * Auth state machine + gate. Resolves /api/auth/status, then shows the right
 * first-run/login surface until the user is authenticated. Once authenticated,
 * renders `children(user, logout)`.
 *
 * States: not-configured → ConnectScreen · needs-setup → SetupScreen ·
 * unauthenticated → LoginScreen · authenticated → app.
 *
 * Backward compatible: if the backend reports first-run-open (accounts exist =
 * false but data is reachable), status still comes back needsSetup and we show
 * setup — so an existing install lands on "create your logins" exactly once.
 */
export default function AuthGate({ children }: { children: (user: AuthUser, logout: () => void) => React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(async () => {
    const s = await getAuthStatus();
    setStatus(s);
    if (s.authenticated && s.user) setUser(s.user);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleLogout = useCallback(() => {
    void (async () => {
      await apiLogout();
      setUser(null);
      await refresh();
    })();
  }, [refresh]);

  const Loading = (
    <div className="flex items-center justify-center min-h-screen bg-surface-0">
      <div className="text-accent text-xl font-semibold animate-pulse">Loading Iris…</div>
    </div>
  );

  if (!status) return Loading;
  if (user) return <>{children(user, handleLogout)}</>;
  if (!status.configured) return <ConnectScreen onConnected={() => void refresh()} />;
  if (status.needsSetup) return <SetupScreen onDone={() => void refresh()} />;
  return <LoginScreen onAuthenticated={(u) => setUser(u)} />;
}
