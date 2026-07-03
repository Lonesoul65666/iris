import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import type { BudgetBucket, SinkingFund, FunMoney, PaycheckBreakdown } from '../../types/budget';
import type { Expense, ExpenseCategory } from '../../types/budget';
import { defaultBudgetBuckets, defaultSinkingFunds, defaultFunMoney, defaultPaycheck, calculateBudgetSummary } from '../../stores/budgetDefaults';
import { saveBudgetBuckets, getBudgetBuckets, saveSinkingFunds, getSinkingFunds, saveFunMoney, getFunMoney, savePaycheck, getPaycheck, getExpenses, saveExpense, getCustomCategories, getBudgetTargetHistory, snapshotBudgetTargets, getDeployConfirmations, saveDeployConfirmation, clearDeployConfirmation, type DeployConfirmation } from '../../stores/budgetStore';
import { getMonthlyInvestments, getSetting, saveSetting } from '../../stores/portfolioStore';
import { computeGuaranteedBase } from '../../utils/savingsScorecard';
import { computeSavingsRate } from '../../utils/savingsRate';
import { computeSafeToSpend } from '../../utils/safeToSpend';
import { applyStashLaneConfig, seedDefaultStashes } from '../../utils/stashMath';
import StashesCard from './StashesCard';
import MoneyMap from './MoneyMap';
import FunMoneyCard from './FunMoneyCard';
import { targetsForMonth, type BudgetTargetSnapshot } from '../../utils/budgetHistory';
import { isGeminiInitialized } from '../../services/gemini';
import ExpenseManager from './ExpenseManager';
import RecurringBills from './RecurringBills';
import IncomeSources from './IncomeSources';
import InflowQuestions from './InflowQuestions';
import TriggerCenter from './TriggerCenter';
import BudgetPulse from './BudgetPulse';
import BudgetEditOverlay from './BudgetEditOverlay';
import WorkReimbursementsCard from './WorkReimbursementsCard';
import VariableSurplusCard from './VariableSurplusCard';
import { auditBudgetEdit, type BudgetDiff } from '../../stores/auditLogStore';
import BucketGroupsManager from './BucketGroupsManager';
import ActionItemsView, { type ActionItem } from '../ActionItems/ActionItems';
import { getActionItems, saveAllActionItems, saveMerchantMapping } from '../../stores/actionStore';
import { applyTransactionsToBuckets, applyMonthToBuckets, computeMonthlySpending, computeCategoryTrends, computeWorkExpenses, registerCustomCategories, isRealExpense, isCompleteMonth, currentMonthKey, emptyMonthlySpending, parseLocalDate, type MonthlySpending, type CategoryTrend } from '../../utils/transactionAnalysis';
import { formatCurrency } from '../../utils/format';
import { laneOf, isOverBudget, RESERVE_ALLOCATIONS, FLEX_APPROACHING, totalReserveSetAside, type BudgetLane } from '../../utils/budgetLanes';
import ScoreRing from '../ui/ScoreRing';
import EmptyState from '../ui/EmptyState';
import { useHasRealData } from '../../hooks/useHasRealData';

function computeBudgetDiffs(
  before: { buckets: BudgetBucket[]; sinkingFunds: SinkingFund[]; funMoney: FunMoney[] },
  after: { buckets: BudgetBucket[]; sinkingFunds: SinkingFund[]; funMoney: FunMoney[] },
): BudgetDiff[] {
  const diffs: BudgetDiff[] = [];

  // Buckets — keyed by category
  const beforeBuckets = new Map(before.buckets.map(b => [b.category, b]));
  const afterBuckets = new Map(after.buckets.map(b => [b.category, b]));
  for (const [cat, b] of afterBuckets) {
    const old = beforeBuckets.get(cat);
    if (!old) {
      diffs.push({ scope: 'bucket', entityId: cat, entityName: b.label, field: '*', oldVal: null, newVal: b, kind: 'added' });
      continue;
    }
    if (old.monthlyBudget !== b.monthlyBudget) {
      diffs.push({ scope: 'bucket', entityId: cat, entityName: b.label, field: 'monthlyBudget', oldVal: old.monthlyBudget, newVal: b.monthlyBudget, kind: 'edited' });
    }
    if (old.label !== b.label) {
      diffs.push({ scope: 'bucket', entityId: cat, entityName: b.label, field: 'label', oldVal: old.label, newVal: b.label, kind: 'edited' });
    }
  }
  for (const [cat, old] of beforeBuckets) {
    if (!afterBuckets.has(cat)) {
      diffs.push({ scope: 'bucket', entityId: cat, entityName: old.label, field: '*', oldVal: old, newVal: null, kind: 'removed' });
    }
  }

  // Stashes (sinkingFunds) — keyed by id
  const beforeStashes = new Map(before.sinkingFunds.map(s => [s.id, s]));
  const afterStashes = new Map(after.sinkingFunds.map(s => [s.id, s]));
  for (const [id, s] of afterStashes) {
    const old = beforeStashes.get(id);
    if (!old) {
      diffs.push({ scope: 'stash', entityId: id, entityName: s.name, field: '*', oldVal: null, newVal: s, kind: 'added' });
      continue;
    }
    if (old.monthlyContribution !== s.monthlyContribution) {
      diffs.push({ scope: 'stash', entityId: id, entityName: s.name, field: 'monthlyContribution', oldVal: old.monthlyContribution, newVal: s.monthlyContribution, kind: 'edited' });
    }
    if (old.targetAmount !== s.targetAmount) {
      diffs.push({ scope: 'stash', entityId: id, entityName: s.name, field: 'targetAmount', oldVal: old.targetAmount, newVal: s.targetAmount, kind: 'edited' });
    }
    if (old.name !== s.name) {
      diffs.push({ scope: 'stash', entityId: id, entityName: s.name, field: 'name', oldVal: old.name, newVal: s.name, kind: 'edited' });
    }
  }
  for (const [id, old] of beforeStashes) {
    if (!afterStashes.has(id)) {
      diffs.push({ scope: 'stash', entityId: id, entityName: old.name, field: '*', oldVal: old, newVal: null, kind: 'removed' });
    }
  }

  // Fun money — keyed by person
  const beforeFm = new Map(before.funMoney.map(f => [f.person, f]));
  const afterFm = new Map(after.funMoney.map(f => [f.person, f]));
  for (const [person, f] of afterFm) {
    const old = beforeFm.get(person);
    if (!old) {
      diffs.push({ scope: 'funmoney', entityId: person, entityName: f.person, field: '*', oldVal: null, newVal: f, kind: 'added' });
      continue;
    }
    if (old.monthlyBudget !== f.monthlyBudget) {
      diffs.push({ scope: 'funmoney', entityId: person, entityName: f.person, field: 'monthlyBudget', oldVal: old.monthlyBudget, newVal: f.monthlyBudget, kind: 'edited' });
    }
  }
  for (const [person, old] of beforeFm) {
    if (!afterFm.has(person)) {
      diffs.push({ scope: 'funmoney', entityId: person, entityName: old.person, field: '*', oldVal: old, newVal: null, kind: 'removed' });
    }
  }

  return diffs;
}

