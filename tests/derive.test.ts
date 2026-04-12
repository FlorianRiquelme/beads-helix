import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSnapshot } from '../src/derive.js';
import type { DoltIssueRow, DoltDepRow } from '../src/types.js';
import type { DoltSource } from '../src/dolt.js';

// ---------------------------------------------------------------------------
// Fixture factory (spec-mandated signature)
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<DoltIssueRow> = {}): DoltIssueRow {
  return {
    id: 'test-1',
    title: 'Test Issue',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    assignee: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    closed_at: null,
    maturity: null,
    labels_csv: null,
    ...overrides,
  };
}

function makeDep(overrides: Partial<DoltDepRow> = {}): DoltDepRow {
  return {
    issue_id: 'test-1',
    depends_on_id: 'dep-1',
    type: 'blocks',
    depends_on_status: 'open',
    ...overrides,
  };
}

const SOURCE: DoltSource = 'dolt_sql';
const PROJECT = 'test-project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSingle(rowOverrides: Partial<DoltIssueRow> = {}, deps: DoltDepRow[] = []) {
  const startTime = Date.now();
  return buildSnapshot(PROJECT, [makeRow(rowOverrides)], deps, SOURCE, startTime);
}

// ---------------------------------------------------------------------------
// deriveColumn — tested via buildSnapshot (function is private)
// ---------------------------------------------------------------------------

