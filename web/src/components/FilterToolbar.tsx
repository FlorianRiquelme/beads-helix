import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

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
        <span className="relative inline-flex">
          <select
            aria-label="priority"
            value={priority === 'all' ? 'all' : String(priority)}
            onChange={handlePrioritySelect}
            className="appearance-none rounded border border-neutral-800 bg-neutral-900 py-1 pl-2 pr-7 font-mono text-xs text-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
          >
            <option value="all">All</option>
            <option value="0">P0</option>
            <option value="1">P1</option>
            <option value="2">P2</option>
            <option value="3">P3</option>
            <option value="4">P4</option>
          </select>
          <ChevronDown
            size={12}
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500"
          />
        </span>
      </label>
      <input
        type="search"
        placeholder="Search title or id…"
        value={localQuery}
        onChange={(e) => setLocalQuery(e.target.value)}
        className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
      />
      <KbdLegend />
    </div>
  );
}

function KbdLegend() {
  return (
    <div
      aria-label="Keyboard shortcuts"
      className="hidden shrink-0 items-center gap-2 font-mono text-2xs text-neutral-600 md:flex"
    >
      <KbdItem keys="⌘K" label="command" />
      <span aria-hidden="true" className="text-neutral-800">·</span>
      <KbdItem keys="R" label="refresh" />
      <span aria-hidden="true" className="text-neutral-800">·</span>
      <KbdItem keys="C" label="copy id" />
    </div>
  );
}

function KbdItem({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="rounded border border-neutral-800 bg-neutral-900 px-1 py-px text-neutral-400">
        {keys}
      </kbd>
      <span>{label}</span>
    </span>
  );
}
