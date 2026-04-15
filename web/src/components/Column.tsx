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
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        {label}
      </h2>
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
