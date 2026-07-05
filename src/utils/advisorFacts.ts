// Grounded facts for the AI advisor. Assembles ONLY real, computed numbers into
// a compact brief the LLM narrates — it is told to use nothing but these figures,
// so the coach can have a mouth without making things up. Pure, no IO.

import type { Expense, BudgetBucket, PaycheckBreakdown } from '../types/budget';
import { computeBudgetComparison } from './budgetComparison';
import { computeScorecard } from './savingsScorecard';

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/** Last complete month's charges that were never categorized (category 'other'
 *  or blank) — the "what the hell are these, go resolve them" list. */
function mysteryCharges(expenses: Expense[], month: string, limit = 6): Expense[] {
  if (!month) return [];
  return expenses
    .filter((e) => (e.date || '').slice(0, 7) === month)
    .filter((e) => (e.flow || 'outflow') === 'outflow' && (e.transactionType || 'expense') === 'expense')
    .filter((e) => !e.category || e.category === 'other')
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, limit);
}

export interface AdvisorFacts {
  hasData: boolean;
  monthLabel: string;
  /** The full grounded brief handed to the LLM. */
  brief: string;
}

export function buildAdvisorFacts(
  expenses: Expense[],
  buckets: BudgetBucket[],
  paycheck: PaycheckBreakdown | undefined,
  now: Date = new Date(),
): AdvisorFacts {
  const cmp = computeBudgetComparison(expenses, buckets, now);
  if (!cmp.hasHistory) {
    return { hasData: false, monthLabel: '', brief: '' };
  }
  const card = computeScorecard(expenses);
  const over = cmp.rows.filter((r) => r.status === 'over').sort((a, b) => b.deltaVsTarget - a.deltaVsTarget);
  const under = cmp.rows.filter((r) => r.status === 'under').sort((a, b) => a.deltaVsTarget - b.deltaVsTarget);
  const mystery = mysteryCharges(expenses, cmp.lastMonth);

  const lines: string[] = [];
  lines.push(`MONTH JUST COMPLETED: ${cmp.lastMonthLabel}`);
  if (paycheck?.netTakeHome) lines.push(`Monthly take-home: ${money(paycheck.netTakeHome)}.`);

  lines.push('');
  lines.push('BUDGET vs ACTUAL — where the money went last month:');
  if (over.length === 0) lines.push('- Nothing over budget.');
  for (const r of over) {
    lines.push(`- OVER: ${r.label} — spent ${money(r.lastMonthActual)} vs ${money(r.target)} plan (+${money(r.deltaVsTarget)})`);
  }
  for (const r of under.slice(0, 6)) {
    lines.push(`- UNDER: ${r.label} — spent ${money(r.lastMonthActual)} vs ${money(r.target)} plan (${money(r.deltaVsTarget)})`);
  }

  if (cmp.suggestions.length > 0) {
    lines.push('');
    lines.push('SUGGESTED TARGET TWEAKS (meet last month in the middle — already offered in the UI; you can reinforce these). Never suggest raiding fun-money or moving money between buckets:');
    for (const s of cmp.suggestions) {
      lines.push(`- ${s.label}: ${money(s.currentTarget)} → ${money(s.suggestedTarget)} (spent ${money(s.lastMonthActual)})`);
    }
  }

  lines.push('');
  lines.push('SAVINGS TRUTH (living under the guaranteed base):');
  lines.push(`- Guaranteed base: ${money(card.guaranteedBase)}/mo.`);
  lines.push(`- Banked cumulatively: ${money(card.cumulativeBanked)} across ${card.fullMonthCount} full months.`);
  lines.push(`- Months living under base: ${card.monthsUnderBase} of ${card.fullMonthCount}.`);
  if (card.lastFull && card.priorFull) {
    lines.push(`- Trend: last full month total spend ${money(card.lastFull.totalSpend)} vs prior ${money(card.priorFull.totalSpend)} (${card.trend}).`);
  }
  lines.push(`- Avg total spend ${money(card.solvency.avgTotalSpend)}/mo vs base ${money(card.solvency.base)}/mo; ~${money(card.solvency.variableLean)}/mo leans on variable pay.`);

  if (mystery.length > 0) {
    lines.push('');
    lines.push('UNCATEGORIZED CHARGES last month (tell the user to identify + file these):');
    for (const e of mystery) lines.push(`- ${money(Math.abs(e.amount))} — "${(e.description || 'unknown').slice(0, 60)}"`);
  }

  return { hasData: true, monthLabel: cmp.lastMonthLabel, brief: lines.join('\n') };
}
