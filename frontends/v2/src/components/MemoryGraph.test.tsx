import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { microcopy } from '../lib/microcopy';
import { MemoryGraph } from './MemoryGraph';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchMemoryGraph: vi.fn()
}));

const mockedFetchMemoryGraph = vi.mocked(api.fetchMemoryGraph);

describe('MemoryGraph', () => {
  beforeEach(() => {
    mockedFetchMemoryGraph.mockReset();
  });

  it('renders memory payload and stats', async () => {
    mockedFetchMemoryGraph.mockResolvedValue({
      mode: 'session',
      nodes: [
        { id: 'm-1', label: 'hello', role: 'user', x: 20, y: 80 },
        { id: 'm-2', label: 'ack', role: 'assistant', x: 110, y: 180 }
      ],
      edges: [{ id: 'e-1', source: 'm-1', target: 'm-2', kind: 'sequence' }],
      stats: {
        sessionMessages: 2,
        memoryHits: 0,
        ragAvailable: false
      }
    } as never);

    render(<MemoryGraph sessionId={1} charId={1} />);

    expect(screen.getByText(microcopy.status.memorySyncing)).toBeInTheDocument();
    await screen.findByText('Messages: 2');

    expect(screen.getByRole('button', { name: microcopy.actions.refresh })).toBeInTheDocument();
    expect(screen.getByLabelText('Memory graph')).toBeInTheDocument();
    expect(screen.getByText(microcopy.status.memorySession)).toBeInTheDocument();
  });

  it('shows fallback status and error when API fails', async () => {
    mockedFetchMemoryGraph.mockRejectedValueOnce(new Error('boom'));

    render(<MemoryGraph sessionId={1} charId={1} />);

    expect(await screen.findByText(microcopy.errors.memoryFailed)).toBeInTheDocument();
    expect(screen.getByText(microcopy.status.memoryOffline)).toBeInTheDocument();
  });

  it('shows empty state when no nodes are returned', async () => {
    mockedFetchMemoryGraph.mockResolvedValue({
      mode: 'session',
      nodes: [],
      edges: [],
      stats: {
        sessionMessages: 0,
        memoryHits: 0,
        ragAvailable: false
      }
    } as never);

    render(<MemoryGraph sessionId={1} charId={1} />);

    await waitFor(() => {
      expect(screen.getByText(microcopy.status.memoryEmpty)).toBeInTheDocument();
    });
  });
});
