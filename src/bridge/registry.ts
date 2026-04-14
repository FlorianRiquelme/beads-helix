import { promises as fs } from 'node:fs';
import * as fsSync from 'node:fs';
import { dirname, join } from 'node:path';
import lockfile from 'proper-lockfile';
import {
  Registry,
  RegistrySchema,
  ProjectEntry,
  ProjectEntrySchema,
  emptyRegistry,
  REGISTRY_SCHEMA_VERSION,
} from '../shared/registry-schema.js';
import { helixHomeDir, registryPath } from '../shared/paths.js';

export class RegistryVersionError extends Error {
  constructor(found: unknown) {
    super(
      `Registry at ${registryPath()} has unknown version ${JSON.stringify(
        found,
      )} (expected ${REGISTRY_SCHEMA_VERSION}). Upgrade helix or move the file aside.`,
    );
    this.name = 'RegistryVersionError';
  }
}

export interface ReadOptions {
  path?: string;
}

export interface WriteOptions {
  path?: string;
}

async function ensureHomeDir(path: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
}

// In-process serialization per registry path.
// proper-lockfile provides cross-process protection; within the same Node
// process, multiple concurrent lock attempts on the same file will fail with
// "Lock file is already being held" because proper-lockfile tracks locks in
// process-local state. This mutex queues same-process writers.
const inProcessMutex = new Map<string, Promise<unknown>>();

async function withPathMutex<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const prior = inProcessMutex.get(path) ?? Promise.resolve();
  const next = prior.then(fn, fn);
  inProcessMutex.set(path, next);
  try {
    return await next;
  } finally {
    // Clean up only if we're still the tail — prevents leaking completed promises.
    if (inProcessMutex.get(path) === next) {
      inProcessMutex.delete(path);
    }
  }
}

export async function readRegistry(opts: ReadOptions = {}): Promise<Registry> {
  const path = opts.path ?? registryPath();
  let raw: string;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyRegistry();
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Registry at ${path} is not valid JSON: ${(err as Error).message}`);
  }

  // Version guard BEFORE zod — missing version treated as v1, higher versions rejected loudly.
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (obj.version === undefined) {
      obj.version = REGISTRY_SCHEMA_VERSION;
      if (!Array.isArray(obj.projects)) obj.projects = [];
    } else if (obj.version !== REGISTRY_SCHEMA_VERSION) {
      throw new RegistryVersionError(obj.version);
    }
  }

  const result = RegistrySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Registry at ${path} failed schema validation: ${result.error.message}`,
    );
  }
  return result.data;
}

async function atomicWrite(path: string, data: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, path);
}

export async function writeRegistry(
  registry: Registry,
  opts: WriteOptions = {},
): Promise<void> {
  const path = opts.path ?? registryPath();
  await ensureHomeDir(path);

  // proper-lockfile requires the target file to exist; touch it if missing.
  if (!fsSync.existsSync(path)) {
    await fs.writeFile(path, JSON.stringify(emptyRegistry(), null, 2), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    }).catch((err) => {
      // Tolerate race where another writer created the file first.
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    });
  }

  await withPathMutex(path, async () => {
    const release = await lockfile.lock(path, {
      retries: { retries: 20, minTimeout: 20, maxTimeout: 200, factor: 1.5 },
      stale: 5000,
    });
    try {
      const validated = RegistrySchema.parse(registry);
      await atomicWrite(path, JSON.stringify(validated, null, 2) + '\n');
    } finally {
      await release();
    }
  });
}

export interface UpsertOptions extends WriteOptions {
  now?: () => Date;
}

export async function upsertProject(
  entry: ProjectEntry,
  opts: UpsertOptions = {},
): Promise<Registry> {
  const path = opts.path ?? registryPath();
  const now = opts.now ?? (() => new Date());
  await ensureHomeDir(path);

  if (!fsSync.existsSync(path)) {
    await fs.writeFile(path, JSON.stringify(emptyRegistry(), null, 2), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    }).catch((err) => {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    });
  }

  return withPathMutex(path, async () => {
    const release = await lockfile.lock(path, {
      retries: { retries: 20, minTimeout: 20, maxTimeout: 200, factor: 1.5 },
      stale: 5000,
    });
    try {
      const current = await readRegistry({ path });
      const validated = ProjectEntrySchema.parse({
        ...entry,
        last_seen_at: now().toISOString(),
      });

      const existingIdx = current.projects.findIndex((p) => p.id === validated.id);
      const next: Registry = {
        version: REGISTRY_SCHEMA_VERSION,
        projects:
          existingIdx >= 0
            ? current.projects.map((p, i) =>
                i === existingIdx
                  ? { ...validated, added_at: p.added_at }
                  : p,
              )
            : [...current.projects, validated],
      };

      await atomicWrite(path, JSON.stringify(next, null, 2) + '\n');
      return next;
    } finally {
      await release();
    }
  });
}

export async function removeProject(
  id: string,
  opts: WriteOptions = {},
): Promise<Registry> {
  const path = opts.path ?? registryPath();
  await ensureHomeDir(path);

  if (!fsSync.existsSync(path)) {
    return emptyRegistry();
  }

  return withPathMutex(path, async () => {
    const release = await lockfile.lock(path, {
      retries: { retries: 20, minTimeout: 20, maxTimeout: 200, factor: 1.5 },
      stale: 5000,
    });
    try {
      const current = await readRegistry({ path });
      const next: Registry = {
        version: REGISTRY_SCHEMA_VERSION,
        projects: current.projects.filter((p) => p.id !== id),
      };
      await atomicWrite(path, JSON.stringify(next, null, 2) + '\n');
      return next;
    } finally {
      await release();
    }
  });
}

export interface HealProbe {
  (path: string): Promise<'active' | 'missing' | 'moved'>;
}

/**
 * Lazy healing: compute status on read without mutating the registry file.
 *
 * Default probe treats a resolvable path as 'active' — symlink expansion
 * (e.g. macOS /tmp → /private/tmp) does not count as moved. Detecting a true
 * 'moved' state (project renamed/relocated after registration) requires a
 * caller-provided probe that compares against a stored fingerprint.
 */
export async function healStatuses(
  registry: Registry,
  probe?: HealProbe,
): Promise<Registry> {
  const defaultProbe: HealProbe = async (p) => {
    try {
      await fs.realpath(p);
      return 'active';
    } catch {
      return 'missing';
    }
  };
  const probeFn = probe ?? defaultProbe;

  const healed = await Promise.all(
    registry.projects.map(async (p) => {
      try {
        const status = await probeFn(p.path);
        return { ...p, status };
      } catch {
        return { ...p, status: 'missing' as const };
      }
    }),
  );

  return { version: REGISTRY_SCHEMA_VERSION, projects: healed };
}

export { helixHomeDir, registryPath };
export { join };
