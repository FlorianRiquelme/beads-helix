import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports that touch the modules
// ---------------------------------------------------------------------------

vi.mock('mysql2/promise', () => {
  return {
    default: {
      createConnection: vi.fn(),
    },
    createConnection: vi.fn(),
  };
});

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks are registered
// ---------------------------------------------------------------------------

import * as mysql2 from 'mysql2/promise';
import * as childProcess from 'node:child_process';
import { readDolt } from '../src/dolt.js';

// ---------------------------------------------------------------------------
// Typed mock accessors
// ---------------------------------------------------------------------------

const mockCreateConnection = vi.mocked(mysql2.createConnection);
const mockExecFileSync = vi.mocked(childProcess.execFileSync);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const PORT = 3306;
const DATABASE = 'hq';
const EMBEDDED_PATH = '/tmp/.beads/embeddeddolt/hq';

const SAMPLE_ISSUES = [
  {
    id: 'issue-1',
    title: 'First issue',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    assignee: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    closed_at: null,
    maturity: 'idea',
    labels_csv: 'idea',
  },
];

const SAMPLE_DEPS = [
  {
    issue_id: 'issue-1',
    depends_on_id: 'issue-0',
    type: 'blocks',
    depends_on_status: 'open',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a mock mysql2 connection that succeeds with the given data.
 * The execute calls are dispatched in order: START TRANSACTION, ISSUES, DEPS, COMMIT.
 */
function makeMockConnection(issues: unknown[], deps: unknown[]) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce(undefined) // START TRANSACTION READ ONLY
    .mockResolvedValueOnce([issues, []]) // ISSUES query → [rows, fields]
    .mockResolvedValueOnce([deps, []]) // DEPS query → [rows, fields]
    .mockResolvedValueOnce(undefined); // COMMIT
  const end = vi.fn().mockResolvedValue(undefined);
  return { execute, end };
}

/**
 * Builds a mock mysql2 connection whose first query after START TRANSACTION fails.
 */
function makeMockConnectionQueryFails(queryError: Error) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce(undefined) // START TRANSACTION READ ONLY
    .mockRejectedValueOnce(queryError) // ISSUES query throws
    .mockResolvedValueOnce(undefined); // ROLLBACK
  const end = vi.fn().mockResolvedValue(undefined);
  return { execute, end };
}

/**
 * Encodes rows in the `{ rows: [...] }` JSON format that `dolt sql -r json` produces.
 */
function doltJsonOutput(rows: unknown[]): string {
  return JSON.stringify({ rows });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// readDolt — server mode (happy path)
// ---------------------------------------------------------------------------

describe('readDolt — server mode (happy path)', () => {
  it('opens a connection, runs START TRANSACTION READ ONLY → queries → COMMIT', async () => {
    const conn = makeMockConnection(SAMPLE_ISSUES, SAMPLE_DEPS);
    mockCreateConnection.mockResolvedValue(conn as never);

    const result = await readDolt(PORT, DATABASE, EMBEDDED_PATH);

    expect(mockCreateConnection).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: PORT,
      user: 'root',
      database: DATABASE,
    });

    // Verify transaction lifecycle order
    const calls = conn.execute.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toBe('START TRANSACTION READ ONLY');
    expect(calls[calls.length - 1]).toBe('COMMIT');
    expect(conn.end).toHaveBeenCalled();
  });

  it('returns source="dolt_server" and the rows from the connection', async () => {
    const conn = makeMockConnection(SAMPLE_ISSUES, SAMPLE_DEPS);
    mockCreateConnection.mockResolvedValue(conn as never);

    const result = await readDolt(PORT, DATABASE, EMBEDDED_PATH);

    expect(result.source).toBe('dolt_server');
    expect(result.issues).toEqual(SAMPLE_ISSUES);
    expect(result.deps).toEqual(SAMPLE_DEPS);
  });

  it('always calls connection.end() even on success', async () => {
    const conn = makeMockConnection(SAMPLE_ISSUES, SAMPLE_DEPS);
    mockCreateConnection.mockResolvedValue(conn as never);

    await readDolt(PORT, DATABASE, EMBEDDED_PATH);

    expect(conn.end).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// readDolt — ECONNREFUSED fallback to dolt_sql
// ---------------------------------------------------------------------------

describe('readDolt — ECONNREFUSED fallback', () => {
  beforeEach(() => {
    // mysql2 throws ECONNREFUSED on createConnection
    const err = Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' });
    mockCreateConnection.mockRejectedValue(err);

    // execFileSync returns valid JSON for both queries
    mockExecFileSync
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_ISSUES))
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_DEPS));
  });

  it('falls back to dolt sql CLI and returns source="dolt_sql"', async () => {
    const result = await readDolt(PORT, DATABASE, EMBEDDED_PATH);

    expect(result.source).toBe('dolt_sql');
    expect(result.issues).toEqual(SAMPLE_ISSUES);
    expect(result.deps).toEqual(SAMPLE_DEPS);
  });

  it('writes a stderr warning naming the error code', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await readDolt(PORT, DATABASE, EMBEDDED_PATH);

    expect(stderrSpy).toHaveBeenCalled();
    const message = stderrSpy.mock.calls[0][0] as string;
    expect(message).toContain('ECONNREFUSED');
  });

  it('passes the embedded path as cwd to execFileSync', async () => {
    await readDolt(PORT, DATABASE, EMBEDDED_PATH);

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'dolt',
      expect.arrayContaining(['sql', '--disable-auto-gc', '-r', 'json']),
      expect.objectContaining({ cwd: EMBEDDED_PATH }),
    );
  });
});

