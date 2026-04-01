/**
 * useAmbientAtmosphere — Feature F23: Ambient Scene Atmosphere
 *
 * A React hook that applies subtle CSS warmth/color shifts to the chat
 * area based on the scene's intimacy level. As conversation heats up,
 * the UI gains a warm tint, borders soften, and shadows deepen — all
 * via CSS custom property overrides.
 *
 * The hook sets CSS variables on the document root, which existing
 * theme variables cascade through. When the scene cools down or the
 * hook unmounts, all overrides are cleaned up.
 *
 * @module useAmbientAtmosphere
 */

import { useEffect, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface AtmosphereConfig {
  /**
   * Current scene intensity (0–100).
   * 0 = no atmosphere changes, 100 = maximum warmth.
   */
  intensity: number;
  /** Whether to apply atmosphere effects. Defaults to true. */
  enabled?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════
   Atmosphere Tiers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Calculates CSS overlay values based on intensity.
 * Uses exponential easing for smooth warm-up — the first 30% of
 * intensity barely changes the UI, but 60-100% ramps up noticeably.
 *
 * @param intensity - Scene intensity 0–100.
 * @returns CSS property overrides to apply.
 */
function calculateAtmosphere(intensity: number): Record<string, string> {
  if (intensity <= 0) return {};

  // Exponential easing: gentle at low levels, pronounced at high levels
  const t = Math.min(intensity / 100, 1);
  const eased = t * t; // quadratic easing

  // Warm tint overlay (0% → 8% opacity)
  const warmAlpha = (eased * 0.08).toFixed(3);

  // Border softening (fully opaque → slightly transparent)
  const borderAlpha = (1 - eased * 0.3).toFixed(2);

  // Shadow warmth (neutral → warm amber)
  const shadowWarm = Math.round(eased * 20);

  // Background warmth shift
  const bgWarm = Math.round(eased * 5);

  return {
    '--atmosphere-warm-overlay': `rgba(244, 114, 100, ${warmAlpha})`,
    '--atmosphere-border-alpha': borderAlpha,
    '--atmosphere-shadow-hue': `${shadowWarm}`,
    '--atmosphere-bg-warm': `${bgWarm}`,
    '--atmosphere-transition': '2s ease-in-out',
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   Hook
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Applies ambient atmosphere CSS effects based on scene intensity.
 * Sets CSS custom properties on the document root that cascade through
 * the existing theme system. Cleans up on unmount or when disabled.
 *
 * @param config - Intensity level and enabled flag.
 *
 * @example
 * // In ChatThread or a layout wrapper:
 * useAmbientAtmosphere({ intensity: arousalLevel, enabled: nsfwEnabled });
 */
export function useAmbientAtmosphere({ intensity, enabled = true }: AtmosphereConfig): void {
  const prevKeysRef = useRef<string[]>([]);

  useEffect(() => {
    // Clean up previous keys
    const cleanup = () => {
      prevKeysRef.current.forEach(key => {
        document.documentElement.style.removeProperty(key);
      });
      prevKeysRef.current = [];
    };

    if (!enabled || intensity <= 0) {
      cleanup();
      return;
    }

    const props = calculateAtmosphere(intensity);
    const keys = Object.keys(props);

    // Apply new CSS properties
    keys.forEach(key => {
      document.documentElement.style.setProperty(key, props[key]);
    });

    // Track which keys we set so we can clean them up
    prevKeysRef.current = keys;

    return cleanup;
  }, [intensity, enabled]);
}
