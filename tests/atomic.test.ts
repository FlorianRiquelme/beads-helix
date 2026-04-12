/**
 * Tests for src/atomic.ts
 *
 * Strategy:
 *  - Happy-path tests use a real temp directory (no mocking).
 *  - Tests that need to exercise error branches (EXDEV, writeFileSync throws,
 *    renameSync throws non-EXDEV, openSync throws, statSync throws) use
 *    vi.mock('node:fs') with a factory that delegates to the real module by
 *    default and lets per-test overrides inject failures.
 */

import * as fsReal from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { acquireLock, releaseLock, writeAtomicJSON } from '../src/atomic.js';
import { cleanupTmpDirs, makeTmpDir } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Vitest hoists this mock so every import of 'node:fs' in the test AND in
// src/atomic.ts picks up the same mocked namespace.  By default every
// function is a spy that forwards to the real implementation.
// ---------------------------------------------------------------------------
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    writeFileSync: vi.fn((...args: Parameters<typeof real.writeFileSync>) =>
      real.writeFileSync(...args),
    ),
    renameSync: vi.fn((...args: Parameters<typeof real.renameSync>) =>
      real.renameSync(...args),
    ),
    openSync: vi.fn((...args: Parameters<typeof real.openSync>) =>
      real.openSync(...args),
    ),
    statSync: vi.fn((...args: Parameters<typeof real.statSync>) =>
      real.statSync(...args),
    ),
  };
});

// Import the mocked fs module (same object the source module uses)
const fsMock = await import('node:fs');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readJSON(filePath: string): unknown {
  return JSON.parse(fsReal.readFileSync(filePath, 'utf8'));
}

function tmpFilesIn(dir: string): string[] {
  return fsReal.readdirSync(dir).filter((f) => f.startsWith('.tmp.'));
}

// ---------------------------------------------------------------------------
// writeAtomicJSON — happy path (real fs, no overrides)
// ---------------------------------------------------------------------------

