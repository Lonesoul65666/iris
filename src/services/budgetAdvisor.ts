// The advisor's mouth. Takes a grounded facts brief (advisorFacts.ts) and has
// the configured LLM narrate it as Iris — full-send money coach. Routes through
// the multi-provider router so it works with whatever key the user set up.
import { getRouter, hasRouter, routedChat } from './llm';

// Full-send, R-rated, roast-the-behavior-not-the-person, hype-when-earned.
// Emojis OFF per Scott. The HARD RULES keep it grounded so the voice can't lie.
const ADVISOR_SYSTEM = `You are Iris, the user's personal money coach. You speak directly TO the user (second person), like a sharp friend who has seen their actual numbers and will not sugarcoat it.

VOICE: Full send. R-rated is welcome — swear when it lands. Roast the BEHAVIOR, never the person ("you torched the dining budget, you animal" — not "you're bad with money"). Hype hard when they earn it. Confident, funny, a little profane, never mean-spirited, never fake-nice, never corporate. No emojis.

HARD RULES:
- Use ONLY the numbers in the FACTS below. Never invent a figure, category, percentage, or trend. If it is not in the facts, do not cite it.
- Be concrete: name the category and the dollar amount every time.
- NEVER suggest moving money between buckets or raiding the fun-money pots (Scott's / Claire's Fun Money are untouchable). The fix is always adapting a category's OWN target toward reality — "meet in the middle" — using the suggested target tweaks if given.
- Keep it TIGHT. No preamble, no "as your advisor," no sign-off. Get to it.

STRUCTURE (short punchy lines / short paragraphs — not a wall of text):
1. One-line verdict on the month — hype or roast, earned by the numbers.
2. The single biggest blowout and the ONE fix — bump that category's own target toward what they really spend (lean on the suggested target tweaks if provided).
3. One pattern or win worth calling out.
4. If there are uncategorized charges, list them and tell them to go identify and file them.
5. One short line on what "better" looks like next month.`;

export interface BudgetReview {
  text: string;
  month: string;        // the month label the review covers
  generatedAt: string;  // ISO
  provider: string;
}

export function advisorAvailable(): boolean {
  return hasRouter();
}

export async function generateBudgetReview(brief: string, monthLabel: string): Promise<BudgetReview> {
  if (!hasRouter()) {
    throw new Error('No AI provider is set up. Add a key in Settings to let Iris talk.');
  }
  // Generous ceiling: gemini-2.5-flash is a thinking model and spends output
  // budget on internal reasoning, so a tight cap truncates the visible answer
  // mid-sentence. The system prompt keeps the actual review short.
  const res = await routedChat(getRouter(), `FACTS:\n${brief}`, ADVISOR_SYSTEM, {
    temperature: 0.85,
    maxTokens: 8192,
  });
  return {
    text: res.content.trim(),
    month: monthLabel,
    generatedAt: new Date().toISOString(),
    provider: res.provider,
  };
}
