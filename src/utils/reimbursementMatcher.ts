import type { Expense } from '../types/budget';

/**
 * Reimbursement matcher. Given a reimbursement inflow (employer paying back
 * submitted work expenses), find the subset of outgoing work expenses that
 * sums to the inflow amount within tolerance.
 *
 * Pure function. No store, no React. The orchestrator is responsible for
 * persisting the match (marking matched expenses `reimbursed`).
 *
 * See `project_iris_budget_architecture.md` decision #4. This is the flagship
 * gap-in-the-market feature: Monarch / Copilot / Rocket / YNAB don't do this.
 *
 * Matching strategy:
 * 1. Filter candidates: isWorkExpense=true, reimbursementStatus='submitted',
 *    date within [inflow.date - windowDays, inflow.date].
 * 2. If sum-of-all candidates ≈ inflow → match all (the easy "batch" case).
 * 3. Else attempt subset-sum (greedy + DP for small N) to find a subset
 *    summing within tolerance.
 * 4. If no subset within tolerance → no match, return none.
 *
 * "Bundled into paycheck" cases (inflow is a regular paycheck that's $X high
 * because reimbursement was lumped in) are NOT auto-matched — those get
 * flagged separately (out of scope here; UI surfaces them as "anomaly").
 */

export interface MatchOptions {
  /**
   * Trailing-window days for candidate filtering. Default escalates: try
   * `[90, 180, 365]` in order — wider windows demand tighter tolerance.
   * Pass a single number to override (legacy behavior, no escalation).
   */
  windowDays?: number | number[];
  /** Absolute $ tolerance for the primary (90-day) window. Default $5. */
  absoluteTolerance?: number;
  /** Relative tolerance (fraction of inflow) for the primary window. Default 0.02 (2%). */
  relativeTolerance?: number;
}

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'partial' | 'none';

export interface ReimbursementMatch {
  inflowExpenseId: string;
  inflowAmount: number;
  inflowDate: string;
  matchedExpenseIds: string[];
  matchedTotal: number;
  delta: number;                    // inflow - matchedTotal (signed)
  confidence: MatchConfidence;
  /** True if every submitted candidate in the window was matched (clean batch). */
  matchedAllCandidates: boolean;
}

export function matchReimbursementInflow(
  inflow: Expense,
  candidateOutflows: Expense[],
  opts: MatchOptions = {},
): ReimbursementMatch {
  const absTol = opts.absoluteTolerance ?? 5;
  const relTol = opts.relativeTolerance ?? 0.02;
  // Escalating window strategy — try near-term first, widen only if no match.
  // Wider windows need tighter relative tolerance so we don't pair stale
  // unrelated expenses to new inflows by amount-coincidence.
  const windowSpec: number[] = Array.isArray(opts.windowDays)
    ? opts.windowDays
    : opts.windowDays !== undefined
      ? [opts.windowDays]
      : [90, 180, 365];

  const inflowDate = new Date(inflow.date);

  for (let i = 0; i < windowSpec.length; i++) {
    const windowDays = windowSpec[i];
    // Each escalation tier tightens the bar — half tolerance per step beyond first.
    const tierFactor = 1 / (i + 1);
    const tolerance = Math.max(absTol * tierFactor, inflow.amount * relTol * tierFactor);

    const cutoff = new Date(inflowDate.getTime() - windowDays * 86_400_000);
    // Candidate filter: accept work-expense signal from EITHER the explicit
    // isWorkExpense flag OR the travel_work category (CSV imports often
    // have only the category, not the flag). Reimbursement status is treated
    // permissively — anything not already reimbursed or marked not-reimbursable
    // is fair game (covers `pending`, `submitted`, undefined).
    const candidates = candidateOutflows.filter(e => {
      const isWork = e.isWorkExpense || e.category === 'travel_work';
      const isOpen = e.reimbursementStatus !== 'reimbursed' && e.reimbursementStatus !== 'not_reimbursable';
      return isWork
        && isOpen
        && new Date(e.date) >= cutoff
        && new Date(e.date) <= inflowDate;
    });

    if (candidates.length === 0) continue;

    const result = tryMatchInWindow(inflow, candidates, tolerance, absTol, inflowDate);
    if (result) return result;
  }

  return baseNoMatch(inflow);
}

/**
 * Try to match within a fixed candidate set. Returns null if no acceptable match.
 * Uses temporal-proximity tie-breaking: when multiple equal-cost subsets exist,
 * prefer the one whose expenses cluster closer to the inflow date.
 */
function tryMatchInWindow(
  inflow: Expense,
  candidates: Expense[],
  tolerance: number,
  absTol: number,
  inflowDate: Date,
): ReimbursementMatch | null {
  // Easy case: do all candidates sum to inflow?
  const allSum = candidates.reduce((s, e) => s + e.amount, 0);
  const allDelta = inflow.amount - allSum;
  if (Math.abs(allDelta) <= tolerance) {
    return {
      inflowExpenseId: inflow.id,
      inflowAmount: inflow.amount,
      inflowDate: inflow.date,
      matchedExpenseIds: candidates.map(e => e.id),
      matchedTotal: round2(allSum),
      delta: round2(allDelta),
      confidence: Math.abs(allDelta) <= 0.01 ? 'exact' : 'high',
      matchedAllCandidates: true,
    };
  }

  const subset = findBestSubset(candidates, inflow.amount, tolerance, inflowDate);
  if (subset) {
    const sum = subset.reduce((s, e) => s + e.amount, 0);
    const delta = inflow.amount - sum;
    return {
      inflowExpenseId: inflow.id,
      inflowAmount: inflow.amount,
      inflowDate: inflow.date,
      matchedExpenseIds: subset.map(e => e.id),
      matchedTotal: round2(sum),
      delta: round2(delta),
      confidence: Math.abs(delta) <= 0.01 ? 'exact' : Math.abs(delta) <= absTol ? 'high' : 'medium',
      matchedAllCandidates: subset.length === candidates.length,
    };
  }

  // Partial: closest single candidate within 10%, but only if temporally close
  // (within the active window — caller already filtered).
  const sorted = [...candidates].sort((a, b) => Math.abs(a.amount - inflow.amount) - Math.abs(b.amount - inflow.amount));
  const closest = sorted[0];
  if (closest && Math.abs(closest.amount - inflow.amount) <= inflow.amount * 0.1) {
    return {
      inflowExpenseId: inflow.id,
      inflowAmount: inflow.amount,
      inflowDate: inflow.date,
      matchedExpenseIds: [closest.id],
      matchedTotal: round2(closest.amount),
      delta: round2(inflow.amount - closest.amount),
      confidence: 'partial',
      matchedAllCandidates: candidates.length === 1,
    };
  }

  return null;
}

