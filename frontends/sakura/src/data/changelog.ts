/* ── Release notes data ───────────────────────────────────────────────── */

/** A single feature highlight within a release. */
export interface ReleaseHighlight {
  /** Lucide icon name for the highlight card. */
  icon: string;
  title: string;
  description: string;
  /** Optional wizard ID to link a "Set up" action. */
  wizardLink?: string;
}

/** A release note entry for the What's New modal. */
export interface ReleaseNote {
  version: string;
  date: string;
  highlights: ReleaseHighlight[];
}

/**
 * Static changelog data rendered by the WhatsNewModal.
 *
 * Add new entries at the TOP of the array (newest first).
 * Only include user-facing highlights, not internal fixes.
 */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '5.34.0',
    date: '2026-02-28',
    highlights: [
      {
        icon: 'Sparkles',
        title: 'Setup Wizards & Feature Discovery',
        description: 'Guided setup for voice, LLM, and image generation. Contextual tips help you discover features as you chat.',
      },
      {
        icon: 'Cpu',
        title: 'Hardware Auto-Detection',
        description: 'The onboarding wizard now scans your hardware and auto-detects LM Studio / Ollama.',
      },
      {
        icon: 'Volume2',
        title: 'Voice Setup Guide',
        description: 'A dedicated wizard helps you choose and preview voice engines with hardware-aware recommendations.',
        wizardLink: 'voice-setup',
      },
      {
        icon: 'HelpCircle',
        title: 'Help Menu',
        description: 'Quick access to Setup Guides, Keyboard Shortcuts, and What\'s New from the sidebar.',
      },
    ],
  },
  {
    version: '5.33.0',
    date: '2026-02-27',
    highlights: [
      {
        icon: 'Palette',
        title: '18 Built-in Themes',
        description: 'Added Monokai, Darcula, Dracula, Tokyo Night, Bubblegum, Blurple, and more.',
      },
      {
        icon: 'Brain',
        title: 'Tiered Episodic Memory',
        description: 'Three-tier memory system with sqlite-vec for semantic search across conversations.',
      },
      {
        icon: 'Gamepad2',
        title: 'Mini Games',
        description: 'Play trivia, hangman, word chain, and more with your AI character.',
      },
    ],
  },
];
