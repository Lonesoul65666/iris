import { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { useAppData } from '../context/AppDataContext';
import { useHasRealData } from '../hooks/useHasRealData';
import EmptyState from '../components/ui/EmptyState';
import ScoreRing from '../components/ui/ScoreRing';
import type { View } from '../types/views';

// Grade color gradients — matches IntelligenceView's GRADE_COLORS
const GRADE_COLORS: Record<string, string> = {
  A: 'from-emerald-500 to-emerald-400',
  B: 'from-blue-500 to-blue-400',
  C: 'from-amber-500 to-amber-400',
  D: 'from-orange-500 to-orange-400',
  F: 'from-red-500 to-red-400',
};

const GRADE_TINTS: Record<string, string> = {
  A: 'from-emerald-500/15 via-emerald-500/5 to-transparent',
  B: 'from-blue-500/15 via-blue-500/5 to-transparent',
  C: 'from-amber-500/15 via-amber-500/5 to-transparent',
  D: 'from-orange-500/15 via-orange-500/5 to-transparent',
  F: 'from-red-500/20 via-red-500/5 to-transparent',
};

function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function scoreToVerdict(score: number): string {
  if (score >= 85) return 'Balanced & Ready';
  if (score >= 70) return 'On Solid Ground';
  if (score >= 55) return 'Rebalance Soon';
  if (score >= 40) return 'Needs Attention';
  return 'Critical Action';
}

// Metric name → { emoji, eyebrow, targetView }
const METRIC_META: Record<string, { emoji: string; eyebrow: string; target: View; targetLabel: string }> = {
  'Concentration Risk':   { emoji: '🔬', eyebrow: 'Concentration',   target: 'intelligence', targetLabel: 'Open Rebalance' },
  'Tech Exposure':        { emoji: '⚙️', eyebrow: 'Tech Exposure',   target: 'intelligence', targetLabel: 'Open X-Ray' },
  'Cash Drag':            { emoji: '💰', eyebrow: 'Cash Drag',       target: 'dashboard',    targetLabel: 'See Accounts' },
  'Diversification':      { emoji: '🧩', eyebrow: 'Diversification', target: 'intelligence', targetLabel: 'See Gaps' },
  'Single Company Risk':  { emoji: '🏢', eyebrow: 'Company Risk',    target: 'equity',       targetLabel: 'Open Equity' },
  'International Exposure': { emoji: '🌍', eyebrow: 'International', target: 'intelligence', targetLabel: 'See Gaps' },
};

export default function HealthView() {
  const {
    accounts, equity, healthMetrics, overallScore, allocations,
    netWorthSnapshots, totalLiquid, setView,
  } = useAppData();
  const { hasPortfolio } = useHasRealData();

  const [expanded, setExpanded] = useState<string | null>(null);

  const grade = scoreToGrade(overallScore);
  const verdict = scoreToVerdict(overallScore);

  // Don't run the grade/metrics view on an empty portfolio — the score and
  // every sub-metric come back hardcoded (55%, "Tech Heavy", "Cash Sitting Idle")
  // because the calculator doesn't distinguish "no data" from "balanced data".
  if (!hasPortfolio) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Portfolio Health Check</h1>
          <p className="text-text-secondary text-sm mt-1">How well-positioned is your portfolio?</p>
        </div>
        <EmptyState
          icon="🩺"
          title="No portfolio to grade yet"
          description="Once you connect accounts or import holdings, Iris will score concentration, diversification, cash drag, tech exposure, and more."
          ctaLabel="Add a portfolio"
          ctaTarget="portfolio"
        />
      </div>
    );
  }

  // ── Historical trend ─────────────────────────────────────────────────
  const trend = useMemo(() => {
    if (netWorthSnapshots.length < 2) {
      return { kind: 'baseline' as const };
    }
    // Prior snapshot is ~30d back; find closest to 30d ago or just use 2nd-to-last
    const latest = netWorthSnapshots[netWorthSnapshots.length - 1];
    const prior = netWorthSnapshots[netWorthSnapshots.length - 2];

    // Net worth delta as a proxy (we don't re-score old holdings — we don't have historical account states).
    const delta = latest.totalLiquidNetWorth - prior.totalLiquidNetWorth;
    const pct = prior.totalLiquidNetWorth > 0 ? (delta / prior.totalLiquidNetWorth) * 100 : 0;
    return { kind: 'delta' as const, delta, pct };
  }, [netWorthSnapshots]);

  // ── Top sector conviction carve-out ──────────────────────────────────
  const topSectorHasConviction = useMemo(() => {
    const top = allocations[0];
    if (!top) return false;
    // Check all holdings across all accounts — flag conviction if any holding marked conviction
    // lives in the top sector. We don't have a direct holding→sector map here, so fall back to
    // checking if ANY conviction holding exists in the portfolio — the carve-out badge is a soft signal.
    for (const a of accounts) {
      for (const h of a.holdings) {
        if (h.conviction) return true;
      }
    }
    return false;
  }, [accounts, allocations]);

  // Personalized summary line using real holdings data
  const sectorCount = allocations.filter(a => a.percentage >= 2).length;
  const cashBuckets = accounts
    .filter(a => a.type === 'bank')
    .flatMap(a => a.holdings)
    .filter(h => h.ticker === 'CASH')
    .reduce((s, h) => s + h.currentValue, 0);

  const personalizedSummary = useMemo(() => {
    const parts: string[] = [];
    parts.push(`You're diversified across ${sectorCount} meaningful sector${sectorCount === 1 ? '' : 's'}`);
    if (cashBuckets > 5000) {
      parts.push(`$${Math.round(cashBuckets).toLocaleString()} sitting in cash`);
    }
    if (equity) {
      parts.push(`${equity.company} equity in play`);
    }
    return parts.join(' · ');
  }, [sectorCount, cashBuckets, equity]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Portfolio Health Check</h1>
        <p className="text-text-secondary text-sm mt-1">How well-positioned is your portfolio?</p>
      </div>

      {/* ── Gradient verdict banner ──────────────────────────────────── */}
      <div className="glass-card p-6 relative overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${GRADE_TINTS[grade]} pointer-events-none`} />
        <div className="relative grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-6 items-center">
          {/* Letter grade tile */}
          <div className={`w-24 h-24 rounded-3xl bg-gradient-to-br ${GRADE_COLORS[grade]} flex items-center justify-center text-5xl font-black text-white shadow-xl shrink-0 mono-num`}>
            {grade}
          </div>

          {/* Verdict + summary */}
          <div className="min-w-0">
            <div className="term-label mb-1">Overall health</div>
            <h2 className="text-3xl font-extrabold text-text-primary leading-tight">{verdict}</h2>
            <p className="text-sm text-text-secondary mt-2 leading-relaxed">{personalizedSummary}</p>

            {/* Trend indicator */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {trend.kind === 'baseline' ? (
                <span className="cyber-chip bg-white/5 text-text-muted border border-glass-border">
                  Baseline set today
                </span>
              ) : (
                <span className={`cyber-chip border ${
                  trend.delta >= 0
                    ? 'bg-positive/10 text-positive border-positive/20'
                    : 'bg-negative/10 text-negative border-negative/20'
                }`}>
                  {trend.delta >= 0 ? '▲' : '▼'} <span className="mono-num">{trend.pct >= 0 ? '+' : ''}{trend.pct.toFixed(1)}%</span> net worth vs last snapshot
                </span>
              )}
              <span className="text-xs text-text-muted">
                Liquid: <span className="mono-num">${Math.round(totalLiquid).toLocaleString()}</span>
              </span>
            </div>
          </div>

          {/* Score ring */}
          <div className="flex-shrink-0 hidden lg:block">
            <ScoreRing score={overallScore} size={140} />
          </div>
        </div>
      </div>

      {/* ── Signal cards ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="term-label">Signals</h2>
          <span className="text-xs text-text-muted"><span className="mono-num">{healthMetrics.length}</span> metrics · click a card to expand</span>
        </div>

        {healthMetrics.map((m) => {
          const meta = METRIC_META[m.name] || { emoji: '📊', eyebrow: m.name, target: 'dashboard' as View, targetLabel: 'Open' };
          const isOpen = expanded === m.name;
          const statusColor =
            m.status === 'good' ? 'text-positive'
            : m.status === 'warning' ? 'text-warning'
            : 'text-negative';
          const statusBg =
            m.status === 'good' ? 'bg-positive'
            : m.status === 'warning' ? 'bg-warning'
            : 'bg-negative';
          const badgeClasses =
            m.status === 'good' ? 'bg-positive/10 text-positive border-positive/25'
            : m.status === 'warning' ? 'bg-warning/10 text-warning border-warning/25'
            : 'bg-negative/10 text-negative border-negative/25';

          // Derive a one-line verdict title from the message — capitalized
          const verdictTitle = m.message;
          const isConcentration = m.name === 'Concentration Risk';
          const showConvictionBadge = isConcentration && topSectorHasConviction;

          return (
            <div key={m.name} className="glass-card overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : m.name)}
                className="w-full p-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0 mt-0.5">{meta.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="term-label">{meta.eyebrow}</span>
                      {showConvictionBadge && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20"
                          title="Top sector contains a conviction holding — weighted softer in this read"
                        >
                          ⭐ conviction
                        </span>
                      )}
                      <span className={`cyber-chip border ${badgeClasses}`}>
                        <span className="mono-num">{m.score}/100</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${statusBg} flex-shrink-0`} />
                      <h3 className="text-base font-semibold text-text-primary truncate">{verdictTitle}</h3>
                    </div>
                    {/* Progress bar (clamped to 100) */}
                    <div className="w-full bg-white/5 rounded-full h-1.5 mt-3 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-700 ${statusBg}`}
                        style={{ width: `${Math.min(m.score, 100)}%` }}
                      />
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-text-muted transition-transform duration-200 flex-shrink-0 mt-1 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-0 border-t border-glass-border/50">
                  <p className="text-sm text-text-secondary leading-relaxed mt-3 pl-[52px]">
                    {m.detail}
                    {showConvictionBadge && (
                      <span className="block mt-2 text-xs text-amber-300/90">
                        Note: a conviction holding lives in this sector. That's intentional — the penalty here is informational, not prescriptive.
                      </span>
                    )}
                  </p>
                  <div className="pl-[52px] mt-3 flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => setView(meta.target)}
                      className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-glass-border text-text-secondary hover:text-accent text-xs font-medium transition-colors"
                    >
                      {meta.targetLabel} &rarr;
                    </button>
                    <span className={`text-xs font-medium ${statusColor}`}>
                      {m.status === 'good' ? 'Healthy' : m.status === 'warning' ? 'Watch' : 'Action needed'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Allocation bar chart (preserved) ─────────────────────────── */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="term-label">Top 10 Sectors</h2>
          <span className="text-xs text-text-muted">Allocation breakdown</span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={allocations.slice(0, 10)} layout="vertical" margin={{ left: 150, right: 30 }}>
            <XAxis type="number" tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fill: '#6b7280', fontSize: 12 }} />
            <YAxis type="category" dataKey="sector" tick={{ fill: '#9ca3af', fontSize: 12 }} width={140} />
            <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Allocation']}
              contentStyle={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              labelStyle={{ color: '#f0f0f5' }} itemStyle={{ color: '#a78bfa' }} />
            <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
              {allocations.slice(0, 10).map((a, i) => <Cell key={i} fill={a.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
