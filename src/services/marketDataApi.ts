/**
 * Market Data API — Real price feeds, 100% free, zero sign-ups
 *
 * - Stocks/ETFs → Yahoo Finance via Vite dev proxy (free, no key)
 * - Crypto → CoinGecko (free, no key)
 *
 * Both sources provide real market data without any API keys.
 * Gemini-based price lookup kept as last-resort fallback.
 */

import type { Account } from '../types/portfolio';

export interface PriceResult {
  ticker: string;
  price: number;
  change?: number;  // daily percent change
  source: 'yahoo' | 'coingecko' | 'gemini';
}

// ─── Ticker Classification ───

const SKIP_TICKERS = new Set(['CASH', 'UNKNOWN', 'USD', 'SPAXX', 'FDRXX', 'VMFXX', 'DGCXX', 'VTRS2045']);

// Map of crypto tickers to CoinGecko IDs
const CRYPTO_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  ADA: 'cardano',
  DOT: 'polkadot',
  DOGE: 'dogecoin',
  SHIB: 'shiba-inu',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  LINK: 'chainlink',
  XRP: 'ripple',
  LTC: 'litecoin',
  ATOM: 'cosmos',
  UNI: 'uniswap',
  NEAR: 'near',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  SUI: 'sui',
  SEI: 'sei-network',
  RENDER: 'render-token',
  GRT: 'the-graph',
  FIL: 'filecoin',
  INJ: 'injective-protocol',
};

function isCrypto(ticker: string): boolean {
  return ticker.toUpperCase() in CRYPTO_MAP;
}

function isSkipTicker(ticker: string): boolean {
  return SKIP_TICKERS.has(ticker.toUpperCase());
}

// ─── CoinGecko (free, no key) ───

