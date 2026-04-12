import { writeFileSync, renameSync, copyFileSync, unlinkSync, existsSync, openSync, closeSync, statSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';

/**
 * Write JSON data atomically: write to temp file, then rename.
 * Handles EXDEV (cross-device) by falling back to copy+unlink.
 * File permissions are set to 0o600 (owner-readable only).
 */
export function writeAtomicJSON(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const tmpPath = join(dir, `.tmp.${basename(filePath)}.${process.pid}.${Date.now()}`);

  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    try {
      renameSync(tmpPath, filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        copyFileSync(tmpPath, filePath);
        chmodSync(filePath, 0o600);
        unlinkSync(tmpPath);
      } else {
        throw err;
      }
    }
  } catch (err) {
    // Clean up temp file on any error
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

const STALE_LOCK_MS = 30_000;

/**
 * Acquire a non-blocking file lock using O_EXCL.
 * Returns true if lock acquired, false if already held.
 * Detects and removes stale locks (older than 30s).
 */
export function acquireLock(lockFilePath: string): boolean {
  const dir = dirname(lockFilePath);
  mkdirSync(dir, { recursive: true });

  try {
    const fd = openSync(lockFilePath, 'wx');
    closeSync(fd);
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      // Check for stale lock
      try {
        const stats = statSync(lockFilePath);
        if (Date.now() - stats.mtimeMs > STALE_LOCK_MS) {
          unlinkSync(lockFilePath);
          return acquireLock(lockFilePath);
        }
      } catch {}
      return false;
    }
    throw err;
  }
}

/**
 * Release the file lock.
 */
export function releaseLock(lockFilePath: string): void {
  try { unlinkSync(lockFilePath); } catch {}
}
