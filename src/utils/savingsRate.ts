// Savings rate — ONE definition, shared by the insight engine, the budget
// summary, and the budget view.
//
// Denominator = NET TAKE-HOME (the $15,800 base), NOT gross. Rationale (Scott
// 2026-07-01): the whole budget runs off take-home — bank data only ever has the
// NET deposit, gross lived only on a pay stub, and the old `gross = net/0.72`
// guess (~28% deductions vs his real ~47%) was inflating this rate. One number
// everywhere. So this reads "of what you take home, X% goes to saving (incl. the
// pre-tax 401k/HSA)." Target bands stay 20/15/10 — a fine, motivating goal on
// take-home.
//
// The honesty guard (audit 2026-06-14 #5): when BOTH pre-tax 401k and HSA read
// $0 yet a large slice of gross never reaches net, the pre-tax savings are
// INVISIBLE to us — not zero. `preTaxInvisible` lets callers soften the alarm.

export interface SavingsRateInput {
  grossMonthly: number;
  netTakeHome: number;
  retirement401k: number;
  hsaContribution: number;
  investing: number; // brokerage / taxable investing per month
}

export interface SavingsRateResult {
  totalSaving: number;      // investing + 401k + HSA (what's visible)
  rate: number;             // % of NET take-home (0 when net <= 0)
  preTaxInvisible: boolean; // 401k & HSA both 0 AND a big gross→net gap exists
  unexplainedGap: number;   // the hidden gross→net slice when pre-tax is invisible
}

// A gross→net gap this large with ZERO recorded pre-tax deductions means the
// breakdown was never filled in — not that the person saves nothing pre-tax.
const INVISIBLE_GAP_FRACTION = 0.15;

export function computeSavingsRate(input: SavingsRateInput): SavingsRateResult {
  const { grossMonthly, netTakeHome, retirement401k, hsaContribution, investing } = input;
  const totalSaving = investing + retirement401k + hsaContribution;
  const rate = netTakeHome > 0 ? (totalSaving / netTakeHome) * 100 : 0;
  const gap = Math.max(0, grossMonthly - netTakeHome);
  const preTaxInvisible =
    grossMonthly > 0 &&
    retirement401k === 0 &&
    hsaContribution === 0 &&
    gap > grossMonthly * INVISIBLE_GAP_FRACTION;
  return { totalSaving, rate, preTaxInvisible, unexplainedGap: preTaxInvisible ? gap : 0 };
}
