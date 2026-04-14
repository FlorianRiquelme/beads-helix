import { SnapshotSchema, type Snapshot } from '@shared/snapshot-schema';

export type SnapshotErrorCode =
  | 'SNAPSHOT_NOT_FOUND'
  | 'SNAPSHOT_CORRUPT'
  | 'SNAPSHOT_READ_ERROR'
  | 'MISSING_PROJECT_ID'
  | 'SCHEMA_INVALID'
  | 'UNKNOWN_ERROR';

export class SnapshotError extends Error {
  readonly code: SnapshotErrorCode;
  readonly projectId?: string;

  constructor(code: SnapshotErrorCode, message: string, projectId?: string) {
    super(message);
    this.name = 'SnapshotError';
    this.code = code;
    this.projectId = projectId;
  }
}

interface ApiErrorBody {
  error: SnapshotErrorCode;
  message: string;
  projectId?: string;
}

export async function fetchSnapshot(projectId: string): Promise<Snapshot> {
  let res: Response;
  try {
    res = await fetch(`/api/snapshot?projectId=${encodeURIComponent(projectId)}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    throw new SnapshotError(
      'UNKNOWN_ERROR',
      `Network error: ${(err as Error).message}`,
      projectId,
    );
  }

  if (!res.ok) {
    let body: ApiErrorBody;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      throw new SnapshotError(
        'UNKNOWN_ERROR',
        `HTTP ${res.status} with non-JSON body`,
        projectId,
      );
    }
    throw new SnapshotError(body.error, body.message, body.projectId ?? projectId);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    throw new SnapshotError(
      'SNAPSHOT_CORRUPT',
      `Response was not JSON: ${(err as Error).message}`,
      projectId,
    );
  }

  const parsed = SnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SnapshotError(
      'SCHEMA_INVALID',
      `Snapshot schema mismatch: ${parsed.error.message}`,
      projectId,
    );
  }
  return parsed.data;
}
