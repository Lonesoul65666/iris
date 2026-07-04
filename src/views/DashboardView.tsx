import { useState, useMemo, useEffect } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useAppData, formatCurrency } from '../context/AppDataContext';
import { useHasRealData } from '../hooks/useHasRealData';
import { useEnabledModules } from '../hooks/useEnabledModules';
import SetupChecklist, { isDefaultPortfolio } from '../components/Dashboard/SetupChecklist';
import AccountBreakdown from '../components/Dashboard/AccountBreakdown';
import SavingsScorecard from '../components/Dashboard/SavingsScorecard';
import SyncStatus from '../components/Dashboard/SyncStatus';
import GoalTracker from '../components/Dashboard/GoalTracker';
import { computeAllStashes } from '../utils/stashMath';
import { laneOf, isOverBudget, totalReserveSetAside } from '../utils/budgetLanes';
import { categoryEmoji, formatRelDate } from '../utils/txDisplay';

// ─── Helpers ────────────────────────────────────────────────────────────

/** Return the value as-is (count-up animation removed — numbers render static). */
function useAnimatedCounter(target: number): number {
  const [value, setValue] = useState(target);
  useEffect(() => { setValue(target); }, [target]);
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
    budgetSummary, actionItems,
    insights,
    netWorthSnapshots,
    dashBuckets, dashSinkingFunds, monthlyInv,
    rawExpenses, spendingSummary,
    monthToDate, safeToSpend,
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
  // Zoom the trend's Y-axis to the actual data range. Anchored at $0, a real
  // $2–10k swing is invisible against a $500k+ total; padding around min/max
  // makes the day-to-day variation that IS there actually show.
  const nwDomain = useMemo<[number, number]>(() => {
    if (netWorthTrend.length < 2) return [0, 1];
    const vals = netWorthTrend.map(d => d.value);
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.25, max * 0.004) || 1;
    return [min - pad, max + pad];
  }, [netWorthTrend]);

  // ── Spending breakdown by category — TRUE month-to-date ──────────────
  // Reads this month's actual transactions (monthToDate), not the multi-month
  // bucket averages the old version showed under a "this month" label.
  const { spendingByCategory, totalSpending, totalBudget } = useMemo(() => {
    if (!monthToDate || !dashBuckets) return { spendingByCategory: [], totalSpending: 0, totalBudget: 0 };
    const bucketMeta = new Map(dashBuckets.map((b: { category: string }) => [b.category, b]));
    const rows = Object.entries(monthToDate.byCategory)
      // Operating only: no investing (synced separately), no reserve lanes
      // (taxes/travel — lumpy/annual), no work (nets out via reimbursement).
      .filter(([cat, amt]) => amt > 0 && cat !== 'investing' && cat !== 'travel_work' && laneOf(cat) !== 'reserve')
      .map(([cat, amt]) => {
        const b = bucketMeta.get(cat) as { label?: string; monthlyBudget?: number; icon?: string } | undefined;
        return {
          name: (b?.label || cat).split('(')[0].trim(),
          value: Math.round(amt),
          budget: b?.monthlyBudget || 0,
          icon: b?.icon,
          over: isOverBudget(cat, amt, b?.monthlyBudget || 0),
        };
      })
      .sort((a, b) => b.value - a.value);
    // Totals span ALL operating categories — the donut shows top 6 + "Everything else"
    const total = rows.reduce((s, r) => s + r.value, 0);
    const budgetTotal = dashBuckets
      .filter((b: { category: string }) => b.category !== 'investing' && laneOf(b.category) !== 'reserve')
      .reduce((s: number, b: { monthlyBudget: number }) => s + b.monthlyBudget, 0);
    const top = rows.slice(0, 6);
    const rest = total - top.reduce((s, r) => s + r.value, 0);
    if (rest > 0) top.push({ name: 'Everything else', value: Math.round(rest), budget: 0, icon: '🧾', over: false });
    return { spendingByCategory: top, totalSpending: total, totalBudget: budgetTotal };
  }, [monthToDate, dashBuckets]);
  const spentPctOfBudget = totalBudget > 0 ? Math.min(999, Math.round((totalSpending / totalBudget) * 100)) : 0;

  // ── Recent transactions ─────────────────────────────────────────────
  const recentTx = useMemo(() => {
    if (!rawExpenses || rawExpenses.length === 0) return [];
    // Real expenses only: an outbound transfer (savings→checking, spouse Zelle) or
    // a refund/investment is NOT a purchase — without the transactionType guard a
    // $30k savings move would render as −$30,000 fake spend in this feed.
    return [...rawExpenses]
      .filter((e: { flow?: string; transactionType?: string }) =>
        (e.flow || 'outflow') === 'outflow' && (e.transactionType ?? 'expense') === 'expense')
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

  // Recent activity card — rendered either beside "Spending this month" (when
  // the investments donut isn't shown, filling that slot) or in the bottom row.
  const recentActivityCard = (className: string) => (
    <DataCard title="Recent activity" subtitle={`Last ${recentTx.length} transactions`} icon="🔁" cta="See all →" onClick={() => setView('budget')} className={className}>
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
  );
  // When investments are hidden, Recent activity fills the slot next to Spending.
  const recentNextToSpending = !modules.investments && recentTx.length > 0;

  return (
    <div className="space-y-6 animate-fadeIn max-w-7xl pb-8">
      {/* ════ HERO ═══════════════════════════════════════════════════════ */}
      <div className="glass-card relative overflow-hidden">
        <div className="aurora-blob aurora-a" />
        <div className="aurora-blob aurora-b" />

        <div className="relative p-6 md:p-7">
          {/* HUD top strip — greeting message, with the update button stacked
              right underneath it (so the refresh reads as an actual button). */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex flex-col items-start gap-2">
              <span className="text-sm text-text-secondary">
                {flavor.icon} {flavor.greeting}{greetingNames ? <>, <span className="text-text-primary font-medium">{greetingNames}</span></> : ''}.
              </span>
              <SyncStatus />
            </div>
            <div className="hidden md:flex items-center gap-3 term-label">
              <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}</span>
              <span className="opacity-40">·</span>
              <span className="tabular-nums">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
            {/* Hero number */}
            <div>
              <div className="term-label">Net worth · all sources</div>
              <div className="flex items-baseline gap-3 mt-2">
                <div className="text-5xl md:text-6xl font-black text-text-primary leading-none tracking-tight mono-num"
                  style={{ textShadow: '0 0 16px rgba(139,109,255,0.35)' }}>
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

            {/* Safe to Spend — the number that answers "can I buy this?" */}
            {safeToSpend && (
              <div className="flex items-stretch gap-4">
                <div className="hidden lg:block w-px bg-gradient-to-b from-transparent via-cyber-cyan/40 to-transparent" />
                <div className="cursor-pointer" onClick={() => setView('budget')}>
                  <div className="term-label">Safe to spend · this month</div>
                  <div className={`text-3xl md:text-4xl font-black mt-2 leading-none mono-num ${safeToSpend.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {safeToSpend.amount >= 0 ? '' : '−'}{formatCurrency(Math.abs(safeToSpend.amount))}
                  </div>
                  <div className="text-xs text-text-muted mt-2">
                    {safeToSpend.amount >= 0
                      ? `≈ ${formatCurrency(safeToSpend.perDay)}/day for ${safeToSpend.daysLeft} more days`
                      : 'Over the watermark — flexible spending is tapped out'}
                  </div>
                </div>
              </div>
            )}
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
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={nwDomain} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(20,20,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [formatCurrency(typeof v === 'number' ? v : Number(v) || 0), 'Net worth']}
                    labelFormatter={(label) => {
                      const d = new Date(String(label) + 'T00:00:00');
                      return isNaN(d.getTime()) ? String(label) : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    }}
                    labelStyle={{ color: '#888' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="url(#nwStroke)" strokeWidth={2.5} fill="url(#nwGradient)" baseValue="dataMin" />
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
                {spendingByCategory.map((c: { name: string; value: number; budget: number; icon?: string; over: boolean }, i: number) => (
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
        ) : recentNextToSpending ? (
          recentActivityCard('')
        ) : null}
      </div>

      {/* ════ CASH FLOW BAR — true month-to-date, like-for-like ═════════════ */}
      {(() => {
        if (budgetSummary.netIncome <= 0 && !monthToDate) return null;
        // Month-to-date operating spend from real transactions. Investing is a
        // separate segment (synced from Settings, not in bank transactions), so
        // it is NOT inside `spent` — the old version double-subtracted it.
        const mtdSpent = Math.max(0, Math.round(monthToDate?.totalOperating ?? 0));
        // Time-axis fix: spend is month-to-date (~half a month in), but income and
        // investing were full-month figures — comparing them overstated "left this
        // month" by roughly half a paycheck. Prorate income + investing to the SAME
        // elapsed-month fraction so the bar is like-for-like, relabel to "left so
        // far", and show an honest on-pace projection for month-end.
        const today = new Date();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const frac = Math.min(1, Math.max(0.0001, today.getDate() / daysInMonth));
        const proratedIncome = Math.round(budgetSummary.netIncome * frac);
        const proratedInvesting = Math.round(budgetSummary.investing * frac);
        // Reserve set-aside is a job for the $15,800 (taxes/trips), same as on the
        // Budget page's Money Map — subtract it here too so the two pages agree
        // instead of the Dashboard reading "surplus" while Budget reads "over".
        const reserveSetAside = totalReserveSetAside();
        const proratedReserve = Math.round(reserveSetAside * frac);
        const mtdSurplus = proratedIncome - mtdSpent - proratedInvesting - proratedReserve;
        const projectedSpend = Math.round(mtdSpent / frac);
        const projectedSurplus = Math.round(budgetSummary.netIncome - projectedSpend - budgetSummary.investing - reserveSetAside);
        // Pacing/outcome framing — NOT "spendable left" (that's Safe to Spend's job).
        // First week: linear extrapolation of a near-empty month is noise (matches
        // the Budget page's guard), so hold the projection until the pace firms up.
        const dayOfMonth = today.getDate();
        const paceTxt = dayOfMonth < 7
          ? `day ${dayOfMonth} of ${daysInMonth} — too early to call`
          : projectedSurplus >= 0
          ? `on pace to save ${formatCurrency(projectedSurplus)} by month-end`
          : `on pace to be ${formatCurrency(Math.abs(projectedSurplus))} over by month-end`;
        return (
          <DataCard
            title="Cash flow this month"
            subtitle={`${formatCurrency(mtdSpent)} spent so far · ${paceTxt}`}
            icon="💸"
            cta="Open Budget →"
            onClick={() => setView('budget')}
            tone={dayOfMonth < 7 || mtdSurplus >= 0 ? 'default' : 'warning'}
          >
            <CashFlowBar
              income={proratedIncome}
              spent={mtdSpent}
              investing={proratedInvesting}
              reserves={proratedReserve}
            />
          </DataCard>
        );
      })()}

      {/* ════ LIVING UNDER THE GUARANTEE (savings scorecard) ════════════ */}
      <SavingsScorecard />

      {/* ════ GOAL TRACKER — stashes with a target, date-pacing math ════ */}
      {(() => {
        // Goals = stashes that have a destination (target amount or date),
        // with balances DERIVED from transactions (stashMath) — the stored
        // currentBalance is legacy/manual. Targetless pots stay on the
        // Budget Overview's StashesCard; duplicating them here is noise.
        const statuses = computeAllStashes(dashSinkingFunds, rawExpenses);
        const goalFunds = statuses
          .filter(s => s.stash.targetAmount > 0 || s.stash.targetDate)
          .map(s => ({ ...s.stash, currentBalance: s.balance }));
        if (goalFunds.length === 0) return null;
        const emergencyBalance = accounts
          .filter(a => a.type === 'bank' && /sav/i.test(a.name))
          .reduce((s, a) => s + a.totalValue, 0);
        return (
          <GoalTracker
            sinkingFunds={goalFunds}
            monthlyInvestmentAmount={monthlyInv?.amount || 0}
            emergencyFundBalance={emergencyBalance}
            monthlyExpenses={spendingSummary?.avgMonthlyExpenses ?? 0}
          />
        );
      })()}

      {/* ════ SPEND BY ACCOUNT ══════════════════════════════════════════ */}
      <AccountBreakdown />

      {/* ════ RECENT ACTIVITY (only when NOT moved up beside Spending) + EQUITY/WEALTH ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {!recentNextToSpending && recentTx.length > 0 && recentActivityCard('lg:col-span-2')}

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

function CashFlowBar({ income, spent, investing, reserves }: { income: number; spent: number; investing: number; reserves: number }) {
  // Same partition as the Budget page's Money Map: income = spent + investing +
  // reserves + surplus. Reserves (taxes/trips set-aside) is its own segment so a
  // "surplus" here can't quietly ignore money that's already committed.
  const total = Math.max(income, spent + investing + reserves, 1);
  const spentPct = (spent / total) * 100;
  const investingPct = (investing / total) * 100;
  const reservesPct = (reserves / total) * 100;
  const surplus = income - spent - investing - reserves;
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
        {reservesPct > 0 && (
          <div className="bg-gradient-to-r from-amber-500 to-yellow-400 transition-all border-l border-black/20"
            style={{ width: `${reservesPct}%` }} title={`Reserves set aside: ${formatCurrency(reserves)}`} />
        )}
        {surplusPct > 0 && (
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 transition-all border-l border-black/20"
            style={{ width: `${surplusPct}%` }} title={`Surplus: ${formatCurrency(surplus)}`} />
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <CashFlowSegment color="from-rose-500 to-pink-500" label="Spent" value={spent} />
        <CashFlowSegment color="from-violet-500 to-indigo-500" label="Investing" value={investing} />
        <CashFlowSegment color="from-amber-500 to-yellow-400" label="Reserves" value={reserves} />
        {overage > 0
          ? <CashFlowSegment color="bg-negative" label="Over base" value={overage} negative solid />
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
