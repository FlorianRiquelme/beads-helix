import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { z } from 'zod';
import { ProjectPage } from './ProjectPage';

// Re-create the project route locally so the test owns the routing topology
// and can dictate the initial URL. The schema must match src/router.tsx.
const ProjectSearchSchema = z.object({
  priority: z
    .union([z.literal('all'), z.coerce.number().int().min(0).max(4)])
    .optional(),
  q: z.string().optional(),
});

const sampleSnapshot = {
  project_id: 'beads-helix',
  generated_at: '2026-04-14T00:00:00.000Z',
  stale_after: '2026-04-14T00:01:00.000Z',
  columns_summary: { idea: 1, refined: 1, ready: 0, in_progress: 0, done: 0, deferred: 0 },
  issues: [
    {
      id: 'beads-helix-aaa',
      title: 'Idea card',
      status: 'open',
      labels: ['idea'],
      priority: 1,
      issue_type: 'task',
      assignee: null,
      board_column: 'idea',
      summary_line: '',
      dependency_count: 0,
      dependent_count: 0,
      created_at: '2026-04-14T00:00:00.000Z',
      updated_at: '2026-04-14T00:00:00.000Z',
      closed_at: null,
      description: null,
      notes: null,
      design: null,
      dependency_ids: [],
      dependent_ids: [],
    },
    {
      id: 'beads-helix-bbb',
      title: 'Refined card',
      status: 'open',
      labels: ['refined'],
      priority: 0,
      issue_type: 'task',
      assignee: null,
      board_column: 'refined',
      summary_line: '',
      dependency_count: 0,
      dependent_count: 0,
      created_at: '2026-04-14T00:00:00.000Z',
      updated_at: '2026-04-14T00:00:00.000Z',
      closed_at: null,
      description: null,
      notes: null,
      design: null,
      dependency_ids: [],
      dependent_ids: [],
    },
  ],
  _meta: { source: 'dolt_server' as const, refresh_duration_ms: 5, schema_version: 2 },
};

class MockEventSource {
  url: string;
  readyState = 0;
  constructor(url: string) {
    this.url = url;
    this.readyState = 1;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// We must mock '../router' because ProjectPage imports projectRoute from there
// to derive useParams/useSearch. Tests build their own router so we can drive
// the initial URL — and the `projectRoute` exported here proxies the test
// route the page is mounted under.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let __testProjectRoute: any = null;
vi.mock('../router', () => ({
  get projectRoute() {
    if (!__testProjectRoute) throw new Error('test route not initialised');
    return __testProjectRoute;
  },
}));

function renderAt(initialUrl: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/p/$projectId',
    validateSearch: (raw: Record<string, unknown>) => ProjectSearchSchema.parse(raw),
    component: ProjectPage,
  });
  __testProjectRoute = projectRoute;
  const router = createRouter({
    routeTree: rootRoute.addChildren([projectRoute]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, ...result };
}

describe('<ProjectPage /> URL search-param sync', () => {
  it('uses the projectId from the URL params for the snapshot fetch', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...sampleSnapshot, project_id: 'my-other-proj' }),
    });
    renderAt('/p/my-other-proj');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/snapshot?projectId=my-other-proj',
        expect.any(Object),
      );
    });
  });

  it('hydrates the priority filter from ?priority=', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    });
    renderAt('/p/beads-helix?priority=0');
    await screen.findByRole('button', { name: /Refined card/i });
    expect(screen.queryByRole('button', { name: /Idea card/i })).not.toBeInTheDocument();
    const select = screen.getByLabelText(/priority/i) as HTMLSelectElement;
    expect(select.value).toBe('0');
  });

  it('writes priority changes back to the URL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    });
    const { router } = renderAt('/p/beads-helix');
    await screen.findByRole('button', { name: /Idea card/i });
    fireEvent.change(screen.getByLabelText(/priority/i), { target: { value: '1' } });
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ priority: 1 });
    });
  });

  it('omits priority from URL when set back to all', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    });
    const { router } = renderAt('/p/beads-helix?priority=2');
    const select = await screen.findByLabelText(/priority/i);
    expect((select as HTMLSelectElement).value).toBe('2');
    fireEvent.change(select, { target: { value: 'all' } });
    await waitFor(() => {
      expect(router.state.location.search).not.toHaveProperty('priority');
    });
  });
});
