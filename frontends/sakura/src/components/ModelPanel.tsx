import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useViewer } from '../hooks/useViewer';
import type { Character } from '../lib/types';

interface ModelPanelProps {
  character: Character;
}

/**
 * Slide-out right panel containing the 3D viewer iframe.
 * Uses Framer Motion for smooth width animation on open/close.
 * Sends postMessage commands to load the character's VRM model on open.
 */
export function ModelPanel({ character }: ModelPanelProps) {
  const { modelPanelOpen, toggleModelPanel } = useAppStore();
  const { iframeRef, loadCharacter, setCameraPreset } = useViewer();

  useEffect(() => {
    if (modelPanelOpen && character.model_vrm) {
      const timer = setTimeout(() => {
        loadCharacter(character.model_vrm!);
        setCameraPreset('bust');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [modelPanelOpen, character.model_vrm, loadCharacter, setCameraPreset]);

  return (
    <AnimatePresence>
      {modelPanelOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: '40%', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative flex-shrink-0 h-full overflow-hidden"
          style={{
            borderLeft: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-background)'
          }}
        >
          <iframe
            ref={iframeRef}
            src="/shared/viewer/viewer.html"
            className="w-full h-full border-0"
            title="3D Viewer"
          />
          <button
            onClick={toggleModelPanel}
            className="absolute bottom-4 left-4 flex items-center gap-1 px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-button)',
              boxShadow: 'var(--shadow-card)',
              color: 'var(--color-text-secondary)'
            }}
          >
            <ChevronLeft size={14} /> Hide
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
