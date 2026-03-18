/**
 * PlaceholderAnimationProvider – no-op for Phase 1.
 *
 * The VRM model stays in its default idle pose.  Context-aware animation
 * generation (mapping assistant messages + detected emotion to VRM bone
 * keyframes) is a Phase 2 feature.
 *
 * This provider exists so that the AnimationProvider interface is exercised
 * and the registry is complete.  Replacing it in Phase 2 requires only:
 *   1. A new class implementing AnimationProvider.
 *   2. A line in registry.ts mapping its name.
 */

import { type AnimationProvider, type AnimationClip } from '../types.ts';
import { type AnimationContext } from '../../types/index.ts';

export class PlaceholderAnimationProvider implements AnimationProvider {
  readonly name = 'placeholder';
  readonly label = 'None (static pose)';

  /** Always supported – it does nothing, so it can never fail. */
  isSupported(): boolean {
    return true;
  }

  /**
   * Returns null – no animation is generated.
   * The VRM model remains in its default pose.
   *
   * @param _context - Ignored in Phase 1.
   * @returns null.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generate(_context: AnimationContext): Promise<AnimationClip | null> {
    return null;
  }
}
