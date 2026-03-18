/**
 * FrontendSwitcher — compact 4-pill strip for navigating between frontends.
 * Renders horizontally in both Companion and Focused modes.
 */
import glass from '../styles/glass.module.css';
import clsx from 'clsx';

const FRONTENDS = [
  { id: 'neon', label: 'Neon', path: '/' },
  { id: 'sakura', label: 'Sakura', path: '/sakura/' },
  { id: 'nova', label: 'Nova', path: '/nova/' },
  { id: 'girly', label: 'Girly', path: '/girly/' },
] as const;

interface FrontendSwitcherProps {
  style?: React.CSSProperties;
}

export function FrontendSwitcher({ style }: FrontendSwitcherProps) {
  return (
    <div
      className={clsx(glass.panel)}
      style={{
        display: 'flex',
        gap: 2,
        padding: '3px 6px',
        borderRadius: 'var(--nova-radius-pill, 24px)',
        pointerEvents: 'auto',
        ...style,
      }}
    >
      {FRONTENDS.map(fe => (
        <button
          key={fe.id}
          onClick={() => { if (fe.id !== 'nova') window.location.href = fe.path; }}
          style={{
            padding: '2px 8px',
            fontSize: '0.55rem',
            fontWeight: fe.id === 'nova' ? 700 : 500,
            borderRadius: 12,
            border: 'none',
            cursor: fe.id === 'nova' ? 'default' : 'pointer',
            background: fe.id === 'nova'
              ? 'color-mix(in srgb, var(--nova-accent-primary, #b49bf0) 20%, transparent)'
              : 'transparent',
            color: fe.id === 'nova'
              ? 'var(--nova-accent-primary, #b49bf0)'
              : 'var(--nova-text-muted, #a09aae)',
            transition: 'all 150ms ease',
          }}
        >
          {fe.label}
        </button>
      ))}
    </div>
  );
}
