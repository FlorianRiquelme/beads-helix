import type { DoltIssueRow, DoltDepRow, SnapshotIssue, ColumnsSummary, Snapshot, SnapshotMeta } from './types.js';
import type { DoltSource } from './dolt.js';

const KNOWN_STATUSES = new Set(['open', 'in_progress', 'closed', 'deferred']);

const STATUS_TO_COLUMN: Record<string, string> = {
  closed: 'done',
  in_progress: 'in_progress',
  deferred: 'deferred',
};

function deriveColumn(status: string, maturity: string | null): string {
  if (STATUS_TO_COLUMN[status]) return STATUS_TO_COLUMN[status];

  if (!KNOWN_STATUSES.has(status)) {
    process.stderr.write(`helix-snapshot: unknown status "${status}", assigning board_column "unknown"\n`);
    return 'unknown';
  }

  // Open status: use maturity label
  return maturity ?? 'idea';
}

export function buildSnapshot(
  projectId: string,
  issues: DoltIssueRow[],
  deps: DoltDepRow[],
  source: DoltSource,
  startTime: number,
): Snapshot {
  // Pre-compute dependency counts
  const depCount = new Map<string, number>();
  const dependentCount = new Map<string, number>();

  for (const dep of deps) {
    depCount.set(dep.issue_id, (depCount.get(dep.issue_id) ?? 0) + 1);
    dependentCount.set(dep.depends_on_id, (dependentCount.get(dep.depends_on_id) ?? 0) + 1);
  }

  // Build enriched issues
  const enriched: SnapshotIssue[] = issues.map((row) => {
    const boardColumn = deriveColumn(row.status, row.maturity);
    const labels = row.labels_csv ? row.labels_csv.split(',') : [];

    return {
      id: row.id,
      title: row.title,
      status: row.status,
      labels,
      priority: row.priority ?? 4,
      issue_type: row.issue_type ?? 'task',
      assignee: row.assignee ?? null,
      board_column: boardColumn,
      summary_line: `${row.id} ${row.title} [${boardColumn}]`,
      dependency_count: depCount.get(row.id) ?? 0,
      dependent_count: dependentCount.get(row.id) ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      closed_at: row.closed_at ?? null,
    };
  });

  // Compute columns summary
  const columns: ColumnsSummary = {
    idea: 0,
    refined: 0,
    ready: 0,
    in_progress: 0,
    done: 0,
    deferred: 0,
  };

  for (const issue of enriched) {
    columns[issue.board_column] = (columns[issue.board_column] ?? 0) + 1;
  }

  const now = new Date();
  const staleAfter = new Date(now.getTime() + 60_000);

  const meta: SnapshotMeta = {
    source,
    refresh_duration_ms: Date.now() - startTime,
    schema_version: 1,
  };

  return {
    project_id: projectId,
    generated_at: now.toISOString(),
    stale_after: staleAfter.toISOString(),
    columns_summary: columns,
    issues: enriched,
    _meta: meta,
  };
}
