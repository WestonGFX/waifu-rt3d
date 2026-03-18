import { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useChat } from '../../context/ChatContext.tsx';
import { useCompanion } from '../../context/CompanionContext.tsx';
import { useSettings } from '../../context/SettingsContext.tsx';
import { clearState } from '../../services/storageService.ts';
import { APP_THEME_OPTIONS, getThemeLabel } from '../../services/themePresets.ts';
import { isTauriEnvironment, openPetWindow } from '../../services/tauriPetService.ts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import HelperStatusStrip from './HelperStatusStrip.tsx';
import {
  AppCard,
  AppField,
  AppMutedNote,
  Button,
  Switch,
  SettingsSectionHeader,
  SettingsStatCard,
} from './SettingsPrimitives.tsx';

function Toggle({
  label,
  description,
  checked,
  onClick,
  compact = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <AppCard className={`flex items-center justify-between gap-3 ${compact ? 'px-3 py-2' : 'px-3.5 py-2.5'}`}>
      <div className="min-w-0 flex-1 pr-2">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        <div className={`mt-0.5 text-xs leading-5 text-text-muted ${compact ? 'line-clamp-2' : ''}`}>{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onClick} />
    </AppCard>
  );
}

/**
 * PetModeCard – Settings card for launching the desktop pet overlay.
 * Only rendered when the app is running inside Tauri.
 */
