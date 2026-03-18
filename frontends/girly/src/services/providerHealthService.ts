import { getLLMProvider } from '../providers/registry.ts';
import { hasKey } from './apiKeyService.ts';

export type LLMConnectionStatus =
  | 'idle'
  | 'testing'
  | 'ok'
  | 'missing_key'
  | 'unreachable';

export interface LLMConnectionResult {
  status: Exclude<LLMConnectionStatus, 'idle' | 'testing'>;
  message: string;
}

/**
 * Runs a uniform LLM connectivity check used by setup, status, and API-key UI.
 */
export async function testLLMConnection(providerName: string): Promise<LLMConnectionResult> {
  const provider = getLLMProvider(providerName);

  if (provider.requiresApiKey && !hasKey(providerName)) {
    return {
      status: 'missing_key',
      message: `Missing API key for ${provider.label}.`,
    };
  }

  try {
    const ok = await provider.testConnection();
    if (ok) {
      return { status: 'ok', message: `${provider.label} is reachable.` };
    }
    return { status: 'unreachable', message: `${provider.label} is not reachable.` };
  } catch {
    return { status: 'unreachable', message: `${provider.label} is not reachable.` };
  }
}

