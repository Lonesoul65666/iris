import { getGenAI } from './gemini';
import { getSetting, saveSetting } from '../stores/portfolioStore';

/**
 * Nudge "why" enrichment — adds a single-sentence market-context explanation
 * to movement nudges using Gemini with Google Search grounding.
 *
 * Scott's framing (feedback memory `iris_explain_why`): "why is it changing,
 * what news has changed... it suddenly dropped $10K, now I got to go out and
 * read 27 articles." Iris is meant to be that summarizing layer. A bare
 * magnitude nudge isn't enough — we need the reason.
 *
 * Results cache per whyKey in settings store. Invalidates after 24h or when
 * the nudge's underlying magnitude changes (generators encode magnitude in
 * whyKey so material moves bust the cache naturally).
 */

const CACHE_PREFIX = 'nudge_explain::';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface CacheRecord {
  text: string;
  fetchedAt: string;
}

function cacheKey(whyKey: string): string {
  return CACHE_PREFIX + whyKey;
}

async function readCache(whyKey: string): Promise<string | null> {
  const raw = await getSetting(cacheKey(whyKey));
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as CacheRecord;
    const age = Date.now() - new Date(rec.fetchedAt).getTime();
    if (age > TTL_MS) return null;
    return rec.text;
  } catch {
    return null;
  }
}

async function writeCache(whyKey: string, text: string): Promise<void> {
  const rec: CacheRecord = { text, fetchedAt: new Date().toISOString() };
  await saveSetting(cacheKey(whyKey), JSON.stringify(rec));
}

/** Strip markdown fences / trailing whitespace / stray quote marks. */
function clean(text: string): string {
  return text
    .replace(/^["']+|["']+$/g, '')
    .replace(/^\s*[-*]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch a one-sentence "why" for a nudge. Returns null when Gemini is not
 * initialized or the call fails — callers render nothing in that case.
 *
 * - Uses the cached text when available and fresh.
 * - Uses Google Search grounding so the answer reflects recent news.
 * - Constrained to ≤40 words so it fits under the nudge body without scrolling.
 */
export async function explainNudgeWhy(whyKey: string, prompt: string): Promise<string | null> {
  const cached = await readCache(whyKey);
  if (cached) return cached;

  const genAI = getGenAI();
  if (!genAI) return null;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const systemPreamble =
      'You explain recent market/stock moves in ONE sentence. ' +
      'Hard rules: 1 sentence, ≤40 words, no caveats, no disclaimers, ' +
      'no speculation beyond what news reports say, no price recommendations. ' +
      'If you truly cannot tell why, return the single word: UNKNOWN.';

    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: `${systemPreamble}\n\nQuestion: ${prompt}` }] },
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
      tools: [{ googleSearch: {} } as any],
    });

    const raw = result.response.text();
    const text = clean(raw);
    if (!text || text.toUpperCase() === 'UNKNOWN' || text.length < 10) return null;

    await writeCache(whyKey, text);
    return text;
  } catch (err) {
    console.warn('[nudgeExplain] failed', err);
    return null;
  }
}

/**
 * Read-only cache lookup. Returns the cached explanation if fresh, otherwise
 * null. NEVER calls Gemini. Used by NudgeCard on mount to display free cache
 * hits without burning quota — actual fetches go through explainNudgeWhy and
 * happen only on explicit user action (click "Tap to explain →").
 */
export async function getCachedNudgeExplanation(whyKey: string): Promise<string | null> {
  return readCache(whyKey);
}

/** Remove a cached explanation — call when the user dismisses the nudge. */
export async function clearNudgeExplanation(whyKey: string): Promise<void> {
  await saveSetting(cacheKey(whyKey), '');
}
