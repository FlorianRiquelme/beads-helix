/**
 * Tests for src/watch.ts — watchBeadsInvalidation
 *
 * Mocking strategy:
 *   - vi.mock('node:fs') to intercept fs.watch and fs.existsSync
 *   - vi.useFakeTimers() for timer-dependent tests
 *   - Real temp files for tests that don't need mock control over watch()
 *
 * DO NOT use describe.concurrent or it.concurrent in this file:
 * mockWatchImpl / mockExistsSyncImpl are module-level mutable state, reset
 * in beforeEach/afterEach. Concurrent tests within this file would race.
 */

import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { type FSWatcher } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTmpDir, cleanupTmpDirs } from './helpers/fixtures.js';

// We need real fs for creating temp files, but mock fs for the module under test
import * as realFs from 'node:fs';

// Track mock state at module level so vi.mock factory can reference it
let mockWatchImpl: ((...args: unknown[]) => unknown) | null = null;
let mockExistsSyncImpl: ((path: string) => boolean) | null = null;

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    watch: vi.fn((...args: unknown[]) => {
      if (mockWatchImpl) return mockWatchImpl(...args);
      return actual.watch(...(args as Parameters<typeof actual.watch>));
    }),
    existsSync: vi.fn((path: string) => {
      if (mockExistsSyncImpl) return mockExistsSyncImpl(path);
      return actual.existsSync(path);
    }),
  };
});

// Import AFTER vi.mock so it gets the mocked fs
const { watchBeadsInvalidation } = await import('../src/watch.js');
const fs = await import('node:fs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpFile(dir: string, name = 'last-touched'): string {
  const filePath = join(dir, name);
  realFs.writeFileSync(filePath, '', 'utf8');
  return filePath;
}

function makeStubWatcher(): {
  emitter: EventEmitter & { close: ReturnType<typeof vi.fn> };
} {
  return {
    emitter: Object.assign(new EventEmitter(), { close: vi.fn() }) as EventEmitter & {
      close: ReturnType<typeof vi.fn>;
    },
  };
}

// ---------------------------------------------------------------------------
// watchBeadsInvalidation
// ---------------------------------------------------------------------------

