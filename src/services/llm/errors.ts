import type { LLMProviderError, LLMProviderErrorKind } from '../../types/llm';

export function makeProviderError(
  provider: string,
  kind: LLMProviderErrorKind,
  message: string,
  retryable = kind === 'rate-limit' || kind === 'network' || kind === 'timeout',
): LLMProviderError {
  const err = new Error(`[${provider}] ${message}`) as LLMProviderError;
  err.kind = kind;
  err.provider = provider;
  err.retryable = retryable;
  return err;
}

export function classifyHttpError(
  provider: string,
  status: number,
  body?: string,
): LLMProviderError {
  if (status === 401 || status === 403) return makeProviderError(provider, 'auth', `HTTP ${status}: ${body ?? 'auth failed'}`, false);
  if (status === 429) return makeProviderError(provider, 'rate-limit', `HTTP ${status}: rate limited`);
  if (status >= 500) return makeProviderError(provider, 'unavailable', `HTTP ${status}: ${body ?? 'server error'}`);
  return makeProviderError(provider, 'unknown', `HTTP ${status}: ${body ?? 'error'}`, false);
}
