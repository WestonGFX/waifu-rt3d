import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EnvironmentUploader from './EnvironmentUploader.tsx';

const selectEnvironment = vi.fn(() => Promise.resolve());
const clearEnvironment = vi.fn(() => Promise.resolve());
const refreshLibrary = vi.fn(() => Promise.resolve());

vi.mock('../../context/EnvironmentContext.tsx', () => ({
  useEnvironment: () => ({
    state: {
      root: '/rooms',
      library: [
        {
          id: 'minimalistic_modern_bedroom',
          name: 'Minimalistic Modern Bedroom',
          category: 'bedroom',
          source: 'local-library',
          recommended: true,
          url: '/rooms/minimalistic_modern_bedroom.glb',
          license: 'CC-BY',
        },
        {
          id: 'city_apartment_evening',
          name: 'City Apartment Evening',
          category: 'living-room',
          source: 'local-library',
          recommended: false,
          url: '/rooms/city_apartment_evening.glb',
        },
      ],
      selectedEnvironmentId: 'minimalistic_modern_bedroom',
      familiarityByEnvironmentId: {},
      roomRuntime: {
        roomMode: 'looking',
        currentAnchorId: null,
        targetAnchorId: null,
        currentHotspotId: null,
        familiarity: 0,
        environmentName: 'Minimalistic Modern Bedroom',
      },
      isLoading: false,
      error: null,
    },
    currentEnvironment: {
      id: 'minimalistic_modern_bedroom',
      name: 'Minimalistic Modern Bedroom',
      category: 'bedroom',
      source: 'local-library',
      recommended: true,
      url: '/rooms/minimalistic_modern_bedroom.glb',
      license: 'CC-BY',
    },
    refreshLibrary,
    selectEnvironment,
    clearEnvironment,
  }),
}));

vi.mock('../../services/environmentLibraryService.ts', () => ({
  uploadEnvironmentFile: vi.fn(),
}));

describe('EnvironmentUploader', () => {
  it('renders visible room cards and loads the clicked room', async () => {
    render(<EnvironmentUploader />);

    expect(screen.getAllByText('Minimalistic Modern Bedroom').length).toBeGreaterThan(0);
    expect(screen.getAllByText('City Apartment Evening').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /load city apartment evening/i }));

    await waitFor(() => {
      expect(selectEnvironment).toHaveBeenCalledWith('city_apartment_evening');
    });
  });
});
