import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bucketIssues,
  filterIssues,
  MATURITY_COLUMNS,
  type FilterCriteria,
} from '../lib/board';
import { fetchSnapshot, SnapshotError } from '../lib/snapshot';
import { Column } from './Column';
import { FilterToolbar, type PriorityFilter } from './FilterToolbar';

export interface BoardProps {
  projectId: string;
}

export function Board({ projectId }: BoardProps) {
  const queryClient = useQueryClient();
  const [priority, setPriority] = useState<PriorityFilter>('all');
  const [query, setQuery] = useState('');

  const snapshotQuery = useQuery({
    queryKey: ['snapshot', projectId],
    queryFn: () => fetchSnapshot(projectId),
    retry: false,
  });

  // Subscribe to SSE for live updates.
  useEffect(() => {
    const es = new EventSource('/api/events');
    const onChange = (): void => {
      void queryClient.invalidateQueries({ queryKey: ['snapshot', projectId] });
    };
    es.addEventListener('snapshot-changed', onChange);
    return () => {
      es.removeEventListener('snapshot-changed', onChange);
      es.close();
    };
  }, [queryClient, projectId]);

  // 'R' key triggers a manual refetch (when not typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'r' && e.key !== 'R') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['snapshot', projectId] });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queryClient, projectId]);

  const filterCriteria: FilterCriteria = useMemo(
    () => ({ priority, q: query }),
    [priority, query],
  );

  const filteredIssues = useMemo(() => {
    if (!snapshotQuery.data) return [];
    return filterIssues(snapshotQuery.data.issues, filterCriteria);
  }, [snapshotQuery.data, filterCriteria]);

  const buckets = useMemo(() => bucketIssues(filteredIssues), [filteredIssues]);

  return (
    <div className="flex h-full min-h-screen flex-col gap-3 bg-neutral-950 p-4 text-neutral-100">
      <FilterToolbar
        priority={priority}
        query={query}
        onPriorityChange={setPriority}
        onQueryChange={setQuery}
      />
      <BoardBody
        loading={snapshotQuery.isLoading}
        error={snapshotQuery.error}
        buckets={buckets}
      />
    </div>
  );
}

interface BoardBodyProps {
  loading: boolean;
  error: unknown;
  buckets: ReturnType<typeof bucketIssues>;
}

function BoardBody({ loading, error, buckets }: BoardBodyProps) {
  if (loading) {
    return (
      <div data-testid="board-loading" className="grid grid-cols-3 gap-4">
        {MATURITY_COLUMNS.map((stage) => (
          <div
            key={stage}
            className="h-64 animate-pulse rounded-lg border border-neutral-800 bg-neutral-900/40"
          />
        ))}
      </div>
    );
  }
  if (error instanceof SnapshotError) {
    return <SnapshotErrorView error={error} />;
  }
  return (
    <div className="grid min-h-0 flex-1 grid-cols-3 gap-4">
      {MATURITY_COLUMNS.map((stage) => (
        <Column key={stage} stage={stage} issues={buckets[stage]} />
      ))}
    </div>
  );
}

function SnapshotErrorView({ error }: { error: SnapshotError }) {
  if (error.code === 'SNAPSHOT_NOT_FOUND') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-neutral-800 p-12 text-center">
        <p className="text-sm text-neutral-400">No snapshot yet for this project.</p>
        <p className="text-sm text-neutral-300">
          Run <code className="rounded bg-neutral-900 px-2 py-1 font-mono">bd prime</code> to generate one.
        </p>
      </div>
    );
  }
  if (error.code === 'SNAPSHOT_CORRUPT') {
    return (
      <div className="rounded-lg border border-red-900/40 bg-red-950/30 p-6 text-sm text-red-300">
        <p className="font-semibold">Snapshot corrupt.</p>
        <p className="mt-1 text-red-400/80">{error.message}</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-900/40 bg-amber-950/30 p-6 text-sm text-amber-300">
      <p className="font-semibold">Failed to load snapshot ({error.code}).</p>
      <p className="mt-1 text-amber-400/80">{error.message}</p>
    </div>
  );
}
