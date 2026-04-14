import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { SseHub } from '../../src/server/sse.js';
import type { ServerConfig } from '../../src/server/config.js';
import { cleanupTmpDirs, makeTmpDir } from '../helpers/fixtures.js';

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    registryPath: '/tmp/nonexistent/projects.json',
    sidecarDir: '/tmp/nonexistent-sidecar',
    shutdownToken: 'deadbeef',
    port: 0,
    mode: 'deck',
    ...overrides,
  };
}

describe('GET /_helix-id', () => {
  it('returns identity payload', async () => {
    const app = createApp({
      config: makeConfig({ projectId: 'foo' }),
      hub: new SseHub(),
      shutdown: () => {},
    });
    const res = await app.request('/_helix-id');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('deck');
    expect(body.projectId).toBe('foo');
    expect(typeof body.pid).toBe('number');
  });
});

describe('GET /api/snapshot', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('400 when projectId missing', async () => {
    const app = createApp({
      config: makeConfig({ sidecarDir: tmpDir }),
      hub: new SseHub(),
      shutdown: () => {},
    });
    const res = await app.request('/api/snapshot');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('MISSING_PROJECT_ID');
  });

  it('404 structured error when snapshot missing', async () => {
    const app = createApp({
      config: makeConfig({ sidecarDir: tmpDir, projectId: 'proj1' }),
      hub: new SseHub(),
      shutdown: () => {},
    });
    const res = await app.request('/api/snapshot?projectId=proj1');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('SNAPSHOT_NOT_FOUND');
    expect(body.projectId).toBe('proj1');
  });

  it('500 structured error when snapshot is corrupt JSON', async () => {
    const snapshot = join(tmpDir, 'corrupt-test.snapshot.json');
    await fs.writeFile(snapshot, '{ not json', 'utf8');

    const app = createApp({
      config: makeConfig({ sidecarDir: tmpDir, projectId: 'corrupt-test' }),
      hub: new SseHub(),
      shutdown: () => {},
    });
    const res = await app.request('/api/snapshot?projectId=corrupt-test');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('SNAPSHOT_CORRUPT');
  });

  it('200 with parsed body when snapshot exists', async () => {
    const snapshot = join(tmpDir, 'ok-test.snapshot.json');
    const payload = { project_id: 'ok-test', issues: [] };
    await fs.writeFile(snapshot, JSON.stringify(payload), 'utf8');

    const app = createApp({
      config: makeConfig({ sidecarDir: tmpDir, projectId: 'ok-test' }),
      hub: new SseHub(),
      shutdown: () => {},
    });
    const res = await app.request('/api/snapshot?projectId=ok-test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project_id).toBe('ok-test');
  });
});

describe('GET /api/registry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('returns empty registry when file missing', async () => {
    const app = createApp({
      config: makeConfig({ registryPath: join(tmpDir, 'projects.json') }),
      hub: new SseHub(),
      shutdown: () => {},
    });
    const res = await app.request('/api/registry');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(body.projects).toEqual([]);
  });
});

describe('POST /api/registry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('upserts an entry', async () => {
    const app = createApp({
      config: makeConfig({ registryPath: join(tmpDir, 'projects.json') }),
      hub: new SseHub(),
      shutdown: () => {},
    });
    const entry = {
      id: 'p1',
      path: tmpDir,
      name: 'p1',
      added_at: '2026-04-14T10:00:00.000Z',
      last_seen_at: '2026-04-14T10:00:00.000Z',
      status: 'active',
    };
    const res = await app.request('/api/registry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', entry }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].id).toBe('p1');
  });

  it('400 on invalid mutation', async () => {
    const app = createApp({
      config: makeConfig({ registryPath: join(tmpDir, 'projects.json') }),
      hub: new SseHub(),
      shutdown: () => {},
    });
    const res = await app.request('/api/registry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'garbage' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 on non-json body', async () => {
    const app = createApp({
      config: makeConfig({ registryPath: join(tmpDir, 'projects.json') }),
      hub: new SseHub(),
      shutdown: () => {},
    });
    const res = await app.request('/api/registry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /_shutdown', () => {
  it('403 without Origin', async () => {
    let shutdownCalled = false;
    const app = createApp({
      config: makeConfig(),
      hub: new SseHub(),
      shutdown: () => {
        shutdownCalled = true;
      },
    });
    const res = await app.request('/_shutdown', {
      method: 'POST',
      body: 'deadbeef',
    });
    expect(res.status).toBe(403);
    expect(shutdownCalled).toBe(false);
  });

  it('403 with mismatched Origin', async () => {
    let shutdownCalled = false;
    const app = createApp({
      config: makeConfig(),
      hub: new SseHub(),
      shutdown: () => {
        shutdownCalled = true;
      },
    });
    const res = await app.request('/_shutdown', {
      method: 'POST',
      headers: {
        origin: 'http://evil.com',
        host: 'localhost:7373',
      },
      body: 'deadbeef',
    });
    expect(res.status).toBe(403);
    expect(shutdownCalled).toBe(false);
  });

  it('403 with matching Origin but bad token', async () => {
    let shutdownCalled = false;
    const app = createApp({
      config: makeConfig(),
      hub: new SseHub(),
      shutdown: () => {
        shutdownCalled = true;
      },
    });
    const res = await app.request('/_shutdown', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:7373',
        host: 'localhost:7373',
      },
      body: 'wrong-token',
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('TOKEN_REJECTED');
    expect(shutdownCalled).toBe(false);
  });

  it('200 with matching Origin and correct token → triggers shutdown', async () => {
    let shutdownCalled = false;
    const app = createApp({
      config: makeConfig(),
      hub: new SseHub(),
      shutdown: () => {
        shutdownCalled = true;
      },
    });
    const res = await app.request('/_shutdown', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:7373',
        host: 'localhost:7373',
      },
      body: 'deadbeef',
    });
    expect(res.status).toBe(200);
    // Shutdown is queued as microtask; wait for it.
    await new Promise((r) => setTimeout(r, 10));
    expect(shutdownCalled).toBe(true);
  });

  it('accepts token via JSON body', async () => {
    let shutdownCalled = false;
    const app = createApp({
      config: makeConfig(),
      hub: new SseHub(),
      shutdown: () => {
        shutdownCalled = true;
      },
    });
    const res = await app.request('/_shutdown', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:7373',
        host: 'localhost:7373',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token: 'deadbeef' }),
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(shutdownCalled).toBe(true);
  });
});

describe('GET /', () => {
  it('serves placeholder HTML when no uiDir configured', async () => {
    const app = createApp({
      config: makeConfig(),
      hub: new SseHub(),
      shutdown: () => {},
    });
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('helix flight deck');
  });
});
