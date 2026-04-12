import { watch, existsSync, type FSWatcher } from 'node:fs';
import { EventEmitter } from 'node:events';

/**
 * Watch `.beads/last-touched` for invalidation events.
 * Consumer-owned: the calling process owns the watcher lifecycle.
 *
 * - 500ms debounce to batch rapid writes
 * - Re-attaches on file rename/deletion (sleep/wake recovery)
 * - 60s safety-net interval catches out-of-band changes
 */
export function watchBeadsInvalidation(
  lastTouchedPath: string,
  onDirty: () => void,
): FSWatcher & { stop: () => void } {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let safetyTimer: ReturnType<typeof setInterval> | null = null;
  let currentWatcher: FSWatcher | null = null;
  let stopped = false;

  function trigger(): void {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!stopped) onDirty();
    }, 500);
  }

  function attach(): FSWatcher | null {
    if (stopped) return null;

    if (currentWatcher) {
      try { currentWatcher.close(); } catch {}
      currentWatcher = null;
    }

    if (!existsSync(lastTouchedPath)) {
      // File missing — poll until it reappears
      setTimeout(() => attach(), 1000);
      return null;
    }

    try {
      currentWatcher = watch(lastTouchedPath, (event) => {
        if (event === 'rename' || !existsSync(lastTouchedPath)) {
          // File descriptor lost (sleep/wake, deletion, re-init)
          attach();
        }
        trigger();
      });

      currentWatcher.on('error', () => {
        // Re-attach on error (common after sleep/wake on macOS)
        attach();
      });

      return currentWatcher;
    } catch {
      setTimeout(() => attach(), 1000);
      return null;
    }
  }

  // Start the watcher
  const watcher = attach();

  // Safety-net: refresh every 60s regardless of events
  safetyTimer = setInterval(() => {
    if (!stopped) onDirty();
  }, 60_000);

  function stop(): void {
    stopped = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (safetyTimer) clearInterval(safetyTimer);
    if (currentWatcher) {
      try { currentWatcher.close(); } catch {}
    }
  }

  // Return the initial watcher (or a stub) with a stop method
  const result = (watcher ?? new EventEmitter()) as FSWatcher & { stop: () => void };
  result.stop = stop;
  return result;
}
