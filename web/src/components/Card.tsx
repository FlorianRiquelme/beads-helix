import type { KeyboardEvent } from 'react';
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
}

export function Card({ issue }: CardProps) {
  const handleCopy = async (): Promise<void> => {
    try {
      await copyToClipboard(issue.id);
      toast.success(`Copied ${issue.id}`);
    } catch {
      toast.error(`Copy failed for ${issue.id}`);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void handleCopy();
    }
  };

  const sid = shortId(issue.id);
  const ariaLabel = `${sid} — ${issue.title}. Press Enter to copy ${issue.id}`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={() => void handleCopy()}
      onKeyDown={handleKeyDown}
      className="group cursor-pointer rounded-md border border-neutral-800 bg-neutral-900/60 p-3 text-left transition hover:border-neutral-700 hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
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
          <span className="font-mono text-[0.75rem] text-neutral-400">{sid}</span>
        </div>
        <span className="font-mono text-[0.7rem] text-neutral-500">
          {depHint(issue)}
        </span>
      </div>
    </div>
  );
}
