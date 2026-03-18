import {
  type AvatarEmotion,
  type AvatarGazeMode,
  type AvatarGesture,
  type AvatarIdleStyle,
  type AvatarMetadataSource,
  type AvatarPerformanceMetadata,
  type AvatarPhase,
  type AvatarReaction,
  type AvatarRuntimeState,
  type AvatarTuning,
} from '../types/index.ts';

const PERFORMANCE_TAG_NAME = 'anime-performance';
const PERFORMANCE_OPEN_MARKER = `<${PERFORMANCE_TAG_NAME}`;
const PERFORMANCE_PARTIAL_MARKER = '<anime-';

const THINK_TAG_PATTERN = /<think>([\s\S]*?)<\/think>/gi;
const THINK_PARTIAL_OPEN = /<think>(?![\s\S]*<\/think>)/i;

const VALID_EMOTIONS = ['neutral', 'warm', 'excited', 'shy', 'playful', 'thoughtful'] as const;
const VALID_GESTURES = ['none', 'nod', 'handToHeart', 'handToCheek', 'wave', 'point'] as const;
const VALID_GAZES = ['camera', 'soft', 'down', 'side'] as const;
const VALID_REACTIONS = ['none', 'softSmile', 'giggle', 'surprised', 'bashful'] as const;
const VALID_IDLE_STYLES = ['neutral', 'cozy', 'bashful', 'curious'] as const;

const PERFORMANCE_TAG_PATTERN = /<anime-performance\b[^>]*\/>/i;
const ATTRIBUTE_PATTERN = /([a-zA-Z]+)="([^"]*)"/g;

export const DEFAULT_AVATAR_TUNING: AvatarTuning = {
  baselineMood: 0.42,
  animationIntensity: 0.72,
  talkiness: 0.64,
  gazeStrength: 0.6,
  gestureFrequency: 0.58,
  style: 'sweet',
};

export const DEFAULT_AVATAR_METADATA: AvatarPerformanceMetadata = {
  emotion: 'neutral',
  energy: 0.34,
  intimacy: 0.42,
  gesture: 'none',
  gaze: 'soft',
  talkIntensity: 0.35,
  reaction: 'none',
  idle: 'neutral',
  sceneBeat: 'steady',
};

export interface ParsedAssistantPerformance {
  visibleText: string;
  metadata: AvatarPerformanceMetadata;
  source: AvatarMetadataSource;
}

