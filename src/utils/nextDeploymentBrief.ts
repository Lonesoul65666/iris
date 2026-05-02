/**
 * Next-deployment Brief
 *
 * "Here's where your next dollar should go and exactly why." Takes portfolio
 * state + the dollars Scott intends to deploy this month and returns a
 * specific step-by-step allocation brief with rationale.
 *
 * Not "deposit advisor" — that language framed money as something passive you
 * put in a jar. "Deployment" frames it as intentional capital allocation: each
 * dollar has a mission. Same math under the hood; better mental model on top.
 *
 * Logic priority (in order):
 *   1. Fill critical sector gaps (where allocation is below minimum)
 *   2. Rebalance underweight sectors toward their targets
 *   3. DCA into core positions to keep compounding
 *   4. Opportunistic: if market intel suggests new positions, starter amount
 */

import type { Account, MonthlyInvestment } from '../types/portfolio';
import { getSector, calculateTotalValue, calculateSectorAllocation } from './calculations';
import { isConviction, convictionInSectorNote } from './conviction';

// ─── Types ───

export interface DeploymentStep {
  ticker: string;
  name: string;
  sector: string;
  amount: number;       // dollars allocated to this step
  percentage: number;   // % of this deployment
  reason: string;       // short explanation (the action math)
  why?: string;         // causal/impact explanation — why this matters for the portfolio
  priority: 'core' | 'rebalance' | 'gap-fill' | 'growth';
  isNew: boolean;       // not currently in portfolio
}

export interface NextDeploymentBrief {
  /** Dollars the user is deploying this round. */
  capitalToDeploy: number;
  /** @deprecated Use `capitalToDeploy`. Kept for backwards-compat callers. */
  depositAmount: number;
  steps: DeploymentStep[];
  /** @deprecated Alias for `steps`. */
  recommendations: DeploymentStep[];
  summary: string;
  currentDCA: { ticker: string; name: string; amount: number; percentage: number }[];
  suggestedDCA: { ticker: string; name: string; amount: number; percentage: number; reason: string }[];
  insights: string[];
}

// ─── Ideal allocation targets for aggressive growth (buy-and-hold) ───

const IDEAL_ALLOCATION: Record<string, { target: number; minPct: number; etf: string; etfName: string }> = {
  'Broad Market (S&P 500)':   { target: 25, minPct: 15, etf: 'FXAIX', etfName: 'Fidelity 500 Index Fund' },
  'Technology/Semiconductors': { target: 12, minPct: 5,  etf: 'SOXQ',  etfName: 'Invesco PHLX Semiconductor ETF' },
  'Technology':               { target: 10, minPct: 5,  etf: 'XLK',   etfName: 'Technology Select Sector SPDR' },
  'International':            { target: 12, minPct: 5,  etf: 'FDEV',  etfName: 'Fidelity International Index' },
  'Emerging Markets':         { target: 5,  minPct: 2,  etf: 'FDEM',  etfName: 'Fidelity Emerging Markets ETF' },
  'Small Cap':                { target: 5,  minPct: 2,  etf: 'FESM',  etfName: 'Fidelity Enhanced Small Cap ETF' },
  'Mid Cap':                  { target: 3,  minPct: 1,  etf: 'FMDE',  etfName: 'Fidelity Enhanced Mid Cap ETF' },
  'Bonds':                    { target: 5,  minPct: 2,  etf: 'FIGB',  etfName: 'Fidelity Investment Grade Bond ETF' },
  'Large Cap':                { target: 5,  minPct: 2,  etf: 'FELC',  etfName: 'Fidelity Enhanced Large Cap Core ETF' },
  'Cryptocurrency':           { target: 3,  minPct: 1,  etf: 'BTC',   etfName: 'Bitcoin' },
};

// ─── Helper: get portfolio holdings aggregated by ticker ───

function aggregateHoldings(accounts: Account[]): Map<string, { ticker: string; name: string; sector: string; value: number; conviction: boolean }> {
  const map = new Map<string, { ticker: string; name: string; sector: string; value: number; conviction: boolean }>();
  const SKIP = new Set(['CASH', 'SPAXX', 'FDRXX', 'VMFXX', 'DGCXX', 'FCASH', 'FZFXX']);

  for (const account of accounts) {
    if (account.type === 'bank') continue;
    for (const h of account.holdings) {
      if (SKIP.has(h.ticker) || h.status === 'sold') continue;
      const existing = map.get(h.ticker);
      if (existing) {
        existing.value += h.currentValue;
        if (isConviction(h)) existing.conviction = true;
      } else {
        map.set(h.ticker, {
          ticker: h.ticker,
          name: h.name,
          sector: getSector(h.ticker),
          value: h.currentValue,
          conviction: isConviction(h),
        });
      }
    }
  }
  return map;
}

