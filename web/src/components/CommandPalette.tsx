import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { Snapshot, SnapshotIssue } from '@shared/snapshot-schema';
import { priorityChipClass, priorityLabel, shortId } from '../lib/board';
import { findCardElement, morphAndRun } from '../lib/view-transition';

export interface CommandPaletteProps {
  projectId: string;
}

interface ScoredIssue {
  issue: SnapshotIssue;
  score: number;
}

const MAX_RESULTS = 50;

function scoreIssue(issue: SnapshotIssue, q: string): ScoredIssue | null {
  if (q === '') return { issue, score: 0 };
  const title = issue.title.toLowerCase();
  const id = issue.id.toLowerCase();
  const sid = shortId(issue.id).toLowerCase();
  if (sid === q) return { issue, score: 200 };
  if (sid.startsWith(q)) return { issue, score: 150 };
  if (id.includes(q)) return { issue, score: 100 };
  const tIdx = title.indexOf(q);
  if (tIdx !== -1) return { issue, score: 80 - Math.min(tIdx, 40) };
  for (const l of issue.labels) {
    if (l.toLowerCase().includes(q)) return { issue, score: 30 };
  }
  return null;
}

function rankDefault(issues: readonly SnapshotIssue[]): ScoredIssue[] {
  const inProgress: ScoredIssue[] = [];
  const ready: ScoredIssue[] = [];
  const rest: ScoredIssue[] = [];
  for (const issue of issues) {
    if (issue.status === 'in_progress') inProgress.push({ issue, score: 0 });
    else if (issue.board_column === 'ready') ready.push({ issue, score: 0 });
    else rest.push({ issue, score: 0 });
  }
  const byPriority = (a: ScoredIssue, b: ScoredIssue): number =>
    a.issue.priority - b.issue.priority ||
    b.issue.updated_at.localeCompare(a.issue.updated_at);
  inProgress.sort(byPriority);
  ready.sort(byPriority);
  rest.sort(byPriority);
  return [...inProgress, ...ready, ...rest];
}

export function CommandPalette({ projectId }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      const isK = e.key.toLowerCase() === 'k';
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected(0);
    }
  }, [open]);

  const snapshot = queryClient.getQueryData<Snapshot>(['snapshot', projectId]);

  const results = useMemo<ScoredIssue[]>(() => {
    if (!snapshot) return [];
    const q = query.trim().toLowerCase();
    if (q === '') return rankDefault(snapshot.issues).slice(0, MAX_RESULTS);
    const scored: ScoredIssue[] = [];
    for (const issue of snapshot.issues) {
      const s = scoreIssue(issue, q);
      if (s) scored.push(s);
    }
    scored.sort(
      (a, b) => b.score - a.score || a.issue.priority - b.issue.priority,
    );
    return scored.slice(0, MAX_RESULTS);
  }, [snapshot, query]);

  useEffect(() => {
    if (selected >= results.length) setSelected(Math.max(0, results.length - 1));
  }, [results, selected]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${selected}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected, open]);

  const go = (issue: SnapshotIssue): void => {
    setOpen(false);
    const target = findCardElement(issue.id);
    morphAndRun(target, () => {
      void navigate({
        to: '/p/$projectId/i/$issueId',
        params: { projectId, issueId: issue.id },
        search: (prev) => prev,
      });
    });
  };

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = results[selected];
      if (pick) go(pick.issue);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="command-palette-overlay"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="command-palette"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed left-1/2 top-[12vh] z-50 w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl focus:outline-none"
        >
          <Dialog.Title className="sr-only">Jump to issue</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2.5">
            <Search size={14} className="shrink-0 text-neutral-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              placeholder="Jump to an issue by id, title, or label…"
              aria-label="Search issues"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(0);
              }}
              onKeyDown={onInputKey}
              className="flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
            />
            <kbd className="hidden rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-2xs text-neutral-500 sm:inline-block">
              ESC
            </kbd>
          </div>
          <div
            ref={listRef}
            role="listbox"
            aria-label="Matching issues"
            className="max-h-[52vh] overflow-y-auto py-1"
          >
            {results.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-neutral-500">
                {snapshot ? 'No issues match.' : 'Snapshot not loaded yet.'}
              </div>
            )}
            {results.map((r, i) => {
              const isSelected = i === selected;
              return (
                <button
                  key={r.issue.id}
                  type="button"
                  role="option"
                  data-idx={i}
                  aria-selected={isSelected}
                  onMouseMove={() => setSelected(i)}
                  onClick={() => go(r.issue)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? 'bg-neutral-900 text-neutral-100'
                      : 'text-neutral-200 hover:bg-neutral-900/60'
                  }`}
                >
                  <span
                    className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-2xs ${priorityChipClass(r.issue.priority)}`}
                  >
                    {priorityLabel(r.issue.priority)}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-neutral-500">
                    {shortId(r.issue.id)}
                  </span>
                  <span className="flex-1 truncate text-sm">
                    {r.issue.title}
                  </span>
                  <span className="hidden shrink-0 font-mono text-2xs uppercase text-neutral-600 sm:inline">
                    {r.issue.board_column ?? r.issue.status}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 border-t border-neutral-800 bg-neutral-950 px-3 py-2 text-2xs text-neutral-500">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-neutral-900 px-1 font-mono">↑↓</kbd>
              navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-neutral-900 px-1 font-mono">↵</kbd>
              open
            </span>
            <span className="ml-auto inline-flex items-center gap-1">
              <kbd className="rounded bg-neutral-900 px-1 font-mono">⌘K</kbd>
              toggle
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
