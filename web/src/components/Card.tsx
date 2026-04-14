import type { KeyboardEvent, MouseEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import type { SnapshotIssue } from '@shared/snapshot-schema';
import {
  copyToClipboard,
  depHint,
  priorityChipClass,
  priorityLabel,
  shortId,
} from '../lib/board';

export interface CardProps {
  issue: SnapshotIssue;
  projectId: string;
}

export function Card({ issue, projectId }: CardProps) {
  const sid = shortId(issue.id);

  const copy = async (): Promise<void> => {
    try {
      await copyToClipboard(issue.id);
      toast.success(`Copied ${issue.id}`);
    } catch {
      toast.error(`Copy failed for ${issue.id}`);
    }
  };

  const handleShortIdClick = (e: MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    e.preventDefault();
    void copy();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLAnchorElement>): void => {
    if (e.key === 'c' || e.key === 'C') {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      void copy();
    }
  };

  return (
    <Link
      to="/p/$projectId/i/$issueId"
      params={{ projectId, issueId: issue.id }}
      search={(prev) => prev}
      aria-label={`Open issue ${sid} — ${issue.title}. Press c to copy ${issue.id}.`}
      onKeyDown={handleKeyDown}
      className="group block cursor-pointer rounded-md border border-neutral-800 bg-neutral-900/60 p-3 text-left no-underline transition hover:border-neutral-700 hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
    >
      <p className="line-clamp-2 text-[0.9rem] font-medium leading-snug text-neutral-100">
        {issue.title}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span
            data-testid="priority-chip"
            className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[0.7rem] ${priorityChipClass(issue.priority)}`}
          >
            {priorityLabel(issue.priority)}
          </span>
          <button
            type="button"
            aria-label={`Copy id ${issue.id}`}
            onClick={handleShortIdClick}
            className="rounded px-1 font-mono text-[0.75rem] text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
          >
            {sid}
          </button>
        </div>
        <span className="font-mono text-[0.7rem] text-neutral-500">
          {depHint(issue)}
        </span>
      </div>
    </Link>
  );
}