// ---------------------------------------------------------------------------
// readDolt — ETIMEDOUT fallback to dolt_sql
// ---------------------------------------------------------------------------

describe('readDolt — ETIMEDOUT fallback', () => {
  beforeEach(() => {
    const err = Object.assign(new Error('Connection timed out'), { code: 'ETIMEDOUT' });
    mockCreateConnection.mockRejectedValue(err);

    mockExecFileSync
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_ISSUES))
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_DEPS));
  });

  it('falls back to dolt sql CLI and returns source="dolt_sql"', async () => {
    const result = await readDolt(PORT, DATABASE, EMBEDDED_PATH);

    expect(result.source).toBe('dolt_sql');
  });

  it('writes a stderr warning naming ETIMEDOUT', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await readDolt(PORT, DATABASE, EMBEDDED_PATH);

    expect(stderrSpy).toHaveBeenCalled();
    const message = stderrSpy.mock.calls[0][0] as string;
    expect(message).toContain('ETIMEDOUT');
  });
});

// ---------------------------------------------------------------------------
// readDolt — non-recoverable server error (no fallback)
// ---------------------------------------------------------------------------

describe('readDolt — non-recoverable server error', () => {
  it('re-throws errors that are not ECONNREFUSED or ETIMEDOUT', async () => {
    const authError = Object.assign(new Error('Access denied'), { code: 'ER_ACCESS_DENIED_ERROR' });
    mockCreateConnection.mockRejectedValue(authError);

    await expect(readDolt(PORT, DATABASE, EMBEDDED_PATH)).rejects.toThrow('Access denied');
  });

  it('does not call execFileSync when a non-recoverable error is thrown', async () => {
    const genericError = new Error('Something unexpected');
    mockCreateConnection.mockRejectedValue(genericError);

    await expect(readDolt(PORT, DATABASE, EMBEDDED_PATH)).rejects.toThrow();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('re-throws an error with no code property', async () => {
    const noCodeError = new Error('No code');
    mockCreateConnection.mockRejectedValue(noCodeError);

    await expect(readDolt(PORT, DATABASE, EMBEDDED_PATH)).rejects.toThrow('No code');
  });
});

// ---------------------------------------------------------------------------
// readDolt — server ROLLBACK on query failure
// ---------------------------------------------------------------------------

describe('readDolt — ROLLBACK on query failure inside transaction', () => {
  it('calls ROLLBACK when a query inside the transaction throws', async () => {
    const queryError = new Error('Query failed');
    const conn = makeMockConnectionQueryFails(queryError);
    mockCreateConnection.mockResolvedValue(conn as never);

    await expect(readDolt(PORT, DATABASE, EMBEDDED_PATH)).rejects.toThrow('Query failed');

    const calls = conn.execute.mock.calls.map((c) => c[0] as string);
    expect(calls).toContain('ROLLBACK');
  });

  it('calls connection.end() even when a query inside the transaction throws', async () => {
    const queryError = new Error('Query failed');
    const conn = makeMockConnectionQueryFails(queryError);
    mockCreateConnection.mockResolvedValue(conn as never);

    await expect(readDolt(PORT, DATABASE, EMBEDDED_PATH)).rejects.toThrow();

    expect(conn.end).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// readDolt — direct mode (port = null)
// ---------------------------------------------------------------------------

describe('readDolt — direct mode (port=null)', () => {
  it('skips mysql2 entirely and calls execFileSync directly', async () => {
    mockExecFileSync
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_ISSUES))
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_DEPS));

    await readDolt(null, DATABASE, EMBEDDED_PATH);

    expect(mockCreateConnection).not.toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
  });

  it('returns source="dolt_sql" when port is null', async () => {
    mockExecFileSync
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_ISSUES))
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_DEPS));

    const result = await readDolt(null, DATABASE, EMBEDDED_PATH);

    expect(result.source).toBe('dolt_sql');
  });

  it('returns rows from both queries', async () => {
    mockExecFileSync
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_ISSUES))
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_DEPS));

    const result = await readDolt(null, DATABASE, EMBEDDED_PATH);

    expect(result.issues).toEqual(SAMPLE_ISSUES);
    expect(result.deps).toEqual(SAMPLE_DEPS);
  });

  it('does not write any stderr warning', async () => {
    mockExecFileSync
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_ISSUES))
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_DEPS));

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await readDolt(null, DATABASE, EMBEDDED_PATH);

    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// queryDirect — JSON parse error