describe('writeAtomicJSON', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('writes valid JSON to the target path', () => {
    const filePath = join(tmpDir, 'data.json');
    const payload = { name: 'helix', version: 1 };

    writeAtomicJSON(filePath, payload);

    expect(fsReal.existsSync(filePath)).toBe(true);
    expect(readJSON(filePath)).toEqual(payload);
  });

  it('creates parent directories when they do not exist', () => {
    const filePath = join(tmpDir, 'nested', 'deep', 'data.json');

    writeAtomicJSON(filePath, { ok: true });

    expect(fsReal.existsSync(filePath)).toBe(true);
  });

  it('sets file permissions to 0o600', () => {
    const filePath = join(tmpDir, 'secret.json');

    writeAtomicJSON(filePath, { token: 'abc123' });

    const mode = fsReal.statSync(filePath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('writes pretty-printed JSON with 2-space indentation', () => {
    const filePath = join(tmpDir, 'pretty.json');
    const payload = { a: 1, b: [2, 3] };

    writeAtomicJSON(filePath, payload);

    const raw = fsReal.readFileSync(filePath, 'utf8');
    expect(raw).toBe(JSON.stringify(payload, null, 2));
  });

  it('overwrites an existing file atomically', () => {
    const filePath = join(tmpDir, 'overwrite.json');
    fsReal.writeFileSync(filePath, JSON.stringify({ old: true }), 'utf8');

    writeAtomicJSON(filePath, { new: true });

    expect(readJSON(filePath)).toEqual({ new: true });
  });

  it('leaves no temp file behind after a successful write', () => {
    const filePath = join(tmpDir, 'clean.json');

    writeAtomicJSON(filePath, { clean: true });

    expect(tmpFilesIn(tmpDir)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // EXDEV fallback path
  // -------------------------------------------------------------------------

  describe('EXDEV fallback', () => {
    it('falls back to copy+unlink when renameSync throws EXDEV, file has correct content', () => {
      const filePath = join(tmpDir, 'exdev.json');
      const payload = { cross: 'device' };
      const exdevError = Object.assign(new Error('EXDEV'), { code: 'EXDEV' });

      vi.mocked(fsMock.renameSync).mockImplementationOnce(() => {
        throw exdevError;
      });

      writeAtomicJSON(filePath, payload);

      expect(fsReal.existsSync(filePath)).toBe(true);
      expect(readJSON(filePath)).toEqual(payload);
    });

    it('sets 0o600 permissions on the destination after EXDEV fallback', () => {
      const filePath = join(tmpDir, 'exdev-perms.json');
      const exdevError = Object.assign(new Error('EXDEV'), { code: 'EXDEV' });

      vi.mocked(fsMock.renameSync).mockImplementationOnce(() => {
        throw exdevError;
      });

      writeAtomicJSON(filePath, { check: 'perms' });

      const mode = fsReal.statSync(filePath).mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('removes the temp file after EXDEV fallback', () => {
      const filePath = join(tmpDir, 'exdev-cleanup.json');
      const exdevError = Object.assign(new Error('EXDEV'), { code: 'EXDEV' });

      vi.mocked(fsMock.renameSync).mockImplementationOnce(() => {
        throw exdevError;
      });

      writeAtomicJSON(filePath, { done: true });

      expect(tmpFilesIn(tmpDir)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Error cleanup path
  // -------------------------------------------------------------------------

  describe('error cleanup', () => {
    it('removes the temp file when writeFileSync throws', () => {
      const filePath = join(tmpDir, 'write-fail.json');

      vi.mocked(fsMock.writeFileSync).mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      expect(() => writeAtomicJSON(filePath, { x: 1 })).toThrow('disk full');
      expect(tmpFilesIn(tmpDir)).toHaveLength(0);
    });

    it('re-throws the original error after cleanup', () => {
      const filePath = join(tmpDir, 'rethrow.json');
      const boom = new Error('boom');

      vi.mocked(fsMock.writeFileSync).mockImplementationOnce(() => {
        throw boom;
      });

      expect(() => writeAtomicJSON(filePath, {})).toThrow(boom);
    });

    it('re-throws non-EXDEV errors from renameSync and cleans up the temp file', () => {
      const filePath = join(tmpDir, 'rename-fail.json');
      const permError = Object.assign(new Error('EPERM'), { code: 'EPERM' });

      vi.mocked(fsMock.renameSync).mockImplementationOnce(() => {
        throw permError;
      });

      expect(() => writeAtomicJSON(filePath, {})).toThrow(permError);
      expect(tmpFilesIn(tmpDir)).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// acquireLock
// ---------------------------------------------------------------------------

describe('acquireLock', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('returns true and creates the lock file on first call', () => {
    const lockPath = join(tmpDir, 'my.lock');

    const result = acquireLock(lockPath);

    expect(result).toBe(true);
    expect(fsReal.existsSync(lockPath)).toBe(true);
  });

  it('returns false when the lock exists and is fresh (mtime < 30s ago)', () => {
    const lockPath = join(tmpDir, 'fresh.lock');
    acquireLock(lockPath); // first acquisition

    const result = acquireLock(lockPath); // second attempt — lock is fresh

    expect(result).toBe(false);
    expect(fsReal.existsSync(lockPath)).toBe(true);
  });

  it('removes a stale lock (mtime > 30s ago), re-acquires, and returns true', () => {
    const lockPath = join(tmpDir, 'stale.lock');
    // Create the lock file and back-date its mtime by 31 seconds
    fsReal.writeFileSync(lockPath, '', 'utf8');
    const staleDate = new Date(Date.now() - 31_000);
    fsReal.utimesSync(lockPath, staleDate, staleDate);

    const result = acquireLock(lockPath);

    expect(result).toBe(true);
    expect(fsReal.existsSync(lockPath)).toBe(true);
  });

  it('creates parent directories when they do not exist', () => {
    const lockPath = join(tmpDir, 'locks', 'nested', 'acquire.lock');

    const result = acquireLock(lockPath);

    expect(result).toBe(true);
    expect(fsReal.existsSync(lockPath)).toBe(true);
  });

  it('throws when openSync fails with a non-EEXIST error', () => {
    const lockPath = join(tmpDir, 'throws.lock');
    const eacces = Object.assign(new Error('EACCES'), { code: 'EACCES' });

    vi.mocked(fsMock.openSync).mockImplementationOnce(() => {
      throw eacces;
    });

    expect(() => acquireLock(lockPath)).toThrow(eacces);
  });

  it('returns false gracefully when statSync of an existing lock throws', () => {
    const lockPath = join(tmpDir, 'stat-fail.lock');
    // Put a real lock file in place so openSync's O_EXCL triggers EEXIST
    fsReal.writeFileSync(lockPath, '', 'utf8');

    // statSync throws inside the EEXIST branch — the catch swallows it and
    // the function returns false
    vi.mocked(fsMock.statSync).mockImplementationOnce(() => {
      throw new Error('stat unavailable');
    });

    const result = acquireLock(lockPath);

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// releaseLock
// ---------------------------------------------------------------------------

describe('releaseLock', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('removes the lock file', () => {
    const lockPath = join(tmpDir, 'release.lock');
    acquireLock(lockPath);
    expect(fsReal.existsSync(lockPath)).toBe(true);

    releaseLock(lockPath);

    expect(fsReal.existsSync(lockPath)).toBe(false);
  });

  it('does not throw when the lock file does not exist', () => {
    const lockPath = join(tmpDir, 'nonexistent.lock');

    expect(() => releaseLock(lockPath)).not.toThrow();
  });

  it('is idempotent — calling twice does not throw', () => {
    const lockPath = join(tmpDir, 'idempotent.lock');
    acquireLock(lockPath);

    releaseLock(lockPath);
    expect(() => releaseLock(lockPath)).not.toThrow();
  });
});
