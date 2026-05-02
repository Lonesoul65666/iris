// Claude (Anthropic) provider — direct fetch to /v1/messages.
// Avoiding the @anthropic-ai/sdk package keeps the bundle smaller and
// lets us hit the API from the browser with anthropic-dangerous-direct-browser-access.

import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  LLMProviderCapabilities,
} from '../../types/llm';
import { classifyHttpError, makeProviderError } from './errors';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

const CAPS: LLMProviderCapabilities = {
  streaming: true,
  multimodal: true,
  maxContextTokens: 200_000,
  requiresApiKey: true,
  requiresLocalRuntime: false,
};

export class ClaudeProvider implements LLMProvider {
  readonly id = 'claude';
  readonly displayName = 'Anthropic Claude';
  readonly kind = 'cloud' as const;
  readonly capabilities = CAPS;
  readonly model: string;
  private readonly apiKey?: string;

  constructor(apiKey: string | undefined, model = 'claude-sonnet-4-6') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.apiKey) throw makeProviderError(this.id, 'auth', 'No API key configured', false);
    const started = Date.now();

    const system = options?.systemPrompt ?? messages.find(m => m.role === 'system')?.content;
    const body = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const payload = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
      ...(system ? { system } : {}),
      messages: body,
    };

    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
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
    const content = Array.isArray(data.content)
      ? data.content.map((c: { type: string; text?: string }) => (c.type === 'text' ? c.text ?? '' : '')).join('')
      : '';

    return {
      content,
      provider: this.id,
      model: this.model,
      tokensUsed: data.usage ? (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0) : undefined,
      latencyMs: Date.now() - started,
    };
  }
}
