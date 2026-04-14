import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  findBeadsRepo,
  getDoltServerPort,
  getEmbeddedDoltPath,
  getLastTouchedPath,
  snapshotPath,
  lockPath,
} from '../src/repo.js';
import { makeTmpDir, cleanupTmpDirs } from './helpers/fixtures.js';

afterEach(() => {
  cleanupTmpDirs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBeadsDir(root: string): string {
  const beadsDir = join(root, '.beads');
  mkdirSync(beadsDir, { recursive: true });
  return beadsDir;
}

function writeMetadata(beadsDir: string, data: unknown): void {
  writeFileSync(join(beadsDir, 'metadata.json'), JSON.stringify(data), 'utf-8');
}

// ---------------------------------------------------------------------------
// findBeadsRepo
// ---------------------------------------------------------------------------

describe('findBeadsRepo', () => {
  it('returns null when .beads/ does not exist', () => {
    const root = makeTmpDir();
    expect(findBeadsRepo(root)).toBeNull();
  });

  it('returns null when metadata.json is missing', () => {
    const root = makeTmpDir();
    makeBeadsDir(root);
    expect(findBeadsRepo(root)).toBeNull();
  });

  it('returns null when project_id is missing from metadata', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeMetadata(beadsDir, { dolt_database: 'mydb' });
    expect(findBeadsRepo(root)).toBeNull();
  });

  it('returns null when project_id is a number', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeMetadata(beadsDir, { project_id: 42 });
    expect(findBeadsRepo(root)).toBeNull();
  });

  it('returns null when project_id is an object', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeMetadata(beadsDir, { project_id: { nested: 'value' } });
    expect(findBeadsRepo(root)).toBeNull();
  });

  it('returns null when project_id contains path traversal characters (../../evil)', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeMetadata(beadsDir, { project_id: '../../evil' });
    expect(findBeadsRepo(root)).toBeNull();
  });

  it('returns null when project_id contains a forward slash (foo/bar)', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeMetadata(beadsDir, { project_id: 'foo/bar' });
    expect(findBeadsRepo(root)).toBeNull();
  });

  it('returns null when project_id contains dots with slashes (foo..bar style)', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    // The regex only allows [a-zA-Z0-9_-], so a dot itself is also rejected
    writeMetadata(beadsDir, { project_id: 'foo.bar' });
    expect(findBeadsRepo(root)).toBeNull();
  });

  it('returns a valid BeadsRepo with correct root, beadsDir, and projectId', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeMetadata(beadsDir, { project_id: 'my-project', dolt_database: 'mydb' });

    const repo = findBeadsRepo(root);

    expect(repo).not.toBeNull();
    expect(repo!.root).toBe(root);
    expect(repo!.beadsDir).toBe(beadsDir);
    expect(repo!.projectId).toBe('my-project');
    expect(repo!.doltDatabase).toBe('mydb');
  });

  it('defaults doltDatabase to "hq" when dolt_database is absent from metadata', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeMetadata(beadsDir, { project_id: 'alpha' });

    const repo = findBeadsRepo(root);

    expect(repo).not.toBeNull();
    expect(repo!.doltDatabase).toBe('hq');
  });

  it('uses process.cwd() when no startPath is provided', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeMetadata(beadsDir, { project_id: 'cwd-project' });

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);

    const repo = findBeadsRepo();

    expect(cwdSpy).toHaveBeenCalled();
    expect(repo).not.toBeNull();
    expect(repo!.root).toBe(root);
    expect(repo!.projectId).toBe('cwd-project');
  });

  it('resolves a relative startPath to an absolute path', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeMetadata(beadsDir, { project_id: 'relative-proj' });

    // Stub cwd so that resolve('./relative') lands in our tmp dir.
    // We derive the relative path from cwd, so we need to set cwd to the
    // parent of root.
    const parentDir = dirname(root);
    const dirName = basename(root);

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(parentDir);

    const repo = findBeadsRepo(`./${dirName}`);

    expect(cwdSpy).toHaveBeenCalled();
    expect(repo).not.toBeNull();
    expect(repo!.projectId).toBe('relative-proj');
    expect(repo!.root).toBe(root);
  });

  it('accepts project_id values containing letters, numbers, underscores and hyphens', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeMetadata(beadsDir, { project_id: 'Project_123-ABC' });

    const repo = findBeadsRepo(root);

    expect(repo).not.toBeNull();
    expect(repo!.projectId).toBe('Project_123-ABC');
  });
});

