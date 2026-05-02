import type { Account, Holding, EquityProfile, UserProfile, MonthlyInvestment } from '../types/portfolio';
import {
  getSector,
  calculateTechConcentration,
  calculateTotalValue,
  calculateSectorAllocation,
  calculateHealthMetrics,
  calculateOverallScore,
} from './calculations';
import { convictionNote, convictionInSectorNote } from './conviction';

// ─── Types ───

export type SignalType = 'sell' | 'hold' | 'buy' | 'rebalance' | 'action';
export type SignalUrgency = 'now' | 'soon' | 'watch';

export interface PortfolioSignal {
  id: string;
  type: SignalType;
  urgency: SignalUrgency;
  ticker: string;
  holdingName: string;
  title: string;
  reasoning: string;
  impact?: string; // e.g., "$4,375/yr in lost interest"
  taxNote?: string;
}

export interface ConcentrationRisk {
  sector: string;
  percentage: number;
  value: number;
  tickers: { ticker: string; name: string; value: number; pct: number; conviction?: boolean }[];
  recommendation: string;
  targetPct: number;
  /** Dollar value in this sector flagged as conviction. Excluded from trim math. */
  convictionValue?: number;
  /** Percentage of portfolio held as conviction in this sector. */
  convictionPct?: number;
}

export interface RebalanceMove {
  action: 'trim' | 'add';
  ticker: string;
  name: string;
  currentPct: number;
  targetPct: number;
  currentValue: number;
  suggestedAmount: number;
  reason: string;
  /** Causal/impact explanation — why this matters, separate from the action math in `reason`. */
  why?: string;
  /** True when the sector contains conviction holdings that were carved out of the trim math. */
  hasConvictionInSector?: boolean;
}

export interface DiversificationGap {
  sector: string;
  currentPct: number;
  recommendedPct: number;
  suggestedETFs: { ticker: string; name: string; why: string }[];
}

export interface ScenarioResult {
  label: string;
  description: string;
  currentValue: number;
  projectedValue: number;
  monthlyChange: number;
  yearlyImpact: number;
}

export interface IntelligenceReport {
  signals: PortfolioSignal[];
  concentrationRisks: ConcentrationRisk[];
  rebalanceMoves: RebalanceMove[];
  diversificationGaps: DiversificationGap[];
  portfolioGrade: string;
  gradeExplanation: string;
  topPriority: string;
}

// ─── Recommended allocations for aggressive growth investor ───

const TARGET_ALLOCATION: Record<string, number> = {
  'Broad Market (S&P 500)': 25,
  'Broad Market (Total Market)': 10,
  'Technology/Semiconductors': 15,
  'Technology': 10,
  'International': 10,
  'Emerging Markets': 5,
  'Large Cap': 5,
  'Small Cap': 5,
  'Mid Cap': 3,
  'Bonds': 5,
  'Cash': 5,
  'Cryptocurrency': 2,
};

// ─── Signal Generators ───

function detectCashDrag(accounts: Account[]): PortfolioSignal[] {
  const signals: PortfolioSignal[] = [];

  for (const account of accounts) {
    if (account.type !== 'bank') continue;
    for (const holding of account.holdings) {
      if (holding.ticker === 'CASH' && holding.currentValue > 10000) {
        const isLowYield = holding.name.includes('Savings') || holding.name.includes('Joint') || holding.name.includes('Stuffs');
        if (isLowYield) {
          const annualLoss = Math.round(holding.currentValue * 0.042);
          signals.push({
            id: `cash-drag-${holding.id}`,
            type: 'action',
            urgency: holding.currentValue > 50000 ? 'now' : 'soon',
            ticker: 'CASH',
            holdingName: holding.name,
            title: `Move ${holding.name} to high-yield savings`,
            reasoning: `$${holding.currentValue.toLocaleString()} earning ~0.04% APY in BofA. A high-yield savings account at 4.25% APY would earn ~$${annualLoss.toLocaleString()}/year in interest instead. This is free money you're leaving on the table.`,
            impact: `+$${annualLoss.toLocaleString()}/yr in interest`,
          });
        }
      }
    }
  }

  return signals;
}