// ---------------------------------------------------------------------------

describe('queryDirect (via readDolt port=null) — JSON parse error', () => {
  it('throws an error containing the first 200 chars of the bad output', async () => {
    const badOutput = 'THIS IS NOT JSON — some garbage output from the CLI';
    mockExecFileSync.mockReturnValue(badOutput);

    await expect(readDolt(null, DATABASE, EMBEDDED_PATH)).rejects.toThrow(
      badOutput.slice(0, 200),
    );
  });

  it('throws an error whose message includes "Failed to parse Dolt JSON output"', async () => {
    mockExecFileSync.mockReturnValue('not json');

    await expect(readDolt(null, DATABASE, EMBEDDED_PATH)).rejects.toThrow(
      'Failed to parse Dolt JSON output',
    );
  });

  it('truncates to 200 chars when the bad output is longer', async () => {
    // 300-character invalid output
    const longBad = 'x'.repeat(300);
    mockExecFileSync.mockReturnValue(longBad);

    let thrown: Error | undefined;
    try {
      await readDolt(null, DATABASE, EMBEDDED_PATH);
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).toBeDefined();
    // The message should include exactly the first 200 chars, not the full 300
    expect(thrown!.message).toContain('x'.repeat(200));
    expect(thrown!.message).not.toContain('x'.repeat(201));
  });
});

// ---------------------------------------------------------------------------
// queryDirect — rows format variants
// ---------------------------------------------------------------------------

describe('queryDirect (via readDolt port=null) — rows format', () => {
  it('returns parsed.rows when the JSON has a top-level rows property', async () => {
    const rows = [{ id: 'abc' }];
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify({ rows }))
      .mockReturnValueOnce(JSON.stringify({ rows: [] }));

    const result = await readDolt(null, DATABASE, EMBEDDED_PATH);

    expect(result.issues).toEqual(rows);
  });

  it('returns the parsed value itself when there is no rows property', async () => {
    const bare = [{ id: 'xyz' }];
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify(bare))
      .mockReturnValueOnce(JSON.stringify([]));

    const result = await readDolt(null, DATABASE, EMBEDDED_PATH);

    expect(result.issues).toEqual(bare);
  });

  it('returns an empty array when rows property is an empty array', async () => {
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify({ rows: [] }))
      .mockReturnValueOnce(JSON.stringify({ rows: [] }));

    const result = await readDolt(null, DATABASE, EMBEDDED_PATH);

    expect(result.issues).toEqual([]);
    expect(result.deps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// queryDirect — CLI invocation details
// ---------------------------------------------------------------------------

describe('queryDirect (via readDolt port=null) — CLI invocation', () => {
  it('invokes the "dolt" binary (not a shell)', async () => {
    mockExecFileSync
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_ISSUES))
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_DEPS));

    await readDolt(null, DATABASE, EMBEDDED_PATH);

    expect(mockExecFileSync).toHaveBeenCalledWith('dolt', expect.any(Array), expect.any(Object));
  });

  it('passes --disable-auto-gc flag', async () => {
    mockExecFileSync
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_ISSUES))
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_DEPS));

    await readDolt(null, DATABASE, EMBEDDED_PATH);

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'dolt',
      expect.arrayContaining(['--disable-auto-gc']),
      expect.any(Object),
    );
  });

  it('passes -r json to request JSON output format', async () => {
    mockExecFileSync
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_ISSUES))
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_DEPS));

    await readDolt(null, DATABASE, EMBEDDED_PATH);

    const args = mockExecFileSync.mock.calls[0][1] as string[];
    const rIdx = args.indexOf('-r');
    expect(rIdx).toBeGreaterThanOrEqual(0);
    expect(args[rIdx + 1]).toBe('json');
  });

  it('executes two separate CLI calls — one for issues, one for deps', async () => {
    mockExecFileSync
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_ISSUES))
      .mockReturnValueOnce(doltJsonOutput(SAMPLE_DEPS));

    await readDolt(null, DATABASE, EMBEDDED_PATH);

    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
  });
});
