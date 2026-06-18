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
// These are the DEFAULTS — once the user configures Stashes, the categories
// they link become the reserve lane via configureStashLanes() below.
export const RESERVE_CATEGORIES = [
  'taxes', 'travel_personal', 'travel_work',
];

// Default monthly set-aside per reserve, used until Stashes are configured (and
// as the re-seed value if a stash is deleted). Aligned to Scott's live stashes
// ($1,000 each) so a re-seed can't silently bump taxes to a value he didn't pick.
// NOTE: real taxes run ~$1,400/mo amortized, so $1,000 under-funds long-term —
// that gap is now surfaced by the scorecard's solvency line, Scott's call to raise.
// (travel ad-hoc ~$1,000/mo; work travel is reimbursed → $0.)
export const RESERVE_ALLOCATIONS: Record<string, number> = {
  taxes: 1000,
  travel_personal: 1000,
  travel_work: 0,
};

// ── Stash-driven reserve registry ────────────────────────────────────────
// Stashes (user-owned saving pots with linked categories) define the reserve
// lane at runtime. Same registry pattern as registerCustomCategories: callers
// of laneOf()/getReserveAllocations() never change. Until configureStashLanes
// runs, behavior is byte-identical to the historical constants above.
// travel_work always stays reserve (reimbursed work spend is never a monthly
// alarm, stash or no stash).

let reserveSet = new Set(RESERVE_CATEGORIES);
let reserveAllocations: Record<string, number> = { ...RESERVE_ALLOCATIONS };
let reserveTotalOverride: number | null = null;

export function configureStashLanes(
  categories: string[],
  allocations: Record<string, number>,
  /** Σ of ALL stash contributions — includes pure savings pots (no categories),
   *  which still come off the top of Safe-to-Spend. */
  totalSetAside?: number,
): void {
  reserveSet = new Set(['travel_work', ...categories]);
  reserveAllocations = { ...allocations };
  reserveTotalOverride = typeof totalSetAside === 'number' ? totalSetAside : null;
}

/** Current per-category monthly set-asides (stash-configured or defaults). */
export function getReserveAllocations(): Record<string, number> {
  return reserveAllocations;
}

/** Σ monthly set-asides — the "reserve set-asides" line in Safe-to-Spend. */
export function totalReserveSetAside(): number {
  if (reserveTotalOverride !== null) return reserveTotalOverride;
  return Object.values(reserveAllocations).reduce((s, v) => s + v, 0);
}

// A fixed bill is only "over" if it busts budget by more than this factor.
// Small month-to-month variance on a fixed bill is noise, not a problem.
export const FIXED_OVER_TOLERANCE = 1.15;

// Below this fraction of budget, a flexible category is comfortably under;
// at/above it (but under 100%) it's "approaching" → amber.
export const FLEX_APPROACHING = 0.9;

const FIXED = new Set(FIXED_CATEGORIES);

export function laneOf(category: string): BudgetLane {
  if (reserveSet.has(category)) return 'reserve';
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