function detectDuplicateExposure(accounts: Account[]): PortfolioSignal[] {
  const signals: PortfolioSignal[] = [];
  const sectorHoldings: Record<string, { ticker: string; name: string; value: number; conviction?: boolean }[]> = {};

  for (const account of accounts) {
    if (account.type === 'bank') continue;
    for (const holding of account.holdings) {
      const sector = getSector(holding.ticker);
      if (!sectorHoldings[sector]) sectorHoldings[sector] = [];
      const existing = sectorHoldings[sector].find(h => h.ticker === holding.ticker);
      if (existing) {
        existing.value += holding.currentValue;
        if (holding.conviction) existing.conviction = true;
      } else {
        sectorHoldings[sector].push({
          ticker: holding.ticker,
          name: holding.name,
          value: holding.currentValue,
          conviction: holding.conviction || undefined,
        });
      }
    }
  }

  // Find sectors with redundant tickers
  for (const [sector, holdings] of Object.entries(sectorHoldings)) {
    if (holdings.length < 2) continue;
    const totalSectorValue = holdings.reduce((s, h) => s + h.value, 0);
    if (totalSectorValue < 5000) continue;

    // Sort by value descending
    holdings.sort((a, b) => b.value - a.value);
    const primary = holdings[0];
    for (let i = 1; i < holdings.length; i++) {
      const dup = holdings[i];
      if (dup.value < 1000) continue;
      // Skip consolidation suggestions when either side is a conviction hold — user has declared intent.
      if (dup.conviction || primary.conviction) continue;
      signals.push({
        id: `dup-${primary.ticker}-${dup.ticker}`,
        type: 'rebalance',
        urgency: 'soon',
        ticker: dup.ticker,
        holdingName: dup.name,
        title: `${dup.ticker} overlaps with ${primary.ticker} (both ${sector})`,
        reasoning: `You hold $${primary.value.toLocaleString()} in ${primary.ticker} and $${dup.value.toLocaleString()} in ${dup.ticker}. Both are in ${sector}. Consider consolidating into ${primary.ticker} to simplify and reduce redundancy.`,
        impact: `Simplify ${sector} exposure`,
      });
    }
  }

  return signals;
}

function detectStalePositions(accounts: Account[]): PortfolioSignal[] {
  const signals: PortfolioSignal[] = [];

  for (const account of accounts) {
    if (account.type === 'bank') continue;
    for (const holding of account.holdings) {
      // Conviction holdings: user has declared intent to keep regardless of math. Don't suggest selling.
      if (holding.conviction) continue;

      // Detect holdings with significant losses
      if (holding.totalGainLossPercent < -15 && holding.currentValue > 1000) {
        signals.push({
          id: `loss-${holding.ticker}`,
          type: 'sell',
          urgency: holding.totalGainLossPercent < -30 ? 'now' : 'soon',
          ticker: holding.ticker,
          holdingName: holding.name,
          title: `${holding.ticker} down ${Math.abs(holding.totalGainLossPercent).toFixed(1)}%`,
          reasoning: `${holding.name} is down ${Math.abs(holding.totalGainLossPercent).toFixed(1)}% from your cost basis. Consider whether the thesis still holds. If not, you can tax-loss harvest by selling and replacing with a similar (non-identical) fund.`,
          impact: `Tax savings of ~$${Math.round(Math.abs(holding.totalGainLoss) * 0.32).toLocaleString()} if harvested`,
          taxNote: 'Tax-loss harvesting: sell at a loss, buy a similar fund after 30 days. Loss offsets other gains.',
        });
      }

      // Detect tiny holdings not worth tracking
      if (holding.currentValue < 100 && holding.currentValue > 0 && holding.ticker !== 'CASH') {
        signals.push({
          id: `tiny-${holding.ticker}`,
          type: 'sell',
          urgency: 'watch',
          ticker: holding.ticker,
          holdingName: holding.name,
          title: `${holding.ticker} is only $${Math.round(holding.currentValue)} — not worth tracking`,
          reasoning: `This position is too small to meaningfully impact your portfolio. Consider selling and consolidating the proceeds into a core holding.`,
        });
      }
    }
  }

  return signals;
}

function detectOverconcentration(accounts: Account[]): PortfolioSignal[] {
  const signals: PortfolioSignal[] = [];
  const totalValue = calculateTotalValue(accounts);
  if (totalValue === 0) return signals;

  // Check total tech exposure
  const techPct = calculateTechConcentration(accounts);
  if (techPct > 40) {
    signals.push({
      id: 'tech-overweight',
      type: 'rebalance',
      urgency: techPct > 60 ? 'now' : 'soon',
      ticker: 'SOXQ',
      holdingName: 'Tech/Semis portfolio',
      title: `Tech exposure at ${techPct.toFixed(0)}% — dangerously concentrated`,
      reasoning: `Including indirect exposure through index funds, roughly ${techPct.toFixed(0)}% of your investable assets are in tech. In 2022, the Nasdaq dropped 33%. If that happened again, your portfolio would take a massive hit. Target: under 30%.`,
      impact: `A 30% tech correction would cost ~$${Math.round(totalValue * (techPct / 100) * 0.3).toLocaleString()}`,
    });
  }

  // Check individual position concentration
  for (const account of accounts) {
    if (account.type === 'bank') continue;
    for (const holding of account.holdings) {
      // Conviction holdings: user intentionally over-concentrated — don't nag.
      if (holding.conviction) continue;
      const pct = (holding.currentValue / totalValue) * 100;
      if (pct > 15 && holding.ticker !== 'CASH') {
        signals.push({
          id: `concentrated-${holding.ticker}`,
          type: 'rebalance',
          urgency: pct > 25 ? 'now' : 'soon',
          ticker: holding.ticker,
          holdingName: holding.name,
          title: `${holding.ticker} is ${pct.toFixed(1)}% of portfolio`,
          reasoning: `A single position at ${pct.toFixed(1)}% creates outsized risk. If ${holding.ticker} drops 20%, your entire portfolio drops ${(pct * 0.2).toFixed(1)}%. Consider trimming to under 10%.`,
          impact: `Trimming to 10% = selling ~$${Math.round(holding.currentValue - (totalValue * 0.10)).toLocaleString()}`,
        });
      }
    }
  }

  return signals;
}

