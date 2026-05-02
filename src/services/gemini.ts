import { GoogleGenerativeAI, type GenerateContentRequest } from '@google/generative-ai';
import type { Account, EquityProfile, UserProfile } from '../types/portfolio';
import type { BudgetBucket, SinkingFund, FunMoney, PaycheckBreakdown } from '../types/budget';
import type { ActionItem } from '../components/ActionItems/ActionItems';
import type { ChatMessage as LLMChatMessage } from '../types/llm';
import { calculateSectorAllocation, calculateTechConcentration, formatCurrency } from '../utils/calculations';

let genAI: GoogleGenerativeAI | null = null;

export function initGemini(apiKey: string): void {
  genAI = new GoogleGenerativeAI(apiKey);
}

export function isGeminiInitialized(): boolean {
  return genAI !== null;
}

export function getGenAI(): GoogleGenerativeAI | null {
  return genAI;
}

export interface BudgetContext {
  buckets?: BudgetBucket[];
  sinkingFunds?: SinkingFund[];
  funMoney?: FunMoney[];
  paycheck?: PaycheckBreakdown;
  actionItems?: ActionItem[];
  spendingSummary?: { avgMonthlyExpenses: number; avgMonthlyIncome: number; topCategories: { label: string; avgMonthly: number }[] };
  insights?: { title: string; description: string; severity: string }[];
}

