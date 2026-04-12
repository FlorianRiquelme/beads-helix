import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DoltIssueRow, DoltDepRow } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Tracked temp dirs — cleaned up via cleanupTmpDirs()
// ---------------------------------------------------------------------------

const createdTmpDirs: string[] = [];

/**
 * Creates an isolated temporary directory scoped to the current test.
 * Call `cleanupTmpDirs()` in `afterEach` to remove all dirs created in the test.
 */
export function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'beads-helix-test-'));
  createdTmpDirs.push(dir);
  return dir;
}

/**
 * Removes every temporary directory created by `makeTmpDir()` in this test run.
 * Intended for use in `afterEach`.
 */
export function cleanupTmpDirs(): void {
  let path: string | undefined;
  while ((path = createdTmpDirs.pop()) !== undefined) {
    rmSync(path, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// DoltIssueRow factory
// ---------------------------------------------------------------------------

const ISSUE_DEFAULTS: DoltIssueRow = {
  id: 'issue-001',
  title: 'Default test issue',
  status: 'open',
  priority: 3,
  issue_type: 'story',
  assignee: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  closed_at: null,
  maturity: 'idea',
  labels_csv: null,
};

/**
 * Returns a `DoltIssueRow` populated with sensible defaults.
 * Any field in `overrides` replaces the corresponding default.
 */
export function makeDoltIssueRow(overrides: Partial<DoltIssueRow> = {}): DoltIssueRow {
  return { ...ISSUE_DEFAULTS, ...overrides };
}

// ---------------------------------------------------------------------------
// DoltDepRow factory
// ---------------------------------------------------------------------------

const DEP_DEFAULTS: DoltDepRow = {
  issue_id: 'issue-001',
  depends_on_id: 'issue-000',
  type: 'blocks',
  depends_on_status: 'open',
};

/**
 * Returns a `DoltDepRow` populated with sensible defaults.
 * Any field in `overrides` replaces the corresponding default.
 */
export function makeDoltDepRow(overrides: Partial<DoltDepRow> = {}): DoltDepRow {
  return { ...DEP_DEFAULTS, ...overrides };
}
