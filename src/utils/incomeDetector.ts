import type {
  Expense,
  IncomeCadence,
  IncomeSource,
  IncomeSubtype,
  AccountType,
  SweepDestination,
} from '../types/budget';
import { normalizeMerchant } from './recurringDetector';

/**
 * Income source detector. Companion to recurringDetector but specialized for
 * inflows. Reads transaction history; produces detected `IncomeSource`
 * records that the orchestrator merges with existing user decisions.
 *
 * Pure function — no IndexedDB, no React. See `project_iris_budget_architecture.md`
 * for the locked rationale (decision #2: split internally; decision #4: matching;
 * decision #5: disambiguation flow).
 *
 * Heuristics implemented:
 *  - Single-stream base: payer hits on regular cadence, stable amount → 'base'
 *  - Base + variable split: same payer, modal amount = base, anything above → 'variable'
 *  - Bonus: same payer, lump > 2× base, low frequency → 'bonus'
 *  - Reimbursement (token-only in v1): description contains REIMB/EXPENSE/TRAVEL → 'reimbursement'
 *    Cross-referencing against submitted work expenses is reserved for the matching engine (step 5).
 *  - Brokerage interest/dividend: account type 'brokerage' → 'dividend'
 *  - Side income: distinct payer (not the dominant one) with recurring cadence → 'side'
 *  - Unknown: an inflow that doesn't fit any of the above → surfaces in the disambiguation prompt
 */

// ── Tunable constants ─────────────────────────────────────────────

/** Tolerance for "this matches base amount" — within ±2% of the modal value. */
const BASE_AMOUNT_TOLERANCE = 0.02;
/** Variance threshold — coefficient-of-variation below this means stable cadence. */
const STABLE_CV_THRESHOLD = 0.15;

// ── Helpers ───────────────────────────────────────────────────────

