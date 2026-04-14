import { promises as fs, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readRegistry,
  writeRegistry,
  upsertProject,
  removeProject,
  healStatuses,
  RegistryVersionError,
} from '../../src/bridge/registry.js';
import {
  emptyRegistry,
  REGISTRY_SCHEMA_VERSION,
  type ProjectEntry,
} from '../../src/shared/registry-schema.js';
import { cleanupTmpDirs, makeTmpDir } from '../helpers/fixtures.js';

function makeEntry(overrides: Partial<ProjectEntry> = {}): ProjectEntry {
  return {
    id: 'proj-001',
    path: '/tmp/example',
    name: 'example',
    added_at: '2026-04-14T10:00:00.000Z',
    last_seen_at: '2026-04-14T10:00:00.000Z',
    status: 'active',
    ...overrides,
  };
}

describe('readRegistry', () => {
  let tmpDir: string;
  let regPath: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    regPath = join(tmpDir, 'projects.json');
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('returns empty registry when file does not exist', async () => {
    const r = await readRegistry({ path: regPath });
    expect(r).toEqual(emptyRegistry());
  });

  it('reads a valid v1 registry', async () => {
    const payload = {
      version: 1,
      projects: [makeEntry()],
    };
    writeFileSync(regPath, JSON.stringify(payload), 'utf8');

    const r = await readRegistry({ path: regPath });
    expect(r.version).toBe(REGISTRY_SCHEMA_VERSION);
    expect(r.projects).toHaveLength(1);
    expect(r.projects[0].id).toBe('proj-001');
  });

  it('treats missing version as v1 (backward compat)', async () => {
    // Pre-versioning install with no "version" field
    writeFileSync(regPath, JSON.stringify({ projects: [makeEntry()] }), 'utf8');

    const r = await readRegistry({ path: regPath });
    expect(r.version).toBe(REGISTRY_SCHEMA_VERSION);
    expect(r.projects).toHaveLength(1);
  });

  it('throws RegistryVersionError for unknown versions', async () => {
    writeFileSync(
      regPath,
      JSON.stringify({ version: 2, projects: [] }),
      'utf8',
    );

    await expect(readRegistry({ path: regPath })).rejects.toThrow(
      RegistryVersionError,
    );
  });

  it('throws on invalid JSON', async () => {
    writeFileSync(regPath, '{ not json', 'utf8');
    await expect(readRegistry({ path: regPath })).rejects.toThrow(
      /not valid JSON/,
    );
  });

  it('throws on schema violation (bad entry)', async () => {
    writeFileSync(
      regPath,
      JSON.stringify({
        version: 1,
        projects: [{ id: '', path: '', name: '' }],
      }),
      'utf8',
    );
    await expect(readRegistry({ path: regPath })).rejects.toThrow(
      /schema validation/,
    );
  });
});

