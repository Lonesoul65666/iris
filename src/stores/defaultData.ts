import type { Account, EquityProfile, UserProfile, MonthlyInvestment } from '../types/portfolio';

// ─── SAMPLE DATA (loadable via Settings → Load sample data) ────────────────
// Real Scott numbers, retained so a new user can preview a fully-populated
// dashboard. Loaded explicitly, never shipped as defaults.
export const sampleUserProfile: UserProfile = {
  name: 'Scott',
  age: 49,
  spouseAge: 43,
  spouseName: 'Claire',
  annualIncome: 360000,
  taxBracket: 32,
  state: 'TX',
  riskTolerance: 'very_aggressive',
  retirementAge: 65,
  monthlyInvestment: 2000,
  homeValue: 590000,
  mortgageBalance: 401866,
  carValue: 195000,
};

export const sampleAccounts: Account[] = [
  {
    id: 'fidelity-brokerage',
    name: 'Individual Brokerage',
    institution: 'Fidelity',
    type: 'brokerage',
    totalValue: 255558,
    lastUpdated: '2026-04-15',
    holdings: [
      { id: 'soxq', accountId: 'fidelity-brokerage', ticker: 'SOXQ', name: 'Invesco PHLX Semiconductor ETF', assetClass: 'etf', shares: 1283.023, avgCostBasis: 42.87, currentPrice: 72.69, currentValue: 93263, totalGainLoss: 38264, totalGainLossPercent: 69.57, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'xlk', accountId: 'fidelity-brokerage', ticker: 'XLK', name: 'Technology Select Sector SPDR', assetClass: 'etf', shares: 577.711, avgCostBasis: 115.10, currentPrice: 150.30, currentValue: 86830, totalGainLoss: 20336, totalGainLossPercent: 30.58, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'fxaix', accountId: 'fidelity-brokerage', ticker: 'FXAIX', name: 'Fidelity 500 Index Fund', assetClass: 'mutual_fund', shares: 113.708, avgCostBasis: 189.99, currentPrice: 244.05, currentValue: 27750, totalGainLoss: 6147, totalGainLossPercent: 28.45, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'spym', accountId: 'fidelity-brokerage', ticker: 'SPYM', name: 'SPDR Portfolio S&P 500 ETF', assetClass: 'etf', shares: 144.546, avgCostBasis: 72.64, currentPrice: 82.38, currentValue: 11908, totalGainLoss: 1408, totalGainLossPercent: 13.40, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'qqqm', accountId: 'fidelity-brokerage', ticker: 'QQQM', name: 'Invesco Nasdaq 100 ETF', assetClass: 'etf', shares: 43.096, avgCostBasis: 232.04, currentPrice: 262.48, currentValue: 11312, totalGainLoss: 1312, totalGainLossPercent: 13.11, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'smh', accountId: 'fidelity-brokerage', ticker: 'SMH', name: 'VanEck Semiconductor ETF', assetClass: 'etf', shares: 13.35, avgCostBasis: 374.51, currentPrice: 453.00, currentValue: 6048, totalGainLoss: 1048, totalGainLossPercent: 20.95, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'felc', accountId: 'fidelity-brokerage', ticker: 'FELC', name: 'Fidelity Enhanced Large Cap Core ETF', assetClass: 'etf', shares: 126.331, avgCostBasis: 34.86, currentPrice: 39.13, currentValue: 4943, totalGainLoss: 540, totalGainLossPercent: 12.26, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'tsla', accountId: 'fidelity-brokerage', ticker: 'TSLA', name: 'Tesla Inc', assetClass: 'stock', shares: 9.145, avgCostBasis: 360.84, currentPrice: 391.95, currentValue: 3584, totalGainLoss: 285, totalGainLossPercent: 8.62, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'amd', accountId: 'fidelity-brokerage', ticker: 'AMD', name: 'Advanced Micro Devices', assetClass: 'stock', shares: 12.411, avgCostBasis: 201.43, currentPrice: 258.12, currentValue: 3204, totalGainLoss: 704, totalGainLossPercent: 28.14, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'figb', accountId: 'fidelity-brokerage', ticker: 'FIGB', name: 'Fidelity Investment Grade Bond ETF', assetClass: 'bond', shares: 61.131, avgCostBasis: 42.88, currentPrice: 43.37, currentValue: 2651, totalGainLoss: 30, totalGainLossPercent: 1.15, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'fdev', accountId: 'fidelity-brokerage', ticker: 'FDEV', name: 'Fidelity Intl Multifactor ETF', assetClass: 'etf', shares: 47.748, avgCostBasis: 32.50, currentPrice: 36.91, currentValue: 1762, totalGainLoss: 211, totalGainLossPercent: 13.58, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'fdem', accountId: 'fidelity-brokerage', ticker: 'FDEM', name: 'Fidelity Emerging Markets ETF', assetClass: 'etf', shares: 22.621, avgCostBasis: 28.27, currentPrice: 34.27, currentValue: 775, totalGainLoss: 136, totalGainLossPercent: 21.22, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'fmde', accountId: 'fidelity-brokerage', ticker: 'FMDE', name: 'Fidelity Enhanced Mid Cap ETF', assetClass: 'etf', shares: 16.498, avgCostBasis: 34.95, currentPrice: 37.84, currentValue: 624, totalGainLoss: 48, totalGainLossPercent: 8.26, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'fldr', accountId: 'fidelity-brokerage', ticker: 'FLDR', name: 'Fidelity Low Duration Bond ETF', assetClass: 'bond', shares: 10.681, avgCostBasis: 50.06, currentPrice: 50.17, currentValue: 536, totalGainLoss: 1, totalGainLossPercent: 0.22, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'fesm', accountId: 'fidelity-brokerage', ticker: 'FESM', name: 'Fidelity Enhanced Small Cap ETF', assetClass: 'etf', shares: 4.782, avgCostBasis: 32.89, currentPrice: 41.31, currentValue: 198, totalGainLoss: 40, totalGainLossPercent: 25.61, status: 'active', lastUpdated: '2026-04-15' },
      { id: 'spaxx', accountId: 'fidelity-brokerage', ticker: 'SPAXX', name: 'Money Market (Cash)', assetClass: 'cash', shares: 170.11, avgCostBasis: 1, currentPrice: 1, currentValue: 170, totalGainLoss: 0, totalGainLossPercent: 0, status: 'active', lastUpdated: '2026-04-15' },
    ],
  },
  {
    id: 'abnormal-401k',
    name: 'Abnormal 401(k)',
    institution: 'Fidelity',
    type: '401k',
    totalValue: 66842,
    lastUpdated: '2026-04-15',
    holdings: [
      { id: 'pvpnx', accountId: 'abnormal-401k', ticker: 'PVPNX', name: 'PIMCO Real Path Blend 2040', assetClass: 'mutual_fund', shares: 3736.265, avgCostBasis: 14.26, currentPrice: 17.89, currentValue: 66842, totalGainLoss: 13566, totalGainLossPercent: 25.46, status: 'active', notes: 'ACTIVE — current employer 401k. Consider increasing contribution to max ($23,500/yr).', lastUpdated: '2026-04-15' },
    ],
  },
  {
    id: 'mimecast-401k',
    name: 'Mimecast 401(k) (Old)',
    institution: 'Fidelity',
    type: '401k',
    totalValue: 55574,
    lastUpdated: '2026-04-15',
    holdings: [
      { id: 'rfhtx', accountId: 'mimecast-401k', ticker: 'RFHTX', name: 'American Funds 2045 Target Date R6', assetClass: 'mutual_fund', shares: 2213.216, avgCostBasis: 17.56, currentPrice: 25.11, currentValue: 55574, totalGainLoss: 16707, totalGainLossPercent: 42.99, status: 'active', notes: 'ROLL TO IRA — old employer plan, higher fees. Roll into a Fidelity Rollover IRA for better fund options and lower costs.', lastUpdated: '2026-04-15' },
    ],
  },
  {
    id: 'wife-401k',
    name: "Claire's 401(k)",
    institution: 'Fidelity',
    type: '401k',
    totalValue: 102602,
    lastUpdated: '2026-04-15',
    holdings: [
      { id: 'wife-401k-vtrs', accountId: 'wife-401k', ticker: 'VTRS2045', name: 'Vanguard Target Retire 2045 Trust Select', assetClass: 'mutual_fund', shares: 1, avgCostBasis: 102531, currentPrice: 102531, currentValue: 102531, totalGainLoss: 0, totalGainLossPercent: 0, status: 'active', notes: 'Target-date fund (CIT). Internal mix: ~54% US stocks, 36% intl stocks, 7% US bonds, 3% intl bonds. Auto-rebalances toward bonds as 2045 approaches. Total balance includes all contributions + growth over time.', lastUpdated: '2026-04-15' },
      { id: 'wife-401k-vmfxx', accountId: 'wife-401k', ticker: 'VMFXX', name: 'Vanguard Federal Money Market', assetClass: 'cash', shares: 71.80, avgCostBasis: 1, currentPrice: 1, currentValue: 72, totalGainLoss: 0, totalGainLossPercent: 0, status: 'active', notes: 'Cash sweep — essentially zero', lastUpdated: '2026-04-15' },
    ],
  },
  {
    id: 'coinbase-crypto',
    name: 'Crypto',
    institution: 'Coinbase',
    type: 'crypto',
    totalValue: 241477,
    lastUpdated: '2026-04-15',
    holdings: [
      { id: 'btc', accountId: 'coinbase-crypto', ticker: 'BTC', name: 'Bitcoin', assetClass: 'crypto', shares: 3.16751387, avgCostBasis: 0, currentPrice: 74300, currentValue: 235346, totalGainLoss: 0, totalGainLossPercent: 0, status: 'active', notes: 'Need actual cost basis', lastUpdated: '2026-04-15' },
      { id: 'sol', accountId: 'coinbase-crypto', ticker: 'SOL', name: 'Solana', assetClass: 'crypto', shares: 57.440110974, avgCostBasis: 0, currentPrice: 85, currentValue: 4882, totalGainLoss: 0, totalGainLossPercent: 0, status: 'active', notes: 'Staked — earning ~6-8% yield. Consolidated from SHIB+DOGE trades (Apr 15)', lastUpdated: '2026-04-15' },
    ],
  },
  {
    id: 'bofa-bank',
    name: 'Bank Accounts',
    institution: 'Bank of America',
    type: 'bank',
    totalValue: 158188,
    lastUpdated: '2026-04-14',
    holdings: [
      { id: 'checking', accountId: 'bofa-bank', ticker: 'CASH', name: 'Main Checking (8256)', assetClass: 'cash', shares: 25266.31, avgCostBasis: 1, currentPrice: 1, currentValue: 25266, totalGainLoss: 0, totalGainLossPercent: 0, status: 'active', lastUpdated: '2026-04-14' },
      { id: 'joint', accountId: 'bofa-bank', ticker: 'CASH', name: 'Our Stuffs - Joint (1006)', assetClass: 'cash', shares: 68812.32, avgCostBasis: 1, currentPrice: 1, currentValue: 68812, totalGainLoss: 0, totalGainLossPercent: 0, status: 'active', notes: 'Should move to high-yield savings — losing ~$3,000/yr', lastUpdated: '2026-04-14' },
      { id: 'savings', accountId: 'bofa-bank', ticker: 'CASH', name: 'Super Savings (3784)', assetClass: 'cash', shares: 64109.74, avgCostBasis: 1, currentPrice: 1, currentValue: 64110, totalGainLoss: 0, totalGainLossPercent: 0, status: 'active', notes: 'Should move to high-yield savings — losing ~$2,800/yr', lastUpdated: '2026-04-14' },
    ],
  },
];