function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  return Math.abs(b - a) / 86_400_000;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stdDev(xs: number[], mean: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

/** Most-common value (modal). For income amounts we round to nearest dollar to avoid penny-fragmentation. */
function modeRounded(xs: number[]): number {
  if (xs.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const x of xs) {
    const k = Math.round(x);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = Math.round(xs[0]);
  let bestCount = 0;
  for (const [k, v] of counts) {
    if (v > bestCount) {
      best = k;
      bestCount = v;
    }
  }
  return best;
}

function classifyCadence(intervals: number[]): IncomeCadence {
  if (intervals.length === 0) return 'irregular';
  const med = median(intervals);
  if (med >= 5 && med <= 9) return 'weekly';
  if (med >= 12 && med <= 17) {
    // distinguish biweekly (~14 days, consistent) from semimonthly (alternating ~14/16 around 15th + end)
    const stdev = stdDev(intervals, intervals.reduce((s, x) => s + x, 0) / intervals.length);
    return stdev > 1.5 ? 'semimonthly' : 'biweekly';
  }
  if (med >= 26 && med <= 35) return 'monthly';
  if (med >= 85 && med <= 100) return 'quarterly';
  if (med >= 355 && med <= 380) return 'yearly';
  return 'irregular';
}

function cadenceToExpectedDays(c: IncomeCadence): number {
  switch (c) {
    case 'weekly': return 7;
    case 'biweekly': return 14;
    case 'semimonthly': return 15;
    case 'monthly': return 30;
    case 'quarterly': return 91;
    case 'yearly': return 365;
    default: return 0;
  }
}

// ── Token-based reinforcement ─────────────────────────────────────

// Strict reimbursement-token list. Dropped \btravel\b and \bmileage\b — too
// generic, they false-positive on flight refunds, hotel returns, etc.
const REIMB_TOKENS = /\b(reimb|reimbursement|expense\s*report|t&e|per\s*diem|exp\s*reimb)\b/i;
// Refund tokens — vendor returns, credits, refunds. These are NOT income.
const REFUND_TOKENS = /\b(refund|return|credit|reversal|chargeback|adjustment)\b/i;
const BONUS_TOKENS = /\b(bonus|incentive|spiff|award|stipend)\b/i;
const COMMISSION_TOKENS = /\b(commission|comm|variable|incentive\s*pay)\b/i;
const DIVIDEND_TOKENS = /\b(div|dividend|interest|int\s+pmt|coupon|distrib)\b/i;
const PAYROLL_TOKENS = /\b(payroll|salary|pay|direct\s*dep|dd|wages)\b/i;

// ── Subtype default config ────────────────────────────────────────

function defaultsForSubtype(s: IncomeSubtype): { includeInBudget: boolean; sweep: SweepDestination } {
  switch (s) {
    case 'base':         return { includeInBudget: true,  sweep: 'none' };
    case 'side':         return { includeInBudget: true,  sweep: 'none' };
    case 'dividend':     return { includeInBudget: true,  sweep: 'none' };
    case 'variable':     return { includeInBudget: false, sweep: 'hysa' };
    case 'bonus':        return { includeInBudget: false, sweep: 'hysa' };
    case 'reimbursement':return { includeInBudget: false, sweep: 'none' }; // not income — neutral
    case 'gift':         return { includeInBudget: false, sweep: 'none' };
    case 'sale':         return { includeInBudget: false, sweep: 'none' };
    case 'unknown':      return { includeInBudget: false, sweep: 'none' };
  }
}

// ── Public API ────────────────────────────────────────────────────

export interface DetectIncomeOptions {
  /** Today, for nextExpectedDate math. Default: now. */
  now?: Date;
  /** Days of history to consider. Default 365. */
  lookbackDays?: number;
  /** Minimum occurrences to call something a "source" (vs. one-off). Default 2. */
  minOccurrences?: number;
  /**
   * Mapping from a TransactionSource string → AccountType.
   * Source-type drives classification (brokerage inflow ≠ paycheck).
   * Optional — defaults to 'checking' interpretation when missing.
   */
  accountTypes?: Partial<Record<string, AccountType>>;
}

/** Detected source — like IncomeSource but without user-state fields the orchestrator owns. */
export interface DetectedIncomeSource extends Omit<
  IncomeSource,
  'createdAt' | 'updatedAt' | 'status'
> {
  /** Transaction ids of the inflows attributed to this source. */
  expenseIds: string[];
  /** What the orchestrator should default `includeInBudget` to (user can override). */
  suggestedIncludeInBudget: boolean;
  /** What the orchestrator should default `sweepDestination` to (user can override). */
  suggestedSweep: SweepDestination;
}

/**
 * Detect income sources from a list of expenses.
 * Filters to inflows, groups by normalized payer, classifies subtypes per group.
 * Returns a flat list of detected sources, sorted by avgAmount descending.
 */
export function detectIncomeSources(
  expenses: Expense[],
  opts: DetectIncomeOptions = {},
): DetectedIncomeSource[] {
  const minOccurrences = opts.minOccurrences ?? 2;
  const lookbackDays = opts.lookbackDays ?? 365;
  const now = opts.now ?? new Date();
  const lookbackCutoff = new Date(now.getTime() - lookbackDays * 86_400_000);
  const accountTypes = opts.accountTypes ?? {};

  // Filter to inflows in the lookback window. Skip transfers (CC payments etc).
  const inflows = expenses.filter(e =>
    (e.flow || 'outflow') === 'inflow'
    && e.transactionType !== 'transfer'
    && new Date(e.date) >= lookbackCutoff
  );

  // Pre-tokenize: classify obvious cases up-front so descriptive variants
  // ("ABNORMAL EXPENSE REIMB" vs "ABNORMAL PAYROLL") don't fragment grouping.
  // We collapse by *base normalized payer* (first 2 tokens) for token-classified rows
  // so the user sees them as belonging to one logical employer.
  //
  // Pass 1: identify known employer baseKeys (anyone sending payroll-shaped
  // money). Reimbursement classification later requires payer to be in this
  // set — otherwise vendor refunds with "TRAVEL" or "EXPENSE" in the
  // description (American Airlines refund, hotel return, etc.) get
  // mis-classified as work reimbursements.
  const employerBaseKeys = new Set<string>();
  for (const e of inflows) {
    const fullKey = normalizeMerchant(e.description);
    if (!fullKey) continue;
    if (PAYROLL_TOKENS.test(e.description) || BONUS_TOKENS.test(e.description) || COMMISSION_TOKENS.test(e.description)) {
      employerBaseKeys.add(collapseToBaseKey(fullKey));
    }
  }

  const reimbursementByPayer = new Map<string, Expense[]>();
  const refundByPayer = new Map<string, Expense[]>();
  const bonusByPayer = new Map<string, Expense[]>();
  const commissionByPayer = new Map<string, Expense[]>();
  const dividendByPayer = new Map<string, Expense[]>();
  const remainingInflows: Expense[] = [];

  // Pass 2: classify each inflow.
  for (const e of inflows) {
    const fullKey = normalizeMerchant(e.description);
    if (!fullKey) continue;
    const baseKey = collapseToBaseKey(fullKey);
    const acctType = e.source ? accountTypes[e.source] : undefined;

    // Refund tokens win over reimbursement tokens — a "TRAVEL CREDIT REFUND"
    // is a refund, not a work reimbursement, regardless of who sent it.
    if (REFUND_TOKENS.test(e.description)) {
      pushTo(refundByPayer, baseKey, e);
    } else if (REIMB_TOKENS.test(e.description) && employerBaseKeys.has(baseKey)) {
      // Only classify as reimbursement when payer is a known employer.
      pushTo(reimbursementByPayer, baseKey, e);
    } else if (BONUS_TOKENS.test(e.description)) {
      pushTo(bonusByPayer, baseKey, e);
    } else if (COMMISSION_TOKENS.test(e.description)) {
      pushTo(commissionByPayer, baseKey, e);
    } else if (acctType === 'brokerage' || DIVIDEND_TOKENS.test(e.description)) {
      pushTo(dividendByPayer, baseKey, e);
    } else {
      remainingInflows.push(e);
    }
  }

  // Group remaining (non-tokenized) inflows by their full normalized payer.
  // These are the candidates for base ± variable splitting.
  const groups = new Map<string, Expense[]>();
  for (const e of remainingInflows) {
    const key = normalizeMerchant(e.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const detected: DetectedIncomeSource[] = [];

  // Emit token-classified sources first.
  for (const [payer, rows] of reimbursementByPayer) {
    const amts = rows.map(e => e.amount);
    const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    detected.push(buildSource({
      normalizedPayer: payer, sorted: sortedRows,
      subtype: 'reimbursement', cadence: 'irregular',
      avgAmount: amts.reduce((s, x) => s + x, 0) / amts.length,
      amountMin: Math.min(...amts), amountMax: Math.max(...amts),
      confidence: 0.7, now,
    }));
  }
  // Emit refund/return sources as 'sale' subtype (semantically: money returning,
  // not income). Vendor refunds with words like "TRAVEL CREDIT" or "RETURN"
  // land here instead of falsely as work reimbursements.
  for (const [payer, rows] of refundByPayer) {
    const amts = rows.map(e => e.amount);
    const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    detected.push(buildSource({
      normalizedPayer: payer, sorted: sortedRows,
      subtype: 'sale', cadence: 'irregular',
      avgAmount: amts.reduce((s, x) => s + x, 0) / amts.length,
      amountMin: Math.min(...amts), amountMax: Math.max(...amts),
      confidence: 0.65, now,
    }));
  }
  for (const [payer, rows] of bonusByPayer) {
    const amts = rows.map(e => e.amount);
    const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const sortedIntervals: number[] = [];
    for (let i = 1; i < sortedRows.length; i++) sortedIntervals.push(daysBetween(sortedRows[i - 1].date, sortedRows[i].date));
    const cad = sortedRows.length >= 4 ? classifyCadence(sortedIntervals) : 'irregular';
    detected.push(buildSource({
      normalizedPayer: payer, sorted: sortedRows,
      subtype: 'bonus', cadence: cad,
      avgAmount: amts.reduce((s, x) => s + x, 0) / amts.length,
      amountMin: Math.min(...amts), amountMax: Math.max(...amts),
      confidence: rows.length >= 2 ? 0.75 : 0.55, now,
    }));
  }
  for (const [payer, rows] of commissionByPayer) {
    const amts = rows.map(e => e.amount);
    const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const sortedIntervals: number[] = [];
    for (let i = 1; i < sortedRows.length; i++) sortedIntervals.push(daysBetween(sortedRows[i - 1].date, sortedRows[i].date));
    detected.push(buildSource({
      normalizedPayer: payer, sorted: sortedRows,
      subtype: 'variable', cadence: classifyCadence(sortedIntervals),
      avgAmount: amts.reduce((s, x) => s + x, 0) / amts.length,
      amountMin: Math.min(...amts), amountMax: Math.max(...amts),
      confidence: 0.7, now,
    }));
  }
  for (const [payer, rows] of dividendByPayer) {
    const amts = rows.map(e => e.amount);
    const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const sortedIntervals: number[] = [];
    for (let i = 1; i < sortedRows.length; i++) sortedIntervals.push(daysBetween(sortedRows[i - 1].date, sortedRows[i].date));
    const cad = classifyCadence(sortedIntervals);
    detected.push(buildSource({
      normalizedPayer: payer, sorted: sortedRows,
      subtype: 'dividend', cadence: cad,
      avgAmount: amts.reduce((s, x) => s + x, 0) / amts.length,
      amountMin: Math.min(...amts), amountMax: Math.max(...amts),
      confidence: stableCadenceConfidence(sortedIntervals, cad),
      now,
    }));
  }

  for (const [normalizedPayer, group] of groups) {
    if (group.length < minOccurrences) {
      // One-off — emit a single 'unknown' source so the disambiguation prompt can pick it up.
      const e = group[0];
      detected.push(buildUnknownSingle(e, normalizedPayer, now));
      continue;
    }

    // Sort ascending.
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) intervals.push(daysBetween(sorted[i - 1].date, sorted[i].date));

    const cadence = classifyCadence(intervals);

    // ── Classify deposits as base ± variable.
    // Modal amount = base. Anything above the modal becomes layered variable.
    const remaining = sorted;
    const remainingAmounts = remaining.map(e => e.amount);
    const baseAmount = modeRounded(remainingAmounts);
    const tolerance = baseAmount * BASE_AMOUNT_TOLERANCE;

    const baseRows: Expense[] = [];
    const variablePieces: { e: Expense; varPart: number }[] = [];

    for (const e of remaining) {
      const delta = e.amount - baseAmount;
      if (Math.abs(delta) <= tolerance) {
        baseRows.push(e);
      } else if (delta > tolerance) {
        // Base + variable bundled in one deposit (the Scott case): attribute base to base, rest to variable.
        // We do NOT pull this out as 'bonus' anymore — bundled commission is variable.
        // Token-detected bonuses are handled in the pre-grouping pass and never reach this branch.
        baseRows.push(e);
        variablePieces.push({ e, varPart: delta });
      } else {
        // Smaller-than-base deposit (partial / off-cycle) — keep with base group, lower amount tracking.
        baseRows.push(e);
      }
    }

    if (baseRows.length >= minOccurrences) {
      const baseRowAmounts = baseRows.map(e => Math.min(e.amount, baseAmount + tolerance));
      const baseIntervals: number[] = [];
      for (let i = 1; i < baseRows.length; i++) baseIntervals.push(daysBetween(baseRows[i - 1].date, baseRows[i].date));
      const baseCadence = classifyCadence(baseIntervals);
      detected.push(buildSource({
        normalizedPayer, sorted: baseRows,
        subtype: 'base',
        cadence: baseCadence === 'irregular' ? cadence : baseCadence,
        avgAmount: baseAmount,
        amountMin: Math.min(...baseRowAmounts),
        amountMax: baseAmount + tolerance,
        confidence: stableCadenceConfidence(baseIntervals, baseCadence),
        now,
      }));
    }

    if (variablePieces.length > 0) {
      const varAmounts = variablePieces.map(v => v.varPart);
      const varIds = variablePieces.map(v => v.e.id);
      const firstVar = variablePieces[0].e;
      const lastVar = variablePieces[variablePieces.length - 1].e;
      const display = firstVar.description.length > 40
        ? firstVar.description.slice(0, 40).trim() + '…'
        : firstVar.description.trim();
      detected.push({
        id: `inc-${normalizedPayer.replace(/\s+/g, '-')}-variable`,
        payer: normalizedPayer,
        payerDisplay: display,
        subtype: 'variable',
        cadence,
        avgAmount: round2(varAmounts.reduce((s, x) => s + x, 0) / varAmounts.length),
        amountMin: round2(Math.min(...varAmounts)),
        amountMax: round2(Math.max(...varAmounts)),
        occurrences: variablePieces.length,
        firstSeen: firstVar.date,
        lastSeen: lastVar.date,
        confidence: 0.6, // variable is inherently noisy
        includeInBudget: false,
        sweepDestination: 'hysa',
        expenseIds: varIds,
        suggestedIncludeInBudget: false,
        suggestedSweep: 'hysa',
      });
    }
  }

  // Sort: by total monthly contribution-ish (avgAmount × occurrences-as-frequency-proxy)
  detected.sort((a, b) => b.avgAmount - a.avgAmount);
  return detected;
}

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Collapse a normalized merchant key to its base ("ABNORMAL SECURITY PAYROLL"
 * → "abnormal security"; "ACME CORP DIRECT DEP" → "acme corp"). Used so that
 * payroll/reimbursement/bonus variants of the same employer share one logical key.
 */
function collapseToBaseKey(fullKey: string): string {
  const tokens = fullKey.split(' ').filter(Boolean);
  return tokens.slice(0, 2).join(' ') || fullKey;
}

function pushTo<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  if (!m.has(k)) m.set(k, []);
  m.get(k)!.push(v);
}

function stableCadenceConfidence(intervals: number[], cadence: IncomeCadence): number {
  if (cadence === 'irregular') return 0.4;
  const expected = cadenceToExpectedDays(cadence);
  if (expected === 0 || intervals.length === 0) return 0.5;
  const avg = intervals.reduce((s, x) => s + x, 0) / intervals.length;
  const sd = stdDev(intervals, avg);
  const cv = sd / expected;
  // CV under STABLE_CV_THRESHOLD → high confidence; high CV → falls toward 0.4.
  const cadenceScore = Math.max(0, 1 - cv / (STABLE_CV_THRESHOLD * 2));
  const sampleSizeScore = Math.min(1, (intervals.length + 1) / 6);
  return round2((cadenceScore + sampleSizeScore) / 2);
}

function buildSource(args: {
  normalizedPayer: string;
  sorted: Expense[];
  subtype: IncomeSubtype;
  cadence: IncomeCadence;
  avgAmount: number;
  amountMin: number;
  amountMax: number;
  confidence: number;
  now: Date;
}): DetectedIncomeSource {
  const { normalizedPayer, sorted, subtype, cadence, avgAmount, amountMin, amountMax, confidence, now } = args;
  const last = sorted[sorted.length - 1];
  const expectedDays = cadenceToExpectedDays(cadence);
  const nextExpected = expectedDays
    ? new Date(new Date(last.date).getTime() + expectedDays * 86_400_000).toISOString().slice(0, 10)
    : undefined;
  const defaults = defaultsForSubtype(subtype);
  const display = sorted[0].description.length > 40
    ? sorted[0].description.slice(0, 40).trim() + '…'
    : sorted[0].description.trim();

  return {
    id: `inc-${normalizedPayer.replace(/\s+/g, '-')}-${subtype}`,
    payer: normalizedPayer,
    payerDisplay: display,
    subtype,
    cadence,
    avgAmount: round2(avgAmount),
    amountMin: round2(amountMin),
    amountMax: round2(amountMax),
    occurrences: sorted.length,
    firstSeen: sorted[0].date,
    lastSeen: last.date,
    nextExpectedDate: nextExpected,
    confidence: round2(confidence),
    includeInBudget: defaults.includeInBudget,
    sweepDestination: defaults.sweep,
    expenseIds: sorted.map(e => e.id),
    suggestedIncludeInBudget: defaults.includeInBudget,
    suggestedSweep: defaults.sweep,
    earnerId: undefined,
    // unused:
    // status, createdAt, updatedAt — owned by orchestrator
  };
  void now; // reserved for future "next expected" math that needs current date relative
}

function buildUnknownSingle(e: Expense, normalizedPayer: string, _now: Date): DetectedIncomeSource {
  return {
    id: `inc-${normalizedPayer.replace(/\s+/g, '-')}-${e.id}-unknown`,
    payer: normalizedPayer,
    payerDisplay: e.description.slice(0, 40).trim(),
    subtype: 'unknown',
    cadence: 'irregular',
    avgAmount: round2(e.amount),
    amountMin: round2(e.amount),
    amountMax: round2(e.amount),
    occurrences: 1,
    firstSeen: e.date,
    lastSeen: e.date,
    confidence: 0.3,
    includeInBudget: false,
    sweepDestination: 'none',
    expenseIds: [e.id],
    suggestedIncludeInBudget: false,
    suggestedSweep: 'none',
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// ── Aggregation helpers ───────────────────────────────────────────

/**
 * Sum what's actually budgetable each month from a set of detected/saved sources.
 * Variable / bonus / gift / sale / reimbursement are EXCLUDED unless explicitly
 * marked includeInBudget=true (the user opted to live at OTE pace).
 */
export function monthlyBudgetableIncome(sources: { cadence: IncomeCadence; avgAmount: number; includeInBudget: boolean; occurrences: number; subtype: IncomeSubtype }[]): number {
  let total = 0;
  for (const s of sources) {
    if (!s.includeInBudget) continue;
    // Reimbursements are never budgetable income — they're expense payback. Guard
    // here too (sibling totalMonthlyAll already does) so a row flagged
    // includeInBudget=true can't leak in if its cadence stops being irregular.
    if (s.subtype === 'reimbursement') continue;
    total += monthlyEquivalent(s.avgAmount, s.cadence);
  }
  return total;
}

export function monthlyEquivalent(amount: number, cadence: IncomeCadence): number {
  switch (cadence) {
    case 'weekly': return amount * 4.345;
    case 'biweekly': return amount * 2.1725;
    case 'semimonthly': return amount * 2;
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
    case 'yearly': return amount / 12;
    default: return 0;
  }
}