function detectMissingExposure(accounts: Account[]): PortfolioSignal[] {
  const signals: PortfolioSignal[] = [];
  const allocations = calculateSectorAllocation(accounts);
  const totalValue = calculateTotalValue(accounts);
  if (totalValue < 10000) return signals;

  const allocationMap = new Map(allocations.map(a => [a.sector, a.percentage]));

  // Check for missing sectors
  const gapSuggestions: Record<string, { etf: string; name: string; why: string }> = {
    'Healthcare': { etf: 'XLV', name: 'Health Care Select SPDR', why: 'Defensive sector, aging population tailwind' },
    'Energy': { etf: 'XLE', name: 'Energy Select SPDR', why: 'Inflation hedge, dividend income' },
    'Industrials': { etf: 'XLI', name: 'Industrial Select SPDR', why: 'Infrastructure spending, economic growth' },
    'Financials': { etf: 'XLF', name: 'Financial Select SPDR', why: 'Rate environment, undervalued sector' },
    'Communication Services': { etf: 'XLC', name: 'Communication Services Select SPDR', why: 'Meta, Google, Netflix exposure' },
  };

  for (const [sector, suggestion] of Object.entries(gapSuggestions)) {
    const currentPct = allocationMap.get(sector) || 0;
    if (currentPct < 1) {
      signals.push({
        id: `gap-${sector.toLowerCase().replace(/\s/g, '-')}`,
        type: 'buy',
        urgency: 'watch',
        ticker: suggestion.etf,
        holdingName: suggestion.name,
        title: `No ${sector} exposure — consider ${suggestion.etf}`,
        reasoning: `You have zero allocation to ${sector}. Adding 3-5% via ${suggestion.etf} (${suggestion.name}) would improve diversification. ${suggestion.why}.`,
        impact: `3-5% = $${Math.round(totalValue * 0.04).toLocaleString()}`,
      });
    }
  }

  // Check international exposure specifically
  const intlPct = (allocationMap.get('International') || 0) + (allocationMap.get('Emerging Markets') || 0);
  if (intlPct < 10) {
    signals.push({
      id: 'intl-underweight',
      type: 'buy',
      urgency: 'soon',
      ticker: 'FDEV',
      holdingName: 'International exposure',
      title: `International exposure only ${intlPct.toFixed(1)}% — target 15-20%`,
      reasoning: `The US won't always outperform. Global diversification reduces single-country risk. Most advisors recommend 20-30% international. Even getting to 15% would help.`,
      impact: `Add $${Math.round(totalValue * 0.10).toLocaleString()} to international`,
    });
  }

  return signals;
}

function detectEquityRisk(equity: EquityProfile | undefined, totalLiquid: number): PortfolioSignal[] {
  if (!equity) return [];
  const signals: PortfolioSignal[] = [];
  const totalWealth = totalLiquid + equity.totalCurrentValue;
  const equityPct = (equity.totalCurrentValue / totalWealth) * 100;

  if (equityPct > 30) {
    signals.push({
      id: 'company-concentration',
      type: 'rebalance',
      urgency: equityPct > 50 ? 'now' : 'soon',
      ticker: equity.company.toUpperCase(),
      holdingName: `${equity.company} equity`,
      title: `${equityPct.toFixed(0)}% of wealth tied to ${equity.company}`,
      reasoning: `Your salary AND ${equityPct.toFixed(0)}% of your net worth depend on one company. This is the classic "golden handcuffs" risk. Post-IPO, plan to diversify 25-50% of vested shares over 2-3 years.`,
      impact: `If ${equity.company} drops 50%, you lose $${Math.round(equity.totalCurrentValue * 0.5).toLocaleString()}`,
    });
  }

  // Check for unexercised ISOs
  const exercisableISOs = equity.grants.filter(g => g.type === 'iso' && g.exercisableShares > 0);
  for (const grant of exercisableISOs) {
    const spread = (grant.currentFMV - grant.strikePrice) * grant.exercisableShares;
    const exerciseCost = grant.strikePrice * grant.exercisableShares;
    signals.push({
      id: `iso-exercise-${grant.id}`,
      type: 'action',
      urgency: 'now',
      ticker: equity.company.toUpperCase(),
      holdingName: `ISO Grant ${grant.grantNumber}`,
      title: `Exercise ${grant.exercisableShares.toLocaleString()} ISOs at $${grant.strikePrice}`,
      reasoning: `You have ${grant.exercisableShares.toLocaleString()} exercisable ISOs with a spread of $${Math.round(spread).toLocaleString()}. Exercising now costs $${Math.round(exerciseCost).toLocaleString()} and starts the 1-year LTCG clock. If you wait until post-IPO, the spread will be taxed as ordinary income (~32%) instead of LTCG (~15%).`,
      impact: `Potential tax savings: ~$${Math.round(spread * 0.17).toLocaleString()}`,
      taxNote: 'Exercise early = start LTCG clock. Hold 1yr + 2yr from grant = qualified disposition.',
    });
  }

  return signals;
}

