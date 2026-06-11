import type { Expense } from '../../types/budget';

let seq = 0;

/**
 * Minimal Expense factory for pure-function tests. Defaults to a plain
 * personal outflow expense; override only the fields the function under
 * test actually reads (date, amount, category, flow, transactionType,
 * isWorkExpense, description).
 */
export function exp(
  overrides: Partial<Expense> & Pick<Expense, 'date' | 'amount'>,
): Expense {
  seq += 1;
  return {
    id: `e-${seq}`,
    description: '',
    category: 'other',
    reimbursementStatus: 'not_reimbursable',
    isWorkExpense: false,
    recurring: false,
    flow: 'outflow',
    transactionType: 'expense',
    ...overrides,
  };
}
