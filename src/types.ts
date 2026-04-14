export interface SnapshotIssue {
  id: string;
  title: string;
  status: string;
  labels: string[];
  priority: number;
  issue_type: string;
  assignee: string | null;
  board_column: string;
  summary_line: string;
  dependency_count: number;
  dependent_count: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  description: string | null;
  notes: string | null;
  design: string | null;
  dependency_ids: string[];
  dependent_ids: string[];
}

export interface ColumnsSummary {
  idea: number;
  refined: number;
  ready: number;
  in_progress: number;
  done: number;
  deferred: number;
  [key: string]: number; // for 'unknown' or future columns
}

export interface SnapshotMeta {
  source: 'dolt_server' | 'dolt_sql';
  refresh_duration_ms: number;
  schema_version: number;
}

export interface Snapshot {
  project_id: string;
  generated_at: string;
  stale_after: string;
  columns_summary: ColumnsSummary;
  issues: SnapshotIssue[];
  _meta: SnapshotMeta;
}

export type RefreshResult =
  | { status: 'refreshed' | 'noop' | 'busy'; snapshot_path: string; source?: 'dolt_server' | 'dolt_sql' }
  | { status: 'error'; code: 'NOT_BEADS_REPO' | 'SOURCE_UNAVAILABLE'; snapshot_path: string; message: string };

export interface DoltIssueRow {
  id: string;
  title: string;
  status: string;
  priority: number;
  issue_type: string;
  assignee: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  maturity: string | null;
  labels_csv: string | null;
  description: string | null;
  notes: string | null;
  design: string | null;
}

export interface DoltDepRow {
  issue_id: string;
  depends_on_id: string;
  type: string;
  depends_on_status: string;
}