async function fetchCryptoPrices(tickers: string[]): Promise<PriceResult[]> {
  if (tickers.length === 0) return [];

  const ids = tickers
    .map(t => CRYPTO_MAP[t.toUpperCase()])
    .filter(Boolean);

  if (ids.length === 0) return [];

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}: ${res.statusText}`);
    const data = await res.json();

    const results: PriceResult[] = [];
    for (const ticker of tickers) {
      const cgId = CRYPTO_MAP[ticker.toUpperCase()];
      if (cgId && data[cgId]) {
        results.push({
          ticker: ticker.toUpperCase(),
          price: data[cgId].usd,
          change: data[cgId].usd_24h_change != null
            ? Math.round(data[cgId].usd_24h_change * 100) / 100
            : undefined,
          source: 'coingecko',
        });
      }
    }
    return results;
  } catch (err) {
    console.error('[marketData] CoinGecko fetch failed:', err);
    return [];
  }
}

// ─── Yahoo Finance via Vite Proxy (free, no key) ───

/**
 * Fetch multiple stock/ETF prices in a single Yahoo Finance batch call.
 * Uses the Vite dev proxy at /api/yf to avoid CORS.
 * Yahoo's quote endpoint accepts comma-separated symbols.
 */
async function fetchStockPrices(tickers: string[]): Promise<PriceResult[]> {
  if (tickers.length === 0) return [];

  const results: PriceResult[] = [];

  // Yahoo supports batching via comma-separated symbols in the chart endpoint
  // But the most reliable batch approach is the quote summary endpoint
  // We'll batch in groups of 10 via individual chart calls for reliability
  const BATCH_SIZE = 5;
  const BATCH_DELAY = 200; // small delay between batches

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    // Fetch batch in parallel
    const batchPromises = batch.map(async (ticker) => {
      try {
        const url = `/api/yf/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();

        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta || !meta.regularMarketPrice) return null;

        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose || meta.previousClose;
        const change = prevClose && prevClose > 0
          ? Math.round(((price - prevClose) / prevClose) * 10000) / 100
          : undefined;

        return {
          ticker: ticker.toUpperCase(),
          price,
          change,
          source: 'yahoo' as const,
        };
      } catch {
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    for (const r of batchResults) {
      if (r) results.push(r);
    }

    // Small delay between batches
    if (i + BATCH_SIZE < tickers.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  return results;
}

// ─── Main API ───

/**
 * Refresh all portfolio prices using free market data APIs.
 * - Crypto → CoinGecko (free, no key)
 * - Stocks/ETFs → Yahoo Finance via proxy (free, no key)
 * - Fallback → Gemini (if configured)
 */
export async function refreshAllPrices(
  accounts: Account[],
  onProgress?: (stage: string) => void,
): Promise<PriceResult[]> {
  // Collect unique tickers
  const stockTickers = new Set<string>();
  const cryptoTickers = new Set<string>();

  for (const account of accounts) {
    for (const holding of account.holdings) {
      if (holding.shares <= 0 || isSkipTicker(holding.ticker)) continue;
      const t = holding.ticker.toUpperCase();
      if (isCrypto(t) || holding.assetClass === 'crypto') {
        cryptoTickers.add(t);
      } else if (holding.assetClass !== 'cash') {
        stockTickers.add(t);
      }
    }
  }

  const allResults: PriceResult[] = [];

  // Fetch crypto prices (always available — no key needed)
  if (cryptoTickers.size > 0) {
    onProgress?.(`Fetching ${cryptoTickers.size} crypto prices...`);
    const cryptoResults = await fetchCryptoPrices(Array.from(cryptoTickers));
    allResults.push(...cryptoResults);
  }

  // Fetch stock prices via Yahoo Finance
  if (stockTickers.size > 0) {
    onProgress?.(`Fetching ${stockTickers.size} stock/ETF prices...`);
    const stockResults = await fetchStockPrices(Array.from(stockTickers).sort());

    if (stockResults.length > 0) {
      allResults.push(...stockResults);
    } else {
      // Yahoo failed entirely — fall back to Gemini if available
      onProgress?.('Yahoo unavailable — trying Gemini fallback...');
      try {
        const { refreshPortfolioPrices: geminiRefresh } = await import('./priceRefresh');
        const geminiResults = await geminiRefresh(accounts);
        for (const r of geminiResults) {
          allResults.push({ ...r, source: 'gemini' });
        }
      } catch (err) {
        console.error('[marketData] All price sources failed:', err);
      }
    }
  }

  onProgress?.(`Updated ${allResults.length} prices`);
  return allResults;
}

/**
 * Fetch live prices for an arbitrary list of tickers — used by surfaces like
 * the Conviction Watchlist where the ticker isn't necessarily in the portfolio.
 * Routes crypto tickers to CoinGecko and the rest to Yahoo; returns whatever
 * succeeds without throwing on partial failure.
 */
export async function fetchPricesForTickers(tickers: string[]): Promise<PriceResult[]> {
  const unique = Array.from(new Set(tickers.map((t) => t.toUpperCase()))).filter(
    (t) => !isSkipTicker(t),
  );
  if (unique.length === 0) return [];

  const cryptoTickers = unique.filter(isCrypto);
  const stockTickers = unique.filter((t) => !isCrypto(t));

  const results: PriceResult[] = [];
  if (cryptoTickers.length > 0) {
    try { results.push(...(await fetchCryptoPrices(cryptoTickers))); } catch { /* partial OK */ }
  }
  if (stockTickers.length > 0) {
    try { results.push(...(await fetchStockPrices(stockTickers))); } catch { /* partial OK */ }
  }
  return results;
}

/**
 * Apply fetched prices to account holdings.
 * Recalculates currentValue, gainLoss, gainLossPercent, and account totalValue.
 */
export function applyPricesToAccounts(accounts: Account[], prices: PriceResult[]): Account[] {
  const priceMap = new Map<string, PriceResult>();
  for (const p of prices) {
    priceMap.set(p.ticker.toUpperCase(), p);
  }

  const now = new Date().toISOString().split('T')[0];

  return accounts.map(account => {
    let accountChanged = false;
    const updatedHoldings = account.holdings.map(holding => {
      const priceData = priceMap.get(holding.ticker.toUpperCase());
      if (!priceData || holding.shares <= 0) return holding;

      const newValue = Math.round(holding.shares * priceData.price);
      const costBasisTotal = holding.shares * holding.avgCostBasis;
      const gainLoss = newValue - costBasisTotal;
      const gainLossPercent = costBasisTotal > 0 ? (gainLoss / costBasisTotal) * 100 : 0;

      accountChanged = true;
      return {
        ...holding,
        currentPrice: priceData.price,
        currentValue: newValue,
        totalGainLoss: Math.round(gainLoss),
        totalGainLossPercent: Math.round(gainLossPercent * 10) / 10,
        lastUpdated: now,
      };
    });

    if (!accountChanged) return account;

    return {
      ...account,
      holdings: updatedHoldings,
      totalValue: updatedHoldings.reduce((sum, h) => sum + h.currentValue, 0),
      lastUpdated: now,
    };
  });
}
