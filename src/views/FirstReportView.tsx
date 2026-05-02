import { useMemo, useState } from 'react';
import { useAppData, formatCurrency, saveSetting } from '../context/AppDataContext';
import { generateXrayReport, findHiddenConcentrations } from '../utils/etfXray';
import { generateIntelligenceReport } from '../utils/portfolioIntelligence';
import { generateNextDeploymentBrief } from '../utils/nextDeploymentBrief';
import type { AssetClass } from '../types/portfolio';

type CardProps = {
  id: string;
  emoji: string;
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  impactScore?: number;
  impactBadge?: string;
  secondaryTargetView?: 'intelligence' | 'portfolio' | 'dashboard';
  secondaryLabel?: string;
};

const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  stock: 'Stocks',
  etf: 'ETFs',
  mutual_fund: 'Mutual funds',
  crypto: 'Crypto',
  bond: 'Bonds',
  rsu: 'Equity grants',
  option: 'Options',
  cash: 'Cash',
};

const ASSET_CLASS_DOT: Record<AssetClass, string> = {
  stock: 'bg-accent',
  etf: 'bg-violet-500',
  mutual_fund: 'bg-blue-500',
  crypto: 'bg-amber-500',
  bond: 'bg-emerald-500',
  rsu: 'bg-rose-500',
  option: 'bg-fuchsia-500',
  cash: 'bg-text-muted',
};

