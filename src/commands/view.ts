import { basename } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { findBeadsRepo as defaultFindBeadsRepo, type BeadsRepo } from '../repo.js';
import { refresh as defaultRefresh } from '../snapshot.js';
import { probeHelixServer as defaultProbe } from '../bridge/probe.js';
import type { ProbeOptions, HelixIdPayload } from '../bridge/probe.js';
import {
  spawnHelixServer as defaultSpawn,
  type SpawnHelixOptions,
  type LaunchedServer,
} from '../bridge/launcher.js';
import { shutdownChild as defaultShutdownChild } from '../bridge/shutdown.js';
import type { ShutdownOptions, ShutdownResult } from '../bridge/shutdown.js';
import { openUrl as defaultOpenUrl } from '../bridge/open-url.js';
import { upsertProject as defaultUpsertProject } from '../bridge/registry.js';
import type { UpsertOptions } from '../bridge/registry.js';
import { generateShutdownToken } from '../server/config.js';
import { registryPath as defaultRegistryPath, sidecarDir as defaultSidecarDir } from '../shared/paths.js';
import type { ProjectEntry, Registry } from '../shared/registry-schema.js';
import type { RefreshResult } from '../types.js';

export interface RunViewDeps {
  findBeadsRepo?: (cwd?: string) => BeadsRepo | null;
  refresh?: (repoPath?: string, force?: boolean) => Promise<RefreshResult>;
  probe?: (url: string, opts?: ProbeOptions) => Promise<HelixIdPayload | null>;
  spawn?: (opts: SpawnHelixOptions) => Promise<LaunchedServer>;
  open?: (url: string) => Promise<void>;
  upsertProject?: (entry: ProjectEntry, opts?: UpsertOptions) => Promise<Registry>;
  shutdownChild?: (child: ChildProcess, opts?: ShutdownOptions) => Promise<ShutdownResult>;
  /** Register a SIGINT handler; returns a disposer. */
  installSigint?: (onSigint: () => void) => () => void;
  /** Returns a promise that resolves when the child exits. */
  waitForExit?: (child: ChildProcess) => Promise<void>;
  generateToken?: () => string;
  now?: () => Date;
  paths?: {
    registry?: string;
    sidecar?: string;
  };
  stdout?: (s: string) => void;
  stderr?: (s: string) => void;
  /** Args passed to node when spawning the server (defaults to helix CLI + 'serve'). */
  entryArgs?: string[];
  /** Optional static UI directory forwarded as HELIX_UI_DIR. */
  uiDir?: string;
}

export interface RunViewOptions {
  cwd?: string;
  /** Force deck mode even inside a beads repo. */
  forceDeck?: boolean;
  /** Preferred port (default 7373). */
  preferredPort?: number;
  deps?: RunViewDeps;
}

export interface RunViewResult {
  action: 'adopted' | 'spawned';
  mode: 'deck' | 'project';
  projectId?: string;
  url: string;
  port: number;
  /** Resolves when the spawned child exits, or immediately on adoption. */
  wait: () => Promise<void>;
  /** Programmatic shutdown trigger (for tests and SIGINT). */
  shutdown: () => Promise<void>;
}

/**
 * Orchestrates `helix view` / `helix deck`:
 *
 *   detect context → (refresh snapshot if project) → probe port 7373 →
 *     adopt existing server OR spawn new subprocess →
 *     register project (when applicable) → open browser →
 *     install SIGINT handler (spawned) or return (adopted).
 */
