import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SnapshotIssue } from '@shared/snapshot-schema';
import { Card } from './Card';
import * as boardLib from '../lib/board';

const issue: SnapshotIssue = {
  id: 'beads-helix-vm2',
  title: 'Implement helix flight deck Level 2',
  status: 'open',
  labels: ['idea'],
  priority: 1,
  issue_type: 'task',
  assignee: null,
  board_column: 'idea',
  summary_line: '',
  dependency_count: 2,
  dependent_count: 1,
  created_at: '2026-04-14T00:00:00.000Z',
  updated_at: '2026-04-14T00:00:00.000Z',
  closed_at: null,
};

const sonnerToast = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock('sonner', () => ({ toast: sonnerToast }));

describe('<Card />', () => {
  let copySpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    sonnerToast.success.mockClear();
    copySpy = vi.spyOn(boardLib, 'copyToClipboard').mockResolvedValue(undefined);
  });

  it('renders the title text', () => {
    render(<Card issue={issue} />);
    expect(screen.getByText('Implement helix flight deck Level 2')).toBeInTheDocument();
  });

  it('renders the priority chip with correct label', () => {
    render(<Card issue={issue} />);
    expect(screen.getByText('P1')).toBeInTheDocument();
  });

  it('renders the short id', () => {
    render(<Card issue={issue} />);
    expect(screen.getByText('vm2')).toBeInTheDocument();
  });

  it('renders the dep hint', () => {
    render(<Card issue={issue} />);
    expect(screen.getByText('2↓ 1↑')).toBeInTheDocument();
  });

  it('does not render assignee or label tokens beyond the stage', () => {
    const withAssignee = { ...issue, assignee: 'alice' };
    render(<Card issue={withAssignee} />);
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
  });

  it('clamps the title visually to two lines', () => {
    render(<Card issue={issue} />);
    const titleEl = screen.getByText('Implement helix flight deck Level 2');
    expect(titleEl).toHaveClass('line-clamp-2');
  });

  it('exposes the card as a button-role element for keyboard activation', () => {
    render(<Card issue={issue} />);
    const card = screen.getByRole('button', { name: /vm2/i });
    expect(card).toBeInTheDocument();
  });

  it('copies the full bd id to the clipboard on click', async () => {
    const user = userEvent.setup();
    render(<Card issue={issue} />);
    await user.click(screen.getByRole('button', { name: /vm2/i }));
    expect(copySpy).toHaveBeenCalledWith('beads-helix-vm2');
  });

  it('shows a success toast after copying', async () => {
    const user = userEvent.setup();
    render(<Card issue={issue} />);
    await user.click(screen.getByRole('button', { name: /vm2/i }));
    expect(sonnerToast.success).toHaveBeenCalledTimes(1);
    expect(sonnerToast.success.mock.calls[0][0]).toMatch(/copied/i);
  });

  it('triggers copy when Enter is pressed', async () => {
    const user = userEvent.setup();
    render(<Card issue={issue} />);
    const card = screen.getByRole('button', { name: /vm2/i });
    card.focus();
    await user.keyboard('{Enter}');
    expect(copySpy).toHaveBeenCalledWith('beads-helix-vm2');
  });

  it('renders priority chip with priority-specific styling', () => {
    const { container, rerender } = render(<Card issue={{ ...issue, priority: 0 }} />);
    const chipP0 = container.querySelector('[data-testid="priority-chip"]');
    expect(chipP0?.className).toMatch(/red/);

    rerender(<Card issue={{ ...issue, priority: 3 }} />);
    const chipP3 = container.querySelector('[data-testid="priority-chip"]');
    expect(chipP3?.className).toMatch(/sky/);
  });
});