// ─── Main: build the next-deployment brief ───

export function generateNextDeploymentBrief(
  accounts: Account[],
  capitalToDeploy: number,
  monthlyInv?: MonthlyInvestment,
): NextDeploymentBrief {
  const totalValue = calculateTotalValue(accounts);
  const allocations = calculateSectorAllocation(accounts);
  const allocationMap = new Map(allocations.map(a => [a.sector, a.percentage]));
  const holdingMap = aggregateHoldings(accounts);
  const ownedTickers = new Set(holdingMap.keys());
  const insights: string[] = [];

  // Causal/impact "why" by sector — paired with each step for explain-the-why UX.
  const sectorWhy = (sector: string, priority: 'gap-fill' | 'rebalance' | 'core' | 'growth'): string => {
    if (priority === 'core') return `Core position — scheduled DCA keeps your base compounding and avoids trying to time the market.`;
    if (sector === 'International') return `US-only exposure bets everything on one economy. International broadens the base and often trades at cheaper multiples.`;
    if (sector === 'Emerging Markets') return `EM growth tends to outpace developed markets over long horizons — zero exposure means missing that tailwind entirely.`;
    if (sector === 'Bonds') return `Bonds cushion equity drawdowns in most cycles and give you dry powder when equities are cheap.`;
    if (sector === 'Small Cap') return `Small caps historically outperform large caps over 10+ year horizons — under-allocation here caps long-run upside.`;
    if (sector === 'Mid Cap') return `Mid caps split the difference — less fragile than small, more growth than large.`;
    if (sector.includes('Technology/Semiconductors')) return `Semis drive the AI cycle — under-weight here means missing the thesis you already believe in.`;
    if (sector.includes('Technology')) return `Tech remains the growth engine of the index — zero exposure tilts your portfolio defensive.`;
    if (sector.includes('Broad Market')) return `Broad-market core gives you the index return as a floor — everything else is an active bet on top of this baseline.`;
    if (sector === 'Cryptocurrency') return `Small crypto allocation captures asymmetric upside without torpedoing the portfolio if it goes to zero.`;
    if (sector === 'Healthcare') return `Healthcare is defensive — people need it regardless of the cycle — and adds stability without sacrificing long-run growth.`;
    if (sector === 'Energy') return `Energy hedges inflation and commodity shocks — zero exposure leaves you fully exposed to both.`;
    return `This sector is underrepresented relative to a diversified target — adding here reduces single-theme risk.`;
  };

  // Current DCA breakdown
  const currentDCA = (monthlyInv?.allocations || []).map(a => ({
    ticker: a.ticker,
    name: a.name,
    amount: Math.round(capitalToDeploy * (a.percentage / 100)),
    percentage: a.percentage,
  }));

  // ─── Step 1: Identify gaps, overweights, and underweights ───

  interface SectorNeed {
    sector: string;
    currentPct: number;
    targetPct: number;
    gap: number;            // positive = underweight
    etf: string;
    etfName: string;
    isNew: boolean;
    priority: 'gap-fill' | 'rebalance' | 'core' | 'growth';
  }

  const needs: SectorNeed[] = [];

  for (const [sector, config] of Object.entries(IDEAL_ALLOCATION)) {
    const currentPct = allocationMap.get(sector) || 0;
    const gap = config.target - currentPct;

    // Check if we own the ETF already
    const isNew = !ownedTickers.has(config.etf);

    if (currentPct < config.minPct) {
      // Critical gap — need to fill
      needs.push({
        sector, currentPct, targetPct: config.target, gap,
        etf: config.etf, etfName: config.etfName, isNew,
        priority: currentPct === 0 ? 'gap-fill' : 'rebalance',
      });
    } else if (gap > 2) {
      // Moderate underweight
      needs.push({
        sector, currentPct, targetPct: config.target, gap,
        etf: config.etf, etfName: config.etfName, isNew,
        priority: 'core',
      });
    }
  }

  // Sort: gap-fill first, then biggest gap
  needs.sort((a, b) => {
    const priorityOrder = { 'gap-fill': 0, 'rebalance': 1, 'core': 2, 'growth': 3 };
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.gap - a.gap;
  });

  // ─── Step 2: Deploy capital across steps ───

  let remaining = capitalToDeploy;
  const steps: DeploymentStep[] = [];

  // Phase A: Gap fills get 15% of the deployment each (up to 3 gaps)
  const gapFills = needs.filter(n => n.priority === 'gap-fill').slice(0, 3);
  for (const need of gapFills) {
    if (remaining <= 0) break;
    const gapFillAmount = Math.min(Math.round(capitalToDeploy * 0.15), remaining);
    steps.push({
      ticker: need.etf,
      name: need.etfName,
      sector: need.sector,
      amount: gapFillAmount,
      percentage: 0, // computed later
      reason: `${need.sector} is at ${need.currentPct.toFixed(1)}% — target is ${need.targetPct}%. Starting a position here improves diversification.`,
      why: sectorWhy(need.sector, 'gap-fill'),
      priority: 'gap-fill',
      isNew: need.isNew,
    });
    remaining -= gapFillAmount;
  }

  // Phase B: Underweight sectors get proportional allocation (60% of remaining).
  // Respect conviction: if a sector is underweight but the user has conviction holdings there,
  // count that conviction $ as already filling the gap. User said "this is my bet" — don't
  // tell them to double down; new $ should diversify.
  const sectorConvictionValue: Record<string, { value: number; pct: number }> = {};
  for (const h of holdingMap.values()) {
    if (!h.conviction) continue;
    const existing = sectorConvictionValue[h.sector] || { value: 0, pct: 0 };
    existing.value += h.value;
    existing.pct = totalValue > 0 ? (existing.value / totalValue) * 100 : 0;
    sectorConvictionValue[h.sector] = existing;
  }

  const underweights = needs
    .filter(n => n.priority === 'rebalance' || n.priority === 'core')
    .map(n => {
      const conviction = sectorConvictionValue[n.sector];
      if (!conviction) return { need: n, effectiveGap: n.gap, convictionPct: 0 };
      // Treat conviction $ as already claiming that slot.
      const effectiveGap = n.gap - conviction.pct;
      return { need: n, effectiveGap, convictionPct: conviction.pct };
    })
    .filter(u => u.effectiveGap > 0); // conviction fully covers the gap → skip sector

  if (underweights.length > 0 && remaining > 0) {
    const totalGap = underweights.reduce((s, u) => s + Math.max(u.effectiveGap, 0), 0);
    const rebalanceBudget = Math.round(remaining * 0.6);
    let rebalanceSpent = 0;

    for (const { need, effectiveGap, convictionPct } of underweights) {
      if (rebalanceSpent >= rebalanceBudget) break;
      const share = totalGap > 0 ? effectiveGap / totalGap : 1 / underweights.length;
      const amount = Math.min(Math.round(rebalanceBudget * share), rebalanceBudget - rebalanceSpent);
      if (amount < 25) continue; // skip trivial amounts

      // Check if we already have a rec for this ticker
      const existing = steps.find(r => r.ticker === need.etf);
      if (existing) {
        existing.amount += amount;
        rebalanceSpent += amount;
        continue;
      }

      steps.push({
        ticker: need.etf,
        name: need.etfName,
        sector: need.sector,
        amount,
        percentage: 0,
        reason: `${need.sector} is ${need.currentPct.toFixed(1)}% vs ${need.targetPct}% target${convictionInSectorNote(convictionPct)}. Adding here brings the portfolio closer to balance.`,
        why: sectorWhy(need.sector, need.priority === 'rebalance' ? 'rebalance' : 'core'),
        priority: need.priority === 'rebalance' ? 'rebalance' : 'core',
        isNew: need.isNew,
      });
      rebalanceSpent += amount;
    }
    remaining -= rebalanceSpent;
  }

  // Phase C: Core DCA positions get the rest (keep investing momentum)
  if (remaining > 50) {
    // Split remaining into top 2-3 core holdings by value (the holdings Scott is already building).
    // Conviction holds are excluded — user has explicitly said they'll build those on their own terms,
    // so we don't auto-suggest adding more to them here.
    const coreHoldings = Array.from(holdingMap.values())
      .filter(h => !['Cash', 'Unknown'].includes(h.sector) && h.sector !== 'Target Date (Diversified)')
      .filter(h => !h.conviction)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    if (coreHoldings.length > 0) {
      const perHolding = Math.round(remaining / coreHoldings.length);
      for (const core of coreHoldings) {
        const existing = steps.find(r => r.ticker === core.ticker);
        if (existing) {
          existing.amount += perHolding;
        } else {
          steps.push({
            ticker: core.ticker,
            name: core.name,
            sector: core.sector,
            amount: perHolding,
            percentage: 0,
            reason: `Core position — continue building your ${core.sector} base.`,
            why: sectorWhy(core.sector, 'core'),
            priority: 'core',
            isNew: false,
          });
        }
      }
    }
  }

  // ─── Step 3: Compute final percentages and sort ───

  const totalAllocated = steps.reduce((s, r) => s + r.amount, 0);
  for (const rec of steps) {
    rec.percentage = totalAllocated > 0 ? Math.round((rec.amount / totalAllocated) * 100) : 0;
  }

  // Sort by amount descending
  steps.sort((a, b) => b.amount - a.amount);

  // ─── Step 4: Generate suggested DCA (what the monthly allocation SHOULD look like) ───

  const suggestedDCA = steps
    .filter(r => r.amount >= 50) // skip tiny allocations
    .map(r => ({
      ticker: r.ticker,
      name: r.name,
      amount: Math.round(capitalToDeploy * (r.percentage / 100)),
      percentage: r.percentage,
      reason: r.isNew ? `New position — ${r.reason}` : r.reason,
    }));

  // ─── Step 5: Generate insights ───

  // Check tech concentration
  const techPct = (allocationMap.get('Technology/Semiconductors') || 0)
    + (allocationMap.get('Technology') || 0)
    + (allocationMap.get('Technology/Auto') || 0);

  if (techPct > 35) {
    insights.push(`Tech exposure is ${techPct.toFixed(0)}% — this brief directs money elsewhere to bring it down over time.`);
  }

  const intlPct = (allocationMap.get('International') || 0) + (allocationMap.get('Emerging Markets') || 0);
  if (intlPct < 10) {
    insights.push(`International exposure is only ${intlPct.toFixed(1)}%. Even 15% would significantly reduce single-country risk.`);
  }

  const gapCount = gapFills.length;
  if (gapCount > 0) {
    insights.push(`${gapCount} sector gap${gapCount > 1 ? 's' : ''} identified. This deployment starts filling them.`);
  }

  if (currentDCA.length > 0 && currentDCA.length <= 2) {
    insights.push(`Current DCA is concentrated in ${currentDCA.length} position${currentDCA.length > 1 ? 's' : ''}. Diversifying your monthly buys reduces timing risk.`);
  }

  // Calculate how many months to reach ideal balance at this rate
  const totalGapDollars = needs.reduce((s, n) => s + Math.max(0, ((n.targetPct - n.currentPct) / 100) * totalValue), 0);
  if (totalGapDollars > 0 && capitalToDeploy > 0) {
    const monthsToBalance = Math.ceil(totalGapDollars / capitalToDeploy);
    if (monthsToBalance > 1 && monthsToBalance < 60) {
      insights.push(`At $${capitalToDeploy.toLocaleString()}/mo, it takes ~${monthsToBalance} months to reach ideal balance. Consistency wins.`);
    }
  }

  // ─── Summary ───

  const newPositionCount = steps.filter(r => r.isNew).length;
  const rebalanceCount = steps.filter(r => r.priority === 'rebalance' || r.priority === 'gap-fill').length;

  let summary: string;
  if (rebalanceCount > 0 && newPositionCount > 0) {
    summary = `This round: rebalance ${rebalanceCount} sector${rebalanceCount > 1 ? 's' : ''} and open ${newPositionCount} new position${newPositionCount > 1 ? 's' : ''}. Your portfolio gets more diversified with every deployment.`;
  } else if (rebalanceCount > 0) {
    summary = `Focus this deployment on ${rebalanceCount} underweight sector${rebalanceCount > 1 ? 's' : ''}. This brings your portfolio closer to ideal balance.`;
  } else if (newPositionCount > 0) {
    summary = `Good time to open ${newPositionCount} new position${newPositionCount > 1 ? 's' : ''} to fill portfolio gaps. Core positions are on track.`;
  } else {
    summary = `Your portfolio is well-balanced. Keep dollar-cost-averaging into your core positions — consistency is the strategy.`;
  }

  return {
    capitalToDeploy,
    depositAmount: capitalToDeploy,  // legacy alias
    steps,
    recommendations: steps,          // legacy alias
    summary,
    currentDCA,
    suggestedDCA,
    insights,
  };
}

// ─── Backwards-compat exports (to be removed once all callers migrate) ───

/** @deprecated Use `generateNextDeploymentBrief`. */
export const generateDepositPlan = generateNextDeploymentBrief;

/** @deprecated Use `NextDeploymentBrief`. */
export type DepositPlan = NextDeploymentBrief;

/** @deprecated Use `DeploymentStep`. */
export type DepositRecommendation = DeploymentStep;
