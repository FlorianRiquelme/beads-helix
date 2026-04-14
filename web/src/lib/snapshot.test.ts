import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSnapshot, SnapshotError } from './snapshot';

const validSnapshot = {
  project_id: 'beads-helix',
  generated_at: '2026-04-14T00:00:00.000Z',
  stale_after: '2026-04-14T00:01:00.000Z',
  columns_summary: {
    idea: 1,
    refined: 0,
    ready: 0,
    in_progress: 0,
    done: 0,
    deferred: 0,
  },
  issues: [
    {
      id: 'beads-helix-vm2',
      title: 'kanban',
      status: 'open',
      labels: ['idea'],
      priority: 1,
      issue_type: 'task',
      assignee: null,
      board_column: 'idea',
      summary_line: 'beads-helix-vm2 kanban [idea]',
      dependency_count: 0,
      dependent_count: 0,
      created_at: '2026-04-14T00:00:00.000Z',
      updated_at: '2026-04-14T00:00:00.000Z',
      closed_at: null,
    },
  ],
  _meta: {
    source: 'dolt_server' as const,
    refresh_duration_ms: 12,
    schema_version: 1,
  },
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchSnapshot', () => {
  it('returns a parsed snapshot on 200', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validSnapshot,
    });
    const result = await fetchSnapshot('beads-helix');
    expect(result.project_id).toBe('beads-helix');
    expect(result.issues).toHaveLength(1);
  });

  it('hits /api/snapshot with the projectId query param', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validSnapshot,
    });
    await fetchSnapshot('proj-abc');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/snapshot?projectId=proj-abc',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('throws SnapshotError of code SNAPSHOT_NOT_FOUND on 404', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: 'SNAPSHOT_NOT_FOUND',
        message: 'missing',
        projectId: 'x',
      }),
    });
    await expect(fetchSnapshot('x')).rejects.toMatchObject({
      code: 'SNAPSHOT_NOT_FOUND',
    });
  });

  it('throws SnapshotError of code SNAPSHOT_CORRUPT on 500 with that code', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'SNAPSHOT_CORRUPT',
        message: 'bad json',
      }),
    });
    await expect(fetchSnapshot('x')).rejects.toMatchObject({
      code: 'SNAPSHOT_CORRUPT',
    });
  });

  it('throws SnapshotError of code MISSING_PROJECT_ID on 400', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'MISSING_PROJECT_ID', message: 'oops' }),
    });
    await expect(fetchSnapshot('x')).rejects.toMatchObject({
      code: 'MISSING_PROJECT_ID',
    });
  });

  it('throws UNKNOWN_ERROR when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(fetchSnapshot('x')).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
    });
  });

  it('throws SCHEMA_INVALID when response is malformed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ wat: true }),
    });
    await expect(fetchSnapshot('x')).rejects.toMatchObject({
      code: 'SCHEMA_INVALID',
    });
  });

  it('SnapshotError is an Error subclass with code', () => {
    const err = new SnapshotError('SNAPSHOT_NOT_FOUND', 'missing');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('SNAPSHOT_NOT_FOUND');
    expect(err.message).toBe('missing');
  });
});