export const sampleEquityProfile: EquityProfile = {
  company: 'Abnormal AI',
  currentFMV: 21.23,
  lastValuation: '2025-10',
  estimatedARR: 400000000,
  totalShares: 44896,
  totalCurrentValue: 953134,
  totalExerciseCost: 20617,
  grants: [
    {
      id: 'es-199',
      type: 'iso',
      grantName: 'ES-199 (April 2021)',
      grantNumber: 'ES-199',
      grantDate: '2021-04-02',
      totalShares: 24414,
      vestedShares: 24414,
      exercisedShares: 8646,
      exercisableShares: 15768,
      outstandingShares: 15768,
      strikePrice: 0.763333,
      currentFMV: 21.23,
      expirationDate: '2031-04-01',
      notes: 'Exercised 8,646 in 2022 at $5.58 FMV. 15,768 remaining — exercise before IPO to optimize tax treatment (LTCG vs ordinary income). AMT implications need CPA review.',
    },
    {
      id: 'es-395',
      type: 'iso',
      grantName: 'ES-395 (Oct 2021)',
      grantNumber: 'ES-395',
      grantDate: '2021-10-26',
      totalShares: 2600,
      vestedShares: 2600,
      exercisedShares: 2600,
      exercisableShares: 0,
      outstandingShares: 0,
      strikePrice: 0.763333,
      currentFMV: 21.23,
      expirationDate: '2031-10-25',
      notes: 'Fully exercised in 2022.',
    },
    {
      id: 'es-916',
      type: 'rsu',
      grantName: 'ES-916 (Nov 2022)',
      grantNumber: 'ES-916',
      grantDate: '2022-11-18',
      totalShares: 1749,
      vestedShares: 0,
      exercisedShares: 0,
      exercisableShares: 0,
      outstandingShares: 1749,
      strikePrice: 0,
      currentFMV: 21.23,
      notes: 'RSUs distribute at liquidity event. Taxed as ordinary income at distribution.',
    },
    {
      id: 'es-1281',
      type: 'rsu',
      grantName: 'ES-1281 (Nov 2023)',
      grantNumber: 'ES-1281',
      grantDate: '2023-11-10',
      totalShares: 5263,
      vestedShares: 0,
      exercisedShares: 0,
      exercisableShares: 0,
      outstandingShares: 5263,
      strikePrice: 0,
      currentFMV: 21.23,
      notes: 'RSUs distribute at liquidity event. Taxed as ordinary income at distribution.',
    },
    {
      id: 'es-1964',
      type: 'rsu',
      grantName: 'ES-1964 (Dec 2024)',
      grantNumber: 'ES-1964',
      grantDate: '2024-12-05',
      totalShares: 10870,
      vestedShares: 0,
      exercisedShares: 0,
      exercisableShares: 0,
      outstandingShares: 10870,
      strikePrice: 0,
      currentFMV: 21.23,
      notes: 'RSUs distribute at liquidity event. Taxed as ordinary income at distribution.',
    },
  ],
};