export interface AvatarPresentationFrame {
  phase: AvatarPhase;
  moodCarry: number;
  speechBlend: number;
  reactionBlend: number;
  settleBlend: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeEnum<T extends readonly string[]>(
  value: string | undefined,
  valid: T,
  fallback: T[number],
): T[number] {
  if (!value) return fallback;
  return (valid as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

function readAttributeMap(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(ATTRIBUTE_PATTERN)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function pickSceneBeat(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(let['’]?s think|consider|perhaps|maybe)\b/.test(lower)) return 'consider';
  if (/\b(glad|happy to|you can|i can help)\b/.test(lower)) return 'reassure';
  if (/\b(hehe|wink|tease|sneaky|play)\b/.test(lower)) return 'tease';
  if (/[!?]{2,}/.test(text) || /\b(amazing|wow|yay|omg)\b/.test(lower)) return 'spark';
  return 'steady';
}

function inferEmotion(text: string): AvatarEmotion {
  const lower = text.toLowerCase();

  if (/\b(consider|perhaps|maybe|let['’]?s think|analyze|hmm)\b/.test(lower)) return 'thoughtful';
  if (/\b(hehe|wink|tease|playful|sneaky)\b/.test(lower)) return 'playful';
  if (/\b(blush|eep|um|uh|kinda|maybe i)\b/.test(lower)) return 'shy';
  if (/[!?]{2,}/.test(text) || /\b(amazing|yay|wow|absolutely|perfect)\b/.test(lower)) return 'excited';
  if (/\b(glad|sweet|love|adorable|happy to|gentle)\b/.test(lower)) return 'warm';
  return 'neutral';
}

function inferEnergy(text: string, emotion: AvatarEmotion): number {
  const exclamations = (text.match(/!/g) ?? []).length;
  const questions = (text.match(/\?/g) ?? []).length;
  const lengthFactor = clamp01(text.trim().length / 220);
  const emotionBoost =
    emotion === 'excited' ? 0.3 :
      emotion === 'playful' ? 0.18 :
        emotion === 'thoughtful' ? 0.1 :
          emotion === 'shy' ? 0.06 :
            emotion === 'warm' ? 0.14 : 0;

  return clamp01(0.24 + exclamations * 0.08 + questions * 0.03 + lengthFactor * 0.16 + emotionBoost);
}

function inferIntimacy(text: string, emotion: AvatarEmotion): number {
  const lower = text.toLowerCase();
  const rapportBoost =
    /\b(you|your|we|us|together)\b/.test(lower) ? 0.14 : 0;
  const warmBoost =
    emotion === 'warm' ? 0.18 :
      emotion === 'shy' ? 0.12 :
        emotion === 'playful' ? 0.1 : 0;

  return clamp01(0.32 + rapportBoost + warmBoost);
}

function inferGesture(emotion: AvatarEmotion, text: string): AvatarGesture {
  if (/[!?]{2,}/.test(text)) return 'wave';

  switch (emotion) {
    case 'warm':
      return 'handToHeart';
    case 'shy':
      return 'handToCheek';
    case 'excited':
      return 'wave';
    case 'playful':
      return 'point';
    case 'thoughtful':
      return 'nod';
    default:
      return 'none';
  }
}

function inferGaze(emotion: AvatarEmotion): AvatarGazeMode {
  switch (emotion) {
    case 'shy':
      return 'down';
    case 'thoughtful':
      return 'side';
    case 'warm':
      return 'camera';
    default:
      return 'soft';
  }
}

function inferReaction(emotion: AvatarEmotion): AvatarReaction {
  switch (emotion) {
    case 'warm':
      return 'softSmile';
    case 'excited':
      return 'surprised';
    case 'shy':
      return 'bashful';
    case 'playful':
      return 'giggle';
    default:
      return 'none';
  }
}

function inferIdleStyle(emotion: AvatarEmotion): AvatarIdleStyle {
  switch (emotion) {
    case 'warm':
      return 'cozy';
    case 'shy':
      return 'bashful';
    case 'thoughtful':
      return 'curious';
    default:
      return 'neutral';
  }
}

/**
 * Parse `<think>...</think>` blocks from raw LLM output.
 *
 * Returns the extracted thoughts (concatenated if multiple) and the
 * remaining text with think blocks removed.  Handles partial/unclosed
 * think tags during streaming by stripping everything from the opening
 * `<think>` onward.
 *
 * @param rawText - Raw LLM output potentially containing think tags.
 * @returns Object with `thoughts` (null if none) and `visibleText`.
 */
export function parseThinkTags(rawText: string): { thoughts: string | null; visibleText: string } {
  const thoughts: string[] = [];
  let cleaned = rawText.replace(THINK_TAG_PATTERN, (_match, content: string) => {
    const trimmed = content.trim();
    if (trimmed) thoughts.push(trimmed);
    return '';
  });

  // Handle partial/unclosed <think> tag during streaming — strip from opening tag onward.
  const partialMatch = cleaned.match(THINK_PARTIAL_OPEN);
  if (partialMatch?.index !== undefined) {
    cleaned = cleaned.slice(0, partialMatch.index);
  }

  return {
    thoughts: thoughts.length > 0 ? thoughts.join('\n\n') : null,
    visibleText: cleaned.trim(),
  };
}

export function sanitizeAssistantVisibleText(rawText: string): string {
  // Strip think tags first, then performance tags.
  const { visibleText: afterThink } = parseThinkTags(rawText);

  const lower = afterThink.toLowerCase();
  const markerIndices = [
    lower.indexOf(PERFORMANCE_OPEN_MARKER),
    lower.indexOf(PERFORMANCE_PARTIAL_MARKER),
  ].filter((index) => index >= 0);

  if (markerIndices.length === 0) {
    return afterThink.trimEnd();
  }

  const cutIndex = Math.min(...markerIndices);
  return afterThink.slice(0, cutIndex).trimEnd();
}

export function parseInlinePerformanceMetadata(rawText: string): AvatarPerformanceMetadata | null {
  const tagMatch = rawText.match(PERFORMANCE_TAG_PATTERN);
  if (!tagMatch) return null;

  const attrs = readAttributeMap(tagMatch[0]);
  const emotion = normalizeEnum(attrs.emotion, VALID_EMOTIONS, DEFAULT_AVATAR_METADATA.emotion);
  const gesture = normalizeEnum(attrs.gesture, VALID_GESTURES, DEFAULT_AVATAR_METADATA.gesture);
  const gaze = normalizeEnum(attrs.gaze, VALID_GAZES, DEFAULT_AVATAR_METADATA.gaze);
  const reaction = normalizeEnum(attrs.reaction, VALID_REACTIONS, DEFAULT_AVATAR_METADATA.reaction);
  const idle = normalizeEnum(attrs.idle, VALID_IDLE_STYLES, DEFAULT_AVATAR_METADATA.idle);

  return {
    emotion,
    energy: clamp01(Number.parseFloat(attrs.energy ?? `${DEFAULT_AVATAR_METADATA.energy}`)),
    intimacy: clamp01(Number.parseFloat(attrs.intimacy ?? `${DEFAULT_AVATAR_METADATA.intimacy}`)),
    gesture,
    gaze,
    talkIntensity: clamp01(Number.parseFloat(attrs.talkIntensity ?? `${DEFAULT_AVATAR_METADATA.talkIntensity}`)),
    reaction,
    idle,
    sceneBeat: attrs.sceneBeat?.trim() || pickSceneBeat(rawText),
  };
}

export function inferPerformanceMetadata(text: string): AvatarPerformanceMetadata {
  const emotion = inferEmotion(text);
  return {
    emotion,
    energy: inferEnergy(text, emotion),
    intimacy: inferIntimacy(text, emotion),
    gesture: inferGesture(emotion, text),
    gaze: inferGaze(emotion),
    talkIntensity: clamp01(0.24 + clamp01(text.trim().length / 180) * 0.4 + (text.includes('!') ? 0.1 : 0)),
    reaction: inferReaction(emotion),
    idle: inferIdleStyle(emotion),
    sceneBeat: pickSceneBeat(text),
  };
}

export function parseAssistantPerformance(rawText: string): ParsedAssistantPerformance {
  const visibleText = sanitizeAssistantVisibleText(rawText);
  const inlineMetadata = parseInlinePerformanceMetadata(rawText);

  if (inlineMetadata) {
    return {
      visibleText,
      metadata: inlineMetadata,
      source: 'inline',
    };
  }

  return {
    visibleText,
    metadata: inferPerformanceMetadata(visibleText),
    source: 'fallback',
  };
}

export function estimateSpeechDurationMs(text: string, talkIntensity: number, rateMultiplier = 1): number {
  const safeRate = clampRange(rateMultiplier, 0.5, 2);
  const baseDuration = 850 + text.trim().length * 34 + talkIntensity * 900;
  return Math.round(clampRange(baseDuration / safeRate, 900, 9500));
}

export function createInitialAvatarRuntime(
  tuning: AvatarTuning = DEFAULT_AVATAR_TUNING,
  now = Date.now(),
): AvatarRuntimeState {
  return {
    phase: 'idle',
    moodCarry: tuning.baselineMood,
    metadataSource: 'system',
    lastAssistantText: '',
    lastUserText: '',
    phaseStartedAt: now,
    lastUpdatedAt: now,
    speechPlaybackActive: false,
    speechStartedAt: null,
    speechUntil: null,
    reactionUntil: null,
    settleUntil: null,
    debugLabel: 'Idle baseline',
    ...DEFAULT_AVATAR_METADATA,
  };
}

export function buildPerformancePromptMessages(
  history: { role: string; content: string }[],
): { role: string; content: string }[] {
  return [
    {
      role: 'user',
      content: [
        'Internal direction for AnimeGirly only.',
        'Reply naturally to the user.',
        'Then append exactly one hidden self-closing tag on a new line in this format:',
        `<${PERFORMANCE_TAG_NAME} emotion="neutral|warm|excited|shy|playful|thoughtful" energy="0.00-1.00" intimacy="0.00-1.00" gesture="none|nod|handToHeart|handToCheek|wave|point" gaze="camera|soft|down|side" talkIntensity="0.00-1.00" reaction="none|softSmile|giggle|surprised|bashful" idle="neutral|cozy|bashful|curious" sceneBeat="short-phrase" />`,
        'Do not explain the tag, do not wrap it in code fences, and do not omit it.',
      ].join(' '),
    },
    {
      role: 'assistant',
      content: 'Understood. I will keep the visible reply natural and append the hidden performance tag.',
    },
    ...history,
  ];
}

function updateMoodCarry(
  previous: AvatarRuntimeState,
  metadata: AvatarPerformanceMetadata,
  tuning: AvatarTuning,
): number {
  const decay = previous.moodCarry * 0.68;
  const energyLift = metadata.energy * 0.22;
  const intimacyLift = metadata.intimacy * 0.16;
  const styleLift =
    tuning.style === 'sweet' ? 0.06 :
      tuning.style === 'playful' ? 0.08 : 0.03;

  return clamp01(decay + energyLift + intimacyLift + styleLift);
}

export function createThinkingAvatarState(
  previous: AvatarRuntimeState,
  lastUserText: string,
  now = Date.now(),
): AvatarRuntimeState {
  return {
    ...previous,
    phase: 'thinking',
    lastUserText,
    gesture: 'none',
    reaction: 'none',
    talkIntensity: 0.08,
    speechPlaybackActive: false,
    speechStartedAt: null,
    speechUntil: null,
    reactionUntil: null,
    settleUntil: null,
    phaseStartedAt: now,
    lastUpdatedAt: now,
    debugLabel: 'Thinking',
  };
}

export function createStreamingAvatarState(
  previous: AvatarRuntimeState,
  lastUserText: string,
  rawAssistantText: string,
  tuning: AvatarTuning,
  now = Date.now(),
): AvatarRuntimeState {
  const visibleText = sanitizeAssistantVisibleText(rawAssistantText);
  const metadata = visibleText.trim().length > 0
    ? inferPerformanceMetadata(visibleText)
    : previous;

  return {
    ...previous,
    phase: 'speaking',
    lastUserText,
    lastAssistantText: visibleText,
    emotion: metadata.emotion,
    energy: clamp01(metadata.energy * 0.92),
    intimacy: metadata.intimacy,
    gesture: metadata.gesture === 'none' ? 'nod' : metadata.gesture,
    gaze: metadata.gaze,
    talkIntensity: clamp01(metadata.talkIntensity * (0.75 + tuning.talkiness * 0.35)),
    reaction: 'none',
    idle: metadata.idle,
    sceneBeat: metadata.sceneBeat,
    metadataSource: 'fallback',
    moodCarry: clamp01(previous.moodCarry * 0.82 + metadata.energy * 0.12),
    speechPlaybackActive: false,
    speechStartedAt: null,
    speechUntil: now + estimateSpeechDurationMs(visibleText, metadata.talkIntensity),
    reactionUntil: null,
    settleUntil: null,
    phaseStartedAt: previous.phase === 'speaking' ? previous.phaseStartedAt : now,
    lastUpdatedAt: now,
    debugLabel: 'Streaming response',
  };
}

export function createAssistantAvatarState(
  previous: AvatarRuntimeState,
  lastUserText: string,
  rawAssistantText: string,
  tuning: AvatarTuning,
  now = Date.now(),
): AvatarRuntimeState {
  const parsed = parseAssistantPerformance(rawAssistantText);
  const reactionDuration = Math.round(750 + parsed.metadata.energy * 850);
  const settleDuration = Math.round(900 + (1 - parsed.metadata.energy) * 700);

  return {
    ...previous,
    ...parsed.metadata,
    phase: 'reacting',
    moodCarry: updateMoodCarry(previous, parsed.metadata, tuning),
    metadataSource: parsed.source,
    lastAssistantText: parsed.visibleText,
    lastUserText,
    speechPlaybackActive: false,
    speechStartedAt: null,
    speechUntil: now + estimateSpeechDurationMs(parsed.visibleText, parsed.metadata.talkIntensity),
    reactionUntil: now + reactionDuration,
    settleUntil: now + reactionDuration + settleDuration,
    phaseStartedAt: now,
    lastUpdatedAt: now,
    debugLabel: parsed.source === 'inline' ? 'Tagged response' : 'Heuristic response',
  };
}

export function createAvatarFailureState(
  previous: AvatarRuntimeState,
  debugLabel: string,
  now = Date.now(),
): AvatarRuntimeState {
  return {
    ...previous,
    phase: 'settling',
    gesture: 'none',
    reaction: 'none',
    speechPlaybackActive: false,
    speechStartedAt: null,
    speechUntil: null,
    reactionUntil: null,
    settleUntil: now + 900,
    phaseStartedAt: now,
    lastUpdatedAt: now,
    debugLabel,
  };
}

export function createSpeechPlaybackState(
  previous: AvatarRuntimeState,
  text: string,
  now = Date.now(),
): AvatarRuntimeState {
  const duration = estimateSpeechDurationMs(text, Math.max(previous.talkIntensity, 0.42));
  return {
    ...previous,
    phase: 'speaking',
    speechPlaybackActive: true,
    speechStartedAt: now,
    speechUntil: now + duration,
    phaseStartedAt: now,
    lastUpdatedAt: now,
    debugLabel: 'Voice playback',
  };
}

export function createSpeechPlaybackCompleteState(
  previous: AvatarRuntimeState,
  now = Date.now(),
): AvatarRuntimeState {
  const shouldReact = previous.reactionUntil !== null && previous.reactionUntil > now;
  return {
    ...previous,
    phase: shouldReact ? 'reacting' : 'settling',
    speechPlaybackActive: false,
    speechStartedAt: null,
    speechUntil: null,
    settleUntil: previous.settleUntil ?? now + 700,
    lastUpdatedAt: now,
    debugLabel: 'Voice playback complete',
  };
}

export function resolveAvatarPresentation(
  runtime: AvatarRuntimeState,
  now: number,
): AvatarPresentationFrame {
  const inSpeechWindow = runtime.speechUntil !== null && runtime.speechUntil > now;
  const reactionBlend = runtime.reactionUntil === null
    ? 0
    : clamp01((runtime.reactionUntil - now) / 1200);
  const settleBlend = runtime.settleUntil === null
    ? 0
    : clamp01((runtime.settleUntil - now) / 1500);

  let phase: AvatarPhase = runtime.phase;

  if (runtime.phase === 'thinking') {
    phase = 'thinking';
  } else if (runtime.speechPlaybackActive || (runtime.phase === 'speaking' && inSpeechWindow)) {
    phase = 'speaking';
  } else if (runtime.reactionUntil !== null && now < runtime.reactionUntil) {
    phase = 'reacting';
  } else if (runtime.settleUntil !== null && now < runtime.settleUntil) {
    phase = 'settling';
  } else {
    phase = 'idle';
  }

  return {
    phase,
    moodCarry: runtime.moodCarry,
    speechBlend: phase === 'speaking' ? (runtime.speechPlaybackActive ? 1 : 0.72) : 0,
    reactionBlend: phase === 'reacting' ? reactionBlend : 0,
    settleBlend: phase === 'settling' ? settleBlend : 0,
  };
}
