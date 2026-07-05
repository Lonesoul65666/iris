import { describe, it, expect } from 'vitest';
import { buildAdvisorFacts } from '../advisorFacts';
import type { Expense, BudgetBucket, PaycheckBreakdown } from '../../types/budget';

const NOW = new Date(2026, 6, 15); // Jul 15 → May & Jun complete

function exp(date: string, amount: number, category: string, description = category): Expense {
  return {
    id: `e-${date}-${category}-${amount}`, date, amount, description,
    category, flow: 'outflow', transactionType: 'expense', isWorkExpense: false,
  } as Expense;
}

const EXPENSES: Expense[] = [
  exp('2026-05-10', 420, 'food_dining'), exp('2026-06-10', 580, 'food_dining'),
  exp('2026-06-11', 120, 'amazon'), exp('2026-05-11', 280, 'amazon'),
  exp('2026-06-20', 240, 'other', 'SQ *MYSTERY VENDOR FORT WORTH'),
];
const BUCKETS: BudgetBucket[] = [
  { category: 'food_dining', label: 'Dining Out', icon: '🍽️', monthlyBudget: 400, monthlyActual: 0 } as BudgetBucket,
  { category: 'amazon', label: 'Amazon', icon: '📦', monthlyBudget: 300, monthlyActual: 0 } as BudgetBucket,
];
const PAYCHECK = { netTakeHome: 15800 } as PaycheckBreakdown;

describe('buildAdvisorFacts', () => {
  it('reports no data when there is no complete month to review', () => {
    const f = buildAdvisorFacts([exp('2026-07-05', 50, 'food_dining')], BUCKETS, PAYCHECK, NOW);
    expect(f.hasData).toBe(false);
    expect(f.brief).toBe('');
  });

  it('grounds the brief in the real over/under figures and take-home', () => {
    const f = buildAdvisorFacts(EXPENSES, BUCKETS, PAYCHECK, NOW);
    expect(f.hasData).toBe(true);
    expect(f.monthLabel).toBe('Jun 2026');
    expect(f.brief).toContain('OVER: Dining Out');
    expect(f.brief).toContain('$580');   // actual
    expect(f.brief).toContain('$400');   // plan
    expect(f.brief).toContain('$15,800'); // take-home
  });

  it('surfaces uncategorized charges as the "what are these" list', () => {
    const f = buildAdvisorFacts(EXPENSES, BUCKETS, PAYCHECK, NOW);
    expect(f.brief).toContain('UNCATEGORIZED');
    expect(f.brief).toContain('MYSTERY VENDOR');
  });
});
