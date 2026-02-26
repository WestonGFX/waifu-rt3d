import { MessageCircle, Users, Sparkles } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

/**
 * Welcome screen shown in the main content area when no character is selected.
 * Provides quick-action buttons to guide the user toward starting a chat.
 */
export function WelcomeScreen() {
  const { characters, setSidebarSection, selectCharacter } = useAppStore();

  return (
    <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="text-center max-w-md px-6">
        {/* Logo / brand mark */}
        <div
          className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
          style={{
            background: 'var(--color-accent-gradient)',
            boxShadow: '0 4px 20px var(--color-accent-soft)',
          }}
        >
          <MessageCircle size={28} style={{ color: 'var(--color-accent-text)' }} />
        </div>

        <h2
          className="text-xl font-bold mb-2 tracking-tight"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Welcome to Sakura
        </h2>
        <p className="text-sm mb-8" style={{ color: 'var(--color-text-tertiary)' }}>
          {characters.length > 0
            ? 'Select a character from the sidebar to start chatting.'
            : 'Create your first character to get started.'}
        </p>

        {/* Quick action cards */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {characters.length > 0 && (
            <button
              onClick={() => {
                // Select the first character as a quick start
                selectCharacter(characters[0]);
              }}
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all duration-200"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border-subtle)',
                boxShadow: 'var(--shadow-card)',
                color: 'var(--color-text-primary)',
              }}
            >
              <MessageCircle size={16} style={{ color: 'var(--color-accent)' }} />
              <span className="text-xs font-medium">Chat with {characters[0].name}</span>
            </button>
          )}

          <button
            onClick={() => setSidebarSection('characters')}
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all duration-200"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border-subtle)',
              boxShadow: 'var(--shadow-card)',
              color: 'var(--color-text-primary)',
            }}
          >
            <Users size={16} style={{ color: 'var(--color-accent)' }} />
            <span className="text-xs font-medium">Browse Characters</span>
          </button>

          <button
            onClick={() => setSidebarSection('create')}
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all duration-200"
            style={{
              background: 'var(--color-accent-gradient)',
              color: 'var(--color-accent-text)',
              border: 'none',
              boxShadow: '0 2px 12px var(--color-accent-soft)',
            }}
          >
            <Sparkles size={16} />
            <span className="text-xs font-medium">Create Character</span>
          </button>
        </div>
      </div>
    </div>
  );
}
