import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { SnapshotIssue } from '@shared/snapshot-schema';
import { Column } from './Column';
import { withRouter } from '../test-utils';

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
  description: null,
  notes: null,
  design: null,
  dependency_ids: [],
  dependent_ids: [],
  ...overrides,
});

function renderColumn(stage: 'idea' | 'refined' | 'ready', issues: SnapshotIssue[]) {
  return render(withRouter(<Column stage={stage} issues={issues} projectId="beads-helix" />));
}

describe('<Column />', () => {
  it('renders the stage name as a header', async () => {
    renderColumn('idea', []);
    expect(await screen.findByRole('heading', { name: /idea/i })).toBeInTheDocument();
  });

  it('renders the issue count pill', async () => {
    const issues = [
      make({ id: 'a', title: 'A' }),
      make({ id: 'b', title: 'B' }),
    ];
    renderColumn('ready', issues);
    const header = await screen.findByRole('heading', { name: /ready/i });
    const headerEl = header.parentElement!;
    expect(within(headerEl).getByText('2')).toBeInTheDocument();
  });

  it('renders an empty-state hint when no issues', async () => {
    renderColumn('refined', []);
    expect(await screen.findByText(/no refined issues/i)).toBeInTheDocument();
  });

  it('renders cards for each issue', async () => {
    const issues = [
      make({ id: 'beads-helix-aaa', title: 'Alpha' }),
      make({ id: 'beads-helix-bbb', title: 'Bravo' }),
    ];
    renderColumn('idea', issues);
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });

  it('orders cards by priority then updated_at via the helper', async () => {
    const issues = [
      make({ id: 'beads-helix-low', title: 'Low priority', priority: 3, updated_at: '2026-04-12T00:00:00.000Z' }),
      make({ id: 'beads-helix-hi-old', title: 'High old', priority: 0, updated_at: '2026-01-01T00:00:00.000Z' }),
      make({ id: 'beads-helix-hi-new', title: 'High new', priority: 0, updated_at: '2026-04-10T00:00:00.000Z' }),
    ];
    renderColumn('idea', issues);
    await screen.findByText('High new');
    const renderedTitles = screen.getAllByRole('link').map((b) => b.textContent);
    const indexOf = (substr: string) =>
      renderedTitles.findIndex((t) => t?.includes(substr));
    expect(indexOf('High new')).toBeLessThan(indexOf('High old'));
    expect(indexOf('High old')).toBeLessThan(indexOf('Low priority'));
  });

  it('does not render the empty-state hint when issues are present', async () => {
    renderColumn('idea', [make({ title: 'present' })]);
    await screen.findByText('present');
    expect(screen.queryByText(/no idea issues/i)).not.toBeInTheDocument();
  });
});
