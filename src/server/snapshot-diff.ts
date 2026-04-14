import type { Snapshot, SnapshotIssue } from '../types.js';

/**
 * Hashes an issue by stringifying its entries in key-sorted order. Callers
 * populate arrays (labels, dependency_ids, dependent_ids) in a deterministic
 * order, so string equality is sufficient for structural comparison.
 */
function issueHash(issue: SnapshotIssue): string {
  const record = issue as unknown as Record<string, unknown>;
  const sorted = Object.keys(record).sort();
  return JSON.stringify(sorted.map((k) => [k, record[k]]));
}

/**
 * Returns the issue ids whose payload differs between two consecutive
 * snapshots. First broadcast (prev === null) emits every next-side id.
 */
export function diffSnapshotIssues(
  prev: Snapshot | null,
  next: Snapshot,
): string[] {
  if (prev === null) return next.issues.map((i) => i.id);

  const prevMap = new Map<string, string>();
  for (const i of prev.issues) prevMap.set(i.id, issueHash(i));

  const nextMap = new Map<string, string>();
  for (const i of next.issues) nextMap.set(i.id, issueHash(i));

  const changed = new Set<string>();
  for (const [id, hash] of nextMap) {
    if (prevMap.get(id) !== hash) changed.add(id);
  }
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) changed.add(id);
  }
  return Array.from(changed);
}
