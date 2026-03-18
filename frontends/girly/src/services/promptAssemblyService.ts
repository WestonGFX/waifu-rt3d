import { type ChatMessage } from '../types/index.ts';
import { type PersonaProfile, type ThreadSummaryRecord, type MemoryRecord, type EpisodicMemory, type KnowledgeBoundary } from '../types/companion.ts';
import { type ContentRatingLevel, type IntimacyState, type PhysicalState, type SensoryWritingConfig } from '../types/content.ts';
import { type PsychologyState } from '../types/psychology.ts';
import { type LorebookEntry } from '../types/lorebook.ts';
import { type MilestoneDefinition } from '../services/milestoneService.ts';
import { buildMilestonePromptBlock } from '../services/milestoneService.ts';
import { type WorkingMemoryFact } from '../services/workingMemoryService.ts';
import { buildWorkingMemoryBlock } from '../services/workingMemoryService.ts';
import { formatEpisodicMemoryBlock } from './episodicMemoryService.ts';
import { buildKnowledgeBoundaryBlock } from './knowledgeBoundaryService.ts';
import { buildContradictionAlertBlock, type ContradictionPair } from './contradictionDetectionService.ts';
import {
  buildContentDirectiveBlock,
  buildIntimacyGateBlock,
  buildPhysicalAwarenessBlock,
  buildSensoryWritingBlock,
} from './contentPromptService.ts';
import { buildPsychologyPromptBlock } from './psychologyEngineService.ts';

export interface PromptAssemblyInput {
  persona: PersonaProfile | null;
  recentMessages: ChatMessage[];
  summaries?: ThreadSummaryRecord[];
  retrievedMemories?: MemoryRecord[];
  userMessage: ChatMessage;
  /** Content system inputs (optional — omitted when content system is not active). */
  contentCeiling?: ContentRatingLevel;
  intimacyState?: IntimacyState;
  physicalState?: PhysicalState;
  sensoryWritingConfig?: SensoryWritingConfig;
  /** Psychology engine state (optional — omitted when engine is not configured). */
  psychologyState?: PsychologyState;
  /** Lorebook entries activated by the trigger scanner (optional). */
  lorebookEntries?: LorebookEntry[];
  /** Author's Note — injected at a specific depth from the end of conversation turns. */
  authorsNote?: { content: string; depth: number };
  /** Achieved milestones for behavioral prompt injection (optional). */
  achievedMilestones?: MilestoneDefinition[];
  /** Working memory facts extracted from the current conversation (optional). */
  workingMemoryFacts?: WorkingMemoryFact[];
  /** Episodic memories — emotionally significant moments from past conversations (optional). */
  episodicMemories?: EpisodicMemory[];
  /** Knowledge boundaries — what the companion knows / doesn't know about the user (optional). */
  knowledgeBoundaries?: KnowledgeBoundary[];
  /** Contradiction alerts — conflicting memory pairs to resolve gently (optional). */
  contradictionAlerts?: ContradictionPair[];
}

export function shouldCompactContext(contextWindow: number, estimatedInputTokens: number, messageCount: number): boolean {
  return estimatedInputTokens > contextWindow * 0.6 || messageCount > 40;
}

export function estimateMessageTokens(messages: { content: string }[]): number {
  return messages.reduce((total, message) => total + Math.ceil(message.content.length / 4), 0);
}

export function keepRecentMessages(messages: ChatMessage[], minTurns = 10): ChatMessage[] {
  if (messages.length <= minTurns) return messages;
  return messages.slice(-minTurns);
}

/**
 * Collect all director notes from the recent message window.
 *
 * Director notes are meta-instructions written by the user to steer
 * the character's behaviour.  They are NOT shown to the AI as conversation
 * turns — instead they are bundled into a single system-level stage
 * direction block injected right before the latest user message.
 *
 * Only director notes that appear AFTER the last assistant message are
 * "active" — older ones have already been acted upon.
 */
function collectActiveDirectorNotes(messages: ChatMessage[]): string[] {
  const notes: string[] = [];

  // Walk backwards to find the last assistant message boundary.
  let boundary = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      boundary = i;
      break;
    }
  }

  // Collect director notes that come after the last assistant turn.
  for (let i = boundary + 1; i < messages.length; i++) {
    if (messages[i].role === 'director') {
      notes.push(messages[i].content);
    }
  }

  return notes;
}

/**
 * Also collect ALL director notes within the visible window as "persistent
 * stage directions" — these provide cumulative world-building context even
 * if they appeared before the last assistant turn.
 */
