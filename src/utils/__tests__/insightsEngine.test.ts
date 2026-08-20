import { describe, it, expect } from 'vitest';
import { generateInsights, JUDGING_WINDOW_MONTHS, SAVINGS_TRIPWIRE_DAYS } from '../insightsEngine';
import { applyTransactionsToBuckets } from '../transactionAnalysis';
import { exp } from './fixtures';
import type { BudgetBucket, Expense, PaycheckBreakdown } from '../../types/budget';

// A budget-vs-reality verdict is only as good as the window it judges on. Amazon
// averaged $1,200/mo across 11 months (a Sep '25–Mar '26 run) while the trailing
// three ran $517 against a $550 budget — the lifetime average kept alarming about
// spending that had already stopped. These pin both directions: an old spike must
// go quiet, a live overspend must still shout.
const NOW = new Date(2026, 7, 19); // Aug 19 2026 — August is incomplete

const bucket = (over: Partial<BudgetBucket> = {}): BudgetBucket => ({
  category: 'amazon', label: 'Amazon', monthlyBudget: 550, monthlyActual: 0,
  icon: '📦', color: '#fff', ...over,
} as BudgetBucket);

function insightsFor(history: Expense[]) {
  const buckets = applyTransactionsToBuckets([bucket()], history);
  return generateInsights({
    expenses: history,
    buckets,
    paycheck: { netTakeHome: 15800 } as PaycheckBreakdown,
    sinkingFunds: [], funMoney: [],
    monthlyInvestmentAmount: 0, totalLiquidAssets: 50000,
  });
}
const amazonInsight = (history: Expense[]) => insightsFor(history).find(i => i.id === 'overbudget-amazon');

const amazon = (date: string, amount: number) => exp({ date, amount, category: 'amazon' });

describe('over-budget insight — judged on the recent window', () => {
  it('an OLD spike that has since calmed down does not alarm', () => {
    const history = [
      amazon('2026-02-05', 2800), amazon('2026-03-05', 1800), // the bad run
      amazon('2026-05-05', 400), amazon('2026-06-05', 400), amazon('2026-07-05', 400), // calm since
    ];
    // Lifetime average is well over the $550 budget…
    const buckets = applyTransactionsToBuckets([bucket()], history);
    expect(buckets[0].monthlyActual).toBeGreaterThan(550);
    // …but recent behaviour is under it, so no alarm.
    expect(amazonInsight(history)).toBeUndefined();
  });

  it('a CURRENT overspend still alarms', () => {
    const history = [
      amazon('2026-02-05', 100), amazon('2026-03-05', 100),   // clean history
      amazon('2026-05-05', 1200), amazon('2026-06-05', 1200), amazon('2026-07-05', 1200), // over now
    ];
    const ins = amazonInsight(history);
    expect(ins).toBeDefined();
    expect(ins!.severity).toBe('critical');   // >= 50% over
    expect(ins!.title).toContain('over budget');
  });

  it('states the window it judged on, so it cannot be mistaken for a lifetime figure', () => {
    const history = [
      amazon('2026-05-05', 900), amazon('2026-06-05', 900), amazon('2026-07-05', 900),
    ];
    expect(amazonInsight(history)!.description).toContain(`last ${JUDGING_WINDOW_MONTHS} months`);
  });

  it('reports the RECENT average, not the lifetime one', () => {
    const history = [
      amazon('2026-01-05', 5000),  // ancient outlier
      amazon('2026-05-05', 900), amazon('2026-06-05', 900), amazon('2026-07-05', 900),
    ];
    const d = amazonInsight(history)!.description;
    expect(d).toContain('$900');
    expect(d).not.toContain('$5k');  // the $5,000 outlier must not surface ($550 budget is fine)
  });

  it('the in-progress month never drives the verdict', () => {
    const history = [
      amazon('2026-05-05', 400), amazon('2026-06-05', 400), amazon('2026-07-05', 400),
      amazon('2026-08-05', 9999), // August is incomplete on NOW
    ];
    void NOW;
    expect(amazonInsight(history)).toBeUndefined();
  });
});

// The savings tripwire scanned ALL history with no window, so a February cash
// run was still warning in August. Live case: "$1.6k spent straight from
// savings" was a $150 Zelle from Dec 2025 plus NINE rows from one Dubai trip in
// Feb 2026 — five of which were $5–8 ATM fees counted as separate "charges".
describe('savings tripwire — recent only, and fees ride along', () => {
  const savings = (date: string, amount: number, description: string) =>
    exp({ date, amount, description, source: 'bofa_savings', category: 'atm_cash' });

  const find = (history: Expense[], now: Date) =>
    generateInsights({
      expenses: history,
      buckets: [bucket({ monthlyBudget: 0 })],
      paycheck: { netTakeHome: 15800 } as PaycheckBreakdown,
      sinkingFunds: [], funMoney: [],
      monthlyInvestmentAmount: 0, totalLiquidAssets: 50000,
      now,
    }).find(i => i.id === 'savings-withdrawal');

  it('goes quiet once the withdrawal falls outside the window', () => {
    const history = [savings('2026-02-05', 500, 'WITHDRWL Dubai AE')];
    expect(find(history, new Date(2026, 1, 20))).toBeDefined();  // Feb 20 — fresh
    expect(find(history, new Date(2026, 7, 19))).toBeUndefined(); // Aug 19 — stale
  });

  it('counts one withdrawal as one charge even when the bank adds fees', () => {
    const history = [
      savings('2026-08-05', 293.67, 'WITHDRWL 10014413'),
      savings('2026-08-05', 5, 'WITHDRWL 10014413 FEE'),
      savings('2026-08-05', 8.38, 'INTERNATIONAL TRANSACTION FEE'),
    ];
    const ins = find(history, new Date(2026, 7, 19))!;
    expect(ins.description).toContain('A charge');       // one, not three
    expect(ins.description).toContain('2 bank fees');    // fees disclosed separately
    expect(ins.metric).toBeCloseTo(307.05, 2);           // total still includes them
  });

  it('states the window so a stale-looking number can be placed in time', () => {
    const ins = find([savings('2026-08-05', 400, 'WITHDRWL')], new Date(2026, 7, 19))!;
    expect(ins.description).toContain(`last ${SAVINGS_TRIPWIRE_DAYS} days`);
  });
});
