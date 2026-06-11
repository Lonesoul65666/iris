// Safe-to-Spend — the one number that answers "can I buy this right now?"
//
//   safe = take-home  −  fixed bills  −  reserve set-asides  −  flexible spent so far
//
// Take-home is the guaranteed-base watermark (variable/RSU = surplus, never
// budgeted). Fixed bills are committed whether or not they've posted yet, so we
// subtract the BUDGET — bumped to the actual if a bill already ran hotter.
// Reserve set-asides (taxes/travel) come off the top per the lane model.
// What's left after month-to-date flexible spend is genuinely safe to spend.
// Pure function — no React/IO.

import type { Expense, BudgetBucket } from '../types/budget';
import { laneOf, totalReserveSetAside } from './budgetLanes';
import { computeMonthlySpending, currentMonthKey } from './transactionAnalysis';

export interface SafeToSpend {
  amount: number;          // the headline number (can go negative)
  takeHome: number;        // monthly watermark
  fixedCommitment: number; // Σ max(budget, month-to-date actual) over fixed-lane buckets
  reserveSetAside: number; // Σ RESERVE_ALLOCATIONS
  flexSpent: number;       // month-to-date flexible-lane spend (refunds already netted)
  month: string;           // 'YYYY-MM'
  daysLeft: number;        // calendar days remaining in the month, incl. today
  perDay: number;          // amount / daysLeft (0 floor on days)
}

export function computeSafeToSpend(
  expenses: Expense[],
  buckets: BudgetBucket[],
  netTakeHome: number,
  now: Date = new Date(),
): SafeToSpend {
  const month = currentMonthKey(now);
  const mtd = computeMonthlySpending(expenses).find(m => m.month === month);
  const byCat = mtd?.byCategory ?? {};

  let fixedCommitment = 0;
  for (const b of buckets) {
    if (laneOf(b.category) !== 'fixed') continue;
    const spent = Math.max(0, byCat[b.category] || 0);
    fixedCommitment += Math.max(b.monthlyBudget, spent);
  }

  // Stash contributions when configured (set via configureStashLanes at app
  // load), legacy reserve constants otherwise. One source of truth — D3.
  const reserveSetAside = totalReserveSetAside();

  let flexSpent = 0;
  for (const [cat, amt] of Object.entries(byCat)) {
    if (cat === 'travel_work') continue; // work spend nets out via reimbursement
    if (laneOf(cat) === 'flexible') flexSpent += amt;
  }
  flexSpent = Math.max(0, flexSpent);

  const amount = netTakeHome - fixedCommitment - reserveSetAside - flexSpent;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, daysInMonth - now.getDate() + 1);

  return {
    amount: Math.round(amount),
    takeHome: Math.round(netTakeHome),
    fixedCommitment: Math.round(fixedCommitment),
    reserveSetAside: Math.round(reserveSetAside),
    flexSpent: Math.round(flexSpent),
    month,
    daysLeft,
    perDay: Math.round(amount / daysLeft),
  };
}
