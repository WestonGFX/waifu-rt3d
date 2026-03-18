/**
 * voiceCallService – pure state machine for the voice-to-voice call loop.
 *
 * This module owns the state types, transition logic, and a lightweight
 * observer/subscriber pattern that a React hook can wire up.  All actual
 * I/O (STT, TTS, LLM) is performed by the caller; this service only tracks
 * what phase the conversation is in and exposes helpers for moving between
 * phases safely.
 *
 * State machine overview:
 * ```
 *   idle
 *     └─ start() ──────────────────────────────► listening
 *                                                  │
 *                                    speech-end / silence timeout
 *                                                  │
 *                                                  ▼
 *                                             capturing
 *                                                  │
 *                                        transcript ready
 *                                                  │
 *                                                  ▼
 *                                            processing
 *                                                  │
 *                                         LLM response ready
 *                                                  │
 *                                                  ▼
 *                                             speaking
 *                                            │       │
 *                              TTS finished  │       │ VAD speech-start
 *                                            │       │ (barge-in interrupt)
 *                                            ▼       ▼
 *                                         cooldown  listening
 *                                            │
 *                              cooldownMs elapsed
 *                                            │
 *                                            ▼
 *                                         listening  (loop)
 *
 *   Any phase ──── stop() ───────────────────────► idle
 * ```
 *
 * @example
 *   const controller = createVoiceCallController();
 *   const unsub = controller.onStateChange((s) => setCallState(s));
 *   controller.start();
 *   // later…
 *   controller.stop();
 *   unsub();
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The active phase of the voice call loop.
 *
 * - `idle`       — call is not running
 * - `listening`  — waiting for user to speak; STT is ready
 * - `capturing`  — user has started speaking and audio is being captured
 * - `processing` — transcript has been captured; waiting for LLM response
 * - `speaking`   — TTS is playing the AI response
 * - `cooldown`   — brief pause between TTS end and re-starting STT
 */
export type VoiceCallPhase =
  | 'idle'
  | 'listening'
  | 'capturing'
  | 'processing'
  | 'speaking'
  | 'cooldown';

/**
 * Snapshot of the current voice call session.
 */
export interface VoiceCallState {
  /** The current phase of the state machine. */
  phase: VoiceCallPhase;

  /** Whether a call session is running (phase !== 'idle'). */
  isActive: boolean;

  /** The most recent transcript produced by STT. */
  lastTranscript: string;

  /** The most recent response text produced by the LLM. */
  lastResponse: string;

  /** How many complete STT → LLM → TTS turns have finished this session. */
  turnCount: number;

  /** The most recent error message, or null if no error has occurred. */
  error: string | null;
}

/**
 * Configuration options for a voice call session.
 */
export interface VoiceCallConfig {
  /**
   * When true, use VAD (voice activity detection) to detect barge-in
   * interrupts while the AI is speaking.  Requires `@ricky0123/vad-web`.
   */
  enableVAD: boolean;

  /**
   * When true, automatically re-enter `listening` after each TTS turn.
   * Set to false for push-to-talk integrations where the user controls
   * when to start listening.
   */
  autoListenAfterSpeak: boolean;

  /**
   * Milliseconds to wait in `cooldown` after TTS ends before re-starting
   * STT.  Prevents the microphone from catching the tail of the AI's voice.
   *
   * @default 500
   */
  cooldownMs: number;

  /**
   * Maximum milliseconds of silence in `listening` before the controller
   * auto-advances to `capturing` with whatever audio has been collected.
   * The caller is responsible for enforcing this via a timeout; the service
   * only stores the value so the hook can read it.
   *
   * @default 3000
   */
  maxSilenceMs: number;
}

/**
 * The return type of `createVoiceCallController`.
 */
export interface VoiceCallController {
  /**
   * Begin the voice call loop.  Transitions from `idle` → `listening`.
   * No-op if already active.
   */
  start(): void;

  /**
   * End the call and clean up all internal state.  Transitions any phase
   * → `idle`.  No-op if already idle.
   */
  stop(): void;

