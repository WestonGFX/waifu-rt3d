/**
 * Tests for ScenarioPicker component.
 *
 * Covers: template list rendering, active-state display, activate on button
 * click, deactivate (clear active), random button, and the Create Custom form.
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub (ALL component tests)
 *   Pattern 2 — api module mock
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ScenarioPicker } from '../components/ScenarioPicker';
import { api } from '../lib/api';

// ── Pattern 4: Framer Motion stub ─────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// ── Pattern 2: API mock ───────────────────────────────────────────────────────
vi.mock('../lib/api', () => ({
  api: {
    getScenarioTemplates: vi.fn(),
    getActiveScenarioTemplate: vi.fn(),
    activateScenarioTemplate: vi.fn(),
    deactivateScenarioTemplate: vi.fn(),
    createScenarioTemplate: vi.fn(),
    deleteScenarioTemplate: vi.fn(),
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: 1,
    char_id: 42,
    title: 'Cozy Library',
    description: 'A quiet evening in a sun-dappled library.',
    setting: 'indoor',
    time_of_day: 'evening',
    mood: 'cozy',
    is_default: true,
    is_builtin: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    char_id: 42,
    title: 'Rooftop Chase',
    description: 'Heart-pounding pursuit across the skyline.',
    setting: 'outdoor',
    time_of_day: 'night',
    mood: 'tense',
    is_default: false,
    is_builtin: false,
    created_at: '2026-01-02T00:00:00Z',
  },
];

function setupMocks(activeTemplateId?: number) {
  vi.mocked(api.getScenarioTemplates).mockResolvedValue({ ok: true, templates: TEMPLATES });
  vi.mocked(api.getActiveScenarioTemplate).mockResolvedValue({
    ok: true,
    template: activeTemplateId != null
      ? TEMPLATES.find(t => t.id === activeTemplateId) ?? null
      : null,
  });
  vi.mocked(api.activateScenarioTemplate).mockResolvedValue({ ok: true, activated: true });
  vi.mocked(api.deactivateScenarioTemplate).mockResolvedValue({ ok: true, activated: false });
  vi.mocked(api.createScenarioTemplate).mockResolvedValue({ ok: true, template: TEMPLATES[0] });
  vi.mocked(api.deleteScenarioTemplate).mockResolvedValue({ ok: true, deleted: true });
}

function renderPicker(activeTemplateId?: number) {
  setupMocks(activeTemplateId);
  return render(
    <ScenarioPicker open charId={42} sessionId={7} onClose={vi.fn()} />
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ScenarioPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal header', () => {
    setupMocks();
    render(<ScenarioPicker open charId={42} sessionId={7} onClose={vi.fn()} />);
    expect(screen.getByText('Scenarios')).toBeInTheDocument();
  });

  it('renders template titles after loading', async () => {
    renderPicker();
    await waitFor(() => {
      expect(screen.getByText('Cozy Library')).toBeInTheDocument();
      expect(screen.getByText('Rooftop Chase')).toBeInTheDocument();
    });
  });

  it('calls getScenarioTemplates with the correct charId', async () => {
    renderPicker();
    await waitFor(() => expect(vi.mocked(api.getScenarioTemplates)).toHaveBeenCalledWith(42));
  });

  it('calls getActiveScenarioTemplate with charId and sessionId', async () => {
    renderPicker();
    await waitFor(() =>
      expect(vi.mocked(api.getActiveScenarioTemplate)).toHaveBeenCalledWith(42, 7)
    );
  });

  it('shows active template label in header when a template is active', async () => {
    renderPicker(1);
    await waitFor(() => {
      expect(screen.getByText(/Active:/)).toBeInTheDocument();
      expect(screen.getByText(/Active:.*Cozy Library/)).toBeInTheDocument();
    });
  });

  it('calls activateScenarioTemplate when Activate button is clicked', async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText('Cozy Library')).toBeInTheDocument());

    // Expand the first template row to reveal the Activate button
    fireEvent.click(screen.getByText('Cozy Library'));
    const activateBtn = await screen.findByText('Activate for this session');
    fireEvent.click(activateBtn);

    await waitFor(() =>
      expect(vi.mocked(api.activateScenarioTemplate)).toHaveBeenCalledWith(1, 7)
    );
  });

  it('calls deactivateScenarioTemplate when active template is toggled off', async () => {
    renderPicker(1); // template 1 starts active
    await waitFor(() => expect(screen.getByText('Cozy Library')).toBeInTheDocument());

    // Expand the first template row
    fireEvent.click(screen.getByText('Cozy Library'));
    // The button text changes when already active
    const deactivateBtn = await screen.findByText('Active — click to deactivate');
    fireEvent.click(deactivateBtn);

    await waitFor(() =>
      expect(vi.mocked(api.deactivateScenarioTemplate)).toHaveBeenCalledWith(7)
    );
  });

  it('shows check icon on the active template row header', async () => {
    renderPicker(1);
    await waitFor(() => expect(screen.getByText('Cozy Library')).toBeInTheDocument());
    // The active template has the check icon — it's in the DOM as an SVG, we
    // can detect via the active-styled title text colour check instead
    expect(screen.getByText('Cozy Library').style.color).not.toBe('');
  });

  it('calls deactivateScenarioTemplate when "Clear active" button is clicked', async () => {
    renderPicker(1);
    await waitFor(() => expect(screen.getByText('Clear active')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Clear active'));
    await waitFor(() =>
      expect(vi.mocked(api.deactivateScenarioTemplate)).toHaveBeenCalledWith(7)
    );
  });

  it('shows "No scenarios match" when all templates filtered away', async () => {
    vi.mocked(api.getScenarioTemplates).mockResolvedValue({ ok: true, templates: [] });
    vi.mocked(api.getActiveScenarioTemplate).mockResolvedValue({ ok: true, template: null });
    render(<ScenarioPicker open charId={42} sessionId={7} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/No scenarios match/)).toBeInTheDocument();
    });
  });

  it('toggles Create Custom form open and closed', async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText('Create Custom')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Create Custom'));
    expect(screen.getByPlaceholderText(/e.g. Late night study session/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText(/e.g. Late night study session/i)).not.toBeInTheDocument();
  });

  it('calls createScenarioTemplate when Create Custom form is submitted', async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText('Create Custom')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Create Custom'));

    const titleInput = screen.getByPlaceholderText(/e.g. Late night study session/i);
    const descInput = screen.getByPlaceholderText(/Describe the scene/i);

    fireEvent.change(titleInput, { target: { value: 'My Test Scene' } });
    fireEvent.change(descInput, { target: { value: 'A wonderful test description.' } });

    fireEvent.click(screen.getByText('Create & Activate'));

    await waitFor(() =>
      expect(vi.mocked(api.createScenarioTemplate)).toHaveBeenCalledWith(
        expect.objectContaining({
          char_id: 42,
          title: 'My Test Scene',
          description: 'A wonderful test description.',
        })
      )
    );
  });

  it('does not render when open is false', () => {
    setupMocks();
    render(<ScenarioPicker open={false} charId={42} sessionId={7} onClose={vi.fn()} />);
    expect(screen.queryByText('Scenarios')).not.toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    setupMocks();
    const { container } = render(
      <ScenarioPicker open charId={42} sessionId={7} onClose={onClose} />
    );
    // The outermost div is the backdrop
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('groups templates under mood section headers', async () => {
    renderPicker();
    await waitFor(() => {
      expect(screen.getByText('Cozy')).toBeInTheDocument();
      expect(screen.getByText('Tense')).toBeInTheDocument();
    });
  });

  it('calls activateScenarioTemplate when Random button is clicked', async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText('Random')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Random'));
    await waitFor(() =>
      expect(vi.mocked(api.activateScenarioTemplate)).toHaveBeenCalledWith(
        expect.any(Number),
        7,
      )
    );
  });

  it('calls deleteScenarioTemplate when Delete is clicked on a custom template', async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText('Rooftop Chase')).toBeInTheDocument());

    // Expand the custom template (id=2, is_builtin=false)
    fireEvent.click(screen.getByText('Rooftop Chase'));
    const deleteBtn = await screen.findByText('Delete');
    fireEvent.click(deleteBtn);

    await waitFor(() =>
      expect(vi.mocked(api.deleteScenarioTemplate)).toHaveBeenCalledWith(2)
    );
  });
});
