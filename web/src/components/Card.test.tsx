import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
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
  description: null,
  notes: null,
  design: null,
  dependency_ids: [],
  dependent_ids: [],
};

const sonnerToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: sonnerToast }));

function renderAt(initialUrl = '/p/beads-helix', issueProp: SnapshotIssue = issue) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/p/$projectId',
    component: () => <Card issue={issueProp} projectId="beads-helix" />,
  });
  const issueRoute = createRoute({
    getParentRoute: () => projectRoute,
    path: 'i/$issueId',
    component: () => <div data-testid="issue-opened">opened</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([projectRoute.addChildren([issueRoute])]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  });
  const result = render(<RouterProvider router={router} />);
  return { router, ...result };
}

describe('<Card />', () => {
  let copySpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    sonnerToast.success.mockClear();
    sonnerToast.error.mockClear();
    copySpy = vi.spyOn(boardLib, 'copyToClipboard').mockResolvedValue(undefined);
  });

  it('renders the title text', async () => {
    renderAt();
    expect(await screen.findByText('Implement helix flight deck Level 2')).toBeInTheDocument();
  });

  it('renders the priority chip with correct label', async () => {
    renderAt();
    expect(await screen.findByText('P1')).toBeInTheDocument();
  });

  it('renders the short id', async () => {
    renderAt();
    expect(await screen.findByText('vm2')).toBeInTheDocument();
  });

  it('renders the dep hint', async () => {
    renderAt();
    expect(await screen.findByText('2↓ 1↑')).toBeInTheDocument();
  });

  it('clamps the title visually to two lines', async () => {
    renderAt();
    const titleEl = await screen.findByText('Implement helix flight deck Level 2');
    expect(titleEl).toHaveClass('line-clamp-2');
  });

  it('exposes the card as a link to the issue detail route', async () => {
    renderAt();
    const link = (await screen.findByRole('link', { name: /open issue vm2/i })) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toMatch(/\/p\/beads-helix\/i\/beads-helix-vm2$/);
  });

  it('navigates to the issue detail when the card is clicked (does NOT copy)', async () => {
    const user = userEvent.setup();
    const { router } = renderAt();
    const link = await screen.findByRole('link', { name: /open issue vm2/i });
    await user.click(link);
    expect(router.state.location.pathname).toBe('/p/beads-helix/i/beads-helix-vm2');
    expect(copySpy).not.toHaveBeenCalled();
  });

  it('preserves existing search params when navigating from the card', async () => {
    const user = userEvent.setup();
    const { router } = renderAt('/p/beads-helix?priority=2&q=foo');
    await user.click(await screen.findByRole('link', { name: /open issue vm2/i }));
    expect(router.state.location.pathname).toBe('/p/beads-helix/i/beads-helix-vm2');
    expect(router.state.location.searchStr).toContain('priority=2');
    expect(router.state.location.searchStr).toContain('q=foo');
  });

  it('short-id button copies the bd id and does NOT navigate', async () => {
    const user = userEvent.setup();
    const { router } = renderAt();
    const copyBtn = await screen.findByRole('button', { name: /copy id beads-helix-vm2/i });
    await user.click(copyBtn);
    expect(copySpy).toHaveBeenCalledWith('beads-helix-vm2');
    expect(router.state.location.pathname).toBe('/p/beads-helix');
  });

  it('short-id button shows a success toast', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(await screen.findByRole('button', { name: /copy id beads-helix-vm2/i }));
    expect(sonnerToast.success).toHaveBeenCalledTimes(1);
    expect(sonnerToast.success.mock.calls[0][0]).toMatch(/copied/i);
  });

  it('pressing `c` while the card is focused copies the id', async () => {
    const user = userEvent.setup();
    renderAt();
    const link = await screen.findByRole('link', { name: /open issue vm2/i });
    link.focus();
    await user.keyboard('c');
    expect(copySpy).toHaveBeenCalledWith('beads-helix-vm2');
  });

  it('applies ghosted styling when ghosted prop is true', async () => {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const projectRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/p/$projectId',
      component: () => <Card issue={issue} projectId="beads-helix" ghosted />,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([projectRoute]),
      history: createMemoryHistory({ initialEntries: ['/p/beads-helix'] }),
    });
    render(<RouterProvider router={router} />);
    const link = await screen.findByRole('link', { name: /open issue vm2/i });
    expect(link).toHaveClass('opacity-15');
  });

  it('applies highlight tint when highlightTint is provided', async () => {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const projectRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/p/$projectId',
      component: () => <Card issue={issue} projectId="beads-helix" highlightTint="red" />,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([projectRoute]),
      history: createMemoryHistory({ initialEntries: ['/p/beads-helix'] }),
    });
    render(<RouterProvider router={router} />);
    const link = await screen.findByRole('link', { name: /open issue vm2/i });
    expect(link.className).toMatch(/ring-red/);
  });

  it('renders priority chip with priority-specific styling', async () => {
    const { container } = renderAt(
      '/p/beads-helix',
      { ...issue, priority: 0 },
    );
    await screen.findByText(/Implement helix flight deck Level 2/);
    const chipP0 = container.querySelector('[data-testid="priority-chip"]');
    expect(chipP0?.className).toMatch(/red/);
  });
});
