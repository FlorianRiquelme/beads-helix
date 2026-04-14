import { describe, expect, it } from 'vitest';
import { spawnHelixServer, HELIX_READY_PATTERN } from '../../src/bridge/launcher.js';
import { shutdownChild } from '../../src/bridge/shutdown.js';

const NODE = process.execPath;

function mkEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    HELIX_MODE: 'deck',
    HELIX_REGISTRY_PATH: '/tmp/fake-registry.json',
    HELIX_SIDECAR_DIR: '/tmp',
    HELIX_SHUTDOWN_TOKEN: 'tok',
    HELIX_PORT: '0',
    ...overrides,
  };
}

describe('HELIX_READY_PATTERN', () => {
  it('matches the documented sentinel with a port number', () => {
    const m = 'HELIX_READY port=7373'.match(HELIX_READY_PATTERN);
    expect(m?.groups?.port).toBe('7373');
  });

  it('extracts the port when embedded in a stream of other output', () => {
    const m = 'some noise\nHELIX_READY port=54321\nmore noise'.match(
      HELIX_READY_PATTERN,
    );
    expect(m?.groups?.port).toBe('54321');
  });

  it('does not match malformed sentinels', () => {
    expect('HELIX_READY port='.match(HELIX_READY_PATTERN)).toBeNull();
    expect('HELIXREADY port=1'.match(HELIX_READY_PATTERN)).toBeNull();
    expect('helix_ready port=1'.match(HELIX_READY_PATTERN)).toBeNull();
  });
});

describe('spawnHelixServer', () => {
  it('resolves with url/port when the child emits the sentinel', { timeout: 10_000 }, async () => {
    const script = `
      process.stdout.write('HELIX_READY port=' + process.env.HELIX_PORT + '\\n');
      setInterval(() => {}, 1000);
    `;
    const launched = await spawnHelixServer({
      nodePath: NODE,
      entryArgs: ['-e', script],
      env: mkEnv({ HELIX_PORT: '12345' }),
      timeoutMs: 2000,
    });
    try {
      expect(launched.port).toBe(12345);
      expect(launched.url).toBe('http://localhost:12345');
      expect(launched.child.pid).toBeGreaterThan(0);
    } finally {
      await shutdownChild(launched.child, { graceMs: 500 });
    }
  });

  it('rejects when the child exits before emitting the sentinel', { timeout: 5000 }, async () => {
    const script = `process.stderr.write('oops'); process.exit(2);`;
    await expect(
      spawnHelixServer({
        nodePath: NODE,
        entryArgs: ['-e', script],
        env: mkEnv(),
        timeoutMs: 3000,
      }),
    ).rejects.toThrow(/exited before|code 2/i);
  });

  it('rejects on timeout when the sentinel never arrives', { timeout: 5000 }, async () => {
    const script = `setInterval(() => {}, 1000);`;
    const start = Date.now();
    await expect(
      spawnHelixServer({
        nodePath: NODE,
        entryArgs: ['-e', script],
        env: mkEnv(),
        timeoutMs: 300,
      }),
    ).rejects.toThrow(/timeout/i);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  it('kills the child when timeout fires (no orphan processes)', { timeout: 5000 }, async () => {
    const script = `setInterval(() => {}, 10_000);`;
    let child: ReturnType<(typeof import('node:child_process'))['spawn']> | undefined;
    try {
      await spawnHelixServer({
        nodePath: NODE,
        entryArgs: ['-e', script],
        env: mkEnv(),
        timeoutMs: 150,
        onSpawn: (c) => {
          child = c;
        },
      });
    } catch {
      // expected
    }
    expect(child).toBeDefined();
    // Give the launcher's cleanup a moment to fire
    await new Promise((r) => setTimeout(r, 200));
    expect(child!.killed || child!.exitCode !== null || child!.signalCode !== null).toBe(true);
  });

  it('forwards the env vars to the child', { timeout: 5000 }, async () => {
    // Emit env info AFTER the sentinel so the launcher's detect-and-detach
    // handler doesn't swallow these lines before the test reads them.
    const script = `
      process.stdout.write('HELIX_READY port=999\\n');
      setTimeout(() => {
        process.stdout.write('MODE=' + process.env.HELIX_MODE + '\\n');
        process.stdout.write('TOK=' + process.env.HELIX_SHUTDOWN_TOKEN + '\\n');
      }, 20);
      setInterval(() => {}, 1000);
    `;
    const launched = await spawnHelixServer({
      nodePath: NODE,
      entryArgs: ['-e', script],
      env: mkEnv({ HELIX_MODE: 'project', HELIX_SHUTDOWN_TOKEN: 'secret42' }),
      timeoutMs: 2000,
    });
    try {
      const stdout = await new Promise<string>((resolve) => {
        let acc = '';
        launched.child.stdout?.on('data', (c: Buffer) => {
          acc += c.toString();
          if (acc.includes('TOK=') && acc.includes('MODE=')) resolve(acc);
        });
      });
      expect(stdout).toContain('MODE=project');
      expect(stdout).toContain('TOK=secret42');
    } finally {
      await shutdownChild(launched.child, { graceMs: 500 });
    }
  });

  it('scrubs the parent env (no leak of ambient HELIX_ vars)', { timeout: 5000 }, async () => {
    process.env.HELIX_ROGUE = 'should-not-leak';
    try {
      const script = `
        process.stdout.write('HELIX_READY port=1\\n');
        setTimeout(() => {
          process.stdout.write('ROGUE=' + JSON.stringify(process.env.HELIX_ROGUE ?? null) + '\\n');
        }, 20);
        setInterval(() => {}, 1000);
      `;
      const launched = await spawnHelixServer({
        nodePath: NODE,
        entryArgs: ['-e', script],
        env: mkEnv(),
        timeoutMs: 2000,
      });
      try {
        const stdout = await new Promise<string>((resolve) => {
          let acc = '';
          launched.child.stdout?.on('data', (c: Buffer) => {
            acc += c.toString();
            if (acc.includes('ROGUE=')) resolve(acc);
          });
        });
        expect(stdout).toContain('ROGUE=null');
      } finally {
        await shutdownChild(launched.child, { graceMs: 500 });
      }
    } finally {
      delete process.env.HELIX_ROGUE;
    }
  });
});
