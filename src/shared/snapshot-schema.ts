import { z } from 'zod';

export const BoardColumnSchema = z.enum([
  'idea',
  'refined',
  'ready',
  'in_progress',
  'done',
  'deferred',
  'unknown',
]);
export type BoardColumn = z.infer<typeof BoardColumnSchema>;

export const SnapshotIssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  labels: z.array(z.string()),
  priority: z.number(),
  issue_type: z.string(),
  assignee: z.string().nullable(),
  board_column: z.string(),
  summary_line: z.string(),
  dependency_count: z.number(),
  dependent_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  design: z.string().nullable(),
  dependency_ids: z.array(z.string()),
  dependent_ids: z.array(z.string()),
});
export type SnapshotIssue = z.infer<typeof SnapshotIssueSchema>;

export const ColumnsSummarySchema = z
  .object({
    idea: z.number().default(0),
    refined: z.number().default(0),
    ready: z.number().default(0),
    in_progress: z.number().default(0),
    done: z.number().default(0),
    deferred: z.number().default(0),
  })
  .catchall(z.number());
export type ColumnsSummary = z.infer<typeof ColumnsSummarySchema>;

export const SnapshotMetaSchema = z.object({
  source: z.enum(['dolt_server', 'dolt_sql']),
  refresh_duration_ms: z.number(),
  schema_version: z.number().int().min(2),
});
export type SnapshotMeta = z.infer<typeof SnapshotMetaSchema>;

export const SnapshotSchema = z.object({
  project_id: z.string(),
  generated_at: z.string(),
  stale_after: z.string(),
  columns_summary: ColumnsSummarySchema,
  issues: z.array(SnapshotIssueSchema),
  _meta: SnapshotMetaSchema,
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
