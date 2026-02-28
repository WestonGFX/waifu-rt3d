import { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useWizardStore } from '../../stores/wizardStore';
import { FeatureSpotlight, executeFeatureTipAction } from './FeatureSpotlight';
import { isMobileDevice } from '../../lib/deviceDetect';

/**
 * Feature tip queue manager.
 *
 * Mounted once in App.tsx / MobileApp.tsx. Renders the current tip
 * from the wizard store and manages queue advancement with 5-second
 * spacing between tips.
 */
export function FeatureTipQueue() {
  const currentTip = useWizardStore(s => s.currentTip);
  const pendingTips = useWizardStore(s => s.pendingTips);
  const dismissTip = useWizardStore(s => s.dismissTip);
  const discoverFeature = useWizardStore(s => s.discoverFeature);
  const snoozeAllTips = useWizardStore(s => s.snoozeAllTips);
  const activeWizard = useWizardStore(s => s.activeWizard);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Advance queue after 5 seconds when current tip is dismissed
  useEffect(() => {
    if (!currentTip && pendingTips.length > 0) {
      advanceTimerRef.current = setTimeout(() => {
        const { pendingTips: tips } = useWizardStore.getState();
        if (tips.length > 0) {
          useWizardStore.setState({
            currentTip: tips[0],
            pendingTips: tips.slice(1),
          });
        }
      }, 5000);
    }
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, [currentTip, pendingTips.length]);

  /** Handle "Try It" — discover + close + execute action. */
  const handleTryIt = useCallback(() => {
    if (!currentTip) return;
    discoverFeature(currentTip.id);
    const action = currentTip.action;
    dismissTip();
    executeFeatureTipAction(action);
  }, [currentTip, discoverFeature, dismissTip]);

  /** Handle "Later" — just dismiss, don't mark discovered. */
  const handleDismiss = useCallback(() => {
    dismissTip();
  }, [dismissTip]);

  /** Handle "Don't show" — discover + snooze all 24h. */
  const handleDontShow = useCallback(() => {
    snoozeAllTips();
  }, [snoozeAllTips]);

  // Don't show tips while a wizard is active
  if (activeWizard) return null;
  if (!currentTip) return null;

  const isMobile = isMobileDevice();

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 80,
        ...(isMobile
          ? { bottom: 64, left: '50%', transform: 'translateX(-50%)' }
          : { bottom: 16, right: 16 }
        ),
      }}
    >
      <AnimatePresence mode="wait">
        <FeatureSpotlight
          key={currentTip.id}
          tip={currentTip}
          onDismiss={handleDismiss}
          onTryIt={handleTryIt}
          onDontShow={handleDontShow}
        />
      </AnimatePresence>
    </div>
  );
}
