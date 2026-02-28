/**
 * deviceDetect.ts — synchronous device-type detection utilities.
 *
 * Evaluated once at module load (before React renders) so the app can branch
 * between desktop and mobile views without a layout flash.
 *
 * Detection strategy:
 *  - `pointer: coarse`  → primary input is a finger/stylus, not a mouse
 *  - `max-width: 1024px` → screen is tablet-sized or smaller
 *
 * This correctly classifies phones and standard tablets as mobile while
 * leaving touch-screen laptops, large iPads (landscape), and desktop
 * Chrome DevTools mobile emulation untouched.
 */

/**
 * Returns true when the current browser is running on a mobile or tablet
 * device (coarse pointer input AND screen width ≤ 1024 px).
 *
 * @returns {boolean} True for phones / tablets, false for desktop.
 *
 * @example
 * if (isMobileDevice()) {
 *   // render mobile-optimised UI
 * }
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false; // SSR safety
  return window.matchMedia('(pointer: coarse) and (max-width: 1024px)').matches;
}

/**
 * Returns the detected device class as a string label — useful for
 * analytics, debugging, or conditional feature flags.
 *
 * @returns {'mobile' | 'desktop'}
 */
export function deviceClass(): 'mobile' | 'desktop' {
  return isMobileDevice() ? 'mobile' : 'desktop';
}