export default function FirstReportView() {
  const { accounts, equity, profile, monthlyInv, setView } = useAppData();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const xray = useMemo(() => generateXrayReport(accounts), [accounts]);
  const concentrations = useMemo(() => findHiddenConcentrations(xray), [xray]);
  const intel = useMemo(() => generateIntelligenceReport(accounts, equity, profile, monthlyInv), [accounts, equity, profile, monthlyInv]);
  const plan = useMemo(() => generateNextDeploymentBrief(accounts, monthlyInv?.amount || 0, monthlyInv), [accounts, monthlyInv]);

  const cashSignals = intel.signals.filter(s => s.ticker === 'CASH');
  const totalCashDrag = cashSignals.reduce((sum, s) => {
    const match = s.impact?.match(/\$([\d,]+)/);
    return sum + (match ? parseInt(match[1].replace(/,/g, '')) : 0);
  }, 0);

  const finish = async (targetView?: 'dashboard' | 'intelligence' | 'portfolio') => {
    setFinishing(true);
    await saveSetting('first_report_complete', 'true');
    setView(targetView || 'dashboard');
  };

  const cards: CardProps[] = useMemo(() => {
    const out: CardProps[] = [];

    // Fixed opener: Welcome
    out.push({
      id: 'welcome',
      emoji: '👋',
      eyebrow: 'Welcome',
      title: profile?.name?.trim() ? `Here's what I found, ${profile.name.split(' ')[0]}.` : `Here's what I found.`,
      body: (
        <>
          <p>
            I scanned every account, every holding, every ETF constituent — <span className="text-accent font-semibold">{formatCurrency(xray.totalPortfolioValue)}</span> across{' '}
            <span className="text-accent font-semibold">{xray.exposures.length} underlying positions</span>.
          </p>
          <p>
            What follows isn't a dump — it's the stuff I think you should actually know about your portfolio right now. You can act on each item, skip it, or come back later.
          </p>
          <p className="text-xs text-text-muted">This report runs once. After today I'll mostly stay quiet — nudging you only when something meaningful changes.</p>
        </>
      ),
    });

    // Fixed scene-setter: Composition
    out.push({
      id: 'composition',
      emoji: '🧭',
      eyebrow: 'Portfolio composition',
      title: "Here's how you're allocated.",
      body: (
        <>
          <CompositionBars byAssetClass={xray.byAssetClass} total={xray.totalPortfolioValue} />
          <p className="mt-4 text-sm text-text-secondary">
            {compositionCommentary(xray.byAssetClass, xray.totalPortfolioValue)}
          </p>
        </>
      ),
    });

    // Dynamic middle cards — each only added if it has findings. Sorted by impact score.
    const middle: CardProps[] = [];

    // Concentrations
    if (concentrations.length > 0) {
      const concImpact = concentrations.reduce((s, c) => s + c.totalValue, 0);
      middle.push({
        id: 'concentrations',
        emoji: '🔬',
        eyebrow: 'Hidden concentrations',
        title: "You're more concentrated than you probably think.",
        impactScore: concImpact,
        impactBadge: `${formatCurrency(concImpact)} stacked across funds`,
        secondaryLabel: 'Open X-Ray',
        secondaryTargetView: 'intelligence',
        body: (
          <>
            <p>
              These stocks show up in multiple places — direct holdings plus ETF positions stack on top of each other. The X-Ray tab has the full breakdown.
            </p>
            <ul className="space-y-2 mt-3">
              {concentrations.slice(0, 5).map(c => (
                <li key={c.ticker} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-glass-border">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 flex items-center justify-center text-[10px] font-bold text-amber-400 flex-shrink-0">
                    {c.ticker.length <= 5 ? c.ticker : c.ticker.slice(0, 4)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{c.name}</div>
                    <div className="text-xs text-text-muted truncate">Across {c.fundCount} sources · {c.portfolioPct.toFixed(1)}% of portfolio</div>
                  </div>
                  <div className="text-sm font-bold text-text-primary flex-shrink-0">{formatCurrency(c.totalValue)}</div>
                </li>
              ))}
            </ul>
          </>
        ),
      });
    }

    // Cash drag
    if (cashSignals.length > 0 && totalCashDrag > 0) {
      middle.push({
        id: 'cash-drag',
        emoji: '💰',
        eyebrow: 'Cash drag',
        title: "You're leaving money on the table in cash.",
        impactScore: totalCashDrag * 20, // annual → ~20-yr NPV-ish weight vs one-time concentrations
        impactBadge: `${formatCurrency(totalCashDrag)}/yr in lost interest`,
        body: (
          <>
            <p>
              {cashSignals.length} account{cashSignals.length > 1 ? 's have' : ' has'} enough cash sitting in low-yield savings that moving to a HYSA would recover roughly{' '}
              <span className="text-accent font-semibold">{formatCurrency(totalCashDrag)}/yr</span>.
            </p>
            <ul className="space-y-2 mt-3">
              {cashSignals.slice(0, 3).map(s => (
                <li key={s.id} className="p-3 rounded-xl bg-white/[0.02] border border-glass-border">
                  <div className="text-sm font-semibold text-text-primary">{s.holdingName}</div>
                  <div className="text-xs text-text-muted mt-0.5">{s.impact}</div>
                </li>
              ))}
            </ul>
          </>
        ),
      });
    }

    // Rebalance
    if (intel.rebalanceMoves.length > 0) {
      const rebalImpact = intel.rebalanceMoves.slice(0, 3).reduce((s, m) => s + Math.abs(m.suggestedAmount), 0);
      middle.push({
        id: 'rebalance',
        emoji: '⚖️',
        eyebrow: 'Rebalance',
        title: "Here's what I'd rebalance first.",
        impactScore: rebalImpact,
        impactBadge: `${formatCurrency(rebalImpact)} of moves suggested`,
        secondaryLabel: 'Open Rebalance',
        secondaryTargetView: 'intelligence',
        body: (
          <>
            <p>These moves would bring your allocation closer to target without forcing a full rebuild.</p>
            <ul className="space-y-2 mt-3">
              {intel.rebalanceMoves.slice(0, 3).map((m, i) => (
                <li key={i} className="p-3 rounded-xl bg-white/[0.02] border border-glass-border">
                  <div className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <span>{m.action === 'trim' ? 'Trim' : 'Add to'} {m.ticker}</span>
                    {m.hasConvictionInSector && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300"
                        title="Sector contains conviction holdings — excluded from trim math"
                      >
                        ⭐ conviction carved out
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">{m.reason}</div>
                  {m.why && (
                    <div className="mt-1.5 pt-1.5 border-t border-white/5 flex gap-1.5">
                      <span className="text-[9px] font-bold text-accent-light/80 uppercase tracking-wider flex-shrink-0 mt-0.5">Why</span>
                      <p className="text-[11px] text-text-secondary italic leading-snug">{m.why}</p>
                    </div>
                  )}
                  <div className="text-[10px] text-text-muted mt-1">
                    {m.currentPct.toFixed(1)}% → {m.targetPct.toFixed(1)}% · ~{formatCurrency(m.suggestedAmount)}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ),
      });
    }

    // Diversification gaps
    if (intel.diversificationGaps.length > 0) {
      const topGaps = intel.diversificationGaps.slice(0, 3);
      const gapImpact = topGaps.reduce((s, g) => s + ((g.recommendedPct - g.currentPct) / 100) * xray.totalPortfolioValue, 0);
      middle.push({
        id: 'gaps',
        emoji: '🧩',
        eyebrow: 'Diversification gaps',
        title: "You have some coverage gaps.",
        impactScore: gapImpact,
        impactBadge: `~${formatCurrency(gapImpact)} to close top gaps`,
        body: (
          <>
            <p>These are categories where your target allocation isn't being met. Fixing them doesn't require selling — just redirecting future deposits.</p>
            <ul className="space-y-2 mt-3">
              {topGaps.map((g, i) => (
                <li key={i} className="p-3 rounded-xl bg-white/[0.02] border border-glass-border">
                  <div className="text-sm font-semibold text-text-primary">{g.sector}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    Target {g.recommendedPct}% · Current {g.currentPct.toFixed(1)}% · Gap {(g.recommendedPct - g.currentPct).toFixed(1)} pts
                  </div>
                </li>
              ))}
            </ul>
          </>
        ),
      });
    }

    // Sort dynamic middle by impact score (highest first)
    middle.sort((a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0));
    out.push(...middle);

    // Fixed closer 1: Next-deployment Brief (always shown — forward-looking action)
    out.push({
      id: 'deployment',
      emoji: '💡',
      eyebrow: 'Next-deployment brief',
      title: "If you deployed capital today, here's where I'd put it.",
      secondaryLabel: 'Open Brief',
      secondaryTargetView: 'intelligence',
      body: (
        <>
          <p>Based on your gaps and rebalance priorities, this is the split I'd use to deploy{' '}
            <span className="text-accent font-semibold">{formatCurrency(plan.capitalToDeploy)}</span>:
          </p>
          <ul className="space-y-2 mt-3">
            {plan.steps.slice(0, 5).map((r, i) => (
              <li key={i} className="p-3 rounded-xl bg-white/[0.02] border border-glass-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/15 to-violet-500/10 flex items-center justify-center text-[10px] font-bold text-accent flex-shrink-0">
                    {r.ticker}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{r.name}</div>
                    <div className="text-xs text-text-muted truncate">{r.reason}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-text-primary">{formatCurrency(r.amount)}</div>
                    <div className="text-[10px] text-accent-light">{r.percentage}%</div>
                  </div>
                </div>
                {r.why && (
                  <div className="mt-2 pt-2 border-t border-white/5 flex gap-1.5">
                    <span className="text-[9px] font-bold text-accent-light/80 uppercase tracking-wider flex-shrink-0 mt-0.5">Why</span>
                    <p className="text-[11px] text-text-secondary italic leading-snug">{r.why}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      ),
    });

    // Fixed closer 2: Going forward
    out.push({
      id: 'going-forward',
      emoji: '🤖',
      eyebrow: 'Going forward',
      title: "I'll watch these things for you.",
      body: (
        <>
          <p>From here on I stay quiet unless something meaningful changes. When that happens, you'll see a nudge on your dashboard:</p>
          <ul className="space-y-2 mt-3 text-sm">
            <li className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-glass-border">
              <span className="text-xl">📈</span>
              <span className="text-text-secondary">A holding moves ≥15% in a week</span>
            </li>
            <li className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-glass-border">
              <span className="text-xl">🎯</span>
              <span className="text-text-secondary">You cross a net-worth milestone</span>
            </li>
            <li className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-glass-border">
              <span className="text-xl">💰</span>
              <span className="text-text-secondary">Cash starts piling up in low-yield accounts</span>
            </li>
            <li className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-glass-border">
              <span className="text-xl">📅</span>
              <span className="text-text-secondary">It's time for your monthly DCA</span>
            </li>
            <li className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-glass-border">
              <span className="text-xl">👋</span>
              <span className="text-text-secondary">You've been away for a while</span>
            </li>
          </ul>
          <p className="text-xs text-text-muted mt-4">
            Every nudge is dismissible. You can reset them anytime in Settings → Notifications.
          </p>
        </>
      ),
    });

    return out;
  }, [profile, xray, concentrations, cashSignals, totalCashDrag, intel, plan]);

  const totalSteps = cards.length;
  const safeStep = Math.min(step, totalSteps - 1);
  const isLast = safeStep === totalSteps - 1;
  const current = cards[safeStep];

  const next = () => setStep(s => Math.min(s + 1, totalSteps - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  return (
    <div className="min-h-screen w-full bg-surface-0 flex items-center justify-center p-6 animate-fadeIn">
      <div className="w-full max-w-3xl">
        {/* Progress */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <span className="text-accent-light font-semibold">Iris</span>
            <span>·</span>
            <span>Your first report · step {safeStep + 1} of {totalSteps}</span>
          </div>
          <button onClick={() => finish()} disabled={finishing} className="text-xs text-text-muted hover:text-accent transition-colors">
            Skip to dashboard &rarr;
          </button>
        </div>
        <div className="h-1 rounded-full bg-surface-2 overflow-hidden mb-8">
          <div
            className="h-full bg-gradient-to-r from-accent to-violet-500 transition-all"
            style={{ width: `${((safeStep + 1) / totalSteps) * 100}%` }}
          />
        </div>

        <StepShell
          emoji={current.emoji}
          eyebrow={current.eyebrow}
          title={current.title}
          impactBadge={current.impactBadge}
          body={current.body}
          onBack={safeStep > 0 ? back : undefined}
          onNext={!isLast ? next : undefined}
          primaryLabel={safeStep === 0 ? 'Start' : undefined}
          primary={isLast ? { label: finishing ? 'Finishing…' : 'Go to dashboard', onClick: () => finish('dashboard'), disabled: finishing } : undefined}
          secondary={current.secondaryTargetView && current.secondaryLabel ? { label: current.secondaryLabel, onClick: () => finish(current.secondaryTargetView) } : undefined}
        />
      </div>
    </div>
  );
}

function StepShell({
  emoji, eyebrow, title, body, onNext, onBack, primaryLabel, primary, secondary, impactBadge,
}: {
  emoji: string;
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  primaryLabel?: string;
  primary?: { label: string; onClick: () => void; disabled?: boolean };
  secondary?: { label: string; onClick: () => void };
  impactBadge?: string;
}) {
  return (
    <div className="glass-card p-8 space-y-6">
      <div className="flex items-start gap-4">
        <div className="text-4xl flex-shrink-0">{emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <div className="text-xs uppercase tracking-wider text-accent-light font-bold">{eyebrow}</div>
            {impactBadge && (
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                {impactBadge}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-text-primary leading-snug">{title}</h1>
        </div>
      </div>
      <div className="text-sm text-text-secondary leading-relaxed space-y-3 pl-1">
        {body}
      </div>
      <div className="flex items-center gap-3 pt-2 flex-wrap">
        {primary ? (
          <button
            onClick={primary.onClick}
            disabled={primary.disabled}
            className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-dim disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {primary.label} &rarr;
          </button>
        ) : onNext ? (
          <button onClick={onNext} className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors">
            {primaryLabel || 'Next'} &rarr;
          </button>
        ) : null}
        {secondary && (
          <button
            onClick={secondary.onClick}
            className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-glass-border text-text-secondary hover:text-accent text-sm font-medium transition-colors"
          >
            {secondary.label}
          </button>
        )}
        {onBack && (
          <button onClick={onBack} className="ml-auto text-xs text-text-muted hover:text-accent transition-colors">
            &larr; Back
          </button>
        )}
      </div>
    </div>
  );
}

function CompositionBars({ byAssetClass, total }: { byAssetClass: Partial<Record<AssetClass, number>>; total: number }) {
  const entries = (Object.keys(byAssetClass) as AssetClass[])
    .map(ac => ({ ac, value: byAssetClass[ac] ?? 0, pct: ((byAssetClass[ac] ?? 0) / total) * 100 }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value);
  return (
    <div className="space-y-2">
      {entries.map(e => (
        <div key={e.ac} className="flex items-center gap-3">
          <div className="w-28 text-sm text-text-secondary flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${ASSET_CLASS_DOT[e.ac]}`} />
            {ASSET_CLASS_LABEL[e.ac]}
          </div>
          <div className="flex-1 h-3 rounded-full bg-surface-2 overflow-hidden">
            <div className={`h-full ${ASSET_CLASS_DOT[e.ac]}`} style={{ width: `${e.pct}%` }} />
          </div>
          <div className="w-24 text-right text-sm text-text-primary font-semibold">
            {e.pct.toFixed(0)}% <span className="text-text-muted font-normal">· {formatCurrency(e.value)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function compositionCommentary(byAssetClass: Partial<Record<AssetClass, number>>, total: number): string {
  if (total === 0) return '';
  const pct = (ac: AssetClass) => ((byAssetClass[ac] ?? 0) / total) * 100;
  const cryptoPct = pct('crypto');
  const fundPct = pct('mutual_fund') + pct('etf');
  const stockPct = pct('stock');
  const bits: string[] = [];
  if (cryptoPct >= 20) bits.push(`Crypto is ${cryptoPct.toFixed(0)}% of your portfolio — that's a meaningful bet`);
  if (fundPct >= 50) bits.push(`${fundPct.toFixed(0)}% sits in funds (ETFs + mutual funds) — diversified wrapper, but see the next step for what's actually underneath`);
  if (stockPct < 5 && fundPct > 30) bits.push(`Direct stock picks are under 5% — you're mostly an index investor, which is a decision I respect`);
  return bits.length > 0 ? bits.join('. ') + '.' : 'That\'s your allocation across wrapper types. The next steps dig into what lives inside those funds.';
}
