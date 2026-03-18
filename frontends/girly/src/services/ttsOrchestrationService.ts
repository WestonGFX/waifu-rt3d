import { type TTSProviderRef, type TTSVoiceProfile } from '../types/companion.ts';

export function normalizeSpeechText(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').replace(/\s*([,.!?;:])\s*/g, '$1 ').trim())
    .filter(Boolean)
    .join('\n\n');
}

function mergeChunks(parts: string[], maxLength: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    if (!current) {
      current = part;
      continue;
    }

    if (`${current} ${part}`.length <= maxLength) {
      current = `${current} ${part}`;
      continue;
    }

    chunks.push(current);
    current = part;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export function chunkSpeechText(
  text: string,
  mode: TTSVoiceProfile['chunkingMode'],
  maxLength = 280,
): string[] {
  const normalized = normalizeSpeechText(text);
  if (!normalized) return [];

  if (mode === 'provider-default') {
    return [normalized];
  }

  if (mode === 'paragraph') {
    return normalized.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  }

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [normalized];
  return mergeChunks(sentences, maxLength);
}

export function resolveSpeechChain(profile: TTSVoiceProfile): TTSProviderRef[] {
  return [profile.primary, ...profile.fallbacks];
}

export function convertGainDbToLinear(playbackGainDb: number): number {
  return 10 ** (playbackGainDb / 20);
}
