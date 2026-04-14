import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Board } from './Board';

const sampleSnapshot = {
  project_id: 'beads-helix',
  generated_at: '2026-04-14T00:00:00.000Z',
  stale_after: '2026-04-14T00:01:00.000Z',
  columns_summary: {
    idea: 1,
    refined: 1,
    ready: 1,
    in_progress: 0,
    done: 0,
    deferred: 0,
  },
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
    },
    {
      id: 'beads-helix-ccc',
      title: 'Ready card',
      status: 'open',
      labels: ['ready'],
      priority: 2,
      issue_type: 'task',
      assignee: null,
      board_column: 'ready',
      summary_line: '',
      dependency_count: 0,
      dependent_count: 0,
      created_at: '2026-04-14T00:00:00.000Z',
      updated_at: '2026-04-14T00:00:00.000Z',
      closed_at: null,
    },
  ],
  _meta: {
    source: 'dolt_server' as const,
    refresh_duration_ms: 5,
    schema_version: 1,
  },
};

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  readyState = 0;
  onerror: ((e: Event) => void) | null = null;
  private listeners: Map<string, Set<(e: MessageEvent) => void>> = new Map();
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    this.readyState = 1;
  }

  addEventListener(event: string, fn: (e: MessageEvent) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  removeEventListener(event: string, fn: (e: MessageEvent) => void): void {
    this.listeners.get(event)?.delete(fn);
  }

  close(): void {
    this.closed = true;
    this.readyState = 2;
  }

  emit(event: string, data: string): void {
    const evt = new MessageEvent(event, { data });
    this.listeners.get(event)?.forEach((fn) => fn(evt));
  }

  static reset(): void {
    MockEventSource.instances = [];
  }
}

const fetchMock = vi.fn();

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function withProviders(client: QueryClient, children: ReactNode) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
  MockEventSource.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<Board />', () => {
  it('shows skeleton placeholders while loading', async () => {
    let resolveFn: (v: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFn = resolve;
      }),
    );
    const client = makeQueryClient();
    render(withProviders(client, <Board projectId="beads-helix" />));
    expect(screen.getByTestId('board-loading')).toBeInTheDocument();
    resolveFn({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    } as Response);
  });

  it('renders three columns of buckets with cards once data resolves', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    });
    const client = makeQueryClient();
    render(withProviders(client, <Board projectId="beads-helix" />));
    expect(await screen.findByRole('button', { name: /Idea card/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refined card/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ready card/i })).toBeInTheDocument();
  });

  it('renders SNAPSHOT_NOT_FOUND empty state with helpful command', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: 'SNAPSHOT_NOT_FOUND',
        message: 'missing',
        projectId: 'beads-helix',
      }),
    });
    const client = makeQueryClient();
    render(withProviders(client, <Board projectId="beads-helix" />));
    expect(await screen.findByText(/no snapshot yet/i)).toBeInTheDocument();
    expect(screen.getByText('bd prime')).toBeInTheDocument();
  });

  it('renders SNAPSHOT_CORRUPT error state', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'SNAPSHOT_CORRUPT', message: 'bad json' }),
    });
    const client = makeQueryClient();
    render(withProviders(client, <Board projectId="beads-helix" />));
    expect(await screen.findByText(/snapshot.*corrupt/i)).toBeInTheDocument();
  });

  it('refetches the snapshot when an SSE snapshot-changed event arrives', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    });
    const client = makeQueryClient();
    render(withProviders(client, <Board projectId="beads-helix" />));
    await screen.findByRole('button', { name: /Idea card/i });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(MockEventSource.instances.length).toBe(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toBe('/api/events');

    await act(async () => {
      es.emit('snapshot-changed', JSON.stringify({ path: '/tmp/x' }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('refetches when "R" is pressed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    });
    const client = makeQueryClient();
    render(withProviders(client, <Board projectId="beads-helix" />));
    await screen.findByRole('button', { name: /Idea card/i });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'r' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('does not refetch when typing in an input field', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    });
    const client = makeQueryClient();
    render(withProviders(client, <Board projectId="beads-helix" />));
    await screen.findByRole('button', { name: /Idea card/i });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const input = screen.getByPlaceholderText(/search/i);
    input.focus();
    fireEvent.keyDown(input, { key: 'r' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('closes the SSE connection on unmount', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    });
    const client = makeQueryClient();
    const { unmount } = render(
      withProviders(client, <Board projectId="beads-helix" />),
    );
    await screen.findByRole('button', { name: /Idea card/i });
    unmount();
    expect(MockEventSource.instances[0].closed).toBe(true);
  });

  it('filters cards by priority via the FilterToolbar', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    });
    const client = makeQueryClient();
    render(withProviders(client, <Board projectId="beads-helix" />));
    await screen.findByRole('button', { name: /Idea card/i });
    fireEvent.change(screen.getByLabelText(/priority/i), { target: { value: '0' } });
    expect(screen.queryByRole('button', { name: /Idea card/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refined card/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ready card/i })).not.toBeInTheDocument();
  });
});
