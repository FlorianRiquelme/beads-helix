import { useMemo, useRef, type MouseEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import type { Snapshot, SnapshotIssue } from '@shared/snapshot-schema';
import {
  countInProgress,
  findInProgress,
  findLastTouched,
  priorityChipClass,
  priorityLabel,
  shortId,
} from '../lib/board';
import { morphAndRun } from '../lib/view-transition';

export interface PrimingHeaderProps {
  snapshot: Snapshot;
  projectId: string;
}

export function PrimingHeader({ snapshot, projectId }: PrimingHeaderProps) {
  const counts = snapshot.columns_summary;
  const lastTouched = useMemo(() => findLastTouched(snapshot.issues), [snapshot.issues]);
  const inProgress = useMemo(() => findInProgress(snapshot.issues), [snapshot.issues]);
  const inProgressTotal = useMemo(
    () => countInProgress(snapshot.issues),
    [snapshot.issues],
  );
  const hasIssues = snapshot.issues.length > 0;
  const showLastTouched =
    lastTouched !== null && (!inProgress || lastTouched.id !== inProgress.id);

  return (
    <header className="flex flex-col gap-2 border-b border-neutral-900 pb-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h1 className="truncate font-mono text-xs tracking-tight text-neutral-500">
          {snapshot.project_id}
        </h1>
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

      <div data-testid="priming-detail" className="flex flex-col gap-1.5">
        {!hasIssues ? (
          <EmptyLine />
        ) : inProgress ? (
          <InFlightStrip
            issue={inProgress}
            projectId={projectId}
            extraCount={inProgressTotal - 1}
          />
        ) : (
          <IdleStrip />
        )}
        {showLastTouched && lastTouched && (
          <LastTouchedLine issue={lastTouched} projectId={projectId} />
        )}
      </div>
    </header>
  );
}

function EmptyLine() {
  return (
    <p className="px-1 font-mono text-2xs text-neutral-500">
      no issues yet — run bd ready
    </p>
  );
}

function IdleStrip() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-neutral-800/80 px-3 py-2">
      <span className="font-mono text-2xs uppercase tracking-wider text-neutral-500">
        idle
      </span>
      <span className="text-neutral-700">·</span>
      <span className="text-sm text-neutral-400">
        nothing in flight — pick from ready
      </span>
    </div>
  );
}

interface IssueLinkProps {
  issue: SnapshotIssue;
  projectId: string;
}

interface InFlightStripProps extends IssueLinkProps {
  /** Number of additional in-progress issues not shown. */
  extraCount: number;
}

function InFlightStrip({ issue, projectId, extraCount }: InFlightStripProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const navigate = useNavigate();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>): void => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    morphAndRun(linkRef.current, () => {
      void navigate({
        to: '/p/$projectId/i/$issueId',
        params: { projectId, issueId: issue.id },
        search: (prev) => prev,
      });
    });
  };

  return (
    <Link
      ref={linkRef}
      to="/p/$projectId/i/$issueId"
      params={{ projectId, issueId: issue.id }}
      search={(prev) => prev}
      data-issue-id={issue.id}
      onClick={handleClick}
      aria-label={`Open in-progress issue ${shortId(issue.id)} — ${issue.title}`}
      className="group flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2.5 no-underline transition-colors duration-150 hover:border-neutral-700 hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-sky-400/80">
          <span>in progress</span>
          {extraCount > 0 && (
            <span
              aria-label={`${extraCount} more in progress`}
              className="rounded bg-sky-500/15 px-1 py-px text-sky-300/80 normal-case tracking-normal"
            >
              +{extraCount}
            </span>
          )}
        </span>
        <span className="truncate text-sm font-medium text-neutral-100">
          {issue.title}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-2xs ${priorityChipClass(issue.priority)}`}
        >
          {priorityLabel(issue.priority)}
        </span>
        <span className="font-mono text-xs text-neutral-400 group-hover:text-neutral-200">
          {shortId(issue.id)}
        </span>
      </div>
    </Link>
  );
}

function LastTouchedLine({ issue, projectId }: IssueLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const navigate = useNavigate();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>): void => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    morphAndRun(linkRef.current, () => {
      void navigate({
        to: '/p/$projectId/i/$issueId',
        params: { projectId, issueId: issue.id },
        search: (prev) => prev,
      });
    });
  };

  return (
    <Link
      ref={linkRef}
      to="/p/$projectId/i/$issueId"
      params={{ projectId, issueId: issue.id }}
      search={(prev) => prev}
      onClick={handleClick}
      aria-label={`Open last-touched issue ${shortId(issue.id)}`}
      className="group flex items-center gap-2 rounded px-1 font-mono text-2xs text-neutral-500 no-underline transition-colors duration-150 hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
    >
      <span aria-hidden="true">last touched:</span>
      <span aria-hidden="true" className="text-neutral-400 group-hover:text-neutral-200">
        {shortId(issue.id)}
      </span>
      <span aria-hidden="true" className="truncate text-neutral-600 group-hover:text-neutral-400">
        {issue.title}
      </span>
    </Link>
  );
}
