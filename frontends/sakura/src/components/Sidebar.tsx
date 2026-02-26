import { useState } from 'react';
import {
  MessageCircle, Users, Sparkles, Brain, Settings,
  ChevronLeft, ChevronRight, Plus, Search
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../stores/appStore';
import { CharacterCard } from './CharacterCard';
import { api } from '../lib/api';

/** Preset archetypes for quick character creation. */
const PRESETS = [
  { name: 'Tsundere', icon: '🔥', desc: 'Hot-tempered but secretly caring',
    prompt: "You are a sharp-tongued tsundere. You deny your feelings but secretly care deeply. You get flustered when complimented and use phrases like 'b-baka!' when embarrassed. You're competitive, proud, but ultimately loyal.",
    greeting: "D-don't get the wrong idea! I'm only talking to you because I'm bored!" },
  { name: 'Kuudere', icon: '❄️', desc: 'Cool, calm, barely shows emotion',
    prompt: 'You are a kuudere — cool, logical, and rarely express emotion. You speak concisely and analytically. When you do show warmth, it\'s subtle and meaningful.',
    greeting: '...Hello. I suppose we can talk, if you want.' },
  { name: 'Genki', icon: '⚡', desc: 'Hyper-energetic and optimistic',
    prompt: "You are a genki girl — always bursting with energy and enthusiasm! You love fun, games, and making people smile.",
    greeting: "Hiii~! Oh my gosh, I'm SO happy to meet you!!" },
  { name: 'Onee-san', icon: '🌸', desc: 'Mature, caring older sister type',
    prompt: "You are an onee-san type — a mature, caring older sister figure. You're nurturing but can be teasing.",
    greeting: 'Ara ara~ Welcome. Make yourself comfortable.' },
  { name: 'Goth', icon: '🦇', desc: 'Mysterious, dark aesthetic',
    prompt: 'You are a gothic character who loves the occult and speaks in dramatic metaphors. Despite the dark exterior, you have a kind heart.',
    greeting: 'The ancient prophecy foretold your arrival...' },
];

/**
 * Desktop sidebar — primary navigation for the Sakura frontend.
 *
 * Three expandable sections:
 * - **Chats**: Character list, click to open chat in main content
 * - **Characters**: Preset archetypes for quick creation
 * - **Create**: Opens the full wizard in the main content area
 *
 * Bottom toolbar: Memory Bank + Settings (open as overlay drawers)
 */
export function Sidebar() {
  const {
    sidebarCollapsed, toggleSidebar,
    sidebarSection, setSidebarSection,
    characters, activeCharacter, selectCharacter,
    loadCharacters,
    openOverlay,
  } = useAppStore();

  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState<string | null>(null);

  const filteredChars = filter
    ? characters.filter(c => c.name?.toLowerCase().includes(filter.toLowerCase()))
    : characters;

  const createFromPreset = async (preset: typeof PRESETS[0]) => {
    setCreating(preset.name);
    try {
      await api.createCharacter({
        name: preset.name,
        system_prompt: preset.prompt,
        greeting_message: preset.greeting,
      });
      await loadCharacters();
      setSidebarSection('chats');
    } catch (e) {
      console.error('Failed to create character:', e);
    } finally {
      setCreating(null);
    }
  };

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
        width: sidebarCollapsed ? '56px' : '280px',
        backgroundColor: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border-subtle)',
      }}
    >
      {/* ── Header ────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-3 h-14 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
      >
        {!sidebarCollapsed && (
          <h1
            className="text-sm font-bold tracking-tight flex-1 truncate"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Sakura
          </h1>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg transition-colors duration-150 ml-auto"
          style={{ color: 'var(--color-text-tertiary)' }}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
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
            {/* ─── Chats section ─── */}
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

            {/* ─── Characters (presets) section ─── */}
            {sidebarSection === 'characters' && (
              <motion.div
                key="characters"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="space-y-1.5"
              >
                <p className="text-[10px] px-1 mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
                  Quick-create from archetype
                </p>
                {PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => createFromPreset(preset)}
                    disabled={creating !== null}
                    className="sidebar-preset-card w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-background)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{preset.icon}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {preset.name}
                          {creating === preset.name && (
                            <span className="ml-1.5 text-[10px]" style={{ color: 'var(--color-accent)' }}>
                              Creating...
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                          {preset.desc}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
                {/* Full wizard link */}
                <button
                  onClick={() => setSidebarSection('create')}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors"
                  style={{
                    border: '1px dashed var(--color-border)',
                    color: 'var(--color-accent)',
                  }}
                >
                  <Plus size={14} />
                  <span className="text-xs font-medium">Custom (Full Wizard)</span>
                </button>
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
          onClick={() => openOverlay('settings')}
          className="sidebar-tool-btn flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors flex-1"
          style={{ color: 'var(--color-text-tertiary)' }}
          title="Settings"
        >
          <Settings size={16} />
          {!sidebarCollapsed && <span className="text-[10px] font-medium">Settings</span>}
        </button>
      </div>
    </aside>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Sidebar Character Item — compact row for the character list
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
  if (cleanName) return `/files/images/${cleanName}_pixel_portrait.png`;
  return null;
}

interface SidebarCharItemProps {
  character: { id: number; name?: string; avatar_url?: string; greeting_message?: string };
  active: boolean;
  onClick: () => void;
}

/**
 * Compact character row in the sidebar chat list.
 * Shows avatar circle, name, and a faint active highlight.
 */
function SidebarCharItem({ character, active, onClick }: SidebarCharItemProps) {
  const avatarUrl = resolveAvatarUrl(character.name, character.avatar_url);
  const hasImage = avatarUrl !== null;

  return (
    <button
      onClick={onClick}
      className="sidebar-char-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150 text-left"
      style={{
        backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
        border: active ? '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' : '1px solid transparent',
      }}
    >
      <div
        className="w-9 h-9 rounded-full bg-cover bg-center flex-shrink-0 flex items-center justify-center"
        style={{
          backgroundImage: hasImage ? `url(${avatarUrl})` : undefined,
          backgroundColor: hasImage ? undefined : 'var(--color-accent)',
          color: 'var(--color-accent-text)',
          fontSize: '0.85rem',
          fontWeight: 600,
        }}
      >
        {!hasImage && (character.name?.[0] ?? '?')}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="text-xs font-semibold truncate"
          style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-primary)' }}
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