function collectAllDirectorNotes(messages: ChatMessage[]): string[] {
  return messages
    .filter((m) => m.role === 'director')
    .map((m) => m.content);
}

export function buildThreadPromptContext({
  persona,
  recentMessages,
  summaries = [],
  retrievedMemories = [],
  userMessage,
  contentCeiling,
  intimacyState,
  physicalState,
  sensoryWritingConfig,
  psychologyState,
  lorebookEntries = [],
  authorsNote,
  achievedMilestones = [],
  workingMemoryFacts = [],
  episodicMemories = [],
  knowledgeBoundaries = [],
  contradictionAlerts = [],
}: PromptAssemblyInput): { role: string; content: string }[] {
  const promptMessages: { role: string; content: string }[] = [];
  const personaPrompt = persona?.rawPromptOverride?.trim() || persona?.generatedSystemPrompt?.trim();

  // 1. Persona system prompt
  if (personaPrompt) {
    promptMessages.push(
      {
        role: 'user',
        content: [
          'Companion persona directive for this thread.',
          `Stay in character as ${persona?.name ?? 'the active companion'}.`,
          personaPrompt,
          '',
          'You may optionally use <think>...</think> tags before your visible reply to show your internal reasoning, feelings, or character thoughts. This inner monologue will be shown to the user in a collapsible panel. Keep it brief and in-character.',
        ].join('\n\n'),
      },
      {
        role: 'assistant',
        content: `Understood. I will stay in character as ${persona?.name ?? 'the active companion'} while responding naturally.`,
      },
    );
  }

  // 2. Psychology state block (when psychology engine is active)
  if (psychologyState && persona) {
    const psychBlock = buildPsychologyPromptBlock(psychologyState, persona);
    if (psychBlock) {
      promptMessages.push(
        { role: 'user', content: psychBlock },
        { role: 'assistant', content: 'Understood. I will let this internal state naturally shape my responses.' },
      );
    }
  }

  // 2b. Milestone behavioral unlocks (after psychology block)
  if (achievedMilestones.length > 0) {
    const milestoneBlock = buildMilestonePromptBlock(achievedMilestones);
    if (milestoneBlock) {
      promptMessages.push(
        { role: 'user', content: milestoneBlock },
        { role: 'assistant', content: 'Understood. I will incorporate these relationship milestones naturally.' },
      );
    }
  }

  // 3. Content directive block (rating enforcement)
  if (contentCeiling) {
    const intimacyLevel = intimacyState?.level ?? 0;
    const contentBlock = buildContentDirectiveBlock(contentCeiling, intimacyLevel);
    if (contentBlock) {
      promptMessages.push(
        { role: 'user', content: contentBlock },
        { role: 'assistant', content: 'Understood. I will stay within the specified content rating.' },
      );
    }

    // 3a. Sensory writing direction (when enabled)
    if (sensoryWritingConfig) {
      const sensoryBlock = buildSensoryWritingBlock(sensoryWritingConfig, intimacyLevel);
      if (sensoryBlock) {
        promptMessages.push(
          { role: 'user', content: sensoryBlock },
          { role: 'assistant', content: 'Understood. I will weave sensory details naturally.' },
        );
      }
    }
  }

  if (summaries.length > 0) {
    promptMessages.push({
      role: 'user',
      content: [
        'Thread memory summary:',
        ...summaries.slice(-2).map((summary) => summary.summaryText),
      ].join('\n'),
    });
  }

  if (retrievedMemories.length > 0) {
    promptMessages.push({
      role: 'user',
      content: [
        'Retrieved long-term memory:',
        ...retrievedMemories.slice(0, 3).map((memory) => `- (${memory.kind}) ${memory.text}`),
      ].join('\n'),
    });
  }

  // ── Working memory (short-term facts from current conversation) ──
  if (workingMemoryFacts.length > 0) {
    const wmBlock = buildWorkingMemoryBlock(workingMemoryFacts);
    if (wmBlock) {
      promptMessages.push({
        role: 'user',
        content: wmBlock,
      });
    }
  }

  // ── Episodic memories (emotionally significant shared moments) ──
  if (episodicMemories.length > 0) {
    const episodicBlock = formatEpisodicMemoryBlock(episodicMemories);
    if (episodicBlock) {
      promptMessages.push({
        role: 'user',
        content: episodicBlock,
      });
    }
  }

  // ── Knowledge boundaries (what is known / unknown about the user) ──
  if (knowledgeBoundaries.length > 0) {
    const kbBlock = buildKnowledgeBoundaryBlock(knowledgeBoundaries);
    if (kbBlock) {
      promptMessages.push({
        role: 'user',
        content: kbBlock,
      });
    }
  }

  // ── Contradiction alerts (conflicting memories to resolve gently) ──
  if (contradictionAlerts.length > 0) {
    const contradictionBlock = buildContradictionAlertBlock(contradictionAlerts);
    if (contradictionBlock) {
      promptMessages.push(
        { role: 'user', content: contradictionBlock },
        { role: 'assistant', content: 'Understood. I will gently clarify these if the right moment comes up.' },
      );
    }
  }

  // ── Lorebook / Story Bible entries (keyword-triggered world info) ──
  if (lorebookEntries.length > 0) {
    promptMessages.push(
      {
        role: 'user',
        content: [
          '[World Info / Story Bible — background lore relevant to this conversation. Use naturally without quoting directly.]',
          ...lorebookEntries.map((entry) => `[${entry.name}]: ${entry.content}`),
        ].join('\n'),
      },
      {
        role: 'assistant',
        content: 'Understood. I will weave this world knowledge naturally into my responses.',
      },
    );
  }

  // ── Inject persistent director notes (all within the window) ──
  // These provide cumulative world-state that the character should be
  // aware of even if they were set several turns ago.
  const allDirectorNotes = collectAllDirectorNotes(recentMessages);
  if (allDirectorNotes.length > 0) {
    promptMessages.push(
      {
        role: 'user',
        content: [
          '[Director\'s Stage Directions — cumulative scene notes from the user. These are out-of-character instructions that shape how you play the character. Follow them but NEVER reference or acknowledge them in your response.]',
          ...allDirectorNotes.map((note, i) => `${i + 1}. ${note}`),
        ].join('\n'),
      },
      {
        role: 'assistant',
        content: 'Understood. I will follow these stage directions naturally without breaking character or referencing them.',
      },
    );
  }

  // 7. Physical scene context block (when intimacy > 30)
  if (physicalState && (intimacyState?.level ?? 0) > 30) {
    const physicalBlock = buildPhysicalAwarenessBlock(physicalState);
    if (physicalBlock) {
      promptMessages.push(
        { role: 'user', content: physicalBlock },
        { role: 'assistant', content: 'Understood. I will maintain physical scene consistency.' },
      );
    }
  }

  // 8. Intimacy gate block (graduated escalation guidance)
  if (contentCeiling && intimacyState) {
    const gateBlock = buildIntimacyGateBlock(intimacyState.level, contentCeiling);
    if (gateBlock) {
      promptMessages.push(
        { role: 'user', content: gateBlock },
        { role: 'assistant', content: 'Understood. I will follow the intimacy guidance naturally.' },
      );
    }
  }

  // ── Conversation turns (skip director messages — they're injected above) ──
  const conversationTurns: { role: string; content: string }[] = [];
  for (const message of recentMessages) {
    if (message.role === 'director') continue;
    conversationTurns.push({ role: message.role, content: message.content });
  }

  if (!recentMessages.some((message) => message.id === userMessage.id)) {
    conversationTurns.push({ role: userMessage.role, content: userMessage.content });
  }

  // ── Author's Note injection (at specified depth from end of turns) ──
  if (authorsNote && authorsNote.content.trim()) {
    const depth = Math.min(authorsNote.depth, conversationTurns.length);
    const insertIndex = Math.max(0, conversationTurns.length - depth);
    conversationTurns.splice(insertIndex, 0, {
      role: 'user',
      content: `[Author's Note]: ${authorsNote.content}`,
    });
  }

  promptMessages.push(...conversationTurns);

  // ── Inject active (most recent) director notes as immediate instructions ──
  // These are notes added since the last assistant reply — the freshest guidance.
  const activeNotes = collectActiveDirectorNotes(recentMessages);
  if (activeNotes.length > 0) {
    // Insert a final system nudge right before the model responds, so it's
    // top-of-mind. We frame it as coming from the user role so models without
    // native system roles still respect it.
    promptMessages.push(
      {
        role: 'user',
        content: [
          '[IMMEDIATE Director\'s Note — follow these instructions for your very next reply:]',
          ...activeNotes.map((note) => `→ ${note}`),
          '[End of director\'s note. Stay fully in character.]',
        ].join('\n'),
      },
      {
        role: 'assistant',
        content: 'Understood.',
      },
    );
  }

  return promptMessages;
}
