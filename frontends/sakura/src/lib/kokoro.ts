/**
 * Kokoro Engine v1 — frontend types.
 *
 * Mirrors the Pydantic-ish payload shape produced by
 * `backend/kokoro/service.py::response_to_frontend_payload`.  Keep this file
 * in lockstep with that function — Pydantic↔TypeScript drift is a known
 * regression surface in this repo (see CLAUDE.md "Known Sensitive Areas").
 *
 * Nothing in this module performs network I/O; consumers receive a
 * `KokoroPayload` from the chat endpoint and surface its embodiment fields
 * (face, gesture, gaze, voiceStyle) to the avatar layer.
 */

export type KokoroEmotion =
  | 'neutral' | 'focused_warm' | 'happy' | 'soft' | 'concerned'
  | 'playful' | 'shy' | 'excited' | 'sleepy' | 'frustrated' | 'proud';

export type KokoroFace =
  | 'neutral' | 'soft_smile' | 'smile' | 'concerned' | 'surprised'
  | 'smug' | 'blush' | 'sleepy' | 'focused';

export type KokoroGesture =
  | 'idle' | 'wave' | 'thinking' | 'point' | 'hands_clasped'
  | 'heart' | 'small_nod' | 'tilt_head';

export type KokoroGaze = 'user' | 'away' | 'thinking' | 'object' | 'camera';

export type KokoroVoiceStyle =
  | 'calm' | 'warm' | 'bright' | 'sleepy' | 'serious' | 'teasing';

export interface KokoroMemoryWrite {
  shouldSave: boolean;
  summary: string;
  importance: number;
  emotionalSalience: number;
}

/**
 * State delta the LLM proposed this turn.  Each entry is a small bounded
 * change (-0.05..+0.05) to one named dial.  Unknown keys are tolerated.
 */
export type KokoroStateDelta = Record<string, number>;

export interface KokoroNsfwExtras {
  active: boolean;
  innerArousalShift: number | null;
  suggestiveBid: string | null;
  selfConsentCheck: boolean;
  boundaryReinforcement: boolean;
}

export interface KokoroDiagnostics {
  parseOk: boolean;
  bondLevel: number;
  kokoroEnabled: boolean;
}

/**
 * Provider-neutral TTS hints derived from voiceStyle.  Forward into your
 * next TTS request; the existing TTS layer translates these to provider-
 * specific fields (Edge-TTS "+N%", ElevenLabs stability scalars, etc.).
 */
export type KokoroVoiceParams = Record<string, number | string>;

export interface KokoroPayload {
  reply: string;
  innerThought: string;
  emotion: KokoroEmotion;
  facialExpression: KokoroFace;
  gesture: KokoroGesture;
  gaze: KokoroGaze;
  voiceStyle: KokoroVoiceStyle;
  voiceParams: KokoroVoiceParams;
  memoryWrite: KokoroMemoryWrite;
  stateDelta: KokoroStateDelta;
  nsfw: KokoroNsfwExtras;
  diagnostics: KokoroDiagnostics;
}

/**
 * Map Kokoro's facial-expression enum to the VRM blendshape names already
 * recognized by `frontends/shared/viewer/viewer.html`.  Faces that don't have
 * a 1:1 blendshape fall back to the closest match.  The map is intentionally
 * small — the v1 plan calls for "gentle movement, not caffeinated VTuber."
 */
export const KOKORO_FACE_TO_BLENDSHAPE: Record<KokoroFace, string> = {
  neutral: 'neutral',
  soft_smile: 'happy',
  smile: 'happy',
  concerned: 'sad',
  surprised: 'surprised',
  smug: 'relaxed',
  blush: 'happy',
  sleepy: 'relaxed',
  focused: 'neutral',
};
