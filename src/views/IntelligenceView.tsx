import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { Account, MonthlyInvestment } from '../types/portfolio';
import { useAppData, formatCurrency } from '../context/AppDataContext';
import {
  generateIntelligenceReport, modelScenarios,
  type PortfolioSignal, type ConcentrationRisk, type RebalanceMove,
  type DiversificationGap, type ScenarioResult,
} from '../utils/portfolioIntelligence';
import { calculateTotalValue } from '../utils/calculations';
import {
  generateMarketIntelligence, getCachedReport, clearMarketCache, loadPersistedReport,
  type MarketIntelligenceReport, type HoldingAnalysis, type HoldingSentiment,
  type MarketOpportunity, type AllocationAdvice,
} from '../services/marketIntelligence';
import { saveMarketAnnotations, loadMarketAnnotations } from '../stores/portfolioStore';
import { generateNextDeploymentBrief } from '../utils/nextDeploymentBrief';
import EtfXrayPanel from '../components/Intelligence/EtfXrayPanel';
import EmptyState from '../components/ui/EmptyState';
import { useHasRealData } from '../hooks/useHasRealData';

// ─── Signal badge colors ───
const SIGNAL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  sell: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  buy: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  rebalance: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  action: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  hold: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
};

const URGENCY_COLORS: Record<string, { bg: string; text: string }> = {
  now: { bg: 'bg-red-500/15', text: 'text-red-400' },
  soon: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  watch: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
};

const GRADE_COLORS: Record<string, string> = {
  A: 'from-emerald-500 to-emerald-400',
  B: 'from-blue-500 to-blue-400',
  C: 'from-amber-500 to-amber-400',
  D: 'from-orange-500 to-orange-400',
  F: 'from-red-500 to-red-400',
};

const SENTIMENT_COLORS: Record<HoldingSentiment, { bg: string; text: string; border: string }> = {
  bullish: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  bearish: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  neutral: { bg: 'bg-gray-500/10', text: 'text-text-muted', border: 'border-gray-500/20' },
};

const MARKET_SENTIMENT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'risk-on': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Risk On' },
  'risk-off': { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Risk Off' },
  mixed: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Mixed' },
};

type Tab = 'advisor' | 'market' | 'signals' | 'rebalance' | 'gaps' | 'xray' | 'scenarios';

