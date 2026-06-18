import type {
  Expense,
  BudgetBucket,
  PaycheckBreakdown,
  SinkingFund,
  FunMoney,
} from '../types/budget';
import { computeMonthlySpending, computeCategoryTrends } from './transactionAnalysis';
import { laneOf } from './budgetLanes';
import { computeSavingsRate } from './savingsRate';

// ─── Types ───

export type InsightSeverity = 'critical' | 'warning' | 'positive' | 'info';
export type InsightCategory = 'spending' | 'saving' | 'investing' | 'goal' | 'general';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  description: string;
  metric?: number;
  metricLabel?: string;
}

// ─── Helpers ───

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  positive: 2,
  info: 3,
};

const fmt = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${Math.round(abs).toLocaleString()}`;
};

const pct = (n: number): string => `${Math.round(n)}%`;

// ─── Individual insight generators ───
// Each returns zero or more insights.

function detectDeficit(
  avgMonthlyExpenses: number,
  netIncome: number,
): Insight[] {
  if (avgMonthlyExpenses <= 0 || netIncome <= 0) return [];
  if (avgMonthlyExpenses > netIncome) {
    const gap = avgMonthlyExpenses - netIncome;
    return [{
      id: 'deficit',
      severity: 'critical',
      category: 'spending',
      title: `Spending exceeds income by ${fmt(gap)}/mo`,
      description:
        `Your average monthly expenses (${fmt(avgMonthlyExpenses)}) are higher than your take-home pay (${fmt(netIncome)}). ` +
        `That gap has to come from somewhere -- savings, credit cards, or something else. ` +
        `Time to find where the money's going and cut back, or look for ways to bring in more income.`,
      metric: gap,
      metricLabel: `${fmt(gap)} monthly deficit`,
    }];
  }
  return [];
}

function detectCategorySpikes(expenses: Expense[]): Insight[] {
  const trends = computeCategoryTrends(expenses);
  const insights: Insight[] = [];

  for (const t of trends) {
    // computeCategoryTrends already compares last full month to the one before
    if (t.trend === 'up' && t.trendPct >= 20 && t.avgMonthly >= 50) {
      // Calculate the dollar jump from the last two full months
      const months = t.months;
      // trends use monthLabel for display; we need the raw amounts
      // Last full month is second-to-last (current month may be partial)
      const lastFull = months.length >= 2 ? months[months.length - 2].amount : 0;
      const prevFull = months.length >= 3 ? months[months.length - 3].amount : t.avgMonthly;
      const dollarJump = lastFull - prevFull;

      if (dollarJump > 0) {
        insights.push({
          id: `spike-${t.category}`,
          severity: t.trendPct >= 50 ? 'warning' : 'info',
          category: 'spending',
          title: `${t.label} spend up ${pct(t.trendPct)}`,
          description:
            `${t.label} jumped from ${fmt(prevFull)} to ${fmt(lastFull)} last month -- that's ${fmt(dollarJump)} more than the month before. ` +
            (t.trendPct >= 50
              ? `That's a big swing. Worth checking if it was a one-time thing or a new pattern.`
              : `Not a huge deal on its own, but keep an eye on it so it doesn't become a trend.`),
          metric: t.trendPct,
          metricLabel: `${fmt(dollarJump)} more than last month`,
        });
      }
    }
  }

  return insights;
}

