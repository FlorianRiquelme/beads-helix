import { describe, expect, it } from 'vitest';
import type { SnapshotIssue } from '@shared/snapshot-schema';
import {
  bucketIssues,
  depHint,
  filterIssues,
  findInProgress,
  findLastTouched,
  priorityChipClass,
  priorityLabel,
  shortId,
  sortByPriorityThenUpdated,
} from './board';

const baseIssue: SnapshotIssue = {
  id: 'beads-helix-aaa',
  title: 'placeholder',
  status: 'open',
  labels: [],
  priority: 2,
  issue_type: 'task',
  assignee: null,
  board_column: 'idea',
  summary_line: '',
  dependency_count: 0,
  dependent_count: 0,
  created_at: '2026-04-10T00:00:00.000Z',
  updated_at: '2026-04-10T00:00:00.000Z',
  closed_at: null,
};

const make = (overrides: Partial<SnapshotIssue>): SnapshotIssue => ({
  ...baseIssue,
  ...overrides,
});

describe('shortId', () => {
  it('returns the segment after the final hyphen', () => {
    expect(shortId('beads-helix-vm2')).toBe('vm2');
  });
  it('returns the whole id when no hyphen present', () => {
    expect(shortId('xyz')).toBe('xyz');
  });
  it('handles ids with multiple hyphens', () => {
    expect(shortId('a-b-c-d-e')).toBe('e');
  });
  it('returns empty string when input ends with a hyphen', () => {
    expect(shortId('beads-')).toBe('');
  });
});

describe('priorityLabel', () => {
  it.each([
    [0, 'P0'],
    [1, 'P1'],
    [2, 'P2'],
    [3, 'P3'],
    [4, 'P4'],
  ])('maps %i -> %s', (n, expected) => {
    expect(priorityLabel(n)).toBe(expected);
  });
  it('clamps unknown numbers to P4', () => {
    expect(priorityLabel(99)).toBe('P4');
    expect(priorityLabel(-1)).toBe('P4');
  });
});

describe('priorityChipClass', () => {
  it('returns distinct classes per priority', () => {
    const classes = new Set([0, 1, 2, 3, 4].map(priorityChipClass));
    expect(classes.size).toBe(5);
  });
  it('always includes both background and text colour utility classes', () => {
    for (const p of [0, 1, 2, 3, 4]) {
      const cls = priorityChipClass(p);
      expect(cls).toMatch(/bg-/);
      expect(cls).toMatch(/text-/);
    }
  });
  it('uses the same class as P4 for unknown numbers', () => {
    expect(priorityChipClass(99)).toBe(priorityChipClass(4));
  });
});

describe('depHint', () => {
  it('formats counts as "<deps>↓ <dependents>↑"', () => {
    expect(depHint({ dependency_count: 2, dependent_count: 1 })).toBe('2↓ 1↑');
  });
  it('renders zero counts explicitly', () => {
    expect(depHint({ dependency_count: 0, dependent_count: 0 })).toBe('0↓ 0↑');
  });
  it('handles asymmetric counts', () => {
    expect(depHint({ dependency_count: 0, dependent_count: 5 })).toBe('0↓ 5↑');
  });
});

describe('bucketIssues', () => {
  const a = make({ id: 'beads-helix-a', board_column: 'idea' });
  const b = make({ id: 'beads-helix-b', board_column: 'refined' });
  const c = make({ id: 'beads-helix-c', board_column: 'ready' });
  const d = make({ id: 'beads-helix-d', board_column: 'in_progress' });
  const e = make({ id: 'beads-helix-e', board_column: 'done' });

  it('groups issues into idea/refined/ready columns', () => {
    const buckets = bucketIssues([a, b, c]);
    expect(buckets.idea).toEqual([a]);
    expect(buckets.refined).toEqual([b]);
    expect(buckets.ready).toEqual([c]);
  });
  it('drops issues not in the maturity pipeline', () => {
    const buckets = bucketIssues([a, b, c, d, e]);
    expect(buckets.idea).toEqual([a]);
    expect(buckets.refined).toEqual([b]);
    expect(buckets.ready).toEqual([c]);
  });
  it('returns empty arrays when no issues match a column', () => {
    const buckets = bucketIssues([d, e]);
    expect(buckets.idea).toEqual([]);
    expect(buckets.refined).toEqual([]);
    expect(buckets.ready).toEqual([]);
  });
  it('handles an empty input', () => {
    const buckets = bucketIssues([]);
    expect(buckets).toEqual({ idea: [], refined: [], ready: [] });
  });
});

