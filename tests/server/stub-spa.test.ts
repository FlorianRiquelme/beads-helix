/**
 * Stub SPA integration tests (phase 7 done-def: "integration test with
 * stub SPA"). Verifies the `createApp` static-asset + SPA-fallback path
 * end-to-end against a hand-rolled dist/ui/ directory, so downstream UI
 * tickets inherit a locked-in contract.
 */
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

describe('stub SPA serving', () => {
  let uiDir: string;

  beforeEach(async () => {
    uiDir = makeTmpDir();
    await fs.writeFile(
      join(uiDir, 'index.html'),
      '<!doctype html><html><body>STUB SPA</body></html>',
      'utf8',
    );
    await fs.writeFile(
      join(uiDir, 'app.js'),
      'window.__stub = true;',
      'utf8',
    );
    await fs.writeFile(
      join(uiDir, 'app.css'),
      'body { color: red; }',
      'utf8',
    );
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('serves dist/ui/index.html at / when uiDir is configured', async () => {
    const app = createApp({
      config: makeConfig(),
      hub: new SseHub(),
      shutdown: () => {},
      uiDir,
    });
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('STUB SPA');
    expect(body).not.toContain('helix flight deck — placeholder');
  });

  it('serves static JS assets with application/javascript content-type', async () => {
    const app = createApp({
      config: makeConfig(),
      hub: new SseHub(),
      shutdown: () => {},
      uiDir,
    });
    const res = await app.request('/app.js');
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('application/javascript');
    expect(await res.text()).toContain('window.__stub');
  });

  it('serves static CSS assets with text/css content-type', async () => {
    const app = createApp({
      config: makeConfig(),
      hub: new SseHub(),
      shutdown: () => {},
      uiDir,
    });
    const res = await app.request('/app.css');
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('text/css');
  });

  it('falls back to index.html on deep SPA routes (e.g. /p/proj-x)', async () => {
    const app = createApp({
      config: makeConfig(),
      hub: new SseHub(),
      shutdown: () => {},
      uiDir,
    });
    const res = await app.request('/p/proj-alpha');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('STUB SPA');
  });

  it('falls back to index.html for missing asset paths (SPA catchall)', async () => {
    const app = createApp({
      config: makeConfig(),
      hub: new SseHub(),
      shutdown: () => {},
      uiDir,
    });
    const res = await app.request('/does-not-exist.js');
    expect(res.status).toBe(200);
    const body = await res.text();
    // SPA fallback yields the index HTML even though the request looked like an asset
    expect(body).toContain('STUB SPA');
  });

  it('API routes take precedence over the SPA fallback', async () => {
    const app = createApp({
      config: makeConfig(),
      hub: new SseHub(),
      shutdown: () => {},
      uiDir,
    });
    const res = await app.request('/_helix-id');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('application/json');
  });
});

describe('stub SPA — missing index.html', () => {
  it('gracefully falls back to the inline placeholder at /', async () => {
    const emptyUiDir = makeTmpDir();
    try {
      const app = createApp({
        config: makeConfig(),
        hub: new SseHub(),
        shutdown: () => {},
        uiDir: emptyUiDir,
      });
      const res = await app.request('/');
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('helix flight deck — placeholder');
    } finally {
      cleanupTmpDirs();
    }
  });
});