export default function IntelligenceView() {
  const { accounts, equity, profile, monthlyInv, setView, apiKey } = useAppData();
  const { hasPortfolio } = useHasRealData();
  const [activeTab, setActiveTab] = useState<Tab>('advisor');
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null);
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);

  // Market intelligence state
  const [marketReport, setMarketReport] = useState<MarketIntelligenceReport | null>(() => getCachedReport());
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketProgress, setMarketProgress] = useState('');
  const loadingRef = useRef(false);

  // Annotations: checked-off items and pinned items that survive refreshes
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [pinnedItems, setPinnedItems] = useState<Array<{ type: 'opportunity' | 'allocation'; item: MarketOpportunity | AllocationAdvice; pinnedAt: string }>>([]);
  const annotationsLoaded = useRef(false);

  // Load persisted report + annotations on mount
  useEffect(() => {
    if (marketReport || loadingRef.current) return; // already have data
    (async () => {
      const persisted = await loadPersistedReport();
      if (persisted) setMarketReport(persisted);
    })();
  }, []);

  // Load annotations once
  useEffect(() => {
    if (annotationsLoaded.current) return;
    annotationsLoaded.current = true;
    (async () => {
      const ann = await loadMarketAnnotations();
      if (ann) {
        setCheckedIds(new Set(ann.checkedIds || []));
        setPinnedItems((ann.pinnedItems || []) as any);
      }
    })();
  }, []);

  // Persist annotations when they change
  const persistAnnotations = useCallback((checked: Set<string>, pinned: typeof pinnedItems) => {
    saveMarketAnnotations({ checkedIds: Array.from(checked), pinnedItems: pinned }).catch(() => {});
  }, []);

  const toggleChecked = useCallback((id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persistAnnotations(next, pinnedItems);
      return next;
    });
  }, [pinnedItems, persistAnnotations]);

  const togglePin = useCallback((type: 'opportunity' | 'allocation', item: MarketOpportunity | AllocationAdvice) => {
    const id = type === 'opportunity' ? `opp-${(item as MarketOpportunity).ticker}` : `alloc-${(item as AllocationAdvice).ticker}-${(item as AllocationAdvice).action}`;
    setPinnedItems(prev => {
      const exists = prev.some(p => (p.type === 'opportunity' ? `opp-${(p.item as MarketOpportunity).ticker}` : `alloc-${(p.item as AllocationAdvice).ticker}-${(p.item as AllocationAdvice).action}`) === id);
      const next = exists
        ? prev.filter(p => (p.type === 'opportunity' ? `opp-${(p.item as MarketOpportunity).ticker}` : `alloc-${(p.item as AllocationAdvice).ticker}-${(p.item as AllocationAdvice).action}`) !== id)
        : [...prev, { type, item, pinnedAt: new Date().toISOString() }];
      persistAnnotations(checkedIds, next);
      return next;
    });
  }, [checkedIds, persistAnnotations]);

  const loadMarketIntelligence = useCallback(async (force = false) => {
    if (loadingRef.current) return;
    if (!apiKey) { setMarketError('Add your Gemini API key in Settings to enable market intelligence.'); return; }
    if (!force) {
      const cached = getCachedReport();
      if (cached) { setMarketReport(cached); return; }
    } else {
      clearMarketCache();
    }
    loadingRef.current = true;
    setMarketLoading(true);
    setMarketError(null);
    setMarketProgress('Initializing...');
    try {
      const result = await generateMarketIntelligence(accounts, setMarketProgress);
      setMarketReport(result);
      // Reset checked items on fresh report (pinned items survive)
      setCheckedIds(new Set());
      persistAnnotations(new Set(), pinnedItems);
    } catch (err: any) {
      setMarketError(err.message || 'Failed to load market intelligence.');
    } finally {
      setMarketLoading(false);
      setMarketProgress('');
      loadingRef.current = false;
    }
  }, [accounts, apiKey, pinnedItems, persistAnnotations]);

  const report = useMemo(
    () => generateIntelligenceReport(accounts, equity, profile, monthlyInv),
    [accounts, equity, profile, monthlyInv],
  );

  const scenarios = useMemo(
    () => modelScenarios(accounts, monthlyInv?.amount || 0, profile),
    [accounts, monthlyInv, profile],
  );

  const totalValue = calculateTotalValue(accounts);
  const nowCount = report.signals.filter(s => s.urgency === 'now').length;
  const soonCount = report.signals.filter(s => s.urgency === 'soon').length;

  const tabs: { id: Tab; label: string; badge?: number; badgeColor?: string; icon?: string }[] = [
    { id: 'advisor', label: 'Advisor', icon: '💡', badgeColor: 'bg-accent/60' },
    { id: 'market', label: 'Market', badgeColor: 'bg-accent/60' },
    { id: 'signals', label: 'Signals', badge: nowCount + soonCount, badgeColor: nowCount > 0 ? 'bg-red-500' : 'bg-amber-500' },
    { id: 'rebalance', label: 'Rebalance', badge: report.rebalanceMoves.length },
    { id: 'gaps', label: 'Gaps', badge: report.diversificationGaps.length },
    { id: 'xray', label: 'X-Ray', icon: '🔬' },
    { id: 'scenarios', label: 'Scenarios' },
  ];

  // No portfolio loaded → don't run grade/signals/rebalance/gaps/scenarios on
  // empty data. Every tab here is downstream of a real holdings list; without
  // one, every panel emits placeholder funds (Vanguard/Fidelity/SPDR), fake
  // scenarios ($1.49M / $2.92M), and a hardcoded grade. Show an empty state
  // until the user connects something.
  if (!hasPortfolio) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Intelligence</h1>
          <p className="text-text-secondary mt-1">Proactive signals and recommendations for your portfolio</p>
        </div>
        <EmptyState
          icon="🧠"
          title="Intelligence runs on your real holdings"
          description="Once you connect a brokerage or import a CSV, Iris generates a grade, deployment brief, rebalance moves, gap analysis, and what-if scenarios — all based on what you actually own."
          ctaLabel="Add a portfolio"
          ctaTarget="portfolio"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="term-label mb-1">Intelligence</div>
          <h1 className="text-2xl font-bold text-text-primary">Intelligence</h1>
          <p className="text-text-secondary mt-1">Proactive signals and recommendations for your portfolio</p>
        </div>
      </div>

      {/* Grade + Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Portfolio Grade */}
        <div className="glass-card p-5 flex items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${GRADE_COLORS[report.portfolioGrade] || GRADE_COLORS.C} flex items-center justify-center text-3xl font-black text-white shadow-lg mono-num`}>
            {report.portfolioGrade}
          </div>
          <div className="flex-1 min-w-0">
            <div className="term-label">Portfolio Grade</div>
            <p className="text-sm text-text-secondary mt-1 line-clamp-2">{report.gradeExplanation}</p>
          </div>
        </div>

        {/* Act Now */}
        <div className="glass-card p-5 relative overflow-hidden cursor-pointer hover:border-white/10 transition-all" onClick={() => setActiveTab('signals')}>
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="term-label">Act Now</div>
            <div className="text-2xl font-bold text-red-400 mt-1 mono-num">{nowCount}</div>
            <p className="text-xs text-text-muted mt-1">Urgent signals</p>
          </div>
        </div>

        {/* Coming Up */}
        <div className="glass-card p-5 relative overflow-hidden cursor-pointer hover:border-white/10 transition-all" onClick={() => setActiveTab('signals')}>
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="term-label">Act Soon</div>
            <div className="text-2xl font-bold text-amber-400 mt-1 mono-num">{soonCount}</div>
            <p className="text-xs text-text-muted mt-1">Worth addressing</p>
          </div>
        </div>

        {/* Top Priority */}
        <div className="glass-card p-5 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="term-label">Top Priority</div>
            <p className="text-sm text-text-primary mt-2 font-medium line-clamp-2">{report.topPriority}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-1 rounded-xl border border-glass-border w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-accent/15 text-accent-light'
                : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
            }`}
          >
            {tab.icon && <span className="text-sm">{tab.icon}</span>}
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white ${tab.badgeColor || 'bg-accent/60'}`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'advisor' && (
        <AdvisorPanel accounts={accounts} monthlyInv={monthlyInv} />
      )}
      {activeTab === 'market' && (
        <MarketPanel
          report={marketReport}
          loading={marketLoading}
          error={marketError}
          progress={marketProgress}
          onLoad={loadMarketIntelligence}
          hasApiKey={!!apiKey}
          checkedIds={checkedIds}
          onToggleChecked={toggleChecked}
          pinnedItems={pinnedItems}
          onTogglePin={togglePin}
        />
      )}
      {activeTab === 'signals' && <SignalsPanel signals={report.signals} expandedId={expandedSignal} onToggle={setExpandedSignal} />}
      {activeTab === 'rebalance' && <RebalancePanel moves={report.rebalanceMoves} risks={report.concentrationRisks} totalValue={totalValue} />}
      {activeTab === 'gaps' && <GapsPanel gaps={report.diversificationGaps} totalValue={totalValue} setView={setView} />}
      {activeTab === 'xray' && <EtfXrayPanel />}
      {activeTab === 'scenarios' && <ScenariosPanel scenarios={scenarios} expandedId={expandedScenario} onToggle={setExpandedScenario} />}
    </div>
  );
}

