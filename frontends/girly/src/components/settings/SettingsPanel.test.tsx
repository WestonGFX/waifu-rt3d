import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../../context/SettingsContext.tsx';
import SettingsPanel from './SettingsPanel.tsx';

vi.mock('./GeneralSettingsPanel.tsx', () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="general-panel" data-embedded={embedded ? 'true' : 'false'}>
      General panel
    </div>
  ),
}));

vi.mock('./VoiceSettingsPanel.tsx', () => ({
  default: () => <div>Voice panel</div>,
}));

vi.mock('./RenderingSettingsPanel.tsx', () => ({
  default: () => <div>Rendering panel</div>,
}));

vi.mock('./RoomsSettingsPanel.tsx', () => ({
  default: () => <div>Rooms panel</div>,
}));

vi.mock('./ModelManagerPanel.tsx', () => ({
  default: () => <div>Models panel</div>,
}));

vi.mock('./MemorySettingsPanel.tsx', () => ({
  default: ({ embedded }: { embedded?: boolean }) => <div data-testid="memory-panel" data-embedded={embedded ? 'true' : 'false'}>Memory panel</div>,
}));

vi.mock('./PersonaSettingsPanel.tsx', () => ({
  default: () => <div>Persona panel</div>,
}));

vi.mock('./AdvancedSettingsPanel.tsx', () => ({
  default: () => <div>Advanced panel</div>,
}));

vi.mock('./SetupWizard.tsx', () => ({
  default: () => <div>Setup wizard</div>,
}));

describe('SettingsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('includes a dedicated Rooms section and switches to it on click', () => {
    localStorage.setItem('animegirly_state', JSON.stringify({ setupComplete: true, layoutSchemaVersion: 9 }));

    render(
      <SettingsProvider>
        <SettingsPanel embedded />
      </SettingsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /rooms/i }));

    expect(screen.getByText('Rooms panel')).toBeInTheDocument();
  });

  it('does not force full-height setup coverage in natural embedded wizard mode', () => {
    render(
      <SettingsProvider>
        <SettingsPanel embedded heightMode="natural" />
      </SettingsProvider>,
    );

    const root = screen.getByTestId('settings-panel-root');

    expect(root.className).not.toContain('min-h-full');
    expect(root.className).not.toContain('h-full');
    expect(screen.getByText('Setup wizard')).toBeInTheDocument();
  });

  it('omits the duplicate content header when rendered as an embedded tray panel', () => {
    localStorage.setItem('animegirly_state', JSON.stringify({ setupComplete: true, layoutSchemaVersion: 9 }));

    render(
      <SettingsProvider>
        <SettingsPanel embedded />
      </SettingsProvider>,
    );

    expect(screen.queryByText('Health, startup behavior, shell style, and quick resets.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /general/i })).toBeInTheDocument();
  });

  it('passes embedded mode through to the General settings content inside the tray', () => {
    localStorage.setItem('animegirly_state', JSON.stringify({ setupComplete: true, layoutSchemaVersion: 9 }));

    render(
      <SettingsProvider>
        <SettingsPanel embedded />
      </SettingsProvider>,
    );

    expect(screen.getByTestId('general-panel')).toHaveAttribute('data-embedded', 'true');
  });

  it('passes embedded mode through to the Memory settings content inside the tray', () => {
    localStorage.setItem('animegirly_state', JSON.stringify({ setupComplete: true, layoutSchemaVersion: 9 }));

    render(
      <SettingsProvider>
        <SettingsPanel embedded />
      </SettingsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /memory/i }));

    expect(screen.getByTestId('memory-panel')).toHaveAttribute('data-embedded', 'true');
  });

  it('keys the visible tab panel to the active tab for content transitions', () => {
    localStorage.setItem('animegirly_state', JSON.stringify({ setupComplete: true, layoutSchemaVersion: 9 }));

    render(
      <SettingsProvider>
        <SettingsPanel embedded />
      </SettingsProvider>,
    );

    expect(screen.getByTestId('settings-tab-panel')).toHaveAttribute('data-settings-tab', 'general');

    fireEvent.click(screen.getByRole('button', { name: /voice/i }));

    expect(screen.getByTestId('settings-tab-panel')).toHaveAttribute('data-settings-tab', 'voice');
    expect(screen.getByText('Voice panel')).toBeInTheDocument();
  });
});