export async function runView(opts: RunViewOptions = {}): Promise<RunViewResult> {
  const cwd = opts.cwd ?? process.cwd();
  const preferredPort = opts.preferredPort ?? 7373;
  const deps: Required<Omit<RunViewDeps, 'paths' | 'uiDir'>> & {
    paths: { registry: string; sidecar: string };
    uiDir?: string;
  } = {
    findBeadsRepo: opts.deps?.findBeadsRepo ?? defaultFindBeadsRepo,
    refresh: opts.deps?.refresh ?? defaultRefresh,
    probe: opts.deps?.probe ?? defaultProbe,
    spawn: opts.deps?.spawn ?? defaultSpawn,
    open: opts.deps?.open ?? defaultOpenUrl,
    upsertProject: opts.deps?.upsertProject ?? defaultUpsertProject,
    shutdownChild: opts.deps?.shutdownChild ?? defaultShutdownChild,
    installSigint: opts.deps?.installSigint ?? defaultInstallSigint,
    waitForExit: opts.deps?.waitForExit ?? defaultWaitForExit,
    generateToken: opts.deps?.generateToken ?? generateShutdownToken,
    now: opts.deps?.now ?? (() => new Date()),
    stdout: opts.deps?.stdout ?? ((s) => process.stdout.write(s)),
    stderr: opts.deps?.stderr ?? ((s) => process.stderr.write(s)),
    entryArgs: opts.deps?.entryArgs ?? defaultEntryArgs(),
    paths: {
      registry: opts.deps?.paths?.registry ?? defaultRegistryPath(),
      sidecar: opts.deps?.paths?.sidecar ?? defaultSidecarDir(),
    },
    uiDir: opts.deps?.uiDir,
  };

  // 1. Mode detection.
  const repo = opts.forceDeck ? null : deps.findBeadsRepo(cwd);
  const mode: 'deck' | 'project' = repo ? 'project' : 'deck';
  const projectId = repo?.projectId;

  // 2. Refresh snapshot (project mode only, best-effort).
  if (repo) {
    try {
      const result = await deps.refresh(repo.root, false);
      if (result.status === 'error') {
        deps.stderr(
          `helix view: snapshot refresh failed (${result.code ?? 'unknown'}): ${
            'message' in result ? result.message : ''
          }\n`,
        );
      }
    } catch (err) {
      deps.stderr(`helix view: snapshot refresh threw: ${(err as Error).message}\n`);
    }
  }

  // 3. Probe for an existing helix server.
  const probeUrl = `http://localhost:${preferredPort}`;
  const existing = await deps.probe(probeUrl);

  // 4a. Adopt path.
  if (existing) {
    const targetUrl = buildTargetUrl(probeUrl, mode, projectId);
    if (repo) {
      await registerProject(deps, repo);
    }
    await deps.open(targetUrl);
    return {
      action: 'adopted',
      mode,
      projectId,
      url: targetUrl,
      port: preferredPort,
      wait: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    };
  }

  // 4b. Spawn path.
  const token = deps.generateToken();
  const env: SpawnHelixOptions['env'] = {
    HELIX_MODE: mode,
    HELIX_REGISTRY_PATH: deps.paths.registry,
    HELIX_SIDECAR_DIR: deps.paths.sidecar,
    HELIX_SHUTDOWN_TOKEN: token,
    HELIX_PORT: String(preferredPort),
  };
  if (projectId) env.HELIX_PROJECT_ID = projectId;
  if (deps.uiDir) env.HELIX_UI_DIR = deps.uiDir;

  if (repo) {
    await registerProject(deps, repo);
  }

  const launched = await deps.spawn({
    entryArgs: deps.entryArgs,
    env,
  });

  const targetUrl = buildTargetUrl(launched.url, mode, projectId);
  await deps.open(targetUrl);

  let shutdownInvoked = false;
  const shutdown = async (): Promise<void> => {
    if (shutdownInvoked) return;
    shutdownInvoked = true;
    await deps.shutdownChild(launched.child, { graceMs: 3000 });
  };

  const disposeSigint = deps.installSigint(() => {
    void shutdown();
  });
  const wait = deps.waitForExit(launched.child).finally(() => {
    disposeSigint();
  });

  return {
    action: 'spawned',
    mode,
    projectId,
    url: targetUrl,
    port: launched.port,
    wait: () => wait,
    shutdown,
  };
}

function buildTargetUrl(
  baseUrl: string,
  mode: 'deck' | 'project',
  projectId: string | undefined,
): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (mode === 'project' && projectId) {
    return `${base}/p/${projectId}`;
  }
  return `${base}/`;
}

async function registerProject(
  deps: {
    upsertProject: NonNullable<RunViewDeps['upsertProject']>;
    now: NonNullable<RunViewDeps['now']>;
    paths: { registry: string };
  },
  repo: BeadsRepo,
): Promise<void> {
  const nowIso = deps.now().toISOString();
  const entry: ProjectEntry = {
    id: repo.projectId,
    path: repo.root,
    name: basename(repo.root),
    added_at: nowIso,
    last_seen_at: nowIso,
    status: 'active',
  };
  await deps.upsertProject(entry, {
    path: deps.paths.registry,
    now: deps.now,
  });
}

function defaultInstallSigint(onSigint: () => void): () => void {
  const handler = (): void => onSigint();
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
  // Synchronous best-effort: if the parent exits normally without going
  // through shutdownChild (e.g. uncaught exception, crash), don't leave
  // the server orphaned on its port. This DOES NOT defend against
  // SIGKILL of the parent — nothing in userland does — but it covers
  // the common accidental-exit paths.
  const exitHandler = (): void => onSigint();
  process.on('exit', exitHandler);
  return () => {
    process.off('SIGINT', handler);
    process.off('SIGTERM', handler);
    process.off('exit', exitHandler);
  };
}

function defaultWaitForExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
  });
}

function defaultEntryArgs(): string[] {
  // Resolve the path to the helix CLI this process is running so that the
  // spawned child runs the same code. When invoked via `helix view`, argv[1]
  // is the bin path. During local development (`node dist/cli.js`) it's also
  // argv[1]. Fall back to argv[1] for both cases.
  const cliPath = process.argv[1];
  return cliPath ? [cliPath, 'serve'] : [];
}
