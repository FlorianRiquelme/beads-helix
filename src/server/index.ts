import { serve } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { SseHub } from './sse.js';
import { startWatcher, type WatcherHandle } from './watcher.js';
import type { ServerConfig } from './config.js';

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

  const watcher: WatcherHandle = startWatcher({
    dir: opts.config.sidecarDir,
    debounceMs: opts.debounceMs ?? 200,
    onChange: (path) => {
      void hub.broadcast({ event: 'snapshot-changed', data: { path } });
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
