import { existsSync } from 'node:fs';
import type { RefreshResult } from './types.js';
import { findBeadsRepo, getDoltServerPort, getEmbeddedDoltPath, snapshotPath, lockPath } from './repo.js';
import { readDolt } from './dolt.js';
import { buildSnapshot } from './derive.js';
import { writeAtomicJSON, acquireLock, releaseLock } from './atomic.js';

/**
 * Resolve the snapshot path for the current (or given) repo.
 */
export function resolveSnapshotPath(repoPath?: string): { path: string } | { error: string } {
  const repo = findBeadsRepo(repoPath);
  if (!repo) return { error: 'NOT_BEADS_REPO' };
  return { path: snapshotPath(repo.projectId) };
}

/**
 * Perform a snapshot refresh.
 * Reads Dolt, derives board columns, writes atomic JSON.
 */
export async function refresh(repoPath?: string, force?: boolean): Promise<RefreshResult> {
  const startTime = Date.now();

  const repo = findBeadsRepo(repoPath);
  if (!repo) {
    return {
      status: 'error',
      code: 'NOT_BEADS_REPO',
      snapshot_path: '',
      message: '.beads/ directory not found',
    };
  }

  const snapPath = snapshotPath(repo.projectId);
  const lock = lockPath(repo.projectId);

  // Non-blocking lock
  if (!acquireLock(lock)) {
    return { status: 'busy', snapshot_path: snapPath };
  }

  try {
    const port = getDoltServerPort(repo.beadsDir);
    const embeddedPath = getEmbeddedDoltPath(repo.beadsDir, repo.doltDatabase);

    // Check if embedded dolt path exists
    if (!port && !existsSync(embeddedPath)) {
      return {
        status: 'error',
        code: 'SOURCE_UNAVAILABLE',
        snapshot_path: snapPath,
        message: 'No Dolt server running and embedded Dolt path not found',
      };
    }

    let result;
    try {
      result = await readDolt(port, repo.doltDatabase, embeddedPath);
    } catch (err) {
      // FR-12: Dolt failure preserves last good snapshot
      process.stderr.write(`helix-snapshot: Dolt read failed: ${err}\n`);
      return {
        status: 'error',
        code: 'SOURCE_UNAVAILABLE',
        snapshot_path: snapPath,
        message: `Dolt read failed: ${err}`,
      };
    }

    const snapshot = buildSnapshot(
      repo.projectId,
      result.issues,
      result.deps,
      result.source,
      startTime,
    );

    writeAtomicJSON(snapPath, snapshot);

    return {
      status: 'refreshed',
      snapshot_path: snapPath,
      source: result.source,
    };
  } finally {
    releaseLock(lock);
  }
}
