/**
 * ETF constituent data for the X-Ray feature — top ~10 holdings per ETF.
 *
 * v1: Static hardcoded weights sourced from issuer fact sheets (late 2025 snapshot).
 * Weights are point-in-time estimates for overlap analysis — close enough for "you
 * own NVDA across 4 funds" demos. Not trading-grade data.
 *
 * v2 (planned): Replace with a cached dynamic fetch (quarterly refresh or Gemini-grounded
 * lookup). Until then, top-10 drift is slow enough that this is useful through ~2026.
 */

export interface EtfHolding {
  ticker: string;
  name: string;
  weight: number; // fraction (0.072 = 7.2%)
}

export interface EtfConstituents {
  ticker: string;
  name: string;
  category: 'broad' | 'tech' | 'semi' | 'dividend' | 'small-cap' | 'mid-cap' | 'intl' | 'sector';
  topHoldings: EtfHolding[];
  asOf: string;
}

const AAPL = { ticker: 'AAPL', name: 'Apple' };
const MSFT = { ticker: 'MSFT', name: 'Microsoft' };
const NVDA = { ticker: 'NVDA', name: 'NVIDIA' };
const AMZN = { ticker: 'AMZN', name: 'Amazon' };
const META = { ticker: 'META', name: 'Meta Platforms' };
const GOOGL = { ticker: 'GOOGL', name: 'Alphabet (Class A)' };
const GOOG = { ticker: 'GOOG', name: 'Alphabet (Class C)' };
const AVGO = { ticker: 'AVGO', name: 'Broadcom' };
const TSLA = { ticker: 'TSLA', name: 'Tesla' };
const BRKB = { ticker: 'BRK.B', name: 'Berkshire Hathaway' };
const JPM = { ticker: 'JPM', name: 'JPMorgan Chase' };
const LLY = { ticker: 'LLY', name: 'Eli Lilly' };
const V = { ticker: 'V', name: 'Visa' };
const UNH = { ticker: 'UNH', name: 'UnitedHealth' };
const XOM = { ticker: 'XOM', name: 'Exxon Mobil' };
const ORCL = { ticker: 'ORCL', name: 'Oracle' };
const COST = { ticker: 'COST', name: 'Costco' };
const NFLX = { ticker: 'NFLX', name: 'Netflix' };
const AMD = { ticker: 'AMD', name: 'Advanced Micro Devices' };
const TSM = { ticker: 'TSM', name: 'Taiwan Semiconductor' };
const ASML = { ticker: 'ASML', name: 'ASML Holding' };
const QCOM = { ticker: 'QCOM', name: 'Qualcomm' };
const AMAT = { ticker: 'AMAT', name: 'Applied Materials' };
const TXN = { ticker: 'TXN', name: 'Texas Instruments' };
const MU = { ticker: 'MU', name: 'Micron Technology' };
const LRCX = { ticker: 'LRCX', name: 'Lam Research' };
const KLAC = { ticker: 'KLAC', name: 'KLA Corp' };
const MRVL = { ticker: 'MRVL', name: 'Marvell Technology' };
const CRM = { ticker: 'CRM', name: 'Salesforce' };
const ADBE = { ticker: 'ADBE', name: 'Adobe' };
const CSCO = { ticker: 'CSCO', name: 'Cisco' };
const ACN = { ticker: 'ACN', name: 'Accenture' };
const IBM = { ticker: 'IBM', name: 'IBM' };
const NOW = { ticker: 'NOW', name: 'ServiceNow' };
const PEP = { ticker: 'PEP', name: 'PepsiCo' };
const KO = { ticker: 'KO', name: 'Coca-Cola' };
const MRK = { ticker: 'MRK', name: 'Merck' };
const ABBV = { ticker: 'ABBV', name: 'AbbVie' };
const PFE = { ticker: 'PFE', name: 'Pfizer' };
const JNJ = { ticker: 'JNJ', name: 'Johnson & Johnson' };
const HD = { ticker: 'HD', name: 'Home Depot' };
const BMY = { ticker: 'BMY', name: 'Bristol-Myers Squibb' };
const CVX = { ticker: 'CVX', name: 'Chevron' };
const VZ = { ticker: 'VZ', name: 'Verizon' };
const LMT = { ticker: 'LMT', name: 'Lockheed Martin' };
const BLK = { ticker: 'BLK', name: 'BlackRock' };
const BAC = { ticker: 'BAC', name: 'Bank of America' };
const WFC = { ticker: 'WFC', name: 'Wells Fargo' };
const GS = { ticker: 'GS', name: 'Goldman Sachs' };
const MS = { ticker: 'MS', name: 'Morgan Stanley' };
const SPGI = { ticker: 'SPGI', name: 'S&P Global' };
const AXP = { ticker: 'AXP', name: 'American Express' };
const SCHW = { ticker: 'SCHW', name: 'Charles Schwab' };
const C = { ticker: 'C', name: 'Citigroup' };
const ABT = { ticker: 'ABT', name: 'Abbott Laboratories' };
const TMO = { ticker: 'TMO', name: 'Thermo Fisher Scientific' };
const DHR = { ticker: 'DHR', name: 'Danaher' };
const AMGN = { ticker: 'AMGN', name: 'Amgen' };
const ISRG = { ticker: 'ISRG', name: 'Intuitive Surgical' };
const CVS = { ticker: 'CVS', name: 'CVS Health' };
const ELV = { ticker: 'ELV', name: 'Elevance Health' };
const COP = { ticker: 'COP', name: 'ConocoPhillips' };
const EOG = { ticker: 'EOG', name: 'EOG Resources' };
const SLB = { ticker: 'SLB', name: 'Schlumberger' };
const MPC = { ticker: 'MPC', name: 'Marathon Petroleum' };
const PSX = { ticker: 'PSX', name: 'Phillips 66' };
const OXY = { ticker: 'OXY', name: 'Occidental Petroleum' };
const WMT = { ticker: 'WMT', name: 'Walmart' };
const PG = { ticker: 'PG', name: 'Procter & Gamble' };
const NESN = { ticker: 'NESN', name: 'Nestlé' };
const NVO = { ticker: 'NVO', name: 'Novo Nordisk' };
const TCEHY = { ticker: 'TCEHY', name: 'Tencent' };
const BABA = { ticker: 'BABA', name: 'Alibaba' };
const SAMSUNG = { ticker: '005930.KS', name: 'Samsung Electronics' };
const SHEL = { ticker: 'SHEL', name: 'Shell' };
const AZN = { ticker: 'AZN', name: 'AstraZeneca' };
const TM = { ticker: 'TM', name: 'Toyota Motor' };
const NVS = { ticker: 'NVS', name: 'Novartis' };
const ROG = { ticker: 'ROG', name: 'Roche Holding' };
const ADI = { ticker: 'ADI', name: 'Analog Devices' };

