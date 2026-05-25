import { Heart, MessageCircle, Users, Sparkles } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { LLMProbeAside } from './LLMProbeAside';

/**
 * Static petal configuration — lives outside the component to prevent
 * array recreation on every render. Each petal drifts upward at a unique
 * speed and horizontal position for a natural, non-uniform feel.
 */
const PETALS = [
  { size: 8,  left: '8%',  delay: '0s',    duration: '10s'  },
  { size: 5,  left: '22%', delay: '2.3s',  duration: '12.5s'},
  { size: 10, left: '38%', delay: '0.6s',  duration: '9s'   },
  { size: 6,  left: '54%', delay: '3.8s',  duration: '11s'  },
  { size: 9,  left: '68%', delay: '1.4s',  duration: '8.5s' },
  { size: 4,  left: '82%', delay: '5.1s',  duration: '13s'  },
  { size: 7,  left: '93%', delay: '2.9s',  duration: '10.5s'},
];

/**
 * Welcome screen shown when no character is selected.
 * "Intimate Luxury Digital" aesthetic: Fraunces display heading,
 * floating sakura petals, decorative kanji backdrop, staggered card entrance.
 */
export function WelcomeScreen() {
  const { characters, setSidebarSection, selectCharacter } = useAppStore();

  return (
    <div
      className="relative flex items-center justify-center h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      {/* Soft model warning aside (only renders if probe surfaces a warning) */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 0,
          right: 0,
          zIndex: 5,
          maxWidth: 560,
          margin: '0 auto',
        }}
      >
        <LLMProbeAside />
      </div>

      {/* Atmospheric petal drift */}
      {PETALS.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="petal"
          style={{
            width: p.size,
            height: p.size,
            left: p.left,
            bottom: '-20px',
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}

      {/* Giant decorative kanji — 3% opacity, sets emotional tone */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          fontSize: '28vw',
          fontFamily: 'var(--font-display, "Fraunces"), serif',
          fontStyle: 'italic',
          fontWeight: 300,
          color: 'var(--color-accent)',
          opacity: 0.03,
          userSelect: 'none',
          lineHeight: 1,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      >
        桜
      </span>

      {/* Content well */}
      <div className="relative z-10 text-center" style={{ maxWidth: 420, padding: '0 24px', width: '100%' }}>

        {/* Brand mark — filled heart instead of message bubble for warmth */}
        <div
          className="mx-auto mb-6 flex items-center justify-center"
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: 'var(--color-accent-gradient)',
            boxShadow: '0 6px 28px var(--color-accent-soft), 0 2px 8px rgba(0,0,0,0.08)',
            animation: 'bubbleIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
          }}
        >
          <Heart size={26} style={{ color: 'var(--color-accent-text)' }} />
        </div>

        {/* Editorial heading — Fraunces italic */}
        <h1
          className="mb-1"
          style={{
            fontFamily: 'var(--font-display, "Fraunces"), serif',
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: '1.9rem',
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            color: 'var(--color-text-primary)',
            animation: 'bubbleIn 0.45s 0.08s cubic-bezier(0.22, 1, 0.36, 1) both',
          }}
        >
          Welcome to Sakura
        </h1>

        <p
          className="text-sm mb-8"
          style={{
            color: 'var(--color-text-tertiary)',
            animation: 'bubbleIn 0.45s 0.16s cubic-bezier(0.22, 1, 0.36, 1) both',
          }}
        >
          {characters.length > 0
            ? 'Select a character from the sidebar to begin.'
            : 'Create your first character to get started.'}
        </p>

        {/* Staggered action cards */}
        <div
          className="flex flex-col gap-2.5"
          style={{ animation: 'bubbleIn 0.5s 0.24s cubic-bezier(0.22, 1, 0.36, 1) both' }}
        >
          {characters.length > 0 && (
            <button
              onClick={() => selectCharacter(characters[0])}
              className="welcome-action-card flex items-center gap-3 px-5 py-3.5 rounded-xl w-full text-left"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border-subtle)',
                boxShadow: 'var(--shadow-card)',
                color: 'var(--color-text-primary)',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: 'var(--color-accent-gradient)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MessageCircle size={16} style={{ color: 'var(--color-accent-text)' }} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div className="text-sm font-semibold">Continue chatting</div>
                <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  Resume with {characters[0].name}
                </div>
              </div>
            </button>
          )}

          <button
            onClick={() => setSidebarSection('characters')}
            className="welcome-action-card flex items-center gap-3 px-5 py-3.5 rounded-xl w-full text-left"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border-subtle)',
              boxShadow: 'var(--shadow-card)',
              color: 'var(--color-text-primary)',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              backgroundColor: 'var(--color-accent-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Users size={16} style={{ color: 'var(--color-accent)' }} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div className="text-sm font-semibold">Your characters</div>
              <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {characters.length} character{characters.length !== 1 ? 's' : ''} available
              </div>
            </div>
          </button>

          <button
            onClick={() => setSidebarSection('create')}
            className="welcome-action-card flex items-center gap-3 px-5 py-3.5 rounded-xl w-full text-left"
            style={{
              background: 'var(--color-accent-gradient)',
              border: 'none',
              boxShadow: '0 4px 16px var(--color-accent-soft)',
              color: 'var(--color-accent-text)',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              backgroundColor: 'rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Sparkles size={16} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div className="text-sm font-semibold">Create new character</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Design your companion</div>
            </div>
          </button>
        </div>

        {/* Keyboard hint */}
        <p
          className="mt-6 text-xs"
          style={{
            color: 'var(--color-text-tertiary)',
            opacity: 0.55,
            animation: 'bubbleIn 0.5s 0.38s cubic-bezier(0.22, 1, 0.36, 1) both',
          }}
        >
          Press{' '}
          <kbd style={{
            fontFamily: 'monospace',
            padding: '1px 5px',
            borderRadius: 4,
            border: '1px solid var(--color-border)',
            fontSize: '0.65rem',
          }}>
            ?
          </kbd>
          {' '}for keyboard shortcuts
        </p>
      </div>
    </div>
  );
}
