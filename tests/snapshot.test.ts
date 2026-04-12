import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any SUT imports
// ---------------------------------------------------------------------------

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

vi.mock('../src/repo.js', () => ({
  findBeadsRepo: vi.fn(),
  getDoltServerPort: vi.fn(),
  getEmbeddedDoltPath: vi.fn(),
  snapshotPath: vi.fn(),
  lockPath: vi.fn(),
}));

vi.mock('../src/dolt.js', () => ({
  readDolt: vi.fn(),
}));

vi.mock('../src/derive.js', () => ({
  buildSnapshot: vi.fn(),
}));

vi.mock('../src/atomic.js', () => ({
  writeAtomicJSON: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import * as repo from '../src/repo.js';
import * as dolt from '../src/dolt.js';
import * as derive from '../src/derive.js';
import * as atomic from '../src/atomic.js';
import { resolveSnapshotPath, refresh } from '../src/snapshot.js';
import type { BeadsRepo } from '../src/repo.js';
import type { DoltResult } from '../src/dolt.js';
import type { Snapshot } from '../src/types.js';

// ---------------------------------------------------------------------------
// Typed mock accessors
// ---------------------------------------------------------------------------

const mockFindBeadsRepo = vi.mocked(repo.findBeadsRepo);
const mockGetDoltServerPort = vi.mocked(repo.getDoltServerPort);
const mockGetEmbeddedDoltPath = vi.mocked(repo.getEmbeddedDoltPath);
const mockSnapshotPath = vi.mocked(repo.snapshotPath);
const mockLockPath = vi.mocked(repo.lockPath);
const mockReadDolt = vi.mocked(dolt.readDolt);
const mockBuildSnapshot = vi.mocked(derive.buildSnapshot);
const mockWriteAtomicJSON = vi.mocked(atomic.writeAtomicJSON);
const mockAcquireLock = vi.mocked(atomic.acquireLock);
const mockReleaseLock = vi.mocked(atomic.releaseLock);
const mockExistsSync = vi.mocked(existsSync);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const FAKE_REPO: BeadsRepo = {
  root: '/project',
  beadsDir: '/project/.beads',
  projectId: 'my-project',
  doltDatabase: 'hq',
};

const SNAP_PATH = '/tmp/beads-sidecar/my-project.snapshot.json';
const LOCK_PATH = '/tmp/beads-sidecar/my-project.refresh.lock';
const EMBEDDED_PATH = '/project/.beads/embeddeddolt/hq';

const FAKE_DOLT_RESULT: DoltResult = {
  issues: [],
  deps: [],
  source: 'dolt_server',
};

const FAKE_SNAPSHOT: Snapshot = {
  project_id: 'my-project',
  generated_at: '2026-04-12T00:00:00.000Z',
  stale_after: '2026-04-12T00:01:00.000Z',
  columns_summary: {
    idea: 0,
    refined: 0,
    ready: 0,
    in_progress: 0,
    done: 0,
    deferred: 0,
  },
  issues: [],
  _meta: {
    source: 'dolt_server',
    refresh_duration_ms: 42,
    schema_version: 1,
  },
};

// ---------------------------------------------------------------------------
// Helper: configure all mocks for a standard "happy path" invocation
// ---------------------------------------------------------------------------

function setupHappyPath() {
  mockFindBeadsRepo.mockReturnValue(FAKE_REPO);
  mockSnapshotPath.mockReturnValue(SNAP_PATH);
  mockLockPath.mockReturnValue(LOCK_PATH);
  mockAcquireLock.mockReturnValue(true);
  mockGetDoltServerPort.mockReturnValue(3306);
  mockGetEmbeddedDoltPath.mockReturnValue(EMBEDDED_PATH);
  mockExistsSync.mockReturnValue(true);
  mockReadDolt.mockResolvedValue(FAKE_DOLT_RESULT);
  mockBuildSnapshot.mockReturnValue(FAKE_SNAPSHOT);
  mockWriteAtomicJSON.mockImplementation(() => undefined);
  mockReleaseLock.mockImplementation(() => undefined);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// resolveSnapshotPath
// ---------------------------------------------------------------------------

describe('resolveSnapshotPath', () => {
  it('returns { path } when a beads repo is found', () => {
    mockFindBeadsRepo.mockReturnValue(FAKE_REPO);
    mockSnapshotPath.mockReturnValue(SNAP_PATH);

    const result = resolveSnapshotPath('/project');

    expect(result).toEqual({ path: SNAP_PATH });
    expect(mockSnapshotPath).toHaveBeenCalledWith(FAKE_REPO.projectId);
  });

  it('returns { error: "NOT_BEADS_REPO" } when no repo is found', () => {
    mockFindBeadsRepo.mockReturnValue(null);

    const result = resolveSnapshotPath('/not-a-repo');

    expect(result).toEqual({ error: 'NOT_BEADS_REPO' });
  });

  it('passes the repoPath argument through to findBeadsRepo', () => {
    mockFindBeadsRepo.mockReturnValue(null);

    resolveSnapshotPath('/some/custom/path');

    expect(mockFindBeadsRepo).toHaveBeenCalledWith('/some/custom/path');
  });

  it('calls findBeadsRepo with undefined when no argument is provided', () => {
    mockFindBeadsRepo.mockReturnValue(null);

    resolveSnapshotPath();

    expect(mockFindBeadsRepo).toHaveBeenCalledWith(undefined);
  });
});

// ---------------------------------------------------------------------------
// refresh — NOT_BEADS_REPO
// ---------------------------------------------------------------------------

describe('refresh — NOT_BEADS_REPO', () => {
  beforeEach(() => {
    mockFindBeadsRepo.mockReturnValue(null);
  });

  it('returns status="error" with code NOT_BEADS_REPO', async () => {
    const result = await refresh('/no-beads');

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('NOT_BEADS_REPO');
    }
  });

  it('returns an empty snapshot_path string', async () => {
    const result = await refresh('/no-beads');

    expect(result.snapshot_path).toBe('');
  });

  it('returns a descriptive message', async () => {
    const result = await refresh('/no-beads');

    if (result.status === 'error') {
      expect(result.message).toBeTruthy();
      expect(result.message).toContain('.beads');
    }
  });

  it('does not call acquireLock', async () => {
    await refresh('/no-beads');

    expect(mockAcquireLock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// refresh — busy (lock not acquired)
// ---------------------------------------------------------------------------

describe('refresh — busy', () => {
  beforeEach(() => {
    mockFindBeadsRepo.mockReturnValue(FAKE_REPO);
    mockSnapshotPath.mockReturnValue(SNAP_PATH);
    mockLockPath.mockReturnValue(LOCK_PATH);
    mockAcquireLock.mockReturnValue(false);
  });

  it('returns status="busy"', async () => {
    const result = await refresh();

    expect(result.status).toBe('busy');
  });

  it('returns the snapshot_path even when busy', async () => {
    const result = await refresh();

    expect(result.snapshot_path).toBe(SNAP_PATH);
  });

  it('does not call readDolt when busy', async () => {
    await refresh();

    expect(mockReadDolt).not.toHaveBeenCalled();
  });

  it('does not call releaseLock when lock was never acquired', async () => {
    await refresh();

    expect(mockReleaseLock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// refresh — SOURCE_UNAVAILABLE (no server, embedded path missing)
// ---------------------------------------------------------------------------

describe('refresh — SOURCE_UNAVAILABLE (no dolt source)', () => {
  beforeEach(() => {
    mockFindBeadsRepo.mockReturnValue(FAKE_REPO);
    mockSnapshotPath.mockReturnValue(SNAP_PATH);
    mockLockPath.mockReturnValue(LOCK_PATH);
    mockAcquireLock.mockReturnValue(true);
    mockGetDoltServerPort.mockReturnValue(null); // no server
    mockGetEmbeddedDoltPath.mockReturnValue(EMBEDDED_PATH);
    mockExistsSync.mockReturnValue(false); // embedded path absent
    mockReleaseLock.mockImplementation(() => undefined);
  });

  it('returns status="error" with code SOURCE_UNAVAILABLE', async () => {
    const result = await refresh();

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('SOURCE_UNAVAILABLE');
    }
  });

  it('returns the snapshot_path in the error response', async () => {
    const result = await refresh();

    expect(result.snapshot_path).toBe(SNAP_PATH);
  });

  it('does not call readDolt', async () => {
    await refresh();

    expect(mockReadDolt).not.toHaveBeenCalled();
  });

  it('still releases the lock', async () => {
    await refresh();

    expect(mockReleaseLock).toHaveBeenCalledWith(LOCK_PATH);
  });

  it('proceeds to readDolt when port is present (server available)', async () => {
    // Override: server IS available, so SOURCE_UNAVAILABLE should NOT fire
    mockGetDoltServerPort.mockReturnValue(3306);
    mockReadDolt.mockResolvedValue(FAKE_DOLT_RESULT);
    mockBuildSnapshot.mockReturnValue(FAKE_SNAPSHOT);
    mockWriteAtomicJSON.mockImplementation(() => undefined);

    const result = await refresh();

    expect(result.status).not.toBe('error');
    expect(mockReadDolt).toHaveBeenCalled();
  });

  it('proceeds to readDolt when embedded path exists (even without server)', async () => {
    // Override: no server but embedded path exists
    mockGetDoltServerPort.mockReturnValue(null);
    mockExistsSync.mockReturnValue(true); // embedded path exists
    mockReadDolt.mockResolvedValue(FAKE_DOLT_RESULT);
    mockBuildSnapshot.mockReturnValue(FAKE_SNAPSHOT);
    mockWriteAtomicJSON.mockImplementation(() => undefined);

    const result = await refresh();

    expect(result.status).not.toBe('error');
    expect(mockReadDolt).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// refresh — Dolt read failure (FR-12: preserves last snapshot)
// ---------------------------------------------------------------------------

describe('refresh — Dolt read failure (FR-12)', () => {
  beforeEach(() => {
    mockFindBeadsRepo.mockReturnValue(FAKE_REPO);
    mockSnapshotPath.mockReturnValue(SNAP_PATH);
    mockLockPath.mockReturnValue(LOCK_PATH);
    mockAcquireLock.mockReturnValue(true);
    mockGetDoltServerPort.mockReturnValue(3306);
    mockGetEmbeddedDoltPath.mockReturnValue(EMBEDDED_PATH);
    mockExistsSync.mockReturnValue(true);
    mockReleaseLock.mockImplementation(() => undefined);
    mockReadDolt.mockRejectedValue(new Error('Dolt connection refused'));
  });

  it('returns status="error" with code SOURCE_UNAVAILABLE', async () => {
    const result = await refresh();

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('SOURCE_UNAVAILABLE');
    }
  });

  it('returns the snapshot_path so callers can locate the last good snapshot', async () => {
    const result = await refresh();

    expect(result.snapshot_path).toBe(SNAP_PATH);
  });

  it('includes the original error message in the result message', async () => {
    const result = await refresh();

    if (result.status === 'error') {
      expect(result.message).toContain('Dolt connection refused');
    }
  });

  it('does NOT call writeAtomicJSON (preserves last snapshot on disk)', async () => {
    await refresh();

    expect(mockWriteAtomicJSON).not.toHaveBeenCalled();
  });

  it('writes a stderr message about the failure', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await refresh();

    expect(stderrSpy).toHaveBeenCalled();
    const message = stderrSpy.mock.calls[0][0] as string;
    expect(message).toContain('Dolt read failed');
  });

  it('still releases the lock even when readDolt throws', async () => {
    await refresh();

    expect(mockReleaseLock).toHaveBeenCalledWith(LOCK_PATH);
  });
});

// ---------------------------------------------------------------------------
// refresh — happy path
// ---------------------------------------------------------------------------

describe('refresh — happy path', () => {
  beforeEach(() => {
    setupHappyPath();
  });

  it('returns status="refreshed"', async () => {
    const result = await refresh('/project');

    expect(result.status).toBe('refreshed');
  });

  it('returns the snapshot_path', async () => {
    const result = await refresh('/project');

    expect(result.snapshot_path).toBe(SNAP_PATH);
  });

  it('returns the source from readDolt', async () => {
    const result = await refresh('/project');

    if (result.status === 'refreshed' || result.status === 'noop') {
      expect(result.source).toBe('dolt_server');
    }
  });

  it('calls readDolt with port, database, and embedded path', async () => {
    await refresh('/project');

    expect(mockReadDolt).toHaveBeenCalledWith(3306, FAKE_REPO.doltDatabase, EMBEDDED_PATH);
  });

  it('calls buildSnapshot with the result from readDolt', async () => {
    await refresh('/project');

    expect(mockBuildSnapshot).toHaveBeenCalledWith(
      FAKE_REPO.projectId,
      FAKE_DOLT_RESULT.issues,
      FAKE_DOLT_RESULT.deps,
      FAKE_DOLT_RESULT.source,
      expect.any(Number),
    );
  });

  it('calls writeAtomicJSON with the snapshot path and built snapshot', async () => {
    await refresh('/project');

    expect(mockWriteAtomicJSON).toHaveBeenCalledWith(SNAP_PATH, FAKE_SNAPSHOT);
  });

  it('acquires the lock before reading Dolt', async () => {
    const callOrder: string[] = [];
    mockAcquireLock.mockImplementation(() => { callOrder.push('acquireLock'); return true; });
    mockReadDolt.mockImplementation(async () => { callOrder.push('readDolt'); return FAKE_DOLT_RESULT; });

    await refresh('/project');

    expect(callOrder.indexOf('acquireLock')).toBeLessThan(callOrder.indexOf('readDolt'));
  });

  it('releases the lock after writing the snapshot', async () => {
    await refresh('/project');

    expect(mockReleaseLock).toHaveBeenCalledWith(LOCK_PATH);
  });

  it('calls getDoltServerPort with the beadsDir', async () => {
    await refresh('/project');

    expect(mockGetDoltServerPort).toHaveBeenCalledWith(FAKE_REPO.beadsDir);
  });

  it('calls getEmbeddedDoltPath with beadsDir and doltDatabase', async () => {
    await refresh('/project');

    expect(mockGetEmbeddedDoltPath).toHaveBeenCalledWith(
      FAKE_REPO.beadsDir,
      FAKE_REPO.doltDatabase,
    );
  });
});

// ---------------------------------------------------------------------------
// refresh — lock always released (finally block)
// ---------------------------------------------------------------------------

describe('refresh — releaseLock always called (finally block)', () => {
  beforeEach(() => {
    mockFindBeadsRepo.mockReturnValue(FAKE_REPO);
    mockSnapshotPath.mockReturnValue(SNAP_PATH);
    mockLockPath.mockReturnValue(LOCK_PATH);
    mockAcquireLock.mockReturnValue(true);
    mockGetDoltServerPort.mockReturnValue(3306);
    mockGetEmbeddedDoltPath.mockReturnValue(EMBEDDED_PATH);
    mockExistsSync.mockReturnValue(true);
    mockReleaseLock.mockImplementation(() => undefined);
  });

  it('releases lock on successful refresh', async () => {
    mockReadDolt.mockResolvedValue(FAKE_DOLT_RESULT);
    mockBuildSnapshot.mockReturnValue(FAKE_SNAPSHOT);
    mockWriteAtomicJSON.mockImplementation(() => undefined);

    await refresh();

    expect(mockReleaseLock).toHaveBeenCalledWith(LOCK_PATH);
  });

  it('releases lock when readDolt throws', async () => {
    mockReadDolt.mockRejectedValue(new Error('read failure'));

    await refresh();

    expect(mockReleaseLock).toHaveBeenCalledWith(LOCK_PATH);
  });

  it('releases lock when buildSnapshot throws', async () => {
    mockReadDolt.mockResolvedValue(FAKE_DOLT_RESULT);
    mockBuildSnapshot.mockImplementation(() => { throw new Error('derive failure'); });

    await expect(refresh()).rejects.toThrow('derive failure');

    expect(mockReleaseLock).toHaveBeenCalledWith(LOCK_PATH);
  });

  it('releases lock when writeAtomicJSON throws', async () => {
    mockReadDolt.mockResolvedValue(FAKE_DOLT_RESULT);
    mockBuildSnapshot.mockReturnValue(FAKE_SNAPSHOT);
    mockWriteAtomicJSON.mockImplementation(() => { throw new Error('write failure'); });

    await expect(refresh()).rejects.toThrow('write failure');

    expect(mockReleaseLock).toHaveBeenCalledWith(LOCK_PATH);
  });

  it('releases lock when SOURCE_UNAVAILABLE (no source)', async () => {
    mockGetDoltServerPort.mockReturnValue(null);
    mockExistsSync.mockReturnValue(false);

    await refresh();

    expect(mockReleaseLock).toHaveBeenCalledWith(LOCK_PATH);
  });
});
