import { useEffect, useState } from 'react';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import AuthGate from './components/Auth/AuthGate';
import type { AuthUser } from './lib/authClient';
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
import AchievementsView from './views/AchievementsView';
import { getSetting } from './stores/portfolioStore';
import { isDefaultPortfolio } from './components/Dashboard/SetupChecklist';
import { useEnabledModules } from './hooks/useEnabledModules';
import type { View } from './types/views';

// User auth + onboarding are driven by stored settings (`auth_users`,
// `onboarding_complete`) — no name is hardcoded anywhere in the app shell.

export type { View };

// ─── View Router ───
function AppContent() {
  const { view } = useAppData();
  switch (view) {
    case 'dashboard': return <DashboardView />;
    case 'budget': return <BudgetView />;
    case 'achievements': return <AchievementsView />;
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
function AppInner({ loading, activeUser, onLogout, sidebarCollapsed, setSidebarCollapsed, showTutorialOverlay, setShowTutorialOverlay, showTutorial }: {
  loading: boolean;
  activeUser: string;
  onLogout: () => void;
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
      onLogout={onLogout}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
      actionItems={actionItems}
      budgetSummary={budgetSummary}
      overallScore={overallScore}
    >
      <AppContent />
      {/* Tutorial Overlay — first-run only, per user (see useTutorialStatus). */}
      {showTutorialOverlay && showTutorial && activeUser && (
        <Tutorial userName={activeUser} onComplete={() => setShowTutorialOverlay(false)} />
      )}
    </AppShell>
  );
}

// ─── Root: auth gate wraps everything ───
export default function App() {
  return (
    <AuthGate>
      {(user, logout) => <AuthedApp user={user} logout={logout} />}
    </AuthGate>
  );
}

// Rendered only once authenticated. activeUser is the logged-in account's
// display name (couples attribution, fun-money game, etc. read it). The Lock
// button now logs out for real (clears the server session), not just a picker.
function AuthedApp({ user, logout }: { user: AuthUser; logout: () => void }) {
  const [showTutorialOverlay, setShowTutorialOverlay] = useState(true);
  const showTutorial = useTutorialStatus(user.displayName) ?? false;
  const [view, setView] = useState<View>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  return (
    <AppDataProvider view={view} setView={setView} setLoading={setLoading} activeUser={user.displayName}>
      <AppInner
        loading={loading}
        activeUser={user.displayName}
        onLogout={logout}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        showTutorialOverlay={showTutorialOverlay}
        setShowTutorialOverlay={setShowTutorialOverlay}
        showTutorial={showTutorial}
      />
    </AppDataProvider>
  );
}
