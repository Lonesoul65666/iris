// Router: picks a provider based on user preference + availability, falls back on failure.
// Preference semantics:
//   'cloud-preferred' — try cloud providers first (by order), then local. Default for most users.
//   'local-only'      — only try local providers; fail if none are up.
//   'auto'            — light tasks prefer local; heavy tasks prefer cloud. Cheapest-first within each bucket.

import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  LLMProviderError,
  LLMRouteRequest,
  LLMRouter,
  LLMRoutingPreference,
} from '../../types/llm';
import { makeProviderError } from './errors';
import { canMakeCloudCall, recordCall } from './rateLimit';

export class DefaultLLMRouter implements LLMRouter {
  readonly providers: LLMProvider[];
  readonly preference: LLMRoutingPreference;

  constructor(providers: LLMProvider[], preference: LLMRoutingPreference = 'cloud-preferred') {
    this.providers = providers;
    this.preference = preference;
  }

  async chat(request: LLMRouteRequest): Promise<ChatResponse> {
    const ordered = await this.pickOrder(request);
    if (ordered.length === 0) {
      throw makeProviderError('router', 'unavailable', 'No LLM providers available', false);
    }

    // Daily-cap gate: if cloud budget is exhausted, drop cloud providers from
    // this request and try local only. If nothing remains, throw rate-limit so
    // the UI can surface a clear "cap hit" state instead of a random failure.
    let effective = ordered;
    const cloudOk = await canMakeCloudCall();
    if (!cloudOk) {
      effective = ordered.filter(p => p.kind !== 'cloud');
      if (effective.length === 0) {
        throw makeProviderError(
          'router',
          'rate-limit',
          'Daily LLM budget reached. Open Settings to raise the cap or wait until tomorrow.',
          false,
        );
      }
    }

    const errors: { provider: string; message: string }[] = [];
    for (const p of effective) {
      try {
        const response = await p.chat(request.messages, request.options);
        // Only record on success — failed calls don't burn the budget.
        // Fire-and-forget is fine; counter persistence shouldn't block the response.
        recordCall(p.id, p.kind).catch(() => { /* swallow telemetry errors */ });
        return response;
      } catch (e) {
        const err = e as LLMProviderError;
        errors.push({ provider: p.id, message: err.message });
        if (request.fallbackOnError === false) throw err;
        if (err.kind === 'auth') continue;
        if (!err.retryable && err.kind !== 'unavailable') continue;
      }
    }

    throw makeProviderError(
      'router',
      'unavailable',
      `All providers failed: ${errors.map(e => `${e.provider}: ${e.message}`).join(' | ')}`,
      false,
    );
  }

  async listAvailableProviders(): Promise<LLMProvider[]> {
    const checks = await Promise.all(
      this.providers.map(async p => ({ p, ok: await safeCheck(p) })),
    );
    return checks.filter(c => c.ok).map(c => c.p);
  }

  private async pickOrder(req: LLMRouteRequest): Promise<LLMProvider[]> {
    const available = await this.listAvailableProviders();
    if (available.length === 0) return [];

    if (req.preferProvider) {
      const pinned = available.find(p => p.id === req.preferProvider);
      if (pinned) return [pinned, ...available.filter(p => p.id !== pinned.id)];
    }

    const cloud = available.filter(p => p.kind === 'cloud');
    const local = available.filter(p => p.kind === 'local');

    if (this.preference === 'local-only') return local;
    if (this.preference === 'cloud-preferred') return [...cloud, ...local];

    // 'auto'
    return req.taskWeight === 'light' ? [...local, ...cloud] : [...cloud, ...local];
  }
}

async function safeCheck(p: LLMProvider): Promise<boolean> {
  try {
    return await p.isAvailable();
  } catch {
    return false;
  }
}

// Convenience shim: router-aware chat with a simple message string.
export async function routedChat(
  router: LLMRouter,
  message: string,
  systemPrompt?: string,
  options?: ChatOptions,
): Promise<ChatResponse> {
  const messages: ChatMessage[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: message });
  return router.chat({ messages, options });
}
