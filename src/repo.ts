import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface BeadsRepo {
  root: string;
  beadsDir: string;
  projectId: string;
  doltDatabase: string;
}

export function findBeadsRepo(startPath?: string): BeadsRepo | null {
  const root = startPath ? resolve(startPath) : process.cwd();
  const beadsDir = join(root, '.beads');

  if (!existsSync(beadsDir)) return null;

  const metadataPath = join(beadsDir, 'metadata.json');
  if (!existsSync(metadataPath)) return null;

  const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
  const projectId = metadata.project_id;

  // Validate project_id exists and is safe for use in file paths
  if (!projectId || typeof projectId !== 'string') return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) return null;

  return {
    root,
    beadsDir,
    projectId,
    doltDatabase: metadata.dolt_database || 'hq',
  };
}

export function getDoltServerPort(beadsDir: string): number | null {
  const portFile = join(beadsDir, 'dolt-server.port');
  const pidFile = join(beadsDir, 'dolt-server.pid');

  if (!existsSync(portFile) || !existsSync(pidFile)) return null;

  const port = parseInt(readFileSync(portFile, 'utf-8').trim(), 10);
  if (isNaN(port)) return null;

  return port;
}

export function getEmbeddedDoltPath(beadsDir: string, database: string): string {
  return join(beadsDir, 'embeddeddolt', database);
}

export function getLastTouchedPath(beadsDir: string): string {
  return join(beadsDir, 'last-touched');
}

export function snapshotPath(projectId: string): string {
  return join('/tmp', 'beads-sidecar', `${projectId}.snapshot.json`);
}

export function lockPath(projectId: string): string {
  return join('/tmp', 'beads-sidecar', `${projectId}.refresh.lock`);
}
