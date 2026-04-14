import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runView } from '../../src/commands/view.js';
import type { RunViewDeps } from '../../src/commands/view.js';
import { makeTmpDir, cleanupTmpDirs } from '../helpers/fixtures.js';

interface FakeChild {
  pid: number;
  kill: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
}

function makeFakeChild(overrides: Partial<FakeChild> = {}): FakeChild {
  return {
    pid: 12345,
    kill: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    exitCode: null,
    signalCode: null,
    ...overrides,
  };
}

function baseDeps(
  overrides: Partial<RunViewDeps> = {},
  tmpDir: string,
): RunViewDeps {
  return {
    findBeadsRepo: vi.fn(() => null),
    refresh: vi.fn(async () => ({
      status: 'refreshed' as const,
      snapshot_path: '/tmp/x.json',
      source: 'dolt-embedded' as const,
    })),
    probe: vi.fn(async () => null),
    spawn: vi.fn(async () => ({
      child: makeFakeChild() as never,
      port: 7373,
      url: 'http://localhost:7373',
    })),
    open: vi.fn(async () => {}),
    upsertProject: vi.fn(async () => ({ version: 1 as const, projects: [] })),
    shutdownChild: vi.fn(async () => 'graceful' as const),
    installSigint: vi.fn((_cb) => () => {}),
    waitForExit: vi.fn(() => Promise.resolve()),
    generateToken: vi.fn(() => 'test-token'),
    now: vi.fn(() => new Date('2026-04-14T12:00:00.000Z')),
    paths: {
      registry: `${tmpDir}/registry.json`,
      sidecar: tmpDir,
    },
    stdout: vi.fn(),
    stderr: vi.fn(),
    entryArgs: ['-e', 'process.exit(0)'],
    ...overrides,
  };
}

