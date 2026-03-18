/**
 * App.tsx – Root component.
 *
 * Responsibilities:
 *  1. Mount all context providers (outermost -> innermost):
 *       AppContext  -> global app state (setup flag, dev-mode, provider config)
 *       ModelContext -> 3-D model URL & loading state
 *       SettingsContext -> voice preset, settings-panel visibility
 *       ChatContext  -> message history, loading/error state
 *  2. On first mount, restore persisted state from localStorage via storageService.
 *  3. Render the top-level <AppLayout /> or <PetModeView /> depending on context.
 *
 * When running inside a Tauri pet window (`?pet=1`), the full AppLayout is
 * replaced with the lightweight PetModeView that renders only the avatar.
 */

import { AppProvider } from './context/AppContext.tsx';
import { ModelProvider } from './context/ModelContext.tsx';
import { EnvironmentProvider } from './context/EnvironmentContext.tsx';
import { SettingsProvider } from './context/SettingsContext.tsx';
import { CompanionProvider } from './context/CompanionContext.tsx';
import { ChatProvider } from './context/ChatContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import AppLayout from './components/layout/AppLayout.tsx';
import PetModeView from './components/pet/PetModeView.tsx';
import ThemeController from './components/theme/ThemeController.tsx';
import { isPetModeWindow } from './services/tauriPetService.ts';

/** Whether this window instance is the desktop pet overlay. */
const PET_MODE = isPetModeWindow();

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ModelProvider>
          <EnvironmentProvider>
            <SettingsProvider>
              <CompanionProvider>
                <ThemeController />
                <ChatProvider>
                  {PET_MODE ? <PetModeView /> : <AppLayout />}
                </ChatProvider>
              </CompanionProvider>
            </SettingsProvider>
          </EnvironmentProvider>
        </ModelProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
