/**
 * Dev-mode API boot. Mirrors the production path by calling startServer()
 * directly — same code runs in dev as in prod, no subprocess, no HELIX_UI_DIR
 * (Vite serves the SPA with HMR on :5173 and proxies /api here).
 *
 * Run via `npm run dev:api` (or as part of `npm run dev`).
 */
import { basename } from 'node:path';
import { findBeadsRepo } from '../src/repo.js';
import { refresh } from '../src/snapshot.js';
import { startServer } from '../src/server/index.js';
import { registryPath, sidecarDir } from '../src/shared/paths.js';
import { upsertProject } from '../src/bridge/registry.js';

const PORT = Number.parseInt(process.env.HELIX_DEV_PORT ?? '7373', 10);

async function main(): Promise<void> {
  const repo = findBeadsRepo(process.cwd());
  if (!repo) {
    process.stderr.write(
      'dev-server: no .beads/ directory found in CWD — run from a beads repo\n',
    );
    process.exit(1);
  }

  const nowIso = new Date().toISOString();
  await upsertProject(
    {
      id: repo.projectId,
      path: repo.root,
      name: basename(repo.root),
      added_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
    },
    { path: registryPath() },
  );

  const refreshResult = await refresh(repo.root, false);
  if (refreshResult.status === 'error') {
    process.stderr.write(
      `dev-server: initial snapshot refresh failed (${refreshResult.code ?? 'unknown'}): ${
        'message' in refreshResult ? refreshResult.message : ''
      }\n`,
    );
  }

  const handle = await startServer({
    config: {
      registryPath: registryPath(),
      sidecarDir: sidecarDir(),
      shutdownToken: 'dev',
      port: PORT,
      mode: 'project',
      projectId: repo.projectId,
    },
  });

  process.stdout.write(
    `\n  Helix API  ${handle.url}  (project ${repo.projectId})\n` +
      `  Snapshot   ${sidecarDir()}/${repo.projectId}.snapshot.json\n\n`,
  );

  const shutdown = (): void => {
    void handle.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  process.stderr.write(`dev-server: fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
