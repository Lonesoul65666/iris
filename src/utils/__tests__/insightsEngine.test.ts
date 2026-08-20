import { describe, it, expect } from 'vitest';
import { generateInsights, JUDGING_WINDOW_MONTHS } from '../insightsEngine';
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