function detectCryptoIssues(accounts: Account[]): PortfolioSignal[] {
  const signals: PortfolioSignal[] = [];
  const totalValue = calculateTotalValue(accounts);
  if (totalValue === 0) return signals;

  let cryptoValue = 0;
  const cryptoHoldings: Holding[] = [];

  for (const account of accounts) {
    if (account.type === 'crypto') {
      for (const holding of account.holdings) {
        cryptoValue += holding.currentValue;
        cryptoHoldings.push(holding);
      }
    }
  }

  // Check for unstaked assets
  for (const h of cryptoHoldings) {
    if (h.ticker === 'SOL' && h.currentValue > 500) {
      signals.push({
        id: 'stake-sol',
        type: 'action',
        urgency: 'soon',
        ticker: 'SOL',
        holdingName: h.name,
        title: `Stake SOL for 6-8% yield`,
        reasoning: `You're holding $${Math.round(h.currentValue).toLocaleString()} in SOL but not earning staking rewards. Staking on Coinbase earns 6-8% APY automatically. That's ~$${Math.round(h.currentValue * 0.07).toLocaleString()}/yr in free yield.`,
        impact: `+$${Math.round(h.currentValue * 0.07).toLocaleString()}/yr staking rewards`,
      });
    }
  }

  // Check for memecoins — exclude conviction holds (user has declared intent to keep)
  const memecoins = cryptoHoldings.filter(h => ['SHIB', 'DOGE', 'ADA'].includes(h.ticker) && !h.conviction);
  const memecoinValue = memecoins.reduce((s, h) => s + h.currentValue, 0);
  if (memecoinValue > 50) {
    signals.push({
      id: 'sell-memecoins',
      type: 'sell',
      urgency: 'watch',
      ticker: 'MEME',
      holdingName: 'Memecoins (SHIB, DOGE, ADA)',
      title: `$${Math.round(memecoinValue)} in memecoins — not worth tracking`,
      reasoning: `You have $${Math.round(memecoinValue)} spread across memecoins. This is too small to matter but adds complexity to your portfolio. Sell and consolidate into BTC or SOL.`,
    });
  }

  return signals;
}

function detect401kIssues(accounts: Account[]): PortfolioSignal[] {
  const signals: PortfolioSignal[] = [];

  for (const account of accounts) {
    if (account.type !== '401k') continue;
    // Check for "ROLL TO IRA" badge
    for (const holding of account.holdings) {
      if (holding.notes?.includes('ROLL TO IRA')) {
        signals.push({
          id: `rollover-${account.id}`,
          type: 'action',
          urgency: 'soon',
          ticker: holding.ticker,
          holdingName: `${account.name} (${account.institution})`,
          title: `Roll ${account.name} to Traditional IRA`,
          reasoning: `Old employer 401k with $${Math.round(account.totalValue).toLocaleString()}. Rolling to an IRA at Fidelity gives you access to thousands of low-cost funds instead of the limited 401k menu. No tax event if done properly (trustee-to-trustee transfer).`,
          impact: `Better fund options, lower fees`,
          taxNote: 'Traditional 401k → Traditional IRA = no taxes. Do NOT convert to Roth unless you want a tax bill.',
        });
      }
    }
  }

  return signals;
}

// ─── Concentration Analysis ───

