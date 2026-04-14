import { useMemo } from 'react';
import type { Snapshot } from '@shared/snapshot-schema';
import { findInProgress, findLastTouched, shortId } from '../lib/board';

export interface PrimingHeaderProps {
  snapshot: Snapshot;
}

export function PrimingHeader({ snapshot }: PrimingHeaderProps) {
  const counts = snapshot.columns_summary;
  const lastTouched = useMemo(() => findLastTouched(snapshot.issues), [snapshot.issues]);
  const inProgress = useMemo(() => findInProgress(snapshot.issues), [snapshot.issues]);

  return (
    <header className="flex flex-col gap-1 border-b border-neutral-900 pb-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-neutral-100">{snapshot.project_id}</h1>
        <p
          data-testid="priming-counts"
          className="font-mono text-xs text-neutral-400"
        >
          <span>{counts.idea} idea</span>
          <span className="mx-2 text-neutral-700">·</span>
          <span>{counts.refined} refined</span>
          <span className="mx-2 text-neutral-700">·</span>
          <span>{counts.ready} ready</span>
        </p>
      </div>
      <p
        data-testid="priming-detail"
        className="font-mono text-[0.7rem] text-neutral-500"
      >
        {snapshot.issues.length === 0 ? (
          <span>no issues yet — run bd ready</span>
        ) : (
          <>
            <span>
              last touched:{' '}
              {lastTouched ? (
                <>
                  <span className="text-neutral-300">{shortId(lastTouched.id)}</span>
                  <span className="ml-1 text-neutral-500">{lastTouched.title}</span>
                </>
              ) : (
                'none'
              )}
            </span>
            <span className="mx-2 text-neutral-700">·</span>
            <span>
              {inProgress ? (
                <>
                  in progress:{' '}
                  <span className="text-neutral-300">{shortId(inProgress.id)}</span>
                </>
              ) : (
                'idle'
              )}
            </span>
          </>
        )}
      </p>
    </header>
  );
}
