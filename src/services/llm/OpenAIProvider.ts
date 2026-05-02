// OpenAI provider — direct fetch to /v1/chat/completions.
// Skipping the `openai` npm package to keep the browser bundle lean.

import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  LLMProviderCapabilities,
} from '../../types/llm';
import { classifyHttpError, makeProviderError } from './errors';

const API_URL = 'https://api.openai.com/v1/chat/completions';

const CAPS: LLMProviderCapabilities = {
  streaming: true,
  multimodal: true,
  maxContextTokens: 128_000,
  requiresApiKey: true,
  requiresLocalRuntime: false,
};

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai';
  readonly displayName = 'OpenAI';
  readonly kind = 'cloud' as const;
  readonly capabilities = CAPS;
  readonly model: string;
  private readonly apiKey?: string;

  constructor(apiKey: string | undefined, model = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.apiKey) throw makeProviderError(this.id, 'auth', 'No API key configured', false);
    const started = Date.now();

    const system = options?.systemPrompt;
    const prepped: ChatMessage[] = system
      ? [{ role: 'system', content: system }, ...messages.filter(m => m.role !== 'system')]
      : messages;

    const payload = {
      model: this.model,
      messages: prepped,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    };

    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: options?.signal,
      });
    } catch (e) {
      throw makeProviderError(this.id, 'network', (e as Error).message);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw classifyHttpError(this.id, res.status, text);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';

    return {
      content,
      provider: this.id,
      model: this.model,
      tokensUsed: data.usage?.total_tokens,
      latencyMs: Date.now() - started,
    };
  }
}
