import { getGenAI } from './gemini';
import type { Account } from '../types/portfolio';
import { getSector, calculateTotalValue } from '../utils/calculations';
import { saveMarketReport, loadMarketReport } from '../stores/portfolioStore';
// NOTE: uses same Gemini instance as gemini.ts (getGenAI()). Requires API key set in Settings.

// ─── Types ───

export type HoldingSentiment = 'bullish' | 'bearish' | 'neutral';
export type MarketSentiment = 'risk-on' | 'risk-off' | 'mixed';

export interface HoldingAnalysis {
  ticker: string;
  name: string;
  sentiment: HoldingSentiment;
  verdict: string; // one-line buy/sell/hold
  reasoning: string; // 2-3 sentences with market context
  catalysts: string[]; // upcoming events or drivers
  risk: string; // key risk to watch
  currentValue: number;
}

export interface MarketOpportunity {
  ticker: string;
  name: string;
  sector: string;
  reasoning: string;
  relevance: string;
}

export interface AllocationAdvice {
  action: 'increase' | 'decrease' | 'start' | 'stop';
  ticker: string;
  name: string;
  reasoning: string;
  priority: 1 | 2 | 3;
}

export interface MarketOverview {
  summary: string; // 2-3 sentence market summary
  sentiment: MarketSentiment;
  keyEvents: string[]; // 3-5 key macro events
  sectorRotation: string; // what's moving and why
}

export interface MarketIntelligenceReport {
  overview: MarketOverview;
  holdings: HoldingAnalysis[];
  topOpportunity: string;
  topRisk: string;
  opportunities: MarketOpportunity[];
  monthlyAllocationAdvice: AllocationAdvice[];
  generatedAt: string;
}

// ─── Cache ───

let cachedReport: MarketIntelligenceReport | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export function getCachedReport(): MarketIntelligenceReport | null {
  if (cachedReport && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedReport;
  }
  return null;
}

/** Load report from IndexedDB (async — use on mount) */
export async function loadPersistedReport(): Promise<MarketIntelligenceReport | null> {
  // Check memory cache first
  if (cachedReport && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedReport;
  }
  // Fall back to IndexedDB
  const stored = await loadMarketReport();
  if (stored && typeof stored === 'object' && (stored as any).generatedAt) {
    const report = stored as MarketIntelligenceReport;
    // Hydrate in-memory cache so subsequent sync reads work
    cachedReport = report;
    cacheTimestamp = new Date(report.generatedAt).getTime();
    return report;
  }
  return null;
}

export function clearMarketCache(): void {
  cachedReport = null;
  cacheTimestamp = 0;
}

// ─── Helpers ───

/** Get unique investable tickers from accounts (skip cash, money market, unknown) */
function getInvestableTickers(accounts: Account[]): { ticker: string; name: string; value: number; sector: string }[] {
  const SKIP = new Set(['CASH', 'UNKNOWN', 'USD', 'SPAXX', 'FDRXX', 'VMFXX', 'DGCXX', 'VTRS2045']);
  const tickerMap = new Map<string, { ticker: string; name: string; value: number; sector: string }>();

  for (const account of accounts) {
    if (account.type === 'bank') continue;
    for (const holding of account.holdings) {
      if (SKIP.has(holding.ticker) || holding.currentValue < 50) continue;
      const existing = tickerMap.get(holding.ticker);
      if (existing) {
        existing.value += holding.currentValue;
      } else {
        tickerMap.set(holding.ticker, {
          ticker: holding.ticker,
          name: holding.name,
          value: holding.currentValue,
          sector: getSector(holding.ticker),
        });
      }
    }
  }

  return Array.from(tickerMap.values()).sort((a, b) => b.value - a.value);
}

// ─── Main API ───