  /**
   * Read the current call state without subscribing to future changes.
   *
   * @returns A shallow copy of the current {@link VoiceCallState}.
   */
  getState(): VoiceCallState;

  /**
   * Subscribe to state changes.  The callback is fired synchronously after
   * every state mutation.
   *
   * @param callback - Receives the new state after each transition.
   * @returns An unsubscribe function.  Call it to stop receiving updates.
   *
   * @example
   *   const unsub = controller.onStateChange((s) => setUiState(s));
   *   // later…
   *   unsub();
   */
  onStateChange(callback: (state: VoiceCallState) => void): () => void;

  /**
   * Advance to the `capturing` phase.  Should be called when the STT
   * provider detects that the user has started speaking.
   * Only valid from `listening`; silently ignored from other phases.
   */
  notifySpeechStart(): void;

  /**
   * Supply a completed transcript and advance to the `processing` phase.
   * Should be called when STT emits a final result.
   * Only valid from `capturing` or `listening`; ignored otherwise.
   *
   * @param transcript - The recognised text from STT.
   */
  notifyTranscriptReady(transcript: string): void;

  /**
   * Supply the LLM response text and advance to the `speaking` phase.
   * Should be called after the caller has received the full AI response.
   * Only valid from `processing`; ignored otherwise.
   *
   * @param response - The text the TTS engine should speak.
   */
  notifyResponseReady(response: string): void;

  /**
   * Signal that TTS playback has finished and enter `cooldown`.
   * Only valid from `speaking`; ignored otherwise.
   */
  notifyTTSEnd(): void;

  /**
   * Signal that the cooldown timer has elapsed and re-enter `listening`.
   * Should be called by the caller after `cooldownMs` has passed.
   * Only valid from `cooldown`; ignored otherwise.
   */
  notifyCooldownEnd(): void;

  /**
   * Signal that the user started speaking while the AI was still talking
   * (barge-in / interrupt).  Cancels the `speaking` phase and jumps
   * directly to `listening`.
   * Only valid from `speaking`; ignored otherwise.
   */
  notifyBargeIn(): void;

