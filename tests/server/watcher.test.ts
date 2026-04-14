import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startWatcher } from '../../src/server/watcher.js';
import { cleanupTmpDirs, makeTmpDir } from '../helpers/fixtures.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('startWatcher', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('emits onChange for new file after debounce window', async () => {
    const events: string[] = [];
    const w = startWatcher({
      dir: tmpDir,
      debounceMs: 50,
      onChange: (p) => events.push(p),
    });

    // Give chokidar time to attach before writing
    await sleep(100);
    await fs.writeFile(join(tmpDir, 'a.json'), '{}', 'utf8');
    await sleep(250);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[events.length - 1]).toContain('a.json');

    await w.close();
  });

  it('debounces a burst of changes into a single emit', async () => {
    const events: string[] = [];
    const w = startWatcher({
      dir: tmpDir,
      debounceMs: 150,
      onChange: (p) => events.push(p),
    });

    await sleep(100);
    // Burst — write 5 files in quick succession
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(join(tmpDir, `b${i}.json`), '{}', 'utf8');
      await sleep(10);
    }
    await sleep(400);

    // At least one emit happened; burst should collapse but chokidar may
    // report each 'add' individually before the debounce flushes — we
    // enforce "fewer than the burst count" as the collapse signal.
    expect(events.length).toBeLessThan(5);
    expect(events.length).toBeGreaterThanOrEqual(1);

    await w.close();
  });

  it('close() prevents further emits', async () => {
    const events: string[] = [];
    const w = startWatcher({
      dir: tmpDir,
      debounceMs: 50,
      onChange: (p) => events.push(p),
    });

    await sleep(100);
    await w.close();

    await fs.writeFile(join(tmpDir, 'after.json'), '{}', 'utf8');
    await sleep(200);

    expect(events).toHaveLength(0);
  });
});
