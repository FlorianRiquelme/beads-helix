import chokidar, { FSWatcher } from 'chokidar';

export interface WatcherOptions {
  /** Directory to watch (non-recursive by default). */
  dir: string;
  /** Debounce window in ms. */
  debounceMs?: number;
  /** Invoked after the debounce window with the most recent triggering path. */
  onChange: (path: string) => void;
  /** Injectable for tests. */
  watcherFactory?: (dir: string) => FSWatcher;
}

export interface WatcherHandle {
  close: () => Promise<void>;
}

/**
 * Watches a directory for snapshot file changes via chokidar. Events are
 * debounced to collapse bursts (e.g. bulk bd operations). Only one emit per
 * debounce window; we pass the most recent path that triggered it.
 */
export function startWatcher(opts: WatcherOptions): WatcherHandle {
  const debounceMs = opts.debounceMs ?? 200;
  const factory = opts.watcherFactory ?? defaultFactory;
  const watcher = factory(opts.dir);

  let timer: NodeJS.Timeout | null = null;
  let lastPath: string | null = null;

  const flush = (): void => {
    timer = null;
    if (lastPath !== null) {
      const p = lastPath;
      lastPath = null;
      opts.onChange(p);
    }
  };

  const onEvent = (eventPath: string): void => {
    lastPath = eventPath;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  watcher.on('add', onEvent);
  watcher.on('change', onEvent);
  watcher.on('unlink', onEvent);

  return {
    close: async () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      await watcher.close();
    },
  };
}

function defaultFactory(dir: string): FSWatcher {
  return chokidar.watch(dir, {
    depth: 0,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
  });
}
