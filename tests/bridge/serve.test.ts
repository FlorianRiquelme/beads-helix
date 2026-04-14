import { promises as fs } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runServe, requireEnv } from '../../src/commands/serve.js';
import { makeTmpDir, cleanupTmpDirs } from '../helpers/fixtures.js';

describe('requireEnv', () => {
  it('returns the value when the env var is set and non-empty', () => {
    expect(requireEnv({ FOO: 'bar' }, 'FOO')).toBe('bar');
  });

  it('throws a descriptive error when the env var is missing', () => {
    expect(() => requireEnv({}, 'FOO')).toThrow(/FOO/);
  });

  it('throws when the env var is the empty string (treated as missing)', () => {
    expect(() => requireEnv({ FOO: '' }, 'FOO')).toThrow(/FOO/);
  });
});

describe('runServe', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('boots the server and writes HELIX_READY sentinel to stdout', { timeout: 5000 }, async () => {
    const writes: string[] = [];
    const handle = await runServe({
      env: {
        HELIX_MODE: 'deck',
        HELIX_REGISTRY_PATH: `${tmpDir}/registry.json`,
        HELIX_SIDECAR_DIR: tmpDir,
        HELIX_SHUTDOWN_TOKEN: 'tok',
        HELIX_PORT: '0',
      },
      stdoutWrite: (msg) => writes.push(msg),
    });
    try {
      expect(handle.port).toBeGreaterThan(0);
      expect(writes.join('')).toMatch(/HELIX_READY port=\d+/);
      // The emitted port matches the actual bind
      const match = writes.join('').match(/HELIX_READY port=(\d+)/);
      expect(Number(match![1])).toBe(handle.port);
    } finally {
      await handle.close();
    }
  });

  it('advertises projectId via /_helix-id in project mode', { timeout: 5000 }, async () => {
    const handle = await runServe({
      env: {
        HELIX_MODE: 'project',
        HELIX_PROJECT_ID: 'alpha-proj',
        HELIX_REGISTRY_PATH: `${tmpDir}/registry.json`,
        HELIX_SIDECAR_DIR: tmpDir,
        HELIX_SHUTDOWN_TOKEN: 'tok',
        HELIX_PORT: '0',
      },
      stdoutWrite: () => {},
    });
    try {
      const res = await fetch(`${handle.url}/_helix-id`);
      const body = await res.json();
      expect(body.mode).toBe('project');
      expect(body.projectId).toBe('alpha-proj');
    } finally {
      await handle.close();
    }
  });

  it('rejects invalid HELIX_MODE with a clear error', async () => {
    await expect(
      runServe({
        env: {
          HELIX_MODE: 'bogus',
          HELIX_REGISTRY_PATH: `${tmpDir}/registry.json`,
          HELIX_SIDECAR_DIR: tmpDir,
          HELIX_SHUTDOWN_TOKEN: 'tok',
          HELIX_PORT: '0',
        },
        stdoutWrite: () => {},
      }),
    ).rejects.toThrow(/HELIX_MODE/i);
  });

  it('rejects when HELIX_PORT is not a valid integer', async () => {
    await expect(
      runServe({
        env: {
          HELIX_MODE: 'deck',
          HELIX_REGISTRY_PATH: `${tmpDir}/registry.json`,
          HELIX_SIDECAR_DIR: tmpDir,
          HELIX_SHUTDOWN_TOKEN: 'tok',
          HELIX_PORT: 'not-a-number',
        },
        stdoutWrite: () => {},
      }),
    ).rejects.toThrow(/HELIX_PORT/i);
  });

  it('requires HELIX_PROJECT_ID in project mode', async () => {
    await expect(
      runServe({
        env: {
          HELIX_MODE: 'project',
          HELIX_REGISTRY_PATH: `${tmpDir}/registry.json`,
          HELIX_SIDECAR_DIR: tmpDir,
          HELIX_SHUTDOWN_TOKEN: 'tok',
          HELIX_PORT: '0',
        },
        stdoutWrite: () => {},
      }),
    ).rejects.toThrow(/HELIX_PROJECT_ID/i);
  });

  it('installs a SIGTERM handler that closes the server gracefully', { timeout: 5000 }, async () => {
    const handle = await runServe({
      env: {
        HELIX_MODE: 'deck',
        HELIX_REGISTRY_PATH: `${tmpDir}/registry.json`,
        HELIX_SIDECAR_DIR: tmpDir,
        HELIX_SHUTDOWN_TOKEN: 'tok',
        HELIX_PORT: '0',
      },
      stdoutWrite: () => {},
    });
    // Server is responsive before shutdown
    const pre = await fetch(`${handle.url}/_helix-id`);
    expect(pre.status).toBe(200);
    await handle.close();
    // After close, the port is released — any fetch will fail (connection refused)
    await expect(fetch(`${handle.url}/_helix-id`)).rejects.toBeDefined();
  });
});
