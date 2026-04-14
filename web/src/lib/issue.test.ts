import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchIssue, IssueError } from './issue';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const validIssue = {
  id: 'beads-helix-abc',
  title: 'Title',
  status: 'open',
  labels: ['idea'],
  priority: 2,
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
};

describe('fetchIssue', () => {
  it('fetches /api/issue/:id?projectId= and returns the parsed issue', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validIssue,
    });
    const result = await fetchIssue('beads-helix', 'beads-helix-abc');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/issue/beads-helix-abc?projectId=beads-helix',
      expect.any(Object),
    );
    expect(result.id).toBe('beads-helix-abc');
  });

  it('url-encodes the issue id and project id', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => validIssue });
    await fetchIssue('proj with space', 'id/slash');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/issue/id%2Fslash?projectId=proj%20with%20space',
      expect.any(Object),
    );
  });

  it('throws ISSUE_NOT_FOUND on 404', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'ISSUE_NOT_FOUND', message: 'no such issue' }),
    });
    await expect(fetchIssue('p', 'missing')).rejects.toMatchObject({
      name: 'IssueError',
      code: 'ISSUE_NOT_FOUND',
    });
  });

  it('throws SNAPSHOT_NOT_FOUND on 404 with that error code', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'SNAPSHOT_NOT_FOUND', message: 'snapshot missing' }),
    });
    await expect(fetchIssue('p', 'i')).rejects.toMatchObject({
      code: 'SNAPSHOT_NOT_FOUND',
    });
  });

  it('throws UNKNOWN_ERROR on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));
    await expect(fetchIssue('p', 'i')).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
    });
  });

  it('throws SCHEMA_INVALID when server returns malformed issue', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'partial', title: 123 }),
    });
    await expect(fetchIssue('p', 'i')).rejects.toMatchObject({
      code: 'SCHEMA_INVALID',
    });
  });

  it('IssueError is an instance of Error', () => {
    const err = new IssueError('ISSUE_NOT_FOUND', 'nope');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('ISSUE_NOT_FOUND');
  });
});
