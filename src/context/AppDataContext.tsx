import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Account, EquityProfile, UserProfile, MonthlyInvestment, ChatMessage, PortfolioSnapshot } from '../types/portfolio';
import type { View } from '../types/views';
import {
  getAllAccounts, saveAccount, getEquityProfile, saveEquityProfile,
  getUserProfile, saveUserProfile, getMonthlyInvestments, saveMonthlyInvestment,
  getChatHistory, saveChatMessage, clearChatHistory, getSetting, saveSetting,
  clearAllAccounts, clearAllPortfolioData, saveSnapshot, getSnapshots, clearSnapshots,
} from '../stores/portfolioStore';
import { defaultAccounts, defaultEquityProfile, defaultUserProfile, defaultMonthlyInvestment } from '../stores/defaultData';
import {
  calculateSectorAllocation, calculateHealthMetrics, calculateOverallScore,
  formatCurrency, formatPercent, getAccountTypeLabel,
  getRetirementProjection,
} from '../utils/calculations';
import { initGemini, isGeminiInitialized, chatStream as geminiChatStream, buildRouterChatMessages } from '../services/gemini';
import type { BudgetContext } from '../services/gemini';
import { setupLLMRouter, getRouter, hasRouter } from '../services/llm';
import type { LLMRoutingPreference } from '../types/llm';
import { refreshAllPrices, applyPricesToAccounts } from '../services/marketDataApi';
import { defaultPaycheck, defaultBudgetBuckets, defaultSinkingFunds, defaultFunMoney, calculateBudgetSummary } from '../stores/budgetDefaults';
import { isOverBudget } from '../utils/budgetLanes';
import type { ActionItem } from '../components/ActionItems/ActionItems';
import { getActionItems, saveAllActionItems, clearAllActionData } from '../stores/actionStore';
import { getBudgetBuckets, getSinkingFunds, getFunMoney, saveFunMoney, getEarners, getPaycheck, getExpenses, getCustomCategories, getDeployConfirmations, clearAllExpenses, clearExpensesBySource, clearAllBudgetData, type DeployConfirmation } from '../stores/budgetStore';
import type { Expense, FunMoney, Earner } from '../types/budget';
import { seedFunMoneyFromEarners, linkFunMoneyToEarners, computeFunMoneySpent } from '../utils/funMoney';
import { computeScorecard } from '../utils/savingsScorecard';
import { computeGameState } from '../utils/gamification';
import { computeSavingsRate } from '../utils/savingsRate';
import {
  evaluateAchievements, captureBaseline, pendingCelebrationNudges,
  type AchievementState, type AchievementContext, type GamificationBaseline, type UnlockRecord,
} from '../utils/achievements';
import type { Nudge } from '../utils/nudgeEngine';
import { setAuditActor } from '../stores/auditLogStore';
import { applyTransactionsToBuckets, computeMonthlySpending, computeSpendingSummary, computeMonthComparison, registerCustomCategories, registerEarnerFunLabels, currentMonthKey } from '../utils/transactionAnalysis';
import type { SpendingSummary, MonthComparison, MonthlySpending } from '../utils/transactionAnalysis';
import { computeSafeToSpend, type SafeToSpend } from '../utils/safeToSpend';
import { applyStashLaneConfig, committedReserves } from '../utils/stashMath';
import { generateInsights } from '../utils/insightsEngine';
import type { Insight } from '../utils/insightsEngine';
import { reconcileActionItems } from '../utils/dynamicActions';

// Re-export these so views don't need to import from deep paths
export { formatCurrency, formatPercent, getAccountTypeLabel, isGeminiInitialized, clearChatHistory, clearAllAccounts, clearAllPortfolioData, clearAllBudgetData, clearAllActionData, clearAllExpenses, clearExpensesBySource, saveSetting, saveAccount, saveUserProfile, saveMonthlyInvestment };

