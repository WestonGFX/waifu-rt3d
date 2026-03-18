import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext.tsx';
import { type SettingsTab } from '../../types/companion.ts';
import { Button } from '@/components/ui/button.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import AdvancedSettingsPanel from './AdvancedSettingsPanel.tsx';
import GeneralSettingsPanel from './GeneralSettingsPanel.tsx';
import MemorySettingsPanel from './MemorySettingsPanel.tsx';
import ModelManagerPanel from './ModelManagerPanel.tsx';
import PersonaSettingsPanel from './PersonaSettingsPanel.tsx';
import RenderingSettingsPanel from './RenderingSettingsPanel.tsx';
import RoomsSettingsPanel from './RoomsSettingsPanel.tsx';
import SetupWizard from './SetupWizard.tsx';
import ContentSettingsPanel from './ContentSettingsPanel.tsx';
import LorebookSettingsPanel from './LorebookSettingsPanel.tsx';
import UsageDashboardPanel from './UsageDashboardPanel.tsx';
import RelationshipWebPanel from './RelationshipWebPanel.tsx';
import CharacterGalleryPanel from './CharacterGalleryPanel.tsx';
import VoiceSettingsPanel from './VoiceSettingsPanel.tsx';
import ThemeEditorPanel from './ThemeEditorPanel.tsx';
import BackupRestorePanel from './BackupRestorePanel.tsx';

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; blurb: string }> = [
  { id: 'general', label: 'General', blurb: 'Health, startup behavior, shell style, and quick resets.' },
  { id: 'voice', label: 'Voice', blurb: 'TTS profiles, previews, routing, and cloud voice access.' },
  { id: 'rendering', label: 'Rendering', blurb: 'Performance profiles, FPS caps, camera feel, and quality tuning.' },
  { id: 'rooms', label: 'Rooms', blurb: 'Scene selection, room library, imports, and active environment status.' },
  { id: 'models', label: 'Models', blurb: 'LLMs, TTS models, motion installs, avatar assets, and runtime state.' },
  { id: 'memory', label: 'Memory', blurb: 'Summaries, saved memories, and context-window behavior.' },
  { id: 'persona', label: 'Persona', blurb: 'Character identity, dere tags, prompt preview, and worldbuilding.' },
  { id: 'content', label: 'Content', blurb: 'Content rating, age verification, content lock, and sensory writing.' },
  { id: 'lorebook', label: 'Story Bible', blurb: 'Lorebook entries, world info, keyword triggers, and author\'s notes.' },
  { id: 'usage', label: 'Usage', blurb: 'Token budget, session history, cost estimates, and model benchmarks.' },
  { id: 'relationships', label: 'Relationships', blurb: 'Character connections, relationship types, and visual relationship web.' },
  { id: 'gallery', label: 'Gallery', blurb: 'Browse and import community character cards.' },
  { id: 'themes', label: 'Themes', blurb: 'Custom CSS themes, color pickers, and live preview.' },
  { id: 'backup', label: 'Backup', blurb: 'Export and import your data, personas, and settings.' },
  { id: 'advanced', label: 'Advanced', blurb: 'Helper diagnostics, credits, raw config, and debug traces.' },
];

function TabButton({
  id,
  label,
  blurb,
  compact,
  active,
  onSelect,
}: {
  id: SettingsTab;
  label: string;
  blurb: string;
  compact: boolean;
  active: boolean;
  onSelect: (tab: SettingsTab) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={active}
      data-active={active ? 'true' : 'false'}
      className={[
        compact
          ? 'settings-tab-button settings-tab-button--compact relative -mb-px h-10 w-auto rounded-t-[1rem] rounded-b-[0.55rem] px-3.5 py-1.5 text-sm'
          : 'settings-tab-button h-auto w-full flex-col items-start justify-start gap-1.5 rounded-[1.1rem] px-3 py-2.5 text-left shadow-[0_12px_28px_-28px_var(--color-glow-primary)]',
        'border text-text-secondary transition-[background-color,border-color,color,box-shadow,transform] duration-150 hover:bg-[color:var(--control-bg)] data-[active=true]:text-text-primary',
      ].join(' ')}
    >
      <div className="text-sm font-medium">{label}</div>
      {!compact ? (
        <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-text-muted">{blurb}</div>
      ) : null}
    </button>
  );
}

