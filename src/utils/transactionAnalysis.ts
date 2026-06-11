import type { Expense, ExpenseCategory, BudgetBucket, CustomCategory } from '../types/budget';
import { laneOf } from './budgetLanes';

// ─── Canonical month axis ───
//
// A month is COMPLETE when the calendar has moved past it — never by counting
// transactions. (The old >10-transaction heuristic marked the in-progress month
// "full" within 2–3 days at this household's volume, polluting every average.)

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function isCompleteMonth(ym: string, now: Date = new Date()): boolean {
  return /^\d{4}-\d{2}$/.test(ym) && ym < currentMonthKey(now);
}

/** Parse an expense date string as LOCAL time. `new Date('YYYY-MM-DD')` parses
 *  as UTC midnight — which is the previous evening in US timezones, so
 *  1st-of-month paychecks silently fell out of "this month" / YTD windows. */
export function parseLocalDate(dateStr: string): Date {
  if (dateStr.includes('/')) {
    const [m, d, y] = dateStr.split('/').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// ─── Canonical "what counts" predicates ───

/** A real spending transaction: outflow, expense-typed (not transfer/investment/refund). */
export function isRealExpense(e: Expense): boolean {
  return (e.flow || 'outflow') === 'outflow' && (e.transactionType || 'expense') === 'expense';
}

/** Reimbursable work spend: the manual flag OR the travel_work category. ONE definition. */
export function isWorkSpend(e: Expense): boolean {
  return !!e.isWorkExpense || e.category === 'travel_work';
}

// ─── Monthly spending aggregation ───

export interface MonthlySpending {
  month: string; // "2026-01", "2026-02", etc.
  monthLabel: string; // "Jan 2026", "Feb 2026", etc.
  byCategory: Record<string, number>;
  totalExpenses: number;   // personal spend only — work expenses are excluded
  totalOperating: number;  // totalExpenses minus reserve lanes (taxes/travel) — THE operating-spend number
  totalReserve: number;    // personal reserve-lane outflows (taxes, travel_personal) — lumpy by design
  totalWork: number;       // reimbursable work spend (flagged OR travel_work)
  totalIncome: number;     // real earned income only (excludes reimbursements)
  totalReimbursement: number; // work-expense payback (e.g. Coupa) — offsets totalWork, NOT income
  totalTransfers: number;
  totalInvestments: number;
  transactionCount: number;
}

export interface CategoryTrend {
  category: ExpenseCategory;
  label: string;
  icon: string;
  months: { month: string; amount: number }[];
  avgMonthly: number;
  totalPeriod: number;
  trend: 'up' | 'down' | 'flat'; // compared to prior month
  trendPct: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthKey(dateStr: string): string {
  // Handle both MM/DD/YYYY and YYYY-MM-DD
  if (dateStr.includes('/')) {
    const [m, , y] = dateStr.split('/');
    return `${y}-${m.padStart(2, '0')}`;
  }
  return dateStr.slice(0, 7);
}

function getMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

// Aggregate all transactions into monthly spending summaries
export function computeMonthlySpending(expenses: Expense[]): MonthlySpending[] {
  const months = new Map<string, MonthlySpending>();

  for (const e of expenses) {
    const key = getMonthKey(e.date);
    if (!months.has(key)) {
      months.set(key, {
        month: key,
        monthLabel: getMonthLabel(key),
        byCategory: {},
        totalExpenses: 0,
        totalOperating: 0,
        totalReserve: 0,
        totalWork: 0,
        totalIncome: 0,
        totalReimbursement: 0,
        totalTransfers: 0,
        totalInvestments: 0,
        transactionCount: 0,
      });
    }
    const m = months.get(key)!;
    m.transactionCount++;

    const flow = e.flow || 'outflow';
    const txType = e.transactionType || 'expense';

    if (txType === 'transfer') { m.totalTransfers += e.amount; continue; }
    if (txType === 'investment') { m.totalInvestments += e.amount; continue; }

    // Refunds NET AGAINST SPEND — they are not income, and they credit back the
    // category they refund (an Amazon return shrinks the Amazon bar). Checked
    // before the inflow branch: refunds arrive as inflows, and the old order
    // booked them as income while the spend they offset stayed on the books.
    if (txType === 'refund') {
      if (isWorkSpend(e)) {
        m.totalWork -= e.amount;
        m.byCategory['travel_work'] = (m.byCategory['travel_work'] || 0) - e.amount;
        continue;
      }
      const cat = e.category || 'other';
      m.totalExpenses -= e.amount;
      if (laneOf(cat) === 'reserve') m.totalReserve -= e.amount;
      else m.totalOperating -= e.amount;
      m.byCategory[cat] = (m.byCategory[cat] || 0) - e.amount;
      continue;
    }

    if (flow === 'inflow') {
      // Reimbursements (e.g. Coupa) are work-expense payback, NOT earned income —
      // they offset work spend, so they must not inflate totalIncome / grossMonthly.
      if (txType === 'reimbursement') { m.totalReimbursement += e.amount; continue; }
      m.totalIncome += e.amount;
      continue;
    }

    // Work expenses (manually flagged OR the travel_work category) are
    // reimbursable — pull them OUT of totalExpenses so they don't inflate
    // "monthly spend" with money that comes back as reimbursement income.
    // Tracked separately (totalWork + byCategory['travel_work']) for the
    // Work Expenses & Reimbursements view. Flag wins over category, so a work
    // dinner (category food_dining, isWorkExpense=true) leaves food_dining too.
    if (isWorkSpend(e)) {
      m.totalWork += e.amount;
      m.byCategory['travel_work'] = (m.byCategory['travel_work'] || 0) + e.amount;
      continue;
    }

    // Real (personal) expense — split into operating vs reserve lanes
    const cat = e.category || 'other';
    m.totalExpenses += e.amount;
    if (laneOf(cat) === 'reserve') m.totalReserve += e.amount;
    else m.totalOperating += e.amount;
    m.byCategory[cat] = (m.byCategory[cat] || 0) + e.amount;
  }

  return [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v);
}

// Compute the average monthly actual for each budget category from transaction
// data. CALENDAR-complete months only — the in-progress month is excluded from
// both numerator and denominator (it used to sit in both, understating every
// average early in the month and overstating surplus).
export function computeCategoryAverages(
  expenses: Expense[],
  now: Date = new Date()
): Record<ExpenseCategory, number> {
  const monthly = computeMonthlySpending(expenses).filter(m => isCompleteMonth(m.month, now));
  const numMonths = Math.max(monthly.length, 1);

  const totals: Record<string, number> = {};
  for (const m of monthly) {
    for (const [cat, amt] of Object.entries(m.byCategory)) {
      totals[cat] = (totals[cat] || 0) + amt;
    }
  }

  const averages: Record<string, number> = {};
  for (const [cat, total] of Object.entries(totals)) {
    averages[cat] = Math.round(total / numMonths);
  }

  return averages as Record<ExpenseCategory, number>;
}

// Update budget bucket "monthlyActual" fields from imported transaction data
export function applyTransactionsToBuckets(
  buckets: BudgetBucket[],
  expenses: Expense[]
): BudgetBucket[] {
  const averages = computeCategoryAverages(expenses);

  return buckets.map(bucket => {
    const actual = averages[bucket.category];
    // If we have transaction data for this category, use it (even if 0).
    // If the category never appeared in transactions, keep the existing value.
    if (actual !== undefined) {
      return { ...bucket, monthlyActual: actual };
    }
    return bucket;
  });
}

/** Apply a single month's actual spending to budget buckets (for month-by-month view) */
export function applyMonthToBuckets(
  buckets: BudgetBucket[],
  monthData: MonthlySpending
): BudgetBucket[] {
  return buckets.map(bucket => {
    // Investing bucket keeps its synced value — no bank transactions for this
    if (bucket.category === 'investing') return bucket;
    const actual = monthData.byCategory[bucket.category];
    return { ...bucket, monthlyActual: actual !== undefined ? Math.round(actual) : 0 };
  });
}

/** Get work expense totals for a specific month. Uses the ONE work definition
 *  (flag OR travel_work) — auto-categorized work travel used to be invisible here. */
export function computeWorkExpenses(expenses: Expense[], monthKey?: string): { work: number; personal: number } {
  const real = expenses.filter(e =>
    isRealExpense(e) &&
    (!monthKey || getMonthKey(e.date) === monthKey)
  );
  const work = real.filter(isWorkSpend).reduce((s, e) => s + e.amount, 0);
  const personal = real.filter(e => !isWorkSpend(e)).reduce((s, e) => s + e.amount, 0);
  return { work: Math.round(work), personal: Math.round(personal) };
}

// Category label + icon lookup (matches ExpenseManager's CATEGORY_OPTIONS)
// Mutable so custom categories can be registered at runtime
const CATEGORY_INFO: Record<string, { label: string; icon: string }> = {
  housing: { label: 'Housing', icon: '🏠' },
  food_groceries: { label: 'Groceries', icon: '🛒' },
  food_dining: { label: 'Dining / Takeout', icon: '🍽️' },
  childcare: { label: 'Childcare', icon: '👶' },
  transportation: { label: 'Transportation', icon: '🚗' },
  utilities: { label: 'Utilities', icon: '💡' },
  insurance: { label: 'Insurance', icon: '🛡️' },
  healthcare: { label: 'Healthcare', icon: '🏥' },
  subscriptions: { label: 'Subscriptions', icon: '📱' },
  kids: { label: 'Kids', icon: '🎒' },
  fun_scott: { label: 'Personal Fun (1)', icon: '🎮' },
  fun_wife: { label: 'Personal Fun (2)', icon: '💅' },
  clothing: { label: 'Clothing', icon: '👕' },
  gifts_holidays: { label: 'Gifts / Holidays', icon: '🎁' },
  home_maintenance: { label: 'Home Maintenance', icon: '🔧' },
  car_maintenance: { label: 'Car Maintenance', icon: '🔩' },
  travel_personal: { label: 'Travel (Personal)', icon: '✈️' },
  travel_work: { label: 'Work Expenses', icon: '💼' },
  personal: { label: 'Personal Care', icon: '💇' },
  charity: { label: 'Charity', icon: '💛' },
  entertainment: { label: 'Entertainment', icon: '🎟️' },
  alcohol: { label: 'Alcohol', icon: '🍷' },
  electronics: { label: 'Electronics', icon: '🖥️' },
  investing: { label: 'Investing', icon: '📈' },
  education: { label: 'Education', icon: '📚' },
  pets: { label: 'Pets', icon: '🐾' },
  savings: { label: 'Savings', icon: '🏦' },
  debt: { label: 'Debt Payments', icon: '💳' },
  amazon: { label: 'Amazon', icon: '📦' },
  taxes: { label: 'Taxes', icon: '🏛️' },
  other: { label: 'Other', icon: '📦' },
};

/** Merge user-created custom categories into the lookup table so trends/comparisons show proper labels */
export function registerCustomCategories(cats: CustomCategory[]): void {
  for (const c of cats) {
    CATEGORY_INFO[c.id] = { label: c.label, icon: c.icon };
  }
}

// Compute per-category trends across months
export function computeCategoryTrends(expenses: Expense[]): CategoryTrend[] {
  const monthly = computeMonthlySpending(expenses);
  if (monthly.length === 0) return [];

  // Get all categories that appear
  const allCats = new Set<string>();
  for (const m of monthly) {
    for (const cat of Object.keys(m.byCategory)) allCats.add(cat);
  }

  const trends: CategoryTrend[] = [];
  for (const cat of allCats) {
    const info = CATEGORY_INFO[cat] || { label: cat, icon: '📦' };
    const monthData = monthly.map(m => ({ month: m.monthLabel, amount: m.byCategory[cat] || 0 }));
    const total = monthData.reduce((s, m) => s + m.amount, 0);
    const avg = total / monthly.length;

    // Trend: compare the last two CALENDAR-complete months
    let trend: 'up' | 'down' | 'flat' = 'flat';
    let trendPct = 0;
    const complete = monthly.filter(m => isCompleteMonth(m.month));
    if (complete.length >= 2) {
      const last = complete[complete.length - 1].byCategory[cat] || 0;
      const prev = complete[complete.length - 2].byCategory[cat] || 0;
      if (prev > 0) {
        trendPct = ((last - prev) / prev) * 100;
        trend = trendPct > 10 ? 'up' : trendPct < -10 ? 'down' : 'flat';
      }
    }

    trends.push({
      category: cat as ExpenseCategory,
      label: info.label,
      icon: info.icon,
      months: monthData,
      avgMonthly: Math.round(avg),
      totalPeriod: Math.round(total),
      trend,
      trendPct: Math.round(trendPct),
    });
  }

  return trends.sort((a, b) => b.avgMonthly - a.avgMonthly);
}

// Quick summary stats for dashboard
export interface SpendingSummary {
  totalExpenses: number;
  totalIncome: number;
  totalInvestments: number;
  monthCount: number;
  avgMonthlyExpenses: number;
  avgMonthlyIncome: number;
  topCategories: { category: string; label: string; icon: string; avgMonthly: number }[];
  monthOverMonth: { label: string; expenses: number; income: number }[];
}

export function computeSpendingSummary(expenses: Expense[]): SpendingSummary {
  const monthly = computeMonthlySpending(expenses);
  const realExpenses = expenses.filter(isRealExpense);

  // Average over CALENDAR-complete months only — the in-progress month would
  // drag every average down for the first three weeks of the month.
  const fullMonths = monthly.filter(m => isCompleteMonth(m.month));
  const avgMonths = fullMonths.length > 0 ? fullMonths : monthly; // fallback if all partial

  const totalExpenses = monthly.reduce((s, m) => s + m.totalExpenses, 0);
  const totalIncome = monthly.reduce((s, m) => s + m.totalIncome, 0);
  const totalInvestments = monthly.reduce((s, m) => s + m.totalInvestments, 0);
  const monthCount = Math.max(monthly.length, 1);

  const fullMonthExpenses = avgMonths.reduce((s, m) => s + m.totalExpenses, 0);
  const fullMonthIncome = avgMonths.reduce((s, m) => s + m.totalIncome, 0);
  const fullMonthCount = Math.max(avgMonths.length, 1);

  const trends = computeCategoryTrends(realExpenses);

  return {
    totalExpenses,
    totalIncome,
    totalInvestments,
    monthCount,
    avgMonthlyExpenses: Math.round(fullMonthExpenses / fullMonthCount),
    avgMonthlyIncome: Math.round(fullMonthIncome / fullMonthCount),
    topCategories: trends.slice(0, 8).map(t => ({
      category: t.category,
      label: t.label,
      icon: t.icon,
      avgMonthly: t.avgMonthly,
    })),
    monthOverMonth: monthly.map(m => ({
      label: m.monthLabel,
      expenses: Math.round(m.totalExpenses),
      income: Math.round(m.totalIncome),
    })),
  };
}

// Month-over-month comparison: last full month vs prior month
export interface MonthComparison {
  currentMonth: string;
  priorMonth: string;
  currentExpenses: number;
  priorExpenses: number;
  expenseChange: number;
  expenseChangePct: number;
  currentIncome: number;
  priorIncome: number;
  categoryChanges: { category: string; label: string; icon: string; current: number; prior: number; change: number; changePct: number }[];
}

export function computeMonthComparison(expenses: Expense[]): MonthComparison | null {
  // Compare the last two CALENDAR-complete months (the in-progress month is
  // excluded by date, not by guessing from position/transaction count).
  const monthly = computeMonthlySpending(expenses).filter(m => isCompleteMonth(m.month));
  if (monthly.length < 2) return null;

  const current = monthly[monthly.length - 1];
  const prior = monthly[monthly.length - 2];

  const expenseChange = current.totalExpenses - prior.totalExpenses;
  const expenseChangePct = prior.totalExpenses > 0 ? (expenseChange / prior.totalExpenses) * 100 : 0;

  // Category-level changes
  const allCats = new Set([...Object.keys(current.byCategory), ...Object.keys(prior.byCategory)]);
  const categoryChanges: MonthComparison['categoryChanges'] = [];
  for (const cat of allCats) {
    const cur = current.byCategory[cat] || 0;
    const prev = prior.byCategory[cat] || 0;
    const change = cur - prev;
    if (Math.abs(change) < 20) continue; // skip trivial changes
    const info = CATEGORY_INFO[cat] || { label: cat, icon: '📦' };
    categoryChanges.push({
      category: cat, label: info.label, icon: info.icon,
      current: Math.round(cur), prior: Math.round(prev),
      change: Math.round(change),
      changePct: prev > 0 ? Math.round((change / prev) * 100) : 100,
    });
  }
  categoryChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return {
    currentMonth: current.monthLabel,
    priorMonth: prior.monthLabel,
    currentExpenses: Math.round(current.totalExpenses),
    priorExpenses: Math.round(prior.totalExpenses),
    expenseChange: Math.round(expenseChange),
    expenseChangePct: Math.round(expenseChangePct),
    currentIncome: Math.round(current.totalIncome),
    priorIncome: Math.round(prior.totalIncome),
    categoryChanges: categoryChanges.slice(0, 6),
  };
}
