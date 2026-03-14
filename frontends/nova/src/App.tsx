import { AmbientLayer } from './components/AmbientLayer';
import { ViewerFrame } from './components/ViewerFrame';
import { GlassPanel } from './components/GlassPanel';

/**
 * Nova application shell — Phase 1 demo.
 *
 * Renders the visual foundation:
 * 1. AmbientLayer — gradient base + drifting orbs + film grain
 * 2. ViewerFrame — full-viewport 3D viewer iframe (z-index: 0)
 * 3. Demo GlassPanels — floating glass UI elements proving the aesthetic works
 *
 * Chat, navigation, and mode switching are added in Phase 2-3.
 */
export function App() {
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {/* Background atmosphere */}
      <AmbientLayer />

      {/* 3D character viewer (fills viewport behind glass panels) */}
      <ViewerFrame />

      {/* Demo glass panels — proves the glass-over-3D aesthetic */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '16px',
        pointerEvents: 'none',
      }}>
        <GlassPanel
          delay={0.2}
          style={{
            padding: '24px 32px',
            pointerEvents: 'auto',
            textAlign: 'center',
          }}
        >
          <h1
            className="display-font"
            style={{
              fontSize: '28px',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--nova-text-primary)',
              marginBottom: '8px',
            }}
          >
            Nova
          </h1>
          <p style={{
            fontSize: '13px',
            color: 'var(--nova-text-secondary)',
            letterSpacing: '0.02em',
          }}>
            Glass UI over 3D — Phase 1 Foundation
          </p>
        </GlassPanel>

        <GlassPanel
          variant="pill"
          interactive
          delay={0.4}
          style={{ pointerEvents: 'auto', cursor: 'pointer' }}
        >
          <span style={{
            fontSize: '12px',
            color: 'var(--nova-accent-primary)',
            fontWeight: 500,
          }}>
            ✦ Companion Mode
          </span>
        </GlassPanel>
      </div>
    </div>
  );
}