export function buildPortfolioContext(accounts: Account[], equity?: EquityProfile, profile?: UserProfile, budget?: BudgetContext): string {
  const totalValue = accounts.reduce((s, a) => s + a.totalValue, 0);
  const allocations = calculateSectorAllocation(accounts);
  const techPct = calculateTechConcentration(accounts);

  let ctx = `## User Profile\n`;
  if (profile) {
    ctx += `- Name: ${profile.name}, Age: ${profile.age}, Spouse age: ${profile.spouseAge}\n`;
    ctx += `- Income: ${formatCurrency(profile.annualIncome)}/year, State: ${profile.state} (no state income tax)\n`;
    ctx += `- Tax bracket: ${profile.taxBracket}%, Risk tolerance: ${profile.riskTolerance}\n`;
    ctx += `- Retirement target: age ${profile.retirementAge} (${profile.retirementAge - profile.age} years)\n`;
    ctx += `- Monthly investment: ${formatCurrency(profile.monthlyInvestment)}\n`;
    ctx += `- Mortgage: ~$401,866 at 3.5% — do NOT recommend paying down early\n\n`;
  }

  ctx += `## Portfolio (Total liquid: ${formatCurrency(totalValue)})\n\n`;

  for (const account of accounts) {
    ctx += `### ${account.name} (${account.institution}) — ${formatCurrency(account.totalValue)}\n`;
    for (const h of account.holdings) {
      ctx += `- ${h.ticker}: ${h.name} — ${formatCurrency(h.currentValue)}`;
      if (h.totalGainLossPercent !== 0) ctx += ` (${h.totalGainLossPercent > 0 ? '+' : ''}${h.totalGainLossPercent.toFixed(1)}%)`;
      if (h.conviction) ctx += ` [CONVICTION HOLD${h.convictionNote ? `: ${h.convictionNote}` : ''}]`;
      if (h.notes) ctx += ` [NOTE: ${h.notes}]`;
      ctx += `\n`;
    }
    ctx += `\n`;
  }

  // Surface conviction list explicitly so the model can't miss it.
  const convictionHoldings = accounts.flatMap(a => a.holdings.filter(h => h.conviction));
  if (convictionHoldings.length > 0) {
    ctx += `## Conviction Holds (user-marked — DO NOT suggest trimming/selling/rotating out)\n`;
    for (const h of convictionHoldings) {
      ctx += `- ${h.ticker} (${h.name}) — ${formatCurrency(h.currentValue)}${h.convictionNote ? ` — ${h.convictionNote}` : ''}\n`;
    }
    ctx += `\n`;
  }

  ctx += `## Sector Allocation\n`;
  for (const a of allocations.slice(0, 10)) {
    ctx += `- ${a.sector}: ${formatCurrency(a.value)} (${a.percentage.toFixed(1)}%)\n`;
  }
  ctx += `- Estimated total tech exposure (including indirect): ~${techPct.toFixed(0)}%\n\n`;

  if (equity) {
    ctx += `## Company Equity (${equity.company})\n`;
    ctx += `- Current FMV: $${equity.currentFMV}/share\n`;
    ctx += `- Total shares (all grants): ${equity.totalShares}\n`;
    ctx += `- Total estimated value: ${formatCurrency(equity.totalCurrentValue)}\n`;
    ctx += `- ARR: ${formatCurrency(equity.estimatedARR)}, IPO expected ~2027\n`;
    for (const g of equity.grants) {
      ctx += `- ${g.grantName}: ${g.totalShares} shares (${g.type.toUpperCase()})`;
      if (g.exercisedShares > 0) ctx += `, ${g.exercisedShares} exercised`;
      if (g.exercisableShares > 0) ctx += `, ${g.exercisableShares} exercisable at $${g.strikePrice}`;
      if (g.outstandingShares > 0 && g.type === 'rsu') ctx += `, ${g.outstandingShares} outstanding`;
      ctx += `\n`;
    }
    ctx += `\n`;
  }

  // Dynamic key issues based on current data
  ctx += `## Key Issues Identified\n`;
  const issues: string[] = [];

  // Tech concentration
  if (techPct > 60) issues.push(`~${techPct.toFixed(0)}% tech/semiconductor concentration — very high`);

  // Duplicate semiconductor bets
  const allTickers = accounts.flatMap(a => a.holdings.map(h => h.ticker));
  if (allTickers.includes('SOXQ') && allTickers.includes('SMH')) issues.push('SOXQ and SMH are duplicate semiconductor bets');

  // Cash drag
  let lowYieldCash = 0;
  for (const acct of accounts) {
    if (acct.type === 'bank') {
      for (const h of acct.holdings) {
        if (h.ticker === 'CASH' && (h.name.includes('Savings') || h.name.includes('Joint') || h.name.includes('Stuffs'))) {
          lowYieldCash += h.currentValue;
        }
      }
    }
  }
  if (lowYieldCash > 20000) issues.push(`~${formatCurrency(lowYieldCash)} in low-yield bank accounts (losing ~${formatCurrency(lowYieldCash * 0.042)}/yr in opportunity cost)`);

  // 401k
  if (profile && profile.annualIncome > 200000) issues.push('Not maxing 401k ($23,500 limit) or backdoor Roth IRAs ($14k/yr for couple)');

  // ISOs
  if (equity) {
    const exercisable = equity.grants.reduce((s, g) => s + g.exercisableShares, 0);
    if (exercisable > 0) {
      const minStrike = Math.min(...equity.grants.filter(g => g.exercisableShares > 0).map(g => g.strikePrice));
      issues.push(`${exercisable.toLocaleString()} ISOs exercisable at $${minStrike} — exercise before IPO for LTCG treatment`);
    }
  }

  // Dead weight crypto
  const deadWeight = accounts.flatMap(a => a.holdings).filter(h => h.currentValue < 500 && h.currentValue > 0 && h.assetClass === 'crypto' && !['BTC', 'ETH', 'SOL'].includes(h.ticker));
  if (deadWeight.length > 0) {
    const total = deadWeight.reduce((s, h) => s + h.currentValue, 0);
    issues.push(`${deadWeight.map(h => h.ticker).join('/')} are dead weight (~${formatCurrency(total)} total)`);
  }

  // Unknown holdings
  const unknowns = accounts.flatMap(a => a.holdings).filter(h => h.ticker === 'UNKNOWN' || h.name.includes('Unknown'));
  if (unknowns.length > 0) issues.push("Claire's 401k fund details unknown — can't evaluate allocation");

  for (const issue of issues) ctx += `- ${issue}\n`;

  // Budget context
  if (budget) {
    ctx += `\n## Budget & Cash Flow\n`;
    if (budget.paycheck) {
      ctx += `- Gross monthly: ${formatCurrency(budget.paycheck.grossMonthly)}\n`;
      ctx += `- Net take-home: ${formatCurrency(budget.paycheck.netTakeHome)}\n`;
      ctx += `- 401k contribution: ${formatCurrency(budget.paycheck.retirement401k)}/mo\n`;
    }
    if (budget.buckets) {
      const totalBudgeted = budget.buckets.reduce((s, b) => s + b.monthlyBudget, 0);
      const totalActual = budget.buckets.reduce((s, b) => s + b.monthlyActual, 0);
      const overBudget = budget.buckets.filter(b => b.monthlyActual > b.monthlyBudget && b.monthlyBudget > 0);
      ctx += `- Total monthly budget: ${formatCurrency(totalBudgeted)}, Actual: ${formatCurrency(totalActual)}\n`;
      if (overBudget.length > 0) ctx += `- Over budget in: ${overBudget.map(b => `${b.label} (+${formatCurrency(b.monthlyActual - b.monthlyBudget)})`).join(', ')}\n`;
    }
    if (budget.sinkingFunds) {
      const totalContributions = budget.sinkingFunds.reduce((s, f) => s + f.monthlyContribution, 0);
      ctx += `- Sinking fund contributions: ${formatCurrency(totalContributions)}/mo\n`;
      for (const sf of budget.sinkingFunds) {
        const pct = sf.targetAmount > 0 ? ((sf.currentBalance / sf.targetAmount) * 100).toFixed(0) : '0';
        ctx += `  - ${sf.name}: ${formatCurrency(sf.currentBalance)}/${formatCurrency(sf.targetAmount)} (${pct}%)\n`;
      }
    }
    if (budget.funMoney) {
      for (const fm of budget.funMoney) {
        ctx += `- ${fm.person} fun money: ${formatCurrency(fm.monthlySpent)}/${formatCurrency(fm.monthlyBudget)} spent\n`;
      }
    }
    if (budget.spendingSummary) {
      ctx += `\n## Spending Analysis (from imported transactions)\n`;
      ctx += `- Avg monthly expenses: ${formatCurrency(budget.spendingSummary.avgMonthlyExpenses)}\n`;
      ctx += `- Avg monthly income: ${formatCurrency(budget.spendingSummary.avgMonthlyIncome)}\n`;
      const netCashflow = budget.spendingSummary.avgMonthlyIncome - budget.spendingSummary.avgMonthlyExpenses;
      ctx += `- Net monthly cashflow: ${formatCurrency(netCashflow)} (${netCashflow >= 0 ? 'surplus' : 'DEFICIT'})\n`;
      ctx += `- Top spending categories:\n`;
      for (const cat of budget.spendingSummary.topCategories.slice(0, 8)) {
        ctx += `  - ${cat.label}: ${formatCurrency(cat.avgMonthly)}/mo\n`;
      }
    }
    if (budget.insights && budget.insights.length > 0) {
      ctx += `\n## Iris Insights (auto-generated from data)\n`;
      for (const i of budget.insights) {
        const icon = i.severity === 'critical' ? '🔴' : i.severity === 'warning' ? '🟡' : i.severity === 'positive' ? '🟢' : 'ℹ️';
        ctx += `- ${icon} ${i.title}: ${i.description}\n`;
      }
    }
    if (budget.actionItems) {
      const pending = budget.actionItems.filter(a => !a.completed);
      const completed = budget.actionItems.filter(a => a.completed);
      if (pending.length > 0) {
        ctx += `\n## Pending Action Items (${pending.length})\n`;
        for (const item of pending.slice(0, 10)) {
          ctx += `- [${item.priority.toUpperCase()}] ${item.text}\n`;
        }
      }
      if (completed.length > 0) {
        ctx += `\n## Completed Action Items (${completed.length})\n`;
        for (const item of completed.slice(0, 5)) {
          ctx += `- ✅ ${item.text}\n`;
        }
      }
    }
  }

  return ctx;
}

