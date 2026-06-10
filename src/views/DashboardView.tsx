import { useState, useMemo, useEffect } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, Tooltip,
} from 'recharts';
import { useAppData, formatCurrency } from '../context/AppDataContext';
import { useHasRealData } from '../hooks/useHasRealData';
import { useEnabledModules } from '../hooks/useEnabledModules';
import SetupChecklist, { isDefaultPortfolio } from '../components/Dashboard/SetupChecklist';
import AccountBreakdown from '../components/Dashboard/AccountBreakdown';
import { categoryEmoji, formatRelDate } from '../utils/txDisplay';

// ─── Helpers ────────────────────────────────────────────────────────────

/** Animate a number from 0 → target over ~700ms. Adds polish to hero stats. */
function useAnimatedCounter(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

/** Time-of-day flavor for the greeting strip. */
function timeOfDayFlavor() {
  const h = new Date().getHours();
  if (h < 5)  return { greeting: 'Up late', icon: '🌙', tone: 'from-indigo-500 to-violet-500' };
  if (h < 12) return { greeting: 'Good morning', icon: '☀️', tone: 'from-amber-400 to-orange-400' };
  if (h < 17) return { greeting: 'Good afternoon', icon: '🌤️', tone: 'from-sky-400 to-cyan-400' };
  if (h < 21) return { greeting: 'Good evening', icon: '🌆', tone: 'from-rose-400 to-pink-400' };
  return                { greeting: 'Wind down', icon: '🌙', tone: 'from-indigo-500 to-violet-500' };
}

const SECTOR_COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#a855f7', '#84cc16', '#f97316'];

// ─── Main view ──────────────────────────────────────────────────────────

export default function DashboardView() {
  const {
    accounts, equity, totalLiquid, equityValue, totalNetWorth,
    allocations, overallScore,
    budgetSummary, budgetOverBudget, actionItems,
    insights,
    netWorthSnapshots,
    dashBuckets,
    rawExpenses,
    setView,
    profile,
  } = useAppData();
  const { hasPortfolio } = useHasRealData();
  const modules = useEnabledModules();

  const homeEquity = (profile?.homeValue ?? 0) - (profile?.mortgageBalance ?? 0);
  const carValue = profile?.carValue ?? 0;
  const wealthAssets = homeEquity + carValue;
  const fresh = accounts.length === 0 || isDefaultPortfolio(accounts);

  const greetingNames = (() => {
    const a = profile?.name?.split(' ')[0];
    const b = profile?.spouseName;
    if (a && b) return `${a} & ${b}`;
    if (a) return a;
    return null;
  })();

  // ── Net worth trend + delta vs prior period ──────────────────────────
  const netWorthTrend = useMemo(() => {
    if (!netWorthSnapshots || netWorthSnapshots.length === 0) return [];
    return netWorthSnapshots.slice(-30).map(s => ({ date: s.date, value: s.totalNetWorth }));
  }, [netWorthSnapshots]);
  const trendDelta = netWorthTrend.length >= 2
    ? netWorthTrend[netWorthTrend.length - 1].value - netWorthTrend[0].value : 0;
  const trendPct = netWorthTrend.length >= 2 && netWorthTrend[0].value > 0
    ? (trendDelta / netWorthTrend[0].value) * 100 : 0;

  // ── Spending breakdown by category ───────────────────────────────────
  const spendingByCategory = useMemo(() => {
    if (!dashBuckets) return [];
    return dashBuckets
      // Exclude investing (synced separately) AND travel_work (reimbursable work
      // spend — it's tracked in the Work Expenses card, not personal spend).
      .filter((b: { monthlyActual: number; category?: string }) => b.monthlyActual > 0 && b.category !== 'investing' && b.category !== 'travel_work')
      .sort((a: { monthlyActual: number }, b: { monthlyActual: number }) => b.monthlyActual - a.monthlyActual)
      .slice(0, 6)
      .map((b: { label: string; monthlyActual: number; monthlyBudget: number; icon?: string }) => ({
        name: b.label.split('(')[0].trim(),
        value: b.monthlyActual,
        budget: b.monthlyBudget,
        icon: b.icon,
        over: b.monthlyActual > b.monthlyBudget,
      }));
  }, [dashBuckets]);
  const totalSpending = spendingByCategory.reduce((s: number, c: { value: number }) => s + c.value, 0);
  const totalBudget = spendingByCategory.reduce((s: number, c: { budget: number }) => s + c.budget, 0);
  const spentPctOfBudget = totalBudget > 0 ? Math.min(999, Math.round((totalSpending / totalBudget) * 100)) : 0;

  // ── Recent transactions ─────────────────────────────────────────────
  const recentTx = useMemo(() => {
    if (!rawExpenses || rawExpenses.length === 0) return [];
    return [...rawExpenses]
      .filter((e: { flow?: string }) => (e.flow || 'outflow') === 'outflow')
      .sort((a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [rawExpenses]);

  // ── Iris noticed ─────────────────────────────────────────────────────
  const criticalInsights = insights.filter(i => i.severity === 'critical' || i.severity === 'warning');
  const topInsight = criticalInsights[0] ?? insights[0] ?? null;
  const [noticedExpanded, setNoticedExpanded] = useState(false);

  const pendingActions = actionItems.filter(a => !a.completed).length;
  const animatedNetWorth = useAnimatedCounter(totalNetWorth);
  const flavor = timeOfDayFlavor();

  return (
    <div className="space-y-6 animate-fadeIn max-w-7xl pb-8">
      {/* ════ HERO ═══════════════════════════════════════════════════════ */}
      <div className="glass-card cyber-grid cyber-corners cyber-scanlines relative overflow-hidden">
        <div className={`absolute -top-20 -right-20 w-72 h-72 rounded-full bg-gradient-to-br ${flavor.tone} opacity-[0.08] blur-3xl pointer-events-none`} />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-tr from-cyan-400/[0.06] to-transparent blur-3xl pointer-events-none" />

        <div className="relative p-6 md:p-7">
          {/* HUD top strip — LIVE chip + greeting + timestamp */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className="cyber-chip" style={{ color: 'var(--color-cyber-cyan)' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-cyber-cyan)' }} />
                LIVE
              </span>
              <span className="text-base">{flavor.icon}</span>
              <span className="text-xs text-text-muted">
                {flavor.greeting}{greetingNames ? <>, <span className="text-text-secondary font-medium">{greetingNames}</span></> : ''}.
              </span>
            </div>
            <div className="hidden md:flex items-center gap-3 term-label">
              <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}</span>
              <span className="opacity-40">·</span>
              <span className="tabular-nums">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            </div>
          </div>
          <div className="cyber-divider mb-5" />

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
            {/* Hero number */}
            <div>
              <div className="term-label">Net worth · all sources</div>
              <div className="flex items-baseline gap-3 mt-2">
                <div className="text-5xl md:text-6xl font-black text-text-primary leading-none tracking-tight mono-num"
                  style={{ textShadow: '0 0 12px rgba(0,229,255,0.25)' }}>
                  {formatCurrency(animatedNetWorth)}
                </div>
                {netWorthTrend.length >= 2 && (
                  <TrendChip pct={trendPct} delta={trendDelta} />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-sm">
                {modules.investments && (
                  <BreakdownChip label="Liquid" value={totalLiquid} dot="#8b5cf6" onClick={() => setView('portfolio')} />
                )}
                {modules.equity && equityValue > 0 && (
                  <BreakdownChip label="Equity" value={equityValue} dot="#ec4899" onClick={() => setView('equity')} />
                )}
                {modules.wealth && wealthAssets > 0 && (
                  <BreakdownChip label="Real assets" value={wealthAssets} dot="#10b981" onClick={() => setView('settings')} />
                )}
              </div>
            </div>

            {/* This-month pulse */}
            <div className="flex items-stretch gap-4">
              <div className="hidden lg:block w-px bg-gradient-to-b from-transparent via-cyber-cyan/40 to-transparent" />
              <div className="cursor-pointer" onClick={() => setView('budget')}>
                <div className="term-label">Cycle · this month</div>
                <div className={`text-3xl md:text-4xl font-black mt-2 leading-none mono-num ${budgetSummary.surplus >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {budgetSummary.surplus >= 0 ? '+' : '−'}{formatCurrency(Math.abs(budgetSummary.surplus))}
                </div>
                <div className="text-xs text-text-muted mt-2">
                  {budgetSummary.surplus >= 0
                    ? `${budgetSummary.savingsRate.toFixed(0)}% savings rate`
                    : `${budgetOverBudget.length} categor${budgetOverBudget.length === 1 ? 'y' : 'ies'} over`}
                </div>
              </div>
            </div>
          </div>

          {/* Net worth area chart */}
          {netWorthTrend.length >= 2 ? (
            <div className="h-[160px] -mx-2 mt-5">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={netWorthTrend} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.55} />
                      <stop offset="60%" stopColor="#8b5cf6" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="nwStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{ background: 'rgba(20,20,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [formatCurrency(typeof v === 'number' ? v : Number(v) || 0), 'Net worth']}
                    labelStyle={{ color: '#888' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="url(#nwStroke)" strokeWidth={2.5} fill="url(#nwGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[160px] mt-5 rounded-xl border border-dashed border-glass-border flex flex-col items-center justify-center text-center px-6">
              <div className="text-2xl mb-2 opacity-40">📈</div>
              <div className="text-sm text-text-secondary font-medium">Trend chart unlocks soon</div>
              <div className="text-xs text-text-muted mt-1">A line will appear here as your net worth ticks day to day.</div>
            </div>
          )}
        </div>
      </div>

      {/* ════ SETUP CHECKLIST ═══════════════════════════════════════════ */}
      {fresh && <SetupChecklist />}

      {/* ════ IRIS NOTICED ══════════════════════════════════════════════ */}
      {topInsight && (
        <div className={`glass-card overflow-hidden transition-colors ${criticalInsights.length > 0 ? 'border-warning/30 hover:border-warning/40' : 'hover:border-accent/30'}`}>
          <button
            onClick={() => setNoticedExpanded(!noticedExpanded)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors text-left">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${criticalInsights.length > 0 ? 'bg-warning/15' : 'bg-accent/15'}`}>
                <span className="text-lg">{criticalInsights.length > 0 ? '🔔' : '👁️'}</span>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-text-primary">
                  Iris noticed {insights.length} thing{insights.length === 1 ? '' : 's'}
                </div>
                <div className="text-xs text-text-muted truncate mt-0.5">Top: {topInsight.title}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
              {criticalInsights.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-warning/15 text-warning text-[10px] font-bold uppercase tracking-wider">
                  {criticalInsights.length} alert{criticalInsights.length === 1 ? '' : 's'}
                </span>
              )}
              <span className="text-xs text-accent">{noticedExpanded ? 'Hide' : 'View →'}</span>
            </div>
          </button>
          {noticedExpanded && (
            <div className="px-4 pb-4 space-y-2 border-t border-glass-border pt-3">
              {insights.slice(0, 5).map(insight => (
                <div key={insight.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02]">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                    insight.severity === 'critical' ? 'bg-negative'
                    : insight.severity === 'warning' ? 'bg-warning'
                    : insight.severity === 'positive' ? 'bg-positive'
                    : 'bg-accent'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary">{insight.title}</div>
                    <div className="text-xs text-text-muted leading-relaxed mt-0.5">{insight.description}</div>
                  </div>
                </div>
              ))}
              {insights.length > 5 && (
                <button onClick={() => setView('intelligence')} className="text-xs text-accent hover:underline mt-1">
                  See all {insights.length} in Intelligence →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════ ROW: Spending donut + Investments donut ═══════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DataCard title="Spending this month" subtitle={formatCurrency(totalSpending)} icon="🧾" cta="Open Budget →" onClick={() => setView('budget')}>
          {spendingByCategory.length > 0 ? (
            <div className="grid grid-cols-[160px_1fr] gap-5 items-center">
              <DonutWithCenterLabel
                data={spendingByCategory}
                centerLabel={`${spentPctOfBudget}%`}
                centerSubtitle="of budget"
                centerTone={spentPctOfBudget > 100 ? 'negative' : spentPctOfBudget > 90 ? 'warning' : 'positive'}
              />
              <div className="space-y-1.5">
                {spendingByCategory.slice(0, 6).map((c: { name: string; value: number; budget: number; icon?: string; over: boolean }, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                    {c.icon && <span className="text-sm">{c.icon}</span>}
                    <span className="text-text-secondary flex-1 truncate">{c.name}</span>
                    <span className={`font-semibold tabular-nums ${c.over ? 'text-negative' : 'text-text-primary'}`}>{formatCurrency(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <DataCardEmpty icon="🧾" line="Import a few transactions to see your spending split." />
          )}
        </DataCard>

        {modules.investments ? (
          <DataCard
            title="Where you're invested"
            subtitle={hasPortfolio ? `Score ${overallScore}/100` : 'No holdings yet'}
            icon="📈"
            cta="Open Investments →"
            onClick={() => setView('portfolio')}
          >
            {hasPortfolio && allocations.length > 0 ? (
              <div className="grid grid-cols-[160px_1fr] gap-5 items-center">
                <DonutWithCenterLabel
                  data={allocations.slice(0, 6).map(a => ({ name: a.sector, value: a.value, color: a.color }))}
                  centerLabel={`${overallScore}`}
                  centerSubtitle="/ 100"
                  centerTone={overallScore >= 70 ? 'positive' : overallScore >= 50 ? 'warning' : 'negative'}
                />
                <div className="space-y-1.5">
                  {allocations.slice(0, 6).map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.color || SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                      <span className="text-text-secondary flex-1 truncate">{a.sector}</span>
                      <span className="text-text-primary font-semibold tabular-nums">{a.percentage.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <DataCardEmpty icon="📈" line="Add holdings to see your allocation." />
            )}
          </DataCard>
        ) : null}
      </div>

      {/* ════ CASH FLOW BAR ═════════════════════════════════════════════ */}
      {(budgetSummary.netIncome > 0 || budgetSummary.realActual > 0) && (
        <DataCard
          title="Cash flow this month"
          subtitle={budgetSummary.surplus >= 0
            ? `${formatCurrency(budgetSummary.surplus)} surplus`
            : `${formatCurrency(Math.abs(budgetSummary.surplus))} over income`}
          icon="💸"
          cta="Open Budget →"
          onClick={() => setView('budget')}
          tone={budgetSummary.surplus >= 0 ? 'default' : 'warning'}
        >
          <CashFlowBar
            income={budgetSummary.netIncome}
            spent={budgetSummary.realActual}
            investing={budgetSummary.investing}
          />
        </DataCard>
      )}

      {/* ════ SPEND BY ACCOUNT ══════════════════════════════════════════ */}
      <AccountBreakdown />

      {/* ════ RECENT ACTIVITY + EQUITY/WEALTH STACK ═════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {recentTx.length > 0 && (
          <DataCard title="Recent activity" subtitle={`Last ${recentTx.length} transactions`} icon="🔁" cta="See all →" onClick={() => setView('budget')} className="lg:col-span-2">
            <div className="space-y-1">
              {recentTx.map((tx: { id: string; date: string; description: string; amount: number; category?: string }) => (
                <div key={tx.id} className="flex items-center gap-3 py-2.5 border-b border-glass-border/50 last:border-0">
                  <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center text-sm flex-shrink-0">
                    {categoryEmoji(tx.category)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{tx.description}</div>
                    <div className="text-[11px] text-text-muted">{formatRelDate(tx.date)} · {tx.category || 'uncategorized'}</div>
                  </div>
                  <div className="text-sm font-bold text-text-primary tabular-nums">−{formatCurrency(Math.abs(tx.amount))}</div>
                </div>
              ))}
            </div>
          </DataCard>
        )}

        <div className="space-y-5">
          {modules.equity && (
            <DataCard title="Equity" subtitle={equity ? equity.company : 'Not set up'} icon="🏢" cta="Open →" onClick={() => setView('equity')} compact>
              <div className="text-3xl font-extrabold text-text-primary tracking-tight tabular-nums">
                {equity && equityValue > 0 ? formatCurrency(equityValue) : '—'}
              </div>
              <div className="text-xs text-text-muted mt-1.5">
                {equity ? `${equity.totalShares.toLocaleString()} shares @ $${equity.currentFMV}` : 'Add equity in Settings'}
              </div>
            </DataCard>
          )}
          {modules.wealth && wealthAssets > 0 && (
            <DataCard title="Wealth & Assets" subtitle="Home + vehicles" icon="🏠" cta="Open →" onClick={() => setView('settings')} compact>
              <div className="text-3xl font-extrabold text-text-primary tracking-tight tabular-nums">
                {formatCurrency(wealthAssets)}
              </div>
              <div className="text-xs text-text-muted mt-1.5">
                Home {formatCurrency(homeEquity)} · Vehicles {formatCurrency(carValue)}
              </div>
            </DataCard>
          )}
        </div>
      </div>

      {/* ════ ACTION FOOTER ═════════════════════════════════════════════ */}
      {pendingActions > 0 && (
        <div onClick={() => setView('budget')}
          className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-accent/5 to-pink-500/5 border border-accent/20 cursor-pointer hover:border-accent/40 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <span className="text-lg">⚡</span>
            </div>
            <div>
              <div className="text-sm font-bold text-text-primary">{pendingActions} action item{pendingActions === 1 ? '' : 's'} waiting</div>
              <div className="text-xs text-text-muted">Tap to review and knock them out.</div>
            </div>
          </div>
          <span className="text-xs text-accent font-semibold">Review →</span>
        </div>
      )}
    </div>
  );
}

// ─── Reusable presentation components ───────────────────────────────────

function TrendChip({ pct, delta }: { pct: number; delta: number }) {
  const positive = delta >= 0;
  return (
    <div className={`cyber-chip ${positive ? 'text-positive' : 'text-negative'}`}>
      <span>{positive ? '▲' : '▼'}</span>
      <span className="mono-num">{positive ? '+' : ''}{pct.toFixed(2)}%</span>
    </div>
  );
}

function BreakdownChip({ label, value, dot, onClick }: { label: string; value: number; dot: string; onClick: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 cursor-pointer group" onClick={onClick}>
      <span className="w-2 h-2 rounded-sm" style={{ background: dot, boxShadow: `0 0 8px ${dot}80` }} />
      <span className="text-text-muted text-[10px] uppercase tracking-[0.18em] font-mono">{label}</span>
      <span className="font-bold text-text-primary mono-num group-hover:text-cyber-cyan transition-colors">{formatCurrency(value)}</span>
    </span>
  );
}

function DataCard({
  title, subtitle, icon, cta, onClick, children, compact, tone, className,
}: {
  title: string;
  subtitle?: string;
  icon: string;
  cta: string;
  onClick: () => void;
  children: React.ReactNode;
  compact?: boolean;
  tone?: 'default' | 'warning';
  className?: string;
}) {
  const borderTone = tone === 'warning' ? 'hover:border-warning/40 border-warning/15' : 'hover:border-accent/30';
  return (
    <div onClick={onClick}
      className={`glass-card ${compact ? 'p-5' : 'p-6'} cursor-pointer ${borderTone} transition-all group relative overflow-hidden ${className || ''}`}>
      {/* Subtle hover scanline */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyber-cyan/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl flex-shrink-0">{icon}</span>
          <div className="min-w-0">
            <div className="term-label">{title}</div>
            {subtitle && <div className="text-base font-bold text-text-primary mt-1 truncate mono-num">{subtitle}</div>}
          </div>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyber-cyan/70 flex-shrink-0 group-hover:text-cyber-cyan transition-colors">{cta}</span>
      </div>
      {children}
    </div>
  );
}

function DataCardEmpty({ icon, line }: { icon: string; line: string }) {
  return (
    <div className="h-[140px] rounded-lg border border-dashed border-glass-border flex flex-col items-center justify-center text-center px-4">
      <div className="text-2xl mb-2 opacity-40">{icon}</div>
      <div className="text-xs text-text-muted">{line}</div>
    </div>
  );
}

function DonutWithCenterLabel({
  data, centerLabel, centerSubtitle, centerTone,
}: {
  data: { name: string; value: number; color?: string }[];
  centerLabel: string;
  centerSubtitle: string;
  centerTone: 'positive' | 'negative' | 'warning';
}) {
  const toneColor = {
    positive: 'text-positive',
    negative: 'text-negative',
    warning: 'text-warning',
  }[centerTone];
  return (
    <div className="relative h-[160px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={52} paddingAngle={2} strokeWidth={0}>
            {data.map((d, i) => <Cell key={i} fill={d.color || SECTOR_COLORS[i % SECTOR_COLORS.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: 'rgba(20,20,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
            formatter={(v, name) => [formatCurrency(typeof v === 'number' ? v : Number(v) || 0), String(name ?? '')]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className={`text-2xl font-extrabold ${toneColor} leading-none tracking-tight tabular-nums`}>{centerLabel}</div>
        <div className="text-[10px] text-text-muted uppercase tracking-wider mt-1">{centerSubtitle}</div>
      </div>
    </div>
  );
}

function CashFlowBar({ income, spent, investing }: { income: number; spent: number; investing: number }) {
  const total = Math.max(income, spent + investing, 1);
  const spentPct = (spent / total) * 100;
  const investingPct = (investing / total) * 100;
  const surplus = income - spent - investing;
  const surplusPct = surplus > 0 ? (surplus / total) * 100 : 0;
  const overage = surplus < 0 ? Math.abs(surplus) : 0;

  return (
    <div>
      <div className="flex h-9 rounded-lg overflow-hidden bg-surface-2 border border-glass-border">
        {spentPct > 0 && (
          <div className="bg-gradient-to-r from-rose-500 to-pink-500 transition-all"
            style={{ width: `${spentPct}%` }} title={`Spent: ${formatCurrency(spent)}`} />
        )}
        {investingPct > 0 && (
          <div className="bg-gradient-to-r from-violet-500 to-indigo-500 transition-all border-l border-black/20"
            style={{ width: `${investingPct}%` }} title={`Investing: ${formatCurrency(investing)}`} />
        )}
        {surplusPct > 0 && (
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 transition-all border-l border-black/20"
            style={{ width: `${surplusPct}%` }} title={`Surplus: ${formatCurrency(surplus)}`} />
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <CashFlowSegment color="from-rose-500 to-pink-500" label="Spent" value={spent} />
        <CashFlowSegment color="from-violet-500 to-indigo-500" label="Investing" value={investing} />
        {overage > 0
          ? <CashFlowSegment color="bg-negative" label="Over income" value={overage} negative solid />
          : <CashFlowSegment color="from-emerald-500 to-teal-500" label="Surplus" value={surplus} positive />
        }
      </div>
    </div>
  );
}

function CashFlowSegment({ color, label, value, positive, negative, solid }: { color: string; label: string; value: number; positive?: boolean; negative?: boolean; solid?: boolean }) {
  const valueClass = positive ? 'text-positive' : negative ? 'text-negative' : 'text-text-primary';
  const swatchClass = solid ? color : `bg-gradient-to-r ${color}`;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2.5 h-2.5 rounded-sm ${swatchClass}`} />
        <span className="text-[11px] text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-lg font-bold tabular-nums ${valueClass}`}>{formatCurrency(Math.abs(value))}</div>
    </div>
  );
}