// ─── Advisor Panel ───
function AdvisorPanel({ accounts, monthlyInv }: { accounts: Account[]; monthlyInv: MonthlyInvestment | undefined }) {
  const defaultAmount = monthlyInv?.amount || 0;
  const [depositAmount, setDepositAmount] = useState(defaultAmount);
  const [showCurrentDCA, setShowCurrentDCA] = useState(false);

  const plan = useMemo(
    () => generateNextDeploymentBrief(accounts, depositAmount, monthlyInv),
    [accounts, depositAmount, monthlyInv],
  );

  const PRIORITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    'gap-fill':  { bg: 'bg-violet-500/10', text: 'text-violet-400', label: 'Gap Fill' },
    'rebalance': { bg: 'bg-amber-500/10',  text: 'text-amber-400',  label: 'Rebalance' },
    'core':      { bg: 'bg-blue-500/10',   text: 'text-blue-400',   label: 'Core' },
    'growth':    { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Growth' },
  };

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="glass-card p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/8 to-violet-500/5 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent/20 to-violet-500/20 flex items-center justify-center text-2xl">💡</div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">Next-deployment Brief</h2>
              <p className="text-xs text-text-secondary">Exactly where your next dollars go — and why it matters for the portfolio.</p>
            </div>
          </div>
          <p className="text-sm text-text-secondary mt-3 leading-relaxed">{plan.summary}</p>
        </div>
      </div>

      {/* Deposit Amount Input */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="term-label">Capital to deploy</label>
          <div className="flex gap-2">
            {[500, 1000, 2000, 3000, 5000].map(amt => (
              <button
                key={amt}
                onClick={() => setDepositAmount(amt)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  depositAmount === amt
                    ? 'bg-accent/15 text-accent-light border border-accent/30'
                    : 'bg-white/5 text-text-muted hover:bg-white/10 border border-transparent'
                }`}
              >
                ${amt.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-lg font-medium">$</span>
          <input
            type="number"
            value={depositAmount}
            onChange={e => setDepositAmount(Math.max(100, Number(e.target.value) || 100))}
            className="w-full bg-surface-2 border border-glass-border rounded-xl px-4 py-3 pl-8 text-2xl font-bold text-text-primary focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* Allocation Visualization */}
      <div className="glass-card p-5">
        <h3 className="term-label mb-4">Your deployment brief</h3>

        {/* Stacked bar visualization */}
        <div className="h-8 rounded-xl overflow-hidden flex mb-4 border border-glass-border">
          {plan.recommendations.map((rec, i) => {
            const colors = [
              'bg-accent', 'bg-violet-500', 'bg-emerald-500', 'bg-blue-500',
              'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500',
            ];
            return (
              <div
                key={rec.ticker}
                className={`${colors[i % colors.length]} transition-all relative group`}
                style={{ width: `${Math.max(rec.percentage, 3)}%` }}
                title={`${rec.ticker}: $${rec.amount.toLocaleString()} (${rec.percentage}%)`}
              >
                {rec.percentage >= 12 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90">
                    {rec.ticker}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Recommendation cards */}
        <div className="space-y-2">
          {plan.recommendations.map((rec, i) => {
            const style = PRIORITY_STYLES[rec.priority] || PRIORITY_STYLES.core;
            const barColors = [
              'from-accent to-accent/60', 'from-violet-500 to-violet-500/60', 'from-emerald-500 to-emerald-500/60',
              'from-blue-500 to-blue-500/60', 'from-amber-500 to-amber-500/60', 'from-rose-500 to-rose-500/60',
              'from-cyan-500 to-cyan-500/60', 'from-indigo-500 to-indigo-500/60',
            ];
            return (
              <div key={rec.ticker} className="p-3 rounded-xl bg-white/[0.02] border border-glass-border hover:border-white/10 transition-all">
                <div className="flex items-center gap-3">
                  {/* Rank */}
                  <div className="text-lg font-black text-text-muted/30 w-6 text-center flex-shrink-0">{i + 1}</div>

                  {/* Ticker badge */}
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br from-accent/15 to-indigo-500/15 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0`}>
                    {rec.ticker}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-text-primary truncate">{rec.name}</span>
                      {rec.isNew && (
                        <span className="cyber-chip text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">New</span>
                      )}
                      <span className={`cyber-chip text-[9px] font-bold flex-shrink-0 ${style.bg} ${style.text}`}>{style.label}</span>
                    </div>
                    <p className="text-xs text-text-muted truncate">{rec.reason}</p>
                    {/* Mini bar */}
                    <div className="h-1.5 bg-surface-3 rounded-full mt-1.5 overflow-hidden">
                      <div className={`h-full rounded-full bg-gradient-to-r ${barColors[i % barColors.length]}`} style={{ width: `${rec.percentage}%` }} />
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-text-primary mono-num">${rec.amount.toLocaleString()}</div>
                    <div className="text-[10px] text-text-muted mono-num">{rec.percentage}%</div>
                  </div>
                </div>
                {rec.why && (
                  <div className="mt-2 pt-2 border-t border-white/5 flex gap-2 ml-9">
                    <span className="term-label flex-shrink-0 mt-0.5">Why</span>
                    <p className="text-xs text-text-secondary italic leading-relaxed">{rec.why}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Insights */}
      {plan.insights.length > 0 && (
        <div className="glass-card p-5 bg-accent/5 border-accent/20">
          <h3 className="term-label mb-3 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            Insights
          </h3>
          <ul className="space-y-2">
            {plan.insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                <span className="text-xs text-text-secondary">{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Current vs Suggested DCA comparison */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="term-label">Monthly DCA Comparison</h3>
          <button
            onClick={() => setShowCurrentDCA(!showCurrentDCA)}
            className="text-xs text-accent hover:text-accent-light transition-colors font-medium"
          >
            {showCurrentDCA ? 'Hide current' : 'Show current'}
          </button>
        </div>

        {showCurrentDCA && plan.currentDCA.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-glass-border">
            <div className="term-label mb-2">Current DCA (${depositAmount.toLocaleString()}/mo)</div>
            <div className="space-y-1.5">
              {plan.currentDCA.map(dca => (
                <div key={dca.ticker} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text-primary">{dca.ticker}</span>
                    <span className="text-xs text-text-muted">{dca.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-muted">{dca.percentage}%</span>
                    <span className="text-xs font-bold text-text-primary">${dca.amount.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-3 rounded-xl bg-accent/5 border border-accent/20">
          <div className="term-label mb-2 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
            Suggested DCA (${depositAmount.toLocaleString()}/mo)
          </div>
          <div className="space-y-1.5">
            {plan.suggestedDCA.map(dca => (
              <div key={dca.ticker} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-text-primary">{dca.ticker}</span>
                  <span className="text-xs text-text-muted truncate">{dca.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted">{dca.percentage}%</span>
                  <span className="text-xs font-bold text-accent">${dca.amount.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-text-muted mt-3 italic">
          Tip: Update your DCA allocations in Settings to match the suggested split. Iris will recalculate next month.
        </p>
      </div>
    </div>
  );
}

// ─── Signals Panel ───
function SignalsPanel({ signals, expandedId, onToggle }: { signals: PortfolioSignal[]; expandedId: string | null; onToggle: (id: string | null) => void }) {
  if (signals.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-4xl mb-3">&#x2714;&#xfe0f;</div>
        <div className="text-lg font-semibold text-text-primary">No signals right now</div>
        <p className="text-sm text-text-secondary mt-2">Your portfolio looks solid. Iris will flag anything that needs attention.</p>
      </div>
    );
  }

  const grouped = {
    now: signals.filter(s => s.urgency === 'now'),
    soon: signals.filter(s => s.urgency === 'soon'),
    watch: signals.filter(s => s.urgency === 'watch'),
  };

  return (
    <div className="space-y-6">
      {grouped.now.length > 0 && (
        <SignalGroup label="Act Now" urgency="now" signals={grouped.now} expandedId={expandedId} onToggle={onToggle} />
      )}
      {grouped.soon.length > 0 && (
        <SignalGroup label="Act Soon" urgency="soon" signals={grouped.soon} expandedId={expandedId} onToggle={onToggle} />
      )}
      {grouped.watch.length > 0 && (
        <SignalGroup label="Watch" urgency="watch" signals={grouped.watch} expandedId={expandedId} onToggle={onToggle} />
      )}
    </div>
  );
}

function SignalGroup({ label, urgency, signals, expandedId, onToggle }: {
  label: string;
  urgency: string;
  signals: PortfolioSignal[];
  expandedId: string | null;
  onToggle: (id: string | null) => void;
}) {
  const colors = URGENCY_COLORS[urgency] || URGENCY_COLORS.watch;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`cyber-chip text-[10px] font-bold ${colors.bg} ${colors.text}`}>{label}</span>
        <span className="text-xs text-text-muted mono-num">{signals.length} signal{signals.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-2">
        {signals.map(signal => (
          <SignalCard key={signal.id} signal={signal} expanded={expandedId === signal.id} onToggle={() => onToggle(expandedId === signal.id ? null : signal.id)} />
        ))}
      </div>
    </div>
  );
}

function SignalCard({ signal, expanded, onToggle }: { signal: PortfolioSignal; expanded: boolean; onToggle: () => void }) {
  const colors = SIGNAL_COLORS[signal.type] || SIGNAL_COLORS.hold;
  return (
    <div className={`rounded-xl border transition-all ${expanded ? 'border-white/10 bg-white/[0.03]' : 'border-glass-border bg-white/[0.01]'} hover:border-white/10`}>
      <div className="p-4 flex items-start gap-3 cursor-pointer" onClick={onToggle}>
        <div className={`mt-0.5 cyber-chip text-[10px] font-bold flex-shrink-0 ${colors.bg} ${colors.text}`}>
          {signal.type}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{signal.title}</span>
          </div>
          {signal.impact && (
            <span className="text-xs text-accent mt-1 block">{signal.impact}</span>
          )}
        </div>
        <span className="text-xs text-text-muted flex-shrink-0">{signal.ticker}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-text-muted transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-glass-border space-y-3">
          <p className="text-sm text-text-secondary leading-relaxed">{signal.reasoning}</p>
          {signal.taxNote && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <span className="text-violet-400 text-xs font-bold uppercase tracking-wider flex-shrink-0 mt-0.5">Tax Note</span>
              <p className="text-xs text-violet-300">{signal.taxNote}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Rebalance Panel ───
function RebalancePanel({ moves, risks, totalValue: _totalValue }: { moves: RebalanceMove[]; risks: ConcentrationRisk[]; totalValue: number }) {
  const trims = moves.filter(m => m.action === 'trim');
  const adds = moves.filter(m => m.action === 'add');

  return (
    <div className="space-y-6">
      {/* Concentration Risks */}
      {risks.length > 0 && (
        <div>
          <h3 className="term-label mb-3">Concentration Map</h3>
          <div className="glass-card p-4">
            <div className="space-y-3">
              {risks.map(risk => {
                const overTarget = risk.percentage > risk.targetPct * 1.3;
                return (
                  <div key={risk.sector}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-text-primary font-medium">{risk.sector}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold mono-num ${overTarget ? 'text-amber-400' : 'text-text-secondary'}`}>
                          {risk.percentage.toFixed(1)}%
                        </span>
                        <span className="text-xs text-text-muted mono-num">/ {risk.targetPct}% target</span>
                      </div>
                    </div>
                    <div className="h-2 bg-surface-3 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full transition-all ${overTarget ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-accent to-blue-400'}`}
                        style={{ width: `${Math.min(risk.percentage, 100)}%` }}
                      />
                      {/* Target marker */}
                      <div
                        className="absolute top-0 h-full w-0.5 bg-white/30"
                        style={{ left: `${Math.min(risk.targetPct, 100)}%` }}
                      />
                    </div>
                    {overTarget && (
                      <p className="text-xs text-text-muted mt-1">{risk.recommendation}</p>
                    )}
                    {/* Show top tickers */}
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      {risk.tickers.slice(0, 4).map(t => (
                        <span
                          key={t.ticker}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${t.conviction ? 'bg-amber-500/10 text-amber-300' : 'bg-white/5 text-text-muted'}`}
                          title={t.conviction ? 'Conviction hold — excluded from trim math' : undefined}
                        >
                          {t.ticker}{t.conviction ? ' ⭐' : ''} {formatCurrency(t.value)} ({t.pct.toFixed(1)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Trim / Add suggestions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {trims.length > 0 && (
          <div>
            <h3 className="term-label text-red-400 mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
              Trim (Overweight)
            </h3>
            <div className="space-y-2">
              {trims.map(move => (
                <div key={move.ticker} className="glass-card p-4 border-red-500/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-text-primary">{move.ticker}</span>
                    <span className="text-sm font-bold text-red-400 mono-num">-{formatCurrency(move.suggestedAmount)}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-text-muted mono-num">{move.currentPct.toFixed(1)}%</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    <span className="text-xs text-emerald-400 mono-num">{move.targetPct}%</span>
                    {move.hasConvictionInSector && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300"
                        title="Sector contains conviction holdings — excluded from trim math"
                      >
                        ⭐ conviction carved out
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">{move.reason}</p>
                  {move.why && (
                    <div className="mt-2 pt-2 border-t border-white/5 flex gap-2">
                      <span className="term-label flex-shrink-0 mt-0.5">Why</span>
                      <p className="text-xs text-text-secondary italic leading-relaxed">{move.why}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {adds.length > 0 && (
          <div>
            <h3 className="term-label text-emerald-400 mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              Add (Underweight)
            </h3>
            <div className="space-y-2">
              {adds.map(move => (
                <div key={move.ticker} className="glass-card p-4 border-emerald-500/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-text-primary">{move.ticker}</span>
                    <span className="text-sm font-bold text-emerald-400 mono-num">+{formatCurrency(move.suggestedAmount)}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-text-muted mono-num">{move.currentPct.toFixed(1)}%</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    <span className="text-xs text-emerald-400 mono-num">{move.targetPct}%</span>
                  </div>
                  <p className="text-xs text-text-muted">{move.reason}</p>
                  {move.why && (
                    <div className="mt-2 pt-2 border-t border-white/5 flex gap-2">
                      <span className="term-label flex-shrink-0 mt-0.5">Why</span>
                      <p className="text-xs text-text-secondary italic leading-relaxed">{move.why}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {trims.length === 0 && adds.length === 0 && (
        <div className="glass-card p-8 text-center">
          <div className="text-lg font-semibold text-text-primary">Portfolio is well-balanced</div>
          <p className="text-sm text-text-secondary mt-2">No rebalancing moves needed right now.</p>
        </div>
      )}
    </div>
  );
}

// ─── Gaps Panel ───
function GapsPanel({ gaps, totalValue, setView }: { gaps: DiversificationGap[]; totalValue: number; setView: (v: any) => void }) {
  if (gaps.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-lg font-semibold text-text-primary">No major diversification gaps</div>
        <p className="text-sm text-text-secondary mt-2">Your portfolio has reasonable sector coverage.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">Sectors where you have little or no exposure. Adding these improves your portfolio's resilience.</p>
      {gaps.map(gap => (
        <div key={gap.sector} className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-semibold text-text-primary">{gap.sector}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-red-400 font-bold mono-num">Current: {gap.currentPct.toFixed(1)}%</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <span className="text-xs text-emerald-400 font-bold mono-num">Target: {gap.recommendedPct}%</span>
              </div>
            </div>
            <div className="text-right">
              <div className="term-label">To reach target</div>
              <div className="text-sm font-bold text-accent mono-num">{formatCurrency(totalValue * (gap.recommendedPct - gap.currentPct) / 100)}</div>
            </div>
          </div>
          <div className="space-y-2">
            {gap.suggestedETFs.map(etf => (
              <div key={etf.ticker} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-glass-border">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/20 to-indigo-500/20 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                  {etf.ticker}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary">{etf.name}</div>
                  <div className="text-xs text-text-muted">{etf.why}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="glass-card p-4 bg-accent/5 border-accent/20">
        <p className="text-xs text-text-secondary">
          <strong className="text-accent">Tip:</strong> You don't need to fill every gap at once. Direct your next 2-3 monthly investments toward the biggest gaps. Ask Iris for a specific allocation plan.
        </p>
        <button onClick={() => setView('chat')} className="mt-2 text-xs text-accent hover:text-accent-light transition-colors font-medium">
          Ask Iris for help →
        </button>
      </div>
    </div>
  );
}

// ─── Market Panel ───

function MarketPanel({ report, loading, error, progress, onLoad, hasApiKey, checkedIds, onToggleChecked, pinnedItems, onTogglePin }: {
  report: MarketIntelligenceReport | null;
  loading: boolean;
  error: string | null;
  progress: string;
  onLoad: (force?: boolean) => void;
  hasApiKey: boolean;
  checkedIds: Set<string>;
  onToggleChecked: (id: string) => void;
  pinnedItems: Array<{ type: 'opportunity' | 'allocation'; item: MarketOpportunity | AllocationAdvice; pinnedAt: string }>;
  onTogglePin: (type: 'opportunity' | 'allocation', item: MarketOpportunity | AllocationAdvice) => void;
}) {
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Not loaded yet — show CTA
  if (!report && !loading && !error) {
    return (
      <div className="glass-card p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-indigo-500/20 flex items-center justify-center mx-auto">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">AI Market Intelligence</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-md mx-auto">
            Iris will scan current market conditions, news, and events filtered to your specific holdings using Gemini + live web search.
          </p>
        </div>
        <button
          onClick={() => onLoad(false)}
          disabled={!hasApiKey}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-accent to-indigo-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {hasApiKey ? 'Scan Markets' : 'Add Gemini API Key in Settings'}
        </button>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="glass-card p-6 flex items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-text-primary">Analyzing your portfolio...</p>
            <p className="text-xs text-text-muted mt-0.5">{progress || 'Connecting to Gemini + Google Search...'}</p>
          </div>
        </div>
        {/* Skeleton cards */}
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="glass-card p-5 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/5" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-white/5 rounded w-1/3" />
                <div className="h-3 bg-white/5 rounded w-2/3" />
              </div>
              <div className="w-16 h-6 bg-white/5 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="glass-card p-6 border-red-500/20">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Market scan failed</p>
            <p className="text-xs text-text-muted mt-1">{error}</p>
          </div>
          <button onClick={() => onLoad(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-text-secondary hover:bg-white/10 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const sentimentStyle = MARKET_SENTIMENT_COLORS[report.overview.sentiment] || MARKET_SENTIMENT_COLORS.mixed;
  const timeAgo = getTimeAgo(report.generatedAt);

  return (
    <div className="space-y-6">
      {/* Market Overview */}
      <div className="glass-card p-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="term-label">Market Pulse</h3>
              <span className={`cyber-chip text-[10px] font-bold ${sentimentStyle.bg} ${sentimentStyle.text}`}>
                {sentimentStyle.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted">{timeAgo}</span>
              <button
                onClick={() => onLoad(true)}
                disabled={loading}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-all"
                title="Refresh market data"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
              </button>
            </div>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">{report.overview.summary}</p>
          {report.overview.sectorRotation && (
            <p className="text-xs text-text-muted mt-2 italic">{report.overview.sectorRotation}</p>
          )}
        </div>
      </div>

      {/* Key Events */}
      {report.overview.keyEvents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {report.overview.keyEvents.map((event, i) => (
            <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.02] border border-glass-border">
              <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
              <span className="text-xs text-text-secondary">{event}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top Opportunity + Top Risk */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {report.topOpportunity && (
          <div className="glass-card p-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
            <div className="relative">
              <div className="term-label text-emerald-400 mb-1.5">Top Opportunity</div>
              <p className="text-sm text-text-primary">{report.topOpportunity}</p>
            </div>
          </div>
        )}
        {report.topRisk && (
          <div className="glass-card p-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none" />
            <div className="relative">
              <div className="term-label text-red-400 mb-1.5">Top Risk</div>
              <p className="text-sm text-text-primary">{report.topRisk}</p>
            </div>
          </div>
        )}
      </div>

      {/* Pinned Items (survive refreshes) */}
      {pinnedItems.length > 0 && (
        <div>
          <h3 className="term-label mb-3 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-accent"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
            Pinned
          </h3>
          <div className="space-y-2">
            {pinnedItems.map((pinned, i) => {
              const id = pinned.type === 'opportunity'
                ? `opp-${(pinned.item as MarketOpportunity).ticker}`
                : `alloc-${(pinned.item as AllocationAdvice).ticker}-${(pinned.item as AllocationAdvice).action}`;
              const isChecked = checkedIds.has(id);
              return (
                <div key={i} className={`glass-card p-4 flex items-start gap-3 border-accent/20 ${isChecked ? 'opacity-50' : ''}`}>
                  <button onClick={() => onToggleChecked(id)}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                      isChecked ? 'bg-accent border-accent' : 'border-text-muted/30 hover:border-accent/50'
                    }`}>
                    {isChecked && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                  </button>
                  <div className="flex-1 min-w-0">
                    {pinned.type === 'opportunity' ? (
                      <>
                        <div className={`text-sm font-semibold ${isChecked ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                          {(pinned.item as MarketOpportunity).ticker} — {(pinned.item as MarketOpportunity).name}
                        </div>
                        <p className="text-xs text-text-secondary mt-1">{(pinned.item as MarketOpportunity).reasoning}</p>
                      </>
                    ) : (
                      <>
                        <div className={`text-sm font-semibold ${isChecked ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                          {((pinned.item as AllocationAdvice).action ?? '').toUpperCase()} {(pinned.item as AllocationAdvice).ticker} — {(pinned.item as AllocationAdvice).name}
                        </div>
                        <p className="text-xs text-text-secondary mt-1">{(pinned.item as AllocationAdvice).reasoning}</p>
                      </>
                    )}
                  </div>
                  <button onClick={() => onTogglePin(pinned.type, pinned.item)}
                    className="p-1 text-accent hover:text-accent-light transition-colors flex-shrink-0" title="Unpin">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly Allocation Advice */}
      <div>
        <h3 className="term-label mb-1">This Month&apos;s DCA Changes</h3>
        <p className="text-xs text-text-muted mb-3">Top changes to your monthly investment — do these first.</p>
        {report.monthlyAllocationAdvice.length === 0 ? (
          <div className="glass-card p-4 text-center text-xs text-text-muted">
            No DCA changes returned this run. Click <span className="text-accent">Refresh</span> above to regenerate.
          </div>
        ) : (
          <div className="space-y-2">
            {report.monthlyAllocationAdvice.map((advice, i) => {
              const actionColors: Record<string, { bg: string; text: string; label: string }> = {
                increase: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Increase' },
                decrease: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Decrease' },
                start: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Start' },
                stop: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Stop' },
              };
              const ac = actionColors[advice.action] || actionColors.increase;
              const allocId = `alloc-${advice.ticker}-${advice.action}`;
              const isChecked = checkedIds.has(allocId);
              const isPinned = pinnedItems.some(p => p.type === 'allocation' && `alloc-${(p.item as AllocationAdvice).ticker}-${(p.item as AllocationAdvice).action}` === allocId);
              return (
                <div key={i} className={`glass-card p-4 flex items-start gap-3 ${isChecked ? 'opacity-50' : ''}`}>
                  <button onClick={() => onToggleChecked(allocId)}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                      isChecked ? 'bg-accent border-accent' : 'border-text-muted/30 hover:border-accent/50'
                    }`}>
                    {isChecked && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold text-text-muted w-4">{advice.priority}.</span>
                    <span className={`cyber-chip text-[10px] font-bold ${ac.bg} ${ac.text}`}>{ac.label}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${isChecked ? 'line-through text-text-muted' : 'text-text-primary'}`}>{advice.ticker} <span className="text-text-muted font-normal">— {advice.name}</span></div>
                    <p className="text-xs text-text-secondary mt-1">{advice.reasoning}</p>
                  </div>
                  <button onClick={() => onTogglePin('allocation', advice)}
                    className={`p-1 transition-colors flex-shrink-0 ${isPinned ? 'text-accent' : 'text-text-muted/30 hover:text-accent/60'}`}
                    title={isPinned ? 'Unpin' : 'Pin for later'}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Opportunities (things you DON'T own) */}
      <div>
        <h3 className="term-label mb-1">New Opportunities</h3>
        <p className="text-xs text-text-muted mb-3">Investments you don't currently own but should consider based on market conditions and your portfolio gaps.</p>
        {report.opportunities.length === 0 ? (
          <div className="glass-card p-4 text-center text-xs text-text-muted">
            No new opportunities returned this run. Click <span className="text-accent">Refresh</span> above to regenerate.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {report.opportunities.map((opp, i) => {
              const oppId = `opp-${opp.ticker}`;
              const isChecked = checkedIds.has(oppId);
              const isPinned = pinnedItems.some(p => p.type === 'opportunity' && (p.item as MarketOpportunity).ticker === opp.ticker);
              return (
                <div key={i} className={`glass-card p-4 ${isChecked ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-2 mb-2">
                    <button onClick={() => onToggleChecked(oppId)}
                      className={`mt-1 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                        isChecked ? 'bg-accent border-accent' : 'border-text-muted/30 hover:border-accent/50'
                      }`}>
                      {isChecked && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                    </button>
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent/20 to-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-accent flex-shrink-0">
                      {opp.ticker}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${isChecked ? 'line-through text-text-muted' : 'text-text-primary'}`}>{opp.name}</div>
                      <div className="text-[10px] text-text-muted">{opp.sector}</div>
                    </div>
                    <button onClick={() => onTogglePin('opportunity', opp)}
                      className={`p-1 transition-colors flex-shrink-0 ${isPinned ? 'text-accent' : 'text-text-muted/30 hover:text-accent/60'}`}
                      title={isPinned ? 'Unpin' : 'Pin for later'}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                    </button>
                  </div>
                  <p className="text-xs text-text-secondary">{opp.reasoning}</p>
                  <p className="text-[10px] text-accent mt-1.5 italic">{opp.relevance}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Holdings Analysis */}
      <div>
        <h3 className="term-label mb-3">Your Holdings</h3>
        <div className="space-y-2">
          {report.holdings.map(holding => (
            <HoldingCard
              key={holding.ticker}
              holding={holding}
              expanded={expandedTicker === holding.ticker}
              onToggle={() => setExpandedTicker(expandedTicker === holding.ticker ? null : holding.ticker)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function HoldingCard({ holding, expanded, onToggle }: { holding: HoldingAnalysis; expanded: boolean; onToggle: () => void }) {
  const colors = SENTIMENT_COLORS[holding.sentiment];

  return (
    <div className={`rounded-xl border transition-all ${expanded ? 'border-white/10 bg-white/[0.03]' : 'border-glass-border bg-white/[0.01]'} hover:border-white/10`}>
      <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={onToggle}>
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br from-accent/15 to-indigo-500/15 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0`}>
          {holding.ticker}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary truncate">{holding.name}</span>
          </div>
          <span className="text-xs text-text-muted truncate block">{holding.verdict}</span>
        </div>
        {holding.currentValue > 0 && (
          <span className="text-xs text-text-muted flex-shrink-0 mono-num">{formatCurrency(holding.currentValue)}</span>
        )}
        <span className={`cyber-chip text-[10px] font-bold flex-shrink-0 ${colors.bg} ${colors.text}`}>
          {holding.sentiment}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-text-muted transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-glass-border space-y-3">
          <p className="text-sm text-text-secondary leading-relaxed">{holding.reasoning}</p>
          {holding.catalysts.length > 0 && (
            <div>
              <div className="term-label mb-1.5">Catalysts</div>
              <div className="flex flex-wrap gap-1.5">
                {holding.catalysts.map((c, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-lg bg-accent/5 border border-accent/10 text-text-secondary">{c}</span>
                ))}
              </div>
            </div>
          )}
          {holding.risk && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
              <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider flex-shrink-0 mt-0.5">Risk</span>
              <p className="text-xs text-red-300/80">{holding.risk}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Scenarios Panel ───
function ScenariosPanel({ scenarios, expandedId, onToggle }: { scenarios: ScenarioResult[]; expandedId: string | null; onToggle: (id: string | null) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">What happens to your portfolio under different assumptions? All projections use 8% average annual return.</p>
      {scenarios.map(scenario => {
        const isExpanded = expandedId === scenario.label;
        const isPositive = scenario.yearlyImpact >= 0;
        return (
          <div key={scenario.label} className="glass-card overflow-hidden transition-all hover:border-white/10">
            <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => onToggle(isExpanded ? null : scenario.label)}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
              }`}>
                {isPositive ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary">{scenario.label}</div>
                <div className="text-xs text-text-muted mt-0.5">{scenario.description}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-sm font-bold mono-num ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}{formatCurrency(scenario.yearlyImpact)}
                </div>
                <div className="text-[10px] text-text-muted">vs current path</div>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={`text-text-muted transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
            {isExpanded && (
              <div className="px-4 pb-4 pt-0 border-t border-glass-border">
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <div>
                    <div className="term-label">Monthly Change</div>
                    <div className={`text-lg font-bold mt-1 mono-num ${scenario.monthlyChange > 0 ? 'text-emerald-400' : scenario.monthlyChange < 0 ? 'text-red-400' : 'text-text-secondary'}`}>
                      {scenario.monthlyChange > 0 ? '+' : ''}{scenario.monthlyChange === 0 ? '-' : `$${Math.abs(scenario.monthlyChange).toLocaleString()}`}
                    </div>
                  </div>
                  <div>
                    <div className="term-label">Projected Value</div>
                    <div className="text-lg font-bold mt-1 text-text-primary mono-num">{formatCurrency(scenario.projectedValue)}</div>
                  </div>
                  <div>
                    <div className="term-label">Impact at Retirement</div>
                    <div className={`text-lg font-bold mt-1 mono-num ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isPositive ? '+' : ''}{formatCurrency(scenario.yearlyImpact)}
                    </div>
                  </div>
                </div>
                {!isPositive && Math.abs(scenario.yearlyImpact) > 100000 && (
                  <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-300">
                      That's {formatCurrency(Math.abs(scenario.yearlyImpact))} less at retirement. Compound interest is working against you in this scenario — every dollar not invested today costs you ~$10+ at retirement.
                    </p>
                  </div>
                )}
                {isPositive && scenario.yearlyImpact > 500000 && (
                  <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-xs text-emerald-300">
                      That's {formatCurrency(scenario.yearlyImpact)} more at retirement. This is the power of compound interest — small monthly increases have outsized long-term effects.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