describe('runView', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('runs deck mode when cwd is not inside a beads repo', async () => {
    const deps = baseDeps({}, tmpDir);
    const result = await runView({ cwd: tmpDir, deps });
    expect(result.mode).toBe('deck');
    expect(result.projectId).toBeUndefined();
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it('runs project mode when findBeadsRepo returns a repo', async () => {
    const deps = baseDeps(
      {
        findBeadsRepo: vi.fn(() => ({
          root: '/my/proj',
          beadsDir: '/my/proj/.beads',
          projectId: 'proj-alpha',
          doltDatabase: 'hq',
        })),
      },
      tmpDir,
    );
    const result = await runView({ cwd: '/my/proj', deps });
    expect(result.mode).toBe('project');
    expect(result.projectId).toBe('proj-alpha');
    expect(deps.refresh).toHaveBeenCalled();
  });

  it('forceDeck overrides in-repo detection', async () => {
    const deps = baseDeps(
      {
        findBeadsRepo: vi.fn(() => ({
          root: '/my/proj',
          beadsDir: '/my/proj/.beads',
          projectId: 'proj-alpha',
          doltDatabase: 'hq',
        })),
      },
      tmpDir,
    );
    const result = await runView({ cwd: '/my/proj', forceDeck: true, deps });
    expect(result.mode).toBe('deck');
    expect(result.projectId).toBeUndefined();
  });

  it('adopts an existing helix server when probe returns a payload', async () => {
    const deps = baseDeps(
      {
        probe: vi.fn(async () => ({
          ok: true as const,
          mode: 'deck' as const,
          projectId: null,
          pid: 99,
        })),
      },
      tmpDir,
    );
    const result = await runView({ cwd: tmpDir, deps });
    expect(result.action).toBe('adopted');
    expect(deps.spawn).not.toHaveBeenCalled();
    expect(deps.open).toHaveBeenCalledWith('http://localhost:7373/');
  });

  it('spawns a server when probe returns null', async () => {
    const deps = baseDeps({}, tmpDir);
    const result = await runView({ cwd: tmpDir, deps });
    expect(result.action).toBe('spawned');
    expect(deps.spawn).toHaveBeenCalled();
  });

  it('opens the /p/<id> URL when in project mode', async () => {
    const deps = baseDeps(
      {
        findBeadsRepo: vi.fn(() => ({
          root: '/x',
          beadsDir: '/x/.beads',
          projectId: 'proj-xyz',
          doltDatabase: 'hq',
        })),
      },
      tmpDir,
    );
    await runView({ cwd: '/x', deps });
    expect(deps.open).toHaveBeenCalledWith('http://localhost:7373/p/proj-xyz');
  });

  it('opens the deck URL when in deck mode', async () => {
    const deps = baseDeps({}, tmpDir);
    await runView({ cwd: tmpDir, deps });
    expect(deps.open).toHaveBeenCalledWith('http://localhost:7373/');
  });

  it('writes the project to the registry in project mode', async () => {
    const deps = baseDeps(
      {
        findBeadsRepo: vi.fn(() => ({
          root: '/my/proj',
          beadsDir: '/my/proj/.beads',
          projectId: 'proj-alpha',
          doltDatabase: 'hq',
        })),
      },
      tmpDir,
    );
    await runView({ cwd: '/my/proj', deps });
    expect(deps.upsertProject).toHaveBeenCalledTimes(1);
    const [entry] = (deps.upsertProject as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(entry.id).toBe('proj-alpha');
    expect(entry.path).toBe('/my/proj');
  });

  it('does NOT touch the registry in deck mode', async () => {
    const deps = baseDeps({}, tmpDir);
    await runView({ cwd: tmpDir, deps });
    expect(deps.upsertProject).not.toHaveBeenCalled();
  });

  it('registers the project even when adopting (so deck reflects new project)', async () => {
    const deps = baseDeps(
      {
        findBeadsRepo: vi.fn(() => ({
          root: '/my/proj',
          beadsDir: '/my/proj/.beads',
          projectId: 'proj-new',
          doltDatabase: 'hq',
        })),
        probe: vi.fn(async () => ({
          ok: true as const,
          mode: 'deck' as const,
          projectId: null,
          pid: 99,
        })),
      },
      tmpDir,
    );
    const result = await runView({ cwd: '/my/proj', deps });
    expect(result.action).toBe('adopted');
    expect(deps.upsertProject).toHaveBeenCalled();
  });

  it('surfaces refresh failures via stderr but does not abort', async () => {
    const deps = baseDeps(
      {
        findBeadsRepo: vi.fn(() => ({
          root: '/x',
          beadsDir: '/x/.beads',
          projectId: 'p',
          doltDatabase: 'hq',
        })),
        refresh: vi.fn(async () => ({
          status: 'error' as const,
          code: 'SOURCE_UNAVAILABLE' as const,
          snapshot_path: '/tmp/p.json',
          message: 'dolt down',
        })),
      },
      tmpDir,
    );
    const result = await runView({ cwd: '/x', deps });
    expect(result.action).toBe('spawned');
    const stderrCalls = (deps.stderr as ReturnType<typeof vi.fn>).mock.calls;
    const combined = stderrCalls.map((c) => c[0]).join('');
    expect(combined).toMatch(/dolt down|SOURCE_UNAVAILABLE/);
  });

  it('installs a SIGINT handler that shuts the spawned child down', async () => {
    let capturedHandler: (() => void) | null = null;
    const deps = baseDeps(
      {
        installSigint: vi.fn((cb) => {
          capturedHandler = cb;
          return () => {};
        }),
      },
      tmpDir,
    );
    const result = await runView({ cwd: tmpDir, deps });
    expect(capturedHandler).toBeInstanceOf(Function);
    await result.shutdown();
    expect(deps.shutdownChild).toHaveBeenCalled();
  });

  it('does NOT install a SIGINT handler for adopted servers (nothing to shut down)', async () => {
    const deps = baseDeps(
      {
        probe: vi.fn(async () => ({
          ok: true as const,
          mode: 'deck' as const,
          projectId: null,
          pid: 99,
        })),
      },
      tmpDir,
    );
    await runView({ cwd: tmpDir, deps });
    expect(deps.installSigint).not.toHaveBeenCalled();
  });

  it('uses a fresh shutdown token per spawn (not a stable value)', async () => {
    const token1 = 'tok-001';
    const token2 = 'tok-002';
    const tokenGen = vi.fn().mockReturnValueOnce(token1).mockReturnValueOnce(token2);
    const spawner = vi.fn(async () => ({
      child: makeFakeChild() as never,
      port: 7373,
      url: 'http://localhost:7373',
    }));
    const deps1 = baseDeps(
      { generateToken: tokenGen, spawn: spawner },
      tmpDir,
    );
    await runView({ cwd: tmpDir, deps: deps1 });
    await runView({ cwd: tmpDir, deps: deps1 });
    const firstEnv = (spawner.mock.calls[0][0] as { env: Record<string, string> }).env;
    const secondEnv = (spawner.mock.calls[1][0] as { env: Record<string, string> }).env;
    expect(firstEnv.HELIX_SHUTDOWN_TOKEN).toBe(token1);
    expect(secondEnv.HELIX_SHUTDOWN_TOKEN).toBe(token2);
  });

  it('passes HELIX_MODE and HELIX_PROJECT_ID to the spawned child env', async () => {
    const spawner = vi.fn(async () => ({
      child: makeFakeChild() as never,
      port: 7373,
      url: 'http://localhost:7373',
    }));
    const deps = baseDeps(
      {
        findBeadsRepo: vi.fn(() => ({
          root: '/x',
          beadsDir: '/x/.beads',
          projectId: 'proj-xyz',
          doltDatabase: 'hq',
        })),
        spawn: spawner,
      },
      tmpDir,
    );
    await runView({ cwd: '/x', deps });
    const env = (spawner.mock.calls[0][0] as { env: Record<string, string> }).env;
    expect(env.HELIX_MODE).toBe('project');
    expect(env.HELIX_PROJECT_ID).toBe('proj-xyz');
  });

  it('uses the preferred port (7373 by default) when spawning', async () => {
    const spawner = vi.fn(async () => ({
      child: makeFakeChild() as never,
      port: 54321,
      url: 'http://localhost:54321',
    }));
    const deps = baseDeps({ spawn: spawner }, tmpDir);
    const result = await runView({ cwd: tmpDir, deps });
    const env = (spawner.mock.calls[0][0] as { env: Record<string, string> }).env;
    expect(env.HELIX_PORT).toBe('7373');
    // resolved port (what actually bound) flows back
    expect(result.port).toBe(54321);
    expect(deps.open).toHaveBeenCalledWith('http://localhost:54321/');
  });
});