function analyzeConcentrationRisks(accounts: Account[]): ConcentrationRisk[] {
  const risks: ConcentrationRisk[] = [];
  const allocations = calculateSectorAllocation(accounts);
  const totalValue = calculateTotalValue(accounts);

  for (const alloc of allocations) {
    if (alloc.percentage < 15 || alloc.sector === 'Cash') continue;

    const tickers: ConcentrationRisk['tickers'] = [];
    let convictionValue = 0;
    for (const account of accounts) {
      for (const holding of account.holdings) {
        if (getSector(holding.ticker) !== alloc.sector) continue;
        if (holding.conviction) convictionValue += holding.currentValue;
        const existing = tickers.find(t => t.ticker === holding.ticker);
        if (existing) {
          existing.value += holding.currentValue;
          existing.pct = (existing.value / totalValue) * 100;
          if (holding.conviction) existing.conviction = true;
        } else {
          tickers.push({
            ticker: holding.ticker,
            name: holding.name,
            value: holding.currentValue,
            pct: (holding.currentValue / totalValue) * 100,
            conviction: holding.conviction || undefined,
          });
        }
      }
    }

    tickers.sort((a, b) => b.value - a.value);
    const targetPct = TARGET_ALLOCATION[alloc.sector] || 10;

    // Conviction holdings are excluded from trim math — the user has declared intent.
    const trimmableValue = Math.max(0, alloc.value - convictionValue);
    const trimmablePct = (trimmableValue / totalValue) * 100;
    const convictionPct = (convictionValue / totalValue) * 100;

    let recommendation = '';
    if (convictionValue > 0 && trimmablePct <= targetPct * 1.3) {
      // The "overweight" is entirely explained by conviction — don't nag.
      recommendation = `${convictionPct.toFixed(1)}% is conviction (excluded from trim math). Non-conviction ${alloc.sector.toLowerCase()} is ${trimmablePct.toFixed(1)}% vs ${targetPct}% target — within range.`;
    } else if (trimmablePct > targetPct * 2) {
      const trimAmount = Math.round(trimmableValue - (totalValue * targetPct / 100));
      recommendation = `Significantly overweight${convictionNote(convictionPct)}. Consider trimming by $${trimAmount.toLocaleString()} to reach ${targetPct}% target.`;
    } else if (trimmablePct > targetPct * 1.3) {
      recommendation = `Moderately overweight${convictionNote(convictionPct)}. Redirect new investments to other sectors instead of adding more here.`;
    } else {
      recommendation = `Within reasonable range of ${targetPct}% target.`;
    }

    risks.push({
      sector: alloc.sector,
      percentage: alloc.percentage,
      value: alloc.value,
      tickers,
      recommendation,
      targetPct,
      convictionValue: convictionValue > 0 ? convictionValue : undefined,
      convictionPct: convictionValue > 0 ? convictionPct : undefined,
    });
  }

  return risks;
}

// ─── Rebalance Suggestions ───

