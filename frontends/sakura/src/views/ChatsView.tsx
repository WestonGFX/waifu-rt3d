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
      <h2
        className="text-xl font-bold mb-1 tracking-tight"
        style={{ color: 'var(--color-text-primary)' }}
      >
        Chats
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
        {characters.length} character{characters.length !== 1 ? 's' : ''}
      </p>
      <div className="flex flex-col gap-2">
        {characters.length === 0 ? (
          <div
            className="text-center py-16 rounded-2xl"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px dashed var(--color-border)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              No characters yet
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
              Create one in the Create tab
            </p>
          </div>
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
