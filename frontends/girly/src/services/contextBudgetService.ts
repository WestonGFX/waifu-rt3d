import { type ChatMessage, type ProviderConfig } from '../types/index.ts';
import {
  type EnvironmentSceneProfile,
  type MemoryRecord,
  type PersonaProfile,
  type RoomRuntimeState,
  type ThreadSummaryRecord,
} from '../types/companion.ts';
import { type ContentRatingLevel, type IntimacyState } from '../types/content.ts';
import { type PsychologyState } from '../types/psychology.ts';

export interface ContextBudgetSegment {
  id:
    | 'persona'
    | 'summaries'
    | 'memory'
    | 'recent'
    | 'room'
    | 'staging'
    | 'provider'
    | 'routing'
    | 'content'
    | 'psychology'
    | 'lorebook'
    | 'free'
    | 'response';
  label: string;
  tokens: number;
  colorClass: string;
  colorHex: string;
  tintClass: string;
}

export interface ContextBudgetBreakdown {
  contextWindow: number;
  reservedOutputTokens: number;
  usableInputTokens: number;
  usedInputTokens: number;
  remainingInputTokens: number;
  usageRatio: number;
  segments: ContextBudgetSegment[];
}

export interface ContextBudgetRuntimeDescriptor {
  providerId: string;
  modelId?: string;
  fallbackChain?: string[];
  fallbackTriggers?: string[];
  contextWindow?: number;
}

/**
 * Improved token estimation using a hybrid heuristic:
 *   - Word-based estimate: ~1.3 tokens per word (accounts for subword tokenization)
 *   - Character-based estimate: ~1 token per 3.5 chars (slightly conservative)
 *   - Final estimate: weighted average biased toward the higher estimate
 *
 * This replaces the naive `length / 4` which underestimates for code,
 * non-ASCII text, and short messages with many distinct words.
 */
function estimateTextTokens(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;

  // Word-based: split on whitespace + punctuation boundaries
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordEstimate = Math.ceil(words.length * 1.3);

  // Character-based: ~3.5 chars per token (conservative vs old /4)
  const charEstimate = Math.ceil(trimmed.length / 3.5);

  // Take the higher estimate to avoid underbudgeting (the #1 risk)
  return Math.max(wordEstimate, charEstimate);
}

export function estimateTokenCount(text: string): number {
  return estimateTextTokens(text);
}

function buildRoomBudgetText(
  currentEnvironment?: EnvironmentSceneProfile | null,
): string {
  if (!currentEnvironment) return '';

  const parts = [
    currentEnvironment?.name,
    currentEnvironment?.category,
  ].filter(Boolean);

  return parts.join(' · ');
}

function buildStagingBudgetText(
  roomRuntime?: RoomRuntimeState | null,
): string {
  if (!roomRuntime) return '';

  const parts = [
    roomRuntime.roomMode,
    roomRuntime.currentAnchorId ? `anchor:${roomRuntime.currentAnchorId}` : null,
    roomRuntime.currentHotspotId ? `hotspot:${roomRuntime.currentHotspotId}` : null,
  ].filter(Boolean);

  return parts.join(' · ');
}

function buildProviderBudgetText(
  runtimeDescriptor?: ContextBudgetRuntimeDescriptor | null,
): string {
  if (!runtimeDescriptor) return '';

  const parts = [
    runtimeDescriptor.providerId,
    runtimeDescriptor.modelId,
    runtimeDescriptor.contextWindow ? `window:${runtimeDescriptor.contextWindow}` : null,
  ].filter(Boolean);

  return parts.join(' · ');
}

function buildRoutingBudgetText(
  runtimeDescriptor?: ContextBudgetRuntimeDescriptor | null,
): string {
  if (!runtimeDescriptor) return '';

  const parts = [
    runtimeDescriptor.fallbackChain?.length ? `fallbacks:${runtimeDescriptor.fallbackChain.join('->')}` : null,
    runtimeDescriptor.fallbackTriggers?.length ? `triggers:${runtimeDescriptor.fallbackTriggers.join(',')}` : null,
  ].filter(Boolean);

  return parts.join(' · ');
}

export function createContextBudgetRuntimeDescriptor(
  providerConfig: ProviderConfig,
  currentRuntimeModelId?: string,
  effectiveContextWindow?: number,
): ContextBudgetRuntimeDescriptor {
  return {
    providerId: providerConfig.llm.primary,
    modelId: currentRuntimeModelId,
    fallbackChain: providerConfig.llm.fallbacks,
    fallbackTriggers: providerConfig.llm.fallbackTriggers,
    contextWindow: effectiveContextWindow,
  };
}

