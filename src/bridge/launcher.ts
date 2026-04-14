import { spawn, type ChildProcess } from 'node:child_process';

/**
 * Regex for the "I'm up" sentinel that the spawned server writes on stdout
 * before it starts handling requests. Parent matches against a rolling
 * buffer because chunk boundaries are arbitrary.
 */
export const HELIX_READY_PATTERN = /^HELIX_READY port=(?<port>\d+)$/m;

export interface HelixEnv {
  HELIX_MODE: 'deck' | 'project';
  HELIX_REGISTRY_PATH: string;
  HELIX_SIDECAR_DIR: string;
  HELIX_SHUTDOWN_TOKEN: string;
  HELIX_PORT: string;
  HELIX_PROJECT_ID?: string;
  HELIX_UI_DIR?: string;
}

export interface SpawnHelixOptions {
  /** Node executable (defaults to the parent's). */
  nodePath?: string;
  /** Args passed to node (typically `['<cli-path>', 'serve']` or `['-e', script]` in tests). */
  entryArgs: string[];
  /** Env for the child. Parent env is NOT inherited beyond PATH/HOME/USER. */
  env: HelixEnv;
  /** Ready-sentinel timeout. Default 5000ms. */
  timeoutMs?: number;
  /** Hook for tests to capture the child before resolve/reject. */
  onSpawn?: (child: ChildProcess) => void;
}

export interface LaunchedServer {
  child: ChildProcess;
  port: number;
  url: string;
}

/**
 * Spawn a Node subprocess running the helix server. Resolves once the
 * child emits the `HELIX_READY port=N` sentinel on stdout. Rejects on:
 *   - child exit before sentinel
 *   - elapsed `timeoutMs` with no sentinel
 *
 * In both failure cases, the child is force-killed so the caller is never
 * left with an orphaned process. Stderr is forwarded to the parent's stderr
 * so diagnostic output is visible to the developer.
 */
export async function spawnHelixServer(
  opts: SpawnHelixOptions,
): Promise<LaunchedServer> {
  const nodePath = opts.nodePath ?? process.execPath;
  const timeoutMs = opts.timeoutMs ?? 5000;

  // Build a minimal clean environment. We deliberately do NOT spread
  // process.env — stray HELIX_* vars from the parent shell shouldn't
  // override the caller's explicit config.
  const childEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    USER: process.env.USER ?? '',
    NODE_ENV: process.env.NODE_ENV ?? '',
    ...opts.env,
  };

  const child = spawn(nodePath, opts.entryArgs, {
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  opts.onSpawn?.(child);

  // Forward child stderr to ours so developers see crashes.
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  return new Promise<LaunchedServer>((resolve, reject) => {
    let settled = false;
    let accumulated = '';

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* best-effort */
      }
      reject(
        new Error(
          `spawnHelixServer: timeout after ${timeoutMs}ms awaiting HELIX_READY sentinel`,
        ),
      );
    }, timeoutMs);

    const onStdout = (chunk: Buffer): void => {
      if (settled) return;
      accumulated += chunk.toString('utf8');
      const match = accumulated.match(HELIX_READY_PATTERN);
      if (match?.groups?.port) {
        settled = true;
        clearTimeout(timer);
        child.stdout?.off('data', onStdout);
        child.off('exit', onExit);
        const port = Number(match.groups.port);
        resolve({
          child,
          port,
          url: `http://localhost:${port}`,
        });
      }
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const how = signal ? `signal ${signal}` : `code ${code}`;
      reject(
        new Error(
          `spawnHelixServer: child exited before HELIX_READY sentinel (${how})`,
        ),
      );
    };

    child.stdout?.on('data', onStdout);
    child.once('exit', onExit);
  });
}
