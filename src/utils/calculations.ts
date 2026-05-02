import type { Account, EquityProfile, SectorAllocation, HealthMetric } from '../types/portfolio';

// Sector classification for common tickers
const SECTOR_MAP: Record<string, string> = {
  SOXQ: 'Technology/Semiconductors', SMH: 'Technology/Semiconductors', AMD: 'Technology/Semiconductors',
  XLK: 'Technology', QQQM: 'Technology', TSLA: 'Technology/Auto',
  FXAIX: 'Broad Market (S&P 500)', FZROX: 'Broad Market (Total Market)', SPYM: 'Broad Market (S&P 500)',
  FELC: 'Large Cap', FESM: 'Small Cap', FMDE: 'Mid Cap',
  FDEV: 'International', FDEM: 'Emerging Markets',
  FIGB: 'Bonds', FLDR: 'Bonds',
  PVPNX: 'Target Date (Diversified)', RFHTX: 'Target Date (Diversified)', VTRS2045: 'Target Date (Diversified)',
  BTC: 'Cryptocurrency', SOL: 'Cryptocurrency', SHIB: 'Cryptocurrency', DOGE: 'Cryptocurrency', ADA: 'Cryptocurrency',
  SPAXX: 'Cash', CASH: 'Cash',
  XLC: 'Communication Services', XLV: 'Healthcare', XLE: 'Energy', XLI: 'Industrials', XLF: 'Financials',
};

const SECTOR_COLORS: Record<string, string> = {
  'Technology/Semiconductors': '#8b5cf6',
  'Technology': '#6366f1',
  'Technology/Auto': '#818cf8',
  'Broad Market (S&P 500)': '#3b82f6',
  'Broad Market (Total Market)': '#2563eb',
  'Large Cap': '#0ea5e9',
  'Small Cap': '#06b6d4',
  'Mid Cap': '#14b8a6',
  'International': '#10b981',
  'Emerging Markets': '#059669',
  'Bonds': '#f59e0b',
  'Target Date (Diversified)': '#22c55e',
  'Cryptocurrency': '#f97316',
  'Cash': '#6b7280',
  'Communication Services': '#ec4899',
  'Healthcare': '#ef4444',
  'Energy': '#b91c1c',
  'Industrials': '#78716c',
  'Financials': '#a855f7',
  'Unknown': '#374151',
};

export function getSector(ticker: string): string {
  return SECTOR_MAP[ticker] || 'Unknown';
}

export function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector] || '#374151';
}

export function calculateTotalValue(accounts: Account[]): number {
  return accounts.reduce((sum, a) => sum + a.totalValue, 0);
}

export function calculateSectorAllocation(accounts: Account[]): SectorAllocation[] {
  const sectorTotals: Record<string, number> = {};
  const totalValue = calculateTotalValue(accounts);

  for (const account of accounts) {
    for (const holding of account.holdings) {
      const sector = getSector(holding.ticker);
      sectorTotals[sector] = (sectorTotals[sector] || 0) + holding.currentValue;
    }
  }

  return Object.entries(sectorTotals)
    .map(([sector, value]) => ({
      sector,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
      color: getSectorColor(sector),
    }))
    .sort((a, b) => b.value - a.value);
}

export function calculateTechConcentration(accounts: Account[]): number {
  const totalValue = calculateTotalValue(accounts);
  if (totalValue === 0) return 0;

  const techTickers = ['SOXQ', 'XLK', 'SMH', 'AMD', 'QQQM', 'TSLA'];
  let techValue = 0;
  for (const account of accounts) {
    for (const holding of account.holdings) {
      if (techTickers.includes(holding.ticker)) {
        techValue += holding.currentValue;
      }
    }
  }
  // Add ~30% of broad market funds (they're roughly 30% tech)
  for (const account of accounts) {
    for (const holding of account.holdings) {
      if (['FXAIX', 'FZROX', 'SPYM', 'FELC'].includes(holding.ticker)) {
        techValue += holding.currentValue * 0.3;
      }
    }
  }
  return (techValue / totalValue) * 100;
}

