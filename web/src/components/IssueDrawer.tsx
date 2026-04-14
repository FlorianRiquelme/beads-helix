import { useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, X } from 'lucide-react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import type { Snapshot } from '@shared/snapshot-schema';
import { fetchIssue, IssueError } from '../lib/issue';
import { copyToClipboard, priorityChipClass, priorityLabel } from '../lib/board';
import { buildDependencyWeather, type DependencyRail, type DependencyWeather } from '../lib/relationships';
import { findCardElement, morphAndRun } from '../lib/view-transition';

export interface IssueDrawerProps {
  projectId: string;
  issueId: string;
  open: boolean;
  onClose: () => void;
  filteredIssueIds?: string[];
  snapshotIssueIds?: string[];
}

export function IssueDrawer({ projectId, issueId, open, onClose, filteredIssueIds, snapshotIssueIds }: IssueDrawerProps) {
  const queryClient = useQueryClient();
  const issueQuery = useQuery({
    queryKey: ['issue', projectId, issueId],
    queryFn: () => fetchIssue(projectId, issueId),
    enabled: open,
    retry: false,
  });

  const weather = useMemo<DependencyWeather | null>(() => {
    if (!issueQuery.data) return null;
    const snapshot = queryClient.getQueryData<Snapshot>(['snapshot', projectId]);
    if (!snapshot) return null;
    const w = buildDependencyWeather(issueQuery.data, snapshot.issues);
    if (w.openBlockers.length === 0 && w.closedDeps.length === 0 && w.openDependents.length === 0) {
      return null;
    }
    return w;
  }, [issueQuery.data, queryClient, projectId]);

  const closeWithMorph = (): void => {
    morphAndRun(findCardElement(issueId), () => {
      onClose();
    });
  };

  return (
    <Dialog.Root
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (!next) closeWithMorph();
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onInteractOutside={(e) => {
            e.preventDefault();
            closeWithMorph();
          }}
          style={{ viewTransitionName: 'issue-morph' }}
          className="fixed right-0 top-0 z-40 flex h-full w-full max-w-xl flex-col border-l border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl focus:outline-none md:w-[640px]"
        >
          <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <Dialog.Title className="truncate font-mono text-xs text-neutral-400">
              {issueId}
            </Dialog.Title>
            <button
              type="button"
              aria-label="Close"
              onClick={closeWithMorph}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
            >
              <X size={16} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {snapshotIssueIds && !snapshotIssueIds.includes(issueId) && (
              <div
                data-testid="banner-disappeared"
                className="mb-3 rounded-md border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300"
              >
                This issue is no longer present in the snapshot.
              </div>
            )}
            {filteredIssueIds && snapshotIssueIds?.includes(issueId) && !filteredIssueIds.includes(issueId) && (
              <div
                data-testid="banner-filtered-out"
                className="mb-3 rounded-md border border-amber-900/40 bg-amber-950/30 p-3 text-sm text-amber-300"
              >
                This issue is hidden by current filters.
              </div>
            )}
            {issueQuery.isLoading && (
              <div
                data-testid="issue-drawer-loading"
                className="h-32 animate-pulse rounded-md bg-neutral-900"
              />
            )}
            {issueQuery.error instanceof IssueError &&
              issueQuery.error.code === 'ISSUE_NOT_FOUND' && (
                <div
                  data-testid="issue-drawer-not-found"
                  className="rounded-md border border-amber-900/40 bg-amber-950/30 p-4 text-sm text-amber-300"
                >
                  <p className="font-semibold">Issue not found.</p>
                  <p className="mt-1 text-amber-400/80">
                    No issue with id <code className="font-mono">{issueId}</code> in this project.
                  </p>
                </div>
              )}
            {issueQuery.error instanceof IssueError &&
              issueQuery.error.code !== 'ISSUE_NOT_FOUND' && (
                <div
                  data-testid="issue-drawer-error"
                  className="rounded-md border border-red-900/40 bg-red-950/30 p-4 text-sm text-red-300"
                >
                  <p className="font-semibold">Failed to load issue ({issueQuery.error.code}).</p>
                  <p className="mt-1 text-red-400/80">{issueQuery.error.message}</p>
                </div>
              )}
            {issueQuery.data && (
              <article>
                <h2 className="text-lg font-semibold leading-tight tracking-tight text-neutral-50">
                  {issueQuery.data.title}
                </h2>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-2xs ${priorityChipClass(issueQuery.data.priority)}`}
                  >
                    {priorityLabel(issueQuery.data.priority)}
                  </span>
                  <span className="inline-flex items-center rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-2xs text-neutral-300">
                    {issueQuery.data.issue_type}
                  </span>
                  <span className="inline-flex items-center rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-2xs text-neutral-300">
                    {issueQuery.data.status}
                  </span>
                  {issueQuery.data.labels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-2xs text-sky-300 ring-1 ring-sky-500/30"
                    >
                      {label}
                    </span>
                  ))}
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    aria-label="Copy bd update command"
                    onClick={() => {
                      void copyToClipboard(`bd update ${issueQuery.data!.id}`).then(
                        () => toast.success('Copied bd update command'),
                        () => toast.error('Copy failed'),
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800/60 px-2 py-1 font-mono text-xs text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
                  >
                    <Copy size={12} />
                    bd update {issueQuery.data.id}
                  </button>
                </div>

                {issueQuery.data.description && (
                  <MarkdownSection testId="issue-description" label="Description" content={issueQuery.data.description} />
                )}

                {issueQuery.data.notes && (
                  <MarkdownSection testId="issue-notes" label="Notes" content={issueQuery.data.notes} />
                )}

                {issueQuery.data.design && (
                  <details data-testid="issue-design" className="mt-4">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Design — {issueQuery.data.design.split('\n')[0]}
                    </summary>
                    <div className="prose prose-invert prose-sm mt-2 max-w-none">
                      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                        {issueQuery.data.design}
                      </Markdown>
                    </div>
                  </details>
                )}

                {weather && <DependencyWeatherBlock weather={weather} />}
              </article>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MarkdownSection({ testId, label, content }: { testId: string; label: string; content: string }) {
  return (
    <section data-testid={testId} className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </h3>
      <div className="prose prose-invert prose-sm max-w-none">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
          {content}
        </Markdown>
      </div>
    </section>
  );
}

function DependencyWeatherBlock({ weather }: { weather: DependencyWeather }) {
  return (
    <section data-testid="dependency-weather" className="mt-6 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        Dependencies
      </h3>
      {weather.openBlockers.length > 0 && (
        <div data-testid="rail-open-blockers" className="space-y-1.5">
          <p className="text-2xs font-medium uppercase text-red-400">Open blockers</p>
          {weather.openBlockers.map((r) => (
            <RailItem key={r.id} rail={r} tint="red" />
          ))}
        </div>
      )}
      {weather.closedDeps.length > 0 && (
        <div data-testid="rail-closed-deps" className="space-y-1.5">
          <p className="text-2xs font-medium uppercase text-emerald-400">Closed deps</p>
          {weather.closedDeps.map((r) => (
            <RailItem key={r.id} rail={r} tint="green" showNotes />
          ))}
        </div>
      )}
      {weather.openDependents.length > 0 && (
        <div data-testid="rail-open-dependents" className="space-y-1.5">
          <p className="text-2xs font-medium uppercase text-amber-400">Open dependents</p>
          {weather.openDependents.map((r) => (
            <RailItem key={r.id} rail={r} tint="amber" showLabels />
          ))}
        </div>
      )}
    </section>
  );
}

const TINT_CLASSES = {
  red: 'border-red-900/40 bg-red-950/20',
  green: 'border-emerald-900/40 bg-emerald-950/20',
  amber: 'border-amber-900/40 bg-amber-950/20',
} as const;

function RailItem({
  rail,
  tint,
  showNotes,
  showLabels,
}: {
  rail: DependencyRail;
  tint: keyof typeof TINT_CLASSES;
  showNotes?: boolean;
  showLabels?: boolean;
}) {
  return (
    <div className={`rounded border p-2 ${TINT_CLASSES[tint]}`}>
      <p className="text-sm text-neutral-200">{rail.title}</p>
      {showLabels && rail.labels.length > 0 && (
        <div className="mt-1 flex gap-1">
          {rail.labels.map((l) => (
            <span
              key={l}
              className="rounded bg-sky-500/15 px-1 font-mono text-2xs text-sky-300 ring-1 ring-sky-500/30"
            >
              {l}
            </span>
          ))}
        </div>
      )}
      {showNotes && rail.notes && (
        <p className="mt-1 text-xs italic text-neutral-400">{rail.notes}</p>
      )}
    </div>
  );
}
