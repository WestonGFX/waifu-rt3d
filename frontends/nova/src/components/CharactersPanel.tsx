/**
 * CharactersPanel — Browse and switch between characters.
 *
 * Renders inside the IconRail's expandable panel (280px wide).
 * Shows all characters with avatar, name, and a system prompt preview.
 * Clicking a row switches the active character, creates a new chat session,
 * and loads the character's VRM model if one is configured.
 *
 * Footer provides import/export buttons for SillyTavern CHARA v2 cards.
 */
import { useRef, useCallback } from 'react';
import type { Character } from '../lib/types';
import { api } from '../lib/api';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { useViewerStore } from '../stores/viewerStore';
import styles from './CharactersPanel.module.css';

/**
 * Truncate a string to a maximum length, appending ellipsis if needed.
 *
 * @param text - Source string to truncate.
 * @param max - Maximum character count before truncation.
 * @returns The original string if within limit, otherwise truncated with "...".
 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '\u2026';
}

/**
 * CharactersPanel component for the Nova IconRail.
 *
 * Reads character data from `useAppStore` and dispatches selection changes
 * across the app, chat, and viewer stores. Supports importing `.png`
 * character cards and exporting the active character.
 *
 * @returns The rendered characters panel element.
 *
 * @example
 * ```tsx
 * <CharactersPanel />
 * ```
 */
export function CharactersPanel() {
  const characters = useAppStore((s) => s.characters);
  const activeCharacter = useAppStore((s) => s.activeCharacter);
  const setActiveCharacter = useAppStore((s) => s.setActiveCharacter);
  const fetchCharacters = useAppStore((s) => s.fetchCharacters);

  const setActiveCharId = useChatStore((s) => s.setActiveCharId);
  const createSession = useChatStore((s) => s.createSession);

  const dispatchLoadModel = useViewerStore((s) => s.dispatchLoadModel);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Switch the active character across all stores.
   *
   * Sets the character in the app store, updates the chat store's active
   * character ID, creates a fresh session, and loads the character's VRM
   * model into the 3D viewer if one is configured.
   *
   * @param char - The character to activate.
   */
  const handleSelect = useCallback(
    async (char: Character) => {
      if (char.id === activeCharacter?.id) return;

      setActiveCharacter(char);
      setActiveCharId(char.id);
      await createSession(char.id);

      if (char.model_vrm) {
        dispatchLoadModel(char.model_vrm);
      }
    },
    [activeCharacter?.id, setActiveCharacter, setActiveCharId, createSession, dispatchLoadModel],
  );

  /**
   * Handle character card import from a PNG file.
   *
   * Sends the selected file to the backend via `api.importCharaCard`,
   * then refreshes the character list to include the newly imported entry.
   *
   * @param e - File input change event.
   */
  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        await api.importCharaCard(file);
        await fetchCharacters();
      } catch (err) {
        console.error('[CharactersPanel] Import failed:', err);
      }

      // Reset the input so the same file can be re-imported
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [fetchCharacters],
  );

  /**
   * Export the active character as a SillyTavern CHARA v2 PNG card.
   * No-ops silently when no character is selected.
   */
  const handleExport = useCallback(async () => {
    if (!activeCharacter) return;

    try {
      await api.exportCharaCard(activeCharacter.id, `${activeCharacter.name}.png`);
    } catch (err) {
      console.error('[CharactersPanel] Export failed:', err);
    }
  }, [activeCharacter]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>Characters</div>

      {characters.length === 0 ? (
        <div className={styles.empty}>No characters loaded</div>
      ) : (
        <div className={styles.list}>
          {characters.map((char) => {
            const isActive = char.id === activeCharacter?.id;
            const avatarStyle = char.avatar_url
              ? { backgroundImage: `url(${char.avatar_url})` }
              : undefined;

            return (
              <div
                key={char.id}
                className={`${styles.row} ${isActive ? styles.rowActive : ''}`}
                onClick={() => handleSelect(char)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(char);
                  }
                }}
              >
                <div className={styles.avatar} style={avatarStyle} />
                <div className={styles.info}>
                  <div className={styles.name}>{char.name}</div>
                  <div className={styles.preview}>
                    {truncate(char.system_prompt, 60)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.footer}>
        <button
          className={styles.actionBtn}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          Import
        </button>
        <button
          className={styles.actionBtn}
          onClick={handleExport}
          disabled={!activeCharacter}
          type="button"
        >
          Export
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png"
          className={styles.hiddenInput}
          onChange={handleImport}
        />
      </div>
    </div>
  );
}
