// Thin LLMProvider wrapper over @google/generative-ai.
// The feature-rich Iris chat (portfolio grounding, Google Search tool, streaming)
// lives in services/gemini.ts and stays as-is — this is for generic router calls.

import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  LLMProviderCapabilities,
} from '../../types/llm';
import { makeProviderError } from './errors';

const CAPS: LLMProviderCapabilities = {
  streaming: true,
  multimodal: true,
  maxContextTokens: 1_000_000,
  requiresApiKey: true,
  requiresLocalRuntime: false,
};

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini';
  readonly displayName = 'Google Gemini';
  readonly kind = 'cloud' as const;
  readonly capabilities = CAPS;
  readonly model: string;

  private client: GoogleGenerativeAI | null = null;

  constructor(apiKey: string | undefined, model = 'gemini-2.5-flash') {
    this.model = model;
    if (apiKey) this.client = new GoogleGenerativeAI(apiKey);
  }

  async isAvailable(): Promise<boolean> {
    return this.client !== null;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.client) throw makeProviderError(this.id, 'auth', 'No API key configured', false);
    const started = Date.now();

    const systemPrompt = options?.systemPrompt ?? extractSystem(messages);
    const body = messages.filter(m => m.role !== 'system');

    const model = this.client.getGenerativeModel({
      model: this.model,
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    });

    try {
      const result = await model.generateContent({
        contents: body.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 8192,
        },
      });

      return {
        content: result.response.text(),
        provider: this.id,
        model: this.model,
        latencyMs: Date.now() - started,
      };
    } catch (e) {
      throw coerceGeminiError(e);
    }
  }
}

function extractSystem(messages: ChatMessage[]): string | undefined {
  return messages.find(m => m.role === 'system')?.content;
}

function coerceGeminiError(e: unknown) {
  const msg = (e as Error)?.message ?? String(e);
  if (msg.includes('API key')) return makeProviderError('gemini', 'auth', msg, false);
  if (msg.includes('429')) return makeProviderError('gemini', 'rate-limit', msg);
  if (msg.includes('fetch') || msg.includes('network')) return makeProviderError('gemini', 'network', msg);
  return makeProviderError('gemini', 'unknown', msg);
}
