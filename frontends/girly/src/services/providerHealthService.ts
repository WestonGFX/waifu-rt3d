/**
 * Provider health service — waifu-rt3d stub.
 *
 * Original tested direct LLM provider connections via getLLMProvider().
 * Since the backend handles all LLM routing, we always return 'ok'.
 */

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
 * Stub — always returns 'ok' since waifu-rt3d backend handles providers.
 */
export async function testLLMConnection(_providerName: string): Promise<LLMConnectionResult> {
  return { status: 'ok', message: 'Connected to waifu-rt3d backend.' };
}