function PetModeCard({ embedded }: { embedded: boolean }) {
  const [launching, setLaunching] = useState(false);

  /** Open the pet window via Tauri IPC. */
  const handleLaunch = async () => {
    setLaunching(true);
    try {
      await openPetWindow();
    } catch (err) {
      console.error('[PetModeCard] Failed to open pet window:', err);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <AppCard className={embedded ? 'p-3' : 'p-3.5'}>
      <SettingsSectionHeader
        eyebrow="Desktop"
        title="Desktop pet mode"
        description="Launch a small, always-on-top avatar that floats on your desktop. Right-click the pet for a quick chat."
      />
      <div className={`${embedded ? 'mt-2.5' : 'mt-3'}`}>
        <Button
          type="button"
          onClick={() => void handleLaunch()}
          disabled={launching}
        >
          {launching ? 'Launching...' : 'Launch desktop pet'}
        </Button>
      </div>
    </AppCard>
  );
}

export default function GeneralSettingsPanel({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { state: settingsState, dispatch: settingsDispatch } = useSettings();
  const { state: appState, dispatch: appDispatch } = useApp();
  const { state: chatState, dispatch: chatDispatch } = useChat();
  const {
    state: companionState,
    currentThread,
    activePersona,
    resetPersonaThemesToAppDefault,
  } = useCompanion();
  const headerModules = appState.workspacePanelPreferences.headerModules ?? {
    overview: true,
    focus: true,
    actions: false,
  };

  const handleClearHistory = () => {
    chatDispatch({ type: 'CLEAR_HISTORY' });
    clearState();
  };

  return (
    <div className={embedded ? 'space-y-2.75' : 'space-y-3.5'}>
      {embedded ? null : (
        <AppMutedNote>
          App-level defaults, workspace visibility, quick resets, and helper health live here.
        </AppMutedNote>
      )}

      <HelperStatusStrip compact={embedded} />

      <div className={`grid ${embedded ? 'gap-2 xl:grid-cols-2' : 'gap-3 xl:grid-cols-2'}`}>
        <Toggle
          label="Auto-read assistant"
          description="Automatically read new assistant replies aloud using the current voice."
          checked={settingsState.autoReadAssistant}
          compact={embedded}
          onClick={() => settingsDispatch({
            type: 'SET_AUTO_READ_ASSISTANT',
            payload: !settingsState.autoReadAssistant,
          })}
        />
        <Toggle
          label="Dev mode"
          description="Expose telemetry, debug surfaces, and raw runtime information."
          checked={appState.devMode}
          compact={embedded}
          onClick={() => appDispatch({ type: 'SET_DEV_MODE', payload: !appState.devMode })}
        />
      </div>

      <AppCard className={embedded ? 'p-3' : 'p-3.5'}>
        <SettingsSectionHeader
          eyebrow="Shell"
          title="App-wide theme default"
          description="Auto stays the baseline. Personas can inherit it or override it intentionally."
        />
        <div className={`max-w-sm ${embedded ? 'mt-2.5' : 'mt-3'}`}>
          <AppField
            label="Default appearance"
            hint="This is the app fallback. Persona themes only take over when you explicitly set one."
          >
            <Select
              value={appState.themePreference}
              onValueChange={(value) => appDispatch({ type: 'SET_THEME_PREFERENCE', payload: value as typeof appState.themePreference })}
            >
              <SelectTrigger className="h-10 rounded-pill">
                <SelectValue placeholder="Choose a theme" />
              </SelectTrigger>
              <SelectContent>
                {APP_THEME_OPTIONS.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    {theme.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AppField>
        </div>
        <div className={`flex flex-wrap items-center gap-3 rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] shadow-[var(--shell-shadow-soft)] ${embedded ? 'mt-2.5 px-3 py-2' : 'mt-3 px-3.5 py-2.5'}`}>
          <div className={`min-w-[14rem] flex-1 text-xs text-text-muted ${embedded ? 'leading-5' : 'leading-6'}`}>
            {activePersona?.themePreference
              ? `${activePersona.name} is currently overriding the app default with ${getThemeLabel(activePersona.themePreference)}.`
              : 'All untouched personas already follow this app-wide default. Use the button here if you want every character to inherit it again.'}
          </div>
          <Button type="button" size="sm" onClick={() => void resetPersonaThemesToAppDefault()}>
            Use app theme for all characters
          </Button>
        </div>
      </AppCard>

      <AppCard className={embedded ? 'p-3' : 'p-3.5'}>
        <SettingsSectionHeader
          eyebrow="Workspace"
          title="Shell style"
          description="Floating cards keeps the layered look. Fullscreen uses the browser edges more aggressively."
        />
        <div className={`max-w-sm ${embedded ? 'mt-2.5' : 'mt-3'}`}>
          <AppField
            label="Layout style"
            hint="Floating cards is default. Fullscreen is flatter and denser."
          >
            <Select
              value={appState.shellStylePreference}
              onValueChange={(value) => appDispatch({ type: 'SET_SHELL_STYLE_PREFERENCE', payload: value as typeof appState.shellStylePreference })}
            >
              <SelectTrigger className="h-10 rounded-pill">
                <SelectValue placeholder="Choose a shell style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="floating">Floating cards</SelectItem>
                <SelectItem value="fullscreen">Fullscreen</SelectItem>
              </SelectContent>
            </Select>
          </AppField>
        </div>
      </AppCard>

      <AppCard className={embedded ? 'p-3' : 'p-3.5'}>
        <SettingsSectionHeader
          eyebrow="Workspace"
          title="Utility trays"
          description="Chats, Context, and Settings live in the bottom utility area. Hide any tray for a cleaner workspace."
        />
        <div className={`grid gap-2 ${embedded ? 'lg:grid-cols-2 xl:grid-cols-3' : 'xl:grid-cols-3'} ${embedded ? 'mt-2.5' : 'mt-3'}`}>
          <Toggle
            label="Chats tray"
            description="Show previous chats and archive controls in the bottom workspace tray."
            checked={appState.workspacePanelPreferences.chats}
            compact={embedded}
            onClick={() => appDispatch({
              type: 'SET_WORKSPACE_PANEL_PREFERENCES',
              payload: {
                ...appState.workspacePanelPreferences,
                chats: !appState.workspacePanelPreferences.chats,
              },
            })}
          />
          <Toggle
            label="Context tray"
            description="Keep the full token budget and memory/context breakdown available in the workspace."
            checked={appState.workspacePanelPreferences.context}
            compact={embedded}
            onClick={() => appDispatch({
              type: 'SET_WORKSPACE_PANEL_PREFERENCES',
              payload: {
                ...appState.workspacePanelPreferences,
                context: !appState.workspacePanelPreferences.context,
              },
            })}
          />
          <Toggle
            label="Settings tray"
            description="Keep the full settings control center directly in the bottom workspace tray."
            checked={appState.workspacePanelPreferences.settings}
            compact={embedded}
            onClick={() => appDispatch({
              type: 'SET_WORKSPACE_PANEL_PREFERENCES',
              payload: {
                ...appState.workspacePanelPreferences,
                settings: !appState.workspacePanelPreferences.settings,
              },
            })}
          />
        </div>
      </AppCard>

      <AppCard className={embedded ? 'p-3' : 'p-3.5'}>
        <SettingsSectionHeader
          eyebrow="Workspace"
          title="Header info panel"
          description="Keep the top-right area compact. Show the overview deck, focus module, and optional quick actions without wasting height."
        />
        <div className={`grid gap-2 ${embedded ? 'lg:grid-cols-2 xl:grid-cols-3' : 'xl:grid-cols-3'} ${embedded ? 'mt-2.5' : 'mt-3'}`}>
          <Toggle
            label="Overview deck"
            description="Keep the compact room/context/viewer/state deck visible at the top of the control column."
            checked={headerModules.overview}
            compact={embedded}
            onClick={() => appDispatch({
              type: 'SET_WORKSPACE_PANEL_PREFERENCES',
              payload: {
                ...appState.workspacePanelPreferences,
                headerModules: {
                  ...headerModules,
                  overview: !headerModules.overview,
                },
              },
            })}
          />
          <Toggle
            label="Focus module"
            description="Show the active runtime, scene, character, or companion module directly under the overview deck."
            checked={headerModules.focus}
            compact={embedded}
            onClick={() => appDispatch({
              type: 'SET_WORKSPACE_PANEL_PREFERENCES',
              payload: {
                ...appState.workspacePanelPreferences,
                headerModules: {
                  ...headerModules,
                  focus: !headerModules.focus,
                },
              },
            })}
          />
          <Toggle
            label="Quick actions mode"
            description="Allow the header focus selector to switch into a quick action deck when you want chat, context, settings, and share controls up top."
            checked={headerModules.actions}
            compact={embedded}
            onClick={() => appDispatch({
              type: 'SET_WORKSPACE_PANEL_PREFERENCES',
              payload: {
                ...appState.workspacePanelPreferences,
                headerModules: {
                  ...headerModules,
                  actions: !headerModules.actions,
                },
              },
            })}
          />
        </div>
        <div className={`max-w-sm ${embedded ? 'mt-2.5' : 'mt-3'}`}>
          <AppField
            label="Header panel mode"
            hint="Changes the active compact header module on the right side of the workspace."
          >
            <Select
              value={appState.headerInsightMode}
              onValueChange={(value) => appDispatch({ type: 'SET_HEADER_INSIGHT_MODE', payload: value as typeof appState.headerInsightMode })}
            >
              <SelectTrigger className="h-10 rounded-pill">
                <SelectValue placeholder="Choose a header panel mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="companion">Companion pulse</SelectItem>
                <SelectItem value="runtime">Runtime HUD</SelectItem>
                <SelectItem value="scene">Scene status</SelectItem>
                {headerModules.actions ? <SelectItem value="actions">Quick actions</SelectItem> : null}
                <SelectItem value="character">Character card</SelectItem>
                <SelectItem value="hybrid">Hybrid overview</SelectItem>
              </SelectContent>
            </Select>
          </AppField>
        </div>
        <div className={`text-xs leading-5 text-text-muted ${embedded ? 'mt-2' : 'mt-2.5'}`}>
          Context stays available even if you simplify the header. If you hide both decks, the app keeps the overview deck on so the shell never loses critical runtime context.
        </div>
      </AppCard>

      <div className={`grid gap-2 ${embedded ? 'md:grid-cols-2 xl:grid-cols-3' : 'xl:grid-cols-3'}`}>
        <SettingsStatCard
          label="Current thread"
          value={currentThread?.title ?? 'No thread selected'}
          detail={`${chatState.messages.length} messages in the active conversation.`}
        />
        <SettingsStatCard
          label="Persona library"
          value={`${companionState.personas.length} personas`}
          detail="Guided character presets plus raw prompt overrides for power users."
        />
        <SettingsStatCard
          label="Render mode"
          value="3D only"
          detail="2D mode is hidden from the user-facing app while the code path stays in-repo."
        />
      </div>

      {isTauriEnvironment() ? (
        <PetModeCard embedded={embedded} />
      ) : null}

      <AppCard className={embedded ? 'p-3' : 'p-3.5'}>
        <SettingsSectionHeader
          eyebrow="Quick actions"
          title="Maintenance and resets"
          description="Use the setup wizard to re-check providers or onboarding. Clear chat history only when you really want a blank slate."
        />
        <div className={`grid gap-2 ${embedded ? 'mt-2.5' : 'mt-3'} xl:grid-cols-2`}>
          <AppCard className={`space-y-1.5 ${embedded ? 'px-3 py-2.5' : 'px-3.5 py-3'}`}>
            <div className="text-xs font-semibold text-text-secondary">Setup wizard</div>
            <Button type="button" className="justify-start" onClick={() => settingsDispatch({ type: 'OPEN_WIZARD' })}>
              Re-run setup wizard
            </Button>
            <div className="text-xs leading-5 text-text-muted">
              Re-check onboarding, provider assumptions, and starter defaults without wiping your companion state.
            </div>
          </AppCard>
          <AppCard className={`space-y-1.5 ${embedded ? 'px-3 py-2.5' : 'px-3.5 py-3'}`}>
            <div className="text-xs font-semibold text-text-secondary">Chat reset</div>
            <Button type="button" variant="destructive" className="justify-start" onClick={handleClearHistory}>
              Clear current chat history
            </Button>
            <div className="text-xs leading-5 text-text-muted">
              Clear only the active chat transcript if you want a fresh start without removing the rest of the app setup.
            </div>
          </AppCard>
        </div>
      </AppCard>
    </div>
  );
}
