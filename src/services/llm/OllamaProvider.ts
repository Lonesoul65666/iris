// Ollama provider — local, free, offline-capable. Hits http://localhost:11434 by default.
// User runs `ollama pull gemma3:4b` (or similar) and the provider uses the OpenAI-compatible
// /v1/chat/completions endpoint. No API key required.

import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  LLMProviderCapabilities,
} from '../../types/llm';
import { makeProviderError } from './errors';

// Lists models the user has already pulled locally. Returns [] if Ollama isn't reachable.
// This is what keeps the model picker self-updating — new Ollama releases appear here
// automatically once the user runs `ollama pull <name>`.
export async function listInstalledOllamaModels(baseUrl = 'http://localhost:11434'): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const models: { name: string }[] = data.models ?? [];
    return models.map(m => m.name).sort();
  } catch {
    return [];
  }
}

const CAPS: LLMProviderCapabilities = {
  streaming: true,
  multimodal: false,
  maxContextTokens: 32_000,
  requiresApiKey: false,
  requiresLocalRuntime: true,
};

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama';
  readonly displayName = 'Ollama (Local)';
  readonly kind = 'local' as const;
  readonly capabilities = CAPS;
  readonly model: string;
  private readonly baseUrl: string;

  constructor(opts?: { baseUrl?: string; model?: string }) {
    this.baseUrl = (opts?.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.model = opts?.model ?? 'gemma4:e4b';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const started = Date.now();

    const system = options?.systemPrompt;
    const prepped: ChatMessage[] = system
      ? [{ role: 'system', content: system }, ...messages.filter(m => m.role !== 'system')]
      : messages;

    const payload = {
      model: this.model,
      messages: prepped,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 4096,
      },
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options?.signal,
      });
    } catch (e) {
      throw makeProviderError(this.id, 'unavailable', `Ollama not reachable at ${this.baseUrl}: ${(e as Error).message}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw makeProviderError(this.id, 'unknown', `HTTP ${res.status}: ${text}`);
    }

    const data = await res.json();
    return {
      content: data.message?.content ?? '',
      provider: this.id,
      model: this.model,
      latencyMs: Date.now() - started,
    };
  }
}
