import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { SnapshotIssue } from '@shared/snapshot-schema';
import { Column } from './Column';

const make = (overrides: Partial<SnapshotIssue>): SnapshotIssue => ({
  id: overrides.id ?? 'beads-helix-zzz',
  title: 'placeholder',
  status: 'open',
  labels: [],
  priority: 2,
  issue_type: 'task',
  assignee: null,
  board_column: 'idea',
  summary_line: '',
  dependency_count: 0,
  dependent_count: 0,
  created_at: '2026-04-10T00:00:00.000Z',
  updated_at: '2026-04-10T00:00:00.000Z',
  closed_at: null,
  ...overrides,
});

describe('<Column />', () => {
  it('renders the stage name as a header', () => {
    render(<Column stage="idea" issues={[]} />);
    expect(screen.getByRole('heading', { name: /idea/i })).toBeInTheDocument();
  });

  it('renders the issue count pill', () => {
    const issues = [
      make({ id: 'a', title: 'A' }),
      make({ id: 'b', title: 'B' }),
    ];
    render(<Column stage="ready" issues={issues} />);
    const header = screen.getByRole('heading', { name: /ready/i });
    const headerEl = header.parentElement!;
    expect(within(headerEl).getByText('2')).toBeInTheDocument();
  });

  it('renders an empty-state hint when no issues', () => {
    render(<Column stage="refined" issues={[]} />);
    expect(screen.getByText(/no refined issues/i)).toBeInTheDocument();
  });

  it('renders cards for each issue', () => {
    const issues = [
      make({ id: 'beads-helix-aaa', title: 'Alpha' }),
      make({ id: 'beads-helix-bbb', title: 'Bravo' }),
    ];
    render(<Column stage="idea" issues={issues} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });

  it('orders cards by priority then updated_at via the helper', () => {
    const issues = [
      make({ id: 'beads-helix-low', title: 'Low priority', priority: 3, updated_at: '2026-04-12T00:00:00.000Z' }),
      make({ id: 'beads-helix-hi-old', title: 'High old', priority: 0, updated_at: '2026-01-01T00:00:00.000Z' }),
      make({ id: 'beads-helix-hi-new', title: 'High new', priority: 0, updated_at: '2026-04-10T00:00:00.000Z' }),
    ];
    render(<Column stage="idea" issues={issues} />);
    const renderedTitles = screen.getAllByRole('button').map((b) => b.textContent);
    const indexOf = (substr: string) =>
      renderedTitles.findIndex((t) => t?.includes(substr));
    expect(indexOf('High new')).toBeLessThan(indexOf('High old'));
    expect(indexOf('High old')).toBeLessThan(indexOf('Low priority'));
  });

  it('does not render the empty-state hint when issues are present', () => {
    render(<Column stage="idea" issues={[make({ title: 'present' })]} />);
    expect(screen.queryByText(/no idea issues/i)).not.toBeInTheDocument();
  });
});