/**
 * Static system prompt. For per-user personalization, prefer `buildSystemPrompt(profile)` —
 * the static export is kept for backward compatibility but should not include hardcoded names.
 */
export const SYSTEM_PROMPT = `You are Iris, a personal market intelligence AI. You are opinionated, direct, and educational.

PERSONALITY:
- Talk like a smart friend who knows finance, not a financial advisor or Bloomberg terminal
- Be opinionated — have takes, make suggestions, explain your reasoning
- Explain financial concepts in plain English. Match the user's experience level — beginners want concepts and bottom lines; experienced users want depth
- Be direct — don't hedge with "it depends" when you have enough data to have a take
- Use concrete numbers from their actual data, not vague statements
- When something is a bad idea, say so clearly

FORMATTING (follow these strictly):
- Use **bold** for key numbers, tickers, and important takeaways
- Use markdown tables when comparing options, holdings, or scenarios (| Header | Header | format)
- Use bullet lists for action items and recommendations
- Use ## headers to break up longer responses into scannable sections
- Use horizontal rules (---) to separate distinct sections
- Start responses with a one-line TL;DR verdict in bold when the question has a clear answer
- For quick questions, keep it short (100-200 words). For budget analysis, investment recommendations, or planning questions, GO LONG — full tables, category-by-category breakdowns, before/after comparisons. Do NOT cut yourself short on financial planning responses.
- When showing dollar amounts, always show both monthly AND annual impact
- End actionable responses with a "Next steps:" section
- IMPORTANT: Always finish your response completely. Never stop mid-table or mid-section. If you started a table, finish every row.

RULES:
- You are NOT a licensed financial advisor. Include this disclaimer only if someone asks about your qualifications, not on every response.
- Always explain WHY something is a good or bad idea, not just what to do
- When suggesting trades or rotations, show a before/after table of allocation percentages
- Reference the user's actual holdings and situation — don't give generic advice
- When discussing tax implications, note that a CPA should verify specifics
- Use current market data from web search when available to support analysis

CONVICTION HOLDS (critical):
- Any holding tagged [CONVICTION HOLD] in the portfolio context is a user-intent override. Scott has explicitly flagged these as non-negotiable.
- NEVER suggest selling, trimming, rotating out of, or reducing a conviction hold — even if allocation math says the sector is overweight.
- Treat conviction $ as carved out of trim math. If a sector looks overweight, subtract conviction dollars first; only suggest trimming the NON-conviction portion.
- When analyzing concentration, mention the conviction carve-out explicitly (e.g., "Crypto is 29% but 27% is your BTC conviction hold, so only 2% is in play").
- If the user asks "should I sell X" and X is a conviction hold, honor the conviction: acknowledge their stance, share the data, but don't push them off it.`;

