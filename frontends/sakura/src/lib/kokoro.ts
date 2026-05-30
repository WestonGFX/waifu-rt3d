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

/**
 * Instruction for the VRM viewer's always-on LookAt layer.
 *
 * Two shapes, matching the `{ type: 'lookAt', payload }` postMessage contract
 * in `frontends/shared/viewer/viewer.html`:
 *   - `{ mode: 'cursor' }`   — clear any override; resume cursor-follow + the
 *                              procedural idle gaze-wander (head/neck motion is
 *                              preserved, never frozen).
 *   - `{ target: {x,y,z} }`  — world-space point the eyes (and, softly, the
 *                              head) steer toward. The LookAt layer spring-
 *                              smooths the transition so it never snaps.
 */
export type GazeLookAt =
  | { mode: 'cursor' }
  | { target: { x: number; y: number; z: number } };

/**
 * Map Kokoro's per-turn `gaze` enum to a LookAt instruction.
 *
 * Coordinate frame (from the viewer's LookAtLayer): the character stands at the
 * origin facing +Z toward the user/camera. `y≈1.3` is eye height; `z≈2.0` is a
 * comfortable forward distance. These offsets are deliberately gentle — the v1
 * brief is "soft presence, not a darting VTuber."
 *
 * TUNABLE: these five vectors are pure feel. Edit a single line here to retune
 * any glance; nothing else depends on the exact numbers.
 *
 *   - `user`     → cursor-follow (default). Looks at the person, keeps idle motion.
 *   - `camera`   → deliberate, level eye contact straight down the lens.
 *   - `away`     → glance off to the (character's) left and slightly down — the
 *                  shy / evasive / "looking elsewhere" beat.
 *   - `thinking` → up and to the side, the classic recall/contemplation gaze.
 *   - `object`   → down and nearer, as if regarding something held or on a desk.
 */
export const KOKORO_GAZE_TO_LOOKAT: Record<KokoroGaze, GazeLookAt> = {
  user: { mode: 'cursor' },
  camera: { target: { x: 0.0, y: 1.3, z: 2.0 } },
  away: { target: { x: 0.6, y: 1.15, z: 2.0 } },
  thinking: { target: { x: -0.5, y: 1.7, z: 2.0 } },
  object: { target: { x: 0.0, y: 0.7, z: 1.2 } },
};

/**
 * Resolve a Kokoro gaze enum to a LookAt instruction, defaulting unknown values
 * to cursor-follow so a malformed/extended enum can never freeze the gaze.
 *
 * @param gaze - Kokoro gaze token from the parsed companion response.
 * @returns A {@link GazeLookAt} suitable for the viewer's `lookAt` postMessage.
 *
 * @example
 * kokoroGazeToLookAt('thinking'); // { target: { x: -0.5, y: 1.7, z: 2.0 } }
 * kokoroGazeToLookAt('user');     // { mode: 'cursor' }
 */
export function kokoroGazeToLookAt(gaze: KokoroGaze): GazeLookAt {
  return KOKORO_GAZE_TO_LOOKAT[gaze] ?? { mode: 'cursor' };
}