export function buildContextBudgetBreakdown({
  persona,
  summaries,
  retrievedMemories,
  recentMessages,
  currentEnvironment,
  roomRuntime,
  runtimeDescriptor,
  contentCeiling,
  intimacyState,
  psychologyState,
  lorebookTokens,
  contextWindow = 4096,
}: {
  persona: PersonaProfile | null;
  summaries?: ThreadSummaryRecord[];
  retrievedMemories?: MemoryRecord[];
  recentMessages?: ChatMessage[];
  currentEnvironment?: EnvironmentSceneProfile | null;
  roomRuntime?: RoomRuntimeState | null;
  runtimeDescriptor?: ContextBudgetRuntimeDescriptor | null;
  contentCeiling?: ContentRatingLevel | null;
  intimacyState?: IntimacyState | null;
  psychologyState?: PsychologyState | null;
  lorebookTokens?: number;
  contextWindow?: number;
}): ContextBudgetBreakdown {
  const reservedOutputTokens = Math.round(contextWindow * 0.25);
  const usableInputTokens = Math.max(0, contextWindow - reservedOutputTokens);
  const personaPrompt = persona?.rawPromptOverride?.trim() || persona?.generatedSystemPrompt?.trim() || '';

  const segments: ContextBudgetSegment[] = [
    {
      id: 'persona',
      label: 'Character prompt',
      tokens: estimateTextTokens(personaPrompt),
      colorClass: 'bg-fuchsia-400',
      colorHex: '#8b5cf6',
      tintClass: 'border-fuchsia-200 bg-fuchsia-100 text-fuchsia-700',
    },
    {
      id: 'summaries',
      label: 'Thread summaries',
      tokens: (summaries ?? []).slice(-2).reduce((total, summary) => total + estimateTextTokens(summary.summaryText), 0),
      colorClass: 'bg-sky-400',
      colorHex: '#3b82f6',
      tintClass: 'border-sky-200 bg-sky-100 text-sky-700',
    },
    {
      id: 'memory',
      label: 'Saved memories',
      tokens: (retrievedMemories ?? []).slice(0, 3).reduce((total, memory) => total + estimateTextTokens(memory.text), 0),
      colorClass: 'bg-amber-400',
      colorHex: '#f59e0b',
      tintClass: 'border-amber-200 bg-amber-100 text-amber-700',
    },
    {
      id: 'recent',
      label: 'Recent chat',
      tokens: (recentMessages ?? []).reduce((total, message) => total + estimateTextTokens(message.content), 0),
      colorClass: 'bg-emerald-400',
      colorHex: '#10b981',
      tintClass: 'border-emerald-200 bg-emerald-100 text-emerald-700',
    },
  ];

  // Content system segments — estimate token cost of content/intimacy blocks
  if (contentCeiling && contentCeiling !== 'general') {
    // Rough estimate: content directive + intimacy gate + physical awareness
    const contentTokenEstimate = 80 + ((intimacyState?.level ?? 0) > 30 ? 60 : 0);
    segments.push({
      id: 'content',
      label: 'Content gating',
      tokens: contentTokenEstimate,
      colorClass: 'bg-rose-400',
      colorHex: '#f43f5e',
      tintClass: 'border-rose-200 bg-rose-100 text-rose-700',
    });
  }

  // Psychology engine segment
  if (psychologyState) {
    // Rough estimate: psychology prompt block
    const psychTokenEstimate = 100;
    segments.push({
      id: 'psychology',
      label: 'Psychology engine',
      tokens: psychTokenEstimate,
      colorClass: 'bg-indigo-400',
      colorHex: '#6366f1',
      tintClass: 'border-indigo-200 bg-indigo-100 text-indigo-700',
    });
  }

  // Lorebook / Story Bible segment
  if (lorebookTokens && lorebookTokens > 0) {
    segments.push({
      id: 'lorebook',
      label: 'Story Bible',
      tokens: lorebookTokens,
      colorClass: 'bg-teal-400',
      colorHex: '#2dd4bf',
      tintClass: 'border-teal-200 bg-teal-100 text-teal-700',
    });
  }

  const roomBudgetText = buildRoomBudgetText(currentEnvironment);
  if (roomBudgetText) {
    segments.push({
      id: 'room',
      label: 'Room context',
      tokens: estimateTextTokens(roomBudgetText),
      colorClass: 'bg-cyan-400',
      colorHex: '#06b6d4',
      tintClass: 'border-cyan-200 bg-cyan-100 text-cyan-700',
    });
  }

  const stagingBudgetText = buildStagingBudgetText(roomRuntime);
  if (stagingBudgetText) {
    segments.push({
      id: 'staging',
      label: 'Stage state',
      tokens: estimateTextTokens(stagingBudgetText),
      colorClass: 'bg-violet-400',
      colorHex: '#ec4899',
      tintClass: 'border-violet-200 bg-violet-100 text-violet-700',
    });
  }

  const providerBudgetText = buildProviderBudgetText(runtimeDescriptor);
  if (providerBudgetText) {
    segments.push({
      id: 'provider',
      label: 'Provider and model',
      tokens: estimateTextTokens(providerBudgetText),
      colorClass: 'bg-orange-400',
      colorHex: '#f97316',
      tintClass: 'border-orange-200 bg-orange-100 text-orange-700',
    });
  }

  const routingBudgetText = buildRoutingBudgetText(runtimeDescriptor);
  if (routingBudgetText) {
    segments.push({
      id: 'routing',
      label: 'Routing rules',
      tokens: estimateTextTokens(routingBudgetText),
      colorClass: 'bg-pink-400',
      colorHex: '#ef4444',
      tintClass: 'border-pink-200 bg-pink-100 text-pink-700',
    });
  }

  const usedInputTokens = segments.reduce((total, segment) => total + segment.tokens, 0);
  const remainingInputTokens = Math.max(0, usableInputTokens - usedInputTokens);

  segments.push({
    id: 'free',
    label: 'Free space',
    tokens: remainingInputTokens,
    colorClass: 'bg-slate-200',
    colorHex: 'rgba(255,255,255,0.55)',
    tintClass: 'border-slate-200 bg-slate-100 text-slate-700',
  });

  segments.push({
    id: 'response',
    label: 'Reserved reply space',
    tokens: reservedOutputTokens,
    colorClass: 'bg-anime-300',
    colorHex: 'var(--color-anime-300)',
    tintClass: 'border-anime-200 bg-anime-50 text-anime-700',
  });

  return {
    contextWindow,
    reservedOutputTokens,
    usableInputTokens,
    usedInputTokens,
    remainingInputTokens,
    usageRatio: contextWindow > 0 ? Math.min(1, usedInputTokens / contextWindow) : 0,
    segments,
  };
}
