// Savings rate — ONE definition, shared by the insight engine, the budget
// summary, and the budget view. It was copy-pasted in three places, each free
// to drift. Savings rate = intentional savings (investing + 401k + HSA) / gross.
//
// The honesty guard (audit 2026-06-14 #5): when BOTH pre-tax 401k and HSA read
// $0 yet a large slice of gross never reaches net, the pre-tax savings are
// INVISIBLE to us — not zero. Reporting "5% — critical" then is confidently
// wrong and drives bad advice (telling someone to start a 401k they may already
// fund). `preTaxInvisible` lets callers soften the alarm into "fill this in."

export interface SavingsRateInput {
  grossMonthly: number;
  netTakeHome: number;
  retirement401k: number;
  hsaContribution: number;
  investing: number; // brokerage / taxable investing per month
}

export interface SavingsRateResult {
  totalSaving: number;      // investing + 401k + HSA (what's visible)
  rate: number;             // % of gross (0 when gross <= 0)
  preTaxInvisible: boolean; // 401k & HSA both 0 AND a big gross→net gap exists
  unexplainedGap: number;   // the hidden gross→net slice when pre-tax is invisible
}

// A gross→net gap this large with ZERO recorded pre-tax deductions means the
// breakdown was never filled in — not that the person saves nothing pre-tax.
const INVISIBLE_GAP_FRACTION = 0.15;

export function computeSavingsRate(input: SavingsRateInput): SavingsRateResult {
  const { grossMonthly, netTakeHome, retirement401k, hsaContribution, investing } = input;
  const totalSaving = investing + retirement401k + hsaContribution;
  const rate = grossMonthly > 0 ? (totalSaving / grossMonthly) * 100 : 0;
  const gap = Math.max(0, grossMonthly - netTakeHome);
  const preTaxInvisible =
    grossMonthly > 0 &&
    retirement401k === 0 &&
    hsaContribution === 0 &&
    gap > grossMonthly * INVISIBLE_GAP_FRACTION;
  return { totalSaving, rate, preTaxInvisible, unexplainedGap: preTaxInvisible ? gap : 0 };
}
