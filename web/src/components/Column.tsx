import type { SnapshotIssue } from '@shared/snapshot-schema';
import { sortByPriorityThenUpdated, type MaturityColumn } from '../lib/board';
import { Card } from './Card';

export interface ColumnProps {
  stage: MaturityColumn;
  issues: readonly SnapshotIssue[];
  projectId: string;
}

const STAGE_LABEL: Record<MaturityColumn, string> = {
  idea: 'idea',
  refined: 'refined',
  ready: 'ready',
};

export function Column({ stage, issues, projectId }: ColumnProps) {
  const sorted = sortByPriorityThenUpdated(issues);
  const label = STAGE_LABEL[stage];

  return (
    <section
      className="flex min-h-0 flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3"
      aria-label={`${label} column`}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {label}
        </h2>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-800 px-1.5 font-mono text-2xs text-neutral-300">
          {issues.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="px-1 py-2 text-xs italic text-neutral-600">
            no {label} issues
          </p>
        ) : (
          sorted.map((issue) => (
            <Card key={issue.id} issue={issue} projectId={projectId} />
          ))
        )}
      </div>
    </section>
  );
}
