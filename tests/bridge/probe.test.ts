import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import { probeHelixServer } from '../../src/bridge/probe.js';

interface StubHandle {
  url: string;
  close: () => Promise<void>;
}

async function startStub(configure: (app: Hono) => void): Promise<StubHandle> {
  const app = new Hono();
  configure(app);
  const server = serve({ fetch: app.fetch, port: 0 });
  const addr = await new Promise<AddressInfo>((resolve, reject) => {
    server.once('listening', () => {
      const a = server.address();
      if (a && typeof a === 'object') resolve(a);
      else reject(new Error('address unavailable'));
    });
    server.once('error', reject);
  });
  return {
    url: `http://localhost:${addr.port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

describe('probeHelixServer', () => {
  const cleanup: StubHandle[] = [];

  afterEach(async () => {
    for (const h of cleanup.splice(0)) await h.close();
  });

  it('returns null when nothing listens at the URL', async () => {
    // Bind then close → port is definitively free.
    const stub = await startStub(() => {});
    await stub.close();
    const result = await probeHelixServer(stub.url, { timeoutMs: 200 });
    expect(result).toBeNull();
  });

  it('returns null when the server responds with a non-helix shape', async () => {
    const stub = await startStub((app) => {
      app.get('/_helix-id', (c) => c.json({ different: 'payload' }));
    });
    cleanup.push(stub);
    const result = await probeHelixServer(stub.url);
    expect(result).toBeNull();
  });

  it('returns null when /_helix-id is absent (404)', async () => {
    const stub = await startStub(() => {});
    cleanup.push(stub);
    const result = await probeHelixServer(stub.url);
    expect(result).toBeNull();
  });

  it('returns null when the response body is not JSON', async () => {
    const stub = await startStub((app) => {
      app.get('/_helix-id', (c) => c.text('hello, plain text'));
    });
    cleanup.push(stub);
    const result = await probeHelixServer(stub.url);
    expect(result).toBeNull();
  });

  it('returns the parsed payload when a helix server responds', async () => {
    const stub = await startStub((app) => {
      app.get('/_helix-id', (c) =>
        c.json({ ok: true, mode: 'deck', projectId: null, pid: 99999 }),
      );
    });
    cleanup.push(stub);
    const result = await probeHelixServer(stub.url);
    expect(result).not.toBeNull();
    expect(result?.mode).toBe('deck');
    expect(result?.pid).toBe(99999);
  });

  it('returns null and aborts when the probe exceeds the timeout', async () => {
    const stub = await startStub((app) => {
      app.get('/_helix-id', async (c) => {
        await new Promise((r) => setTimeout(r, 500));
        return c.json({ ok: true, mode: 'deck', projectId: null, pid: 1 });
      });
    });
    cleanup.push(stub);
    const start = Date.now();
    const result = await probeHelixServer(stub.url, { timeoutMs: 50 });
    const elapsed = Date.now() - start;
    expect(result).toBeNull();
    expect(elapsed).toBeLessThan(400);
  });

  it('uses a 500ms default timeout when not specified', async () => {
    const stub = await startStub((app) => {
      app.get('/_helix-id', async (c) => {
        await new Promise((r) => setTimeout(r, 1500));
        return c.json({ ok: true, mode: 'deck', projectId: null, pid: 1 });
      });
    });
    cleanup.push(stub);
    const start = Date.now();
    const result = await probeHelixServer(stub.url);
    const elapsed = Date.now() - start;
    expect(result).toBeNull();
    expect(elapsed).toBeLessThan(1000);
  });

  it('strips a trailing slash from the base URL before probing', async () => {
    const stub = await startStub((app) => {
      app.get('/_helix-id', (c) =>
        c.json({ ok: true, mode: 'project', projectId: 'p1', pid: 42 }),
      );
    });
    cleanup.push(stub);
    const result = await probeHelixServer(`${stub.url}/`);
    expect(result?.projectId).toBe('p1');
  });

  it('returns null for 5xx responses', async () => {
    const stub = await startStub((app) => {
      app.get('/_helix-id', (c) => c.json({ error: 'boom' }, 500));
    });
    cleanup.push(stub);
    const result = await probeHelixServer(stub.url);
    expect(result).toBeNull();
  });
});