function detectOverBudgetCategories(buckets: BudgetBucket[]): Insight[] {
  const insights: Insight[] = [];

  for (const b of buckets) {
    // Over-budget alarms are a Flexible-lane concept: a fixed bill (mortgage,
    // daycare) running high means "adjust the target," not "you overspent," and
    // reserves (taxes/travel) are lumpy by design. Only flex categories alarm.
    if (laneOf(b.category) !== 'flexible') continue;
    if (b.monthlyBudget <= 0 || b.monthlyActual <= 0) continue;
    const overBy = b.monthlyActual - b.monthlyBudget;
    const overPct = (overBy / b.monthlyBudget) * 100;

    if (overPct >= 10) {
      const severity: InsightSeverity = overPct >= 50 ? 'critical' : overPct >= 25 ? 'warning' : 'info';
      insights.push({
        id: `overbudget-${b.category}`,
        severity,
        category: 'spending',
        title: `${b.label} over budget by ${pct(overPct)}`,
        description:
          `You budgeted ${fmt(b.monthlyBudget)}/mo for ${b.label.toLowerCase()} but you're actually spending ${fmt(b.monthlyActual)}. ` +
          `That's ${fmt(overBy)} more than planned. ` +
          (overPct >= 50
            ? `This one's worth a serious look -- either the budget needs to be more realistic or the spending needs to come down.`
            : `Might be time to adjust the budget or rein it in a bit.`),
        metric: overBy,
        metricLabel: `${fmt(overBy)}/mo over budget`,
      });
    }
  }

  return insights;
}

function detectUnallocatedSurplus(
  netIncome: number,
  totalActualExpenses: number,
): Insight[] {
  // totalActualExpenses already includes the investing bucket
  const surplus = netIncome - totalActualExpenses;
  if (surplus <= 200) return []; // ignore small amounts

  return [{
    id: 'surplus',
    severity: 'info',
    category: 'saving',
    title: `${fmt(surplus)}/mo unallocated`,
    description:
      `After expenses and investing, you've got about ${fmt(surplus)} per month that isn't assigned anywhere. ` +
      `That's great -- but money without a job tends to get spent. Consider putting it toward ` +
      `stashes, extra investing, or knocking out a savings goal faster.`,
    metric: surplus,
    metricLabel: `${fmt(surplus)} available monthly`,
  }];
}

function checkEmergencyFund(
  totalLiquidAssets: number,
  avgMonthlyExpenses: number,
): Insight[] {
  if (avgMonthlyExpenses <= 0 || totalLiquidAssets <= 0) return [];
  const monthsCovered = totalLiquidAssets / avgMonthlyExpenses;

  if (monthsCovered < 3) {
    return [{
      id: 'emergency-fund-critical',
      severity: 'critical',
      category: 'saving',
      title: `Emergency fund covers ${monthsCovered.toFixed(1)} months`,
      description:
        `Your liquid assets (${fmt(totalLiquidAssets)}) would only cover about ${monthsCovered.toFixed(1)} months of expenses. ` +
        `The bare minimum target is 3 months, and 6 is better. ` +
        `This should be priority #1 before extra investing or stashes -- if something unexpected hits, you need that cushion.`,
      metric: monthsCovered,
      metricLabel: `${monthsCovered.toFixed(1)} months of expenses`,
    }];
  }

  if (monthsCovered < 6) {
    return [{
      id: 'emergency-fund-warning',
      severity: 'warning',
      category: 'saving',
      title: `Emergency fund at ${monthsCovered.toFixed(1)} months`,
      description:
        `You've got about ${monthsCovered.toFixed(1)} months of expenses in liquid assets. ` +
        `That's above the minimum, but with a family and a mortgage, 6 months is a safer target. ` +
        `You need about ${fmt((6 * avgMonthlyExpenses) - totalLiquidAssets)} more to get there.`,
      metric: monthsCovered,
      metricLabel: `${monthsCovered.toFixed(1)} months covered`,
    }];
  }

  // 6+ months is great -- give positive feedback
  return [{
    id: 'emergency-fund-solid',
    severity: 'positive',
    category: 'saving',
    title: `Emergency fund is solid at ${monthsCovered.toFixed(1)} months`,
    description:
      `Your liquid assets cover ${monthsCovered.toFixed(1)} months of expenses. That's above the 6-month target -- nice work. ` +
      `Anything beyond 6 months could be working harder for you in investments, ` +
      `but having a thick cushion is never a bad thing.`,
    metric: monthsCovered,
    metricLabel: `${monthsCovered.toFixed(1)} months covered`,
  }];
}

