export type AccountType = 'brokerage' | '401k' | 'ira' | 'roth_ira' | 'hsa' | 'crypto' | 'bank' | 'equity';

export type AssetClass = 'stock' | 'etf' | 'mutual_fund' | 'bond' | 'crypto' | 'cash' | 'option' | 'rsu';

export type HoldingStatus = 'active' | 'watchlist' | 'sold';

export interface Holding {
  id: string;
  accountId: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  shares: number;
  avgCostBasis: number;
  currentPrice: number;
  currentValue: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  status: HoldingStatus;
  notes?: string;
  lastUpdated: string;
  /** Conviction hold — user explicitly wants to hold this regardless of rebalance/target math. Excluded from rebalance suggestions; still shown in X-Ray / nudges as informational. */
  conviction?: boolean;
  /** Optional reasoning the user wrote when marking this as a conviction hold (e.g., "long-term BTC thesis"). */
  convictionNote?: string;
}

export interface Account {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  holdings: Holding[];
  totalValue: number;
  lastUpdated: string;
  /** Optional: total platform/trading fees paid (for awareness, not used in calcs) */
  totalFeesPaid?: number;
  /** Active accounts are fully tracked. Closed accounts are archived — kept for history, excluded from live totals. */
  status?: 'active' | 'closed';
}

export interface EquityGrant {
  id: string;
  type: 'iso' | 'rsu';
  grantName: string;
  grantNumber: string;
  grantDate: string;
  totalShares: number;
  vestedShares: number;
  exercisedShares: number;
  exercisableShares: number;
  outstandingShares: number;
  strikePrice: number;
  currentFMV: number;
  expirationDate?: string;
  notes?: string;
}

export interface EquityProfile {
  company: string;
  currentFMV: number;
  lastValuation: string;
  estimatedARR: number;
  grants: EquityGrant[];
  totalShares: number;
  totalCurrentValue: number;
  totalExerciseCost: number;
}

export interface MonthlyInvestment {
  id: string;
  amount: number;
  allocations: { ticker: string; name: string; percentage: number }[];
  active: boolean;
  lastUpdated: string;
}

export interface UserProfile {
  name: string;
  age: number;
  spouseAge?: number;
  spouseName?: string;
  annualIncome: number;
  taxBracket: number;
  state: string;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive' | 'very_aggressive';
  retirementAge: number;
  monthlyInvestment: number;
  // Real assets (non-liquid)
  homeValue?: number;
  mortgageBalance?: number;
  carValue?: number;
}

export interface PortfolioSnapshot {
  date: string;
  totalLiquidNetWorth: number;
  totalNetWorth: number;
  accountTotals: { accountId: string; value: number }[];
  /** Per-holding price snapshot — consolidated across accounts by ticker. Added 2026-04-19. */
  holdings?: { ticker: string; price: number; value: number }[];
}

export interface SectorAllocation {
  sector: string;
  value: number;
  percentage: number;
  color: string;
}

export interface HealthMetric {
  name: string;
  score: number; // 0-100
  status: 'good' | 'warning' | 'danger';
  message: string;
  detail: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: string[];
}