export async function generateMarketIntelligence(
  accounts: Account[],
  onProgress?: (stage: string) => void,
): Promise<MarketIntelligenceReport> {
  // Return cache if fresh
  const cached = getCachedReport();
  if (cached) return cached;

  const genAI = getGenAI();
  if (!genAI) throw new Error('Gemini not initialized. Add your API key in Settings.');

  const holdings = getInvestableTickers(accounts);
  if (holdings.length === 0) throw new Error('No holdings to analyze. Add positions to your portfolio first.');

  const totalValue = calculateTotalValue(accounts);

  onProgress?.('Scanning markets for your holdings...');

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: `You are a market intelligence engine analyzing a personal portfolio. Return ONLY valid JSON matching the exact schema requested. No markdown fences, no explanation outside the JSON. Use current market data from web search to ground your analysis in real events.`,
  });

  // Build the holdings list for the prompt
  const holdingsList = holdings
    .slice(0, 20) // cap at top 20 by value
    .map(h => `- ${h.ticker} (${h.name}): $${h.value.toLocaleString()} — ${h.sector}`)
    .join('\n');

  const currentTickers = holdings.map(h => h.ticker);
  const tickerListStr = currentTickers.join(', ');

  const prompt = `Analyze this investor's portfolio holdings using current market data. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

PORTFOLIO (total ~$${Math.round(totalValue).toLocaleString()}):
${holdingsList}

CURRENT TICKERS OWNED: ${tickerListStr}

The investor DCA's approximately $2,000-$6,000 per month across their holdings.

Return a JSON object with this EXACT structure:
{
  "overview": {
    "summary": "2-3 sentence market summary focused on what matters for THIS portfolio",
    "sentiment": "risk-on" | "risk-off" | "mixed",
    "keyEvents": ["event1", "event2", "event3"],
    "sectorRotation": "1-2 sentences on sector trends relevant to holdings"
  },
  "holdings": [
    {
      "ticker": "SOXQ",
      "sentiment": "bullish" | "bearish" | "neutral",
      "verdict": "short one-line verdict like 'Hold — semiconductor cycle strengthening'",
      "reasoning": "2-3 sentences grounded in current news/data about why",
      "catalysts": ["catalyst1", "catalyst2"],
      "risk": "key risk in 1 sentence"
    }
  ],
  "topOpportunity": "single best opportunity sentence for this portfolio right now",
  "topRisk": "single biggest risk sentence for this portfolio right now",
  "opportunities": [
    {"ticker": "XLV", "name": "Health Care SPDR", "sector": "Healthcare", "reasoning": "2-3 sentences on why this is a good buy now with current market data", "relevance": "1 sentence on what portfolio gap this fills"}
  ],
  "monthlyAllocationAdvice": [
    {"action": "decrease", "ticker": "SOXQ", "name": "Invesco PHLX Semiconductor", "reasoning": "2-3 sentences on why to change this allocation now", "priority": 1}
  ]
}

RULES:
- Include analysis for EVERY ticker listed above
- Ground analysis in CURRENT market data — use specific numbers, dates, events
- Be opinionated — have a take, don't hedge with "it depends"
- For crypto (BTC, SOL, etc.), analyze the crypto market conditions
- "verdict" should be actionable: Buy more / Hold / Trim / Sell
- "opportunities" is REQUIRED and MUST contain EXACTLY 3–5 tickers the investor does NOT currently own but should consider. They MUST NOT appear in the CURRENT TICKERS OWNED list, AND MUST NOT duplicate any ticker you already used with action "start" in monthlyAllocationAdvice (those are already covered as DCA actions — opportunities should surface DIFFERENT ideas). Include reasoning grounded in current market data and explain what portfolio gap each one fills (e.g. missing sector exposure, defensive hedge, income, international diversification). Never return fewer than 3 — if the portfolio looks complete, suggest defensive/income/international/bond/commodity exposure that broadens it.
- "monthlyAllocationAdvice" is REQUIRED and MUST contain EXACTLY 3 changes to their monthly DCA allocation, sorted by priority (1 = most urgent). action is one of: increase, decrease, start, stop. "start" means begin DCA into a new position. "stop" means pause DCA into an existing one. Tickers here CAN be ones they already own (for increase/decrease/stop) or new ones (for start). NEVER return fewer than 3 — always find 3 things worth changing even if small. Treat empty advice as a failure.
- Be specific about dollar amounts or percentages when suggesting changes (e.g. "shift $500/mo from SOXQ to XLV") so the investor can act immediately.
- Keep it concise — this is a dashboard, not a research report
- Return ONLY the JSON object, no other text`;

  const callWithRetry = async (attempt = 0): Promise<MarketIntelligenceReport> => {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 8192,
        },
        tools: [{ googleSearch: {} } as any],
      });

      const text = result.response.text().trim();
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      // Map parsed data to our typed structure
      const report: MarketIntelligenceReport = {
        overview: {
          summary: parsed.overview?.summary || 'Market data unavailable.',
          sentiment: (['risk-on', 'risk-off', 'mixed'].includes(parsed.overview?.sentiment) ? parsed.overview.sentiment : 'mixed') as MarketSentiment,
          keyEvents: Array.isArray(parsed.overview?.keyEvents) ? parsed.overview.keyEvents.slice(0, 5) : [],
          sectorRotation: parsed.overview?.sectorRotation || '',
        },
        holdings: (Array.isArray(parsed.holdings) ? parsed.holdings : []).map((h: any) => {
          const match = holdings.find(orig => orig.ticker === h.ticker);
          return {
            ticker: h.ticker || '??',
            name: match?.name || h.ticker || 'Unknown',
            sentiment: (['bullish', 'bearish', 'neutral'].includes(h.sentiment) ? h.sentiment : 'neutral') as HoldingSentiment,
            verdict: h.verdict || 'No verdict',
            reasoning: h.reasoning || '',
            catalysts: Array.isArray(h.catalysts) ? h.catalysts.slice(0, 3) : [],
            risk: h.risk || '',
            currentValue: match?.value || 0,
          };
        }),
        topOpportunity: parsed.topOpportunity || '',
        topRisk: parsed.topRisk || '',
        opportunities: (Array.isArray(parsed.opportunities) ? parsed.opportunities : []).map((o: any) => ({
          ticker: o.ticker || '??',
          name: o.name || o.ticker || 'Unknown',
          sector: o.sector || 'Unknown',
          reasoning: o.reasoning || '',
          relevance: o.relevance || '',
        })),
        monthlyAllocationAdvice: (Array.isArray(parsed.monthlyAllocationAdvice) ? parsed.monthlyAllocationAdvice : []).map((a: any) => ({
          action: (['increase', 'decrease', 'start', 'stop'].includes(a.action) ? a.action : 'increase') as AllocationAdvice['action'],
          ticker: a.ticker || '??',
          name: a.name || a.ticker || 'Unknown',
          reasoning: a.reasoning || '',
          priority: ([1, 2, 3].includes(a.priority) ? a.priority : 3) as AllocationAdvice['priority'],
        })),
        generatedAt: new Date().toISOString(),
      };

      // Cache the result in memory + persist to IndexedDB
      cachedReport = report;
      cacheTimestamp = Date.now();
      saveMarketReport(report).catch(() => {}); // fire-and-forget persist

      return report;
    } catch (error: any) {
      if (error.message?.includes('429') && attempt < 2) {
        onProgress?.('Rate limited — retrying...');
        const delay = Math.min(15000, (attempt + 1) * 8000);
        await new Promise(r => setTimeout(r, delay));
        return callWithRetry(attempt + 1);
      }
      if (error instanceof SyntaxError) {
        throw new Error('Failed to parse market data from Gemini. Try refreshing.');
      }
      throw error;
    }
  };

  return callWithRetry();
}
