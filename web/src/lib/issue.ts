import { SnapshotIssueSchema, type SnapshotIssue } from '@shared/snapshot-schema';

export type IssueErrorCode =
  | 'ISSUE_NOT_FOUND'
  | 'SNAPSHOT_NOT_FOUND'
  | 'SNAPSHOT_CORRUPT'
  | 'SNAPSHOT_READ_ERROR'
  | 'MISSING_PROJECT_ID'
  | 'SCHEMA_INVALID'
  | 'UNKNOWN_ERROR';

export class IssueError extends Error {
  readonly code: IssueErrorCode;
  readonly projectId?: string;
  readonly issueId?: string;

  constructor(code: IssueErrorCode, message: string, projectId?: string, issueId?: string) {
    super(message);
    this.name = 'IssueError';
    this.code = code;
    this.projectId = projectId;
    this.issueId = issueId;
  }
}

interface ApiErrorBody {
  error: IssueErrorCode;
  message: string;
  projectId?: string;
}

export async function fetchIssue(projectId: string, issueId: string): Promise<SnapshotIssue> {
  const url = `/api/issue/${encodeURIComponent(issueId)}?projectId=${encodeURIComponent(projectId)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new IssueError(
      'UNKNOWN_ERROR',
      `Network error: ${(err as Error).message}`,
      projectId,
      issueId,
    );
  }

  if (!res.ok) {
    let body: ApiErrorBody;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      throw new IssueError(
        'UNKNOWN_ERROR',
        `HTTP ${res.status} with non-JSON body`,
        projectId,
        issueId,
      );
    }
    throw new IssueError(body.error, body.message, body.projectId ?? projectId, issueId);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    throw new IssueError(
      'SNAPSHOT_CORRUPT',
      `Response was not JSON: ${(err as Error).message}`,
      projectId,
      issueId,
    );
  }

  const parsed = SnapshotIssueSchema.safeParse(raw);
  if (!parsed.success) {
    throw new IssueError(
      'SCHEMA_INVALID',
      `Issue schema mismatch: ${parsed.error.message}`,
      projectId,
      issueId,
    );
  }
  return parsed.data;
}
