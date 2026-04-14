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
  // Pre-compute dependency id lists (sorted for stable diffing)
  const dependencyIds = new Map<string, string[]>();
  const dependentIds = new Map<string, string[]>();

  for (const dep of deps) {
    if (!dependencyIds.has(dep.issue_id)) dependencyIds.set(dep.issue_id, []);
    dependencyIds.get(dep.issue_id)!.push(dep.depends_on_id);
    if (!dependentIds.has(dep.depends_on_id)) dependentIds.set(dep.depends_on_id, []);
    dependentIds.get(dep.depends_on_id)!.push(dep.issue_id);
  }
  for (const list of dependencyIds.values()) list.sort();
  for (const list of dependentIds.values()) list.sort();

  // Build enriched issues
  const enriched: SnapshotIssue[] = issues.map((row) => {
    const boardColumn = deriveColumn(row.status, row.maturity);
    const labels = row.labels_csv ? row.labels_csv.split(',') : [];
    const deps = dependencyIds.get(row.id) ?? [];
    const dependents = dependentIds.get(row.id) ?? [];

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
      dependency_count: deps.length,
      dependent_count: dependents.length,
      created_at: row.created_at,
      updated_at: row.updated_at,
      closed_at: row.closed_at ?? null,
      description: row.description ?? null,
      notes: row.notes ?? null,
      design: row.design ?? null,
      dependency_ids: deps,
      dependent_ids: dependents,
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
    schema_version: 2,
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
