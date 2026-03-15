/**
 * Slash Commands — registry, parser, and fuzzy matcher for Nova's chat input.
 *
 * Provides a `/command` system that lets users trigger actions without leaving
 * the chat flow. Commands are registered in the `COMMANDS` array and dispatched
 * via `parseAndExecute()`. Autocomplete is powered by `getMatchingCommands()`.
 *
 * @module slashCommands
 */

import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { useNovaStore } from '../stores/novaStore';
import { api } from './api';

// ── Interfaces ──────────────────────────────────────────────────────────────

/**
 * A registered slash command.
 *
 * Each command has a name (without the leading `/`), a short description
 * for the autocomplete dropdown, an optional argument placeholder, and
 * an `execute` function that performs the action.
 */
export interface SlashCommand {
  /** Command name (without the `/`). */
  name: string;
  /** Short description shown in autocomplete. */
  description: string;
  /** Optional argument placeholder text. */
  argPlaceholder?: string;
  /**
   * Execute the command.
   *
   * @param args - Everything after the command name (trimmed).
   * @param context - Stores and helpers available during execution.
   * @returns `true` if the command was handled (input should be cleared,
   *          message should NOT be sent as chat). `false` to fall through
   *          and send as a normal chat message.
   */
  execute: (args: string, context: SlashCommandContext) => Promise<boolean> | boolean;
}

/**
 * Execution context passed to every slash command.
 *
 * Provides access to current session state, toast notifications, panel
 * navigation, and character switching without commands needing to import
 * stores directly.
 */
export interface SlashCommandContext {
  /** Current character ID, or `null` when no character is selected. */
  charId: number | null;
  /** Current session ID, or `null` when no session is loaded. */
  sessionId: number | null;
  /** Show a toast notification. */
  toast: (message: string, type: 'success' | 'error' | 'info') => void;
  /** Navigate to a side panel by ID. */
  openPanel: (panelId: string) => void;
  /** Switch the active character by ID. */
  switchCharacter: (charId: number) => void;
}

// ── Command Registry ────────────────────────────────────────────────────────

/**
 * All registered slash commands.
 *
 * Commands are matched by name prefix during autocomplete and executed
 * verbatim when the user submits input starting with `/`.
 */
