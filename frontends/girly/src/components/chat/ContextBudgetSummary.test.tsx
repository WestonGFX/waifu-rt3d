import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ContextBudgetSummary from './ContextBudgetSummary.tsx';

describe('ContextBudgetSummary', () => {
  it('renders a compact progress-style summary with distinct category chips and no separate free-space chip', () => {
    render(
      <ContextBudgetSummary
        budget={{
          contextWindow: 4096,
          reservedOutputTokens: 1024,
          usableInputTokens: 3072,
          usedInputTokens: 812,
          remainingInputTokens: 2260,
          usageRatio: 0.198,
          segments: [
            { id: 'persona', label: 'Character prompt', tokens: 220, colorClass: 'bg-fuchsia-400', colorHex: '#b26cff', tintClass: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' },
            { id: 'recent', label: 'Recent chat', tokens: 310, colorClass: 'bg-emerald-400', colorHex: '#34d399', tintClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
            { id: 'room', label: 'Room context', tokens: 52, colorClass: 'bg-cyan-400', colorHex: '#67e8f9', tintClass: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
            { id: 'staging', label: 'Stage state', tokens: 44, colorClass: 'bg-violet-400', colorHex: '#c4b5fd', tintClass: 'bg-violet-100 text-violet-700 border-violet-200' },
            { id: 'provider', label: 'Provider and model', tokens: 28, colorClass: 'bg-orange-400', colorHex: '#fb923c', tintClass: 'bg-orange-100 text-orange-700 border-orange-200' },
            { id: 'routing', label: 'Routing rules', tokens: 14, colorClass: 'bg-pink-400', colorHex: '#f472b6', tintClass: 'bg-pink-100 text-pink-700 border-pink-200' },
            { id: 'free', label: 'Free space', tokens: 2260, colorClass: 'bg-slate-200', colorHex: '#e2e8f0', tintClass: 'bg-slate-100 text-slate-700 border-slate-200' },
            { id: 'response', label: 'Reserved reply space', tokens: 1024, colorClass: 'bg-anime-300', colorHex: '#d8b4fe', tintClass: 'bg-anime-50 text-anime-700 border-anime-200' },
          ],
        }}
      />,
    );

    expect(screen.getByText('812 / 4,096 context tokens')).toBeInTheDocument();
    expect(screen.getByText('Character prompt')).toBeInTheDocument();
    expect(screen.getByText('Recent chat')).toBeInTheDocument();
    expect(screen.getByText('Room context')).toBeInTheDocument();
    expect(screen.getByText('Stage state')).toBeInTheDocument();
    expect(screen.getByText('Provider and model')).toBeInTheDocument();
    expect(screen.getByText('Routing rules')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Free space' })).not.toBeInTheDocument();
    expect(screen.queryByText('Reserved reply space')).not.toBeInTheDocument();
  });

  it('uses the summary chip as the free-space toggle and still supports focused categories', () => {
    render(
      <ContextBudgetSummary
        budget={{
          contextWindow: 4096,
          reservedOutputTokens: 1024,
          usableInputTokens: 3072,
          usedInputTokens: 812,
          remainingInputTokens: 2260,
          usageRatio: 0.198,
          segments: [
            { id: 'persona', label: 'Character prompt', tokens: 220, colorClass: 'bg-fuchsia-400', colorHex: '#b26cff', tintClass: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' },
            { id: 'recent', label: 'Recent chat', tokens: 310, colorClass: 'bg-emerald-400', colorHex: '#34d399', tintClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
            { id: 'room', label: 'Room context', tokens: 52, colorClass: 'bg-cyan-400', colorHex: '#67e8f9', tintClass: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
            { id: 'staging', label: 'Stage state', tokens: 44, colorClass: 'bg-violet-400', colorHex: '#c4b5fd', tintClass: 'bg-violet-100 text-violet-700 border-violet-200' },
            { id: 'provider', label: 'Provider and model', tokens: 28, colorClass: 'bg-orange-400', colorHex: '#fb923c', tintClass: 'bg-orange-100 text-orange-700 border-orange-200' },
            { id: 'routing', label: 'Routing rules', tokens: 14, colorClass: 'bg-pink-400', colorHex: '#f472b6', tintClass: 'bg-pink-100 text-pink-700 border-pink-200' },
            { id: 'free', label: 'Free space', tokens: 2260, colorClass: 'bg-slate-200', colorHex: '#e2e8f0', tintClass: 'bg-slate-100 text-slate-700 border-slate-200' },
            { id: 'response', label: 'Reserved reply space', tokens: 1024, colorClass: 'bg-anime-300', colorHex: '#d8b4fe', tintClass: 'bg-anime-50 text-anime-700 border-anime-200' },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));

    expect(screen.getByText('Free space · 2,260 tokens')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));

    expect(screen.getByText('812 / 4,096 context tokens')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Routing rules' }));

    expect(screen.getByText('Routing rules · 14 tokens')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));

    expect(screen.getByText('812 / 4,096 context tokens')).toBeInTheDocument();
  });
});