// Weight helper — shorthand for holding rows
const h = (s: { ticker: string; name: string }, weight: number): EtfHolding => ({ ...s, weight });

const SP500_TOP: EtfHolding[] = [
  h(AAPL, 0.072),
  h(NVDA, 0.070),
  h(MSFT, 0.065),
  h(AMZN, 0.040),
  h(GOOGL, 0.022),
  h(META, 0.025),
  h(GOOG, 0.019),
  h(AVGO, 0.022),
  h(TSLA, 0.017),
  h(BRKB, 0.016),
  h(JPM, 0.014),
  h(LLY, 0.012),
];

const TECH_TOP: EtfHolding[] = [
  h(NVDA, 0.155),
  h(AAPL, 0.150),
  h(MSFT, 0.145),
  h(AVGO, 0.058),
  h(ORCL, 0.030),
  h(CRM, 0.025),
  h(CSCO, 0.020),
  h(ADBE, 0.018),
  h(ACN, 0.017),
  h(IBM, 0.016),
];

const ASOF = '2025-11-30';

export const ETF_CONSTITUENTS: Record<string, EtfConstituents> = {
  VOO: {
    ticker: 'VOO', name: 'Vanguard S&P 500 ETF', category: 'broad',
    topHoldings: SP500_TOP, asOf: ASOF,
  },
  SPY: {
    ticker: 'SPY', name: 'SPDR S&P 500 ETF', category: 'broad',
    topHoldings: SP500_TOP, asOf: ASOF,
  },
  IVV: {
    ticker: 'IVV', name: 'iShares Core S&P 500 ETF', category: 'broad',
    topHoldings: SP500_TOP, asOf: ASOF,
  },
  VTI: {
    ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', category: 'broad',
    topHoldings: [
      h(AAPL, 0.062),
      h(NVDA, 0.060),
      h(MSFT, 0.056),
      h(AMZN, 0.035),
      h(META, 0.022),
      h(AVGO, 0.019),
      h(GOOGL, 0.019),
      h(GOOG, 0.016),
      h(TSLA, 0.015),
      h(BRKB, 0.014),
    ], asOf: ASOF,
  },
  FXAIX: {
    ticker: 'FXAIX', name: 'Fidelity 500 Index', category: 'broad',
    topHoldings: SP500_TOP, asOf: ASOF,
  },
  QQQ: {
    ticker: 'QQQ', name: 'Invesco QQQ Trust', category: 'tech',
    topHoldings: [
      h(NVDA, 0.090),
      h(AAPL, 0.088),
      h(MSFT, 0.080),
      h(AVGO, 0.055),
      h(AMZN, 0.055),
      h(META, 0.045),
      h(GOOGL, 0.027),
      h(GOOG, 0.026),
      h(TSLA, 0.032),
      h(COST, 0.028),
      h(NFLX, 0.026),
    ], asOf: ASOF,
  },
  QQQM: {
    ticker: 'QQQM', name: 'Invesco Nasdaq 100 ETF', category: 'tech',
    topHoldings: [
      h(NVDA, 0.090),
      h(AAPL, 0.088),
      h(MSFT, 0.080),
      h(AVGO, 0.055),
      h(AMZN, 0.055),
      h(META, 0.045),
      h(GOOGL, 0.027),
      h(GOOG, 0.026),
      h(TSLA, 0.032),
      h(COST, 0.028),
      h(NFLX, 0.026),
    ], asOf: ASOF,
  },
  XLK: {
    ticker: 'XLK', name: 'Technology Select Sector SPDR', category: 'tech',
    topHoldings: TECH_TOP, asOf: ASOF,
  },
  VGT: {
    ticker: 'VGT', name: 'Vanguard Information Technology ETF', category: 'tech',
    topHoldings: [
      h(NVDA, 0.160),
      h(AAPL, 0.140),
      h(MSFT, 0.140),
      h(AVGO, 0.055),
      h(ORCL, 0.030),
      h(CRM, 0.025),
      h(CSCO, 0.019),
      h(ADBE, 0.016),
      h(ACN, 0.015),
      h(NOW, 0.015),
    ], asOf: ASOF,
  },
  SOXX: {
    ticker: 'SOXX', name: 'iShares Semiconductor ETF', category: 'semi',
    topHoldings: [
      h(NVDA, 0.095),
      h(AVGO, 0.090),
      h(AMD, 0.070),
      h(QCOM, 0.070),
      h(TXN, 0.068),
      h(AMAT, 0.060),
      h(LRCX, 0.050),
      h(MU, 0.045),
      h(KLAC, 0.042),
      h(MRVL, 0.040),
      h(ADI, 0.035),
    ], asOf: ASOF,
  },
  SMH: {
    ticker: 'SMH', name: 'VanEck Semiconductor ETF', category: 'semi',
    topHoldings: [
      h(NVDA, 0.200),
      h(TSM, 0.120),
      h(AVGO, 0.100),
      h(AMD, 0.058),
      h(QCOM, 0.052),
      h(TXN, 0.050),
      h(AMAT, 0.048),
      h(LRCX, 0.045),
      h(MU, 0.042),
      h(ASML, 0.040),
    ], asOf: ASOF,
  },
  SOXQ: {
    ticker: 'SOXQ', name: 'Invesco PHLX Semiconductor ETF', category: 'semi',
    topHoldings: [
      h(NVDA, 0.220),
      h(AVGO, 0.110),
      h(TSM, 0.080),
      h(AMD, 0.065),
      h(QCOM, 0.055),
      h(TXN, 0.050),
      h(AMAT, 0.045),
      h(MU, 0.042),
      h(LRCX, 0.040),
      h(KLAC, 0.038),
    ], asOf: ASOF,
  },
  SCHD: {
    ticker: 'SCHD', name: 'Schwab US Dividend Equity ETF', category: 'dividend',
    topHoldings: [
      h(AVGO, 0.045),
      h(TXN, 0.044),
      h(HD, 0.042),
      h(CVX, 0.042),
      h(PEP, 0.041),
      h(ABBV, 0.040),
      h(KO, 0.040),
      h(MRK, 0.040),
      h(PFE, 0.039),
      h(BMY, 0.038),
      h(LMT, 0.038),
      h(VZ, 0.037),
    ], asOf: ASOF,
  },
  VYM: {
    ticker: 'VYM', name: 'Vanguard High Dividend Yield ETF', category: 'dividend',
    topHoldings: [
      h(AVGO, 0.048),
      h(JPM, 0.032),
      h(XOM, 0.030),
      h(PG, 0.025),
      h(JNJ, 0.023),
      h(HD, 0.022),
      h(ABBV, 0.020),
      h(WMT, 0.019),
      h(KO, 0.018),
      h(CVX, 0.017),
    ], asOf: ASOF,
  },
  IWM: {
    ticker: 'IWM', name: 'iShares Russell 2000 ETF', category: 'small-cap',
    topHoldings: [
      // Russell 2000 is very diversified — top holdings are ~0.5% each
      h({ ticker: 'SMCI', name: 'Super Micro Computer' }, 0.006),
      h({ ticker: 'FTAI', name: 'FTAI Aviation' }, 0.005),
      h({ ticker: 'FIX', name: 'Comfort Systems USA' }, 0.005),
      h({ ticker: 'MLI', name: 'Mueller Industries' }, 0.004),
      h({ ticker: 'SFM', name: 'Sprouts Farmers Market' }, 0.004),
    ], asOf: ASOF,
  },
  VXUS: {
    ticker: 'VXUS', name: 'Vanguard Total International Stock ETF', category: 'intl',
    topHoldings: [
      h(TSM, 0.025),
      h(SAMSUNG, 0.012),
      h(NESN, 0.010),
      h(NVO, 0.010),
      h(ASML, 0.010),
      h(TCEHY, 0.009),
      h(SHEL, 0.008),
      h(AZN, 0.008),
      h(NVS, 0.008),
      h(TM, 0.007),
    ], asOf: ASOF,
  },
  VEA: {
    ticker: 'VEA', name: 'Vanguard FTSE Developed Markets ETF', category: 'intl',
    topHoldings: [
      h(NESN, 0.013),
      h(NVO, 0.013),
      h(ASML, 0.013),
      h(SHEL, 0.011),
      h(AZN, 0.010),
      h(NVS, 0.010),
      h(TM, 0.009),
      h(ROG, 0.009),
      h(SAMSUNG, 0.008),
    ], asOf: ASOF,
  },
  VWO: {
    ticker: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF', category: 'intl',
    topHoldings: [
      h(TSM, 0.085),
      h(TCEHY, 0.042),
      h(SAMSUNG, 0.035),
      h(BABA, 0.025),
      h({ ticker: 'HDB', name: 'HDFC Bank' }, 0.014),
      h({ ticker: 'RELIANCE', name: 'Reliance Industries' }, 0.012),
      h({ ticker: 'PDD', name: 'PDD Holdings' }, 0.011),
    ], asOf: ASOF,
  },
  XLE: {
    ticker: 'XLE', name: 'Energy Select Sector SPDR', category: 'sector',
    topHoldings: [
      h(XOM, 0.230),
      h(CVX, 0.170),
      h(COP, 0.085),
      h(EOG, 0.045),
      h(SLB, 0.040),
      h(MPC, 0.040),
      h(PSX, 0.038),
      h(OXY, 0.032),
    ], asOf: ASOF,
  },
  XLF: {
    ticker: 'XLF', name: 'Financial Select Sector SPDR', category: 'sector',
    topHoldings: [
      h(BRKB, 0.130),
      h(JPM, 0.110),
      h(V, 0.065),
      h({ ticker: 'MA', name: 'Mastercard' }, 0.055),
      h(BAC, 0.045),
      h(WFC, 0.040),
      h(GS, 0.030),
      h(MS, 0.028),
      h(SPGI, 0.028),
      h(AXP, 0.028),
      h(BLK, 0.025),
      h(SCHW, 0.024),
      h(C, 0.022),
    ], asOf: ASOF,
  },
  XLV: {
    ticker: 'XLV', name: 'Health Care Select Sector SPDR', category: 'sector',
    topHoldings: [
      h(LLY, 0.110),
      h(JNJ, 0.075),
      h(UNH, 0.070),
      h(ABBV, 0.060),
      h(MRK, 0.048),
      h(ABT, 0.045),
      h(TMO, 0.038),
      h(DHR, 0.032),
      h(AMGN, 0.030),
      h(PFE, 0.028),
      h(BMY, 0.025),
      h(ISRG, 0.024),
      h(CVS, 0.020),
      h(ELV, 0.020),
    ], asOf: ASOF,
  },
};

export function getEtfConstituents(ticker: string): EtfConstituents | null {
  return ETF_CONSTITUENTS[ticker.toUpperCase()] ?? null;
}

export function isKnownEtf(ticker: string): boolean {
  return ticker.toUpperCase() in ETF_CONSTITUENTS;
}

export function listKnownEtfs(): string[] {
  return Object.keys(ETF_CONSTITUENTS);
}