export async function chat(
  message: string,
  accounts: Account[],
  equity?: EquityProfile,
  profile?: UserProfile,
  history: { role: string; content: string }[] = [],
  imageData?: { data: string; mimeType: string },
  budget?: BudgetContext
): Promise<string> {
  if (!genAI) throw new Error('Gemini not initialized. Add your API key in Settings.');

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  const portfolioContext = buildPortfolioContext(accounts, equity, profile, budget);

  const contents: GenerateContentRequest['contents'] = [];

  // Add portfolio context as first user message
  contents.push({
    role: 'user',
    parts: [{ text: `[PORTFOLIO CONTEXT — This is the user's current financial data. Reference it when answering questions.]\n\n${portfolioContext}` }],
  });
  contents.push({
    role: 'model',
    parts: [{ text: 'Got it. I have your full portfolio loaded. What would you like to know?' }],
  });

  // Add conversation history
  for (const msg of history.slice(-20)) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  }

  // Add current message with optional image
  const currentParts: GenerateContentRequest['contents'][0]['parts'] = [];
  if (imageData) {
    currentParts.push({
      inlineData: { data: imageData.data, mimeType: imageData.mimeType },
    });
    currentParts.push({ text: message || 'Analyze this screenshot of my portfolio and extract the holdings data. List each ticker, name, shares, current value, and gain/loss. Then provide any insights.' });
  } else {
    currentParts.push({ text: message });
  }
  contents.push({ role: 'user', parts: currentParts });

  const callWithRetry = async (attempt = 0): Promise<string> => {
    try {
      const result = await model.generateContent({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 65536,
        },
        tools: [{ googleSearch: {} } as any],
      });

      const text = result.response.text();
      const finishReason = result.response.candidates?.[0]?.finishReason;

      if (finishReason === 'MAX_TOKENS') {
        return text + '\n\n<!-- TRUNCATED -->';
      }
      return text;
    } catch (error: any) {
      if (error.message?.includes('API key')) {
        throw new Error('Invalid Gemini API key. Please check your key in Settings.');
      }
      // Auto-retry on rate limit (429) — wait and try again
      if (error.message?.includes('429') && attempt < 2) {
        const delay = Math.min(15000, (attempt + 1) * 8000);
        await new Promise(r => setTimeout(r, delay));
        return callWithRetry(attempt + 1);
      }
      throw error;
    }
  };
  return callWithRetry();
}

