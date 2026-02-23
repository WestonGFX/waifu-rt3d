import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { microcopy } from '../lib/microcopy';
import { SettingsHud } from './SettingsHud';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  saveUiConfig: vi.fn()
}));

const mockedSaveUiConfig = vi.mocked(api.saveUiConfig);

describe('SettingsHud', () => {
  beforeEach(() => {
    mockedSaveUiConfig.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('persists settings and emits apply callback', async () => {
    mockedSaveUiConfig.mockResolvedValue({ ok: true, config: {} } as never);

    const onApplySettings = vi.fn();
    const onClose = vi.fn();

    render(
      <SettingsHud
        open
        settings={{ voicePitch: 1, creativity: 0.7, speechAuto: true }}
        onClose={onClose}
        onApplySettings={onApplySettings}
      />
    );

    fireEvent.change(screen.getByLabelText('Voice Pitch'), { target: { value: '1.2' } });
    fireEvent.change(screen.getByLabelText('Creativity'), { target: { value: '0.9' } });
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: microcopy.actions.apply }));

    await waitFor(() => {
      expect(mockedSaveUiConfig).toHaveBeenCalledWith({
        tts: { tts_pitch: 1.2 },
        llm: { temperature: 0.9 },
        ui: { speech_auto: false }
      });
    });

    expect(onApplySettings).toHaveBeenCalledWith({
      voicePitch: 1.2,
      creativity: 0.9,
      speechAuto: false
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an error when save fails', async () => {
    mockedSaveUiConfig.mockRejectedValue(new Error('network'));

    const onApplySettings = vi.fn();
    const onClose = vi.fn();

    render(
      <SettingsHud
        open
        settings={{ voicePitch: 1, creativity: 0.7, speechAuto: true }}
        onClose={onClose}
        onApplySettings={onApplySettings}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: microcopy.actions.apply }));

    expect(await screen.findByText(microcopy.errors.settingsSyncFailed)).toBeInTheDocument();
    expect(onApplySettings).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