export function calculateHealthMetrics(accounts: Account[], equity?: EquityProfile): HealthMetric[] {
  const metrics: HealthMetric[] = [];
  const totalValue = calculateTotalValue(accounts);
  const allocations = calculateSectorAllocation(accounts);

  // 1. Concentration Risk
  const topAllocation = allocations[0];
  if (topAllocation) {
    const concScore = topAllocation.percentage > 40 ? 20 : topAllocation.percentage > 25 ? 50 : topAllocation.percentage > 15 ? 75 : 90;
    metrics.push({
      name: 'Concentration Risk',
      score: concScore,
      status: concScore < 40 ? 'danger' : concScore < 70 ? 'warning' : 'good',
      message: `${topAllocation.percentage.toFixed(1)}% in ${topAllocation.sector}`,
      detail: concScore < 40
        ? `Your largest sector allocation is ${topAllocation.percentage.toFixed(1)}% — that's dangerously concentrated. A downturn in ${topAllocation.sector} would hit most of your portfolio.`
        : concScore < 70
        ? `${topAllocation.percentage.toFixed(1)}% in one sector is aggressive. Consider diversifying.`
        : `Your sector allocation is reasonably balanced.`,
    });
  }

  // 2. Tech Exposure
  const techPct = calculateTechConcentration(accounts);
  const techScore = techPct > 60 ? 15 : techPct > 40 ? 40 : techPct > 25 ? 70 : 90;
  metrics.push({
    name: 'Tech Exposure',
    score: techScore,
    status: techScore < 40 ? 'danger' : techScore < 70 ? 'warning' : 'good',
    message: `~${techPct.toFixed(0)}% total tech exposure`,
    detail: techScore < 40
      ? `Including indirect exposure through index funds, roughly ${techPct.toFixed(0)}% of your investable assets are in tech/semiconductors. This is extremely concentrated — tech corrections of 20-30% have happened multiple times in the last decade.`
      : `Your tech exposure is at a reasonable level.`,
  });

  // 3. Cash Drag
  let cashInLowYield = 0;
  for (const account of accounts) {
    if (account.type === 'bank') {
      for (const holding of account.holdings) {
        if (holding.ticker === 'CASH' && (holding.name.includes('Savings') || holding.name.includes('Joint') || holding.name.includes('Stuffs'))) {
          cashInLowYield += holding.currentValue;
        }
      }
    }
  }
  const cashDragScore = cashInLowYield > 100000 ? 20 : cashInLowYield > 50000 ? 45 : cashInLowYield > 20000 ? 70 : 95;
  const annualLoss = cashInLowYield * 0.042; // ~4.2% opportunity cost
  metrics.push({
    name: 'Cash Drag',
    score: cashDragScore,
    status: cashDragScore < 40 ? 'danger' : cashDragScore < 70 ? 'warning' : 'good',
    message: `$${formatNumber(cashInLowYield)} in low-yield accounts`,
    detail: cashDragScore < 70
      ? `You have $${formatNumber(cashInLowYield)} in BofA accounts earning ~0.04% APY. A high-yield savings account pays 4-4.5%. You're losing ~$${formatNumber(annualLoss)}/year in interest. This is the easiest win available.`
      : `Your cash position is reasonable.`,
  });

  // 4. Diversification Score
  const nonCashAccounts = accounts.filter(a => a.type !== 'bank');
  const nonCashAllocations = calculateSectorAllocation(nonCashAccounts);
  const sectorCount = nonCashAllocations.filter(a => a.percentage > 2).length;
  const divScore = sectorCount >= 6 ? 85 : sectorCount >= 4 ? 60 : sectorCount >= 2 ? 35 : 15;
  metrics.push({
    name: 'Diversification',
    score: divScore,
    status: divScore < 40 ? 'danger' : divScore < 70 ? 'warning' : 'good',
    message: `${sectorCount} meaningful sectors (>2%)`,
    detail: divScore < 40
      ? `You only have ${sectorCount} sectors with meaningful allocation. True diversification means owning assets that don't all move together. Consider healthcare, energy, industrials, or international exposure.`
      : `You have decent sector diversification across ${sectorCount} sectors.`,
  });

  // 5. Single Company Risk (if equity)
  if (equity) {
    const equityPct = (equity.totalCurrentValue / (totalValue + equity.totalCurrentValue)) * 100;
    const companyScore = equityPct > 40 ? 15 : equityPct > 25 ? 40 : equityPct > 15 ? 65 : 90;
    metrics.push({
      name: 'Single Company Risk',
      score: companyScore,
      status: companyScore < 40 ? 'danger' : companyScore < 70 ? 'warning' : 'good',
      message: `${equityPct.toFixed(1)}% tied to ${equity.company}`,
      detail: companyScore < 40
        ? `Your salary AND ${equityPct.toFixed(1)}% of your wealth are tied to ${equity.company}. If the company has a bad outcome, it hits your income and your net worth simultaneously. Post-IPO, consider diversifying 25-50% of vested equity after lockup.`
        : `Your company equity exposure is at a manageable level.`,
    });
  }

  // 6. International Exposure
  let intlValue = 0;
  for (const account of accounts) {
    for (const holding of account.holdings) {
      if (['FDEV', 'FDEM'].includes(holding.ticker)) {
        intlValue += holding.currentValue;
      }
    }
  }
  const intlPct = totalValue > 0 ? (intlValue / totalValue) * 100 : 0;
  const intlScore = intlPct < 1 ? 20 : intlPct < 5 ? 45 : intlPct < 10 ? 65 : 85;
  metrics.push({
    name: 'International Exposure',
    score: intlScore,
    status: intlScore < 40 ? 'danger' : intlScore < 70 ? 'warning' : 'good',
    message: `${intlPct.toFixed(1)}% international`,
    detail: intlScore < 40
      ? `Only ${intlPct.toFixed(1)}% of your portfolio is in international markets. Most financial advisors recommend 20-30% international for proper diversification. The US won't always outperform.`
      : `Your international exposure is reasonable.`,
  });

  return metrics;
}

export function calculateOverallScore(metrics: HealthMetric[]): number {
  if (metrics.length === 0) return 0;
  return Math.round(metrics.reduce((sum, m) => sum + m.score, 0) / metrics.length);
}

export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function getAccountTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    brokerage: 'Brokerage',
    '401k': '401(k)',
    ira: 'Traditional IRA',
    roth_ira: 'Roth IRA',
    hsa: 'HSA',
    crypto: 'Crypto',
    bank: 'Bank',
    equity: 'Company Equity',
  };
  return labels[type] || type;
}

export function getRetirementProjection(
  currentLiquid: number,
  monthlyContribution: number,
  yearsToRetirement: number,
  annualReturn: number = 0.08
): { projectedValue: number; targetValue: number; onTrack: boolean } {
  let projected = currentLiquid;
  for (let i = 0; i < yearsToRetirement * 12; i++) {
    projected = projected * (1 + annualReturn / 12) + monthlyContribution;
  }
  const targetValue = 200000 * 25; // $200k annual expenses × 25 (4% rule)
  return { projectedValue: projected, targetValue, onTrack: projected >= targetValue };
}