interface AppDataContextValue {
  // State
  accounts: Account[];
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
  equity: EquityProfile | undefined;
  profile: UserProfile | undefined;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | undefined>>;
  monthlyInv: MonthlyInvestment | undefined;
  setMonthlyInv: React.Dispatch<React.SetStateAction<MonthlyInvestment | undefined>>;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  chatLoading: boolean;
  apiKey: string;
  apiKeyInput: string;
  setApiKeyInput: React.Dispatch<React.SetStateAction<string>>;
  actionItems: ActionItem[];
  dashBuckets: ReturnType<typeof defaultBudgetBuckets extends infer T ? () => T : never> extends () => infer R ? R : any;
  dashPaycheck: ReturnType<typeof getPaycheck> extends Promise<infer R> ? NonNullable<R> : any;
  dashSinkingFunds: typeof defaultSinkingFunds;
  dashDeployConfirms: DeployConfirmation[];
  /** Fun-money pots with derived balances — the couples game surface. */
  dashFunMoney: FunMoney[];
  /** Evaluated achievement states (earned + progress) for the Trophy Wall. */
  achievementStates: AchievementState[];
  /** Achievements unlocked THIS session — render as celebration nudges. */
  celebrationNudges: Nudge[];
  /** Dismiss a celebration nudge (the unlock stays permanently recorded). */
  dismissCelebration: (id: string) => void;
  spendingSummary: SpendingSummary | null;
  monthComparison: MonthComparison | null;
  rawExpenses: any[];
  insights: Insight[];
  insightsExpanded: boolean;
  setInsightsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  /** Deep-link intent: which Budget sub-tab to open on next navigation to Budget. */
  budgetSection: 'overview' | 'monthly' | 'expenses' | 'actions' | null;
  setBudgetSection: React.Dispatch<React.SetStateAction<'overview' | 'monthly' | 'expenses' | 'actions' | null>>;
  netWorthSnapshots: PortfolioSnapshot[];
  priceRefreshing: boolean;
  lastPriceRefresh: string | null;
  llmReady: boolean;
  refreshLlmReady: () => Promise<void>;
  // Identity (couples model) — who is using the app right now
  activeUser: string;
  /** The Earner profile matching activeUser by name — null until earners load
   *  or when the active user has no profile (e.g. 'You' fallback). */
  activeEarner: Earner | null;
  earners: Earner[];
  // Refs
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  // Computed
  totalLiquid: number;
  equityValue: number;
  totalNetWorth: number;
  allocations: ReturnType<typeof calculateSectorAllocation>;
  healthMetrics: ReturnType<typeof calculateHealthMetrics>;
  overallScore: number;
  retirement: ReturnType<typeof getRetirementProjection> | null;
  budgetSummary: ReturnType<typeof calculateBudgetSummary>;
  budgetOverBudget: any[];
  /** This month so far (calendar month-to-date) — null until transactions exist for it. */
  monthToDate: MonthlySpending | null;
  safeToSpend: SafeToSpend | null;
  // Callbacks
  sendMessage: (text: string, imageData?: { data: string; mimeType: string }) => Promise<void>;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleActionItemsChange: (items: ActionItem[]) => Promise<void>;
  saveApiKey: () => Promise<void>;
  handleRefreshPrices: () => Promise<void>;
  // View
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

// Fun-money sync — ONE definition for both load paths. Seeds pots from the
// household's Earner profiles when the collection is empty (pre-wizard
// installs), backfills identity fields on legacy rows, then derives
// monthlySpent from THIS calendar month's transactions. The old inline code
// used computeCategoryAverages — a historical average that never moved with
// the month — and matched people by hardcoded name.
async function syncFunMoney(allExpenses: Expense[]): Promise<FunMoney[]> {
  const [loaded, earners] = await Promise.all([getFunMoney(), getEarners()]);
  const base = loaded.length > 0 ? linkFunMoneyToEarners(loaded, earners) : seedFunMoneyFromEarners(earners);
  const updated = computeFunMoneySpent(base, allExpenses);
  const changed = updated.length !== loaded.length || updated.some((f, i) =>
    f.monthlySpent !== loaded[i]?.monthlySpent ||
    f.earnerId !== loaded[i]?.earnerId ||
    f.category !== loaded[i]?.category ||
    f.emoji !== loaded[i]?.emoji ||
    f.startMonth !== loaded[i]?.startMonth ||       // persist the accrual anchor
    f.openingBalance !== loaded[i]?.openingBalance
  );
  if (changed) await saveFunMoney(updated);
  return updated;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}

export function AppDataProvider({ view, setView, setLoading, activeUser, children }: {
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
  setLoading: (v: boolean) => void;
  activeUser: string;
  children: React.ReactNode;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [equity, setEquity] = useState<EquityProfile | undefined>();
  const [profile, setProfile] = useState<UserProfile | undefined>();
  const [monthlyInv, setMonthlyInv] = useState<MonthlyInvestment | undefined>();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [dashBuckets, setDashBuckets] = useState(defaultBudgetBuckets);
  const [dashPaycheck, setDashPaycheck] = useState(defaultPaycheck);
  const [dashSinkingFunds, setDashSinkingFunds] = useState(defaultSinkingFunds);
  const [dashDeployConfirms, setDashDeployConfirms] = useState<DeployConfirmation[]>([]);
  const [dashFunMoney, setDashFunMoney] = useState<FunMoney[]>([]);
  const [achievementStates, setAchievementStates] = useState<AchievementState[]>([]);
  const [celebrationNudges, setCelebrationNudges] = useState<Nudge[]>([]);
  const [spendingSummary, setSpendingSummary] = useState<SpendingSummary | null>(null);
  const [monthComparison, setMonthComparison] = useState<MonthComparison | null>(null);
  const [rawExpenses, setRawExpenses] = useState<any[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsExpanded, setInsightsExpanded] = useState(false);
  const [budgetSection, setBudgetSection] = useState<'overview' | 'monthly' | 'expenses' | 'actions' | null>(null);
  const [netWorthSnapshots, setNetWorthSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [priceRefreshing, setPriceRefreshing] = useState(false);
  const [lastPriceRefresh, setLastPriceRefresh] = useState<string | null>(null);
  const [llmReady, setLlmReady] = useState(false);
  const [earners, setEarners] = useState<Earner[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Identity: stamp audit writes with whoever unlocked the session.
  useEffect(() => {
    setAuditActor(activeUser || null);
  }, [activeUser]);

  const activeEarner = useMemo(() => {
    const key = activeUser.trim().toLowerCase();
    return earners.find(e => e.name.trim().toLowerCase() === key) ?? null;
  }, [earners, activeUser]);

  const refreshLlmReady = useCallback(async () => {
    if (!hasRouter()) { setLlmReady(false); return; }
    try {
      const available = await getRouter().listAvailableProviders();
      setLlmReady(available.length > 0);
    } catch { setLlmReady(false); }
  }, []);

  // Load data on mount
  useEffect(() => {
    async function load() {
     // Cold-start safety (Build-D2c+): a single failed /api/* call (e.g. a
     // paused Supabase, a transient 500) must never wedge the app on
     // "Loading Iris…". try/catch/finally guarantees setLoading(false) always
     // runs; the catch surfaces the failure instead of swallowing it silently.
     try {
      let accts = await getAllAccounts();
      if (accts.length === 0) {
        for (const a of defaultAccounts) await saveAccount(a);
        accts = defaultAccounts;
      }
      // Track whether any migration changed portfolio values — if so, clear old snapshots
      // to prevent phantom gains/losses on the chart from stale pre-migration data
      let migrationChangedValues = false;

      // Migration: update Claire's 401k placeholder with real data
      const wifeAcct = accts.find(a => a.id === 'wife-401k');
      if (wifeAcct && wifeAcct.holdings.some(h => h.ticker === 'UNKNOWN')) {
        const updated = defaultAccounts.find(a => a.id === 'wife-401k');
        if (updated) {
          await saveAccount(updated);
          accts = accts.map(a => a.id === 'wife-401k' ? updated : a);
        }
      }
      // Migration: propagate 401k holding notes (ACTIVE / ROLL TO IRA) to existing data
      for (const acctId of ['abnormal-401k', 'mimecast-401k', 'wife-401k']) {
        const existing = accts.find(a => a.id === acctId);
        const defaults = defaultAccounts.find(a => a.id === acctId);
        if (existing && defaults) {
          let changed = false;
          const updatedHoldings = existing.holdings.map(h => {
            const defaultH = defaults.holdings.find(dh => dh.id === h.id);
            if (defaultH?.notes && h.notes !== defaultH.notes) {
              changed = true;
              return { ...h, notes: defaultH.notes };
            }
            return h;
          });
          if (changed) {
            const updatedAcct = { ...existing, holdings: updatedHoldings };
            await saveAccount(updatedAcct);
            accts = accts.map(a => a.id === acctId ? updatedAcct : a);
          }
        }
      }
      // Migration: crypto consolidation — SHIB+DOGE sold into SOL (Apr 15 2026), ADA removed
      const cryptoAcct = accts.find(a => a.id === 'coinbase-crypto');
      if (cryptoAcct && cryptoAcct.holdings.some(h => h.ticker === 'SHIB' || h.ticker === 'DOGE')) {
        const updatedHoldings = cryptoAcct.holdings
          .filter(h => h.ticker !== 'SHIB' && h.ticker !== 'DOGE' && h.ticker !== 'ADA')
          .map(h => h.ticker === 'SOL' ? { ...h, currentPrice: 4875.22, currentValue: 4875, notes: 'Staked — earning ~6-8% yield. Consolidated from SHIB+DOGE trades (Apr 15)', lastUpdated: '2026-04-15' } : h);
        const updatedCrypto = { ...cryptoAcct, holdings: updatedHoldings, totalValue: updatedHoldings.reduce((s, h) => s + h.currentValue, 0), lastUpdated: '2026-04-15' };
        await saveAccount(updatedCrypto);
        accts = accts.map(a => a.id === 'coinbase-crypto' ? updatedCrypto : a);
      }

      // Migration: fix crypto share counts (were stored as shares=1, price=totalValue)
      // BTC: 1 share @ $236,602 → actual shares using real per-coin price
      // SOL: 1 share @ $4,875 → actual shares using real per-coin price
      const cryptoAcctFix = accts.find(a => a.id === 'coinbase-crypto');
      if (cryptoAcctFix) {
        let cryptoChanged = false;
        const fixedCryptoHoldings = cryptoAcctFix.holdings.map(h => {
          // Detect "total value stored as price" pattern: shares=1 and price > $10,000 for BTC or > $500 for SOL
          if (h.ticker === 'BTC' && h.shares !== 3.16751387) {
            // Exact BTC holding: 3.16751387
            const realShares = 3.16751387;
            cryptoChanged = true;
            return { ...h, shares: realShares, currentValue: Math.round(realShares * h.currentPrice), notes: 'Need actual cost basis' };
          }
          if (h.ticker === 'SOL' && h.shares !== 57.440110974) {
            // Exact SOL holding: 57.440110974 (consolidated from SHIB+DOGE Apr 15)
            const realShares = 57.440110974;
            cryptoChanged = true;
            return { ...h, shares: realShares, currentValue: Math.round(realShares * h.currentPrice), notes: h.notes || 'Staked — earning ~6-8% yield' };
          }
          return h;
        });
        if (cryptoChanged) {
          const fixedCrypto = { ...cryptoAcctFix, holdings: fixedCryptoHoldings, totalValue: fixedCryptoHoldings.reduce((s, h) => s + h.currentValue, 0) };
          await saveAccount(fixedCrypto);
          accts = accts.map(a => a.id === 'coinbase-crypto' ? fixedCrypto : a);
          migrationChangedValues = true;
        }
      }

      // Migration: rename stale ticker SOXX → SOXQ (Invesco PHLX Semiconductor ETF)
      const brokerageAcct = accts.find(a => a.id === 'fidelity-brokerage');
      if (brokerageAcct && brokerageAcct.holdings.some(h => h.ticker === 'SOXX')) {
        const migratedHoldings = brokerageAcct.holdings.map(h =>
          h.ticker === 'SOXX'
            ? { ...h, ticker: 'SOXQ', name: 'Invesco PHLX Semiconductor ETF' }
            : h
        );
        const migratedAcct = { ...brokerageAcct, holdings: migratedHoldings };
        await saveAccount(migratedAcct);
        accts = accts.map(a => a.id === 'fidelity-brokerage' ? migratedAcct : a);
      }

      // Data integrity: recalculate gain/loss from price & cost basis
      let integrityFixed: boolean = false;
      for (const acct of accts) {
        let acctChanged = false;
        const fixedHoldings = acct.holdings.map(h => {
          if (h.avgCostBasis > 0 && h.shares > 0) {
            const correctValue = Math.round(h.shares * h.currentPrice);
            const correctGain = correctValue - Math.round(h.shares * h.avgCostBasis);
            const correctPct = Math.round(((h.currentPrice - h.avgCostBasis) / h.avgCostBasis) * 10000) / 100;
            if (Math.abs(h.totalGainLossPercent - correctPct) > 0.5 || Math.abs(h.currentValue - correctValue) > 10) {
              acctChanged = true;
              return { ...h, currentValue: correctValue, totalGainLoss: correctGain, totalGainLossPercent: correctPct };
            }
          }
          return h;
        });
        if (acctChanged) {
          const fixedAcct = { ...acct, holdings: fixedHoldings, totalValue: fixedHoldings.reduce((s, h) => s + h.currentValue, 0) };
          await saveAccount(fixedAcct);
          accts = accts.map(a => a.id === acct.id ? fixedAcct : a);
          integrityFixed = true;
        }
      }
      if (integrityFixed) migrationChangedValues = true;

      setAccounts(accts);

      let eq = await getEquityProfile();
      // Default equity profile is null (most users don't have employer equity).
      // Persist it as null to skip re-prompting; user can populate via Equity tab.
      if (!eq && defaultEquityProfile) { await saveEquityProfile(defaultEquityProfile); eq = defaultEquityProfile; }
      setEquity(eq);

      let prof = await getUserProfile();
      if (!prof) { await saveUserProfile(defaultUserProfile); prof = defaultUserProfile; }
      setProfile(prof);

      let invs = await getMonthlyInvestments();
      if (invs.length === 0) { await saveMonthlyInvestment(defaultMonthlyInvestment); invs = [defaultMonthlyInvestment]; }
      setMonthlyInv(invs[0]);

      const msgs = await getChatHistory();
      setChatMessages(msgs);

      const key = await getSetting('gemini_api_key');
      if (key) { setApiKey(key); setApiKeyInput(key); initGemini(key); }

      // Router wires Gemini/Claude/OpenAI/Ollama behind one chat() interface.
      // Safe to call even when no keys are set — providers just report unavailable.
      await setupLLMRouter();
      await refreshLlmReady();

      const loadedActions = await getActionItems();
      // Reconcile action items with current portfolio state (updates text with real numbers)
      const reconciledActions = reconcileActionItems(loadedActions, accts, eq || undefined, prof || undefined);
      setActionItems(reconciledActions);
      await saveAllActionItems(reconciledActions);

      // Sync investing bucket budget to real monthly investment amount from Settings
      const investAmt = invs[0]?.amount || 0;
      const syncInvestingBucket = (buckets: typeof defaultBudgetBuckets) =>
        buckets.map(b => b.category === 'investing' ? { ...b, monthlyBudget: investAmt, monthlyActual: investAmt } : b);

      const loadedBuckets = await getBudgetBuckets();
      if (loadedBuckets.length > 0) setDashBuckets(syncInvestingBucket(loadedBuckets));
      else setDashBuckets(syncInvestingBucket(defaultBudgetBuckets));
      const loadedPaycheck = await getPaycheck();
      if (loadedPaycheck) setDashPaycheck(loadedPaycheck);
      const loadedSF = await getSinkingFunds();
      if (loadedSF.length > 0) setDashSinkingFunds(loadedSF);
      // Stash-linked categories drive the reserve lanes (no-op until configured)
      applyStashLaneConfig(loadedSF);
      // Committed stash moves feed Safe-to-Spend (only moved money comes off the top).
      setDashDeployConfirms(await getDeployConfirmations());

      // Register custom categories so analysis displays proper labels/icons
      const customCats = await getCustomCategories();
      if (customCats.length > 0) registerCustomCategories(customCats);

      // Household earners — the couples model's identity spine
      const loadedEarners = await getEarners();
      setEarners(loadedEarners);
      // Fun categories display the earners' names ("Scott's Fun Money") app-wide.
      registerEarnerFunLabels(loadedEarners);

      // Wire transaction analysis into dashboard
      const allExpenses = await getExpenses();
      if (allExpenses.length > 0) {
        setRawExpenses(allExpenses);
        const realExpenses = allExpenses.filter((e: any) =>
          (e.flow || 'outflow') === 'outflow' && (e.transactionType || 'expense') === 'expense'
        );
        const baseBuckets = loadedBuckets.length > 0 ? loadedBuckets : defaultBudgetBuckets;
        const updatedBuckets = syncInvestingBucket(applyTransactionsToBuckets(baseBuckets, realExpenses));
        setDashBuckets(updatedBuckets);
        setSpendingSummary(computeSpendingSummary(allExpenses));
        setMonthComparison(computeMonthComparison(allExpenses));
        // Fun money: seed/link + derive this-month spent (ONE path, see syncFunMoney)
        const updatedFM = await syncFunMoney(allExpenses);
        setDashFunMoney(updatedFM);

        // Generate insights on mount
        setInsights(generateInsights({
          expenses: allExpenses,
          buckets: updatedBuckets,
          paycheck: loadedPaycheck || defaultPaycheck,
          sinkingFunds: loadedSF.length > 0 ? loadedSF : defaultSinkingFunds,
          funMoney: updatedFM,
          monthlyInvestmentAmount: invs[0]?.amount || 0,
          totalLiquidAssets: accts.reduce((s: number, a: Account) => s + a.totalValue, 0),
        }));
      }

      // If migrations changed portfolio values, clear old snapshots to prevent
      // phantom gains/losses on the chart from stale pre-migration data
      if (migrationChangedValues) {
        await clearSnapshots();
      }

      // Save daily net worth snapshot & load history
      const today = new Date().toISOString().split('T')[0];
      const liq = accts.reduce((s: number, a: Account) => s + a.totalValue, 0);
      const eqVal = eq?.totalCurrentValue || 0;
      const hv = prof?.homeValue ?? 0;
      const mb = prof?.mortgageBalance ?? 0;
      const cv = prof?.carValue ?? 0;
      const nw = liq + eqVal + (hv - mb) + cv;
      // Consolidate holdings by ticker for per-ticker price history (used by nudge engine).
      const holdingAgg = new Map<string, { price: number; value: number }>();
      for (const a of accts) {
        for (const h of a.holdings) {
          if (!h.ticker || h.ticker === 'CASH' || h.ticker === 'UNKNOWN') continue;
          const existing = holdingAgg.get(h.ticker);
          if (existing) {
            existing.value += h.currentValue;
          } else {
            holdingAgg.set(h.ticker, { price: h.currentPrice, value: h.currentValue });
          }
        }
      }
      await saveSnapshot({
        date: today,
        totalLiquidNetWorth: liq,
        totalNetWorth: nw,
        accountTotals: accts.map(a => ({ accountId: a.id, value: a.totalValue })),
        holdings: Array.from(holdingAgg.entries()).map(([ticker, v]) => ({ ticker, price: v.price, value: v.value })),
      });
      const snaps = await getSnapshots();
      setNetWorthSnapshots(snaps);

      // Load last price refresh timestamp
      const lastRefresh = await getSetting('last_price_refresh');
      if (lastRefresh) setLastPriceRefresh(lastRefresh);

      // Nudge engine: preserve the prior visit timestamp before overwriting, so
      // the "welcome back" nudge can compare now vs. the previous session.
      const priorVisit = await getSetting('last_visit_at');
      if (priorVisit) await saveSetting('prev_visit_at', priorVisit);
      await saveSetting('last_visit_at', new Date().toISOString());

      // Prices are manual-refresh only (Invest → Refresh Prices) to conserve API calls.
      // lastPriceRefresh timestamp is shown in the UI so the user knows how stale data is.

      // NOTE: SimpleFIN auto-sync removed 2026-05-10. SimpleFIN was deprecated
      // (ADR-0001, 2026-05-01) in favor of the three-connector strategy
      // (Teller + Fidelity OFX + Coinbase API). Connector code lands in
      // Foundation Session 4+. Until then there is no live auto-sync; data
      // arrives via CSV import.
     } catch (err) {
       // eslint-disable-next-line no-console
       console.error('[iris] data load failed:', err);
     } finally {
       // Always clear the loading gate — even on failure the app must render
       // (with defaults) rather than hang on "Loading Iris…".
       setLoading(false);
     }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // Reload shared data when switching to dashboard (fixes cross-view staleness)
  useEffect(() => {
    if (view !== 'dashboard') return;
    (async () => {
      const items = await getActionItems();
      const reconciledItems = reconcileActionItems(items, accounts, equity || undefined, profile);
      setActionItems(reconciledItems);
      const b = await getBudgetBuckets();
      const p = await getPaycheck();
      if (p) setDashPaycheck(p);
      const sf = await getSinkingFunds();
      if (sf.length > 0) setDashSinkingFunds(sf);
      applyStashLaneConfig(sf);
      setDashDeployConfirms(await getDeployConfirmations());
      // Sync investing bucket to real Settings amount
      const invAmt = monthlyInv?.amount || 0;
      const syncInv = (buckets: typeof defaultBudgetBuckets) =>
        buckets.map(bk => bk.category === 'investing' ? { ...bk, monthlyBudget: invAmt, monthlyActual: invAmt } : bk);
      if (b.length > 0) setDashBuckets(syncInv(b));
      else setDashBuckets(syncInv(defaultBudgetBuckets));
      // Re-register custom categories in case new ones were created
      const customCats = await getCustomCategories();
      if (customCats.length > 0) registerCustomCategories(customCats);
      // Re-run transaction analysis
      const allExpenses = await getExpenses();
      if (allExpenses.length > 0) {
        setRawExpenses(allExpenses);
        const realExpenses = allExpenses.filter((e: any) =>
          (e.flow || 'outflow') === 'outflow' && (e.transactionType || 'expense') === 'expense'
        );
        const baseBuckets = b.length > 0 ? b : defaultBudgetBuckets;
        const updatedBuckets = syncInv(applyTransactionsToBuckets(baseBuckets, realExpenses));
        setDashBuckets(updatedBuckets);
        setSpendingSummary(computeSpendingSummary(allExpenses));
        setMonthComparison(computeMonthComparison(allExpenses));
        // Fun money: seed/link + derive this-month spent (ONE path, see syncFunMoney)
        const updatedFM = await syncFunMoney(allExpenses);
        setDashFunMoney(updatedFM);
        setInsights(generateInsights({
          expenses: allExpenses,
          buckets: updatedBuckets,
          paycheck: p || defaultPaycheck,
          sinkingFunds: sf.length > 0 ? sf : defaultSinkingFunds,
          funMoney: updatedFM,
          monthlyInvestmentAmount: invAmt,
          totalLiquidAssets: accounts.reduce((s, a) => s + a.totalValue, 0),
        }));
      }
    })();
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalLiquid = accounts.reduce((s, a) => s + a.totalValue, 0);
  const equityValue = equity?.totalCurrentValue || 0;
  // Real assets default to 0 — user enters actual values via the Wealth wizard step
  // or Settings → Real Assets. Hardcoded fallbacks ($590k home, etc.) leaked one
  // user's data into every fresh install and inflated net worth by ~$380k.
  const homeValue = profile?.homeValue ?? 0;
  const mortgageBalance = profile?.mortgageBalance ?? 0;
  const carValue = profile?.carValue ?? 0;
  const homeEquity = homeValue - mortgageBalance;
  const totalNetWorth = totalLiquid + equityValue + homeEquity + carValue;
  const allocations = calculateSectorAllocation(accounts);
  const healthMetrics = calculateHealthMetrics(accounts, equity);
  const overallScore = calculateOverallScore(healthMetrics);
  const retirement = profile ? getRetirementProjection(totalLiquid + equityValue, profile.monthlyInvestment, profile.retirementAge - profile.age) : null;
  const budgetSummary = calculateBudgetSummary(dashBuckets, dashPaycheck, monthlyInv?.amount);
  // Lane-aware "over": reserves never count (lumpy), fixed bills only past their
  // tolerance, flex the moment they exceed budget — matches the Budget tab.
  const budgetOverBudget = dashBuckets.filter(b => isOverBudget(b.category, b.monthlyActual, b.monthlyBudget));

  // (Paycheck Waterfall machinery deleted 2026-06-11 — the UI was removed and
  // nothing consumed availableMonths / waterfallBuckets / waterfallMonth.)

  // ── Month-to-date: the REAL "this month" axis ──────────────────────────
  // Dashboard "this month" surfaces read these, not the multi-month bucket
  // averages. Null when the current calendar month has no transactions yet.
  const monthToDate = useMemo(() => {
    if (rawExpenses.length === 0) return null;
    const monthly = computeMonthlySpending(rawExpenses);
    return monthly.find(m => m.month === currentMonthKey()) ?? null;
  }, [rawExpenses]);

  const safeToSpend = useMemo(() => {
    if (dashPaycheck.netTakeHome <= 0) return null;
    // Commit model: only reserves COMMITTED (moved to savings) this month come
    // off the top — not the old auto set-aside. Matches the Budget tab's number.
    const committedThisMonth = committedReserves(dashDeployConfirms, currentMonthKey());
    return computeSafeToSpend(rawExpenses, dashBuckets, dashPaycheck.netTakeHome, new Date(), committedThisMonth);
    // dashSinkingFunds is a dep because stash contributions feed the reserve
    // set-aside via the lane registry (applyStashLaneConfig).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawExpenses, dashBuckets, dashPaycheck.netTakeHome, dashSinkingFunds, dashDeployConfirms]);

  // Chat handler
  // Takes the message text as an argument — the input box state lives locally
  // in ChatView now, so a chat keystroke no longer re-renders every context
  // consumer (it used to re-render all ~20 per keypress).
  const sendMessage = useCallback(async (rawText: string, imageData?: { data: string; mimeType: string }) => {
    const text = rawText.trim();
    if (!text && !imageData) return;

    // Decide route. The native Gemini path has Google Search grounding, so it's the
    // default when the user hasn't explicitly picked a different provider.
    // Route via LLMRouter when:
    //   - user picked a specific non-Gemini preferred provider
    //   - user picked 'local-only' fallback order
    //   - Gemini isn't initialized (no key)
    const pref = (await getSetting('llm_preference')) as LLMRoutingPreference | undefined;
    const preferredRaw = await getSetting('preferred_provider');
    const preferred = (preferredRaw === 'gemini' || preferredRaw === 'claude' || preferredRaw === 'openai' || preferredRaw === 'ollama')
      ? preferredRaw
      : 'auto';
    const geminiReady = isGeminiInitialized();
    const preferredIsNonGemini = preferred !== 'auto' && preferred !== 'gemini';
    const useRouter = preferredIsNonGemini || pref === 'local-only' || !geminiReady;

    if (!useRouter && !geminiReady) {
      alert('Please add your Gemini API key in Settings first.');
      setView('settings');
      return;
    }
    if (useRouter && !hasRouter()) {
      alert('LLM router not ready. Open Settings and save your provider configuration.');
      setView('settings');
      return;
    }
    if (useRouter && imageData) {
      alert('Image uploads require Gemini. Switch Preferred provider to Gemini/Auto in Settings, or add a Gemini key.');
      return;
    }

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text || '(screenshot uploaded)', timestamp: new Date().toISOString() };
    setChatMessages(prev => [...prev, userMsg]);
    await saveChatMessage(userMsg);
    setChatLoading(true);

    try {
      const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
      // Load current budget data for context
      const ctxBuckets = await getBudgetBuckets();
      const ctxSF = await getSinkingFunds();
      const ctxFM = await getFunMoney();
      const budgetCtx: BudgetContext = {
        buckets: ctxBuckets.length > 0 ? ctxBuckets : defaultBudgetBuckets,
        sinkingFunds: ctxSF.length > 0 ? ctxSF : defaultSinkingFunds,
        funMoney: ctxFM.length > 0 ? ctxFM : defaultFunMoney,
        paycheck: (await getPaycheck()) || defaultPaycheck,
        actionItems,
        spendingSummary: spendingSummary ? {
          avgMonthlyExpenses: spendingSummary.avgMonthlyExpenses,
          avgMonthlyIncome: spendingSummary.avgMonthlyIncome,
          topCategories: spendingSummary.topCategories.map(c => ({ label: c.label, avgMonthly: c.avgMonthly })),
        } : undefined,
        insights: insights.length > 0 ? insights.map(i => ({ title: i.title, description: i.description, severity: i.severity })) : undefined,
      };
      // Create placeholder message for streaming
      const aiMsgId = (Date.now() + 1).toString();
      const aiMsg: ChatMessage = { id: aiMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() };
      setChatMessages(prev => [...prev, aiMsg]);

      let response: string;
      if (useRouter) {
        const messages = buildRouterChatMessages(text, accounts, equity, profile, history, budgetCtx);
        const result = await getRouter().chat({
          messages,
          options: { temperature: 0.7, maxTokens: 8192 },
          preferProvider: preferred !== 'auto' ? preferred : undefined,
        });
        response = `${result.content}\n\n_via ${result.provider} (${result.model})_`;
        setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: response } : m));
      } else {
        response = await geminiChatStream(text, accounts, equity, profile, history, imageData, budgetCtx, (partial) => {
          setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: partial } : m));
        });
        setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: response } : m));
      }

      await saveChatMessage({ ...aiMsg, content: response });
    } catch (err: any) {
      const errMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: `Error: ${err.message}`, timestamp: new Date().toISOString() };
      setChatMessages(prev => [...prev, errMsg]);
    }
    setChatLoading(false);
  }, [chatMessages, accounts, equity, profile, actionItems, spendingSummary, insights, setView]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      await sendMessage('', { data: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [sendMessage]);

  const handleActionItemsChange = useCallback(async (items: ActionItem[]) => {
    setActionItems(items);
    await saveAllActionItems(items);
  }, []);

  const saveApiKeyFn = useCallback(async () => {
    await saveSetting('gemini_api_key', apiKeyInput);
    setApiKey(apiKeyInput);
    initGemini(apiKeyInput);
    await setupLLMRouter();
    await refreshLlmReady();
  }, [apiKeyInput, refreshLlmReady]);

  const handleRefreshPrices = useCallback(async () => {
    if (priceRefreshing || accounts.length === 0) return;
    setPriceRefreshing(true);
    try {
      const prices = await refreshAllPrices(accounts);
      if (prices.length > 0) {
        const updated = applyPricesToAccounts(accounts, prices);
        for (const a of updated) await saveAccount(a);
        setAccounts(updated);
        // Re-save today's snapshot with refreshed prices
        const today = new Date().toISOString().split('T')[0];
        const freshLiq = updated.reduce((s, a) => s + a.totalValue, 0);
        const eqVal = equity?.totalCurrentValue || 0;
        const hv = profile?.homeValue ?? 0;
        const mb = profile?.mortgageBalance ?? 0;
        const cv = profile?.carValue ?? 0;
        const freshNw = freshLiq + eqVal + (hv - mb) + cv;
        await saveSnapshot({
          date: today,
          totalLiquidNetWorth: freshLiq,
          totalNetWorth: freshNw,
          accountTotals: updated.map(a => ({ accountId: a.id, value: a.totalValue })),
        });
        const freshSnaps = await getSnapshots();
        setNetWorthSnapshots(freshSnaps);
      }
      const ts = new Date().toISOString();
      await saveSetting('last_price_refresh', ts);
      setLastPriceRefresh(ts);
    } catch (err) {
      console.error('[priceRefresh] Manual refresh failed:', err);
      alert('Price refresh failed. Check console for details.');
    } finally {
      setPriceRefreshing(false);
    }
  }, [priceRefreshing, accounts, equity, profile]);

  // Achievements — evaluate whenever the underlying money data changes, persist
  // unlocks + the one-time forward-only baseline, and surface fresh unlocks as
  // celebration nudges. Runs off data already in context; no new load path.
  // Idempotent: persisted unlocks stop a celebration from re-firing. (2026-07-06)
  useEffect(() => {
    if (rawExpenses.length === 0) return;
    let live = true;
    // Debounce until the data streams (expenses, fun money, stashes) settle —
    // capturing the baseline mid-load would snapshot a partial state and fire
    // false unlocks as the rest arrives. One run after ~500ms of quiet.
    const timer = setTimeout(() => void (async () => {
      if (!live) return;
      const scorecard = computeScorecard(rawExpenses);
      const game = computeGameState(scorecard, dashFunMoney, rawExpenses);
      const savingsRate = computeSavingsRate({
        grossMonthly: dashPaycheck.grossMonthly,
        netTakeHome: dashPaycheck.netTakeHome,
        retirement401k: dashPaycheck.retirement401k,
        hsaContribution: dashPaycheck.hsaContribution,
        investing: monthlyInv?.amount || 0,
      }).rate;
      const gotAdvisorTake = Boolean(await getSetting('budget_advisor_review'));
      const actx: AchievementContext = {
        scorecard, game, funMoney: dashFunMoney, stashes: dashSinkingFunds,
        netWorth: totalNetWorth, savingsRate,
        engagement: {
          connectedData: rawExpenses.length > 0,
          createdStash: dashSinkingFunds.length > 0,
          stashCount: dashSinkingFunds.length,
          crushedGoals: dashSinkingFunds.filter((s) => s.achievedAt).length,
          committedMove: dashDeployConfirms.length > 0,
          setFunOpening: dashFunMoney.some((f) => (f.openingBalance ?? 0) > 0 || !!f.startMonth),
          gotAdvisorTake,
          monthsActive: scorecard.fullMonthCount,
        },
      };
      let baseline = (await getSetting<GamificationBaseline>('gamification_baseline')) ?? null;
      if (!baseline) {
        baseline = captureBaseline(actx, new Date().toISOString());
        await saveSetting('gamification_baseline', baseline);
      }
      const unlocked = (await getSetting<UnlockRecord[]>('achievements_unlocked')) ?? [];
      const now = new Date();
      const { states, newlyUnlocked } = evaluateAchievements(actx, baseline, unlocked, now);
      let merged = unlocked;
      if (newlyUnlocked.length > 0) {
        const seen = new Set(unlocked.map((u) => u.id));
        const additions = newlyUnlocked
          .filter((a) => !seen.has(a.id))
          .map((a) => ({ id: a.id, unlockedAt: now.toISOString(), celebrated: false }));
        if (additions.length > 0) {
          merged = [...unlocked, ...additions];
          await saveSetting('achievements_unlocked', merged);
        }
      }
      if (!live) return;
      setAchievementStates(states);
      // Show every not-yet-acknowledged unlock (waits across reloads until dismissed).
      setCelebrationNudges(pendingCelebrationNudges(merged));
    })(), 500);
    return () => { live = false; clearTimeout(timer); };
  }, [rawExpenses, dashFunMoney, dashSinkingFunds, dashDeployConfirms, dashPaycheck, monthlyInv, totalNetWorth]);

  const dismissCelebration = useCallback(async (nudgeId: string) => {
    setCelebrationNudges((prev) => prev.filter((n) => n.id !== nudgeId));
    const id = nudgeId.replace(/^achievement:/, '');
    const unlocked = (await getSetting<UnlockRecord[]>('achievements_unlocked')) ?? [];
    await saveSetting('achievements_unlocked', unlocked.map((u) => (u.id === id ? { ...u, celebrated: true } : u)));
  }, []);

  const value: AppDataContextValue = {
    accounts, setAccounts, equity, profile, setProfile, monthlyInv, setMonthlyInv,
    chatMessages, setChatMessages, chatLoading,
    apiKey, apiKeyInput, setApiKeyInput,
    actionItems, dashBuckets, dashPaycheck, dashSinkingFunds, dashDeployConfirms, dashFunMoney,
    achievementStates, celebrationNudges, dismissCelebration,
    spendingSummary, monthComparison, rawExpenses,
    insights, insightsExpanded, setInsightsExpanded,
    budgetSection, setBudgetSection,
    netWorthSnapshots, priceRefreshing, lastPriceRefresh,
    llmReady, refreshLlmReady,
    chatEndRef, fileInputRef,
    totalLiquid, equityValue, totalNetWorth,
    allocations, healthMetrics, overallScore, retirement,
    budgetSummary, budgetOverBudget, monthToDate, safeToSpend,
    activeUser, activeEarner, earners,
    sendMessage, handleImageUpload, handleActionItemsChange,
    saveApiKey: saveApiKeyFn, handleRefreshPrices,
    view, setView,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