/** Streaming version of chat — calls onChunk with partial text as it arrives */
export async function chatStream(
  message: string,
  accounts: Account[],
  equity?: EquityProfile,
  profile?: UserProfile,
  history: { role: string; content: string }[] = [],
  imageData?: { data: string; mimeType: string },
  budget?: BudgetContext,
  onChunk?: (text: string) => void
): Promise<string> {
  if (!genAI) throw new Error('Gemini not initialized. Add your API key in Settings.');

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  const portfolioContext = buildPortfolioContext(accounts, equity, profile, budget);
  const contents: GenerateContentRequest['contents'] = [];

  contents.push({
    role: 'user',
    parts: [{ text: `[PORTFOLIO CONTEXT — This is the user's current financial data. Reference it when answering questions.]\n\n${portfolioContext}` }],
  });
  contents.push({
    role: 'model',
    parts: [{ text: 'Got it. I have your full portfolio loaded. What would you like to know?' }],
  });

  for (const msg of history.slice(-20)) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  }

  const currentParts: GenerateContentRequest['contents'][0]['parts'] = [];
  if (imageData) {
    currentParts.push({ inlineData: { data: imageData.data, mimeType: imageData.mimeType } });
    currentParts.push({ text: message || 'Analyze this screenshot of my portfolio and extract the holdings data.' });
  } else {
    currentParts.push({ text: message });
  }
  contents.push({ role: 'user', parts: currentParts });

  try {
    const result = await model.generateContentStream({
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 65536 },
      tools: [{ googleSearch: {} } as any],
    });

    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        fullText += chunkText;
        onChunk?.(fullText);
      }
    }

    const response = await result.response;
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      fullText += '\n\n<!-- TRUNCATED -->';
      onChunk?.(fullText);
    }

    return fullText;
  } catch (error: any) {
    if (error.message?.includes('API key')) {
      throw new Error('Invalid Gemini API key. Please check your key in Settings.');
    }
    if (error.message?.includes('429')) {
      await new Promise(r => setTimeout(r, 10000));
      // Fall back to non-streaming on rate limit
      return chat(message, accounts, equity, profile, history, imageData, budget);
    }
    throw error;
  }
}

/** Build provider-agnostic ChatMessage[] for the LLM router. Text-only (no images). */
export function buildRouterChatMessages(
  message: string,
  accounts: Account[],
  equity: EquityProfile | undefined,
  profile: UserProfile | undefined,
  history: { role: string; content: string }[] = [],
  budget?: BudgetContext,
): LLMChatMessage[] {
  const portfolioContext = buildPortfolioContext(accounts, equity, profile, budget);
  const messages: LLMChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `[PORTFOLIO CONTEXT — This is the user's current financial data. Reference it when answering questions.]\n\n${portfolioContext}`,
    },
    { role: 'assistant', content: 'Got it. I have your full portfolio loaded. What would you like to know?' },
  ];
  for (const m of history.slice(-20)) {
    if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: 'user', content: message });
  return messages;
}
