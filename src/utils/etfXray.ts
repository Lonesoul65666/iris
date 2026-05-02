import type { Account, AssetClass } from '../types/portfolio';
import { getEtfConstituents, type EtfConstituents } from '../data/etfConstituents';

export interface ExposureSource {
  kind: 'direct' | 'etf';
  /** ETF ticker for 'etf' kind; holding ticker for 'direct' kind. */
  via: string;
  /** ETF display name for 'etf' kind. */
  viaName?: string;
  /** Dollar value contributed by this source. */
  value: number;
  /** Weight in the ETF (fraction). Only set for 'etf' kind. */
  weight?: number;
  /** Asset class of the direct holding. Only set for 'direct' kind. */
  assetClass?: AssetClass;
  /** True when the direct holding was flagged by the user as a conviction hold. */
  conviction?: boolean;
}

export interface UnderlyingExposure {
  ticker: string;
  name: string;
  totalValue: number;
  portfolioPct: number;
  directValue: number;
  etfValue: number;
  sources: ExposureSource[];
  /** Number of distinct funds/holdings contributing. Direct stake counts as one. */
  sourceCount: number;
  /** True if any direct source was flagged as conviction — softens trim-oriented messaging. */
  hasConviction?: boolean;
}

export interface EtfBreakdown {
  etfTicker: string;
  etfName: string;
  etfValue: number;
  /** Top-holdings coverage — sum of weights we have data for (fraction). */
  coverage: number;
}

export interface XrayReport {
  /** Underlying stock-level exposures sorted by total dollar value, descending. */
  exposures: UnderlyingExposure[];
  /** ETFs in the portfolio we have constituent data for. */
  coveredEtfs: EtfBreakdown[];
  /** ETFs in the portfolio we don't yet have data for — displayed as "unknown." */
  uncoveredEtfs: { ticker: string; value: number }[];
  totalPortfolioValue: number;
  /** Total dollar value that flowed through our ETF lookups. */
  totalEtfValueCovered: number;
  /** Dollar totals by wrapper type (stock / etf / mutual_fund / crypto / bond / rsu / option). */
  byAssetClass: Partial<Record<AssetClass, number>>;
}

const IGNORED_TICKERS = new Set(['CASH', 'SPAXX', 'UNKNOWN', '']);

interface Agg {
  ticker: string;
  name: string;
  totalValue: number;
  directValue: number;
  etfValue: number;
  sources: ExposureSource[];
}

/** Build an X-Ray report: stocks you own directly AND indirectly through ETFs. */
export function generateXrayReport(accounts: Account[]): XrayReport {
  const agg = new Map<string, Agg>();
  const covered = new Map<string, EtfBreakdown>();
  const uncovered = new Map<string, number>();
  const byAssetClass: Partial<Record<AssetClass, number>> = {};
  let totalPortfolioValue = 0;
  let totalEtfValueCovered = 0;

  const addSource = (stock: { ticker: string; name: string }, source: ExposureSource) => {
    const key = stock.ticker.toUpperCase();
    const existing = agg.get(key);
    if (existing) {
      existing.totalValue += source.value;
      if (source.kind === 'direct') existing.directValue += source.value;
      else existing.etfValue += source.value;
      existing.sources.push(source);
    } else {
      agg.set(key, {
        ticker: stock.ticker,
        name: stock.name,
        totalValue: source.value,
        directValue: source.kind === 'direct' ? source.value : 0,
        etfValue: source.kind === 'etf' ? source.value : 0,
        sources: [source],
      });
    }
  };

  for (const acct of accounts) {
    if (acct.status === 'closed') continue;
    if (acct.type === 'bank') continue;
    for (const h of acct.holdings) {
      const ticker = (h.ticker || '').toUpperCase();
      if (IGNORED_TICKERS.has(ticker)) continue;
      if (h.currentValue < 1) continue;
      totalPortfolioValue += h.currentValue;
      byAssetClass[h.assetClass] = (byAssetClass[h.assetClass] ?? 0) + h.currentValue;

      const etf = getEtfConstituents(ticker);
      if (etf) {
        applyEtfBreakdown(etf, h.currentValue, addSource);
        const prior = covered.get(ticker);
        if (prior) prior.etfValue += h.currentValue;
        else {
          covered.set(ticker, {
            etfTicker: etf.ticker,
            etfName: etf.name,
            etfValue: h.currentValue,
            coverage: coverageOf(etf),
          });
        }
        totalEtfValueCovered += h.currentValue;
        continue;
      }

      // Not a known ETF — treat the holding as a direct stake in itself.
      // (If it's an unknown ETF it'll look like a direct stock — acceptable for v1;
      //  we surface the unknown-ETF list separately.)
      if (looksLikeEtfTicker(ticker)) {
        uncovered.set(ticker, (uncovered.get(ticker) ?? 0) + h.currentValue);
      }

      addSource(
        { ticker, name: h.name || ticker },
        {
          kind: 'direct',
          via: ticker,
          value: h.currentValue,
          assetClass: h.assetClass,
          conviction: h.conviction,
        },
      );
    }
  }

  const exposures: UnderlyingExposure[] = Array.from(agg.values())
    .map(a => ({
      ticker: a.ticker,
      name: a.name,
      totalValue: a.totalValue,
      portfolioPct: totalPortfolioValue > 0 ? (a.totalValue / totalPortfolioValue) * 100 : 0,
      directValue: a.directValue,
      etfValue: a.etfValue,
      sources: a.sources.sort((x, y) => y.value - x.value),
      sourceCount: a.sources.length,
      hasConviction: a.sources.some(s => s.conviction === true),
    }))
    .sort((x, y) => y.totalValue - x.totalValue);

  return {
    exposures,
    coveredEtfs: Array.from(covered.values()).sort((a, b) => b.etfValue - a.etfValue),
    uncoveredEtfs: Array.from(uncovered.entries())
      .map(([ticker, value]) => ({ ticker, value }))
      .sort((a, b) => b.value - a.value),
    totalPortfolioValue,
    totalEtfValueCovered,
    byAssetClass,
  };
}