function checkSavingsRate(
  paycheck: PaycheckBreakdown,
  monthlyInvestmentAmount: number,
): Insight[] {
  if (paycheck.grossMonthly <= 0) return [];

  const { totalSaving, rate, preTaxInvisible, unexplainedGap } = computeSavingsRate({
    grossMonthly: paycheck.grossMonthly,
    netTakeHome: paycheck.netTakeHome,
    retirement401k: paycheck.retirement401k,
    hsaContribution: paycheck.hsaContribution,
    investing: monthlyInvestmentAmount,
  });

  // Honesty guard: pre-tax 401k/HSA aren't recorded but a big chunk of gross
  // never reaches take-home — so the real rate is unknowable and the shown
  // number is a FLOOR, not the truth. Don't cry "critical"; surface what's
  // missing instead. (Once 401k/HSA are entered this branch goes quiet.)
  if (preTaxInvisible) {
    return [{
      id: 'savings-rate',
      severity: 'info',
      category: 'saving',
      title: `Savings rate shows ${pct(rate)} — but pre-tax savings aren't recorded`,
      description:
        `This counts ${fmt(totalSaving)}/mo of visible saving (${pct(rate)} of gross), but about ${fmt(unexplainedGap)}/mo ` +
        `of gross never reaches take-home and no 401k/HSA is entered — so your real rate is almost certainly higher. ` +
        `Add your per-paycheck 401k and HSA in the Paycheck panel to see the true number.`,
      metric: rate,
      metricLabel: `${pct(rate)}+ of gross (floor)`,
    }];
  }

  if (rate < 10) {
    return [{
      id: 'savings-rate',
      severity: 'critical',
      category: 'saving',
      title: `Savings rate is only ${pct(rate)}`,
      description:
        `You're saving/investing ${fmt(totalSaving)}/mo, which is ${pct(rate)} of your gross income. ` +
        `That's not going to cut it for long-term wealth building. The target is at least 20%, ` +
        `and you really want to be pushing for 25%+ at your income level. ` +
        `Look at maxing out your 401k and HSA first -- that's free tax savings.`,
      metric: rate,
      metricLabel: `${pct(rate)} of gross income`,
    }];
  }

  if (rate < 15) {
    return [{
      id: 'savings-rate',
      severity: 'warning',
      category: 'saving',
      title: `Savings rate at ${pct(rate)} -- room to grow`,
      description:
        `You're putting away ${fmt(totalSaving)}/mo (${pct(rate)} of gross). ` +
        `Not bad, but the 20% benchmark is the sweet spot for building real wealth. ` +
        `You need about ${fmt((0.20 * paycheck.grossMonthly) - totalSaving)} more per month to hit 20%.`,
      metric: rate,
      metricLabel: `${pct(rate)} of gross income`,
    }];
  }

  if (rate >= 20) {
    return [{
      id: 'savings-rate',
      severity: 'positive',
      category: 'saving',
      title: `Savings rate at ${pct(rate)} -- crushing it`,
      description:
        `You're saving ${fmt(totalSaving)}/mo, which is ${pct(rate)} of gross income. ` +
        `That's at or above the 20% target -- y'all are doing the right things. ` +
        `Keep this up and compound interest will do the heavy lifting over time.`,
      metric: rate,
      metricLabel: `${pct(rate)} of gross income`,
    }];
  }

  // 15-19% range
  return [{
    id: 'savings-rate',
    severity: 'info',
    category: 'saving',
    title: `Savings rate at ${pct(rate)}`,
    description:
      `You're saving ${fmt(totalSaving)}/mo (${pct(rate)} of gross). ` +
      `You're close to the 20% target -- just ${fmt((0.20 * paycheck.grossMonthly) - totalSaving)} more per month would get you there.`,
    metric: rate,
    metricLabel: `${pct(rate)} of gross income`,
  }];
}