  /**
   * Record a non-fatal error without stopping the call.  The error is
   * stored in state so the UI can surface it, but the phase is unchanged.
   * Pass `null` to clear a previous error.
   *
   * @param message - Human-readable error description, or null to clear.
   */
  setError(message: string | null): void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Sensible default configuration for a new voice call session.
 *
 * @example
 *   const controller = createVoiceCallController({ ...DEFAULT_VOICE_CALL_CONFIG, cooldownMs: 800 });
 */
export const DEFAULT_VOICE_CALL_CONFIG: VoiceCallConfig = {
  enableVAD: true,
  autoListenAfterSpeak: true,
  cooldownMs: 500,
  maxSilenceMs: 3000,
};

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

/**
 * Create the initial (idle) state for a voice call session.
 *
 * @returns A fresh {@link VoiceCallState} with all fields at zero/null.
 */
function createInitialState(): VoiceCallState {
  return {
    phase: 'idle',
    isActive: false,
    lastTranscript: '',
    lastResponse: '',
    turnCount: 0,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

/**
 * Return whether a given phase transition is legal.
 *
 * The allowed transitions mirror the state machine diagram in the module
 * comment.  Any transition not listed here is considered a no-op so callers
 * do not need to guard every notification call.
 *
 * @param from - The current phase.
 * @param to   - The proposed next phase.
 * @returns `true` if the transition is valid.
 */
export function isValidTransition(from: VoiceCallPhase, to: VoiceCallPhase): boolean {
  const allowed: Record<VoiceCallPhase, ReadonlyArray<VoiceCallPhase>> = {
    idle: ['listening'],
    listening: ['capturing', 'processing', 'idle'],
    capturing: ['processing', 'idle'],
    processing: ['speaking', 'idle'],
    speaking: ['cooldown', 'listening', 'idle'],
    cooldown: ['listening', 'idle'],
  };
  return (allowed[from] as ReadonlyArray<VoiceCallPhase>).includes(to);
}

// ---------------------------------------------------------------------------
// Controller factory
// ---------------------------------------------------------------------------

/**
 * Create a new {@link VoiceCallController} instance.
 *
 * The controller is a plain JavaScript object (no React dependency) that
 * owns the state machine for a single voice call session.  Plug it into a
 * React hook via `onStateChange` to drive UI updates.
 *
 * @param config - Optional overrides for {@link DEFAULT_VOICE_CALL_CONFIG}.
 * @returns A fully-initialised controller ready to `start()`.
 *
 * @example
 *   const controller = createVoiceCallController({ cooldownMs: 800 });
 *   const unsub = controller.onStateChange((s) => console.log(s.phase));
 *   controller.start();
 */
export function createVoiceCallController(
  config: Partial<VoiceCallConfig> = {},
): VoiceCallController {
  const _config: VoiceCallConfig = { ...DEFAULT_VOICE_CALL_CONFIG, ...config };
  let _state: VoiceCallState = createInitialState();
  const _subscribers = new Set<(state: VoiceCallState) => void>();

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Apply a partial state update, notify all subscribers, and return the
   * new state.  Creates a new object every time to satisfy React's
   * referential-equality check in consuming hooks.
   */
  function applyUpdate(patch: Partial<VoiceCallState>): void {
    _state = { ..._state, ...patch };
    for (const sub of _subscribers) {
      sub(_state);
    }
  }

  /**
   * Attempt a phase transition.  Logs a warning if the transition is not
   * permitted by the state machine and returns without mutating state.
   *
   * @param to       - The target phase.
   * @param extraPatch - Additional state fields to update alongside phase.
   */
  function transition(to: VoiceCallPhase, extraPatch: Partial<VoiceCallState> = {}): void {
    if (!isValidTransition(_state.phase, to)) {
      // Not a legal transition — silently ignore so callers don't need to
      // guard every notification call.
      return;
    }
    applyUpdate({
      phase: to,
      isActive: to !== 'idle',
      ...extraPatch,
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  function start(): void {
    if (_state.isActive) return;
    // Reset to a clean slate before starting a new session.
    _state = createInitialState();
    transition('listening');
  }

  function stop(): void {
    if (!_state.isActive && _state.phase === 'idle') return;
    // Force-transition to idle regardless of current phase by temporarily
    // marking every phase as allowing → idle (stop is unconditional).
    _state = { ..._state, phase: 'speaking' }; // speaking allows → idle
    transition('idle', { error: null });
  }

  function getState(): VoiceCallState {
    return { ..._state };
  }

  function onStateChange(callback: (state: VoiceCallState) => void): () => void {
    _subscribers.add(callback);
    return () => {
      _subscribers.delete(callback);
    };
  }

  function notifySpeechStart(): void {
    transition('capturing');
  }

  function notifyTranscriptReady(transcript: string): void {
    // Accept from either listening (silence timeout) or capturing.
    if (_state.phase !== 'capturing' && _state.phase !== 'listening') return;
    // Manually set phase to capturing first so transition check passes.
    if (_state.phase === 'listening') {
      _state = { ..._state, phase: 'capturing' };
    }
    transition('processing', { lastTranscript: transcript });
  }

  function notifyResponseReady(response: string): void {
    transition('speaking', { lastResponse: response });
  }

  function notifyTTSEnd(): void {
    if (_config.autoListenAfterSpeak) {
      transition('cooldown', { turnCount: _state.turnCount + 1 });
    } else {
      transition('idle', { turnCount: _state.turnCount + 1 });
    }
  }

  function notifyCooldownEnd(): void {
    transition('listening');
  }

  function notifyBargeIn(): void {
    // Jump straight to listening; the hook is responsible for cancelling TTS.
    if (_state.phase !== 'speaking') return;
    // speaking → listening is a valid transition per isValidTransition.
    transition('listening');
  }

  function setError(message: string | null): void {
    applyUpdate({ error: message });
  }

  return {
    start,
    stop,
    getState,
    onStateChange,
    notifySpeechStart,
    notifyTranscriptReady,
    notifyResponseReady,
    notifyTTSEnd,
    notifyCooldownEnd,
    notifyBargeIn,
    setError,
  };
}
