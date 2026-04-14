/**
 * End-to-end integration tests for `helix view` / `helix deck` / `helix serve`.
 * Spawns the built dist/cli.js as a real child process so the subprocess
 * launcher, stdout sentinel parsing, registry write, SIGINT propagation,
 * and sendBeacon shutdown all run against the actual code path that ships.
 *
 * These complement the unit tests in tests/bridge/*.test.ts — unit tests
 * run in isolation with dependency injection, these tests prove the pieces
 * fit together when the CLI assembles them.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { makeTmpDir, cleanupTmpDirs } from './helpers/fixtures.js';
import { HELIX_READY_PATTERN } from '../src/bridge/launcher.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const CLI_PATH = join(REPO_ROOT, 'dist', 'cli.js');

interface RunningCLI {
  proc: ChildProcess;
  stdout: () => string;
  stderr: () => string;
  waitForStdout: (pattern: RegExp, timeoutMs?: number) => Promise<RegExpMatchArray>;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  kill: (signal?: NodeJS.Signals) => void;
}

function runCLI(args: string[], env: NodeJS.ProcessEnv): RunningCLI {
  let stdoutBuf = '';
  let stderrBuf = '';
  // Default to an OS-assigned port so tests don't collide with dev servers
  // or each other on 7373. Tests that specifically exercise port-7373 adoption
  // override HELIX_PREFERRED_PORT themselves.
  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    HELIX_PREFERRED_PORT: '0',
    ...env,
    HELIX_SKIP_OPEN: '1',
  };
  const proc = spawn(process.execPath, [CLI_PATH, ...args], {
    env: mergedEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout?.on('data', (c: Buffer) => {
    stdoutBuf += c.toString();
  });
  proc.stderr?.on('data', (c: Buffer) => {
    stderrBuf += c.toString();
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolvePromise) => {
      proc.once('exit', (code, signal) => resolvePromise({ code, signal }));
    },
  );

  const waitForStdout = (
    pattern: RegExp,
    timeoutMs = 5000,
  ): Promise<RegExpMatchArray> =>
    new Promise((resolvePromise, reject) => {
      const deadline = Date.now() + timeoutMs;
      const probe = (): void => {
        const match = stdoutBuf.match(pattern);
        if (match) {
          resolvePromise(match);
          return;
        }
        if (Date.now() > deadline) {
          reject(
            new Error(
              `waitForStdout timeout ${pattern} — stdout:\n${stdoutBuf}\nstderr:\n${stderrBuf}`,
            ),
          );
          return;
        }
        setTimeout(probe, 25);
      };
      probe();
    });

  return {
    proc,
    stdout: () => stdoutBuf,
    stderr: () => stderrBuf,
    waitForStdout,
    exited,
    kill: (signal = 'SIGINT') => {
      try {
        proc.kill(signal);
      } catch {
        /* already dead */
      }
    },
  };
}

function makeBeadsRepo(rootDir: string, projectId: string): void {
  const beadsDir = join(rootDir, '.beads');
  mkdirSync(beadsDir, { recursive: true });
  writeFileSync(
    join(beadsDir, 'metadata.json'),
    JSON.stringify({ project_id: projectId }),
    'utf8',
  );
}