function generateRebalanceMoves(accounts: Account[]): RebalanceMove[] {
  const moves: RebalanceMove[] = [];
  const allocations = calculateSectorAllocation(accounts);
  const totalValue = calculateTotalValue(accounts);
  if (totalValue < 10000) return moves;

  const allocationMap = new Map(allocations.map(a => [a.sector, a]));

  // Track conviction dollars per sector so we don't suggest trimming "sacred" positions.
  const sectorConvictionValue: Record<string, number> = {};
  // Find the biggest NON-conviction position in each sector for trim targeting.
  const sectorPrimary: Record<string, { ticker: string; name: string; value: number; pct: number }> = {};
  for (const account of accounts) {
    if (account.type === 'bank') continue;
    for (const holding of account.holdings) {
      if (holding.ticker === 'CASH' || holding.ticker === 'SPAXX' || holding.ticker === 'FDRXX' || holding.ticker === 'VMFXX') continue;
      const sector = getSector(holding.ticker);
      if (holding.conviction) {
        sectorConvictionValue[sector] = (sectorConvictionValue[sector] || 0) + holding.currentValue;
        continue; // conviction holdings never get picked as a trim target
      }
      const pct = (holding.currentValue / totalValue) * 100;
      if (!sectorPrimary[sector] || holding.currentValue > sectorPrimary[sector].value) {
        sectorPrimary[sector] = { ticker: holding.ticker, name: holding.name, value: holding.currentValue, pct };
      }
    }
  }

  // ─── Why-text builder (causal/impact narrative, not action math) ───
  const trimWhyBySector = (sector: string, overPct: number): string => {
    // overPct = how far over target (in portfolio %-points)
    const impact = (overPct * 0.8).toFixed(1); // rough impact of 20% sector correction on portfolio
    if (sector.includes('Technology') || sector.includes('Semiconductor')) {
      return `Tech concentration means one sector correction hits disproportionately — a 20% tech drop would cost you ~${impact}pts more than with target weight.`;
    }
    if (sector === 'Cryptocurrency') {
      return `Crypto volatility can undo months of gains in a week — oversizing here amplifies drawdown risk without proportional reward.`;
    }
    if (sector.includes('Broad Market')) {
      return `Concentration in broad US exposure leaves you tied to one economy's cycle — trimming creates room to diversify.`;
    }
    return `Oversizing one sector means a drawdown there hits your portfolio harder than a diversified position would.`;
  };

  const addWhyBySector = (sector: string): string => {
    if (sector === 'International') return `US-only exposure bets everything on one economy — international broadens the base and often trades at cheaper multiples than US equities.`;
    if (sector === 'Emerging Markets') return `EM growth tends to outpace developed markets over long horizons — zero exposure means missing that tailwind entirely.`;
    if (sector === 'Bonds') return `Bonds cushion equity drawdowns in most cycles and add dry powder when equities are cheap — your current allocation offers little shock absorption.`;
    if (sector === 'Small Cap') return `Small caps historically outperform large caps over 10+ year horizons — under-allocation here caps long-run upside.`;
    if (sector === 'Mid Cap') return `Mid caps split the difference — less fragile than small, more growth than large, and you currently hold almost none.`;
    if (sector === 'Healthcare') return `Healthcare is defensive (people need it regardless of the cycle) and adds stability without sacrificing long-run growth.`;
    if (sector === 'Energy') return `Energy hedges inflation and commodity shocks — zero exposure leaves you fully exposed to both.`;
    if (sector === 'Financials') return `Financials benefit from rising rates and economic expansion — including them diversifies away from tech-heavy cyclicality.`;
    return `This sector is underrepresented relative to a diversified target — adding exposure reduces single-theme risk.`;
  };

  // Generate trim moves for overweight sectors — but back out conviction $ from what counts as "overweight".
  for (const [sector, alloc] of allocationMap) {
    const target = TARGET_ALLOCATION[sector];
    if (!target || sector === 'Cash') continue;

    const primary = sectorPrimary[sector];
    if (!primary) continue; // entirely-conviction sector → no non-conviction target to trim

    const convictionValue = sectorConvictionValue[sector] || 0;
    const trimmableValue = alloc.value - convictionValue;
    const trimmablePct = (trimmableValue / totalValue) * 100;

    if (trimmablePct > target * 1.5) {
      const trimAmount = Math.round(trimmableValue - (totalValue * target / 100));
      if (trimAmount > 500) {
        const convictionPct = (convictionValue / totalValue) * 100;
        moves.push({
          action: 'trim',
          ticker: primary.ticker,
          name: primary.name,
          currentPct: alloc.percentage,
          targetPct: target,
          currentValue: primary.value,
          suggestedAmount: trimAmount,
          reason: `${sector} is ${alloc.percentage.toFixed(1)}% vs ${target}% target${convictionNote(convictionPct)}. Trim ~$${trimAmount.toLocaleString()} and redeploy.`,
          why: trimWhyBySector(sector, trimmablePct - target),
          hasConvictionInSector: convictionValue > 0,
        });
      }
    }
  }

  // Generate add moves for underweight sectors.
  // Respect conviction: if a sector is underweight but contains conviction holdings, subtract
  // that conviction $ from the gap — user said "this is my bet," so don't tell them to add more.
  const underweight: { sector: string; gap: number; effectiveGap: number; target: number; current: number; convictionPct: number }[] = [];
  for (const [sector, target] of Object.entries(TARGET_ALLOCATION)) {
    if (sector === 'Cash') continue;
    const current = allocationMap.get(sector)?.percentage || 0;
    if (current < target * 0.5) {
      const convictionValue = sectorConvictionValue[sector] || 0;
      const convictionPct = (convictionValue / totalValue) * 100;
      const gap = target - current;
      const effectiveGap = gap - convictionPct;
      if (effectiveGap <= 0) continue; // conviction $ already claims this slot — skip
      underweight.push({ sector, gap, effectiveGap, target, current, convictionPct });
    }
  }

  underweight.sort((a, b) => b.effectiveGap - a.effectiveGap);
  const suggestedETFs: Record<string, { ticker: string; name: string }> = {
    'International': { ticker: 'FDEV', name: 'Fidelity International Index' },
    'Emerging Markets': { ticker: 'FDEM', name: 'Fidelity Emerging Markets Index' },
    'Bonds': { ticker: 'FIGB', name: 'Fidelity Investment Grade Bond' },
    'Small Cap': { ticker: 'FESM', name: 'Fidelity Enhanced Small Cap' },
    'Mid Cap': { ticker: 'FMDE', name: 'Fidelity Mid Cap Enhanced' },
    'Healthcare': { ticker: 'XLV', name: 'Health Care Select SPDR' },
    'Energy': { ticker: 'XLE', name: 'Energy Select SPDR' },
    'Financials': { ticker: 'XLF', name: 'Financial Select SPDR' },
  };

  for (const uw of underweight.slice(0, 4)) {
    const etf = suggestedETFs[uw.sector];
    if (!etf) continue;
    const addAmount = Math.round(totalValue * uw.effectiveGap / 100);
    if (addAmount > 500) {
      moves.push({
        action: 'add',
        ticker: etf.ticker,
        name: etf.name,
        currentPct: uw.current,
        targetPct: uw.target,
        currentValue: 0,
        suggestedAmount: addAmount,
        reason: `${uw.sector} is only ${uw.current.toFixed(1)}% vs ${uw.target}% target${convictionInSectorNote(uw.convictionPct)}. Add ~$${addAmount.toLocaleString()} via ${etf.ticker}.`,
        why: addWhyBySector(uw.sector),
        hasConvictionInSector: uw.convictionPct > 0,
      });
    }
  }

  return moves;
}