/**
 * Run matching across all detected reimbursement inflows. Returns a flat list
 * of matches (one per inflow). Useful for UI summaries.
 */
export function matchAllReimbursements(
  reimbursementInflows: Expense[],
  candidateOutflows: Expense[],
  opts: MatchOptions = {},
): ReimbursementMatch[] {
  // Sort inflows by date asc so earlier inflows consume earlier expenses first.
  const sorted = [...reimbursementInflows].sort((a, b) => a.date.localeCompare(b.date));
  const usedIds = new Set<string>();
  const out: ReimbursementMatch[] = [];

  for (const inflow of sorted) {
    const remaining = candidateOutflows.filter(e => !usedIds.has(e.id));
    const match = matchReimbursementInflow(inflow, remaining, opts);
    if (match.confidence !== 'none') {
      for (const id of match.matchedExpenseIds) usedIds.add(id);
    }
    out.push(match);
  }
  return out;
}

// ── Internal ──────────────────────────────────────────────────────

function baseNoMatch(inflow: Expense): ReimbursementMatch {
  return {
    inflowExpenseId: inflow.id,
    inflowAmount: inflow.amount,
    inflowDate: inflow.date,
    matchedExpenseIds: [],
    matchedTotal: 0,
    delta: inflow.amount,
    confidence: 'none',
    matchedAllCandidates: false,
  };
}

/**
 * Find a subset of `candidates` whose sum is within `tolerance` of `target`.
 * For ≤ 20 items, enumerate combinations (up to 2^20 ≈ 1M ops, well within budget).
 * For more, fall back to a greedy descending-amount search.
 *
 * Tie-breaking: when multiple subsets are within tolerance, prefer the one
 * whose expenses cluster *temporally closest* to the inflow date. This avoids
 * the failure mode where a stale September $500 expense gets matched against
 * a January $500 inflow just because amounts coincide.
 *
 * Returns the best acceptable subset or null.
 */
function findBestSubset(candidates: Expense[], target: number, tolerance: number, inflowDate: Date): Expense[] | null {
  if (candidates.length === 0) return null;
  if (candidates.length <= 20) return enumerateSubsets(candidates, target, tolerance, inflowDate);
  return greedySubset(candidates, target, tolerance, inflowDate);
}

/** Cost function: smaller is better. Combines amount-delta + temporal-distance. */
function subsetCost(subset: Expense[], target: number, inflowDate: Date): number {
  const sum = subset.reduce((s, e) => s + e.amount, 0);
  const amountDelta = Math.abs(target - sum);
  // Mean days between expense date and inflow date — penalty for clustering far away.
  const meanGap = subset.reduce((s, e) => {
    return s + Math.abs(inflowDate.getTime() - new Date(e.date).getTime()) / 86_400_000;
  }, 0) / subset.length;
  // Amount delta dominates; temporal proximity is a tie-breaker scaled to ~$0.10/day.
  return amountDelta + meanGap * 0.1;
}

function enumerateSubsets(candidates: Expense[], target: number, tolerance: number, inflowDate: Date): Expense[] | null {
  const n = candidates.length;
  let best: { subset: Expense[]; cost: number; delta: number } | null = null;
  const total = 1 << n;
  for (let mask = 1; mask < total; mask++) {
    let sum = 0;
    const subset: Expense[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += candidates[i].amount;
        subset.push(candidates[i]);
      }
    }
    const delta = Math.abs(target - sum);
    if (delta > tolerance) continue;
    const cost = subsetCost(subset, target, inflowDate);
    if (!best || cost < best.cost) {
      best = { subset, cost, delta };
    }
  }
  return best?.subset ?? null;
}

function greedySubset(candidates: Expense[], target: number, tolerance: number, inflowDate: Date): Expense[] | null {
  // Sort by temporal proximity first (closer to inflow = higher priority),
  // then within similar dates prefer larger amounts to fill faster.
  const sorted = [...candidates].sort((a, b) => {
    const aGap = Math.abs(inflowDate.getTime() - new Date(a.date).getTime());
    const bGap = Math.abs(inflowDate.getTime() - new Date(b.date).getTime());
    if (Math.abs(aGap - bGap) > 7 * 86_400_000) return aGap - bGap;  // >1 week diff → use date
    return b.amount - a.amount;                                       // similar dates → use amount
  });
  const picked: Expense[] = [];
  let sum = 0;
  for (const e of sorted) {
    if (sum + e.amount <= target + tolerance) {
      picked.push(e);
      sum += e.amount;
    }
    if (Math.abs(sum - target) <= tolerance) return picked;
  }
  return Math.abs(sum - target) <= tolerance ? picked : null;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