function detectSubscriptionCreep(expenses: Expense[]): Insight[] {
  const trends = computeCategoryTrends(expenses);
  const subTrend = trends.find(t => t.category === 'subscriptions');
  if (!subTrend) return [];

  // Check if subscriptions have been going up for the last 2+ months
  const months = subTrend.months;
  if (months.length < 3) return [];

  // Look at the last 3 full months (skip current partial month)
  const recent = months.slice(-4, -1); // last 3 full months
  if (recent.length < 3) return [];

  const isCreeping = recent[2].amount > recent[1].amount && recent[1].amount > recent[0].amount;
  if (!isCreeping) return [];

  const increase = recent[2].amount - recent[0].amount;
  return [{
    id: 'subscription-creep',
    severity: 'warning',
    category: 'spending',
    title: `Subscriptions creeping up (+${fmt(increase)})`,
    description:
      `Your subscription spend has gone up for 3 months straight -- from ${fmt(recent[0].amount)} to ${fmt(recent[2].amount)}. ` +
      `That's the classic subscription creep. Might be time for an audit: ` +
      `cancel anything you haven't used in the last 30 days. Seriously, do it right now while you're thinking about it.`,
    metric: increase,
    metricLabel: `${fmt(increase)} increase over 3 months`,
  }];
}

function checkSinkingFundProgress(sinkingFunds: SinkingFund[]): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();

  for (const fund of sinkingFunds) {
    if (!fund.targetDate || fund.targetAmount <= 0) continue;

    const target = new Date(fund.targetDate);
    const monthsLeft = Math.max(
      (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()),
      0,
    );

    if (monthsLeft <= 0) {
      // Past due
      if (fund.currentBalance < fund.targetAmount) {
        const shortfall = fund.targetAmount - fund.currentBalance;
        insights.push({
          id: `sinking-behind-${fund.id}`,
          severity: 'warning',
          category: 'goal',
          title: `${fund.name} is ${fmt(shortfall)} short of target`,
          description:
            `The target date for ${fund.name} has passed and you're still ${fmt(shortfall)} short of the ${fmt(fund.targetAmount)} goal. ` +
            `Decide if you want to extend the deadline and catch up, or adjust the goal.`,
          metric: shortfall,
          metricLabel: `${fmt(shortfall)} remaining`,
        });
      }
      continue;
    }

    // Calculate needed monthly contribution to hit target on time
    const remaining = fund.targetAmount - fund.currentBalance;
    if (remaining <= 0) continue; // already funded

    const neededMonthly = remaining / monthsLeft;
    if (fund.monthlyContribution > 0 && neededMonthly > fund.monthlyContribution * 1.15) {
      // Need 15%+ more than current contribution to stay on track
      const gap = neededMonthly - fund.monthlyContribution;
      insights.push({
        id: `sinking-behind-${fund.id}`,
        severity: 'warning',
        category: 'goal',
        title: `${fund.name} falling behind pace`,
        description:
          `To hit ${fmt(fund.targetAmount)} by ${target.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}, ` +
          `you need about ${fmt(neededMonthly)}/mo but you're only contributing ${fmt(fund.monthlyContribution)}. ` +
          `That's ${fmt(gap)}/mo short. Bump up the contribution or push the date out.`,
        metric: gap,
        metricLabel: `${fmt(gap)}/mo behind pace`,
      });
    }
  }

  return insights;
}

function checkFunMoneyBurnRate(funMoney: FunMoney[]): Insight[] {
  const insights: Insight[] = [];

  for (const fm of funMoney) {
    if (fm.monthlyBudget <= 0) continue;
    const overBy = fm.monthlySpent - fm.monthlyBudget;
    const overPct = (overBy / fm.monthlyBudget) * 100;

    if (overPct >= 10) {
      insights.push({
        id: `funmoney-${fm.person.toLowerCase()}`,
        severity: 'info',
        category: 'spending',
        title: `${fm.person}'s fun money over by ${fmt(overBy)}`,
        description:
          `${fm.person} spent ${fmt(fm.monthlySpent)} against a ${fmt(fm.monthlyBudget)} fun money budget -- ` +
          `that's ${pct(overPct)} over. Fun money is no-judgment spending, but if this keeps happening, ` +
          `it might be worth bumping the budget to be more realistic (and cutting somewhere else to compensate).`,
        metric: overBy,
        metricLabel: `${fmt(overBy)} over fun money budget`,
      });
    }
  }

  return insights;
}

