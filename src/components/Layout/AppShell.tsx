import { useState } from 'react';
import { Icons } from '../ui/Icons';
import { saveSetting } from '../../stores/portfolioStore';
import type { View } from '../../types/views';
import type { ActionItem } from '../ActionItems/ActionItems';
import { useEnabledModules, visibleViews } from '../../hooks/useEnabledModules';

interface AppShellProps {
  view: View;
  setView: (v: View) => void;
  activeUser: string;
  setActiveUser: (user: string | null) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  actionItems: ActionItem[];
  budgetSummary: { surplus: number; savingsRate: number };
  overallScore: number;
  children: React.ReactNode;
}

export default function AppShell({
  view, setView, activeUser, setActiveUser, sidebarCollapsed, setSidebarCollapsed,
  actionItems, budgetSummary, overallScore, children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const modules = useEnabledModules();
  const allowed = visibleViews(modules);

  const pendingActions = actionItems.filter(a => !a.completed).length;
  const allNavItems: { id: View; label: string; icon: React.ReactNode; badge?: string; badgeColor?: string; group?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.dashboard, group: 'main' },
    { id: 'budget', label: 'Budget', icon: Icons.budget, group: 'main',
      // Action items take priority over the "Over" cue — they're tasks the user should do.
      badge: pendingActions > 0
        ? String(pendingActions)
        : (budgetSummary.surplus < 0 ? 'Over' : undefined),
      badgeColor: pendingActions > 0
        ? 'bg-warning/20 text-warning'
        : 'bg-negative/20 text-negative' },
    { id: 'portfolio', label: 'Investments', icon: Icons.portfolio, group: 'main',
      badge: overallScore < 50 ? `${overallScore}` : undefined,
      badgeColor: overallScore < 40 ? 'bg-negative/20 text-negative' : 'bg-warning/20 text-warning' },
    { id: 'health', label: 'Health Check', icon: Icons.health, group: 'main' },
    { id: 'equity', label: 'Equity', icon: Icons.equity, group: 'main' },
    { id: 'watchlist', label: 'Watchlist', icon: Icons.watchlist, group: 'ai' },
    { id: 'intelligence', label: 'Intelligence', icon: Icons.intelligence, group: 'ai' },
    { id: 'chat', label: 'Ask Iris', icon: Icons.chat, group: 'ai' },
    { id: 'settings', label: 'Settings', icon: Icons.settings, group: 'util' },
  ];
  // Hide tabs whose module is disabled. Until the modules read finishes (one
  // tick after mount), show all tabs to avoid a flicker of a stripped sidebar.
  const navItems = modules.loaded ? allNavItems.filter(n => allowed.has(n.id)) : allNavItems;

  return (
    <div className="flex w-full h-screen bg-surface-0 font-sans relative overflow-hidden">
      {/* Ambient gradient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-[200px] -left-[100px] w-[500px] h-[500px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)', animation: 'float1 20s ease-in-out infinite' }} />
        <div className="absolute -bottom-[150px] -right-[100px] w-[400px] h-[400px] rounded-full opacity-[0.025]"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)', animation: 'float2 25s ease-in-out infinite' }} />
      </div>

      {/* Mobile top bar with hamburger */}
      <div className="fixed top-0 left-0 right-0 z-40 flex md:hidden items-center h-12 px-3 bg-surface-1 border-b border-glass-border">
        <button onClick={() => setMobileMenuOpen(true)} className="p-2 -ml-1 text-text-secondary hover:text-text-primary">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div className="flex items-center gap-2 ml-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-accent to-indigo-500 flex items-center justify-center text-white font-bold text-[10px]">S</div>
          <span className="gradient-text font-bold text-base tracking-tight">Iris</span>
        </div>
      </div>

      {/* Mobile sidebar overlay backdrop */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 md:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar — hidden on mobile unless mobileMenuOpen, always visible on md+.
          On desktop the outer container is h-screen + overflow-hidden and the
          sidebar simply fills height via flex, so it naturally stays on screen
          while <main> scrolls internally. No sticky tricks needed. */}
      <aside className={`
        ${sidebarCollapsed ? 'md:w-16' : 'md:w-56'} md:flex-shrink-0
        fixed md:relative top-0 left-0 h-full w-64 z-[51] md:z-auto
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        bg-surface-1 border-r border-glass-border flex flex-col transition-all duration-200
      `}>
        <div className={`p-4 border-b border-glass-border flex items-center cursor-pointer hover:bg-white/[0.03] transition-colors ${sidebarCollapsed ? 'md:justify-center' : 'gap-3'}`}
          onClick={() => { setView(allowed.has('chat') ? 'chat' : 'dashboard'); setMobileMenuOpen(false); }}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-indigo-500 flex items-center justify-center text-white font-bold text-sm">S</div>
          {!sidebarCollapsed && <span className="gradient-text font-bold text-lg tracking-tight">Iris</span>}
          {/* Close button for mobile sidebar */}
          <button onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); }} className="ml-auto md:hidden p-1 text-text-muted hover:text-text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.filter(n => n.group === 'main').map(item => (
            <button key={item.id} onClick={() => { setView(item.id); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative ${
                view === item.id ? 'bg-accent/15 text-accent-light shadow-[0_0_12px_rgba(139,92,246,0.12)]' : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
              } ${sidebarCollapsed ? 'md:justify-center' : ''}`}>
              <span className="relative inline-flex">
                {item.icon}
                {/* Collapsed-sidebar mini-badge — small numeric pill in the corner of the icon. */}
                {sidebarCollapsed && item.badge && (
                  <span className={`hidden md:inline-flex absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 items-center justify-center rounded-full text-[9px] font-bold ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </span>
              {!sidebarCollapsed && (
                <>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.badgeColor}`}>{item.badge}</span>}
                </>
              )}
              {/* Always show labels on mobile overlay regardless of collapse state */}
              {sidebarCollapsed && (
                <span className="flex-1 text-left md:hidden">{item.label}</span>
              )}
            </button>
          ))}
          <div className="my-2 mx-3 border-t border-glass-border" />
          {navItems.filter(n => n.group === 'ai').map(item => (
            <button key={item.id} onClick={() => { setView(item.id); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                view === item.id ? 'bg-accent/15 text-accent-light' : 'text-accent/70 hover:bg-accent/10 hover:text-accent-light'
              } ${sidebarCollapsed ? 'md:justify-center' : ''}`}>
              {item.icon}
              {!sidebarCollapsed && <span>{item.label}</span>}
              {sidebarCollapsed && <span className="md:hidden">{item.label}</span>}
            </button>
          ))}
          <div className="my-2 mx-3 border-t border-glass-border" />
          {navItems.filter(n => n.group === 'util').map(item => (
            <button key={item.id} onClick={() => { setView(item.id); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                view === item.id ? 'bg-accent/15 text-accent-light' : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
              } ${sidebarCollapsed ? 'md:justify-center' : ''}`}>
              {item.icon}
              {!sidebarCollapsed && <span>{item.label}</span>}
              {sidebarCollapsed && <span className="md:hidden">{item.label}</span>}
            </button>
          ))}
        </nav>
        {!sidebarCollapsed && pendingActions > 0 && (
          <div className="mx-3 mb-2 p-2.5 rounded-lg bg-warning/10 border border-warning/20 cursor-pointer hover:bg-warning/15 transition-colors"
            onClick={() => { setView('budget'); setMobileMenuOpen(false); }}>
            <div className="text-[10px] font-bold text-warning uppercase tracking-wider">Action Items</div>
            <div className="text-xs text-text-secondary mt-0.5">{pendingActions} pending — open Budget</div>
          </div>
        )}
        {!sidebarCollapsed && activeUser && (
          <div className="mx-3 mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent to-indigo-500 flex items-center justify-center text-[10px] text-white font-bold">
                {activeUser[0]}
              </div>
              <span className="text-xs text-text-secondary">{activeUser}</span>
            </div>
            <button onClick={() => { setActiveUser(null); saveSetting('active_user', ''); }}
              className="text-[10px] text-text-muted hover:text-text-secondary">Lock</button>
          </div>
        )}
        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden md:block p-3 border-t border-glass-border text-text-muted hover:text-text-secondary text-xs">
          {sidebarCollapsed ? '>' : '< Collapse'}
        </button>
      </aside>

      {/* Main Content — `min-w-0` + `min-h-0` let the flex child actually respect
          its overflow-y-auto inside the h-screen parent (without them, flex
          items default to `min-height: auto` and grow to fit content, defeating
          internal scroll). This is what pins the sidebar visually. */}
      <main className="flex-1 w-full min-w-0 min-h-0 h-full overflow-y-auto pt-12 md:pt-0 pb-16 md:pb-0 relative z-[1]">
        <div className="w-full p-4 md:p-6 lg:px-8">
          {children}
        </div>
      </main>

      {/* Floating Ask Iris FAB — hidden on mobile (bottom nav has it). Also
          hidden when chat is not in the allowed views (Phase 1 locks it off). */}
      {view !== 'chat' && allowed.has('chat') && (
        <button onClick={() => setView('chat')}
          className="hidden md:flex fixed bottom-6 right-6 z-50 items-center gap-2 px-5 py-3 rounded-full bg-gradient-to-r from-accent to-indigo-500 text-white font-semibold shadow-lg shadow-accent/25 hover:shadow-accent/40 hover:scale-105 transition-all duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Ask Iris
        </button>
      )}

      {/* Mobile bottom navigation — filter by allowed views (Phase 1 hides
          investments / chat). When everything is allowed, the order matches
          the desktop sidebar's "main" + "ai" priority. */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden items-center justify-around h-14 bg-surface-1 border-t border-glass-border">
        {([
          { id: 'dashboard' as View, label: 'Dashboard', icon: Icons.dashboard },
          { id: 'budget' as View, label: 'Budget', icon: Icons.budget },
          { id: 'portfolio' as View, label: 'Invest', icon: Icons.portfolio },
          { id: 'chat' as View, label: 'Ask Iris', icon: Icons.chat },
          { id: 'settings' as View, label: 'Settings', icon: Icons.settings },
        ]).filter(item => !modules.loaded || allowed.has(item.id)).slice(0, 4).map(item => (
          <button key={item.id} onClick={() => setView(item.id)}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[10px] font-medium transition-colors ${
              view === item.id ? 'text-accent' : 'text-text-muted'
            }`}>
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
