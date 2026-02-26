import { useAppStore } from '../stores/appStore';
import { CharacterCard } from '../components/CharacterCard';

/**
 * Character list view — the main "Chats" tab.
 * Displays all characters as tappable cards that open a ChatThread.
 */
export function ChatsView() {
  const { characters, openChatThread } = useAppStore();

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
        Chats
      </h2>
      <div className="flex flex-col gap-2">
        {characters.length === 0 ? (
          <p className="text-sm text-center py-12" style={{ color: 'var(--color-text-secondary)' }}>
            No characters yet. Create one in the Create tab.
          </p>
        ) : (
          characters.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              onClick={() => openChatThread(char)}
            />
          ))
        )}
      </div>
    </div>
  );
}