function applyEtfBreakdown(
  etf: EtfConstituents,
  etfValue: number,
  addSource: (stock: { ticker: string; name: string }, s: ExposureSource) => void,
) {
  for (const holding of etf.topHoldings) {
    const contribution = etfValue * holding.weight;
    if (contribution < 0.01) continue;
    addSource(
      { ticker: holding.ticker, name: holding.name },
      {
        kind: 'etf',
        via: etf.ticker,
        viaName: etf.name,
        value: contribution,
        weight: holding.weight,
      },
    );
  }
}

function coverageOf(etf: EtfConstituents): number {
  return etf.topHoldings.reduce((sum, h) => sum + h.weight, 0);
}

/** Heuristic: 3–4 uppercase letters often indicates an ETF ticker. Not reliable, only used for the
 *  "these ETFs aren't in our constituent table" hint. */
function looksLikeEtfTicker(ticker: string): boolean {
  if (!/^[A-Z]{2,5}$/.test(ticker)) return false;
  // Common ETF suffixes/prefixes
  return /^(X|I|V|SCH|SPY|QQQ|ARK|IWM|DIA)/.test(ticker);
}

/** True if every direct source is a plain stock (or there are no direct sources). Used by the
 *  "Stocks Only" filter to hide crypto and wrapper holdings (mutual funds, uncovered ETFs). */
export function isStockOnly(exp: UnderlyingExposure): boolean {
  return exp.sources.every(s => s.kind !== 'direct' || s.assetClass === 'stock');
}

export interface Concentration {
  ticker: string;
  name: string;
  totalValue: number;
  portfolioPct: number;
  fundCount: number;
  funds: string[];
  message: string;
  /** True when any direct source was flagged conviction — the concentration is still worth surfacing,
   *  but the messaging should acknowledge it's intentional rather than prompting a trim. */
  hasConviction?: boolean;
}

/** Return stocks that appear in ≥2 funds (or direct + ≥1 fund) AND represent ≥1% of portfolio. */
export function findHiddenConcentrations(report: XrayReport): Concentration[] {
  const out: Concentration[] = [];
  for (const exp of report.exposures) {
    const etfSources = exp.sources.filter(s => s.kind === 'etf');
    const hasDirect = exp.sources.some(s => s.kind === 'direct');
    const fundCount = etfSources.length + (hasDirect ? 1 : 0);
    if (fundCount < 2) continue;
    if (exp.portfolioPct < 1) continue;
    const funds = [
      ...(hasDirect ? ['Direct'] : []),
      ...etfSources.map(s => s.via),
    ];
    const convictionTail = exp.hasConviction ? ' — flagged as a conviction hold, so this is intentional.' : '';
    const message = hasDirect
      ? `Owned directly plus inside ${etfSources.length} fund${etfSources.length === 1 ? '' : 's'} — total ${exp.portfolioPct.toFixed(1)}% of portfolio.${convictionTail}`
      : `Held across ${etfSources.length} funds — total ${exp.portfolioPct.toFixed(1)}% of portfolio.${convictionTail}`;
    out.push({
      ticker: exp.ticker,
      name: exp.name,
      totalValue: exp.totalValue,
      portfolioPct: exp.portfolioPct,
      fundCount,
      funds,
      message,
      hasConviction: exp.hasConviction,
    });
  }
  return out.sort((a, b) => b.portfolioPct - a.portfolioPct);
}