// ─── Diversification Gaps ───

function findDiversificationGaps(accounts: Account[]): DiversificationGap[] {
  const gaps: DiversificationGap[] = [];
  const allocations = calculateSectorAllocation(accounts);
  const allocationMap = new Map(allocations.map(a => [a.sector, a.percentage]));

  const gapDefs: { sector: string; recommended: number; etfs: { ticker: string; name: string; why: string }[] }[] = [
    {
      sector: 'International',
      recommended: 15,
      etfs: [
        { ticker: 'FDEV', name: 'Fidelity International Index', why: 'Low-cost broad international developed markets' },
        { ticker: 'VEA', name: 'Vanguard FTSE Developed Markets', why: 'Widely diversified, low 0.05% expense ratio' },
      ],
    },
    {
      sector: 'Bonds',
      recommended: 5,
      etfs: [
        { ticker: 'FIGB', name: 'Fidelity Investment Grade Bond', why: 'Investment-grade corporate bonds, moderate yield' },
        { ticker: 'BND', name: 'Vanguard Total Bond Market', why: 'Broad bond exposure, portfolio stabilizer' },
      ],
    },
    {
      sector: 'Healthcare',
      recommended: 5,
      etfs: [
        { ticker: 'XLV', name: 'Health Care Select SPDR', why: 'Defensive sector, aging population tailwind' },
      ],
    },
    {
      sector: 'Energy',
      recommended: 3,
      etfs: [
        { ticker: 'XLE', name: 'Energy Select SPDR', why: 'Inflation hedge, strong dividend income' },
      ],
    },
    {
      sector: 'Small Cap',
      recommended: 5,
      etfs: [
        { ticker: 'FESM', name: 'Fidelity Enhanced Small Cap', why: 'Small caps historically outperform over long horizons' },
      ],
    },
  ];

  for (const def of gapDefs) {
    const current = allocationMap.get(def.sector) || 0;
    if (current < def.recommended * 0.5) {
      gaps.push({
        sector: def.sector,
        currentPct: current,
        recommendedPct: def.recommended,
        suggestedETFs: def.etfs,
      });
    }
  }

  return gaps;
}

// ─── Scenario Modeling ───

export function modelScenarios(
  accounts: Account[],
  monthlyInvestment: number,
  profile?: UserProfile,
): ScenarioResult[] {
  const totalValue = calculateTotalValue(accounts);
  const scenarios: ScenarioResult[] = [];
  const yearsToRetirement = profile ? profile.retirementAge - profile.age : 25;
  const annualReturn = 0.08;

  // Project current path
  const currentProjected = projectGrowth(totalValue, monthlyInvestment, yearsToRetirement, annualReturn);

  // Scenario 1: Cut monthly investment by half
  const halfInvest = monthlyInvestment / 2;
  const halfProjected = projectGrowth(totalValue, halfInvest, yearsToRetirement, annualReturn);
  scenarios.push({
    label: `Cut investing to $${halfInvest.toLocaleString()}/mo`,
    description: `If you reduced monthly investing from $${monthlyInvestment.toLocaleString()} to $${halfInvest.toLocaleString()}`,
    currentValue: totalValue,
    projectedValue: halfProjected,
    monthlyChange: -(monthlyInvestment - halfInvest),
    yearlyImpact: halfProjected - currentProjected,
  });

  // Scenario 2: Increase by $1,000/mo
  const moreInvest = monthlyInvestment + 1000;
  const moreProjected = projectGrowth(totalValue, moreInvest, yearsToRetirement, annualReturn);
  scenarios.push({
    label: `Boost investing by $1,000/mo`,
    description: `If you increased monthly investing from $${monthlyInvestment.toLocaleString()} to $${moreInvest.toLocaleString()}`,
    currentValue: totalValue,
    projectedValue: moreProjected,
    monthlyChange: 1000,
    yearlyImpact: moreProjected - currentProjected,
  });

  // Scenario 3: Max out 401k ($23,500/yr = ~$1,958/mo)
  const max401k = 1958;
  const max401kProjected = projectGrowth(totalValue, monthlyInvestment + max401k, yearsToRetirement, annualReturn);
  scenarios.push({
    label: `Max out 401k ($23,500/yr)`,
    description: `Adding $${max401k.toLocaleString()}/mo to 401k on top of current investing`,
    currentValue: totalValue,
    projectedValue: max401kProjected,
    monthlyChange: max401k,
    yearlyImpact: max401kProjected - currentProjected,
  });

  // Scenario 4: Market crash -30%
  const crashValue = totalValue * 0.7;
  const crashProjected = projectGrowth(crashValue, monthlyInvestment, yearsToRetirement, annualReturn);
  scenarios.push({
    label: `30% market crash today`,
    description: `If the market dropped 30% tomorrow but you kept investing`,
    currentValue: crashValue,
    projectedValue: crashProjected,
    monthlyChange: 0,
    yearlyImpact: crashProjected - currentProjected,
  });

  // Scenario 5: Stop investing entirely
  const stopProjected = projectGrowth(totalValue, 0, yearsToRetirement, annualReturn);
  scenarios.push({
    label: `Stop investing entirely`,
    description: `If you stopped all monthly investments but kept what you have`,
    currentValue: totalValue,
    projectedValue: stopProjected,
    monthlyChange: -monthlyInvestment,
    yearlyImpact: stopProjected - currentProjected,
  });

  return scenarios;
}

