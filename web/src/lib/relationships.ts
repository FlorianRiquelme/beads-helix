import type { SnapshotIssue } from '@shared/snapshot-schema';

export interface DependencyRail {
  id: string;
  title: string;
  status: string;
  labels: string[];
  notes: string | null;
}

export interface DependencyWeather {
  openBlockers: DependencyRail[];
  closedDeps: DependencyRail[];
  openDependents: DependencyRail[];
}

function toRail(issue: SnapshotIssue): DependencyRail {
  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    labels: issue.labels,
    notes: issue.notes,
  };
}

export function buildDependencyWeather(
  issue: SnapshotIssue,
  allIssues: readonly SnapshotIssue[],
): DependencyWeather {
  const index = new Map(allIssues.map((i) => [i.id, i]));

  const openBlockers: DependencyRail[] = [];
  const closedDeps: DependencyRail[] = [];
  for (const depId of issue.dependency_ids) {
    const dep = index.get(depId);
    if (!dep) continue;
    if (dep.status === 'closed') closedDeps.push(toRail(dep));
    else openBlockers.push(toRail(dep));
  }

  const openDependents: DependencyRail[] = [];
  for (const childId of issue.dependent_ids) {
    const child = index.get(childId);
    if (!child) continue;
    if (child.status !== 'closed') openDependents.push(toRail(child));
  }

  return { openBlockers, closedDeps, openDependents };
}

export interface GhostingSet {
  selfId: string;
  highlightIds: string[];
}

export function buildGhostingSet(
  issue: SnapshotIssue,
  allIssues: readonly SnapshotIssue[],
): GhostingSet {
  const existingIds = new Set(allIssues.map((i) => i.id));
  const ids = new Set<string>();

  ids.add(issue.id);
  for (const depId of issue.dependency_ids) {
    if (existingIds.has(depId)) ids.add(depId);
  }
  for (const childId of issue.dependent_ids) {
    if (existingIds.has(childId)) ids.add(childId);
  }

  return { selfId: issue.id, highlightIds: [...ids] };
}

export function stepHighlight(
  highlightIds: readonly string[],
  currentId: string,
  direction: 'next' | 'prev',
): string | null {
  if (highlightIds.length === 0) return null;
  const idx = highlightIds.indexOf(currentId);
  if (idx === -1) return highlightIds[0];
  if (direction === 'next') return highlightIds[(idx + 1) % highlightIds.length];
  return highlightIds[(idx - 1 + highlightIds.length) % highlightIds.length];
}
