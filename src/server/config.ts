import { randomBytes } from 'node:crypto';

export interface ServerConfig {
  /** Absolute path to `~/.helix/projects.json` (override for tests). */
  registryPath: string;
  /** Absolute path to the beads-sidecar directory under `os.tmpdir()` (override for tests). */
  sidecarDir: string;
  /** Token required for POST /_shutdown. */
  shutdownToken: string;
  /** Preferred port. 0 = OS-assigned. */
  port: number;
  /**
   * HELIX_MODE advertised by GET /_helix-id.
   * 'deck' = cross-project view, 'project' = single project view.
   */
  mode: 'deck' | 'project';
  /** Project id this server was launched for (level 2) or undefined (level 1). */
  projectId?: string;
}

export function generateShutdownToken(): string {
  return randomBytes(32).toString('hex');
}

export function defaultPort(): number {
  return 7373;
}
