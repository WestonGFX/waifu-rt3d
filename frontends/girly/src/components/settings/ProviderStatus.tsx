/**
 * ProviderStatus – shows a live connection indicator for each capability's
 * primary provider.
 *
 * Each indicator is a small coloured dot:
 *   Green  – last test passed.
 *   Red    – last test failed.
 *   Grey   – not yet tested (idle).
 *   Spin   – test in progress.
 *
 * The LLM provider is tested on mount and whenever the user clicks the
 * refresh icon.  STT / TTS are checked via isSupported() (synchronous).
 */

import { useState, useEffect, useCallback } from 'react';
import { getAnimationProvider, getLLMProvider } from '../../providers/registry.ts';
import { useApp } from '../../context/AppContext.tsx';
import { type LLMConnectionStatus, testLLMConnection } from '../../services/providerHealthService.ts';

export default function ProviderStatus() {
  const { state: appState } = useApp();
  // Resolve the active LLM provider name from persisted config.
  const activeLLMName = appState.providerConfig.llm.primary;
  const activeAnimationName = appState.providerConfig.animation.primary;

  const [llmStatus, setLlmStatus] = useState<LLMConnectionStatus>('idle');
  const sttSupported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  const ttsSupported = 'speechSynthesis' in window;

  /**
   * Test whichever LLM provider is currently configured as primary.
   * Re-created when activeLLMName changes so the effect re-runs.
   */
  const testLLM = useCallback(async () => {
    setLlmStatus('testing');
    const result = await testLLMConnection(activeLLMName);
    setLlmStatus(result.status);
  }, [activeLLMName]);

  // Test on mount and whenever the active provider changes.
  useEffect(() => { void testLLM(); }, [testLLM]);

  const dotClass = (status: LLMConnectionStatus) => {
    switch (status) {
      case 'ok':      return 'bg-green-400';
      case 'missing_key':
      case 'unreachable':
        return 'bg-rose-pastel-400';
      case 'testing': return 'bg-anime-400 animate-pulse';
      default:        return 'bg-text-muted';
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-anime border border-anime-100 bg-white/60 p-2.5">
      <label className="text-xs font-semibold text-text-secondary flex items-center justify-between">
        Provider Status
        <button type="button" onClick={() => { void testLLM(); }} className="text-anime-500 hover:text-anime-600 transition-colors text-xs font-semibold" aria-label="Refresh status">
          ↻
        </button>
      </label>

      <div className="flex flex-col gap-1 text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${dotClass(llmStatus)}`} />
          <span>
            LLM - {getLLMProvider(activeLLMName).label}
            {llmStatus === 'missing_key' ? ' (missing key)' : ''}
            {llmStatus === 'unreachable' ? ' (unreachable)' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${sttSupported ? 'bg-green-400' : 'bg-rose-pastel-400'}`} />
          <span>STT – Web Speech {sttSupported ? '' : '(unsupported)'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${ttsSupported ? 'bg-green-400' : 'bg-rose-pastel-400'}`} />
          <span>TTS – Web Speech {ttsSupported ? '' : '(unsupported)'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
          <span>Animation – {getAnimationProvider(activeAnimationName).label}</span>
        </div>
      </div>
    </div>
  );
}
