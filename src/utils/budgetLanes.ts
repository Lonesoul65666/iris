/**
 * Budget lanes — three kinds of money, judged on their own terms.
 *
 *  • fixed     Non-negotiable recurring bills (mortgage, daycare, utilities…).
 *              At/near budget = ON TARGET (good). The bill landing as expected
 *              is reassuring, not alarming — so these only flag when they come
 *              in MEANINGFULLY higher than budget (see FIXED_OVER_TOLERANCE).
 *  • flexible  Discretionary spend (dining, amazon, fun…). This is the only
 *              lane where "approaching / over budget" is a real problem and the
 *              blue→amber→red pressure coloring applies.
 *  • reserve   Lumpy / annual obligations (taxes, travel). Funded by a monthly
 *              set-aside; actual spend is episodic. NEVER counted in the monthly
 *              over/under — a $13k April tax payment is a planned withdrawal,
 *              not a budget bust.
 *
 * The classification lives in code (not bucket data) on purpose: the running app
 * rewrites the buckets collection, so anything stored there can get clobbered.
 * Source-of-truth here is durable.
 */

export type BudgetLane = 'fixed' | 'flexible' | 'reserve';

// Non-negotiable bills. "On target" when at/under budget.
export const FIXED_CATEGORIES = [
  'housing', 'childcare', 'utilities', 'insurance', 'healthcare',
  'kids', 'transportation', 'food_groceries', 'charity', 'investing',
];

// Lumpy / annual. Excluded from monthly over/under; tracked as reserves.
// (DMV / vehicle registration lands in `taxes` in the data — e.g. Tarrant County MV.)
export const RESERVE_CATEGORIES = [
  'taxes', 'travel_personal', 'travel_work',
];

// Monthly set-aside per reserve. Derived from real annual actuals (Scott, 2026-06):
// taxes ≈ $16–18k/yr → $1,500/mo; travel ad-hoc ~$1,000/mo; work travel is
// reimbursed (tracked in the Work Expense card), so $0 personal reserve.
export const RESERVE_ALLOCATIONS: Record<string, number> = {
  taxes: 1500,
  travel_personal: 1000,
  travel_work: 0,
};

// A fixed bill is only "over" if it busts budget by more than this factor.
// Small month-to-month variance on a fixed bill is noise, not a problem.
export const FIXED_OVER_TOLERANCE = 1.15;

// Below this fraction of budget, a flexible category is comfortably under;
// at/above it (but under 100%) it's "approaching" → amber.
export const FLEX_APPROACHING = 0.9;

const FIXED = new Set(FIXED_CATEGORIES);
const RESERVE = new Set(RESERVE_CATEGORIES);

export function laneOf(category: string): BudgetLane {
  if (RESERVE.has(category)) return 'reserve';
  if (FIXED.has(category)) return 'fixed';
  return 'flexible';
}

/**
 * Is this category genuinely over budget in a way worth flagging?
 *  - reserve : never (lumpy by design)
 *  - fixed   : only beyond the tolerance band
 *  - flexible: any time actual exceeds budget
 * Categories with no budget set are never "over" (nothing to bust).
 */
export function isOverBudget(category: string, actual: number, budget: number): boolean {
  if (budget <= 0) return false;
  const lane = laneOf(category);
  if (lane === 'reserve') return false;
  if (lane === 'fixed') return actual > budget * FIXED_OVER_TOLERANCE;
  return actual > budget;
}