export default function BudgetView() {
  const { hasIncome, hasExpenses } = useHasRealData();
  const hasBudgetData = hasIncome || hasExpenses;
  const [section, setSection] = useState<'overview' | 'monthly' | 'expenses' | 'actions'>('overview');
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(-1); // -1 = latest full month
  const [buckets, setBuckets] = useState<BudgetBucket[]>(defaultBudgetBuckets);
  const [sinkingFunds, setSinkingFunds] = useState<SinkingFund[]>(defaultSinkingFunds);
  const [funMoney, setFunMoney] = useState<FunMoney[]>(defaultFunMoney);
  const [paycheck, setPaycheck] = useState<PaycheckBreakdown>(defaultPaycheck);
  const [overviewMonth, setOverviewMonth] = useState<string>('latest'); // 'avg', 'latest', or 'YYYY-MM'
  const [loaded, setLoaded] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [drilldownCategory, setDrilldownCategory] = useState<string | null>(null);
  // Inline reclassify (from the category drilldown): which txn is being moved.
  const [reclassify, setReclassify] = useState<{ id: string; cat: string; all: boolean; work: boolean } | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlySpending[]>([]);
  const [targetHistory, setTargetHistory] = useState<BudgetTargetSnapshot[]>([]);
  const [, setCategoryTrends] = useState<CategoryTrend[]>([]);
  // Planned→confirmed deploys (Money Map honesty layer) — manual confirm of the
  // monthly investment so the lane reads as real, not an inferred Settings guess.
  const [deployConfirms, setDeployConfirms] = useState<DeployConfirmation[]>([]);

  // ── Edit mode state ──
  // Daily Budget tab is read-only. Editing happens in a dedicated mode that
  // hides read sections and surfaces budget editors. Cancel restores from a
  // snapshot taken at edit-start; Save logs a diff to the audit log.
  const [editMode, setEditMode] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const editSnapshot = useRef<{
    buckets: BudgetBucket[];
    sinkingFunds: SinkingFund[];
    funMoney: FunMoney[];
  } | null>(null);

  const startEdit = useCallback(() => {
    editSnapshot.current = {
      buckets: structuredClone(buckets),
      sinkingFunds: structuredClone(sinkingFunds),
      funMoney: structuredClone(funMoney),
    };
    setEditDirty(false);
    setEditMode(true);
  }, [buckets, sinkingFunds, funMoney]);

  const cancelEdit = useCallback(async () => {
    const snap = editSnapshot.current;
    if (snap) {
      setBuckets(snap.buckets);
      setSinkingFunds(snap.sinkingFunds);
      setFunMoney(snap.funMoney);
      await Promise.all([
        saveBudgetBuckets(snap.buckets),
        saveSinkingFunds(snap.sinkingFunds),
        saveFunMoney(snap.funMoney),
      ]);
    }
    editSnapshot.current = null;
    setEditDirty(false);
    setEditMode(false);
  }, []);

  const saveEdit = useCallback(async () => {
    const snap = editSnapshot.current;
    if (snap) {
      const diffs = computeBudgetDiffs(snap, { buckets, sinkingFunds, funMoney });
      if (diffs.length > 0) await auditBudgetEdit(diffs);
    }
    editSnapshot.current = null;
    setEditDirty(false);
    setEditMode(false);
  }, [buckets, sinkingFunds, funMoney]);

  // Inline "+ Add bucket" form state. null = collapsed (button visible);
  // object = form open with these field values.
  const [newBucket, setNewBucket] = useState<{ label: string; icon: string; monthlyBudget: string } | null>(null);

  const addBucket = useCallback(async () => {
    if (!newBucket) return;
    const label = newBucket.label.trim();
    const budget = Number(newBucket.monthlyBudget);
    if (!label || !budget || budget <= 0) return;
    const fresh: BudgetBucket = {
      category: `custom_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      label,
      icon: newBucket.icon || '📦',
      monthlyBudget: budget,
      monthlyActual: 0,
      color: '#8b5cf6',
      guideline: '',
      guidelinePercent: 0,
    };
    const updated = [...buckets, fresh];
    setBuckets(updated);
    await saveBudgetBuckets(updated);
    setNewBucket(null);
  }, [newBucket, buckets]);

  // Track dirty state via shallow stringify-compare against snapshot.
  useEffect(() => {
    if (!editMode || !editSnapshot.current) return;
    const snap = editSnapshot.current;
    const dirty =
      JSON.stringify(buckets) !== JSON.stringify(snap.buckets) ||
      JSON.stringify(sinkingFunds) !== JSON.stringify(snap.sinkingFunds) ||
      JSON.stringify(funMoney) !== JSON.stringify(snap.funMoney);
    setEditDirty(dirty);
  }, [editMode, buckets, sinkingFunds, funMoney]);

  const loadExpenses = useCallback(async () => {
    const e = await getExpenses();
    setExpenses(e);
    // Auto-calculate actuals from real transaction data
    if (e.length > 0) {
      const realExpenses = e.filter(isRealExpense);
      const monthly = computeMonthlySpending(e);
      setMonthlyData(monthly);
      setCategoryTrends(computeCategoryTrends(realExpenses));
      // Update budget buckets with real averages (calendar-complete months only)
      const invs = await getMonthlyInvestments();
      const invAmt = invs[0]?.amount || 0;
      // monthlyActual is DERIVED from transactions — computed in memory, never
      // persisted. Writing it back on every view was the bucket-clobber
      // mechanism (and a side effect inside a setState updater, which runs
      // twice under StrictMode). Budgets persist only when the user edits them.
      setBuckets(prev => {
        let updated = applyTransactionsToBuckets(prev, realExpenses);
        updated = updated.map(bk => bk.category === 'investing' ? { ...bk, monthlyBudget: invAmt, monthlyActual: invAmt } : bk);
        return updated;
      });
    }
  }, []);

  const handleActionItemsChange = useCallback(async (items: ActionItem[]) => {
    setActionItems(items);
    await saveAllActionItems(items);
  }, []);

  // Confirm / un-confirm this month's investing deposit (Money Map). Toggle:
  // first tap locks it as moved, tapping again undoes it. Optimistic + persisted.
  const toggleInvestConfirm = useCallback(async (month: string, amount: number) => {
    const existing = deployConfirms.find(c => c.month === month && c.lane === 'investing');
    if (existing) {
      setDeployConfirms(prev => prev.filter(c => !(c.month === month && c.lane === 'investing')));
      await clearDeployConfirmation(month, 'investing');
    } else {
      const c: DeployConfirmation = { month, lane: 'investing', amount, confirmedAt: new Date().toISOString() };
      setDeployConfirms(prev => [...prev, c]);
      await saveDeployConfirmation(c);
    }
  }, [deployConfirms]);

  // Inline reclassify from the category drilldown. One-off by default (just this
  // txn); "apply to all" also moves every same-merchant txn AND writes a merchant
  // mapping so future imports follow. Work toggle moves it into the work lane
  // (out of spend). Reuses the same engine as ExpenseManager (saveExpense +
  // saveMerchantMapping), then loadExpenses() refreshes the drilldown + bars.
  const applyReclassify = useCallback(async (e: Expense) => {
    if (!reclassify || reclassify.id !== e.id) return;
    const work = reclassify.work;
    const cat = (work ? 'travel_work' : reclassify.cat) as ExpenseCategory;
    const patch = (x: Expense): Expense => ({
      ...x,
      category: cat,
      isWorkExpense: work,
      reimbursementStatus: work ? 'pending' : (x.isWorkExpense ? 'not_reimbursable' : x.reimbursementStatus),
    });
    if (reclassify.all) {
      const key = (e.description || '').toLowerCase();
      const matches = expenses.filter(x => (x.description || '').toLowerCase() === key);
      for (const m of matches) await saveExpense(patch(m));
      await saveMerchantMapping({ original: e.description, displayName: e.description, category: cat, isWorkExpense: work });
    } else {
      await saveExpense(patch(e));
    }
    setReclassify(null);
    await loadExpenses();
  }, [reclassify, expenses, loadExpenses]);

  useEffect(() => {
    async function load() {
      let b = await getBudgetBuckets();
      if (b.length === 0) { await saveBudgetBuckets(defaultBudgetBuckets); b = defaultBudgetBuckets; }

      // Ensure investing bucket exists and is synced to Settings amount
      const invs = await getMonthlyInvestments();
      const investAmt = invs[0]?.amount || 0;
      const hasInvesting = b.some(bk => bk.category === 'investing');
      if (!hasInvesting) {
        // Inject investing bucket right after housing (position 1 in the array)
        const housingIdx = b.findIndex(bk => bk.category === 'housing');
        const investBucket: BudgetBucket = {
          category: 'investing', label: 'Monthly Investing', icon: '📈',
          monthlyBudget: investAmt, monthlyActual: investAmt,
          color: '#818cf8', guideline: 'Pay yourself first. Synced from your investment settings.',
          guidelinePercent: 15,
        };
        b.splice(housingIdx + 1, 0, investBucket);
        await saveBudgetBuckets(b);
      } else {
        b = b.map(bk => bk.category === 'investing' ? { ...bk, monthlyBudget: investAmt, monthlyActual: investAmt } : bk);
      }
      setBuckets(b);

      let sf = await getSinkingFunds();
      if (sf.length === 0) { await saveSinkingFunds(defaultSinkingFunds); sf = defaultSinkingFunds; }
      // One-time Stash seeding (docs/stashes-design.md D5): make sure taxes and
      // personal travel are covered by real, editable stashes.
      const seeded = await getSetting('stashes_seeded_v1');
      if (!seeded) {
        const withSeeds = seedDefaultStashes(sf);
        if (withSeeds) { sf = withSeeds; await saveSinkingFunds(sf); }
        await saveSetting('stashes_seeded_v1', 'true');
      }
      applyStashLaneConfig(sf);
      setSinkingFunds(sf);

      // Target history — baseline snapshot on first run so "the goals that
      // month" resolves to SOMETHING for every month from today forward.
      let th = await getBudgetTargetHistory();
      if (th.length === 0) {
        await snapshotBudgetTargets(b);
        th = await getBudgetTargetHistory();
      }
      setTargetHistory(th);

      let fm = await getFunMoney();
      if (fm.length === 0) { await saveFunMoney(defaultFunMoney); fm = defaultFunMoney; }
      setFunMoney(fm);

      const p = await getPaycheck();
      const loadedPaycheck = p ?? defaultPaycheck;
      if (!p) await savePaycheck(defaultPaycheck);
      setPaycheck(loadedPaycheck);
      const actions = await getActionItems();
      setActionItems(actions);

      setDeployConfirms(await getDeployConfirmations());

      // Register custom categories for proper label display
      const cc = await getCustomCategories();
      if (cc.length > 0) registerCustomCategories(cc);

      setLoaded(true);

      // Now load expenses and auto-calculate budget actuals
      const e = await getExpenses();
      setExpenses(e);
      if (e.length > 0) {
        const realExpenses = e.filter(isRealExpense);
        const monthly = computeMonthlySpending(e);
        setMonthlyData(monthly);
        setCategoryTrends(computeCategoryTrends(realExpenses));
        let updatedBuckets = applyTransactionsToBuckets(b, realExpenses);
        // Keep investing synced (transaction analysis won't have investing transactions)
        updatedBuckets = updatedBuckets.map(bk => bk.category === 'investing' ? { ...bk, monthlyBudget: investAmt, monthlyActual: investAmt } : bk);
        setBuckets(updatedBuckets);
        // (no saveBudgetBuckets here — derived actuals stay in memory; see loadExpenses)

        // Auto-derive paycheck from the GUARANTEED BASE income when the user
        // hasn't set it — NOT the blended average. Variable/RSU/OT is surplus,
        // not part of the monthly budget target (locked architecture:
        // variable = surplus). Base = steady paycheck(s) you can always count on
        // (~$15.8k = 2 × ~$7.9k). netTakeHome is net (direct deposits are net);
        // grossMonthly grosses up at ~28% deductions. User can override in Settings.
        if (loadedPaycheck.grossMonthly === 0 && loadedPaycheck.netTakeHome === 0) {
          const base = computeGuaranteedBase(realExpenses);
          if (base > 0) {
            const derived = {
              ...loadedPaycheck,
              netTakeHome: Math.round(base),
              grossMonthly: Math.round(base / 0.72),
            };
            setPaycheck(derived);
            await savePaycheck(derived);
          }
        }
      }
    }
    load();
  }, []);

  // Available months for overview navigation: calendar-complete months PLUS
  // the in-progress month (clearly labeled). "Latest" = the current month —
  // opening the budget mid-month should show the month you're living in.
  // Completeness only governs the MATH (averages, verdicts, scorecard), never
  // visibility.
  const curMonthKey = currentMonthKey();
  const fullMonths = monthlyData.filter(m => isCompleteMonth(m.month));
  // The CURRENT calendar month is always selectable as the in-progress month —
  // even before a single transaction lands. Without this, on the 1st of a new
  // month you'd be stranded on last month with the → arrow dead until the first
  // import (the "didn't roll over to July" bug). It shows a clean slate until
  // spend arrives (see overviewBuckets → emptyMonthlySpending).
  const overviewInProgress = monthlyData.find(m => m.month === curMonthKey)
    ?? emptyMonthlySpending(curMonthKey);
  const availMonths = [...new Set([
    ...fullMonths.map(m => m.month),
    curMonthKey,
  ])].sort();
  // "Latest" lands on the most recent month with ACTIVITY — not the blank new
  // month. So on the 1st you open to last month's real numbers, and the view
  // auto-advances to the new month the instant its first transaction lands
  // (Scott's "don't roll over until it sees a transaction"). The current month
  // stays in availMonths, so the → arrow can always reach the blank new month
  // like a calendar page that exists but isn't your default view yet.
  const monthsWithData = monthlyData.map(m => m.month).sort();
  const latestWithData = monthsWithData.length > 0 ? monthsWithData[monthsWithData.length - 1] : curMonthKey;
  const resolvedOverviewMonth = overviewMonth === 'latest' ? latestWithData : overviewMonth;
  const overviewIsInProgress = resolvedOverviewMonth === curMonthKey;

  // Per-month buckets for overview. COMPLETE months are judged against the
  // targets in effect back then (budget-target history) — changing a cap today
  // must not rewrite last month's verdicts. The in-progress month and 'avg'
  // use the live targets.
  const overviewBucketsRaw = (() => {
    if (resolvedOverviewMonth === 'avg' || resolvedOverviewMonth === 'latest' || availMonths.length === 0) return buckets;
    // The current month with no transactions yet renders as a clean slate (zero
    // actuals vs live targets) — NOT blended averages, which would look like the
    // fresh month already had ~$14k of spend.
    const monthData = monthlyData.find(m => m.month === resolvedOverviewMonth)
      ?? (resolvedOverviewMonth === curMonthKey ? emptyMonthlySpending(curMonthKey) : undefined);
    if (!monthData) return buckets;
    const histTargets = overviewIsInProgress ? null : targetsForMonth(targetHistory, resolvedOverviewMonth);
    return applyMonthToBuckets(buckets, monthData, histTargets);
  })();

  // ── Investing HONESTY (Scott: "don't pull it until it's real") ──────────
  // The investing lane counts ONLY when the money actually moved: the feed saw a
  // brokerage transfer this month (transactionType='investment' → monthlyData
  // .totalInvestments) OR Scott checked it off (deployConfirmations). Otherwise
  // $0 — planned, not done. Replaces the force-written "$1,000 done" that showed
  // before the auto-draft ever hit the account. Feed beats manual (real amount).
  const investMonth = resolvedOverviewMonth === 'avg' ? null : resolvedOverviewMonth;
  const feedInvesting = investMonth ? Math.round(monthlyData.find(m => m.month === investMonth)?.totalInvestments ?? 0) : 0;
  const investingPlanned = overviewBucketsRaw.find(b => b.category === 'investing')?.monthlyBudget ?? 0;
  const investingConfirmedManual = investMonth !== null && deployConfirms.some(c => c.month === investMonth && c.lane === 'investing');
  // 'avg' is a historical blend → treat investing as its planned amount.
  const investingActual = investMonth === null
    ? investingPlanned
    : (feedInvesting > 0 ? feedInvesting : (investingConfirmedManual ? investingPlanned : 0));
  const investingStatus: 'feed' | 'confirmed' | 'planned' =
    feedInvesting > 0 ? 'feed' : (investingConfirmedManual ? 'confirmed' : 'planned');
  const overviewBuckets = overviewBucketsRaw.map(b =>
    b.category === 'investing' ? { ...b, monthlyActual: investingActual } : b);

  const summary = calculateBudgetSummary(overviewBuckets, paycheck);
  // Work expenses always excluded from the bucket views — they net out via
  // reimbursements and surface only in the Avg Work Expenses tile in Monthly
  // Spending. The "Include work expenses" toggle was removed (option A in the
  // simplification pass) since the concept was duplicated across 5 surfaces.
  const filteredBuckets = overviewBuckets.filter(b => b.category !== 'travel_work');
  // "Over" is lane-aware: reserves (taxes/travel) are never over (lumpy by design),
  // fixed bills only count once past their tolerance band, flex counts the moment
  // it exceeds budget. Kills the false "10 categories over" alarm.
  const overBudget = filteredBuckets.filter(b => isOverBudget(b.category, b.monthlyActual, b.monthlyBudget));
  const totalOverage = overBudget.reduce((s, b) => s + (b.monthlyActual - b.monthlyBudget), 0);

  // Budget allocation tracking
  const totalAllocated = filteredBuckets.reduce((s, b) => s + b.monthlyBudget, 0);
  const unallocated = paycheck.netTakeHome - totalAllocated;

  // Essential vs discretionary category lists
  const essentialCats = ['housing', 'investing', 'childcare', 'utilities', 'insurance', 'healthcare', 'kids', 'transportation', 'food_groceries'];
  const isEssential = (cat: string) => essentialCats.includes(cat);

  // Budget health score
  const savingsScore = summary.savingsRate >= 20 ? 90 : summary.savingsRate >= 15 ? 70 : summary.savingsRate >= 10 ? 50 : 25;
  const overageScore = totalOverage === 0 ? 95 : totalOverage < 500 ? 65 : totalOverage < 1000 ? 40 : 20;
  // Housing ratio off NET take-home (the $15,800 frame), and off the SELECTED
  // month's housing (overviewBuckets) — not the blended average (audit fix).
  const housingRatio = paycheck.netTakeHome > 0 ? (overviewBuckets.find(b => b.category === 'housing')?.monthlyActual || 0) / paycheck.netTakeHome * 100 : 0;
  const housingScore = housingRatio <= 30 ? 90 : housingRatio <= 40 ? 65 : 30;
  // ONE month over/under, matching the Money Map's whole-$15,800 view: base −
  // everyday spent − investing − reserve set-aside. summary.surplus excludes the
  // reserve set-aside (reserves are lumpy), so subtracting it here reconciles the
  // Cash Flow score + the Saved/On-Pace tile to the Money Map — the page tells
  // ONE story instead of "over $1,504" (map) vs "+$496" (cash flow). Set-asides
  // ARE a job for the money; being over means everyday ran hot.
  const reserveSetAside = totalReserveSetAside();
  const monthSurplus = summary.surplus - reserveSetAside;
  const surplusScore = monthSurplus > 1000 ? 90 : monthSurplus > 0 ? 60 : 20;
  const overallBudgetScore = Math.round((savingsScore + overageScore + housingScore + surplusScore) / 4);

  // (Paycheck Waterfall removed per Scott 2026-06-11 — the Income Sources panel
  // is the primary engine; the gross-to-net waterfall added no value.)

  if (!loaded) return <div className="text-text-muted">Loading budget...</div>;

  // Computed metrics for overview. ONE definition of operating spend everywhere:
  // exclude work AND all reserve lanes (taxes/travel) — matches summary.realActual,
  // so the watermark tile, Cash Flow sub-score, and Monthly Spend stat agree.
  const operatingBuckets = overviewBuckets.filter(b => laneOf(b.category) !== 'reserve');
  const essentialSpend = operatingBuckets.filter(b => essentialCats.includes(b.category)).reduce((s, b) => s + b.monthlyActual, 0);
  const discretionarySpend = operatingBuckets.filter(b => !essentialCats.includes(b.category) && b.monthlyActual > 0).reduce((s, b) => s + b.monthlyActual, 0);
  const investingAmt = overviewBuckets.find(b => b.category === 'investing')?.monthlyActual || 0;
  // Intentional savings rate: (investing + 401k + HSA) / net take-home (one shared definition)
  const intentionalSavingsRate = computeSavingsRate({
    grossMonthly: paycheck.grossMonthly,
    netTakeHome: paycheck.netTakeHome,
    retirement401k: paycheck.retirement401k,
    hsaContribution: paycheck.hsaContribution,
    investing: investingAmt,
  }).rate;
  // Actual spend for the Monthly Spend stat — operating only (= summary.realActual)
  const totalBucketSpend = operatingBuckets.reduce((s, b) => s + b.monthlyActual, 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header + Tab Bar */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Budget & Cash Flow</h1>
          <p className="text-text-secondary text-sm mt-1">Where your money goes — and where it should go</p>
        </div>
        {section === 'overview' && !editMode && (
          <button
            onClick={startEdit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent-light text-sm font-semibold transition-colors flex-shrink-0"
          >
            <span>✏️</span>
            Edit Budget
          </button>
        )}
      </div>

      {/* Screen-switching Tabs */}
      <div className="flex items-center gap-2">
        {([
          { id: 'overview' as const, label: 'Overview', icon: '📊' },
          { id: 'monthly' as const, label: 'Monthly Detail', icon: '📅' },
          { id: 'expenses' as const, label: 'Transactions', icon: '💳', badge: expenses.length > 0 ? `${expenses.length}` : undefined },
          { id: 'actions' as const, label: 'Action Items', icon: '✅', badge: actionItems.filter(a => !a.completed).length > 0 ? `${actionItems.filter(a => !a.completed).length}` : undefined },
        ]).map(t => (
          <button key={t.id} onClick={() => setSection(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              section === t.id
                ? 'bg-accent/15 text-accent-light border border-accent/30 shadow-sm shadow-accent/10'
                : 'bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-text-secondary border border-transparent'
            }`}>
            <span className="text-base">{t.icon}</span>
            <span>{t.label}</span>
            {'badge' in t && t.badge && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                section === t.id ? 'bg-accent/30 text-accent-light' : 'bg-white/10 text-text-muted'
              }`}>{t.badge}</span>
            )}
          </button>
        ))}
        <div className="flex-1" />
      </div>

      {/* New Transactions banner — surfaces fresh imports + things needing review.
          Visible on overview only; click jumps to the Transactions sub-tab. */}
      {section === 'overview' && !editMode && (() => {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
        // Spending transactions only (real expenses) — income/transfers/refunds
        // don't get reviewed/categorized here, so counting them was misleading.
        // parseLocalDate avoids the UTC off-by-one at the 7-day window edge.
        const recent = expenses.filter(e => parseLocalDate(e.date) >= sevenDaysAgo && isRealExpense(e));
        const needsReview = recent.filter(e => e.category === 'other' || !e.category);
        if (recent.length === 0) return null;
        const hasReview = needsReview.length > 0;
        return (
          <button
            type="button"
            onClick={() => setSection('expenses')}
            className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border text-sm transition-colors ${
              hasReview
                ? 'bg-warning/10 border-warning/30 text-warning hover:bg-warning/15'
                : 'bg-accent/8 border-accent/20 text-text-secondary hover:bg-accent/15'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-base">📥</span>
              <span>
                <strong>{recent.length}</strong> {recent.length === 1 ? 'transaction' : 'transactions'} in the last 7 days
                {hasReview && (
                  <>
                    {' · '}
                    <strong className="text-warning">{needsReview.length}</strong> need{needsReview.length === 1 ? 's' : ''} categorizing
                  </>
                )}
              </span>
            </span>
            <span className="text-xs flex-shrink-0">{hasReview ? 'Review →' : 'View →'}</span>
          </button>
        );
      })()}

      {/* Transactions Section */}
      {section === 'expenses' && (
        <ExpenseManager expenses={expenses} onExpensesChanged={loadExpenses} geminiAvailable={isGeminiInitialized()} />
      )}

      {/* Action Items Section */}
      {section === 'actions' && (
        <ActionItemsView items={actionItems} onItemsChange={handleActionItemsChange} filter="all" />
      )}

      {/* Monthly Detail Section */}
      {section === 'monthly' && monthlyData.length > 0 && (() => {
        // Complete months by CALENDAR + the in-progress month as a navigable
        // entry (clearly labeled, excluded from YTD averages and verdicts).
        const fullMonths = monthlyData.filter(m => isCompleteMonth(m.month));
        const inProgressMonth = monthlyData.find(m => m.month === currentMonthKey()) ?? null;
        const navMonths = inProgressMonth ? [...fullMonths, inProgressMonth] : fullMonths;
        if (navMonths.length === 0) return (
          <div className="glass-card p-8 text-center text-text-muted">
            <p className="text-lg mb-2">No full months of data yet</p>
            <p className="text-sm">Import at least one full month of transactions to see the monthly breakdown.</p>
          </div>
        );

        // Selected month (default = latest COMPLETE month; current month reachable via Next)
        const defaultIdx = fullMonths.length > 0 ? fullMonths.length - 1 : navMonths.length - 1;
        const idx = selectedMonthIdx < 0 || selectedMonthIdx >= navMonths.length
          ? defaultIdx
          : selectedMonthIdx;
        const current = navMonths[idx];
        const isInProgress = inProgressMonth !== null && current.month === inProgressMonth.month;
        const prior = idx > 0 ? navMonths[idx - 1] : null;

        // Apply this month's data to budget buckets — complete months judged
        // against the targets that were in effect then, not today's caps.
        const monthBuckets = applyMonthToBuckets(
          buckets,
          current,
          isInProgress ? null : targetsForMonth(targetHistory, current.month),
        );
        const totalSpend = current.totalExpenses;
        const totalIncome = current.totalIncome;
        const surplus = totalIncome - totalSpend;

        // Work vs personal
        const workSplit = computeWorkExpenses(expenses, current.month);

        // Category changes vs prior month
        const allCats = new Set([...Object.keys(current.byCategory), ...(prior ? Object.keys(prior.byCategory) : [])]);
        const catChanges: { cat: string; label: string; icon: string; current: number; prior: number; change: number }[] = [];
        for (const cat of allCats) {
          const cur = current.byCategory[cat] || 0;
          const prev = prior?.byCategory[cat] || 0;
          const bucket = monthBuckets.find(b => b.category === cat);
          catChanges.push({
            cat,
            label: bucket?.label || cat,
            icon: bucket?.icon || '📦',
            current: Math.round(cur),
            prior: Math.round(prev),
            change: Math.round(cur - prev),
          });
        }
        catChanges.sort((a, b) => b.current - a.current);

        // Year-to-date averages (across all full months)
        const ytdSpend = Math.round(fullMonths.reduce((s, m) => s + m.totalExpenses, 0) / fullMonths.length);
        const ytdIncome = Math.round(fullMonths.reduce((s, m) => s + m.totalIncome, 0) / fullMonths.length);

        return <>
          {/* Month Navigator */}
          <div className="flex items-center justify-between">
            <button onClick={() => setSelectedMonthIdx(Math.max(idx - 1, 0))}
              disabled={idx === 0}
              className="px-3 py-1.5 rounded-lg bg-surface-2 border border-glass-border text-sm text-text-secondary hover:bg-surface-3 disabled:opacity-20 transition-colors">
              ← {prior ? prior.monthLabel : 'Prev'}
            </button>
            <div className="text-center">
              <h2 className="text-xl font-bold text-text-primary">
                {current.monthLabel}
                {isInProgress && <span className="ml-2 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wider align-middle">In progress</span>}
              </h2>
              <p className="text-xs text-text-muted">{current.transactionCount} transactions</p>
            </div>
            <button onClick={() => setSelectedMonthIdx(Math.min(idx + 1, navMonths.length - 1))}
              disabled={idx >= navMonths.length - 1}
              className="px-3 py-1.5 rounded-lg bg-surface-2 border border-glass-border text-sm text-text-secondary hover:bg-surface-3 disabled:opacity-20 transition-colors">
              {idx < navMonths.length - 1 ? navMonths[idx + 1].monthLabel : 'Next'} →
            </button>
          </div>

          {/* Month Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-4 cyber-grid cyber-corners cyber-scanlines">
              <div className="term-label">Income</div>
              <div className="text-3xl font-black text-positive mt-1 mono-num">{formatCurrency(totalIncome)}</div>
              {prior && <div className="text-xs text-text-muted mt-0.5">Prior: {formatCurrency(prior.totalIncome)}</div>}
            </div>
            <div className="glass-card p-4">
              <div className="term-label">Total Spend</div>
              <div className="text-3xl font-black text-text-primary mt-1 mono-num">{formatCurrency(totalSpend)}</div>
              {prior && (
                <div className={`mt-0.5 ${totalSpend <= prior.totalExpenses ? 'text-positive' : 'text-negative'}`}>
                  <div className="cyber-chip">
                    {totalSpend <= prior.totalExpenses ? '▼' : '▲'} {formatCurrency(Math.abs(totalSpend - prior.totalExpenses))} vs {prior.monthLabel.split(' ')[0]}
                  </div>
                </div>
              )}
            </div>
            <div className="glass-card p-4">
              <div className="term-label">Surplus / Deficit</div>
              <div className={`text-3xl font-black mt-1 mono-num ${surplus >= 0 ? 'text-positive' : 'text-negative'}`}>{formatCurrency(surplus)}</div>
              <div className="text-xs text-text-muted mt-0.5">{isInProgress ? 'Month still in progress' : surplus >= 0 ? 'Under budget' : 'Over budget'}</div>
            </div>
            <div className="glass-card p-4">
              <div className="term-label">Work Expenses</div>
              <div className="text-3xl font-black text-warning mt-1 mono-num">{formatCurrency(workSplit.work)}</div>
              <div className="text-xs text-text-muted mt-0.5">Personal: {formatCurrency(workSplit.personal)}</div>
            </div>
          </div>

          {/* Context Banner */}
          <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-white/[0.02] border border-glass-border text-xs text-text-muted">
            <span>📊 Year-to-date avg: <strong className="text-text-secondary">{formatCurrency(ytdSpend)}</strong> spend / <strong className="text-positive">{formatCurrency(ytdIncome)}</strong> income across {fullMonths.length} complete months</span>
            {isInProgress
              ? <span className="text-text-secondary">Month in progress — averages compare complete months only</span>
              : <>
                  {totalSpend > ytdSpend && <span className="text-negative">This month is {formatCurrency(totalSpend - ytdSpend)} above your average</span>}
                  {totalSpend < ytdSpend && <span className="text-positive">This month is {formatCurrency(ytdSpend - totalSpend)} below your average</span>}
                  <span className="text-text-muted/70">· judged against the targets you had that month</span>
                </>}
          </div>

          {/* Category Breakdown — three lanes, each judged on its own terms */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-1">Where It Went — {current.monthLabel}</h3>
            <p className="text-xs text-text-muted mb-4">Every category for this month{prior ? `, compared to ${prior.monthLabel}` : ''}</p>
            {(() => {
              const visible = catChanges.filter(c => c.current > 0 || c.prior > 0);
              const budgetOf = (cat: string) => monthBuckets.find(b => b.category === cat)?.monthlyBudget || 0;

              const renderRow = (c: typeof catChanges[number]) => {
                const lane = laneOf(c.cat);
                const budget = budgetOf(c.cat);

                // RESERVE — monthly set-aside vs lumpy actual. Calm slate, never "over".
                if (lane === 'reserve') {
                  const alloc = RESERVE_ALLOCATIONS[c.cat] ?? budget;
                  const fill = alloc > 0 ? Math.min(c.current / alloc, 1) : (c.current > 0 ? 1 : 0);
                  return (
                    <div key={c.cat} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm w-6 text-center">{c.icon}</span>
                        <span className="text-xs text-text-secondary w-36 truncate">{c.label}</span>
                        <div className="flex-1 bg-white/10 rounded-full h-5 relative overflow-hidden">
                          <div className="h-5 rounded-full bg-gradient-to-r from-slate-500 to-slate-400 transition-all duration-500"
                            style={{ width: `${fill * 100}%` }} />
                        </div>
                        <span className="text-xs text-text-primary font-medium w-20 text-right">{formatCurrency(c.current)}</span>
                        {prior && (
                          <span className="text-xs w-20 text-right font-medium text-text-muted">
                            {c.change > 0 ? '+' : ''}{formatCurrency(c.change)}
                          </span>
                        )}
                      </div>
                      <div className="ml-8 text-[10px] text-text-muted">
                        {alloc > 0 ? `${formatCurrency(alloc)}/mo reserved · lumpy, not a monthly bust` : 'Reserve — funded from surplus'}
                      </div>
                    </div>
                  );
                }

                // FIXED + FLEXIBLE — bar = % of this category's own budget
                const hasBudget = budget > 0;
                const over = isOverBudget(c.cat, c.current, budget);        // fixed: tolerance; flex: strict
                const noBudget = !hasBudget && c.current > 0;
                const pctOfBudget = hasBudget ? Math.round((c.current / budget) * 100) : null;
                const fillPct = hasBudget ? Math.min(c.current / budget, 1) : (c.current > 0 ? 1 : 0);
                const priorFillPct = hasBudget ? Math.min(c.prior / budget, 1) : (c.prior > 0 ? 1 : 0);
                const fixedOnTarget = lane === 'fixed' && hasBudget && !over;
                const flexApproaching = lane === 'flexible' && hasBudget && !over && (c.current / budget) >= FLEX_APPROACHING;
                const barClass = over
                  ? 'bg-gradient-to-r from-red-500 to-rose-400'
                  : fixedOnTarget
                    ? 'bg-gradient-to-r from-emerald-500 to-green-400'
                    : (flexApproaching || noBudget)
                      ? 'bg-gradient-to-r from-amber-500 to-amber-300'
                      : 'bg-gradient-to-r from-indigo-500 to-blue-400';
                return (
                  <div key={c.cat} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm w-6 text-center">{c.icon}</span>
                      <span className="text-xs text-text-secondary w-36 truncate">{c.label}</span>
                      <div className="flex-1 bg-white/10 rounded-full h-5 relative overflow-hidden">
                        {prior && c.prior > 0 && (
                          <div className="absolute h-5 rounded-full border border-white/20"
                            style={{ width: `${priorFillPct * 100}%` }} />
                        )}
                        <div className={`h-5 rounded-full transition-all duration-500 ${barClass}`}
                          style={{ width: `${fillPct * 100}%` }} />
                      </div>
                      <span className="text-xs text-text-primary font-medium w-20 text-right">{formatCurrency(c.current)}</span>
                      {prior && (
                        <span className={`text-xs w-20 text-right font-medium ${c.change > 50 ? 'text-negative' : c.change < -50 ? 'text-positive' : 'text-text-muted'}`}>
                          {c.change > 0 ? '+' : ''}{formatCurrency(c.change)}
                        </span>
                      )}
                    </div>
                    {over ? (
                      <div className="ml-8 text-[10px] text-negative">
                        {lane === 'fixed' ? 'Running high — ' : ''}{pctOfBudget}% of budget — over by {formatCurrency(c.current - budget)} (budget: {formatCurrency(budget)})
                      </div>
                    ) : fixedOnTarget ? (
                      <div className="ml-8 text-[10px] text-positive">
                        ✓ On target — {pctOfBudget}% of {formatCurrency(budget)}
                      </div>
                    ) : noBudget ? (
                      <div className="ml-8 text-[10px] text-amber-400/80">
                        No budget set for this category
                      </div>
                    ) : hasBudget ? (
                      <div className={`ml-8 text-[10px] ${flexApproaching ? 'text-amber-400/80' : 'text-text-muted'}`}>
                        {pctOfBudget}% of {formatCurrency(budget)} budget{flexApproaching ? ' — approaching limit' : ''}
                      </div>
                    ) : null}
                  </div>
                );
              };

              const lanes: { id: BudgetLane; title: string; sub: string }[] = [
                { id: 'fixed', title: '🔒 Fixed & On Target', sub: 'Non-negotiable bills — green = landed as expected' },
                { id: 'flexible', title: '🎯 Flexible Spending', sub: 'Where cutting actually moves the needle' },
                { id: 'reserve', title: '🏦 Reserves', sub: 'Lumpy / annual — set aside monthly, not a monthly bust' },
              ];

              return lanes.map(L => {
                const rows = visible.filter(c => laneOf(c.cat) === L.id);
                if (!rows.length) return null;
                return (
                  <div key={L.id} className="mb-5 last:mb-0">
                    <div className="flex items-baseline justify-between mb-2 pb-1 border-b border-glass-border">
                      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{L.title}</span>
                      <span className="text-[10px] text-text-muted">{L.sub}</span>
                    </div>
                    <div className="space-y-2">
                      {rows.map(renderRow)}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Work Expense vs Reimbursement Tracker */}
          {(() => {
            // Cumulative across all imported data
            const allWorkExpenses = expenses.filter(e =>
              e.isWorkExpense && (e.flow || 'outflow') === 'outflow' && (e.transactionType || 'expense') === 'expense'
            );
            const allReimbursements = expenses.filter(e => e.transactionType === 'reimbursement');
            const totalWorkSpent = allWorkExpenses.reduce((s, e) => s + e.amount, 0);
            const totalReimbursed = allReimbursements.reduce((s, e) => s + e.amount, 0);
            const outstanding = totalWorkSpent - totalReimbursed;

            // This month only
            const monthWorkExpenses = allWorkExpenses.filter(e => {
              const key = e.date.includes('/') ? `${e.date.split('/')[2]}-${e.date.split('/')[0].padStart(2, '0')}` : e.date.slice(0, 7);
              return key === current.month;
            });
            const monthReimbursements = allReimbursements.filter(e => {
              const key = e.date.includes('/') ? `${e.date.split('/')[2]}-${e.date.split('/')[0].padStart(2, '0')}` : e.date.slice(0, 7);
              return key === current.month;
            });
            const monthWork = monthWorkExpenses.reduce((s, e) => s + e.amount, 0);
            const monthReimb = monthReimbursements.reduce((s, e) => s + e.amount, 0);

            if (totalWorkSpent === 0 && totalReimbursed === 0) return null;

            const reimbPct = totalWorkSpent > 0 ? Math.round((totalReimbursed / totalWorkSpent) * 100) : 0;
            const pieData = [
              { name: 'Reimbursed', value: Math.round(totalReimbursed), fill: '#22c55e' },
              { name: 'Outstanding', value: Math.max(Math.round(outstanding), 0), fill: '#f59e0b' },
            ].filter(d => d.value > 0);

            return (
              <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-1">Work Expense Tracker</h3>
                <p className="text-xs text-text-muted mb-4">Money you spent for work vs what's been paid back</p>
                <div className="flex items-center gap-6">
                  {/* Ring Chart */}
                  <div className="relative">
                    <ResponsiveContainer width={130} height={130}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" cx="50%" cy="50%"
                          outerRadius={58} innerRadius={38} paddingAngle={2} strokeWidth={0}>
                          {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold text-text-primary">{reimbPct}%</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-warning" />
                        <span className="text-sm text-text-secondary">Total Work Expenses</span>
                      </div>
                      <span className="text-sm font-semibold text-text-primary">{formatCurrency(totalWorkSpent)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-positive" />
                        <span className="text-sm text-text-secondary">Reimbursed</span>
                      </div>
                      <span className="text-sm font-semibold text-positive">{formatCurrency(totalReimbursed)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-glass-border pt-2">
                      <span className="text-sm font-medium text-text-primary">Outstanding</span>
                      <span className={`text-sm font-bold ${outstanding > 0 ? 'text-warning' : 'text-positive'}`}>
                        {outstanding > 0 ? formatCurrency(outstanding) : 'All caught up!'}
                      </span>
                    </div>
                    {monthWork > 0 && (
                      <div className="text-xs text-text-muted pt-1 border-t border-glass-border">
                        This month: {formatCurrency(monthWork)} spent for work
                        {monthReimb > 0 && <>, {formatCurrency(monthReimb)} reimbursed</>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Month-over-Month Mini Chart */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Monthly Trajectory</h3>
            <div className="space-y-2">
              {fullMonths.map((m, i) => {
                const maxExp = Math.max(...fullMonths.map(mm => mm.totalExpenses), 1);
                const pct = (m.totalExpenses / maxExp) * 100;
                const isSelected = i === idx;
                return (
                  <button key={m.month} onClick={() => setSelectedMonthIdx(i)}
                    className={`w-full flex items-center gap-3 p-1 rounded transition-colors ${isSelected ? 'bg-accent/10' : 'hover:bg-white/[0.02]'}`}>
                    <span className={`text-xs w-16 text-right font-mono ${isSelected ? 'text-accent-light font-bold' : 'text-text-secondary'}`}>{m.monthLabel.split(' ')[0]}</span>
                    <div className="flex-1 bg-white/10 rounded-full h-5 relative overflow-hidden">
                      <div className={`h-5 rounded-full transition-all duration-300 ${isSelected ? 'bg-gradient-to-r from-indigo-500 to-blue-400' : 'bg-white/20'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}>
                        <span className="text-[10px] font-medium text-white pl-2 leading-5">{formatCurrency(m.totalExpenses)}</span>
                      </div>
                    </div>
                    <span className={`text-xs w-20 text-right ${m.totalIncome - m.totalExpenses >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {m.totalIncome - m.totalExpenses >= 0 ? '+' : ''}{formatCurrency(m.totalIncome - m.totalExpenses)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-glass-border text-xs text-text-muted">
              <span>Bar = total spending</span>
              <span>Right column = surplus/deficit for that month</span>
              <span>Click any month to drill in</span>
            </div>
          </div>
        </>;
      })()}
      {section === 'monthly' && monthlyData.length === 0 && (
        <div className="glass-card p-8 text-center text-text-muted">
          <p className="text-lg mb-2">No transaction data yet</p>
          <p className="text-sm">Import your bank and credit card statements in the Transactions tab to see monthly breakdowns.</p>
        </div>
      )}

      {/* Overview Section */}
      {section === 'overview' && <>

      {/* Edit-mode chrome bar — sticky header w/ Save/Cancel. Renders only when editMode=true. */}
      <BudgetEditOverlay
        active={editMode}
        isDirty={editDirty}
        onSave={saveEdit}
        onCancel={cancelEdit}
      />

      {/* ── Read-only daily view (hidden in edit mode) ── */}
      {!editMode && (<>

      {/* Month Navigator */}
      {availMonths.length > 0 && (() => {
        const resolved = resolvedOverviewMonth;
        const idx = availMonths.indexOf(resolved);
        const monthLabel = (m: string) => {
          const [y, mo] = m.split('-');
          return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        };
        return (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button onClick={() => { if (idx > 0) setOverviewMonth(availMonths[idx - 1]); }}
                disabled={idx <= 0 || resolved === 'avg'}
                className="w-8 h-8 rounded-lg bg-surface-2 border border-glass-border hover:bg-surface-3 disabled:opacity-20 flex items-center justify-center text-text-muted text-sm transition-colors">
                ←
              </button>
              <button onClick={() => setOverviewMonth(resolved === 'avg' ? 'latest' : 'avg')}
                className="px-4 py-1.5 rounded-lg bg-surface-2 border border-glass-border hover:bg-surface-3 text-sm text-text-primary font-semibold transition-colors min-w-[160px]">
                {resolved === 'avg' ? `Average (${fullMonths.length} months)` : monthLabel(resolved)}
                {overviewIsInProgress && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[9px] font-bold uppercase tracking-wider align-middle">In progress</span>}
              </button>
              <button onClick={() => { if (idx < availMonths.length - 1) setOverviewMonth(availMonths[idx + 1]); }}
                disabled={idx >= availMonths.length - 1 || resolved === 'avg'}
                className="w-8 h-8 rounded-lg bg-surface-2 border border-glass-border hover:bg-surface-3 disabled:opacity-20 flex items-center justify-center text-text-muted text-sm transition-colors">
                →
              </button>
            </div>
            <span className="text-xs text-text-muted">
              {resolved === 'avg' ? 'Showing averaged data across complete months'
                : overviewIsInProgress ? 'Month in progress — spending so far'
                : 'Showing actual spending for this month'}
            </span>
          </div>
        );
      })()}

      {/* Safe to Spend — take-home − fixed bills − reserve set-asides − flexible spent so far */}
      {(() => {
        if (paycheck.netTakeHome <= 0) return null;
        const sts = computeSafeToSpend(expenses, buckets, paycheck.netTakeHome);
        const pct = sts.takeHome > 0 ? Math.max(0, Math.min(100, (sts.amount / sts.takeHome) * 100)) : 0;
        return (
          <div className={`glass-card p-5 cyber-grid cyber-corners ${sts.amount >= 0 ? '' : 'border-negative/40'}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="term-label">Safe to spend · {sts.daysLeft} days left this month</div>
                <div className={`text-4xl font-black mt-1 mono-num ${sts.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {sts.amount >= 0 ? '' : '−'}{formatCurrency(Math.abs(sts.amount))}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {sts.amount >= 0
                    ? <>≈ <span className="text-text-secondary font-medium">{formatCurrency(sts.perDay)}/day</span> without breaking the watermark</>
                    : 'Flexible spending is past the watermark for this month'}
                </div>
              </div>
              <div className="text-right text-xs text-text-muted space-y-0.5">
                <div>{formatCurrency(sts.takeHome)} take-home</div>
                <div>− {formatCurrency(sts.fixedCommitment)} fixed bills</div>
                <div>− {formatCurrency(sts.reserveSetAside)} reserve set-asides</div>
                <div>− {formatCurrency(sts.flexSpent)} flexible spent so far</div>
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-surface-2 overflow-hidden">
              <div className={`h-2 rounded-full transition-all ${sts.amount >= 0 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-negative'}`}
                style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })()}

      {/* Money Map — where the whole base ($15,800) goes: everyday + investing +
          reserves + what's free. The Pulse below is the spending-pace detail. */}
      {paycheck.netTakeHome > 0 && (() => {
        const everydayBudget = operatingBuckets.filter(b => b.category !== 'investing').reduce((s, b) => s + b.monthlyBudget, 0);
        const everydaySpent = operatingBuckets.filter(b => b.category !== 'investing').reduce((s, b) => s + b.monthlyActual, 0);
        // 'avg' is a historical blend, not a live deposit → no per-month confirm.
        const confirmMonth = resolvedOverviewMonth === 'avg' ? '' : resolvedOverviewMonth;
        return (
          <MoneyMap
            income={paycheck.netTakeHome}
            everydayBudget={everydayBudget}
            everydaySpent={everydaySpent}
            investing={investingAmt}
            investingPlanned={investingPlanned}
            investingStatus={investingStatus}
            // Feed-validated deposits can't be un-confirmed; only manual planned/confirmed toggle.
            onToggleInvesting={confirmMonth && investingStatus !== 'feed' ? () => toggleInvestConfirm(confirmMonth, investingPlanned) : undefined}
            reserveSetAside={totalReserveSetAside()}
            inProgress={overviewIsInProgress}
          />
        );
      })()}

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Take Home is the watermark — shown first and emphasized */}
        <div className="glass-card p-4 cyber-corners">
          <div className="term-label">Net Take Home</div>
          <div className="text-3xl font-black mt-1 text-text-primary mono-num">{formatCurrency(summary.netIncome)}</div>
          <div className="text-text-secondary text-xs mt-0.5">Your monthly watermark — stay under it</div>
        </div>
        <div className="glass-card p-4">
          <div className="term-label">Monthly Spend</div>
          <div className={`text-3xl font-black mt-1 mono-num ${totalBucketSpend > summary.netIncome ? 'text-negative' : overBudget.length > 0 ? 'text-warning' : 'text-positive'}`}>
            {formatCurrency(totalBucketSpend)}
          </div>
          <div className="text-text-secondary text-xs mt-0.5">
            {formatCurrency(essentialSpend)} essential + {formatCurrency(discretionarySpend)} lifestyle
          </div>
        </div>
        {/* On Pace to Save / Saved — placed BEFORE Savings Rate (Scott: this is the
            more useful day-to-day number). Carries a month-over-month comparison. */}
        {(() => {
          // Reconciled to the Money Map (whole $15,800): base − everyday − investing
          // − reserve set-aside. Same number the Money Map shows, so the page agrees.
          const saved = monthSurplus;
          // Prior complete month, same formula (everyday + investing + set-aside).
          const compMonths = fullMonths.filter(m =>
            (resolvedOverviewMonth === 'latest' || resolvedOverviewMonth === 'avg') ? true : m.month < resolvedOverviewMonth);
          const prior = compMonths[compMonths.length - 1];
          const savedPrior = prior ? Math.round(summary.netIncome - prior.totalOperating - investingAmt - reserveSetAside) : null;
          const compLine = (current: number) => (prior && savedPrior !== null) ? (
            <div className="text-[11px] mt-1">
              <span className="text-text-muted">{prior.monthLabel}: </span>
              <span className={savedPrior >= 0 ? 'text-positive' : 'text-negative'}>{savedPrior >= 0 ? '+' : '−'}{formatCurrency(Math.abs(savedPrior))}</span>
              <span className="text-text-muted/70"> · {current >= savedPrior ? '▲' : '▼'} {formatCurrency(Math.abs(current - savedPrior))} {current >= savedPrior ? 'better' : 'worse'}</span>
            </div>
          ) : null;
          if (overviewIsInProgress) {
            // In-progress: don't show a spendable "left" number — that's Safe to
            // Spend's job. Show the projected OUTCOME (on pace to save/overspend)
            // by extrapolating month-to-date operating spend to month-end.
            const now = new Date();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const dayOfMonth = now.getDate();
            // Linear extrapolation is unstable in the first week: dividing by a
            // tiny elapsed-fraction turns one fixed charge (e.g. the $1,000
            // investing drip on the 1st) into a fake "on pace to overspend $15k".
            // Hold the projection until there's enough month to trend against.
            if (dayOfMonth < 7) {
              return (
                <div className="glass-card p-4">
                  <div className="term-label">Month-End Projection</div>
                  <div className="text-3xl font-black mt-1 mono-num text-text-secondary">—</div>
                  <div className="text-text-secondary text-xs mt-0.5">Day {dayOfMonth} of {daysInMonth} — too early to call; the pace firms up after the first week</div>
                </div>
              );
            }
            const frac = Math.min(1, Math.max(0.0001, dayOfMonth / daysInMonth));
            const projectedSaved = Math.round(summary.netIncome - totalBucketSpend / frac - reserveSetAside);
            return (
              <div className="glass-card p-4">
                <div className="term-label">{projectedSaved >= 0 ? 'On Pace to Save' : 'On Pace to Overspend'}</div>
                <div className={`text-3xl font-black mt-1 mono-num ${projectedSaved >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {projectedSaved >= 0 ? '+' : '−'}{formatCurrency(Math.abs(projectedSaved))}
                </div>
                <div className="text-text-secondary text-xs mt-0.5">Projected month-end at today's pace</div>
                {compLine(projectedSaved)}
              </div>
            );
          }
          const label = saved < 0 ? 'Over Base' : 'Came in Under';
          return (
            <div className="glass-card p-4">
              <div className="term-label">{label}</div>
              <div className={`text-3xl font-black mt-1 mono-num ${saved >= 0 ? 'text-positive' : 'text-negative'}`}>
                {saved >= 0 ? '+' : '−'}{formatCurrency(Math.abs(saved))}
              </div>
              <div className="text-text-secondary text-xs mt-0.5">
                {saved < 0 ? 'Everyday ran hot — over your $15,800 after set-asides'
                  : 'Under your $15,800 after everything — the win to deploy'}
              </div>
              {compLine(saved)}
            </div>
          );
        })()}
        <div className="glass-card p-4">
          <div className="term-label">Savings Rate</div>
          <div className={`text-3xl font-black mt-1 mono-num ${intentionalSavingsRate >= 20 ? 'text-positive' : intentionalSavingsRate >= 15 ? 'text-warning' : 'text-negative'}`}>
            {intentionalSavingsRate.toFixed(1)}%
          </div>
          <div className="text-text-secondary text-xs mt-0.5">
            {formatCurrency(investingAmt)} investing + {formatCurrency(paycheck.retirement401k)} 401k + {formatCurrency(paycheck.hsaContribution)} HSA
          </div>
          {intentionalSavingsRate < 20 && paycheck.netTakeHome > 0 && (
            <div className="text-text-muted text-[11px] mt-1">
              Green at 20% of take-home — ~{formatCurrency(Math.max(0, 0.20 * paycheck.netTakeHome - (investingAmt + paycheck.retirement401k + paycheck.hsaContribution)))}/mo more
              <span className="text-text-muted/60"> (fixed savings; variable sweep not counted)</span>
            </div>
          )}
        </div>
      </div>

      {/* Budget Health + Spending Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget Health — with visible sub-scores and realistic advice */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Budget Health</h2>
          {!hasBudgetData ? (
            <EmptyState
              icon="🩺"
              title="Budget Health needs data first"
              description="Set your paycheck in Settings or import a bank statement, and Iris will score savings rate, adherence, housing ratio, and cash flow."
              ctaLabel="Set income"
              ctaTarget="settings"
              compact
            />
          ) : (
          <div className="flex items-start gap-6">
            <div className="flex flex-col items-center gap-1">
              <ScoreRing score={overallBudgetScore} size={130} />
              <span className="text-[10px] text-text-muted">avg of 4 metrics</span>
            </div>
            <div className="flex-1 space-y-2.5">
              {(() => {
                const metrics = [
                  {
                    name: 'Savings Rate', score: savingsScore,
                    msg: `${intentionalSavingsRate.toFixed(1)}%`,
                    detail: `${formatCurrency(investingAmt)} brokerage + ${formatCurrency(paycheck.retirement401k)} 401k + ${formatCurrency(paycheck.hsaContribution)} HSA`,
                    action: intentionalSavingsRate >= 20
                      ? 'Target met'
                      : intentionalSavingsRate >= 15
                      ? 'Close — bump 401k or auto-invest to cross 20%'
                      : 'Below 15% — focus on increasing 401k match first',
                  },
                  {
                    name: 'Budget Adherence', score: overageScore,
                    msg: overBudget.length === 0 ? 'Clean' : `${overBudget.length} over`,
                    detail: overBudget.length > 0
                      ? overBudget.slice(0, 3).map(b => `${b.label.split('(')[0].trim()} +${formatCurrency(b.monthlyActual - b.monthlyBudget)}`).join(', ')
                      : 'All categories within budget',
                    action: overBudget.length > 0
                      ? `${formatCurrency(totalOverage)}/mo overage — ${formatCurrency(totalOverage * 12)}/yr if it continues`
                      : 'No action needed',
                  },
                  {
                    name: 'Housing Ratio', score: housingScore,
                    msg: `${housingRatio.toFixed(1)}%`,
                    detail: `${formatCurrency(overviewBuckets.find(b => b.category === 'housing')?.monthlyActual || 0)}/mo housing on ${formatCurrency(paycheck.netTakeHome)} take-home`,
                    action: housingRatio <= 30 ? 'Under 30% of take-home — healthy' : housingRatio <= 40 ? 'A bit high on take-home' : 'Above 40% of take-home — stretching',
                  },
                  {
                    name: 'Cash Flow', score: surplusScore,
                    msg: monthSurplus >= 0 ? `+${formatCurrency(monthSurplus)}` : formatCurrency(monthSurplus),
                    detail: `${formatCurrency(paycheck.netTakeHome)} base − ${formatCurrency(totalBucketSpend)} spent − ${formatCurrency(reserveSetAside)} set aside`,
                    action: monthSurplus < 0 ? 'Everyday ran hot — over base after set-asides' : monthSurplus > 1000 ? 'Healthy buffer — deploy to savings' : 'Tight but positive',
                  },
                ];
                // Good news up top, the drag at the bottom — explains why the score is what it is.
                return [...metrics].sort((a, b) => b.score - a.score).map((m, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      m.score >= 70 ? 'bg-positive/15 text-positive' : m.score >= 40 ? 'bg-warning/15 text-warning' : 'bg-negative/15 text-negative'
                    }`}>{m.score}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-text-primary">{m.name}</span>
                        <span className={`text-xs font-bold ${m.score >= 70 ? 'text-positive' : m.score >= 40 ? 'text-warning' : 'text-negative'}`}>{m.msg}</span>
                      </div>
                      <div className="text-[10px] text-text-muted leading-tight">{m.detail}</div>
                      <div className={`text-[10px] mt-0.5 ${m.score >= 70 ? 'text-positive/70' : m.score >= 40 ? 'text-warning/70' : 'text-negative/70'}`}>{m.action}</div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
          )}
        </div>

        {/* Over Budget — focused view on what needs attention */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">
              {overBudget.length > 0 ? 'Over Budget' : 'Budget Status'}
            </h2>
            <span className="text-xs text-text-muted px-2 py-1 rounded-md bg-white/5">
              {resolvedOverviewMonth === 'avg' || resolvedOverviewMonth === 'latest'
                ? `${fullMonths.length}-month average`
                : (() => { const [y, mo] = resolvedOverviewMonth.split('-'); return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); })()
              }
            </span>
          </div>
          {overBudget.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-3xl mb-2">✅</div>
              <div className="text-sm text-positive font-medium">All categories on budget</div>
              <div className="text-xs text-text-muted mt-1">No categories exceed their allocated budget</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-negative font-medium">
                <span>{overBudget.length} {overBudget.length === 1 ? 'category' : 'categories'} over</span>
                <span className="text-text-muted">·</span>
                <span>{formatCurrency(totalOverage)}/mo overage</span>
                <span className="text-text-muted">·</span>
                <span>{formatCurrency(totalOverage * 12)}/yr if unchanged</span>
              </div>
              {overBudget.sort((a, b) => (b.monthlyActual - b.monthlyBudget) - (a.monthlyActual - a.monthlyBudget)).map(b => {
                const overage = b.monthlyActual - b.monthlyBudget;
                const overPct = Math.round((b.monthlyActual / b.monthlyBudget) * 100);
                return (
                  <div key={b.category} className="flex items-center gap-3 p-3 rounded-lg bg-negative/5 border border-negative/15 cursor-pointer hover:bg-negative/10 transition-colors"
                    onClick={() => setDrilldownCategory(b.category)}>
                    <span className="text-lg">{b.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary">{b.label.split('(')[0].trim()}</div>
                      <div className="text-[10px] text-text-muted">{formatCurrency(b.monthlyActual)} spent vs {formatCurrency(b.monthlyBudget)} budget · {formatCurrency(b.monthlyActual * 12)}/yr at this pace</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-negative">+{formatCurrency(overage)}</div>
                      <div className="text-[10px] text-negative/70">{overPct}% of budget</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Empty-state nudge — first-run users haven't found Edit Budget yet. */}
      {filteredBuckets.filter(b => b.monthlyActual > 0 || b.monthlyBudget > 0).length === 0 && (
        <div className="glass-card p-6 border-2 border-accent/40 bg-accent/5">
          <div className="flex items-center gap-4">
            <span className="text-3xl flex-shrink-0">✏️</span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold text-text-primary">Your budget isn't set up yet</div>
              <div className="text-xs text-text-muted mt-0.5">Set monthly budgets per category, define stashes, and configure fun money. Takes a couple minutes.</div>
            </div>
            <button
              onClick={startEdit}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-semibold whitespace-nowrap flex-shrink-0"
            >
              Edit Budget →
            </button>
          </div>
        </div>
      )}

      {/* Budget Pulse — persists for EVERY month for continuity (Scott): "How
          the month is going" live, "How the month went" (locked, no pace/trend)
          for closed months, so you can page back and see how each month landed
          against the targets in effect then — without leaving the overview. */}
      {filteredBuckets.filter(b => (b.monthlyActual > 0 || b.monthlyBudget > 0) && laneOf(b.category) !== 'reserve').length > 0 && (() => {
        const pulseMonthLabel = resolvedOverviewMonth === 'avg'
          ? `${fullMonths.length}-mo average`
          : (() => { const [y, mo] = resolvedOverviewMonth.split('-'); return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); })();
        return (
          <BudgetPulse
            // Operating lanes only — reserve (taxes/travel) is lumpy with a $0 bucket
            // budget, so counting its spend here made a tax/travel payment look like a
            // budget bust (the opposite of the lane model). Now the Pulse "spent /
            // budgeted" matches the Monthly Spend tile and the rest of the page.
            buckets={filteredBuckets.filter(b => (b.monthlyActual > 0 || b.monthlyBudget > 0) && laneOf(b.category) !== 'reserve')}
            watermark={paycheck.netTakeHome}
            complete={!overviewIsInProgress}
            monthLabel={pulseMonthLabel}
            onCategoryClick={(cat) => setDrilldownCategory(cat)}
          />
        );
      })()}

      {/* Stashes — daily-visible saving pots with DERIVED balances. Edits save
          directly and reconfigure the reserve lanes live. */}
      <StashesCard
        stashes={sinkingFunds}
        expenses={expenses}
        onChange={(next) => {
          setSinkingFunds(next);
          applyStashLaneConfig(next);
          void saveSinkingFunds(next);
        }}
      />

      {/* Fun Money — per-person pots, out of edit mode (couples model). */}
      <FunMoneyCard funMoney={funMoney} expenses={expenses} onEditBudgets={() => setEditMode(true)} />

      {/* Variable Pay — surfaces "above base" overage so user can sweep it instead of spending it. */}
      <VariableSurplusCard expenses={expenses} />

      {/* Work Expenses & Reimbursements — totals only, no per-line itemization. */}
      <WorkReimbursementsCard expenses={expenses} onViewTransactions={() => setSection('expenses')} />

      </>)}
      {/* ── End read-only daily view ── */}

      {editMode && (<>
      {/* Budget Allocation + Category Table */}
      <div className="glass-card overflow-hidden">
        {/* Header with allocation bar */}
        <div className="p-4 border-b border-glass-border space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-text-primary">Monthly Budget</h2>
              <p className="text-xs text-text-muted mt-0.5">
                {resolvedOverviewMonth === 'avg' || resolvedOverviewMonth === 'latest'
                  ? 'Averaged across all imported months'
                  : (() => { const [y, mo] = resolvedOverviewMonth.split('-'); return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); })()
                }
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCompare(!showCompare)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showCompare ? 'bg-accent/20 text-accent' : 'bg-white/5 text-text-muted hover:bg-white/10'}`}>
                {showCompare ? 'Annual ON' : 'See Annual'}
              </button>
              <button onClick={async () => {
                const income = paycheck.netTakeHome;
                const essLock = ['housing', 'childcare', 'utilities', 'insurance', 'healthcare', 'kids', 'transportation', 'food_groceries'];
                let essTotal = 0;
                const step1 = buckets.map(b => {
                  if (b.category === 'travel_work') return { ...b, monthlyBudget: 0 };
                  if (b.category === 'investing') return b; // investing budget synced from Settings
                  if (essLock.includes(b.category)) {
                    const locked = b.monthlyActual > 0 ? Math.ceil(b.monthlyActual / 25) * 25 : b.monthlyBudget;
                    essTotal += locked;
                    return { ...b, monthlyBudget: locked };
                  }
                  return b;
                });
                const invBucket = step1.find(bb => bb.category === 'investing');
                essTotal += invBucket?.monthlyBudget || 0;
                const discBudget = income - essTotal;
                const discCats = step1.filter(b => !essLock.includes(b.category) && b.category !== 'travel_work' && b.category !== 'investing');
                const discSpend = discCats.reduce((s, b) => s + Math.max(b.monthlyActual, 0), 0) || 1;
                const allocatable = Math.max(discBudget * 0.90, 0);
                const final = step1.map(b => {
                  if (essLock.includes(b.category) || b.category === 'travel_work' || b.category === 'investing') return b;
                  const share = Math.max(b.monthlyActual, 0) / discSpend;
                  return { ...b, monthlyBudget: Math.max(Math.round((share * allocatable) / 25) * 25, 25) };
                });
                setBuckets(final);
                await saveBudgetBuckets(final);
              }}
                className="px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-xs font-medium transition-colors">
                Auto-suggest
              </button>
            </div>
          </div>

          {/* Allocation bar — essential vs discretionary split */}
          {(() => {
            const essentialBudgeted = filteredBuckets.filter(b => isEssential(b.category)).reduce((s, b) => s + b.monthlyBudget, 0);
            const discretionaryBudgeted = filteredBuckets.filter(b => !isEssential(b.category)).reduce((s, b) => s + b.monthlyBudget, 0);
            const essentialPct = paycheck.netTakeHome > 0 ? (essentialBudgeted / paycheck.netTakeHome) * 100 : 0;
            const discretionaryPct = paycheck.netTakeHome > 0 ? (discretionaryBudgeted / paycheck.netTakeHome) * 100 : 0;
            return (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-text-muted">Take-home: <strong className="text-text-primary">{formatCurrency(paycheck.netTakeHome)}</strong></span>
                  <span className={unallocated >= 0 ? 'text-positive' : 'text-negative'}>
                    {unallocated >= 0 ? `${formatCurrency(unallocated)} unallocated` : `${formatCurrency(Math.abs(unallocated))} over-allocated!`}
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden flex">
                  <div className="h-3 bg-gradient-to-r from-blue-600 to-blue-500 transition-all duration-500"
                    style={{ width: `${Math.min(essentialPct, 100)}%` }} />
                  <div className={`h-3 transition-all duration-500 ${unallocated < 0 ? 'bg-gradient-to-r from-red-500 to-red-400' : 'bg-gradient-to-r from-violet-500 to-purple-400'}`}
                    style={{ width: `${Math.min(discretionaryPct, 100 - Math.min(essentialPct, 100))}%` }} />
                </div>
                <div className="flex items-center gap-4 mt-1 text-[10px] text-text-muted">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Essential {formatCurrency(essentialBudgeted)}</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500 inline-block" /> Lifestyle {formatCurrency(discretionaryBudgeted)}</span>
                  {unallocated > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-white/10 inline-block" /> Unallocated {formatCurrency(unallocated)}</span>}
                </div>
              </div>
            );
          })()}

          {/* Needs attention callout */}
          {overBudget.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-negative/10 border border-negative/20 text-xs">
              <span className="text-negative font-bold">{overBudget.length} over budget</span>
              <span className="text-negative/70">— {overBudget.map(b => b.label.split('(')[0].trim()).join(', ')} totaling {formatCurrency(totalOverage)}/mo</span>
            </div>
          )}
        </div>

        {/* Category rows — Essentials */}
        <div className="px-4 pt-3 pb-1">
          <div className="term-label">Fixed / Essential</div>
        </div>
        {filteredBuckets.filter(b => isEssential(b.category)).map(b => {
          const over = b.monthlyBudget > 0 && b.monthlyActual > b.monthlyBudget;
          const pctUsed = b.monthlyBudget > 0 ? (b.monthlyActual / b.monthlyBudget) * 100 : 0;
          const annualized = b.monthlyActual * 12;
          const updateBucket = async (field: 'monthlyBudget' | 'monthlyActual', value: number) => {
            const updated = buckets.map(bb => bb.category === b.category ? { ...bb, [field]: value } : bb);
            setBuckets(updated);
            await saveBudgetBuckets(updated);
          };
          return (
            <div key={b.category}
              className="px-4 py-2.5 flex items-center gap-3 hover:brightness-110 transition-colors cursor-pointer"
              style={{
                borderLeft: over ? '3px solid #ef4444' : pctUsed >= 80 ? '3px solid #f59e0b' : '3px solid transparent',
                backgroundColor: over ? 'rgba(239,68,68,0.10)' : pctUsed >= 80 ? 'rgba(245,158,11,0.08)' : 'transparent',
              }}
              onClick={() => setDrilldownCategory(drilldownCategory === b.category ? null : b.category)}>
              <span className="text-base w-6 text-center">{b.icon}</span>
              <span className="text-sm text-text-primary flex-1 min-w-0 truncate">{b.label.split('(')[0].trim()}</span>
              {showCompare && b.monthlyActual > 0 && (
                <span className={`text-xs font-bold w-20 text-right ${annualized > 10000 ? 'text-warning' : 'text-text-secondary'}`}>
                  {formatCurrency(annualized)}<span className="text-[9px] font-normal text-text-muted">/yr</span>
                </span>
              )}
              <div className="flex items-center gap-1 w-32 justify-end">
                <span className="text-xs text-text-muted">$</span>
                <input type="number" step="0.01" value={b.monthlyActual} onClick={e => e.stopPropagation()}
                  onChange={e => updateBucket('monthlyActual', Number(e.target.value))}
                  className={`w-16 bg-transparent border border-transparent hover:border-glass-border rounded px-1 py-0.5 text-sm font-semibold text-right outline-none focus:border-accent/50 ${over ? 'text-negative' : 'text-text-primary'}`} />
                <span className="text-xs text-text-muted">/</span>
                {b.category === 'investing' ? (
                  // Investing budget is synced from Settings — read-only here so a
                  // stray keystroke can't fat-finger it (the $1000→$20 bug).
                  <span title="Synced from Settings — change it there" onClick={e => e.stopPropagation()}
                    className="w-16 px-1 py-0.5 text-xs text-text-muted/70 text-right cursor-default">
                    {formatCurrency(b.monthlyBudget)}
                  </span>
                ) : (
                  <input type="number" step="0.01" value={b.monthlyBudget} onClick={e => e.stopPropagation()}
                    onChange={e => updateBucket('monthlyBudget', Number(e.target.value))}
                    className="w-16 bg-transparent border border-transparent hover:border-glass-border rounded px-1 py-0.5 text-xs text-text-muted text-right outline-none focus:border-accent/50" />
                )}
              </div>
              <div className="w-28 flex-shrink-0">
                {b.monthlyBudget > 0 ? (
                  <div className="w-full rounded-full h-3 relative" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                    <div className={`h-3 rounded-full transition-all duration-500`}
                      style={{
                        width: `${Math.max(Math.min(pctUsed, 100), pctUsed > 0 ? 6 : 0)}%`,
                        background: over ? 'linear-gradient(to right, #ef4444, #f87171)'
                          : pctUsed > 80 ? 'linear-gradient(to right, #f59e0b, #fbbf24)'
                          : 'linear-gradient(to right, #22c55e, #4ade80)',
                        boxShadow: over ? '0 0 8px rgba(239,68,68,0.5)'
                          : pctUsed > 80 ? '0 0 8px rgba(245,158,11,0.4)'
                          : '0 0 8px rgba(34,197,94,0.4)',
                      }} />
                    {over && <div className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-white/60 rounded" style={{ left: '100%', transform: 'translateX(-2px)' }} />}
                  </div>
                ) : (
                  <div className="w-full rounded-full h-3" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                )}
                <div className="text-[10px] text-text-muted text-right mt-0.5 font-medium">
                  {b.monthlyBudget > 0 ? `${Math.round(pctUsed)}%` : ''}
                </div>
              </div>
            </div>
          );
        })}

        {/* Separator */}
        <div className="px-4 pt-4 pb-1">
          <div className="term-label">Discretionary / Lifestyle</div>
        </div>
        {filteredBuckets.filter(b => !isEssential(b.category)).map(b => {
          const over = b.monthlyBudget > 0 && b.monthlyActual > b.monthlyBudget;
          const pctUsed = b.monthlyBudget > 0 ? (b.monthlyActual / b.monthlyBudget) * 100 : 0;
          const annualized = b.monthlyActual * 12;
          const updateBucket = async (field: 'monthlyBudget' | 'monthlyActual', value: number) => {
            const updated = buckets.map(bb => bb.category === b.category ? { ...bb, [field]: value } : bb);
            setBuckets(updated);
            await saveBudgetBuckets(updated);
          };
          return (
            <div key={b.category}
              className="px-4 py-2.5 flex items-center gap-3 hover:brightness-110 transition-colors cursor-pointer"
              style={{
                borderLeft: over ? '3px solid #ef4444' : pctUsed >= 80 ? '3px solid #f59e0b' : '3px solid transparent',
                backgroundColor: over ? 'rgba(239,68,68,0.10)' : pctUsed >= 80 ? 'rgba(245,158,11,0.08)' : 'transparent',
              }}
              onClick={() => setDrilldownCategory(drilldownCategory === b.category ? null : b.category)}>
              <span className="text-base w-6 text-center">{b.icon}</span>
              <span className="text-sm text-text-primary flex-1 min-w-0 truncate">{b.label.split('(')[0].trim()}</span>
              {showCompare && b.monthlyActual > 0 && (
                <span className={`text-xs font-bold w-20 text-right ${annualized > 5000 ? 'text-warning' : 'text-text-secondary'}`}>
                  {formatCurrency(annualized)}<span className="text-[9px] font-normal text-text-muted">/yr</span>
                </span>
              )}
              <div className="flex items-center gap-1 w-32 justify-end">
                <span className="text-xs text-text-muted">$</span>
                <input type="number" step="0.01" value={b.monthlyActual} onClick={e => e.stopPropagation()}
                  onChange={e => updateBucket('monthlyActual', Number(e.target.value))}
                  className={`w-16 bg-transparent border border-transparent hover:border-glass-border rounded px-1 py-0.5 text-sm font-semibold text-right outline-none focus:border-accent/50 ${over ? 'text-negative' : 'text-text-primary'}`} />
                <span className="text-xs text-text-muted">/</span>
                {b.category === 'investing' ? (
                  // Investing budget is synced from Settings — read-only here so a
                  // stray keystroke can't fat-finger it (the $1000→$20 bug).
                  <span title="Synced from Settings — change it there" onClick={e => e.stopPropagation()}
                    className="w-16 px-1 py-0.5 text-xs text-text-muted/70 text-right cursor-default">
                    {formatCurrency(b.monthlyBudget)}
                  </span>
                ) : (
                  <input type="number" step="0.01" value={b.monthlyBudget} onClick={e => e.stopPropagation()}
                    onChange={e => updateBucket('monthlyBudget', Number(e.target.value))}
                    className="w-16 bg-transparent border border-transparent hover:border-glass-border rounded px-1 py-0.5 text-xs text-text-muted text-right outline-none focus:border-accent/50" />
                )}
              </div>
              <div className="w-28 flex-shrink-0">
                {b.monthlyBudget > 0 ? (
                  <div className="w-full rounded-full h-3 relative" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                    <div className={`h-3 rounded-full transition-all duration-500`}
                      style={{
                        width: `${Math.max(Math.min(pctUsed, 100), pctUsed > 0 ? 6 : 0)}%`,
                        background: over ? 'linear-gradient(to right, #ef4444, #f87171)'
                          : pctUsed > 80 ? 'linear-gradient(to right, #f59e0b, #fbbf24)'
                          : 'linear-gradient(to right, #22c55e, #4ade80)',
                        boxShadow: over ? '0 0 8px rgba(239,68,68,0.5)'
                          : pctUsed > 80 ? '0 0 8px rgba(245,158,11,0.4)'
                          : '0 0 8px rgba(34,197,94,0.4)',
                      }} />
                    {over && <div className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-white/60 rounded" style={{ left: '100%', transform: 'translateX(-2px)' }} />}
                  </div>
                ) : (
                  <div className="w-full rounded-full h-3" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                )}
                <div className="text-[10px] text-text-muted text-right mt-0.5 font-medium">
                  {b.monthlyBudget > 0 ? `${Math.round(pctUsed)}%` : ''}
                </div>
              </div>
            </div>
          );
        })}

        {/* Inline "+ Add bucket" — only visible in edit mode */}
        {editMode && (newBucket === null ? (
          <button
            type="button"
            onClick={() => setNewBucket({ label: '', icon: '📦', monthlyBudget: '' })}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent/10 transition-colors text-text-muted hover:text-accent-light text-sm border-t border-glass-border"
          >
            <span className="text-base w-6 text-center">+</span>
            <span>Add a custom bucket</span>
          </button>
        ) : (
          <div className="px-4 py-3 flex flex-wrap items-center gap-2 bg-accent/5 border-y border-accent/20">
            <input
              type="text"
              placeholder="📦"
              value={newBucket.icon}
              onChange={e => setNewBucket({ ...newBucket, icon: e.target.value })}
              maxLength={2}
              className="w-10 text-center bg-surface-2 border border-glass-border rounded px-1 py-1 text-sm"
            />
            <input
              type="text"
              placeholder="Bucket name (e.g. Coffee)"
              value={newBucket.label}
              onChange={e => setNewBucket({ ...newBucket, label: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') addBucket(); if (e.key === 'Escape') setNewBucket(null); }}
              autoFocus
              className="flex-1 min-w-[160px] bg-surface-2 border border-glass-border rounded px-2 py-1 text-sm text-text-primary"
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-muted">$</span>
              <input
                type="number"
                step="0.01"
                placeholder="0"
                value={newBucket.monthlyBudget}
                onChange={e => setNewBucket({ ...newBucket, monthlyBudget: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') addBucket(); if (e.key === 'Escape') setNewBucket(null); }}
                className="w-20 bg-surface-2 border border-glass-border rounded px-1 py-1 text-sm text-right text-text-primary"
              />
              <span className="text-xs text-text-muted">/mo</span>
            </div>
            <button
              onClick={addBucket}
              disabled={!newBucket.label.trim() || !Number(newBucket.monthlyBudget)}
              className="px-3 py-1 rounded bg-accent hover:bg-accent-light disabled:bg-surface-2 disabled:text-text-muted text-white text-xs font-semibold transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setNewBucket(null)}
              className="px-3 py-1 rounded bg-surface-2 hover:bg-surface-3 text-text-muted text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        ))}

        {/* Allocation footer */}
        <div className="p-4 border-t border-glass-border space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Total budgeted</span>
            <span className={`font-bold ${unallocated < 0 ? 'text-negative' : 'text-text-primary'}`}>
              {formatCurrency(totalAllocated)} of {formatCurrency(paycheck.netTakeHome)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Total spent</span>
            <span className={`font-bold ${totalBucketSpend > totalAllocated ? 'text-negative' : totalBucketSpend > totalAllocated * 0.9 ? 'text-warning' : 'text-positive'}`}>
              {formatCurrency(totalBucketSpend)}
              <span className="text-xs text-text-muted font-normal ml-1">
                ({totalAllocated > 0 ? Math.round((totalBucketSpend / totalAllocated) * 100) : 0}% of budget)
              </span>
            </span>
          </div>
          {totalBucketSpend !== totalAllocated && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-glass-border/50">
              <span className="text-text-muted">{totalBucketSpend > totalAllocated ? 'Over budget by' : 'Under budget by'}</span>
              <span className={`font-semibold ${totalBucketSpend > totalAllocated ? 'text-negative' : 'text-positive'}`}>
                {formatCurrency(Math.abs(totalBucketSpend - totalAllocated))}
              </span>
            </div>
          )}
          {showCompare && (
            <div className="flex items-center justify-between text-sm pt-2 border-t border-glass-border mt-1">
              <span className="text-text-muted font-medium">Projected annual spend</span>
              <span className={`font-bold text-lg ${totalBucketSpend * 12 > paycheck.netTakeHome * 12 ? 'text-negative' : 'text-warning'}`}>
                {formatCurrency(totalBucketSpend * 12)}<span className="text-xs font-normal text-text-muted">/yr</span>
              </span>
            </div>
          )}
        </div>
      </div>
      </>)}

      {/* Category drilldown modal moved to end of component for proper z-index */}

      {!editMode && (<>
      </>)}

      {editMode && (<>
      {/* Fun Money */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-2">Fun Money</h2>
        <p className="text-xs text-text-muted mb-4">No-judgment spending. Each person gets their own budget. This is what stops the money fights.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {funMoney.map((fm, i) => {
            const updateFM = async (field: string, value: number) => {
              const updated = funMoney.map((f, idx) => idx === i ? { ...f, [field]: value } : f);
              setFunMoney(updated);
              await saveFunMoney(updated);
            };
            return (
              <div key={fm.earnerId ?? fm.person} className="p-4 rounded-xl bg-white/[0.03] border border-glass-border group">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-text-primary">{fm.emoji ?? '🎯'} {fm.person}</span>
                  <div className="flex items-center gap-0.5">
                    <span className="text-accent font-bold">$</span>
                    <input type="number" step="0.01" value={fm.monthlyBudget}
                      onChange={e => updateFM('monthlyBudget', Number(e.target.value))}
                      className="w-16 bg-transparent border border-transparent group-hover:border-glass-border rounded px-1 py-0.5 text-sm text-accent font-bold text-right outline-none focus:border-accent/50"
                    />
                    <span className="text-accent font-bold">/mo</span>
                  </div>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2 mb-1">
                  <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-all" style={{ width: `${fm.monthlyBudget > 0 ? Math.min(100, (fm.monthlySpent / fm.monthlyBudget) * 100) : 0}%` }} />
                </div>
                <div className="flex justify-between text-xs text-text-muted items-center">
                  {/* Spent is derived from this month's transactions in the pot's category — not editable */}
                  <span>{formatCurrency(fm.monthlySpent)} spent this month</span>
                  <span>{formatCurrency(fm.monthlyBudget - fm.monthlySpent)} remaining</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* (Stashes moved OUT of edit mode to the daily Overview — StashesCard.) */}

      {/* Bucket Groups — opt-in flex budgeting. Configuration, lives in edit mode. */}
      <BucketGroupsManager buckets={buckets} onChange={setBuckets} />
      </>)}

      {!editMode && (<>
      {/* Monthly Spending — collapsible. Avg tiles visible always; per-month bars expand on click. */}
      {monthlyData.length > 0 && (
        <details className="glass-card p-0 group">
          <summary className="cursor-pointer p-6 list-none hover:bg-surface-2 transition-colors rounded-2xl">
            <div className="flex items-start justify-between mb-4 gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Monthly Spending</h2>
                <p className="text-xs text-text-muted mt-1">Real numbers from your imported transactions — {expenses.length} total across {monthlyData.length} months</p>
              </div>
              <span className="text-[10px] text-text-muted whitespace-nowrap flex-shrink-0 mt-1">
                <span className="group-open:hidden">Show monthly bars ▾</span>
                <span className="hidden group-open:inline">Hide monthly bars ▴</span>
              </span>
            </div>
            {/* Avg tiles — always visible. Work expenses live in their own card; not duplicated here. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Avg Monthly Spend', value: formatCurrency(monthlyData.reduce((s, m) => s + m.totalExpenses, 0) / Math.max(monthlyData.filter(m => m.transactionCount > 10).length, 1)), color: 'text-text-primary' },
                { label: 'Avg Monthly Income', value: formatCurrency(monthlyData.reduce((s, m) => s + m.totalIncome, 0) / Math.max(monthlyData.filter(m => m.transactionCount > 10).length, 1)), color: 'text-positive' },
                { label: 'Avg Investments', value: formatCurrency(monthlyData.reduce((s, m) => s + m.totalInvestments, 0) / Math.max(monthlyData.filter(m => m.transactionCount > 10).length, 1)), color: 'text-accent-light' },
                { label: 'Total Transactions', value: expenses.length.toString(), color: 'text-text-primary' },
              ].map((s, i) => (
                <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-glass-border">
                  <div className="text-text-muted text-[10px] uppercase tracking-wider">{s.label}</div>
                  <div className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>
          </summary>
          {/* Per-month bars — only on expand */}
          <div className="px-6 pb-6 pt-4 border-t border-glass-border space-y-3">
            {monthlyData.map(m => {
              const maxExpense = Math.max(...monthlyData.map(mm => mm.totalExpenses), 1);
              const pct = (m.totalExpenses / maxExpense) * 100;
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-16 text-right font-mono">{m.monthLabel.split(' ')[0]}</span>
                  <div className="flex-1 bg-white/10 rounded-full h-6 relative overflow-hidden">
                    <div className="h-6 rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 flex items-center transition-all duration-500"
                      style={{ width: `${Math.min(pct, 100)}%` }}>
                      <span className="text-xs font-medium text-white pl-3 whitespace-nowrap">{formatCurrency(m.totalExpenses)}</span>
                    </div>
                  </div>
                  <span className="text-xs text-text-muted w-16 text-right">{m.transactionCount} txns</span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Trigger Center — pace warnings, surplus available, etc. Fed TRUE
          month-to-date buckets (the audit found it judging calendar pace
          against multi-month averages — incoherent). */}
      <TriggerCenter
        expenses={expenses}
        buckets={overviewInProgress ? applyMonthToBuckets(buckets, overviewInProgress) : buckets}
        onViewCategory={(cat) => setDrilldownCategory(cat)}
      />

      {/* Inflow questions — one-tap classification for ambiguous deposits */}
      <InflowQuestions expenses={expenses} />

      {/* Income Sources — detected paychecks, variable, side, dividends, reimbursements */}
      <IncomeSources expenses={expenses} />

      {/* Recurring Bills — auto-detected subscriptions, utilities, paychecks */}
      <RecurringBills expenses={expenses} />

      {/* Action Items — shared with dashboard, uses the same data */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Budget-Related Action Items</h2>
        <ActionItemsView items={actionItems} onItemsChange={handleActionItemsChange} filter="budget" />
      </div>
      </>)}
      </>}

      {/* Category Drilldown Modal — portal to body to escape backdrop-filter parents */}
      {drilldownCategory && (() => {
        const bucket = filteredBuckets.find(b => b.category === drilldownCategory);
        if (!bucket) return null;
        // In avg mode the list spans every COMPLETE month, so the comparison
        // number must be the per-month average — comparing a 9-month total to a
        // monthly budget (and annualizing it ×12) was a ~9x overstatement.
        const isAvgMode = resolvedOverviewMonth === 'avg' || resolvedOverviewMonth === 'latest';
        const expMonthKey = (e: Expense) => {
          if (!e.date) return '';
          return e.date.includes('/') ? (() => { const [m,,y] = e.date.split('/'); return `${y}-${m.padStart(2,'0')}`; })() : e.date.slice(0,7);
        };
        const monthFilter = (e: Expense) => {
          if (isAvgMode) return isCompleteMonth(expMonthKey(e));
          return expMonthKey(e) === resolvedOverviewMonth;
        };
        const catTxns = expenses
          .filter(e => e.category === drilldownCategory && isRealExpense(e) && !e.isWorkExpense)
          .filter(monthFilter)
          .sort((a, b) => b.amount - a.amount);
        const total = catTxns.reduce((s, e) => s + e.amount, 0);
        const monthsSpanned = isAvgMode ? Math.max(fullMonths.length, 1) : 1;
        const monthlyTotal = total / monthsSpanned;

        return createPortal(
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setDrilldownCategory(null)}>
            <div className="bg-surface-1 border border-glass-border rounded-xl w-full max-w-lg max-h-[70vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-glass-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{bucket.icon}</span>
                  <div>
                    <h3 className="font-semibold text-text-primary">{bucket.label}</h3>
                    <p className="text-xs text-text-muted">{catTxns.length} transactions · {formatCurrency(total)} total{isAvgMode && monthsSpanned > 1 ? ` · ${formatCurrency(monthlyTotal)}/mo avg over ${monthsSpanned} months` : ''}</p>
                  </div>
                </div>
                <button onClick={() => setDrilldownCategory(null)} className="text-text-muted hover:text-text-primary text-xl font-bold">×</button>
              </div>
              <div className="overflow-y-auto max-h-[55vh] p-4 space-y-1">
                {catTxns.length === 0 ? (
                  <p className="text-text-muted text-sm text-center py-8">No transactions for this category in the selected period</p>
                ) : catTxns.map((e) => {
                  const editing = reclassify?.id === e.id;
                  return (
                  <div key={e.id} className="py-2 text-sm border-b border-glass-border/50 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-text-primary truncate">{e.description}</div>
                        <div className="text-[10px] text-text-muted">{e.date}</div>
                      </div>
                      <span className="text-text-primary font-medium">{formatCurrency(e.amount)}</span>
                      <button
                        onClick={() => setReclassify(editing ? null : { id: e.id, cat: e.category || 'other', all: false, work: false })}
                        className="text-[11px] text-accent hover:text-accent-light flex-shrink-0">
                        {editing ? 'Close' : 'Move'}
                      </button>
                    </div>
                    {editing && reclassify && (
                      <div className="mt-2 p-2.5 rounded-lg bg-white/[0.03] border border-glass-border space-y-2">
                        <select
                          value={reclassify.cat}
                          disabled={reclassify.work}
                          onChange={ev => setReclassify(r => r ? { ...r, cat: ev.target.value } : r)}
                          className="w-full bg-surface-2 border border-glass-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent/50 disabled:opacity-50">
                          {buckets.map(b => (
                            <option key={b.category} value={b.category}>{b.icon} {b.label.split('(')[0].trim()}</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2 text-[11px] text-text-secondary cursor-pointer">
                          <input type="checkbox" checked={reclassify.all}
                            onChange={ev => setReclassify(r => r ? { ...r, all: ev.target.checked } : r)} />
                          Apply to all “{e.description}” — now &amp; future imports
                        </label>
                        <label className="flex items-center gap-2 text-[11px] text-text-secondary cursor-pointer">
                          <input type="checkbox" checked={reclassify.work}
                            onChange={ev => setReclassify(r => r ? { ...r, work: ev.target.checked } : r)} />
                          💼 Mark as work expense (moves out of spend)
                        </label>
                        <div className="flex gap-2 justify-end pt-0.5">
                          <button onClick={() => setReclassify(null)}
                            className="px-2 py-1 rounded bg-surface-2 text-text-muted text-xs">Cancel</button>
                          <button onClick={() => applyReclassify(e)}
                            className="px-2 py-1 rounded bg-accent text-white text-xs font-semibold">Save</button>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
              {/* Budget comparison + annualized projection — per-MONTH numbers */}
              <div className="border-t border-glass-border">
                {bucket.monthlyBudget > 0 && (
                  <div className={`px-4 py-2 text-xs font-medium ${monthlyTotal > bucket.monthlyBudget ? 'bg-negative/10 text-negative' : 'bg-positive/10 text-positive'}`}>
                    {monthlyTotal > bucket.monthlyBudget
                      ? `Over budget by ${formatCurrency(monthlyTotal - bucket.monthlyBudget)}/mo (budget: ${formatCurrency(bucket.monthlyBudget)})`
                      : `Under budget by ${formatCurrency(bucket.monthlyBudget - monthlyTotal)}/mo (budget: ${formatCurrency(bucket.monthlyBudget)})`}
                  </div>
                )}
                <div className="px-4 py-2 bg-white/[0.02] flex items-center justify-between text-xs">
                  <span className="text-text-muted">Projected annual spend</span>
                  <span className="font-bold text-text-primary">{formatCurrency(monthlyTotal * 12)}/yr</span>
                </div>
                {bucket.monthlyBudget > 0 && (
                  <div className="px-4 py-2 bg-white/[0.02] flex items-center justify-between text-xs border-t border-glass-border/50">
                    <span className="text-text-muted">Annual budget</span>
                    <span className="text-text-secondary">{formatCurrency(bucket.monthlyBudget * 12)}/yr</span>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