export const sampleMonthlyInvestment: MonthlyInvestment = {
  id: 'monthly-auto',
  amount: 2000,
  allocations: [
    { ticker: 'SOXQ', name: 'Invesco PHLX Semiconductor ETF', percentage: 50 },
    { ticker: 'XLK', name: 'Technology Select Sector SPDR', percentage: 50 },
  ],
  active: true,
  lastUpdated: '2026-04-14',
};

// ─── NEUTRAL DEFAULTS (shipped to all users) ───────────────────────────────
// 0 acts as a "not set" sentinel for numeric fields. Widgets that consume
// these values should check for 0 and either show "—" or short-circuit. The
// onboarding wizard's "About you" step writes real values over these.
// Note: retirementAge stays at 65 because it's a sensible textbook default —
// changing it requires deliberate intent. Same for riskTolerance='moderate'.
export const defaultUserProfile: UserProfile = {
  name: '',
  age: 0,
  spouseAge: 0,
  spouseName: '',
  annualIncome: 0,
  taxBracket: 0,
  state: '',
  riskTolerance: 'moderate',
  retirementAge: 65,
  monthlyInvestment: 0,
  homeValue: 0,
  mortgageBalance: 0,
  carValue: 0,
};

export const defaultAccounts: Account[] = [];   // empty — user adds via setup wizard or SimpleFIN
export const defaultEquityProfile: EquityProfile | null = null;
export const defaultMonthlyInvestment: MonthlyInvestment = {
  id: 'monthly-auto',
  amount: 0,
  allocations: [],
  active: false,
  lastUpdated: new Date().toISOString().slice(0, 10),
};