describe('watchBeadsInvalidation', () => {
  let tmpDir: string;
  let watcher: (FSWatcher & { stop: () => void }) | null = null;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    mockWatchImpl = null;
    mockExistsSyncImpl = null;
  });

  afterEach(() => {
    watcher?.stop();
    watcher = null;
    mockWatchImpl = null;
    mockExistsSyncImpl = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
    cleanupTmpDirs();
  });

  // -------------------------------------------------------------------------
  // Return shape
  // -------------------------------------------------------------------------

  describe('return value', () => {
    it('returns an object that has a stop method', () => {
      const filePath = makeTmpFile(tmpDir);
      watcher = watchBeadsInvalidation(filePath, vi.fn());
      expect(watcher).toBeDefined();
      expect(typeof watcher.stop).toBe('function');
    });

    it('stop() can be called multiple times without throwing', () => {
      const filePath = makeTmpFile(tmpDir);
      watcher = watchBeadsInvalidation(filePath, vi.fn());
      expect(() => {
        watcher!.stop();
        watcher!.stop();
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Debounce behaviour
  // -------------------------------------------------------------------------

  describe('debounce', () => {
    it('does not call onDirty before 500 ms have elapsed', () => {
      vi.useFakeTimers();
      const filePath = makeTmpFile(tmpDir);
      const onDirty = vi.fn();

      let capturedCb: ((event: string) => void) | null = null;
      mockWatchImpl = (_path: unknown, cb: unknown) => {
        capturedCb = cb as (event: string) => void;
        return makeStubWatcher().emitter as unknown as FSWatcher;
      };

      watcher = watchBeadsInvalidation(filePath, onDirty);
      capturedCb?.('change');
      vi.advanceTimersByTime(499);

      expect(onDirty).not.toHaveBeenCalled();
    });

    it('calls onDirty exactly once when 500 ms pass after the last rapid trigger', () => {
      vi.useFakeTimers();
      const filePath = makeTmpFile(tmpDir);
      const onDirty = vi.fn();

      let capturedCb: ((event: string) => void) | null = null;
      mockWatchImpl = (_path: unknown, cb: unknown) => {
        capturedCb = cb as (event: string) => void;
        return makeStubWatcher().emitter as unknown as FSWatcher;
      };

      watcher = watchBeadsInvalidation(filePath, onDirty);

      capturedCb?.('change');
      vi.advanceTimersByTime(100);
      capturedCb?.('change');
      vi.advanceTimersByTime(100);
      capturedCb?.('change');

      expect(onDirty).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);
      expect(onDirty).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Safety-net interval
  // -------------------------------------------------------------------------

  describe('safety-net interval', () => {
    it('calls onDirty at least once after 60 000 ms even without file events', () => {
      vi.useFakeTimers();
      const filePath = makeTmpFile(tmpDir);
      const onDirty = vi.fn();
      watcher = watchBeadsInvalidation(filePath, onDirty);

      vi.advanceTimersByTime(60_001);
      expect(onDirty).toHaveBeenCalledTimes(1);
    });

    it('calls onDirty again after a second 60 s period', () => {
      vi.useFakeTimers();
      const filePath = makeTmpFile(tmpDir);
      const onDirty = vi.fn();
      watcher = watchBeadsInvalidation(filePath, onDirty);

      vi.advanceTimersByTime(120_001);
      expect(onDirty).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // stop() — prevents further callbacks
  // -------------------------------------------------------------------------

  describe('stop()', () => {
    it('prevents onDirty from being called after stop', () => {
      vi.useFakeTimers();
      const filePath = makeTmpFile(tmpDir);
      const onDirty = vi.fn();
      watcher = watchBeadsInvalidation(filePath, onDirty);

      watcher.stop();
      vi.advanceTimersByTime(120_001);
      expect(onDirty).not.toHaveBeenCalled();
    });

    it('cancels a pending debounce timer so onDirty never fires', () => {
      vi.useFakeTimers();
      const filePath = makeTmpFile(tmpDir);
      const onDirty = vi.fn();

      let capturedCb: ((event: string) => void) | null = null;
      mockWatchImpl = (_path: unknown, cb: unknown) => {
        capturedCb = cb as (event: string) => void;
        return makeStubWatcher().emitter as unknown as FSWatcher;
      };

      watcher = watchBeadsInvalidation(filePath, onDirty);
      capturedCb?.('change');
      vi.advanceTimersByTime(200);

      watcher.stop();
      vi.advanceTimersByTime(500);
      expect(onDirty).not.toHaveBeenCalled();
    });

    it('clears the safety-net interval — no callbacks fire after stop', () => {
      vi.useFakeTimers();
      const filePath = makeTmpFile(tmpDir);
      const onDirty = vi.fn();
      watcher = watchBeadsInvalidation(filePath, onDirty);

      watcher.stop();
      vi.advanceTimersByTime(300_000);
      expect(onDirty).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // File missing — polling until it appears
  // -------------------------------------------------------------------------

  describe('file missing on attach', () => {
    it('does not throw when the target file does not exist at startup', () => {
      vi.useFakeTimers();
      const missingPath = join(tmpDir, 'does-not-exist');
      expect(() => {
        watcher = watchBeadsInvalidation(missingPath, vi.fn());
      }).not.toThrow();
    });

    it('polls every 1 s and attaches once the file appears', () => {
      vi.useFakeTimers();
      const filePath = join(tmpDir, 'late-file');
      const onDirty = vi.fn();

      // Track watch() invocations directly so we don't rely on the
      // safety-net interval firing (which would mask a dead poll loop).
      let watchCallCount = 0;
      mockWatchImpl = (_path: unknown, _cb: unknown) => {
        watchCallCount++;
        return Object.assign(new EventEmitter(), { close: vi.fn() }) as unknown as FSWatcher;
      };

      watcher = watchBeadsInvalidation(filePath, onDirty);
      const countBeforeFile = watchCallCount;

      // Create the file, then advance past the 1 s retry window.
      realFs.writeFileSync(filePath, '', 'utf8');
      vi.advanceTimersByTime(1_100);

      // Explicit assertion: watch() must have been called AFTER the file
      // appeared. This catches regressions where the poll loop dies silently.
      expect(watchCallCount).toBeGreaterThan(countBeforeFile);
    });

    it('respects stop() even while polling for a missing file', () => {
      vi.useFakeTimers();
      const missingPath = join(tmpDir, 'never-appears');
      const onDirty = vi.fn();

      watcher = watchBeadsInvalidation(missingPath, onDirty);
      watcher.stop();
      vi.advanceTimersByTime(300_000);
      expect(onDirty).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Re-attach on rename event
  // -------------------------------------------------------------------------

  describe('re-attach on rename', () => {
    it('calls close() on the old watcher when a rename event is received', () => {
      vi.useFakeTimers();
      const filePath = makeTmpFile(tmpDir);

      const closeSpy = vi.fn();
      let capturedCb: ((event: string) => void) | null = null;

      mockWatchImpl = (_path: unknown, cb: unknown) => {
        capturedCb = cb as (event: string) => void;
        const em = Object.assign(new EventEmitter(), { close: closeSpy });
        return em as unknown as FSWatcher;
      };

      watcher = watchBeadsInvalidation(filePath, vi.fn());
      capturedCb?.('rename');
      expect(closeSpy).toHaveBeenCalled();
    });

    it('re-attaches (calls watch() again) after a rename event', () => {
      vi.useFakeTimers();
      const filePath = makeTmpFile(tmpDir);

      let watchCallCount = 0;
      let capturedCb: ((event: string) => void) | null = null;

      mockWatchImpl = (_path: unknown, cb: unknown) => {
        watchCallCount++;
        capturedCb = cb as (event: string) => void;
        const em = Object.assign(new EventEmitter(), { close: vi.fn() });
        return em as unknown as FSWatcher;
      };

      watcher = watchBeadsInvalidation(filePath, vi.fn());
      const countAfterInit = watchCallCount;

      capturedCb?.('rename');
      expect(watchCallCount).toBeGreaterThan(countAfterInit);
    });

    it('fires onDirty after the debounce window following a rename event', () => {
      vi.useFakeTimers();
      const filePath = makeTmpFile(tmpDir);

      let capturedCb: ((event: string) => void) | null = null;
      mockWatchImpl = (_path: unknown, cb: unknown) => {
        capturedCb = cb as (event: string) => void;
        const em = Object.assign(new EventEmitter(), { close: vi.fn() });
        return em as unknown as FSWatcher;
      };

      const onDirty = vi.fn();
      watcher = watchBeadsInvalidation(filePath, onDirty);

      capturedCb?.('rename');
      vi.advanceTimersByTime(600);
      expect(onDirty).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Error recovery
  // -------------------------------------------------------------------------

  describe('error recovery', () => {
    it('re-attaches when the FSWatcher emits an error event', () => {
      vi.useFakeTimers();
      const filePath = makeTmpFile(tmpDir);

      let watchCallCount = 0;
      let lastEmitter: EventEmitter | null = null;

      mockWatchImpl = (_path: unknown, _cb: unknown) => {
        watchCallCount++;
        const em = Object.assign(new EventEmitter(), { close: vi.fn() });
        lastEmitter = em;
        return em as unknown as FSWatcher;
      };

      watcher = watchBeadsInvalidation(filePath, vi.fn());
      const countAfterInit = watchCallCount;

      lastEmitter?.emit('error', new Error('EPERM'));
      expect(watchCallCount).toBeGreaterThan(countAfterInit);
    });

    it('falls back to EventEmitter (does not throw) when watch() itself throws', () => {
      vi.useFakeTimers();
      const filePath = makeTmpFile(tmpDir);

      mockWatchImpl = () => {
        throw new Error('ENOTSUP');
      };

      expect(() => {
        watcher = watchBeadsInvalidation(filePath, vi.fn());
      }).not.toThrow();

      expect(watcher).toBeDefined();
      expect(typeof watcher!.stop).toBe('function');
    });
  });
});