export default function SettingsPanel({
  embedded = false,
  onRequestClose,
  heightMode = 'contained',
}: {
  embedded?: boolean;
  onRequestClose?: () => void;
  heightMode?: 'contained' | 'natural';
}) {
  const { state: settingsState, dispatch: settingsDispatch } = useSettings();
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const [panelWidth, setPanelWidth] = useState(960);

  useEffect(() => {
    const node = panelRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPanelWidth(Math.round(entry.contentRect.width));
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    contentRef.current?.focus({ preventScroll: true });
  }, [settingsState.currentTab]);

  const activeTabMeta = useMemo(
    () => SETTINGS_TABS.find((tab) => tab.id === settingsState.currentTab) ?? SETTINGS_TABS[0],
    [settingsState.currentTab],
  );

  const usesCompactSelect = !embedded && panelWidth < 620;
  const usesSplitTabRail = embedded ? panelWidth >= 1320 : panelWidth >= 980;
  const naturalHeight = heightMode === 'natural';
  const embeddedCompactHeader = embedded && panelWidth < 1320;
  const showEmbeddedTabRail = embedded && !usesSplitTabRail;
  const showEmbeddedContentHeader = !embedded;

  const renderTabContent = (tab: SettingsTab) => {
    switch (tab) {
      case 'general':
        return <GeneralSettingsPanel embedded={embedded} />;
      case 'voice':
        return <VoiceSettingsPanel />;
      case 'rendering':
        return <RenderingSettingsPanel />;
      case 'rooms':
        return <RoomsSettingsPanel />;
      case 'models':
        return <ModelManagerPanel />;
      case 'memory':
        return <MemorySettingsPanel embedded={embedded} />;
      case 'persona':
        return <PersonaSettingsPanel />;
      case 'content':
        return <ContentSettingsPanel />;
      case 'lorebook':
        return <LorebookSettingsPanel />;
      case 'usage':
        return <UsageDashboardPanel />;
      case 'relationships':
        return <RelationshipWebPanel />;
      case 'gallery':
        return <CharacterGalleryPanel />;
      case 'themes':
        return <ThemeEditorPanel />;
      case 'backup':
        return <BackupRestorePanel />;
      case 'advanced':
        return <AdvancedSettingsPanel />;
      default:
        return <GeneralSettingsPanel />;
    }
  };

  if (settingsState.wizardStep !== null) {
    return (
      <div
        ref={panelRef}
        data-testid="settings-panel-root"
        className={naturalHeight ? 'flex flex-col bg-transparent' : 'flex h-full min-h-0 flex-col bg-transparent'}
      >
        <div className="flex items-center justify-between bg-[color:var(--shell-panel)] px-5 pb-2 pt-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">Setup</div>
            <div className="mt-1 font-display text-lg font-semibold text-text-primary">Companion setup</div>
          </div>
      {!embedded && onRequestClose ? (
            <Button variant="ghost" size="icon" onClick={onRequestClose} aria-label="Close settings">
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className={naturalHeight ? 'flex flex-col overflow-visible px-1 pb-1' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-3'}>
          <SetupWizard />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      data-testid="settings-panel-root"
      className={naturalHeight ? 'flex flex-col bg-transparent' : 'flex h-full min-h-0 flex-col bg-transparent'}
    >
      {!embedded ? (
        <div className="border-b border-[color:var(--shell-divider)] bg-[color:var(--shell-panel)] px-4 py-3 backdrop-blur-md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">Control center</div>
              <div className="mt-1 font-display text-xl font-semibold text-text-primary">Settings</div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
                Voice, rooms, rendering, memory, persona, and runtime controls live here without stealing the main chat workspace.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="normal-case tracking-normal">
                {SETTINGS_TABS.length} sections
              </Badge>
              {onRequestClose ? (
                <Button variant="ghost" size="icon" onClick={onRequestClose} aria-label="Close settings">
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={[
          naturalHeight ? 'flex flex-col overflow-visible' : 'flex h-full min-h-0 flex-col overflow-hidden',
          usesSplitTabRail ? 'lg:grid lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]' : '',
        ].join(' ')}
      >
        {!usesCompactSelect ? (
          <aside className={[
            naturalHeight
              ? 'border-b border-[color:var(--shell-divider)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card-bg)_92%,white_8%),color-mix(in_srgb,var(--card-bg-soft)_84%,transparent))]'
              : 'min-h-0 border-b border-[color:var(--shell-divider)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card-bg)_92%,white_8%),color-mix(in_srgb,var(--card-bg-soft)_84%,transparent))]',
            usesSplitTabRail ? 'lg:border-b-0 lg:border-r' : showEmbeddedTabRail ? 'border-b-0' : '',
          ].join(' ')}>
            <div className={
              usesSplitTabRail
                ? naturalHeight
                  ? 'overflow-visible px-2.5 py-2.5'
                  : 'min-h-0 overflow-auto px-2.5 py-2.5 lg:h-full'
                : showEmbeddedTabRail
                  ? 'overflow-x-auto px-2.5 pb-0 pt-2'
                  : 'overflow-x-auto px-2.5 py-2.5'
            }>
              <div
                className={[
                  'flex gap-2 bg-transparent p-0',
                  usesSplitTabRail
                    ? 'min-w-0 flex-col rounded-none border-none'
                    : showEmbeddedTabRail
                      ? 'min-w-max flex-row items-end gap-1.5'
                      : 'min-w-max',
                ].join(' ')}
              >
                {SETTINGS_TABS.map((tab) => (
                  <TabButton
                    key={tab.id}
                    id={tab.id}
                    label={tab.label}
                    blurb={tab.blurb}
                    compact={!usesSplitTabRail}
                    active={settingsState.currentTab === tab.id}
                    onSelect={(nextTab) => settingsDispatch({ type: 'SET_TAB', payload: nextTab })}
                  />
                ))}
              </div>
            </div>
          </aside>
        ) : null}

        <section
          ref={contentRef}
          tabIndex={0}
          className={naturalHeight ? 'flex min-h-0 flex-col overflow-visible outline-none' : 'flex h-full min-h-0 flex-col overflow-hidden outline-none'}
        >
          <div className={[
            naturalHeight
              ? `flex flex-col bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card-bg)_94%,white_6%),color-mix(in_srgb,var(--card-bg-soft)_86%,transparent))] pb-5 ${embedded ? 'pt-0' : 'pt-1'}`
              : `min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card-bg)_94%,white_6%),color-mix(in_srgb,var(--card-bg-soft)_86%,transparent))] pb-5 ${embedded ? 'pt-0' : 'pt-1'}`,
            embedded ? 'px-2.5 lg:px-3' : 'px-3 lg:px-4 xl:px-5',
          ].join(' ')}>
            {showEmbeddedContentHeader ? (
              <div className={[
                naturalHeight || embedded ? 'mb-1.5 bg-[color:var(--card-bg)] pb-1 pt-0' : 'sticky top-0 z-10 mb-2.5 bg-[color:var(--card-bg)] pb-1.5 pt-0.5 backdrop-blur-sm',
                embedded ? '-mx-2.5 px-2.5 lg:-mx-3 lg:px-3' : '-mx-3 px-3 lg:-mx-4 lg:px-4 xl:-mx-5 xl:px-5',
              ].join(' ')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">{activeTabMeta.label}</div>
                    <div className={`font-display font-semibold text-text-primary ${embeddedCompactHeader ? 'mt-0.25 text-[0.94rem] xl:text-[1.02rem]' : 'mt-1 text-xl xl:text-2xl'}`}>
                      {embedded ? activeTabMeta.label : (activeTabMeta.blurb.split(',')[0] || activeTabMeta.label)}
                    </div>
                    {!embeddedCompactHeader ? (
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">{activeTabMeta.blurb}</p>
                    ) : null}
                  </div>
                  <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
                    {usesCompactSelect ? (
                      <div className="min-w-[12rem] sm:min-w-[14rem]">
                        <Select
                          value={settingsState.currentTab}
                          onValueChange={(nextTab) => settingsDispatch({ type: 'SET_TAB', payload: nextTab as SettingsTab })}
                        >
                          <SelectTrigger className="h-8.5 rounded-pill text-xs">
                            <SelectValue placeholder="Choose a section" />
                          </SelectTrigger>
                          <SelectContent>
                            {SETTINGS_TABS.map((tab) => (
                              <SelectItem key={tab.id} value={tab.id}>
                                {tab.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>
                </div>
                <Separator className="mt-2" />
              </div>
            ) : null}

            <div className={naturalHeight ? 'pb-4' : 'pb-4'}>
              <div
                key={settingsState.currentTab}
                data-testid="settings-tab-panel"
                data-settings-tab={settingsState.currentTab}
                className="motion-tab-panel"
              >
                {renderTabContent(settingsState.currentTab)}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
