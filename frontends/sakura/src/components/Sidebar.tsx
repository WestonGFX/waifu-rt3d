import { useState, useCallback, useEffect } from 'react';
import {
  MessageCircle, Users, Sparkles, Brain, Settings,
  ChevronLeft, Search, Wifi, WifiOff, Pencil, BookMarked, UserCircle, Gamepad2, HelpCircle, Download
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../stores/appStore';
import { useWizardStore } from '../stores/wizardStore';
import { useChatStore } from '../stores/chatStore';
import { NotificationBadge } from './NotificationBadge';

/**
 * Desktop sidebar — primary navigation for the Sakura frontend.
 *
 * Three expandable sections:
 * - **Chats**: Character list — select a character to open their chat thread
 * - **Characters**: Browse all characters with avatar + personality info
 * - **Create**: Wizard opens in the main content area
 *
 * Header: "WAIFU.EXE" branding + LLM brain status (online/offline + provider)
 * Bottom toolbar: Memory Bank + Settings (open as overlay drawers)
 */
export function Sidebar() {
  const {
    sidebarCollapsed, toggleSidebar,
    sidebarSection, setSidebarSection,
    characters, activeCharacter, selectCharacter,
    llmStatus, pollLlmStatus,
    openOverlay, openSettingsTab,
  } = useAppStore();

  const [filter, setFilter] = useState('');

  /** Navigate to a character's chat when a notification is clicked. */
  const handleNavigateToChar = useCallback((charId: number) => {
    const char = characters.find(c => c.id === charId);
    if (char) selectCharacter(char);
  }, [characters, selectCharacter]);

  // Poll LLM status every 15s
  useEffect(() => {
    pollLlmStatus();
    const interval = setInterval(pollLlmStatus, 15_000);
    return () => clearInterval(interval);
  }, [pollLlmStatus]);

  const filteredChars = filter
    ? characters.filter(c => c.name?.toLowerCase().includes(filter.toLowerCase()))
    : characters;

  /** Section navigation items at the top of the sidebar. */
  const NAV_ITEMS = [
    { id: 'chats' as const, label: 'Chats', icon: MessageCircle, count: characters.length },
    { id: 'characters' as const, label: 'Characters', icon: Users },
    { id: 'create' as const, label: 'Create', icon: Sparkles },
  ];

  return (
    <aside
      className="sidebar flex flex-col h-screen flex-shrink-0 transition-all duration-300 relative"
      style={{
        width: sidebarCollapsed ? '56px' : '240px',
        backgroundColor: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border-subtle)',
      }}
    >
      {/* ── Header ────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-3 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--color-border-subtle)',
          minHeight: sidebarCollapsed ? '56px' : '60px',
          paddingTop: '10px',
          paddingBottom: '10px',
        }}
      >
        {!sidebarCollapsed ? (
          <div className="flex-1 min-w-0">
            <h1
              className="text-sm font-black tracking-tight leading-tight"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}
            >
              WAIFU.EXE
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                (Sakura)
              </span>
              <span className="text-[10px]" style={{ color: 'var(--color-border)' }}>|</span>
              {llmStatus.connected ? (
                <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-success)' }}>
                  <Wifi size={10} />
                  {llmStatus.provider || 'Online'}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  <WifiOff size={10} />
                  Offline
                </span>
              )}
            </div>
          </div>
        ) : (
          /* Collapsed state: the wifi indicator IS the toggle — no separate chevron needed
             at 56px width, ml-auto would push a second button off-screen. */
          <button
            onClick={toggleSidebar}
            className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mx-auto"
            style={{
              background: llmStatus.connected ? 'var(--color-success)' : 'var(--color-border)',
              opacity: 0.85,
              border: 'none',
              cursor: 'pointer',
            }}
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            {llmStatus.connected ? (
              <Wifi size={14} style={{ color: 'white' }} />
            ) : (
              <WifiOff size={14} style={{ color: 'white' }} />
            )}
          </button>
        )}
        {!sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg transition-colors duration-150 ml-auto flex-shrink-0"
            style={{ color: 'var(--color-text-tertiary)' }}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* ── Section Nav ───────────────────────────────────── */}
      <div className="flex flex-col gap-0.5 p-2 flex-shrink-0">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = sidebarSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSidebarSection(item.id)}
              className="sidebar-nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150"
              style={{
                backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
                color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}
              title={sidebarCollapsed ? item.label : undefined}
              aria-label={item.label}
              aria-pressed={active}
            >
              <Icon size={18} strokeWidth={active ? 2.2 : 1.5} />
              {!sidebarCollapsed && (
                <span className="text-xs font-medium flex-1 text-left">{item.label}</span>
              )}
              {!sidebarCollapsed && item.count != null && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: active ? 'var(--color-accent)' : 'var(--color-border)',
                    color: active ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Section Content ───────────────────────────────── */}
      {!sidebarCollapsed && (
        <div className="flex-1 overflow-y-auto px-2 pb-2" style={{ scrollbarWidth: 'thin' }}>
          <AnimatePresence mode="wait">
            {/* ─── Chats section: character list for opening chat threads ─── */}
            {sidebarSection === 'chats' && (
              <motion.div
                key="chats"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
              >
                {/* Search bar */}
                <div className="relative mb-2">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  />
                  <input
                    type="text"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="Search..."
                    className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--color-background)',
                      border: '1px solid var(--color-border-subtle)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>

                {/* Character list */}
                <div className="flex flex-col gap-1.5">
                  {filteredChars.length === 0 ? (
                    <p className="text-[10px] text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
                      {filter ? 'No matches' : 'No characters yet'}
                    </p>
                  ) : (
                    filteredChars.map(char => (
                      <SidebarCharItem
                        key={char.id}
                        character={char}
                        active={activeCharacter?.id === char.id}
                        onClick={() => selectCharacter(char)}
                      />
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* ─── Characters section: browse/select characters with details ─── */}
            {sidebarSection === 'characters' && (
              <motion.div
                key="characters"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="space-y-2"
              >
                <p className="text-[10px] px-1 mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  {characters.length} character{characters.length !== 1 ? 's' : ''} available
                </p>
                {characters.length === 0 ? (
                  <div className="text-center py-8">
                    <Users size={28} className="mx-auto mb-2" style={{ color: 'var(--color-text-tertiary)', opacity: 0.5 }} />
                    <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      No characters yet. Create one to get started.
                    </p>
                  </div>
                ) : (
                  characters.map(char => (
                    <CharacterProfileCard
                      key={char.id}
                      character={char}
                      active={activeCharacter?.id === char.id}
                      onSelect={() => selectCharacter(char)}
                      onEdit={() => { selectCharacter(char); openSettingsTab('character'); }}
                    />
                  ))
                )}
              </motion.div>
            )}

            {/* ─── Create section (placeholder — full wizard renders in main) ─── */}
            {sidebarSection === 'create' && (
              <motion.div
                key="create"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="text-center py-8"
              >
                <Sparkles size={32} className="mx-auto mb-3" style={{ color: 'var(--color-accent)' }} />
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Character Wizard
                </p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  The full creation wizard is shown in the main panel.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Bottom Toolbar ─────────────────────────────────── */}
      <div
        className="flex items-center gap-1 px-2 py-2 flex-shrink-0"
        style={{ borderTop: '1px solid var(--color-border-subtle)' }}
      >
        <button
          onClick={() => openOverlay('memory')}
          className="sidebar-tool-btn flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors flex-1"
          style={{ color: 'var(--color-text-tertiary)' }}
          title="Memory Bank"
        >
          <Brain size={16} />
          {!sidebarCollapsed && <span className="text-[10px] font-medium">Memory</span>}
        </button>
        <button
          onClick={() => openOverlay('lore')}
          className="sidebar-tool-btn flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors flex-1"
          style={{ color: 'var(--color-text-tertiary)' }}
          title="Lorebook"
          aria-label="Lorebook"
        >
          <BookMarked size={16} />
          {!sidebarCollapsed && <span className="text-[10px] font-medium">Lore</span>}
        </button>
        <button
          onClick={() => openOverlay('userknowledge')}
          className="sidebar-tool-btn flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors flex-1"
          style={{ color: 'var(--color-text-tertiary)' }}
          title="About Me — what the character knows about you"
          aria-label="About Me"
        >
          <UserCircle size={16} />
          {!sidebarCollapsed && <span className="text-[10px] font-medium">About Me</span>}
        </button>
        <button
          onClick={() => openOverlay('games')}
          className="sidebar-tool-btn flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors flex-1"
          style={{ color: 'var(--color-text-tertiary)' }}
          title="Mini Games"
          aria-label="Mini Games"
        >
          <Gamepad2 size={16} />
          {!sidebarCollapsed && <span className="text-[10px] font-medium">Games</span>}
        </button>
        <button
          onClick={() => openOverlay('modelbrowser')}
          className="sidebar-tool-btn flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors flex-1"
          style={{ color: 'var(--color-text-tertiary)' }}
          title="Browse & Download 3D Models"
          aria-label="Model Browser"
        >
          <Download size={16} />
          {!sidebarCollapsed && <span className="text-[10px] font-medium">Models</span>}
        </button>
        <button
          onClick={() => openOverlay('settings')}
          className="sidebar-tool-btn flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors flex-1"
          style={{ color: 'var(--color-text-tertiary)' }}
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={16} />
          {!sidebarCollapsed && <span className="text-[10px] font-medium">Settings</span>}
        </button>
        <NotificationBadge onNavigateToChar={handleNavigateToChar} />
        <HelpDropdown />
      </div>
    </aside>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Help Dropdown — "?" button with quick links
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Help dropdown button in the sidebar bottom toolbar.
 * Opens upward with links to Setup Guides, Keyboard Shortcuts, and What's New.
 */
function HelpDropdown() {
  const [open, setOpen] = useState(false);
  const { openSettingsTab } = useAppStore();
  const { openWizard } = useWizardStore();

  const items = [
    {
      label: 'Setup Guides',
      action: () => { openSettingsTab('general'); setOpen(false); },
    },
    {
      label: 'Keyboard Shortcuts',
      action: () => {
        // Dispatch '?' shortcut event to toggle the help modal
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
        setOpen(false);
      },
    },
    {
      label: "What's New",
      action: () => { openWizard('whats-new'); setOpen(false); },
    },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="sidebar-tool-btn flex items-center justify-center p-2 rounded-lg transition-colors"
        style={{ color: 'var(--color-text-tertiary)' }}
        title="Help"
        aria-label="Help"
      >
        <HelpCircle size={16} />
      </button>

      {open && (
        <>
          {/* Backdrop to close on click outside */}
          <div className="fixed inset-0 z-[89]" onClick={() => setOpen(false)} />
          {/* Dropdown (opens upward) */}
          <div
            className="absolute bottom-full left-0 mb-1.5 z-[90] min-w-[160px] py-1 rounded-lg"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border-subtle)',
              boxShadow: 'var(--shadow-elevated)',
            }}
          >
            {items.map(item => (
              <button
                key={item.label}
                onClick={item.action}
                className="w-full text-left px-3 py-2 text-xs transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseEnter={e => { (e.target as HTMLElement).style.backgroundColor = 'var(--color-accent-soft)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Sidebar Character Item — compact row for the Chats list
   ═══════════════════════════════════════════════════════════════════════ */

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

function isImageUrl(url?: string): boolean {
  if (!url) return false;
  try { return IMAGE_EXTS.test(new URL(url, window.location.origin).pathname); }
  catch { return IMAGE_EXTS.test(url); }
}

function resolveAvatarUrl(name?: string, avatarUrl?: string): string | null {
  if (isImageUrl(avatarUrl)) return avatarUrl!;
  const parenMatch = name?.match(/\(([^)]+)\)/);
  const cleanName = parenMatch
    ? parenMatch[1].trim().toLowerCase()
    : (name?.split(/\s/)[0] || '').toLowerCase();
  if (cleanName) return `/files/images/${cleanName}_portrait.png`;
  return null;
}

/** Emotion emoji lookup for sidebar indicator (Phase 15). */
const SIDEBAR_EMOTION_EMOJI: Record<string, string> = {
  happy: '😊', sad: '🥺', angry: '😤', surprised: '😮', fearful: '😨',
  disgusted: '🤢', embarrassed: '😳', shy: '🫣', proud: '😎',
  confident: '😏', jealous: '😑', grateful: '🙏', confused: '😕',
  curious: '🧐', thoughtful: '🤔', nostalgic: '😌', awe: '🤩',
  love: '❤️', flirty: '😉', longing: '😔', excited: '✨',
  tired: '😴', relieved: '😌', smug: '😏', mischievous: '😈',
};

/** How long the sidebar emotion indicator stays visible (ms). */
const EMOTION_INDICATOR_TIMEOUT = 10_000;

interface SidebarCharItemProps {
  character: { id: number; name?: string; avatar_url?: string; greeting_message?: string; emotion_portraits_mode?: number };
  active: boolean;
  onClick: () => void;
}

/**
 * Compact character row in the sidebar chat list.
 * Shows avatar circle (with onError fallback to initial), name, and active highlight.
 * Phase 15: When emotion_portraits_mode >= 2, shows a temporary emotion emoji
 * badge over the avatar for EMOTION_INDICATOR_TIMEOUT ms after each emotion change.
 */
function SidebarCharItem({ character, active, onClick }: SidebarCharItemProps) {
  const avatarUrl = resolveAvatarUrl(character.name, character.avatar_url);
  const [imgFailed, setImgFailed] = useState(false);
  const handleImgError = useCallback(() => setImgFailed(true), []);

  const showImage = avatarUrl !== null && !imgFailed;
  const initial = character.name?.[0] ?? '?';

  // Phase 15: sidebar emotion indicator
  const portraitsMode = character.emotion_portraits_mode ?? 0;
  const latestEntry = useChatStore(s => s.latestEmotionByChar[character.id]);
  const [showEmotion, setShowEmotion] = useState(false);

  useEffect(() => {
    if (portraitsMode < 2 || !latestEntry || latestEntry.emotion === 'neutral') {
      setShowEmotion(false);
      return;
    }
    // Show if the emotion was set recently
    const age = Date.now() - latestEntry.timestamp;
    if (age > EMOTION_INDICATOR_TIMEOUT) { setShowEmotion(false); return; }
    setShowEmotion(true);
    const timer = setTimeout(() => setShowEmotion(false), EMOTION_INDICATOR_TIMEOUT - age);
    return () => clearTimeout(timer);
  }, [portraitsMode, latestEntry?.emotion, latestEntry?.timestamp]);

  const emotionEmoji = latestEntry ? SIDEBAR_EMOTION_EMOJI[latestEntry.emotion] : undefined;

  return (
    <button
      onClick={onClick}
      className="sidebar-char-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150 text-left"
      style={{
        backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
        border: active ? '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' : '1px solid transparent',
      }}
    >
      <div className="relative flex-shrink-0">
        {showImage ? (
          <img
            src={avatarUrl!}
            alt={character.name || ''}
            onError={handleImgError}
            className="w-9 h-9 rounded-full object-cover"
          />
        ) : (
          <AvatarInitial initial={initial} size={9} />
        )}
        {/* Phase 15: Emotion badge */}
        {showEmotion && emotionEmoji && (
          <span
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              fontSize: '0.7rem',
              lineHeight: 1,
              background: 'var(--color-background)',
              borderRadius: '50%',
              padding: '1px',
              transition: 'opacity 0.3s ease',
            }}
            title={latestEntry?.emotion}
          >
            {emotionEmoji}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="char-name-display truncate"
          style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-primary)', fontSize: '0.82rem' }}
        >
          {character.name || 'Unnamed'}
        </p>
        <p className="text-[10px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
          {character.greeting_message || 'Start a conversation...'}
        </p>
      </div>
      {active && (
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: 'var(--color-success)', boxShadow: '0 0 4px var(--color-success)' }}
        />
      )}
    </button>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Character Profile Card — richer card for the Characters browser
   ═══════════════════════════════════════════════════════════════════════ */

interface CharacterProfileCardProps {
  character: {
    id: number;
    name?: string;
    avatar_url?: string;
    system_prompt?: string;
    greeting_message?: string;
    voice_id?: string;
    tts_provider?: string;
    model_vrm?: string;
  };
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
}

/**
 * Richer character card for the Characters browser section.
 * Shows avatar, name, personality snippet, voice info, and VRM badge.
 */
function CharacterProfileCard({ character, active, onSelect, onEdit }: CharacterProfileCardProps) {
  const avatarUrl = resolveAvatarUrl(character.name, character.avatar_url);
  const [imgFailed, setImgFailed] = useState(false);
  const handleImgError = useCallback(() => setImgFailed(true), []);

  const showImage = avatarUrl !== null && !imgFailed;
  const initial = character.name?.[0] ?? '?';
  const snippet = character.system_prompt
    ? character.system_prompt.slice(0, 80) + (character.system_prompt.length > 80 ? '...' : '')
    : 'No personality set';

  return (
    <div
      className="group sidebar-preset-card w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 flex items-start gap-2.5"
      style={{
        backgroundColor: active ? 'var(--color-accent-soft)' : 'var(--color-background)',
        border: active
          ? '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)'
          : '1px solid var(--color-border-subtle)',
        cursor: 'pointer',
      }}
      onClick={onSelect}
    >
      {showImage ? (
        <img
          src={avatarUrl!}
          alt={character.name || ''}
          onError={handleImgError}
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <AvatarInitial initial={initial} size={10} rounded="rounded-lg" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className="char-name-display truncate"
          style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-primary)', fontSize: '0.8rem' }}
        >
          {character.name || 'Unnamed'}
        </p>
        <p className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--color-text-tertiary)' }}>
          {snippet}
        </p>
        {/* Badges row */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {character.voice_id && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
            >
              {character.tts_provider || 'tts'}
            </span>
          )}
          {character.model_vrm && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
            >
              3D
            </span>
          )}
        </div>
      </div>
      {/* Edit shortcut — opens Settings > Character tab */}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity flex-shrink-0 self-start"
        style={{ color: 'var(--color-text-tertiary)' }}
        title="Edit character"
      >
        <Pencil size={12} />
      </button>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Shared avatar initial circle
   ═══════════════════════════════════════════════════════════════════════ */

function AvatarInitial({ initial, size = 9, rounded = 'rounded-full' }: { initial: string; size?: number; rounded?: string }) {
  return (
    <div
      className={`w-${size} h-${size} ${rounded} flex-shrink-0 flex items-center justify-center`}
      style={{
        background: 'var(--color-accent-gradient)',
        color: 'var(--color-accent-text)',
        fontSize: '0.85rem',
        fontWeight: 600,
        minWidth: `${size * 4}px`,
        minHeight: `${size * 4}px`,
      }}
    >
      {initial}
    </div>
  );
}
