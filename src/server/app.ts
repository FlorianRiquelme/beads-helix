import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  readRegistry,
  upsertProject,
  removeProject,
  healStatuses,
} from '../bridge/registry.js';
import { ProjectEntrySchema } from '../shared/registry-schema.js';
import { SseHub } from './sse.js';
import type { ServerConfig } from './config.js';

export interface AppContext {
  config: ServerConfig;
  hub: SseHub;
  /** Called by POST /_shutdown — runs process exit or test hook. */
  shutdown: () => Promise<void> | void;
  /** Static dist/ui/ directory. Optional for tests without a built UI. */
  uiDir?: string;
}

const RegistryMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('upsert'), entry: ProjectEntrySchema }),
  z.object({ action: z.literal('remove'), id: z.string().min(1) }),
  z.object({ action: z.literal('undo'), id: z.string().min(1) }),
]);

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /_helix-id — self-identification for port adoption probes.
  app.get('/_helix-id', (c) =>
    c.json({
      ok: true,
      mode: ctx.config.mode,
      projectId: ctx.config.projectId ?? null,
      pid: process.pid,
    }),
  );

  // GET /api/snapshot?projectId=X — reads atomic snapshot file, returns
  // structured error on miss/corrupt (never 500 HTML).
  app.get('/api/snapshot', async (c) => {
    const projectId = c.req.query('projectId') ?? ctx.config.projectId;
    if (!projectId) {
      return c.json(
        { error: 'MISSING_PROJECT_ID', message: 'projectId query param required' },
        400,
      );
    }
    const path = join(ctx.config.sidecarDir, `${projectId}.snapshot.json`);
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return c.json(
          {
            error: 'SNAPSHOT_NOT_FOUND',
            message: `Snapshot missing at ${path}. Run 'helix snapshot refresh' first.`,
            projectId,
          },
          404,
        );
      }
      return c.json(
        {
          error: 'SNAPSHOT_READ_ERROR',
          message: (err as Error).message,
          projectId,
        },
        500,
      );
    }
    try {
      const parsed = JSON.parse(raw);
      return c.json(parsed);
    } catch (err) {
      return c.json(
        {
          error: 'SNAPSHOT_CORRUPT',
          message: `Snapshot at ${path} is not valid JSON: ${(err as Error).message}`,
          projectId,
        },
        500,
      );
    }
  });

  // GET /api/issue/:id?projectId= — returns a single issue sliced from the
  // snapshot file. No extra Dolt reads; reuses the same atomic file the board
  // already depends on.
  app.get('/api/issue/:id', async (c) => {
    const issueId = c.req.param('id');
    const projectId = c.req.query('projectId') ?? ctx.config.projectId;
    if (!projectId) {
      return c.json(
        { error: 'MISSING_PROJECT_ID', message: 'projectId query param required' },
        400,
      );
    }
    const path = join(ctx.config.sidecarDir, `${projectId}.snapshot.json`);
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return c.json(
          {
            error: 'SNAPSHOT_NOT_FOUND',
            message: `Snapshot missing at ${path}. Run 'helix snapshot refresh' first.`,
            projectId,
          },
          404,
        );
      }
      return c.json(
        {
          error: 'SNAPSHOT_READ_ERROR',
          message: (err as Error).message,
          projectId,
        },
        500,
      );
    }
    let parsed: { issues?: Array<{ id: string }> };
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return c.json(
        {
          error: 'SNAPSHOT_CORRUPT',
          message: `Snapshot at ${path} is not valid JSON: ${(err as Error).message}`,
          projectId,
        },
        500,
      );
    }
    const issue = parsed.issues?.find((i) => i.id === issueId);
    if (!issue) {
      return c.json(
        { error: 'ISSUE_NOT_FOUND', projectId, id: issueId },
        404,
      );
    }
    return c.json(issue);
  });

  // GET /api/registry — read current registry with lazy status healing.
  app.get('/api/registry', async (c) => {
    const registry = await readRegistry({ path: ctx.config.registryPath });
    const healed = await healStatuses(registry);
    return c.json(healed);
  });

  // POST /api/registry — mutation intent from UI (undo toast, etc.).
  app.post('/api/registry', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'INVALID_JSON' }, 400);
    }
    const result = RegistryMutationSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: 'INVALID_MUTATION', details: result.error.flatten() },
        400,
      );
    }
    const mutation = result.data;
    try {
      if (mutation.action === 'upsert') {
        const r = await upsertProject(mutation.entry, {
          path: ctx.config.registryPath,
        });
        return c.json(r);
      }
      if (mutation.action === 'remove' || mutation.action === 'undo') {
        const r = await removeProject(mutation.id, {
          path: ctx.config.registryPath,
        });
        return c.json(r);
      }
      return c.json({ error: 'UNSUPPORTED_ACTION' }, 400);
    } catch (err) {
      return c.json(
        { error: 'REGISTRY_WRITE_FAILED', message: (err as Error).message },
        500,
      );
    }
  });

  // GET /api/events — SSE stream for snapshot-changed events.
  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      ctx.hub.add(stream);
      await stream.writeSSE({ event: 'connected', data: 'ok' });
      // Keep stream open until client disconnects.
      stream.onAbort(() => {
        ctx.hub.remove(stream);
      });
      await new Promise<void>(() => {
        // Never resolves; relies on onAbort.
      });
    }),
  );

  // POST /_shutdown — token + Origin validated lifecycle endpoint.
  app.post('/_shutdown', async (c) => {
    const origin = c.req.header('origin');
    const host = c.req.header('host');
    const expectedOrigin = host ? `http://${host}` : null;
    if (!origin || !expectedOrigin || origin !== expectedOrigin) {
      return c.json({ error: 'ORIGIN_REJECTED', got: origin ?? null }, 403);
    }

    // Token may arrive via JSON body or raw text (sendBeacon sends Blob).
    let token: string | undefined;
    const contentType = c.req.header('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const body = (await c.req.json()) as { token?: string };
        token = body.token;
      } catch {
        // Fall through; treat as missing token.
      }
    } else {
      token = (await c.req.text()).trim() || undefined;
    }

    if (token !== ctx.config.shutdownToken) {
      return c.json({ error: 'TOKEN_REJECTED' }, 403);
    }

    // Fire-and-forget: respond before initiating shutdown so the client
    // sees a success response.
    queueMicrotask(() => {
      void Promise.resolve(ctx.shutdown()).catch(() => {
        // best-effort
      });
    });
    return c.json({ ok: true });
  });

  // GET / — SPA shell. Serves dist/ui/index.html if available, otherwise
  // returns the placeholder from downstream UI tickets not yet landed.
  app.get('/', async (c) => {
    if (ctx.uiDir) {
      try {
        const html = await fs.readFile(join(ctx.uiDir, 'index.html'), 'utf8');
        return c.html(html);
      } catch {
        // Fall through to placeholder.
      }
    }
    return c.html(PLACEHOLDER_HTML);
  });

  // Fallback for SPA routes — serve index.html so client router can handle it.
  app.get('*', async (c) => {
    if (!ctx.uiDir) return c.notFound();
    const path = c.req.path;
    // Serve static asset if it exists
    try {
      const assetPath = join(ctx.uiDir, path);
      const data = await fs.readFile(assetPath);
      const ext = path.slice(path.lastIndexOf('.'));
      return c.body(new Uint8Array(data), 200, { 'content-type': contentType(ext) });
    } catch {
      // SPA fallback to index.html
      try {
        const html = await fs.readFile(join(ctx.uiDir, 'index.html'), 'utf8');
        return c.html(html);
      } catch {
        return c.notFound();
      }
    }
  });

  return app;
}

function contentType(ext: string): string {
  switch (ext) {
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

const PLACEHOLDER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>helix flight deck</title>
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1.5rem; color: #333; }
      code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; }
      h1 { font-size: 1.5rem; }
      p { line-height: 1.6; }
    </style>
  </head>
  <body>
    <h1>helix flight deck — placeholder</h1>
    <p>The server is running. The Level 1 (cross-project deck) and Level 2 (single-project kanban) UIs ship in downstream tickets.</p>
    <p>API endpoints:</p>
    <ul>
      <li><code>GET /api/snapshot?projectId=&lt;id&gt;</code></li>
      <li><code>GET /api/registry</code></li>
      <li><code>GET /api/events</code> (SSE)</li>
      <li><code>GET /_helix-id</code></li>
    </ul>
  </body>
</html>
`;