function generatePositiveReinforcement(
  expenses: Expense[],
  buckets: BudgetBucket[],
  _savingsRate: number,
): Insight[] {
  const insights: Insight[] = [];
  const monthly = computeMonthlySpending(expenses);

  // Check if spending is trending down
  if (monthly.length >= 3) {
    const recent = monthly.slice(-3);
    // Only look at full months (skip current partial month if it's the last)
    const full = monthly.length >= 4 ? monthly.slice(-4, -1) : recent;
    if (full.length >= 2) {
      const latest = full[full.length - 1].totalExpenses;
      const prior = full[full.length - 2].totalExpenses;
      if (prior > 0 && latest < prior) {
        const dropPct = ((prior - latest) / prior) * 100;
        if (dropPct >= 5) {
          insights.push({
            id: 'spending-down',
            severity: 'positive',
            category: 'spending',
            title: `Spending dropped ${pct(dropPct)} last month`,
            description:
              `Total spending went from ${fmt(prior)} to ${fmt(latest)} -- a ${pct(dropPct)} drop. ` +
              `Whatever you're doing, keep doing it. Small wins like this add up fast over a year.`,
            metric: dropPct,
            metricLabel: `${pct(dropPct)} decrease`,
          });
        }
      }
    }
  }

  // Check for categories that are under budget
  const underBudgetCount = buckets.filter(
    b => b.monthlyBudget > 0 && b.monthlyActual > 0 && b.monthlyActual <= b.monthlyBudget * 0.9
  ).length;
  const activeBucketCount = buckets.filter(b => b.monthlyBudget > 0 && b.monthlyActual > 0).length;

  if (activeBucketCount >= 3 && underBudgetCount >= Math.ceil(activeBucketCount * 0.6)) {
    insights.push({
      id: 'mostly-under-budget',
      severity: 'positive',
      category: 'spending',
      title: `${underBudgetCount} of ${activeBucketCount} categories under budget`,
      description:
        `Most of your spending categories are coming in under budget. ` +
        `That's the kind of consistency that builds wealth over time. Y'all should feel good about this.`,
      metric: underBudgetCount,
      metricLabel: `${underBudgetCount} categories under budget`,
    });
  }

  return insights;
}

// ─── Main engine ───

// Tripwire (Scott, 2026-06-14): money should never LEAVE the savings buckets
// (Super Savings / "Our Stuffs") for spending — only transfer into checking.
// Transfers import as transactionType='transfer' and are ignored here; a real
// outflow EXPENSE on those sources is the thing worth flagging.
const SAVINGS_SOURCES = new Set(['bofa_savings', 'bofa_joint']);
function detectSavingsWithdrawals(expenses: Expense[]): Insight[] {
  const hits = expenses.filter(e =>
    SAVINGS_SOURCES.has(e.source ?? '') &&
    (e.flow ?? 'outflow') === 'outflow' &&
    (e.transactionType ?? 'expense') === 'expense',
  );
  if (hits.length === 0) return [];
  const total = hits.reduce((s, e) => s + e.amount, 0);
  const latest = hits.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  return [{
    id: 'savings-withdrawal',
    severity: 'warning',
    category: 'saving',
    title: `${fmt(total)} spent straight from savings`,
    description: `${hits.length === 1 ? 'A charge' : `${hits.length} charges`} left your savings buckets (Super Savings / Our Stuffs), which shouldn't have spending — most recently "${latest.description.slice(0, 40)}" for ${fmt(latest.amount)}. If that was a rare ATM pull, fine; otherwise it's worth a look.`,
    metric: total,
    metricLabel: `${fmt(total)} from savings`,
  }];
}

