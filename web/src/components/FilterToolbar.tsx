import { useEffect, useRef, useState } from 'react';

export type PriorityFilter = 'all' | 0 | 1 | 2 | 3 | 4;

export interface FilterToolbarProps {
  priority: PriorityFilter;
  query: string;
  onPriorityChange: (next: PriorityFilter) => void;
  onQueryChange: (next: string) => void;
  /** Debounce window in milliseconds. Defaults to 200ms. */
  debounceMs?: number;
}

export function FilterToolbar({
  priority,
  query,
  onPriorityChange,
  onQueryChange,
  debounceMs = 200,
}: FilterToolbarProps) {
  const [localQuery, setLocalQuery] = useState(query);
  const lastEmitted = useRef(query);

  // Sync from controlled prop when URL changes externally (e.g. browser back/forward).
  useEffect(() => {
    if (query !== lastEmitted.current) {
      setLocalQuery(query);
      lastEmitted.current = query;
    }
  }, [query]);

  // Debounce localQuery -> onQueryChange.
  useEffect(() => {
    if (localQuery === lastEmitted.current) return;
    const id = setTimeout(() => {
      lastEmitted.current = localQuery;
      onQueryChange(localQuery);
    }, debounceMs);
    return () => clearTimeout(id);
  }, [localQuery, debounceMs, onQueryChange]);

  const handlePrioritySelect = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const v = e.target.value;
    if (v === 'all') {
      onPriorityChange('all');
      return;
    }
    const n = Number.parseInt(v, 10);
    if (Number.isInteger(n) && n >= 0 && n <= 4) {
      onPriorityChange(n as PriorityFilter);
    }
  };

  return (
    <div className="flex items-center gap-3 px-1 py-2 text-sm">
      <label className="flex items-center gap-2 text-neutral-400">
        <span>Priority</span>
        <select
          aria-label="priority"
          value={priority === 'all' ? 'all' : String(priority)}
          onChange={handlePrioritySelect}
          className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          <option value="all">All</option>
          <option value="0">P0</option>
          <option value="1">P1</option>
          <option value="2">P2</option>
          <option value="3">P3</option>
          <option value="4">P4</option>
        </select>
      </label>
      <input
        type="search"
        placeholder="Search title or id…"
        value={localQuery}
        onChange={(e) => setLocalQuery(e.target.value)}
        className="flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </div>
  );
}
