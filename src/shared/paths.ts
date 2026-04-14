import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export const HELIX_HOME_DIRNAME = '.helix';
export const REGISTRY_FILENAME = 'projects.json';
export const SIDECAR_DIRNAME = 'beads-sidecar';

export function helixHomeDir(): string {
  return join(homedir(), HELIX_HOME_DIRNAME);
}

export function registryPath(): string {
  return join(helixHomeDir(), REGISTRY_FILENAME);
}

export function sidecarDir(): string {
  return join(tmpdir(), SIDECAR_DIRNAME);
}

export function snapshotPathFor(projectId: string): string {
  return join(sidecarDir(), `${projectId}.snapshot.json`);
}