export function generateInsights(params: {
  expenses: Expense[];
  buckets: BudgetBucket[];
  paycheck: PaycheckBreakdown;
  sinkingFunds: SinkingFund[];
  funMoney: FunMoney[];
  monthlyInvestmentAmount: number;
  totalLiquidAssets: number;
}): Insight[] {
  const {
    expenses,
    buckets,
    paycheck,
    sinkingFunds,
    funMoney,
    monthlyInvestmentAmount,
    totalLiquidAssets,
  } = params;

  const monthly = computeMonthlySpending(expenses);
  const monthCount = Math.max(monthly.length, 1);
  const totalExpenses = monthly.reduce((s, m) => s + m.totalExpenses, 0);
  const avgMonthlyExpenses = totalExpenses / monthCount;

  // Operating spend = bucket actuals EXCLUDING reserve lanes. Taxes/travel are
  // lumpy/annual and funded from surplus; counting them makes the monthly deficit
  // check false-alarm ("spending exceeds income"). (travel_work is a reserve too,
  // so it stays excluded.) This is the number compared against take-home.
  const totalActualFromBuckets = buckets
    .filter(b => laneOf(b.category) !== 'reserve')
    .reduce((s, b) => s + b.monthlyActual, 0);

  // Use whichever expense total is more meaningful
  // (buckets may have averages applied; raw monthly may include partial months)
  const bestExpenseEstimate = totalActualFromBuckets > 0
    ? totalActualFromBuckets
    : avgMonthlyExpenses;

  // Calculate savings rate for reinforcement checks (one shared definition)
  const savingsRate = computeSavingsRate({
    grossMonthly: paycheck.grossMonthly,
    netTakeHome: paycheck.netTakeHome,
    retirement401k: paycheck.retirement401k,
    hsaContribution: paycheck.hsaContribution,
    investing: monthlyInvestmentAmount,
  }).rate;

  // Run all insight generators
  const allInsights: Insight[] = [
    ...detectDeficit(bestExpenseEstimate, paycheck.netTakeHome),
    ...detectSavingsWithdrawals(expenses),
    ...detectCategorySpikes(expenses),
    ...detectOverBudgetCategories(buckets),
    ...detectUnallocatedSurplus(paycheck.netTakeHome, bestExpenseEstimate),
    ...checkEmergencyFund(totalLiquidAssets, bestExpenseEstimate),
    ...checkSavingsRate(paycheck, monthlyInvestmentAmount),
    ...detectSubscriptionCreep(expenses),
    ...checkSinkingFundProgress(sinkingFunds),
    ...checkFunMoneyBurnRate(funMoney),
    ...generatePositiveReinforcement(expenses, buckets, savingsRate),
  ];

  // Sort by severity (critical first), then cap at 8 insights
  allInsights.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // Always keep at least one positive if we have one and room
  const maxInsights = 8;
  const critical = allInsights.filter(i => i.severity === 'critical');
  const warnings = allInsights.filter(i => i.severity === 'warning');
  const positives = allInsights.filter(i => i.severity === 'positive');
  const infos = allInsights.filter(i => i.severity === 'info');

  // Take all critical + warnings first, then fill with positives and info
  const result: Insight[] = [...critical, ...warnings];
  const remaining = maxInsights - result.length;

  if (remaining > 0) {
    // Ensure at least one positive gets in if available
    const positivesToAdd = positives.slice(0, Math.max(1, Math.floor(remaining / 2)));
    const infoToAdd = infos.slice(0, remaining - positivesToAdd.length);
    result.push(...positivesToAdd, ...infoToAdd);
  }

  // Final trim and minimum
  return result.slice(0, maxInsights).length >= 3
    ? result.slice(0, maxInsights)
    : result; // If we have fewer than 3, return what we have
}
