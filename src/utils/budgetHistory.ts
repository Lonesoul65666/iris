// Budget-target history — "what were the goals THAT month?"
//
// Scott (2026-06-11): "budgets will change and you will want to go back and
// reflect on what you did right and wrong by knowing what the goals were that
// month." Without this, changing the grocery cap in August silently rewrites
// June's over/under verdicts.
//
// Model: APPEND-ONLY snapshots of {category -> monthlyBudget}, taken whenever
// a bucket save actually changes the targets (budgetStore dedupes). A month is
// judged against the last snapshot taken on-or-before its final day — the last
// word you had while living that month. Months older than the first snapshot
// fall back to the earliest one (the only targets we know about).
// Pure functions — no React/IO.

import type { BudgetBucket } from '../types/budget';

export interface BudgetTargetSnapshot {
  takenAt: string;                    // ISO timestamp — also the collection key
  targets: Record<string, number>;    // category -> monthlyBudget at that moment
}

/** Extract the targets map a snapshot stores from a bucket array.
 *  Investing is excluded — it's synced from Settings, not a budgeted target, so
 *  snapshotting it let a fat-fingered keystroke ($1000→…→$20) get replayed onto
 *  every past month. */
export function targetsOf(buckets: BudgetBucket[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of buckets) if (b.category !== 'investing') out[b.category] = b.monthlyBudget;
  return out;
}

export function sameTargets(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  return true;
}

/** First instant AFTER month ym ('YYYY-MM') as an ISO-comparable string. */
function startOfNextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/** The targets in effect during month ym: the latest snapshot taken before the
 *  month ended. Pre-history months get the earliest snapshot; empty history
 *  returns null (caller uses live targets). */
export function targetsForMonth(
  history: BudgetTargetSnapshot[],
  ym: string,
): Record<string, number> | null {
  if (history.length === 0 || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const sorted = [...history].sort((x, y) => x.takenAt.localeCompare(y.takenAt));
  const cutoff = startOfNextMonth(ym);
  let chosen: BudgetTargetSnapshot | null = null;
  for (const s of sorted) {
    if (s.takenAt < cutoff) chosen = s;
    else break;
  }
  return (chosen ?? sorted[0]).targets;
}
