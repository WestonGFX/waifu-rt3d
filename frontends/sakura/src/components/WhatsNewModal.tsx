import { motion } from 'framer-motion';
import { X, Sparkles, Cpu, Volume2, HelpCircle, Palette, Brain, Gamepad2, ChevronRight } from 'lucide-react';
import { useWizardStore } from '../stores/wizardStore';
import { useAppStore } from '../stores/appStore';
import { RELEASE_NOTES } from '../data/changelog';
import type { WizardId } from '../stores/wizardStore';

/* ── Icon mapping ─────────────────────────────────────────────────────── */

const ICONS: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles size={16} />,
  Cpu: <Cpu size={16} />,
  Volume2: <Volume2 size={16} />,
  HelpCircle: <HelpCircle size={16} />,
  Palette: <Palette size={16} />,
  Brain: <Brain size={16} />,
  Gamepad2: <Gamepad2 size={16} />,
};

/**
 * "What's New" modal — shown when the server version differs from the
 * user's last seen version. Displays release highlights with optional
 * wizard links for quick feature setup.
 */
export function WhatsNewModal() {
  const { closeWizard, openWizard } = useWizardStore();
  const { saveConfig } = useAppStore();

  // Show the latest release note (or the first one matching the new version)
  const latestRelease = RELEASE_NOTES[0];
  if (!latestRelease) {
    closeWizard();
    return null;
  }

  const handleDismiss = async () => {
    await saveConfig({ last_seen_version: latestRelease.version } as Record<string, unknown>).catch(() => {});
    useWizardStore.setState({ lastSeenVersion: latestRelease.version });
    closeWizard();
  };

  const handleWizardLink = (wizardId: string) => {
    handleDismiss().then(() => {
      openWizard(wizardId as WizardId);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={handleDismiss}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-sm sm:max-w-md mx-4 rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-background)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--shadow-elevated)',
          maxHeight: '80vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
        >
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
              What's New
            </h2>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              v{latestRelease.version} · {latestRelease.date}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Highlights */}
        <div className="overflow-y-auto p-5 flex flex-col gap-3" style={{ maxHeight: 'calc(80vh - 120px)' }}>
          {latestRelease.highlights.map((h, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
              >
                {ICONS[h.icon] || <Sparkles size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {h.title}
                </h4>
                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {h.description}
                </p>
                {h.wizardLink && (
                  <button
                    onClick={() => handleWizardLink(h.wizardLink!)}
                    className="flex items-center gap-1 mt-1.5 text-[10px] font-medium"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    Set up <ChevronRight size={10} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex justify-center px-5 py-3"
          style={{ borderTop: '1px solid var(--color-border-subtle)' }}
        >
          <button
            onClick={handleDismiss}
            className="px-6 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
          >
            Got it
          </button>
        </div>
      </motion.div>
    </div>
  );
}
