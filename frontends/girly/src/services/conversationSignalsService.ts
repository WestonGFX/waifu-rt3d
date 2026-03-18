import { inferPerformanceMetadata } from './avatarPerformanceService.ts';
import { type ChatMessage } from '../types/index.ts';
import { type MemoryRecord } from '../types/companion.ts';

export interface MessageEmotionSignal {
  label: string | null;
  toneClass: string;
  confidence: number;
}

export function getMessageEmotionSignal(message: ChatMessage): MessageEmotionSignal {
  const content = message.content.trim();
  if (!content || message.role === 'user') {
    return { label: null, toneClass: 'border-anime-100 bg-anime-50 text-text-muted', confidence: 0 };
  }

  const lowered = content.toLowerCase();
  const exclamations = (content.match(/!/g) ?? []).length;
  const questions = (content.match(/\?/g) ?? []).length;
  const ellipses = (content.match(/\.\.\.|…/g) ?? []).length;
  const hearts = (content.match(/[♡♥]/g) ?? []).length;

  const score = {
    warm: 0,
    playful: 0,
    excited: 0,
    shy: 0,
    thoughtful: 0,
    intense: 0,
  };

  const includesAny = (terms: string[]) => terms.some((term) => lowered.includes(term));

  if (includesAny(['love', 'sweet', 'darling', 'dear', 'cute', 'honey', 'baby', 'kiss', 'snuggle']) || hearts > 0) {
    score.warm += 2 + hearts;
  }
  if (includesAny(['hehe', 'haha', 'giggle', 'tease', 'playful', 'wink', 'flirty', 'date'])) {
    score.playful += 2;
  }
  if (includesAny(['wow', 'omg', 'amazing', 'lets go', "let's go", 'yay']) || exclamations >= 2) {
    score.excited += 2 + Math.min(2, exclamations);
  }
  if (includesAny(['maybe', 'kind of', 'sort of', 'um', 'uh', 'blush', 'nervous', 'sorry']) || ellipses > 0) {
    score.shy += 1 + Math.min(2, ellipses);
  }
  if (includesAny(['think', 'wonder', 'perhaps', 'should', 'could', 'maybe', 'because']) || questions > 0) {
    score.thoughtful += 1 + Math.min(2, questions);
  }
  if (includesAny(['sex', 'now', 'need', 'must', 'demand', 'angry', 'furious']) || exclamations >= 3) {
    score.intense += 2;
  }

  const metadata = inferPerformanceMetadata(content);
  switch (metadata.emotion) {
    case 'warm':
      score.warm += 1.25;
      break;
    case 'excited':
      score.excited += 1.25;
      break;
    case 'shy':
      score.shy += 1.25;
      break;
    case 'playful':
      score.playful += 1.25;
      break;
    case 'thoughtful':
      score.thoughtful += 1.25;
      break;
    default:
      break;
  }

  const ranked = Object.entries(score).sort((left, right) => right[1] - left[1]);
  const [topLabel, topScore] = ranked[0] ?? ['steady', 0];
  const secondScore = ranked[1]?.[1] ?? 0;
  const confidence = Math.max(0, topScore - secondScore);

  if (topScore < 1.6 || confidence < 0.95) {
    return { label: null, toneClass: 'border-anime-100 bg-anime-50 text-text-muted', confidence: 0 };
  }

  switch (topLabel) {
    case 'warm':
      return { label: 'Warm', toneClass: 'border-rose-pastel-200 bg-rose-pastel-50 text-rose-pastel-400', confidence };
    case 'playful':
      return { label: 'Playful', toneClass: 'border-sky-200 bg-sky-50 text-sky-700', confidence };
    case 'excited':
      return { label: 'Excited', toneClass: 'border-amber-200 bg-amber-50 text-amber-700', confidence };
    case 'shy':
      return { label: 'Shy', toneClass: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700', confidence };
    case 'thoughtful':
      return { label: 'Thoughtful', toneClass: 'border-slate-200 bg-slate-50 text-slate-700', confidence };
    case 'intense':
      return { label: 'Intense', toneClass: 'border-rose-pastel-300 bg-rose-pastel-100 text-rose-pastel-400', confidence };
    default:
      return { label: null, toneClass: 'border-anime-100 bg-anime-50 text-text-muted', confidence: 0 };
  }
}

export function getMemoriesCreatedFromMessage(messageId: string, memoryRecords: MemoryRecord[]): MemoryRecord[] {
  return memoryRecords.filter((memory) => memory.sourceMessageIds.includes(messageId));
}
