import { describe, expect, it } from 'vitest';
import type { SnapshotIssue } from '@shared/snapshot-schema';
import { buildDependencyWeather, buildGhostingSet, stepHighlight } from './relationships';

function makeIssue(overrides: Partial<SnapshotIssue> = {}): SnapshotIssue {
  return {
    id: 'test-001',
    title: 'Test issue',
    status: 'open',
    labels: ['idea'],
    priority: 2,
    issue_type: 'task',
    assignee: null,
    board_column: 'idea',
    summary_line: '',
    dependency_count: 0,
    dependent_count: 0,
    created_at: '2026-04-14T00:00:00.000Z',
    updated_at: '2026-04-14T00:00:00.000Z',
    closed_at: null,
    description: null,
    notes: null,
    design: null,
    dependency_ids: [],
    dependent_ids: [],
    ...overrides,
  };
}

describe('buildDependencyWeather', () => {
  it('returns empty rails when no deps or dependents', () => {
    const issue = makeIssue();
    const weather = buildDependencyWeather(issue, [issue]);
    expect(weather.openBlockers).toEqual([]);
    expect(weather.closedDeps).toEqual([]);
    expect(weather.openDependents).toEqual([]);
  });

  it('places open dependencies in openBlockers rail', () => {
    const dep = makeIssue({ id: 'dep-1', title: 'Blocker', status: 'open' });
    const issue = makeIssue({ id: 'main', dependency_ids: ['dep-1'] });
    const weather = buildDependencyWeather(issue, [issue, dep]);
    expect(weather.openBlockers).toHaveLength(1);
    expect(weather.openBlockers[0].id).toBe('dep-1');
    expect(weather.openBlockers[0].title).toBe('Blocker');
  });

  it('places closed dependencies in closedDeps rail with notes', () => {
    const dep = makeIssue({
      id: 'dep-2',
      title: 'Done dep',
      status: 'closed',
      closed_at: '2026-04-13T00:00:00.000Z',
      notes: 'Findings from research',
    });
    const issue = makeIssue({ id: 'main', dependency_ids: ['dep-2'] });
    const weather = buildDependencyWeather(issue, [issue, dep]);
    expect(weather.closedDeps).toHaveLength(1);
    expect(weather.closedDeps[0].id).toBe('dep-2');
    expect(weather.closedDeps[0].notes).toBe('Findings from research');
  });

  it('places open dependents in openDependents rail with labels', () => {
    const dependent = makeIssue({
      id: 'child-1',
      title: 'Downstream',
      status: 'open',
      labels: ['refined'],
    });
    const issue = makeIssue({ id: 'main', dependent_ids: ['child-1'] });
    const weather = buildDependencyWeather(issue, [issue, dependent]);
    expect(weather.openDependents).toHaveLength(1);
    expect(weather.openDependents[0].id).toBe('child-1');
    expect(weather.openDependents[0].labels).toEqual(['refined']);
  });

  it('splits multiple dependencies into open and closed rails', () => {
    const openDep = makeIssue({ id: 'd-open', status: 'open' });
    const closedDep = makeIssue({ id: 'd-closed', status: 'closed', closed_at: '2026-04-10T00:00:00.000Z' });
    const issue = makeIssue({ id: 'main', dependency_ids: ['d-open', 'd-closed'] });
    const weather = buildDependencyWeather(issue, [issue, openDep, closedDep]);
    expect(weather.openBlockers).toHaveLength(1);
    expect(weather.closedDeps).toHaveLength(1);
  });

  it('ignores dependency_ids that do not resolve to any issue in the snapshot', () => {
    const issue = makeIssue({ id: 'main', dependency_ids: ['ghost-id'] });
    const weather = buildDependencyWeather(issue, [issue]);
    expect(weather.openBlockers).toEqual([]);
    expect(weather.closedDeps).toEqual([]);
  });
});

describe('buildGhostingSet', () => {
  it('includes self in highlightIds', () => {
    const issue = makeIssue({ id: 'self' });
    const set = buildGhostingSet(issue, [issue]);
    expect(set.selfId).toBe('self');
    expect(set.highlightIds).toContain('self');
  });

  it('includes dependency ids in highlightIds', () => {
    const dep = makeIssue({ id: 'dep-1' });
    const issue = makeIssue({ id: 'self', dependency_ids: ['dep-1'] });
    const set = buildGhostingSet(issue, [issue, dep]);
    expect(set.highlightIds).toContain('dep-1');
  });

  it('includes dependent ids in highlightIds', () => {
    const dependent = makeIssue({ id: 'child-1' });
    const issue = makeIssue({ id: 'self', dependent_ids: ['child-1'] });
    const set = buildGhostingSet(issue, [issue, dependent]);
    expect(set.highlightIds).toContain('child-1');
  });

  it('only includes ids that exist in the snapshot', () => {
    const issue = makeIssue({ id: 'self', dependency_ids: ['ghost'], dependent_ids: ['phantom'] });
    const set = buildGhostingSet(issue, [issue]);
    expect(set.highlightIds).toEqual(['self']);
  });

  it('deduplicates ids', () => {
    const shared = makeIssue({ id: 'shared' });
    const issue = makeIssue({ id: 'self', dependency_ids: ['shared'], dependent_ids: ['shared'] });
    const set = buildGhostingSet(issue, [issue, shared]);
    const sharedCount = set.highlightIds.filter((id) => id === 'shared').length;
    expect(sharedCount).toBe(1);
  });
});

describe('stepHighlight', () => {
  const ids = ['a', 'b', 'c'];

  it('returns next id in the list', () => {
    expect(stepHighlight(ids, 'a', 'next')).toBe('b');
  });

  it('wraps around forward', () => {
    expect(stepHighlight(ids, 'c', 'next')).toBe('a');
  });

  it('returns prev id in the list', () => {
    expect(stepHighlight(ids, 'b', 'prev')).toBe('a');
  });

  it('wraps around backward', () => {
    expect(stepHighlight(ids, 'a', 'prev')).toBe('c');
  });

  it('returns first id when currentId is not in list', () => {
    expect(stepHighlight(ids, 'z', 'next')).toBe('a');
  });

  it('returns null for empty list', () => {
    expect(stepHighlight([], 'a', 'next')).toBeNull();
  });
});