function projectGrowth(principal: number, monthlyContribution: number, years: number, annualReturn: number): number {
  let value = principal;
  const monthlyReturn = annualReturn / 12;
  for (let i = 0; i < years * 12; i++) {
    value = value * (1 + monthlyReturn) + monthlyContribution;
  }
  return Math.round(value);
}

// ─── Portfolio Grade ───
//
// Unified grading: starts from the SAME per-metric score that HealthView shows
// (so grade here never contradicts grade there), then applies small deductions
// for urgent open signals so IntelligenceView can reflect "you have work to do
// right now." If you want a new rule to affect grading, change it in
// `calculateHealthMetrics` — this function should stay thin.

function gradePortfolio(
  accounts: Account[],
  equity: EquityProfile | undefined,
  signals: PortfolioSignal[],
): { grade: string; explanation: string } {
  const metrics = calculateHealthMetrics(accounts, equity);
  const baseScore = calculateOverallScore(metrics);

  // Small action-pending deductions on top — at most -15 total — so open 'now'
  // issues can tilt the grade without re-inventing the metric formula.
  const nowSignals = signals.filter(s => s.urgency === 'now').length;
  const soonSignals = signals.filter(s => s.urgency === 'soon').length;
  const urgencyDeduction = Math.min(15, nowSignals * 5 + soonSignals * 2);
  let score = baseScore - urgencyDeduction;

  score = Math.max(0, Math.min(100, score));

  let grade: string;
  let explanation: string;

  if (score >= 85) {
    grade = 'A';
    explanation = 'Well-diversified portfolio with no critical issues. Keep doing what you\'re doing.';
  } else if (score >= 70) {
    grade = 'B';
    explanation = 'Solid foundation but some areas need attention. A few adjustments would significantly improve your risk profile.';
  } else if (score >= 55) {
    grade = 'C';
    explanation = 'Several concentration risks and missed opportunities. Your portfolio is working against you in some areas.';
  } else if (score >= 40) {
    grade = 'D';
    explanation = 'Significant issues need immediate attention. Your current allocation has too much risk for too little diversification.';
  } else {
    grade = 'F';
    explanation = 'Critical portfolio issues. You\'re taking on unnecessary risk. Focus on the "Act Now" signals first.';
  }

  return { grade, explanation };
}

// ─── Main Report Generator ───

export function generateIntelligenceReport(
  accounts: Account[],
  equity: EquityProfile | undefined,
  _profile: UserProfile | undefined,
  _monthlyInv: MonthlyInvestment | undefined,
): IntelligenceReport {
  // Generate all signals
  const signals: PortfolioSignal[] = [
    ...detectCashDrag(accounts),
    ...detectOverconcentration(accounts),
    ...detectDuplicateExposure(accounts),
    ...detectStalePositions(accounts),
    ...detectMissingExposure(accounts),
    ...detectEquityRisk(equity, calculateTotalValue(accounts)),
    ...detectCryptoIssues(accounts),
    ...detect401kIssues(accounts),
  ];

  // Sort: now > soon > watch, then sell > rebalance > action > buy
  const urgencyOrder: Record<SignalUrgency, number> = { now: 0, soon: 1, watch: 2 };
  const typeOrder: Record<SignalType, number> = { sell: 0, rebalance: 1, action: 2, buy: 3, hold: 4 };
  signals.sort((a, b) => {
    const uDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (uDiff !== 0) return uDiff;
    return typeOrder[a.type] - typeOrder[b.type];
  });

  const concentrationRisks = analyzeConcentrationRisks(accounts);
  const rebalanceMoves = generateRebalanceMoves(accounts);
  const diversificationGaps = findDiversificationGaps(accounts);

  const { grade, explanation } = gradePortfolio(accounts, equity, signals);

  // Determine top priority
  const nowSignal = signals.find(s => s.urgency === 'now');
  const topPriority = nowSignal
    ? nowSignal.title
    : signals.length > 0
    ? signals[0].title
    : 'Portfolio looks good — keep investing consistently.';

  return {
    signals,
    concentrationRisks,
    rebalanceMoves,
    diversificationGaps,
    portfolioGrade: grade,
    gradeExplanation: explanation,
    topPriority,
  };
}
