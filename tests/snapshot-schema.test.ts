import { describe, expect, it } from 'vitest';
import {
  SnapshotIssueSchema,
  SnapshotSchema,
} from '../src/shared/snapshot-schema.js';

/**
 * Phase 1 (beads-helix-8ua) — snapshot schema must carry the full issue detail
 * so `/api/issue/:id` can slice from the same file without new Dolt reads.
 */

function baseIssue() {
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
  };
}

describe('SnapshotIssueSchema — detail fields', () => {
  it('accepts a complete issue with description/notes/design as null', () => {
    expect(() => SnapshotIssueSchema.parse(baseIssue())).not.toThrow();
  });

  it('accepts a complete issue with description/notes/design as strings', () => {
    const issue = {
      ...baseIssue(),
      description: '## problem',
      notes: 'follow-up',
      design: '```ts\nfoo()\n```',
    };
    expect(() => SnapshotIssueSchema.parse(issue)).not.toThrow();
  });

  it('rejects an issue missing the description field', () => {
    const issue = baseIssue();
    delete (issue as Record<string, unknown>).description;
    expect(SnapshotIssueSchema.safeParse(issue).success).toBe(false);
  });

  it('rejects an issue missing the notes field', () => {
    const issue = baseIssue();
    delete (issue as Record<string, unknown>).notes;
    expect(SnapshotIssueSchema.safeParse(issue).success).toBe(false);
  });

  it('rejects an issue missing the design field', () => {
    const issue = baseIssue();
    delete (issue as Record<string, unknown>).design;
    expect(SnapshotIssueSchema.safeParse(issue).success).toBe(false);
  });

  it('rejects an issue missing dependency_ids', () => {
    const issue = baseIssue();
    delete (issue as Record<string, unknown>).dependency_ids;
    expect(SnapshotIssueSchema.safeParse(issue).success).toBe(false);
  });

  it('rejects an issue missing dependent_ids', () => {
    const issue = baseIssue();
    delete (issue as Record<string, unknown>).dependent_ids;
    expect(SnapshotIssueSchema.safeParse(issue).success).toBe(false);
  });

  it('rejects non-string-array dependency_ids', () => {
    const issue = { ...baseIssue(), dependency_ids: [1, 2] };
    expect(SnapshotIssueSchema.safeParse(issue).success).toBe(false);
  });
});

describe('SnapshotSchema — _meta.schema_version', () => {
  it('rejects schema_version < 2 (phase 1 bumps to 2)', () => {
    const snap = {
      project_id: 'p',
      generated_at: '2026-04-14T00:00:00.000Z',
      stale_after: '2026-04-14T00:01:00.000Z',
      columns_summary: { idea: 1, refined: 0, ready: 0, in_progress: 0, done: 0, deferred: 0 },
      issues: [baseIssue()],
      _meta: { source: 'dolt_sql', refresh_duration_ms: 10, schema_version: 1 },
    };
    expect(SnapshotSchema.safeParse(snap).success).toBe(false);
  });

  it('accepts schema_version = 2', () => {
    const snap = {
      project_id: 'p',
      generated_at: '2026-04-14T00:00:00.000Z',
      stale_after: '2026-04-14T00:01:00.000Z',
      columns_summary: { idea: 1, refined: 0, ready: 0, in_progress: 0, done: 0, deferred: 0 },
      issues: [baseIssue()],
      _meta: { source: 'dolt_sql', refresh_duration_ms: 10, schema_version: 2 },
    };
    expect(SnapshotSchema.safeParse(snap).success).toBe(true);
  });
});
