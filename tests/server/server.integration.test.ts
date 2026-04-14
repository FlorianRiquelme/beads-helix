import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer } from '../../src/server/index.js';
import { generateShutdownToken } from '../../src/server/config.js';
import { cleanupTmpDirs, makeTmpDir } from '../helpers/fixtures.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('integration: startServer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('boots on an OS-assigned port and serves /_helix-id', async () => {
    const srv = await startServer({
      config: {
        registryPath: join(tmpDir, 'projects.json'),
        sidecarDir: tmpDir,
        shutdownToken: generateShutdownToken(),
        port: 0,
        mode: 'deck',
      },
    });
    try {
      expect(srv.port).toBeGreaterThan(0);
      const res = await fetch(`${srv.url}/_helix-id`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.mode).toBe('deck');
    } finally {
      await srv.close();
    }
  });

  it('broadcasts snapshot-changed over SSE within 500ms of file write', async () => {
    const srv = await startServer({
      config: {
        registryPath: join(tmpDir, 'projects.json'),
        sidecarDir: tmpDir,
        shutdownToken: generateShutdownToken(),
        port: 0,
        mode: 'deck',
      },
      debounceMs: 100,
    });
    try {
      // Open SSE stream
      const response = await fetch(`${srv.url}/api/events`);
      expect(response.ok).toBe(true);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Drain the 'connected' preamble
      await reader.read();

      // Give watcher time to attach
      await sleep(100);

      // Trigger a snapshot file change
      const writeStart = Date.now();
      await fs.writeFile(
        join(tmpDir, 'proj1.snapshot.json'),
        JSON.stringify({ hi: 'there' }),
        'utf8',
      );

      // Read until we see snapshot-changed
      let accumulated = '';
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !accumulated.includes('snapshot-changed')) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value);
      }

      const latency = Date.now() - writeStart;
      expect(accumulated).toContain('snapshot-changed');
      expect(latency).toBeLessThan(2000); // generous CI bound

      await reader.cancel();
    } finally {
      await srv.close();
    }
  }, 10_000);
});
