import { startServer, type RunningServer } from '../server/index.js';
import type { ServerConfig } from '../server/config.js';

export function requireEnv(env: Record<string, string | undefined>, key: string): string {
  const v = env[key];
  if (v === undefined || v === '') {
    throw new Error(`runServe: missing required env var ${key}`);
  }
  return v;
}

export interface RunServeOptions {
  /** Env vars; typically process.env. */
  env: Record<string, string | undefined>;
  /** Target for the HELIX_READY sentinel. Defaults to process.stdout.write. */
  stdoutWrite?: (s: string) => void;
  /** Enables SIGTERM handler installation. Default true. Tests pass false. */
  installSignalHandlers?: boolean;
}

export interface ServeHandle extends RunningServer {}

/**
 * Boot the Helix server from env vars and emit the HELIX_READY sentinel.
 *
 * Contract with the parent launcher:
 *  - Reads HELIX_MODE, HELIX_REGISTRY_PATH, HELIX_SIDECAR_DIR,
 *    HELIX_SHUTDOWN_TOKEN, HELIX_PORT from the supplied env.
 *  - Requires HELIX_PROJECT_ID when mode === 'project'.
 *  - Writes exactly one line `HELIX_READY port=<resolved-port>\n` to stdout
 *    once the HTTP listener is ready to accept connections.
 *  - SIGTERM triggers graceful shutdown (watcher, SSE, HTTP) and process exit.
 */
export async function runServe(opts: RunServeOptions): Promise<ServeHandle> {
  const env = opts.env;
  const stdoutWrite = opts.stdoutWrite ?? ((s) => process.stdout.write(s));
  const installHandlers = opts.installSignalHandlers ?? false;

  const mode = requireEnv(env, 'HELIX_MODE');
  if (mode !== 'deck' && mode !== 'project') {
    throw new Error(
      `runServe: invalid HELIX_MODE "${mode}" (expected "deck" or "project")`,
    );
  }

  const portRaw = requireEnv(env, 'HELIX_PORT');
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isInteger(port) || port < 0 || String(port) !== portRaw.trim()) {
    throw new Error(
      `runServe: invalid HELIX_PORT "${portRaw}" (expected a non-negative integer)`,
    );
  }

  const registryPath = requireEnv(env, 'HELIX_REGISTRY_PATH');
  const sidecarDir = requireEnv(env, 'HELIX_SIDECAR_DIR');
  const shutdownToken = requireEnv(env, 'HELIX_SHUTDOWN_TOKEN');

  let projectId: string | undefined;
  if (mode === 'project') {
    projectId = requireEnv(env, 'HELIX_PROJECT_ID');
  } else {
    projectId = env.HELIX_PROJECT_ID || undefined;
  }

  const config: ServerConfig = {
    registryPath,
    sidecarDir,
    shutdownToken,
    port,
    mode,
    projectId,
  };

  const handle = await startServer({
    config,
    uiDir: env.HELIX_UI_DIR || undefined,
  });

  stdoutWrite(`HELIX_READY port=${handle.port}\n`);

  if (installHandlers) {
    const onSignal = (): void => {
      void handle.close().finally(() => process.exit(0));
    };
    process.once('SIGTERM', onSignal);
    process.once('SIGINT', onSignal);
  }

  return handle;
}
