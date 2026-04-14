import { describe, expect, it } from 'vitest';
import { diffSnapshotIssues } from '../../src/server/snapshot-diff.js';
import type { Snapshot, SnapshotIssue } from '../../src/types.js';

/**
 * Phase 1 (beads-helix-8ua) — selective invalidation depends on a pure diff
 * between consecutive snapshots. First-broadcast emits every id; thereafter
 * only added/removed/mutated ids appear.
 */

function issue(over: Partial<SnapshotIssue> = {}): SnapshotIssue {
  return {
    id: 'p-1',
    title: 'Issue one',
    status: 'open',
    labels: ['idea'],
    priority: 2,
    issue_type: 'task',
    assignee: null,
    board_column: 'idea',
    summary_line: 'p-1 Issue one [idea]',
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
    ...over,
  };
}

function snapshot(issues: SnapshotIssue[]): Snapshot {
  return {
    project_id: 'p',
    generated_at: '2026-04-14T00:00:00.000Z',
    stale_after: '2026-04-14T00:01:00.000Z',
    columns_summary: {
      idea: issues.length,
      refined: 0,
      ready: 0,
      in_progress: 0,
      done: 0,
      deferred: 0,
    },
    issues,
    _meta: { source: 'dolt_sql', refresh_duration_ms: 10, schema_version: 2 },
  };
}

describe('diffSnapshotIssues', () => {
  it('returns every issue id when prev is null (first broadcast)', () => {
    const next = snapshot([issue({ id: 'a' }), issue({ id: 'b' })]);
    expect(diffSnapshotIssues(null, next).sort()).toEqual(['a', 'b']);
  });

  it('returns empty array when snapshots are structurally identical', () => {
    const prev = snapshot([issue({ id: 'a' }), issue({ id: 'b' })]);
    const next = snapshot([issue({ id: 'a' }), issue({ id: 'b' })]);
    expect(diffSnapshotIssues(prev, next)).toEqual([]);
  });

  it('includes ids that were added', () => {
    const prev = snapshot([issue({ id: 'a' })]);
    const next = snapshot([issue({ id: 'a' }), issue({ id: 'b' })]);
    expect(diffSnapshotIssues(prev, next)).toEqual(['b']);
  });

  it('includes ids that were removed', () => {
    const prev = snapshot([issue({ id: 'a' }), issue({ id: 'b' })]);
    const next = snapshot([issue({ id: 'a' })]);
    expect(diffSnapshotIssues(prev, next)).toEqual(['b']);
  });

  it('includes ids whose fields mutated', () => {
    const prev = snapshot([issue({ id: 'a', title: 'old' })]);
    const next = snapshot([issue({ id: 'a', title: 'new' })]);
    expect(diffSnapshotIssues(prev, next)).toEqual(['a']);
  });

  it('detects mutation in the new detail fields', () => {
    const prev = snapshot([issue({ id: 'a', description: null })]);
    const next = snapshot([issue({ id: 'a', description: 'updated' })]);
    expect(diffSnapshotIssues(prev, next)).toEqual(['a']);
  });

  it('detects mutation in dependency_ids even when the count is unchanged', () => {
    const prev = snapshot([issue({ id: 'a', dependency_ids: ['x'] })]);
    const next = snapshot([issue({ id: 'a', dependency_ids: ['y'] })]);
    expect(diffSnapshotIssues(prev, next)).toEqual(['a']);
  });

  it('combines adds, removes, and mutations into one id list', () => {
    const prev = snapshot([issue({ id: 'a' }), issue({ id: 'b', title: 'old' })]);
    const next = snapshot([issue({ id: 'b', title: 'new' }), issue({ id: 'c' })]);
    expect(diffSnapshotIssues(prev, next).sort()).toEqual(['a', 'b', 'c']);
  });
});