describe('writeRegistry', () => {
  let tmpDir: string;
  let regPath: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    regPath = join(tmpDir, 'nested', 'dir', 'projects.json');
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('creates parent directories and writes registry', async () => {
    await writeRegistry(
      { version: REGISTRY_SCHEMA_VERSION, projects: [makeEntry()] },
      { path: regPath },
    );

    expect(existsSync(regPath)).toBe(true);
    const raw = readFileSync(regPath, 'utf8');
    expect(JSON.parse(raw).projects[0].id).toBe('proj-001');
  });

  it('writes with 0600 permissions', async () => {
    await writeRegistry(emptyRegistry(), { path: regPath });
    const mode = (await fs.stat(regPath)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('leaves no .tmp files behind', async () => {
    await writeRegistry(
      { version: REGISTRY_SCHEMA_VERSION, projects: [makeEntry()] },
      { path: regPath },
    );
    const files = await fs.readdir(join(tmpDir, 'nested', 'dir'));
    expect(files.filter((f) => f.includes('.tmp'))).toHaveLength(0);
  });

  it('rejects invalid registry payloads', async () => {
    await expect(
      writeRegistry(
        // @ts-expect-error intentionally bad
        { version: REGISTRY_SCHEMA_VERSION, projects: [{ id: '' }] },
        { path: regPath },
      ),
    ).rejects.toThrow();
  });
});

describe('upsertProject', () => {
  let tmpDir: string;
  let regPath: string;
  const fixedNow = new Date('2026-04-14T12:00:00.000Z');

  beforeEach(() => {
    tmpDir = makeTmpDir();
    regPath = join(tmpDir, 'projects.json');
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('appends a new project when id is unseen', async () => {
    const r = await upsertProject(makeEntry(), {
      path: regPath,
      now: () => fixedNow,
    });
    expect(r.projects).toHaveLength(1);
    expect(r.projects[0].id).toBe('proj-001');
    expect(r.projects[0].last_seen_at).toBe(fixedNow.toISOString());
  });

  it('updates existing project in place, preserving added_at', async () => {
    await upsertProject(
      makeEntry({ added_at: '2026-01-01T00:00:00.000Z' }),
      { path: regPath, now: () => fixedNow },
    );
    const r = await upsertProject(
      makeEntry({
        added_at: '2099-12-31T00:00:00.000Z', // should be ignored
        name: 'renamed',
      }),
      { path: regPath, now: () => fixedNow },
    );

    expect(r.projects).toHaveLength(1);
    expect(r.projects[0].added_at).toBe('2026-01-01T00:00:00.000Z');
    expect(r.projects[0].name).toBe('renamed');
    expect(r.projects[0].last_seen_at).toBe(fixedNow.toISOString());
  });

  it('handles concurrent upserts without losing entries (fuzz 100x)', async () => {
    const writes = Array.from({ length: 100 }, (_, i) =>
      upsertProject(
        makeEntry({
          id: `proj-${i.toString().padStart(3, '0')}`,
          path: `/tmp/p${i}`,
          name: `p${i}`,
        }),
        { path: regPath, now: () => fixedNow },
      ),
    );

    await Promise.all(writes);

    const final = await readRegistry({ path: regPath });
    expect(final.projects).toHaveLength(100);
    const ids = new Set(final.projects.map((p) => p.id));
    expect(ids.size).toBe(100);
  }, 30_000);
});

describe('removeProject', () => {
  let tmpDir: string;
  let regPath: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    regPath = join(tmpDir, 'projects.json');
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('removes a project by id', async () => {
    await upsertProject(makeEntry({ id: 'a' }), { path: regPath });
    await upsertProject(makeEntry({ id: 'b' }), { path: regPath });
    const r = await removeProject('a', { path: regPath });
    expect(r.projects.map((p) => p.id)).toEqual(['b']);
  });

  it('is a no-op when the file does not exist', async () => {
    const r = await removeProject('ghost', { path: regPath });
    expect(r).toEqual(emptyRegistry());
  });

  it('is a no-op when the id is not present', async () => {
    await upsertProject(makeEntry({ id: 'a' }), { path: regPath });
    const r = await removeProject('ghost', { path: regPath });
    expect(r.projects.map((p) => p.id)).toEqual(['a']);
  });
});

describe('healStatuses', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanupTmpDirs();
  });

  it('marks existing real paths as active', async () => {
    const reg = {
      version: REGISTRY_SCHEMA_VERSION as const,
      projects: [makeEntry({ path: tmpDir })],
    };
    const healed = await healStatuses(reg);
    expect(healed.projects[0].status).toBe('active');
  });

  it('marks missing paths as missing', async () => {
    const reg = {
      version: REGISTRY_SCHEMA_VERSION as const,
      projects: [makeEntry({ path: join(tmpDir, 'does-not-exist') })],
    };
    const healed = await healStatuses(reg);
    expect(healed.projects[0].status).toBe('missing');
  });

  it('uses injected probe for custom logic', async () => {
    const reg = {
      version: REGISTRY_SCHEMA_VERSION as const,
      projects: [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })],
    };
    const healed = await healStatuses(reg, async () => 'moved');
    expect(healed.projects.every((p) => p.status === 'moved')).toBe(true);
  });

  it('does not mutate the registry file', async () => {
    // healStatuses is pure — it returns a new object, never writes.
    const reg = {
      version: REGISTRY_SCHEMA_VERSION as const,
      projects: [makeEntry({ path: tmpDir })],
    };
    const healed = await healStatuses(reg);
    expect(healed).not.toBe(reg);
    expect(healed.projects[0]).not.toBe(reg.projects[0]);
  });
});