// ---------------------------------------------------------------------------
// getDoltServerPort
// ---------------------------------------------------------------------------

describe('getDoltServerPort', () => {
  it('returns null when port file is missing', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeFileSync(join(beadsDir, 'dolt-server.pid'), '12345', 'utf-8');

    expect(getDoltServerPort(beadsDir)).toBeNull();
  });

  it('returns null when pid file is missing', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeFileSync(join(beadsDir, 'dolt-server.port'), '3306', 'utf-8');

    expect(getDoltServerPort(beadsDir)).toBeNull();
  });

  it('returns null when port file contains non-numeric content', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeFileSync(join(beadsDir, 'dolt-server.port'), 'not-a-number', 'utf-8');
    writeFileSync(join(beadsDir, 'dolt-server.pid'), '12345', 'utf-8');

    expect(getDoltServerPort(beadsDir)).toBeNull();
  });

  it('returns the parsed port number when both files exist', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeFileSync(join(beadsDir, 'dolt-server.port'), '3306\n', 'utf-8');
    writeFileSync(join(beadsDir, 'dolt-server.pid'), '99001', 'utf-8');

    expect(getDoltServerPort(beadsDir)).toBe(3306);
  });

  it('trims whitespace before parsing the port', () => {
    const root = makeTmpDir();
    const beadsDir = makeBeadsDir(root);
    writeFileSync(join(beadsDir, 'dolt-server.port'), '  5432  ', 'utf-8');
    writeFileSync(join(beadsDir, 'dolt-server.pid'), '42', 'utf-8');

    expect(getDoltServerPort(beadsDir)).toBe(5432);
  });
});

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

describe('getEmbeddedDoltPath', () => {
  it('joins beadsDir, embeddeddolt, and database name', () => {
    const result = getEmbeddedDoltPath('/some/.beads', 'mydb');
    expect(result).toBe('/some/.beads/embeddeddolt/mydb');
  });

  it('handles the default "hq" database name', () => {
    const result = getEmbeddedDoltPath('/project/.beads', 'hq');
    expect(result).toBe('/project/.beads/embeddeddolt/hq');
  });
});

describe('getLastTouchedPath', () => {
  it('returns the last-touched file path inside beadsDir', () => {
    const result = getLastTouchedPath('/project/.beads');
    expect(result).toBe('/project/.beads/last-touched');
  });
});

describe('snapshotPath', () => {
  it('returns the snapshot JSON path under the OS tmp sidecar dir', () => {
    const result = snapshotPath('my-proj');
    expect(result).toBe(join(tmpdir(), 'beads-sidecar', 'my-proj.snapshot.json'));
  });

  it('incorporates the full projectId in the filename', () => {
    const result = snapshotPath('alpha_123-XYZ');
    expect(result).toBe(join(tmpdir(), 'beads-sidecar', 'alpha_123-XYZ.snapshot.json'));
  });
});

describe('lockPath', () => {
  it('returns the refresh lock path under the OS tmp sidecar dir', () => {
    const result = lockPath('my-proj');
    expect(result).toBe(join(tmpdir(), 'beads-sidecar', 'my-proj.refresh.lock'));
  });

  it('incorporates the full projectId in the filename', () => {
    const result = lockPath('beta_456-ABC');
    expect(result).toBe(join(tmpdir(), 'beads-sidecar', 'beta_456-ABC.refresh.lock'));
  });
});
