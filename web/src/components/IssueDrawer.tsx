import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { fetchIssue, IssueError } from '../lib/issue';

export interface IssueDrawerProps {
  projectId: string;
  issueId: string;
  open: boolean;
  onClose: () => void;
}

export function IssueDrawer({ projectId, issueId, open, onClose }: IssueDrawerProps) {
  const issueQuery = useQuery({
    queryKey: ['issue', projectId, issueId],
    queryFn: () => fetchIssue(projectId, issueId),
    enabled: open,
    retry: false,
  });

  return (
    <Dialog.Root
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onInteractOutside={(e) => {
            e.preventDefault();
            onClose();
          }}
          className="fixed right-0 top-0 z-40 flex h-full w-full max-w-xl flex-col border-l border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl focus:outline-none md:w-[640px]"
        >
          <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <Dialog.Title className="truncate font-mono text-xs text-neutral-400">
              {issueId}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
            >
              <X size={16} />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
                <h2 className="text-lg font-semibold leading-tight text-neutral-50">
                  {issueQuery.data.title}
                </h2>
              </article>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
