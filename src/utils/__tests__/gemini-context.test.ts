import { describe, it, expect } from 'vitest';
import { buildPortfolioContext, type BudgetContext } from '../../services/gemini';

// Regression guard for the "Ask Iris can't read my data" bug (2026-07-19):
// the chat context used to feed the LLM only a budget PLAN + averages, so it
// mislabeled the $13,397 bucket sum as "your budget", had no per-month actuals,
// and told the user to "upload documents". These assert the transaction-grounded
// performance block is present and framed correctly.

const budget: BudgetContext = {
  buckets: [
    { category: 'groceries', label: 'Groceries', monthlyBudget: 800, monthlyActual: 900 },
    { category: 'amazon', label: 'Amazon', monthlyBudget: 600, monthlyActual: 1251 },
  ] as unknown as BudgetContext['buckets'],
  performance: {
    guaranteedBase: 15800,
    monthsUnderBase: 4,
    fullMonthCount: 6,
    cumulativeBanked: 22000,
    trend: 'up',
    months: [
      { label: 'May 2026', totalSpend: 12400, surplusVsBase: 3400, banked: 4100, partial: false },
      { label: 'June 2026', totalSpend: 14200, surplusVsBase: 1600, banked: 2600, partial: false },
      { label: 'July 2026', totalSpend: 6077, surplusVsBase: 9723, banked: 0, partial: true },
    ],
    currentMonth: { label: 'July 2026', spentSoFar: 6077, bufferVsBase: 9723, safeToSpend: 2770, daysLeft: 13, onTrack: true },
  },
};

describe('buildPortfolioContext — monthly performance (Ask Iris data fix)', () => {
  const ctx = buildPortfolioContext([], undefined, undefined, budget);

  it('anchors on the $15,800 guaranteed base as THE frame', () => {
    expect(ctx).toContain('GUARANTEED BASE');
    expect(ctx).toContain('$15,800');
  });

  it('includes per-month actuals so "how did I do in June?" is answerable', () => {
    expect(ctx).toContain('June 2026');
    expect(ctx).toContain('| Month | Spent | Vs base | Banked |');
    expect(ctx).toMatch(/June 2026 \| \$14,200 \| \+\$1,600 under/);
  });

  it('surfaces the in-progress current month with buffer + days left', () => {
    expect(ctx).toContain('THIS MONTH (July 2026, in progress)');
    expect(ctx).toContain('$9,723 UNDER base');
    expect(ctx).toContain('13 days left');
    expect(ctx).toContain('ON TRACK');
  });

  it('does NOT mislabel the category bucket sum as "the budget"', () => {
    expect(ctx).toContain('Category budget (planning detail');
    // The $1,400 bucket sum must not be presented as the income frame.
    expect(ctx).not.toMatch(/Total monthly budget: \$1,400/);
  });
});
