import { serve } from '@hono/node-server';
import { promises as fs } from 'node:fs';
import { basename } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { SseHub } from './sse.js';
import { startWatcher, type WatcherHandle } from './watcher.js';
import { diffSnapshotIssues } from './snapshot-diff.js';
import type { Snapshot } from '../types.js';
import type { ServerConfig } from './config.js';

const SNAPSHOT_SUFFIX = '.snapshot.json';

function projectIdFromPath(path: string): string | null {
  const name = basename(path);
  if (!name.endsWith(SNAPSHOT_SUFFIX)) return null;
  return name.slice(0, -SNAPSHOT_SUFFIX.length);
}

export interface StartServerOptions {
  config: ServerConfig;
  uiDir?: string;
  /** SSE heartbeat interval; defaults to 15s. */
  heartbeatMs?: number;
  /** Watcher debounce window; defaults to 200ms. */
  debounceMs?: number;
}

export interface RunningServer {
  url: string;
  port: number;
  hub: SseHub;
  close: () => Promise<void>;
}

export async function startServer(
  opts: StartServerOptions,
): Promise<RunningServer> {
  const hub = new SseHub();

  let shutdownInvoked = false;
  let closeFn: () => Promise<void> = async () => {
    // populated below
  };

  const app = createApp({
    config: opts.config,
    hub,
    uiDir: opts.uiDir,
    shutdown: async () => {
      if (shutdownInvoked) return;
      shutdownInvoked = true;
      await closeFn();
    },
  });

  const server = serve({
    fetch: app.fetch,
    port: opts.config.port,
  });

  const address = await new Promise<AddressInfo>((resolve, reject) => {
    server.once('listening', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolve(addr);
      else reject(new Error('Unable to resolve server address'));
    });
    server.once('error', reject);
  });

  // Per-project snapshot cache — enables diffing so clients can selectively
  // invalidate queries instead of refetching every issue on every change.
  const lastSnapshot = new Map<string, Snapshot>();

  const watcher: WatcherHandle = startWatcher({
    dir: opts.config.sidecarDir,
    debounceMs: opts.debounceMs ?? 200,
    onChange: (path) => {
      const projectId = projectIdFromPath(path);
      if (!projectId) return;
      void (async () => {
        let next: Snapshot | null = null;
        try {
          const raw = await fs.readFile(path, 'utf8');
          const parsed = JSON.parse(raw) as Partial<Snapshot>;
          if (parsed && Array.isArray(parsed.issues)) {
            next = parsed as Snapshot;
          }
        } catch {
          next = null;
        }
        const prev = lastSnapshot.get(projectId) ?? null;
        const changedIssueIds = next
          ? diffSnapshotIssues(prev, next)
          : [];
        if (next) lastSnapshot.set(projectId, next);
        await hub.broadcast({
          event: 'snapshot-changed',
          data: {
            projectId,
            generatedAt: next?.generated_at ?? new Date().toISOString(),
            changedIssueIds,
          },
        });
      })();
    },
  });

  const heartbeatTimer = setInterval(
    () => {
      void hub.heartbeat();
    },
    opts.heartbeatMs ?? 15_000,
  );
  heartbeatTimer.unref();

  closeFn = async () => {
    clearInterval(heartbeatTimer);
    await watcher.close();
    await hub.closeAll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  const port = address.port;
  return {
    url: `http://localhost:${port}`,
    port,
    hub,
    close: closeFn,
  };
}
