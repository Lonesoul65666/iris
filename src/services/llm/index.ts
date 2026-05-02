// LLM barrel: singleton router keyed on setup(), exposed via getRouter().
// Call setupLLMRouter() once at app startup after settings are loaded.

import { getSetting } from '../../stores/portfolioStore';
import type { LLMProvider, LLMRoutingPreference } from '../../types/llm';
import { ClaudeProvider } from './ClaudeProvider';
import { GeminiProvider } from './GeminiProvider';
import { OllamaProvider } from './OllamaProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { DefaultLLMRouter } from './LLMRouter';

export { DefaultLLMRouter, routedChat } from './LLMRouter';
export { GeminiProvider } from './GeminiProvider';
export { ClaudeProvider } from './ClaudeProvider';
export { OpenAIProvider } from './OpenAIProvider';
export { OllamaProvider, listInstalledOllamaModels } from './OllamaProvider';
export {
  getDailyCap,
  setDailyCap,
  getUsageToday,
  remainingCloudToday,
  canMakeCloudCall,
  resetUsageToday,
  usageSummary,
  subscribeUsage,
  DEFAULT_DAILY_CAP,
  type UsageRecord,
} from './rateLimit';

let router: DefaultLLMRouter | null = null;

export async function setupLLMRouter(opts?: {
  preference?: LLMRoutingPreference;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}): Promise<DefaultLLMRouter> {
  const [geminiKey, claudeKey, openaiKey, prefStored] = await Promise.all([
    getSetting('gemini_api_key'),
    getSetting('claude_api_key'),
    getSetting('openai_api_key'),
    getSetting('llm_preference'),
  ]);

  const preference: LLMRoutingPreference =
    opts?.preference ??
    (isPreference(prefStored) ? prefStored : 'cloud-preferred');

  const providers: LLMProvider[] = [
    new GeminiProvider(geminiKey),
    new ClaudeProvider(claudeKey),
    new OpenAIProvider(openaiKey),
    new OllamaProvider({ baseUrl: opts?.ollamaBaseUrl, model: opts?.ollamaModel }),
  ];

  router = new DefaultLLMRouter(providers, preference);
  return router;
}

export function getRouter(): DefaultLLMRouter {
  if (!router) throw new Error('LLM router not initialized — call setupLLMRouter() first');
  return router;
}

export function hasRouter(): boolean {
  return router !== null;
}

function isPreference(v: unknown): v is LLMRoutingPreference {
  return v === 'auto' || v === 'cloud-preferred' || v === 'local-only';
}

/**
 * Verify that a provider key is valid by firing a minimal "ping" request.
 * Returns success with the model name, or failure with a human-readable reason.
 *
 * Used by onboarding + Settings to give users immediate ✓/✗ feedback when they
 * paste a key, instead of letting them discover it's bad later via grounded chat.
 */
export type TestResult =
  | { ok: true; provider: string; model: string; latencyMs: number }
  | { ok: false; provider: string; error: string };

export async function testProvider(
  provider: 'gemini' | 'claude' | 'openai' | 'ollama',
  options: { apiKey?: string; ollamaBaseUrl?: string; ollamaModel?: string } = {},
): Promise<TestResult> {
  const started = Date.now();
  try {
    let p: LLMProvider;
    switch (provider) {
      case 'gemini':
        if (!options.apiKey) return { ok: false, provider, error: 'Missing API key' };
        p = new GeminiProvider(options.apiKey);
        break;
      case 'claude':
        if (!options.apiKey) return { ok: false, provider, error: 'Missing API key' };
        p = new ClaudeProvider(options.apiKey);
        break;
      case 'openai':
        if (!options.apiKey) return { ok: false, provider, error: 'Missing API key' };
        p = new OpenAIProvider(options.apiKey);
        break;
      case 'ollama':
        p = new OllamaProvider({ baseUrl: options.ollamaBaseUrl, model: options.ollamaModel });
        break;
    }

    // Minimum viable ping — say "hi", expect any response.
    // Budget is 256 (not 8) because Gemini 2.5 models burn thinking tokens
    // before emitting visible text; an 8-token cap produced empty responses.
    const res = await p.chat(
      [{ role: 'user', content: 'Reply with the single word: ok' }],
      { temperature: 0, maxTokens: 256 },
    );

    if (!res.content || res.content.trim().length === 0) {
      return { ok: false, provider, error: 'Provider responded but returned no text' };
    }
    return { ok: true, provider, model: res.model || p.id, latencyMs: Date.now() - started };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Tighten common error patterns to user-readable strings.
    let friendly = msg;
    if (/api[_\s-]?key|invalid|unauthorized|401/i.test(msg)) {
      friendly = 'Key rejected — check the value and try again.';
    } else if (/quota|rate|429/i.test(msg)) {
      friendly = 'Quota or rate limit exceeded. Try again in a minute.';
    } else if (/network|fetch|enotfound|econn/i.test(msg)) {
      friendly = 'Network error — check your connection (or Ollama running locally).';
    } else if (/model|not.*found/i.test(msg)) {
      friendly = `Model not found — for Ollama, run "ollama pull ${options.ollamaModel || 'gemma2:2b'}" first.`;
    }
    return { ok: false, provider, error: friendly };
  }
}
