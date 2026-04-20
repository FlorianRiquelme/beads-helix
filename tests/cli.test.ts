/**
 * CLI tests for src/cli.ts
 *
 * Strategy:
 *  - parseFlags is imported directly (src/cli.ts exports it) — this gives
 *    real mutation coverage rather than a duplicated inline mirror.
 *  - End-to-end subcommand dispatch is tested by spawning `node dist/cli.js`
 *    via spawnSync so that process.argv is real and process.exit() calls are
 *    contained to the child process. The `pretest` script runs `tsc`, so
 *    dist/cli.js always exists when these tests run.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseFlags } from '../src/cli.js';
import { makeTmpDir, cleanupTmpDirs } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const CLI_PATH = join(REPO_ROOT, 'dist', 'cli.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SpawnResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

/**
 * Spawns `node dist/cli.js` with the supplied CLI args and returns
 * stdout, stderr, and the exit status. Never throws — callers assert.
 */
function runCLI(args: string[], env?: NodeJS.ProcessEnv): SpawnResult {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, ...env },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

/**
 * Creates a minimal `.beads/` directory with a `metadata.json` so that
 * `findBeadsRepo` succeeds inside the child process.
 */
function makeBeadsRepo(rootDir: string, projectId = 'test-proj'): void {
  const beadsDir = join(rootDir, '.beads');
  mkdirSync(beadsDir, { recursive: true });
  writeFileSync(
    join(beadsDir, 'metadata.json'),
    JSON.stringify({ project_id: projectId }),
    'utf8',
  );
}

// ---------------------------------------------------------------------------
// parseFlags — unit tests (imported directly, real mutation coverage)
// ---------------------------------------------------------------------------

describe('parseFlags', () => {
  it('returns default values when no flags are provided', () => {
    expect(parseFlags([])).toEqual({ repo: undefined, force: false });
  });

  it('extracts the --repo path', () => {
    expect(parseFlags(['--repo', '/some/path'])).toEqual({
      repo: '/some/path',
      force: false,
    });
  });

  it('sets force to true when --force is present', () => {
    expect(parseFlags(['--force'])).toEqual({ repo: undefined, force: true });
  });

  it('extracts both --repo and --force when both are present', () => {
    expect(parseFlags(['--repo', '/my/repo', '--force'])).toEqual({
      repo: '/my/repo',
      force: true,
    });
  });

  it('handles --repo and --force in any order', () => {
    expect(parseFlags(['--force', '--repo', '/alt/path'])).toEqual({
      repo: '/alt/path',
      force: true,
    });
  });

  it('ignores --repo when no value follows it', () => {
    // '--repo' is the last element — args[i+1] is undefined (falsy)
    expect(parseFlags(['--repo'])).toEqual({ repo: undefined, force: false });
  });

  it('ignores unknown flags', () => {
    expect(parseFlags(['--verbose', '--dry-run'])).toEqual({
      repo: undefined,
      force: false,
    });
  });

  it('uses the last --repo value when the flag appears more than once', () => {
    expect(parseFlags(['--repo', '/first', '--repo', '/second'])).toEqual({
      repo: '/second',
      force: false,
    });
  });
});

// ---------------------------------------------------------------------------
// CLI integration — spawns node dist/cli.js
// ---------------------------------------------------------------------------

