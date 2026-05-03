import { useEffect, useState } from 'react';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import LockScreen from './components/Auth/LockScreen';
import AppShell from './components/Layout/AppShell';
import Tutorial, { useTutorialStatus } from './components/Tutorial/Tutorial';
import DashboardView from './views/DashboardView';
import PortfolioView from './views/PortfolioView';
import HealthView from './views/HealthView';
import EquityView from './views/EquityView';
import ChatView from './views/ChatView';
import IntelligenceView from './views/IntelligenceView';
import WatchlistView from './views/WatchlistView';
import SettingsView from './views/SettingsView';
import OnboardingView from './views/OnboardingView';
import FirstReportView from './views/FirstReportView';
import BudgetView from './components/Budget/BudgetView';
import { getSetting, saveSetting } from './stores/portfolioStore';
import { isDefaultPortfolio } from './components/Dashboard/SetupChecklist';
import { useEnabledModules } from './hooks/useEnabledModules';
import type { View } from './types/views';

// DEV_MODE only suppresses the tutorial overlay during local dev.
// User auth + onboarding are now driven by stored settings (`auth_users`,
// `onboarding_complete`) — no name is hardcoded anywhere in the app shell.
const DEV_MODE = true;

export type { View };

// ─── View Router ───
function AppContent() {
  const { view } = useAppData();
  switch (view) {
    case 'dashboard': return <DashboardView />;
    case 'budget': return <BudgetView />;
    case 'portfolio': return <PortfolioView />;
    case 'health': return <HealthView />;
    case 'equity': return <EquityView />;
    case 'intelligence': return <IntelligenceView />;
    case 'watchlist': return <WatchlistView />;
    case 'chat': return <ChatView />;
    case 'settings': return <SettingsView />;
    case 'onboarding': return <OnboardingView />;
    case 'first-report': return <FirstReportView />;
  }
}

// ─── Inner wrapper — rendered inside the single AppDataProvider ───
function AppInner({ loading, activeUser, setActiveUser, sidebarCollapsed, setSidebarCollapsed, showTutorialOverlay, setShowTutorialOverlay, showTutorial }: {
  loading: boolean;
  activeUser: string;
  setActiveUser: (u: string | null) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  showTutorialOverlay: boolean;
  setShowTutorialOverlay: (v: boolean) => void;
  showTutorial: boolean;
}) {
  const { view, setView, actionItems, budgetSummary, overallScore, accounts } = useAppData();
  const modules = useEnabledModules();
  const firstReportAllowed = modules.investments;

  // First-run detection: if onboarding hasn't been completed, route to wizard once loaded.
  // If onboarding IS complete but a real portfolio is loaded and the first report hasn't
  // run, route to the first report instead — but only if first-report is allowed in
  // the current module set. Phase 1 hides first-report (it's an investments-tier surface),
  // so we don't auto-route into a view the sidebar can't navigate back to.
  useEffect(() => {
    if (loading) return;
    (async () => {
      const onboarded = await getSetting('onboarding_complete');
      if (!onboarded) {
        if (view !== 'onboarding') setView('onboarding');
        return;
      }
      if (!firstReportAllowed) return;
      const reportDone = await getSetting('first_report_complete');
      const hasRealPortfolio = accounts.length > 0 && !isDefaultPortfolio(accounts);
      if (!reportDone && hasRealPortfolio && view !== 'first-report' && view !== 'onboarding') {
        setView('first-report');
      }
    })();
  }, [loading, setView, view, accounts, firstReportAllowed]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-0">
        <div className="text-accent text-xl font-semibold animate-pulse">Loading Iris...</div>
      </div>
    );
  }

  // Render onboarding and first-report full-screen without the sidebar shell
  if (view === 'onboarding' || view === 'first-report') {
    return <AppContent />;
  }

  return (
    <AppShell
      view={view}
      setView={setView}
      activeUser={activeUser}
      setActiveUser={setActiveUser}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
      actionItems={actionItems}
      budgetSummary={budgetSummary}
      overallScore={overallScore}
    >
      <AppContent />
      {/* Tutorial Overlay — suppressed when DEV_MODE is true */}
      {!DEV_MODE && showTutorialOverlay && showTutorial && activeUser && (
        <Tutorial userName={activeUser} onComplete={() => setShowTutorialOverlay(false)} />
      )}
    </AppShell>
  );
}

// ─── Root App Component ───
export default function App() {
  // Lock screen is opt-in. Fires only when ≥1 configured user has a non-empty PIN.
  // Otherwise we auto-set activeUser from prior session, profile, or first user.
  const [activeUser, setActiveUser] = useState<string | null>(null);
  const [needsLock, setNeedsLock] = useState<boolean | null>(null);
  const [showTutorialOverlay, setShowTutorialOverlay] = useState(false);
  const showTutorial = useTutorialStatus(activeUser) ?? false;
  const [view, setView] = useState<View>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const authUsers = (await getSetting<Record<string, string>>('auth_users')) || {};
      const userNames = Object.keys(authUsers);
      const anyHasPin = userNames.some(n => !!authUsers[n]);

      if (anyHasPin) {
        // PIN auth configured — wait for the lock screen.
        setNeedsLock(true);
        return;
      }

      setNeedsLock(false);
      // Pick a sensible activeUser: prior session > first configured user > profile.name > 'You'.
      const stored = await getSetting<string>('active_user');
      if (stored && (!userNames.length || userNames.includes(stored))) {
        setActiveUser(stored);
        return;
      }
      if (userNames.length) {
        setActiveUser(userNames[0]);
        return;
      }
      try {
        const m = await import('./stores/portfolioStore');
        const p = await m.getUserProfile();
        setActiveUser(p?.name?.split(' ')[0] || 'You');
      } catch {
        setActiveUser('You');
      }
    })();
  }, []);

  if (needsLock === null) {
    return <div className="flex items-center justify-center min-h-screen bg-surface-0"><div className="text-accent text-xl font-semibold animate-pulse">Loading Iris...</div></div>;
  }

  if (needsLock && !activeUser) {
    return <LockScreen onUnlock={(user) => { setActiveUser(user); saveSetting('active_user', user); setShowTutorialOverlay(true); }} />;
  }

  if (!activeUser) {
    // Should not normally hit — defensive fallback while async resolves.
    return <div className="flex items-center justify-center min-h-screen bg-surface-0"><div className="text-accent text-xl font-semibold animate-pulse">Loading Iris...</div></div>;
  }

  return (
    <AppDataProvider view={view} setView={setView} setLoading={setLoading} activeUser={activeUser}>
      <AppInner
        loading={loading}
        activeUser={activeUser}
        setActiveUser={setActiveUser}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        showTutorialOverlay={showTutorialOverlay}
        setShowTutorialOverlay={setShowTutorialOverlay}
        showTutorial={showTutorial}
      />
    </AppDataProvider>
  );
}
