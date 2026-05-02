// LLM provider abstraction — one interface, many backends.
// Swap between Gemini, Claude, Ollama (local Gemma), WebLLM without touching call sites.
// Router handles provider selection based on user preference + per-call task weight.

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  provider: string;
  model: string;
  tokensUsed?: number;
  latencyMs: number;
}

export type LLMProviderErrorKind =
  | 'rate-limit'
  | 'network'
  | 'timeout'
  | 'auth'
  | 'unavailable'
  | 'unknown';

export interface LLMProviderError extends Error {
  kind: LLMProviderErrorKind;
  provider: string;
  retryable: boolean;
}

export type LLMProviderKind = 'cloud' | 'local';

export interface LLMProviderCapabilities {
  streaming: boolean;
  multimodal: boolean;
  maxContextTokens: number;
  requiresApiKey: boolean;
  requiresLocalRuntime: boolean;
}

export interface LLMProvider {
  readonly id: string;
  readonly displayName: string;
  readonly kind: LLMProviderKind;
  readonly model: string;
  readonly capabilities: LLMProviderCapabilities;

  isAvailable(): Promise<boolean>;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream?(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>;
}

export type LLMRoutingPreference = 'auto' | 'cloud-preferred' | 'local-only';

// Task weight tells the router whether to spend cloud quota.
// Light: cheap Q&A like "what's my 401k balance" — prefer local even when cloud is available.
// Heavy: multi-step reasoning, long context, explanation — prefer cloud if user chose it.
export type TaskWeight = 'light' | 'heavy';

export interface LLMRouteRequest {
  messages: ChatMessage[];
  options?: ChatOptions;
  preferProvider?: string;
  taskWeight?: TaskWeight;
  fallbackOnError?: boolean;
}

export interface LLMRouter {
  readonly providers: LLMProvider[];
  readonly preference: LLMRoutingPreference;

  chat(request: LLMRouteRequest): Promise<ChatResponse>;
  listAvailableProviders(): Promise<LLMProvider[]>;
}
