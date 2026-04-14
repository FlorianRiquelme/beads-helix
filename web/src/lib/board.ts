import type { SnapshotIssue } from '@shared/snapshot-schema';

export type MaturityColumn = 'idea' | 'refined' | 'ready';

export interface BoardBuckets {
  idea: SnapshotIssue[];
  refined: SnapshotIssue[];
  ready: SnapshotIssue[];
}

export interface FilterCriteria {
  priority?: number | 'all';
  q?: string;
}

export const MATURITY_COLUMNS: readonly MaturityColumn[] = ['idea', 'refined', 'ready'] as const;

export function shortId(fullId: string): string {
  const idx = fullId.lastIndexOf('-');
  if (idx === -1) return fullId;
  return fullId.slice(idx + 1);
}

export function priorityLabel(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 4) return 'P4';
  return `P${n}`;
}

const PRIORITY_CHIP_CLASSES: Record<number, string> = {
  0: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
  1: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30',
  2: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
  3: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  4: 'bg-neutral-500/15 text-neutral-400 ring-1 ring-neutral-500/30',
};

export function priorityChipClass(n: number): string {
  return PRIORITY_CHIP_CLASSES[n] ?? PRIORITY_CHIP_CLASSES[4];
}

export function depHint(opts: {
  dependency_count: number;
  dependent_count: number;
}): string {
  return `${opts.dependency_count}↓ ${opts.dependent_count}↑`;
}

export function bucketIssues(issues: readonly SnapshotIssue[]): BoardBuckets {
  const buckets: BoardBuckets = { idea: [], refined: [], ready: [] };
  for (const issue of issues) {
    if (issue.board_column === 'idea') buckets.idea.push(issue);
    else if (issue.board_column === 'refined') buckets.refined.push(issue);
    else if (issue.board_column === 'ready') buckets.ready.push(issue);
  }
  return buckets;
}

export function sortByPriorityThenUpdated(
  issues: readonly SnapshotIssue[],
): SnapshotIssue[] {
  return [...issues].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.updated_at.localeCompare(a.updated_at);
  });
}

export function filterIssues(
  issues: readonly SnapshotIssue[],
  criteria: FilterCriteria,
): SnapshotIssue[] {
  const priority = criteria.priority;
  const rawQ = criteria.q ?? '';
  const q = rawQ.trim().toLowerCase();
  return issues.filter((issue) => {
    if (priority !== undefined && priority !== 'all' && issue.priority !== priority) {
      return false;
    }
    if (q.length > 0) {
      const haystack = `${issue.title} ${issue.id}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function findInProgress(
  issues: readonly SnapshotIssue[],
): SnapshotIssue | null {
  return issues.find((i) => i.status === 'in_progress') ?? null;
}

export function findLastTouched(
  issues: readonly SnapshotIssue[],
): SnapshotIssue | null {
  if (issues.length === 0) return null;
  let best = issues[0];
  for (const issue of issues) {
    if (issue.updated_at > best.updated_at) best = issue;
  }
  return best;
}

export function copyToClipboard(text: string): Promise<void> {
  if (!navigator?.clipboard?.writeText) {
    return Promise.reject(new Error('clipboard unavailable'));
  }
  return navigator.clipboard.writeText(text);
}
