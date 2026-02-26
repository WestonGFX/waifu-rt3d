import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

interface ContextBudget {
  total_tokens?: number;
  used_tokens?: number;
  system_tokens?: number;
  history_tokens?: number;
  memory_tokens?: number;
}

/** Right slide-out panel showing memory bank, context info, and token budget. */
export function MemoryPanel() {
  const { memoryPanelOpen, toggleMemoryPanel, activeCharacter } = useAppStore();
  const [budget, setBudget] = useState<ContextBudget | null>(null);

  useEffect(() => {
    if (!memoryPanelOpen) return;
    fetch('/api/context-budget/0')
      .then(r => r.ok ? r.json() : null)
      .then(setBudget)
      .catch(() => setBudget(null));
  }, [memoryPanelOpen]);

  return (
    <AnimatePresence>
      {memoryPanelOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            onClick={toggleMemoryPanel}
            className="fixed inset-0 bg-black z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed right-0 top-0 bottom-0 w-80 z-50 overflow-y-auto p-4"
            style={{ backgroundColor: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Memory Bank</h3>
              <button onClick={toggleMemoryPanel} style={{ color: 'var(--color-text-secondary)' }}>
                <X size={18} />
              </button>
            </div>

            {activeCharacter ? (
              <div className="space-y-4">
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Active Character</p>
                  <p className="text-sm font-semibold">{activeCharacter.name}</p>
                </div>

                {budget && (
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Token Budget</p>
                    <div className="space-y-1 text-xs">
                      {budget.total_tokens != null && <div className="flex justify-between"><span>Total</span><span>{budget.total_tokens.toLocaleString()}</span></div>}
                      {budget.used_tokens != null && <div className="flex justify-between"><span>Used</span><span>{budget.used_tokens.toLocaleString()}</span></div>}
                      {budget.system_tokens != null && <div className="flex justify-between"><span>System</span><span>{budget.system_tokens.toLocaleString()}</span></div>}
                      {budget.history_tokens != null && <div className="flex justify-between"><span>History</span><span>{budget.history_tokens.toLocaleString()}</span></div>}
                      {budget.memory_tokens != null && <div className="flex justify-between"><span>Memory</span><span>{budget.memory_tokens.toLocaleString()}</span></div>}
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Relationship</p>
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Relationship tracking coming soon.</p>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Open a chat to see memory details.
              </p>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
