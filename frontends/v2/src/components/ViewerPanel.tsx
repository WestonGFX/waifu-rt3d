import { motion } from 'framer-motion';

import { microcopy } from '../lib/microcopy';
import type { Character } from '../types';

interface ViewerPanelProps {
  activeCharacter?: Character;
  status: 'stable' | 'thinking';
}

export function ViewerPanel({ activeCharacter, status }: ViewerPanelProps) {
  return (
    <section className="v2-panel v2-viewer">
      <div className="v2-viewer-status">
        <motion.span
          className={status === 'thinking' ? 'dot thinking' : 'dot'}
          animate={{ scale: status === 'thinking' ? [1, 1.2, 1] : [1, 1, 1] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
        />
        <p>{status === 'thinking' ? microcopy.status.thinking : microcopy.status.stable}</p>
      </div>

      <iframe src="/viewer/viewer.html" title="Character viewer" />

      <div className="v2-viewer-overlay">
        <h2>{activeCharacter?.name ?? 'No Link'}</h2>
        <p>{activeCharacter?.system_prompt?.slice(0, 110) ?? 'Select a character profile to establish link.'}</p>
      </div>
    </section>
  );
}