export const COMMANDS: SlashCommand[] = [
  {
    name: 'help',
    description: 'Show available commands',
    execute: (_args, ctx) => {
      const list = COMMANDS.map((c) => `/${c.name} — ${c.description}`).join('\n');
      ctx.toast(`Available commands:\n${list}`, 'info');
      return true;
    },
  },
  {
    name: 'character',
    description: 'Switch character by name',
    argPlaceholder: '<name>',
    execute: (args, ctx) => {
      if (!args) {
        ctx.toast('Usage: /character <name>', 'info');
        return true;
      }
      const characters = useAppStore.getState().characters;
      const query = args.toLowerCase();
      const match = characters.find(
        (c) =>
          c.name.toLowerCase() === query ||
          c.name.toLowerCase().startsWith(query)
      );
      if (!match) {
        ctx.toast(`No character matching "${args}"`, 'error');
        return true;
      }
      ctx.switchCharacter(match.id);
      ctx.toast(`Switched to ${match.name}`, 'success');
      return true;
    },
  },
  {
    name: 'mood',
    description: 'Set character mood / emotion',
    argPlaceholder: '<emotion>',
    execute: (args, ctx) => {
      if (!args) {
        ctx.toast('Usage: /mood <emotion> (e.g. happy, sad, excited)', 'info');
        return true;
      }
      useChatStore.getState().setCurrentEmotion(args.toLowerCase(), 1.0);
      ctx.toast(`Mood set to "${args}"`, 'success');
      return true;
    },
  },
  {
    name: 'game',
    description: 'Start a mini-game',
    argPlaceholder: '<type>',
    execute: (args, ctx) => {
      ctx.openPanel('games');
      if (args) {
        ctx.toast(`Opening games panel — start "${args}" from there`, 'info');
      }
      return true;
    },
  },
  {
    name: 'retry',
    description: 'Regenerate the last response',
    execute: async (_args, ctx) => {
      const { messages, sessionId, charId } = useChatStore.getState();
      if (!sessionId || !charId) {
        ctx.toast('No active session', 'error');
        return true;
      }

      // Find the last user message and remove the last assistant message
      const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === 'user');
      if (lastUserIdx === -1) {
        ctx.toast('No message to retry', 'error');
        return true;
      }
      const lastUser = messages[messages.length - 1 - lastUserIdx];

      // Delete the last assistant message from local state
      const lastAssistantIdx = [...messages].reverse().findIndex((m) => m.role === 'assistant');
      if (lastAssistantIdx !== -1) {
        const assistantMsg = messages[messages.length - 1 - lastAssistantIdx];
        // Remove assistant message from backend if it has a server ID
        if (assistantMsg.serverMessageId) {
          try {
            await fetch(`/api/messages/${assistantMsg.serverMessageId}`, { method: 'DELETE' });
          } catch {
            // Non-critical — continue with retry
          }
        }
      }

      // Remove trailing assistant message(s) from local store, then resend
      const trimmed = messages.slice(0, messages.length - (lastAssistantIdx !== -1 ? lastAssistantIdx + 1 : 0));
      // Manually update messages in store (clearMessages + re-add)
      useChatStore.setState({ messages: trimmed });

      // Re-send the last user message
      await useChatStore.getState().sendMessage(lastUser.text);
      ctx.toast('Regenerating response...', 'info');
      return true;
    },
  },
  {
    name: 'clear',
    description: 'Clear chat history',
    execute: (_args, ctx) => {
      useChatStore.getState().clearMessages();
      ctx.toast('Chat cleared', 'success');
      return true;
    },
  },
  {
    name: 'mode',
    description: 'Toggle companion / focused mode',
    execute: (_args, ctx) => {
      useNovaStore.getState().toggleMode();
      const newMode = useNovaStore.getState().mode;
      ctx.toast(`Switched to ${newMode} mode`, 'success');
      return true;
    },
  },
  {
    name: 'settings',
    description: 'Open settings panel',
    execute: (_args, ctx) => {
      ctx.openPanel('settings');
      return true;
    },
  },
  {
    name: 'memory',
    description: 'Search memories',
    argPlaceholder: '<query>',
    execute: (_args, ctx) => {
      ctx.openPanel('memory');
      if (_args) {
        ctx.toast(`Opened memory panel — search for "${_args}"`, 'info');
      }
      return true;
    },
  },
  {
    name: 'export',
    description: 'Export character card',
    execute: async (_args, ctx) => {
      if (!ctx.charId) {
        ctx.toast('No character selected', 'error');
        return true;
      }
      try {
        await api.exportCharaCard(ctx.charId);
        ctx.toast('Character card exported', 'success');
      } catch (err) {
        ctx.toast(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      }
      return true;
    },
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return commands whose name starts with the typed prefix.
 *
 * Used by the autocomplete dropdown to filter the command list as the user
 * types after the initial `/`.
 *
 * @param input - The full input text (should start with `/`).
 * @returns Matching commands sorted by name, or all commands if only `/` is typed.
 *
 * @example
 * ```ts
 * getMatchingCommands('/cha');
 * // => [{ name: 'character', ... }]
 *
 * getMatchingCommands('/');
 * // => all COMMANDS
 * ```
 */
export function getMatchingCommands(input: string): SlashCommand[] {
  if (!input.startsWith('/')) return [];

  // Extract just the command portion (before any space / args)
  const afterSlash = input.slice(1).toLowerCase();
  const spaceIdx = afterSlash.indexOf(' ');
  const prefix = spaceIdx === -1 ? afterSlash : afterSlash.slice(0, spaceIdx);

  // If user already typed a full command + space, no autocomplete needed
  if (spaceIdx !== -1) {
    const exact = COMMANDS.find((c) => c.name === prefix);
    return exact ? [exact] : [];
  }

  if (!prefix) return COMMANDS;

  return COMMANDS.filter((c) => c.name.startsWith(prefix));
}

/**
 * Parse a slash-command input and execute it.
 *
 * If the input starts with `/` and matches a registered command, the command's
 * `execute()` function is called with the remaining arguments and the provided
 * context. If no command matches, returns `false` so the caller can send the
 * input as a regular chat message.
 *
 * @param input - The full input text (should start with `/`).
 * @param context - Execution context with stores and helpers.
 * @returns `true` if a command was matched and handled, `false` otherwise.
 *
 * @example
 * ```ts
 * const handled = await parseAndExecute('/mood happy', context);
 * if (!handled) {
 *   // Send as normal chat message
 *   chatStore.sendMessage(input);
 * }
 * ```
 */
export async function parseAndExecute(
  input: string,
  context: SlashCommandContext
): Promise<boolean> {
  if (!input.startsWith('/')) return false;

  const afterSlash = input.slice(1);
  const spaceIdx = afterSlash.indexOf(' ');
  const commandName = spaceIdx === -1 ? afterSlash.toLowerCase() : afterSlash.slice(0, spaceIdx).toLowerCase();
  const args = spaceIdx === -1 ? '' : afterSlash.slice(spaceIdx + 1).trim();

  const command = COMMANDS.find((c) => c.name === commandName);
  if (!command) {
    context.toast(`Unknown command: /${commandName}. Type /help for a list.`, 'error');
    return true; // Still "handled" — don't send as chat
  }

  return command.execute(args, context);
}

/**
 * Build a `SlashCommandContext` from the current Zustand store states.
 *
 * Call this inside a React component or callback to get a fresh context
 * object. Uses `getState()` (non-reactive) so it captures the latest
 * values at the moment of execution.
 *
 * @returns A context object suitable for passing to `parseAndExecute()`.
 */
export function buildCommandContext(): SlashCommandContext {
  const chatState = useChatStore.getState();
  const appState = useAppStore.getState();
  const novaState = useNovaStore.getState();

  return {
    charId: chatState.charId,
    sessionId: chatState.sessionId,
    toast: (message, type) => novaState.addToast(message, type),
    openPanel: (panelId) => {
      // Switch to focused mode if in companion mode so the panel is visible
      if (novaState.mode === 'companion') {
        novaState.setMode('focused');
      }
      novaState.setActivePanel(panelId);
    },
    switchCharacter: (charId) => {
      const char = appState.characters.find((c) => c.id === charId);
      if (char) {
        appState.setActiveCharacter(char);
        chatState.setActiveCharId(charId);
      }
    },
  };
}