describe('deriveColumn — status-to-column mapping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps closed → done regardless of maturity', () => {
    const snap = buildSingle({ status: 'closed', maturity: 'ready' });
    expect(snap.issues[0].board_column).toBe('done');
  });

  it('maps in_progress → in_progress regardless of maturity', () => {
    const snap = buildSingle({ status: 'in_progress', maturity: 'idea' });
    expect(snap.issues[0].board_column).toBe('in_progress');
  });

  it('maps deferred → deferred regardless of maturity', () => {
    const snap = buildSingle({ status: 'deferred', maturity: 'refined' });
    expect(snap.issues[0].board_column).toBe('deferred');
  });

  it('maps open + maturity=ready → ready', () => {
    const snap = buildSingle({ status: 'open', maturity: 'ready' });
    expect(snap.issues[0].board_column).toBe('ready');
  });

  it('maps open + maturity=refined → refined', () => {
    const snap = buildSingle({ status: 'open', maturity: 'refined' });
    expect(snap.issues[0].board_column).toBe('refined');
  });

  it('maps open + maturity=idea → idea', () => {
    const snap = buildSingle({ status: 'open', maturity: 'idea' });
    expect(snap.issues[0].board_column).toBe('idea');
  });

  it('maps open + maturity=null → idea (fallback)', () => {
    const snap = buildSingle({ status: 'open', maturity: null });
    expect(snap.issues[0].board_column).toBe('idea');
  });

  it('maps unknown status → unknown and writes a stderr warning', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const snap = buildSingle({ status: 'archived', maturity: null });

    expect(snap.issues[0].board_column).toBe('unknown');
    expect(stderrSpy).toHaveBeenCalledOnce();
    const message = stderrSpy.mock.calls[0][0] as string;
    expect(message).toContain('"archived"');
    expect(message).toContain('unknown');
  });

  it('does not write to stderr for known statuses', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    for (const status of ['open', 'closed', 'in_progress', 'deferred']) {
      buildSingle({ status });
    }
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// buildSnapshot — top-level Snapshot structure
// ---------------------------------------------------------------------------

describe('buildSnapshot — snapshot structure', () => {
  it('propagates project_id', () => {
    const startTime = Date.now();
    const snap = buildSnapshot('my-project', [], [], SOURCE, startTime);
    expect(snap.project_id).toBe('my-project');
  });

  it('generated_at is a valid ISO 8601 string', () => {
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, [], [], SOURCE, startTime);
    expect(() => new Date(snap.generated_at)).not.toThrow();
    expect(new Date(snap.generated_at).toISOString()).toBe(snap.generated_at);
  });

  it('stale_after is approximately 60 seconds after generated_at', () => {
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, [], [], SOURCE, startTime);
    const generatedAt = new Date(snap.generated_at).getTime();
    const staleAfter = new Date(snap.stale_after).getTime();
    const diffMs = staleAfter - generatedAt;
    // Allow a small tolerance for execution time (±500 ms)
    expect(diffMs).toBeGreaterThanOrEqual(59_500);
    expect(diffMs).toBeLessThanOrEqual(60_500);
  });

  it('stale_after is a valid ISO 8601 string', () => {
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, [], [], SOURCE, startTime);
    expect(new Date(snap.stale_after).toISOString()).toBe(snap.stale_after);
  });

  it('_meta.schema_version is 1', () => {
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, [], [], SOURCE, startTime);
    expect(snap._meta.schema_version).toBe(1);
  });

  it('_meta.source matches the input source (dolt_sql)', () => {
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, [], [], 'dolt_sql', startTime);
    expect(snap._meta.source).toBe('dolt_sql');
  });

  it('_meta.source matches the input source (dolt_server)', () => {
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, [], [], 'dolt_server', startTime);
    expect(snap._meta.source).toBe('dolt_server');
  });

  it('_meta.refresh_duration_ms is a non-negative number', () => {
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, [], [], SOURCE, startTime);
    expect(snap._meta.refresh_duration_ms).toBeGreaterThanOrEqual(0);
    expect(typeof snap._meta.refresh_duration_ms).toBe('number');
  });

  it('_meta.refresh_duration_ms reflects elapsed time since startTime', () => {
    // Use a startTime well in the past so duration is measurable
    const startTime = Date.now() - 100;
    const snap = buildSnapshot(PROJECT, [], [], SOURCE, startTime);
    expect(snap._meta.refresh_duration_ms).toBeGreaterThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// buildSnapshot — dependency counting
// ---------------------------------------------------------------------------

describe('buildSnapshot — dependency counting', () => {
  it('counts 2 dependencies for an issue that depends on 2 others', () => {
    const issues = [
      makeRow({ id: 'a' }),
      makeRow({ id: 'dep-x' }),
      makeRow({ id: 'dep-y' }),
    ];
    const deps: DoltDepRow[] = [
      makeDep({ issue_id: 'a', depends_on_id: 'dep-x' }),
      makeDep({ issue_id: 'a', depends_on_id: 'dep-y' }),
    ];
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, issues, deps, SOURCE, startTime);
    const issue = snap.issues.find((i) => i.id === 'a')!;
    expect(issue.dependency_count).toBe(2);
  });

  it('counts 3 dependents for an issue that 3 others depend on', () => {
    const issues = [
      makeRow({ id: 'blocker' }),
      makeRow({ id: 'child-1' }),
      makeRow({ id: 'child-2' }),
      makeRow({ id: 'child-3' }),
    ];
    const deps: DoltDepRow[] = [
      makeDep({ issue_id: 'child-1', depends_on_id: 'blocker' }),
      makeDep({ issue_id: 'child-2', depends_on_id: 'blocker' }),
      makeDep({ issue_id: 'child-3', depends_on_id: 'blocker' }),
    ];
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, issues, deps, SOURCE, startTime);
    const blocker = snap.issues.find((i) => i.id === 'blocker')!;
    expect(blocker.dependent_count).toBe(3);
  });

  it('sets both counts to 0 for an issue with no deps', () => {
    const issues = [makeRow({ id: 'solo' })];
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, issues, [], SOURCE, startTime);
    const issue = snap.issues[0];
    expect(issue.dependency_count).toBe(0);
    expect(issue.dependent_count).toBe(0);
  });

  it('tracks dependency_count and dependent_count independently per issue', () => {
    // 'middle' depends on 'upstream' and is depended on by 'downstream'
    const issues = [
      makeRow({ id: 'upstream' }),
      makeRow({ id: 'middle' }),
      makeRow({ id: 'downstream' }),
    ];
    const deps: DoltDepRow[] = [
      makeDep({ issue_id: 'middle', depends_on_id: 'upstream' }),
      makeDep({ issue_id: 'downstream', depends_on_id: 'middle' }),
    ];
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, issues, deps, SOURCE, startTime);
    const middle = snap.issues.find((i) => i.id === 'middle')!;
    expect(middle.dependency_count).toBe(1);
    expect(middle.dependent_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildSnapshot — labels CSV parsing
// ---------------------------------------------------------------------------

describe('buildSnapshot — labels CSV parsing', () => {
  it("parses 'idea,feature' into ['idea', 'feature']", () => {
    const snap = buildSingle({ labels_csv: 'idea,feature' });
    expect(snap.issues[0].labels).toEqual(['idea', 'feature']);
  });

  it('returns [] for null labels_csv', () => {
    const snap = buildSingle({ labels_csv: null });
    expect(snap.issues[0].labels).toEqual([]);
  });

  it('returns [] for empty string labels_csv', () => {
    const snap = buildSingle({ labels_csv: '' });
    expect(snap.issues[0].labels).toEqual([]);
  });

  it('parses a single label into a one-element array', () => {
    const snap = buildSingle({ labels_csv: 'bug' });
    expect(snap.issues[0].labels).toEqual(['bug']);
  });

  it('preserves label order as-is from the CSV', () => {
    const snap = buildSingle({ labels_csv: 'z-label,a-label,m-label' });
    expect(snap.issues[0].labels).toEqual(['z-label', 'a-label', 'm-label']);
  });
});

// ---------------------------------------------------------------------------
// buildSnapshot — summary_line format
// ---------------------------------------------------------------------------

describe('buildSnapshot — summary_line format', () => {
  it("follows the format '{id} {title} [{board_column}]'", () => {
    const snap = buildSingle({ id: 'abc-123', title: 'My Feature', status: 'open', maturity: 'ready' });
    expect(snap.issues[0].summary_line).toBe('abc-123 My Feature [ready]');
  });

  it('reflects the derived board_column in the summary line', () => {
    const snap = buildSingle({ id: 'xyz-9', title: 'A closed issue', status: 'closed' });
    expect(snap.issues[0].summary_line).toBe('xyz-9 A closed issue [done]');
  });

  it('includes "unknown" in the summary line for an unknown status', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const snap = buildSingle({ id: 'ghost-1', title: 'Ghost Issue', status: 'archived' });
    expect(snap.issues[0].summary_line).toBe('ghost-1 Ghost Issue [unknown]');
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// buildSnapshot — columns_summary aggregation
// ---------------------------------------------------------------------------

describe('buildSnapshot — columns_summary aggregation', () => {
  it('counts issues across multiple columns correctly', () => {
    const issues = [
      makeRow({ id: '1', status: 'open', maturity: 'idea' }),
      makeRow({ id: '2', status: 'open', maturity: 'idea' }),
      makeRow({ id: '3', status: 'open', maturity: 'refined' }),
      makeRow({ id: '4', status: 'open', maturity: 'ready' }),
      makeRow({ id: '5', status: 'in_progress' }),
      makeRow({ id: '6', status: 'closed' }),
      makeRow({ id: '7', status: 'deferred' }),
    ];
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, issues, [], SOURCE, startTime);
    expect(snap.columns_summary.idea).toBe(2);
    expect(snap.columns_summary.refined).toBe(1);
    expect(snap.columns_summary.ready).toBe(1);
    expect(snap.columns_summary.in_progress).toBe(1);
    expect(snap.columns_summary.done).toBe(1);
    expect(snap.columns_summary.deferred).toBe(1);
  });

  it('includes "unknown" column in columns_summary when unknown statuses exist', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const issues = [
      makeRow({ id: '1', status: 'archived' }),
      makeRow({ id: '2', status: 'archived' }),
    ];
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, issues, [], SOURCE, startTime);
    expect(snap.columns_summary['unknown']).toBe(2);
    vi.restoreAllMocks();
  });

  it('returns zero for columns with no issues', () => {
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, [], [], SOURCE, startTime);
    expect(snap.columns_summary.idea).toBe(0);
    expect(snap.columns_summary.refined).toBe(0);
    expect(snap.columns_summary.ready).toBe(0);
    expect(snap.columns_summary.in_progress).toBe(0);
    expect(snap.columns_summary.done).toBe(0);
    expect(snap.columns_summary.deferred).toBe(0);
  });

  it('handles a single issue contributing to the correct column', () => {
    const snap = buildSingle({ status: 'open', maturity: 'refined' });
    expect(snap.columns_summary.refined).toBe(1);
    expect(snap.columns_summary.idea).toBe(0);
    expect(snap.columns_summary.ready).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildSnapshot — priority and issue_type defaults
// ---------------------------------------------------------------------------

describe('buildSnapshot — priority and issue_type defaults', () => {
  it('defaults null priority to 4', () => {
    const snap = buildSingle({ priority: null as unknown as number });
    expect(snap.issues[0].priority).toBe(4);
  });

  it('defaults null issue_type to "task"', () => {
    const snap = buildSingle({ issue_type: null as unknown as string });
    expect(snap.issues[0].issue_type).toBe('task');
  });

  it('preserves a provided priority when not null', () => {
    const snap = buildSingle({ priority: 1 });
    expect(snap.issues[0].priority).toBe(1);
  });

  it('preserves a provided issue_type when not null', () => {
    const snap = buildSingle({ issue_type: 'bug' });
    expect(snap.issues[0].issue_type).toBe('bug');
  });
});

// ---------------------------------------------------------------------------
// buildSnapshot — field passthrough
// ---------------------------------------------------------------------------

describe('buildSnapshot — field passthrough', () => {
  it('passes id, title, status directly from the row', () => {
    const snap = buildSingle({ id: 'abc', title: 'Hello', status: 'in_progress' });
    const issue = snap.issues[0];
    expect(issue.id).toBe('abc');
    expect(issue.title).toBe('Hello');
    expect(issue.status).toBe('in_progress');
  });

  it('passes assignee as-is (null)', () => {
    const snap = buildSingle({ assignee: null });
    expect(snap.issues[0].assignee).toBeNull();
  });

  it('passes assignee as-is (string)', () => {
    const snap = buildSingle({ assignee: 'alice' });
    expect(snap.issues[0].assignee).toBe('alice');
  });

  it('passes created_at, updated_at, closed_at through', () => {
    const snap = buildSingle({
      created_at: '2025-03-01',
      updated_at: '2025-04-01',
      closed_at: '2025-04-10',
    });
    const issue = snap.issues[0];
    expect(issue.created_at).toBe('2025-03-01');
    expect(issue.updated_at).toBe('2025-04-01');
    expect(issue.closed_at).toBe('2025-04-10');
  });

  it('passes closed_at as null when not closed', () => {
    const snap = buildSingle({ closed_at: null });
    expect(snap.issues[0].closed_at).toBeNull();
  });

  it('preserves the order of issues as given', () => {
    const issues = [
      makeRow({ id: 'first' }),
      makeRow({ id: 'second' }),
      makeRow({ id: 'third' }),
    ];
    const startTime = Date.now();
    const snap = buildSnapshot(PROJECT, issues, [], SOURCE, startTime);
    expect(snap.issues.map((i) => i.id)).toEqual(['first', 'second', 'third']);
  });
});