describe('CLI integration', () => {
  beforeAll(() => {
    if (!existsSync(CLI_PATH)) {
      throw new Error(
        `CLI not built at ${CLI_PATH}. Run 'npm run build' first (or 'npm test' which runs pretest: tsc).`,
      );
    }
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  // -------------------------------------------------------------------------
  // No subcommand
  // -------------------------------------------------------------------------

  describe('no subcommand', () => {
    it('exits with code 1 when called with no arguments', () => {
      const { status } = runCLI([]);
      expect(status).toBe(1);
    });

    it('writes usage information to stderr when no argument is given', () => {
      const { stderr } = runCLI([]);
      expect(stderr).toMatch(/Usage/i);
    });

    it('exits with code 1 when only "snapshot" is given (no sub-subcommand)', () => {
      const { status } = runCLI(['snapshot']);
      expect(status).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown subcommand
  // -------------------------------------------------------------------------

  describe('unknown subcommand', () => {
    it('exits with code 1 for an unknown subcommand', () => {
      const { status } = runCLI(['foobar']);
      expect(status).toBe(1);
    });

    it('writes the unknown subcommand name to stderr', () => {
      const { stderr } = runCLI(['foobar']);
      expect(stderr).toMatch(/foobar/i);
    });

    it('includes usage text in stderr for unknown subcommands', () => {
      const { stderr } = runCLI(['unknown-cmd']);
      expect(stderr).toMatch(/Usage/i);
    });

    it('exits with code 1 for "snapshot" followed by unknown sub-subcommand', () => {
      const { status } = runCLI(['snapshot', 'bogus']);
      expect(status).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // snapshot path
  // -------------------------------------------------------------------------

  describe('snapshot path', () => {
    it('exits with code 1 and writes NOT_BEADS_REPO to stderr when --repo is not a beads repo', () => {
      const tmpDir = makeTmpDir();
      const { status, stderr } = runCLI(['snapshot', 'path', '--repo', tmpDir]);
      expect(status).toBe(1);
      expect(stderr).toMatch(/NOT_BEADS_REPO/);
    });

    it('prints a path to stdout and exits 0 when --repo is a valid beads repo', () => {
      const tmpDir = makeTmpDir();
      makeBeadsRepo(tmpDir, 'my-project');
      const { status, stdout } = runCLI(['snapshot', 'path', '--repo', tmpDir]);
      expect(status).toBe(0);
      expect(stdout.trim().length).toBeGreaterThan(0);
    });

    it('includes the project id in the snapshot path', () => {
      const tmpDir = makeTmpDir();
      makeBeadsRepo(tmpDir, 'alpha-proj');
      const { stdout } = runCLI(['snapshot', 'path', '--repo', tmpDir]);
      expect(stdout).toContain('alpha-proj');
    });

    it('also accepts the subcommand without "snapshot" prefix', () => {
      const tmpDir = makeTmpDir();
      makeBeadsRepo(tmpDir, 'flat-proj');
      const withPrefix = runCLI(['snapshot', 'path', '--repo', tmpDir]);
      const withoutPrefix = runCLI(['path', '--repo', tmpDir]);
      expect(withPrefix.status).toBe(withoutPrefix.status);
      expect(withPrefix.stdout).toBe(withoutPrefix.stdout);
    });
  });

  // -------------------------------------------------------------------------
  // snapshot refresh
  // -------------------------------------------------------------------------

  describe('snapshot refresh', () => {
    it('exits with code 1 and outputs error JSON when --repo is not a beads repo', () => {
      const tmpDir = makeTmpDir();
      const { status, stdout } = runCLI(['snapshot', 'refresh', '--repo', tmpDir]);
      expect(status).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.status).toBe('error');
      expect(parsed.code).toBe('NOT_BEADS_REPO');
    });

    it('writes valid JSON to stdout even on error', () => {
      const tmpDir = makeTmpDir();
      const { stdout } = runCLI(['snapshot', 'refresh', '--repo', tmpDir]);
      expect(() => JSON.parse(stdout)).not.toThrow();
    });

    it('also accepts "refresh" subcommand without "snapshot" prefix', () => {
      const tmpDir = makeTmpDir();
      const withPrefix = runCLI(['snapshot', 'refresh', '--repo', tmpDir]);
      const withoutPrefix = runCLI(['refresh', '--repo', tmpDir]);
      expect(withPrefix.status).toBe(withoutPrefix.status);
      const parsedWith = JSON.parse(withPrefix.stdout);
      const parsedWithout = JSON.parse(withoutPrefix.stdout);
      expect(parsedWith.status).toBe(parsedWithout.status);
      expect(parsedWith.code).toBe(parsedWithout.code);
    });

    it('JSON result includes snapshot_path field on error', () => {
      const tmpDir = makeTmpDir();
      const { stdout } = runCLI(['snapshot', 'refresh', '--repo', tmpDir]);
      const parsed = JSON.parse(stdout);
      expect(parsed).toHaveProperty('snapshot_path');
    });
  });

  // -------------------------------------------------------------------------
  // Exit code contract
  // -------------------------------------------------------------------------

  describe('exit code contract', () => {
    it('always exits with a non-zero code when stderr contains an error', () => {
      const { status, stderr } = runCLI(['totally-invalid']);
      expect(status).not.toBe(0);
      expect(stderr.length).toBeGreaterThan(0);
    });

    it('does not write anything to stderr for a successful path lookup', () => {
      const tmpDir = makeTmpDir();
      makeBeadsRepo(tmpDir, 'clean-proj');
      const { stderr } = runCLI(['snapshot', 'path', '--repo', tmpDir]);
      expect(stderr).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Symlink invocation — regression guard for beads-helix-lva
  // When the bin is invoked via an npm-link / global-install symlink,
  // argv[1] is the symlink path but import.meta.url is the realpath.
  // The is-entry-point check must survive that mismatch.
  // -------------------------------------------------------------------------

  describe('symlink invocation', () => {
    function runViaSymlink(args: string[]): SpawnResult {
      const linkDir = makeTmpDir();
      const linkPath = join(linkDir, 'helix-link.js');
      symlinkSync(CLI_PATH, linkPath);
      const result = spawnSync('node', [linkPath, ...args], {
        encoding: 'utf8',
        timeout: 10_000,
        env: process.env,
      });
      return {
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        status: result.status,
      };
    }

    it('prints usage to stderr and exits 1 when invoked via symlink with no args', () => {
      const { status, stderr } = runViaSymlink([]);
      expect(status).toBe(1);
      expect(stderr).toMatch(/Usage/i);
    });

    it('executes snapshot path and exits 0 when invoked via symlink', () => {
      const tmpDir = makeTmpDir();
      makeBeadsRepo(tmpDir, 'symlinked-proj');
      const { status, stdout } = runViaSymlink(['snapshot', 'path', '--repo', tmpDir]);
      expect(status).toBe(0);
      expect(stdout).toContain('symlinked-proj');
    });
  });
});