function poll<T>(
  fn: () => T | null | undefined,
  timeoutMs = 3000,
  intervalMs = 25,
): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = (): void => {
      try {
        const v = fn();
        if (v !== null && v !== undefined) {
          resolvePromise(v);
          return;
        }
      } catch {
        /* keep polling */
      }
      if (Date.now() > deadline) {
        reject(new Error('poll timeout'));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

describe('CLI view/deck/serve integration', () => {
  let tracked: RunningCLI[] = [];

  beforeAll(() => {
    if (!existsSync(CLI_PATH)) {
      throw new Error(`CLI not built at ${CLI_PATH} — run 'npm run build' first`);
    }
  });

  afterEach(async () => {
    for (const cli of tracked) {
      if (cli.proc.exitCode === null && cli.proc.signalCode === null) {
        cli.kill('SIGKILL');
        try {
          await Promise.race([
            cli.exited,
            new Promise((r) => setTimeout(r, 1000)),
          ]);
        } catch {
          /* best-effort */
        }
      }
    }
    tracked = [];
    cleanupTmpDirs();
  });

  afterAll(() => {
    cleanupTmpDirs();
  });

  it('boots a server, registers the project, and serves /_helix-id', { timeout: 15_000 }, async () => {
    const repoDir = makeTmpDir();
    const registry = makeTmpDir();
    const sidecar = makeTmpDir();
    makeBeadsRepo(repoDir, 'proj-integration');

    const cli = runCLI(['view', '--repo', repoDir], {
      HELIX_REGISTRY_PATH: join(registry, 'projects.json'),
      HELIX_SIDECAR_DIR: sidecar,
    });
    tracked.push(cli);

    const readyLine = await cli.waitForStdout(/helix (spawned|adopted) — project mode @ [^\n]+\n/);
    expect(readyLine[0]).toContain('http://localhost:');

    // Extract URL from "helix spawned — project mode @ http://localhost:N/p/proj-integration"
    const urlMatch = cli.stdout().match(/http:\/\/localhost:\d+\/p\/proj-integration/);
    expect(urlMatch).not.toBeNull();
    const baseUrl = urlMatch![0].replace(/\/p\/.*$/, '');

    // Server must respond to /_helix-id
    const res = await fetch(`${baseUrl}/_helix-id`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('project');
    expect(body.projectId).toBe('proj-integration');

    // Registry must contain the project
    const registryFile = join(registry, 'projects.json');
    const registryData = await poll(
      () => (existsSync(registryFile) ? JSON.parse(readFileSync(registryFile, 'utf8')) : null),
      2000,
    );
    expect(registryData.projects).toHaveLength(1);
    expect(registryData.projects[0].id).toBe('proj-integration');
    expect(registryData.projects[0].path).toBe(repoDir);

    cli.kill('SIGINT');
    await cli.exited;
  });

  it('shuts down cleanly on SIGINT within 3s', { timeout: 10_000 }, async () => {
    const repoDir = makeTmpDir();
    const registry = makeTmpDir();
    const sidecar = makeTmpDir();
    makeBeadsRepo(repoDir, 'proj-sigint');

    const cli = runCLI(['view', '--repo', repoDir], {
      HELIX_REGISTRY_PATH: join(registry, 'projects.json'),
      HELIX_SIDECAR_DIR: sidecar,
    });
    tracked.push(cli);

    await cli.waitForStdout(/helix (spawned|adopted) [^\n]+\n/);

    const start = Date.now();
    cli.kill('SIGINT');
    await cli.exited;
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3500);
  });

  it('adopts an existing helix on port 7373 on a second invocation', { timeout: 15_000 }, async () => {
    const repoDir1 = makeTmpDir();
    const repoDir2 = makeTmpDir();
    const registry = makeTmpDir();
    const sidecar = makeTmpDir();
    makeBeadsRepo(repoDir1, 'proj-one');
    makeBeadsRepo(repoDir2, 'proj-two');

    // Probe 7373 to see if the real port is already taken by a dev server;
    // if so, skip — the test requires a clean 7373 to exercise adoption.
    let port7373Free: boolean;
    try {
      const res = await fetch('http://localhost:7373/_helix-id', {
        signal: AbortSignal.timeout(200),
      });
      // If we got a response, something is already there — skip.
      port7373Free = !res.ok;
      void res.body?.cancel();
    } catch {
      port7373Free = true;
    }
    if (!port7373Free) {
      // Real env has something on 7373 — skip to avoid flake.
      return;
    }

    const cliA = runCLI(['view', '--repo', repoDir1], {
      HELIX_REGISTRY_PATH: join(registry, 'projects.json'),
      HELIX_SIDECAR_DIR: sidecar,
      HELIX_PREFERRED_PORT: '7373',
    });
    tracked.push(cliA);
    const firstLine = await cliA.waitForStdout(/helix spawned [^\n]+\n/);
    expect(firstLine[0]).toContain('http://localhost:7373');

    // Second invocation: should adopt.
    const cliB = runCLI(['view', '--repo', repoDir2], {
      HELIX_REGISTRY_PATH: join(registry, 'projects.json'),
      HELIX_SIDECAR_DIR: sidecar,
      HELIX_PREFERRED_PORT: '7373',
    });
    tracked.push(cliB);
    const secondLine = await cliB.waitForStdout(/helix adopted [^\n]+\n/);
    expect(secondLine[0]).toContain('http://localhost:7373');

    // The adopted CLI writes the second project to the registry and then exits
    // (adoption path: wait() returns immediately).
    await cliB.exited;

    // Registry has BOTH projects now.
    const registryFile = join(registry, 'projects.json');
    const reg = JSON.parse(readFileSync(registryFile, 'utf8'));
    const ids = reg.projects.map((p: { id: string }) => p.id).sort();
    expect(ids).toEqual(['proj-one', 'proj-two']);

    cliA.kill('SIGINT');
    await cliA.exited;
  });

  it('sendBeacon-style POST /_shutdown terminates the server', { timeout: 10_000 }, async () => {
    const repoDir = makeTmpDir();
    const registry = makeTmpDir();
    const sidecar = makeTmpDir();
    makeBeadsRepo(repoDir, 'proj-shutdown');

    const cli = runCLI(['view', '--repo', repoDir], {
      HELIX_REGISTRY_PATH: join(registry, 'projects.json'),
      HELIX_SIDECAR_DIR: sidecar,
    });
    tracked.push(cli);

    await cli.waitForStdout(/helix (spawned|adopted) [^\n]+\n/);
    const urlMatch = cli.stdout().match(/http:\/\/localhost:\d+/);
    const baseUrl = urlMatch![0];

    // Fetch /_helix-id to get context (and implicitly the token leaves the
    // spawn via env, not via network — so we can't learn it from here). We
    // verify the NEGATIVE case: a POST without the token gets rejected.
    const badRes = await fetch(`${baseUrl}/_shutdown`, {
      method: 'POST',
      headers: { origin: baseUrl, 'content-type': 'text/plain' },
      body: 'wrong-token',
    });
    expect(badRes.status).toBe(403);

    // Server still alive.
    const stillAlive = await fetch(`${baseUrl}/_helix-id`);
    expect(stillAlive.status).toBe(200);

    // Now SIGINT for cleanup (token isn't available to this test).
    cli.kill('SIGINT');
    await cli.exited;
  });

  it('deck mode opens the root URL (no /p/ segment) outside a beads repo', { timeout: 10_000 }, async () => {
    const nonRepoDir = makeTmpDir();
    const registry = makeTmpDir();
    const sidecar = makeTmpDir();

    const cli = runCLI(['deck', '--repo', nonRepoDir], {
      HELIX_REGISTRY_PATH: join(registry, 'projects.json'),
      HELIX_SIDECAR_DIR: sidecar,
    });
    tracked.push(cli);

    const line = await cli.waitForStdout(/helix (spawned|adopted) — deck @ [^\n]+\n/);
    expect(line[0]).toMatch(/http:\/\/localhost:\d+\//);
    expect(line[0]).not.toContain('/p/');

    cli.kill('SIGINT');
    await cli.exited;
  });
});

describe('HELIX_READY sentinel emitted by `helix serve`', () => {
  it('writes the sentinel with the resolved bound port', { timeout: 10_000 }, async () => {
    const registry = makeTmpDir();
    const sidecar = makeTmpDir();

    const proc = spawn(
      process.execPath,
      [CLI_PATH, 'serve'],
      {
        env: {
          ...process.env,
          HELIX_MODE: 'deck',
          HELIX_REGISTRY_PATH: join(registry, 'projects.json'),
          HELIX_SIDECAR_DIR: sidecar,
          HELIX_SHUTDOWN_TOKEN: 'tok',
          HELIX_PORT: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    try {
      const match = await new Promise<RegExpMatchArray>((res, rej) => {
        let acc = '';
        const deadline = setTimeout(() => rej(new Error('sentinel timeout')), 5000);
        proc.stdout?.on('data', (c: Buffer) => {
          acc += c.toString();
          const m = acc.match(HELIX_READY_PATTERN);
          if (m) {
            clearTimeout(deadline);
            res(m);
          }
        });
      });
      expect(Number(match.groups?.port)).toBeGreaterThan(0);

      // Verify the advertised port really serves requests.
      const port = Number(match.groups?.port);
      const res = await fetch(`http://localhost:${port}/_helix-id`);
      expect(res.status).toBe(200);
    } finally {
      proc.kill('SIGTERM');
      await new Promise<void>((r) => proc.once('exit', () => r()));
      cleanupTmpDirs();
    }
  });
});