describe('sortByPriorityThenUpdated', () => {
  const p0Old = make({ id: '1', priority: 0, updated_at: '2026-01-01T00:00:00.000Z' });
  const p0New = make({ id: '2', priority: 0, updated_at: '2026-04-01T00:00:00.000Z' });
  const p2Newest = make({ id: '3', priority: 2, updated_at: '2026-04-12T00:00:00.000Z' });
  const p1Mid = make({ id: '4', priority: 1, updated_at: '2026-02-01T00:00:00.000Z' });

  it('sorts P0 before P1 before P2', () => {
    const sorted = sortByPriorityThenUpdated([p2Newest, p1Mid, p0Old]);
    expect(sorted.map((i) => i.id)).toEqual(['1', '4', '3']);
  });
  it('within the same priority, most recently updated wins', () => {
    const sorted = sortByPriorityThenUpdated([p0Old, p0New]);
    expect(sorted.map((i) => i.id)).toEqual(['2', '1']);
  });
  it('does not mutate the input array', () => {
    const input = [p0Old, p0New];
    const before = input.slice();
    sortByPriorityThenUpdated(input);
    expect(input).toEqual(before);
  });
  it('returns an empty array unchanged', () => {
    expect(sortByPriorityThenUpdated([])).toEqual([]);
  });
});

describe('filterIssues', () => {
  const apple = make({ id: 'beads-helix-apple', title: 'Add Apple support', priority: 0 });
  const pear = make({ id: 'beads-helix-pear', title: 'Pear caching layer', priority: 1 });
  const grape = make({ id: 'beads-helix-grape', title: 'Refactor logger', priority: 2 });

  it('returns all issues with no criteria', () => {
    expect(filterIssues([apple, pear, grape], {})).toEqual([apple, pear, grape]);
  });
  it('filters by exact priority', () => {
    expect(filterIssues([apple, pear, grape], { priority: 1 })).toEqual([pear]);
  });
  it('treats priority "all" as no filter', () => {
    expect(filterIssues([apple, pear, grape], { priority: 'all' })).toEqual([apple, pear, grape]);
  });
  it('matches title substring case-insensitively', () => {
    expect(filterIssues([apple, pear, grape], { q: 'apple' })).toEqual([apple]);
    expect(filterIssues([apple, pear, grape], { q: 'APP' })).toEqual([apple]);
  });
  it('matches against the id segment too', () => {
    expect(filterIssues([apple, pear, grape], { q: 'pear' })).toEqual([pear]);
  });
  it('combines priority + query with AND semantics', () => {
    expect(filterIssues([apple, pear, grape], { priority: 0, q: 'apple' })).toEqual([apple]);
    expect(filterIssues([apple, pear, grape], { priority: 0, q: 'pear' })).toEqual([]);
  });
  it('treats whitespace-only query as no filter', () => {
    expect(filterIssues([apple, pear, grape], { q: '   ' })).toEqual([apple, pear, grape]);
  });
});

describe('findInProgress', () => {
  it('returns the first issue with status in_progress', () => {
    const open = make({ id: 'a', status: 'open' });
    const inFlight = make({ id: 'b', status: 'in_progress' });
    expect(findInProgress([open, inFlight])).toBe(inFlight);
  });
  it('returns null when nothing is in progress', () => {
    const issues = [make({ status: 'open' }), make({ status: 'closed' })];
    expect(findInProgress(issues)).toBeNull();
  });
});

describe('findLastTouched', () => {
  it('returns the issue with the most recent updated_at', () => {
    const old = make({ id: 'a', updated_at: '2026-01-01T00:00:00.000Z' });
    const recent = make({ id: 'b', updated_at: '2026-04-12T00:00:00.000Z' });
    const middle = make({ id: 'c', updated_at: '2026-02-15T00:00:00.000Z' });
    expect(findLastTouched([old, recent, middle])).toBe(recent);
  });
  it('returns null for an empty array', () => {
    expect(findLastTouched([])).toBeNull();
  });
});
