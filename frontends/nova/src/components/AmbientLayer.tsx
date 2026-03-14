import { useCallback, useEffect, useRef } from 'react';
import styles from './AmbientLayer.module.css';

/**
 * Full-viewport ambient background layer.
 *
 * Renders three slowly drifting gradient orbs (pink, lavender, peach) behind
 * the 3D viewer and a subtle SVG film grain overlay. Together these create
 * the warm, atmospheric depth that defines Nova's visual identity.
 *
 * The orbs respond to mouse movement with a subtle parallax effect (1-2%
 * displacement), creating the illusion that the glass UI panels float in
 * 3D space above the ambient light.
 *
 * All animation is pure CSS (`orbDrift1`-`orbDrift3` from animations.css).
 * The parallax uses a lightweight `mousemove` listener with direct DOM
 * manipulation (no React re-renders) for 60fps performance.
 *
 * @example
 * ```tsx
 * <AmbientLayer />
 * <ViewerFrame />   // sits above ambient, below glass panels
 * <GlassPanel>...</GlassPanel>
 * ```
 */
export function AmbientLayer() {
  const orbContainerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!orbContainerRef.current) return;

    // Normalize mouse position to [-1, 1] range centered on viewport
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;

    // Apply parallax offset — 1-2% movement feels subtle but perceptible
    const orbs = orbContainerRef.current.children;
    if (orbs[0]) (orbs[0] as HTMLElement).style.transform = `translate(${x * 12}px, ${y * 8}px)`;
    if (orbs[1]) (orbs[1] as HTMLElement).style.transform = `translate(${x * -8}px, ${y * 10}px)`;
    if (orbs[2]) (orbs[2] as HTMLElement).style.transform = `translate(${x * 6}px, ${y * -6}px)`;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  return (
    <>
      {/* Deep gradient base */}
      <div className={styles.bgLayer} />

      {/* Drifting ambient orbs */}
      <div ref={orbContainerRef} className={styles.orbContainer}>
        <div className={`${styles.orb} ${styles.orb1}`} />
        <div className={`${styles.orb} ${styles.orb2}`} />
        <div className={`${styles.orb} ${styles.orb3}`} />
      </div>

      {/* SVG film grain overlay */}
      <div className={styles.grain} />
    </>
  );
}
