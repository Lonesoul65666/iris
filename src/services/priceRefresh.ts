import { getGenAI } from './gemini';
import type { Account } from '../types/portfolio';

export interface PriceResult {
  ticker: string;
  price: number;
  change?: number;
}

// Tickers to skip — not real market securities
const SKIP_TICKERS = new Set(['CASH', 'UNKNOWN', 'USD', 'SPAXX', 'FDRXX', 'VMFXX', 'DGCXX', 'VTRS2045']);

// Common crypto tickers to exclude
const CRYPTO_TICKERS = new Set([
  'BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'DOGE', 'SHIB', 'AVAX', 'MATIC', 'LINK',
  'UNI', 'ATOM', 'XRP', 'LTC', 'BCH', 'FIL', 'NEAR', 'APT', 'ARB', 'OP',
  'AAVE', 'MKR', 'CRV', 'SNX', 'COMP', 'SUSHI', 'YFI', 'BAL', 'RUNE', 'INJ',
  'FTM', 'ALGO', 'XLM', 'VET', 'HBAR', 'ICP', 'SAND', 'MANA', 'AXS', 'ENJ',
  'GALA', 'CHZ', 'JASMY', 'ROSE', 'ZEC', 'DASH', 'XMR', 'EOS', 'XTZ', 'EGLD',
  'RENDER', 'GRT', 'TIA', 'SUI', 'SEI', 'PYTH', 'JUP', 'WIF', 'BONK', 'PEPE',
]);

function isLookupTicker(ticker: string, assetClass: string): boolean {
  if (!ticker || SKIP_TICKERS.has(ticker.toUpperCase())) return false;
  if (CRYPTO_TICKERS.has(ticker.toUpperCase())) return false;
  if (assetClass === 'crypto' || assetClass === 'cash') return false;
  return true;
}

/**
 * Uses Gemini with Google Search grounding to fetch current market prices
 * for all unique stock/ETF/mutual fund tickers across all accounts.
 */
export async function refreshPortfolioPrices(accounts: Account[]): Promise<PriceResult[]> {
  const genAI = getGenAI();
  if (!genAI) {
    throw new Error('Gemini not initialized. Add your API key in Settings.');
  }

  // Collect unique tickers that are real market securities with shares > 0
  const tickerSet = new Set<string>();
  for (const account of accounts) {
    for (const holding of account.holdings) {
      if (holding.shares > 0 && isLookupTicker(holding.ticker, holding.assetClass)) {
        tickerSet.add(holding.ticker.toUpperCase());
      }
    }
  }

  const tickers = Array.from(tickerSet).sort();
  if (tickers.length === 0) return [];

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-preview-05-20',
    systemInstruction: 'Return ONLY valid JSON, no markdown, no explanation.',
  });

  // Batch into groups of ~30 to avoid overly long prompts
  const BATCH_SIZE = 30;
  const allResults: PriceResult[] = [];

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const prompt = `Look up the current stock/ETF market prices for these tickers: ${batch.join(', ')}

Return a JSON array where each element has:
- "ticker": the ticker symbol (string)
- "price": the current market price in USD (number)
- "change": the daily percent change if available (number, e.g. -1.5 for down 1.5%), or null

Example format: [{"ticker":"AAPL","price":185.50,"change":1.2},{"ticker":"VOO","price":420.30,"change":-0.3}]

Return ONLY the JSON array. No markdown fences, no explanation.`;

    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 2048,
        },
        tools: [{ googleSearch: {} } as any],
      });

      const text = result.response.text().trim();
      // Strip markdown code fences if present
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.ticker && typeof item.price === 'number' && item.price > 0) {
            allResults.push({
              ticker: String(item.ticker).toUpperCase(),
              price: item.price,
              change: typeof item.change === 'number' ? item.change : undefined,
            });
          }
        }
      }
    } catch (err) {
      console.error(`[priceRefresh] Failed to fetch prices for batch starting at ${batch[0]}:`, err);
      // Continue with next batch — don't let one failure kill the whole refresh
    }
  }

  return allResults;
}

/**
 * Applies fetched prices to account holdings, recalculating currentValue,
 * totalGainLoss, totalGainLossPercent, and account totalValue.
 */
export function applyPricesToAccounts(accounts: Account[], prices: PriceResult[]): Account[] {
  const priceMap = new Map<string, number>();
  for (const p of prices) {
    priceMap.set(p.ticker.toUpperCase(), p.price);
  }

  const now = new Date().toISOString().split('T')[0];

  return accounts.map(account => {
    let accountChanged = false;
    const updatedHoldings = account.holdings.map(holding => {
      const price = priceMap.get(holding.ticker.toUpperCase());
      if (price === undefined || holding.shares <= 0) return holding;

      const newValue = Math.round(holding.shares * price);
      const costBasisTotal = holding.shares * holding.avgCostBasis;
      const gainLoss = newValue - costBasisTotal;
      const gainLossPercent = costBasisTotal > 0 ? (gainLoss / costBasisTotal) * 100 : 0;

      accountChanged = true;
      return {
        ...holding,
        currentPrice: price,
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
