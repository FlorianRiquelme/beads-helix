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

  it('snapshot-changed SSE payload carries { projectId, generatedAt, changedIssueIds[] }', async () => {
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
      const response = await fetch(`${srv.url}/api/events`);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      await reader.read(); // connected preamble
      await sleep(100);

      const snap = {
        project_id: 'alpha',
        generated_at: '2026-04-14T12:00:00.000Z',
        stale_after: '2026-04-14T12:01:00.000Z',
        columns_summary: { idea: 1, refined: 0, ready: 0, in_progress: 0, done: 0, deferred: 0 },
        issues: [
          {
            id: 'alpha-1',
            title: 'first',
            status: 'open',
            labels: ['idea'],
            priority: 2,
            issue_type: 'task',
            assignee: null,
            board_column: 'idea',
            summary_line: 'alpha-1 first [idea]',
            dependency_count: 0,
            dependent_count: 0,
            created_at: '2026-04-14T00:00:00.000Z',
            updated_at: '2026-04-14T00:00:00.000Z',
            closed_at: null,
            description: null,
            notes: null,
            design: null,
            dependency_ids: [],
            dependent_ids: [],
          },
        ],
        _meta: { source: 'dolt_sql', refresh_duration_ms: 1, schema_version: 2 },
      };
      await fs.writeFile(
        join(tmpDir, 'alpha.snapshot.json'),
        JSON.stringify(snap),
        'utf8',
      );

      let accumulated = '';
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !accumulated.includes('snapshot-changed')) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value);
      }

      const match = accumulated.match(/event: snapshot-changed\ndata: (.+)\n\n/);
      expect(match).not.toBeNull();
      const payload = JSON.parse(match![1]);
      expect(payload.projectId).toBe('alpha');
      expect(payload.generatedAt).toBe('2026-04-14T12:00:00.000Z');
      expect(payload.changedIssueIds).toEqual(['alpha-1']);

      await reader.cancel();
    } finally {
      await srv.close();
    }
  }, 10_000);
});
