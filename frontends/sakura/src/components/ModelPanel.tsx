import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useViewer } from '../hooks/useViewer';
import { api } from '../lib/api';
import type { Character } from '../lib/types';

interface ModelPanelProps {
  character: Character;
}

/**
 * Resolve the VRM model URL for a character.
 * Priority: explicit model_vrm > vrm_model_url > auto-detect by name.
 * Auto-detection matches character name (or parenthetical alias) against
 * available VRM filenames from the scan endpoint.
 */
function resolveVrmUrl(
  character: Character,
  availableModels: Array<{ name: string; url: string }>
): string | null {
  // Explicit assignment
  if (character.model_vrm) return character.model_vrm;
  if (character.vrm_model_url) return character.vrm_model_url;

  // Auto-detect by name: check parenthetical alias first, e.g. "Fox (Rin)" → "Rin"
  const parenMatch = character.name?.match(/\(([^)]+)\)/);
  const names = [
    parenMatch?.[1]?.trim(),
    character.name?.split(/\s/)[0],
    character.name,
  ].filter(Boolean).map(n => n!.toLowerCase());

  for (const model of availableModels) {
    if (names.includes(model.name.toLowerCase())) {
      return model.url;
    }
  }
  return null;
}

/**
 * Slide-out right panel containing the 3D viewer iframe.
 * Uses Framer Motion for smooth width animation on open/close.
 * Auto-resolves VRM model by character name if not explicitly set.
 */
export function ModelPanel({ character }: ModelPanelProps) {
  const { modelPanelOpen, toggleModelPanel } = useAppStore();
  const { iframeRef, loadCharacter, setCameraPreset } = useViewer();
  const [vrmModels, setVrmModels] = useState<Array<{ name: string; url: string }>>([]);

  // Fetch available VRM models once
  useEffect(() => {
    api.scanVrm().then(models => {
      setVrmModels(models.map(m => ({ name: m.name, url: m.url })));
    }).catch(() => {});
  }, []);

  const vrmUrl = resolveVrmUrl(character, vrmModels);

  useEffect(() => {
    if (modelPanelOpen && vrmUrl) {
      const timer = setTimeout(() => {
        loadCharacter(vrmUrl);
        setCameraPreset('bust');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [modelPanelOpen, vrmUrl, loadCharacter, setCameraPreset]);

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
          {!vrmUrl && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
              <div className="text-center px-6">
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  No VRM model found
                </p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  Assign a 3D model in character settings or add a .vrm file named after this character to backend/storage/avatars/
                </p>
              </div>
            </div>
          )}
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
