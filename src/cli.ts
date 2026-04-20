#!/usr/bin/env node

import { existsSync, realpathSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveSnapshotPath, refresh } from './snapshot.js';
import { runView } from './commands/view.js';
import { runServe } from './commands/serve.js';

/**
 * Locate the static UI bundle shipped alongside the compiled CLI.
 * Returns undefined if no bundle is present (e.g. dev scripts without `npm run build:ui`).
 */
function defaultUiDir(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = pathResolve(here, 'ui');
  return existsSync(candidate) ? candidate : undefined;
}

function usage(): void {
  process.stderr.write(`Usage:
  helix snapshot path  [--repo <path>]           Print snapshot file path
  helix snapshot refresh [--repo <path>] [--force]  Generate/refresh snapshot
  helix view [--repo <path>]                     Open flight deck for current project
  helix deck [--repo <path>]                     Open cross-project flight deck
  helix serve                                    (internal) Server subprocess entry
`);
  process.exit(1);
}

export function parseFlags(args: string[]): { repo?: string; force: boolean } {
  let repo: string | undefined;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo' && args[i + 1]) {
      repo = args[++i];
    } else if (args[i] === '--force') {
      force = true;
    }
  }
  return { repo, force };
}

export async function main(argv: string[]): Promise<void> {
  // Expect: helix snapshot <subcommand>
  // CLI is invoked as `helix snapshot path` or `helix snapshot refresh`
  // When called via bin/helix, argv[0] is "snapshot", argv[1] is the subcommand
  // For direct invocation, handle both patterns

  let subcommand: string | undefined;
  let flagArgs: string[];

  if (argv[0] === 'snapshot') {
    subcommand = argv[1];
    flagArgs = argv.slice(2);
  } else {
    subcommand = argv[0];
    flagArgs = argv.slice(1);
  }

  if (!subcommand) {
    usage();
    return;
  }

  const flags = parseFlags(flagArgs);

  switch (subcommand) {
    case 'path': {
      const result = resolveSnapshotPath(flags.repo);
      if ('error' in result) {
        process.stderr.write(`Error: ${result.error}\n`);
        process.exit(1);
      }
      process.stdout.write(result.path + '\n');
      break;
    }

    case 'refresh': {
      const result = await refresh(flags.repo, flags.force);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      if (result.status === 'error') {
        process.exit(1);
      }
      break;
    }

    case 'view': {
      const result = await runView({
        cwd: flags.repo,
        forceDeck: false,
        preferredPort: preferredPortFromEnv(),
        deps: viewDepsFromEnv(),
      });
      process.stdout.write(
        `helix ${result.action} — ${result.mode} mode @ ${result.url}\n`,
      );
      await result.wait();
      break;
    }

    case 'deck': {
      const result = await runView({
        cwd: flags.repo,
        forceDeck: true,
        preferredPort: preferredPortFromEnv(),
        deps: viewDepsFromEnv(),
      });
      process.stdout.write(
        `helix ${result.action} — deck @ ${result.url}\n`,
      );
      await result.wait();
      break;
    }

    case 'serve': {
      // Internal entry invoked by the spawn launcher. Reads config from env,
      // writes HELIX_READY sentinel, then runs until SIGTERM.
      const env = { ...process.env };
      if (!env.HELIX_UI_DIR) {
        const ui = defaultUiDir();
        if (ui) env.HELIX_UI_DIR = ui;
      }
      await runServe({
        env,
        installSignalHandlers: true,
      });
      // runServe installs signal handlers that call process.exit on SIGTERM.
      // Park the main promise so the event loop stays alive on the server.
      await new Promise<void>(() => {
        /* intentional: never resolves */
      });
      break;
    }

    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      usage();
  }
}

/**
 * Test-mode escape hatches wired via env vars. Kept narrow and CLI-only so
 * the view/serve unit tests remain free of process env coupling.
 *
 *  HELIX_SKIP_OPEN=1  — replace openUrl with a no-op (integration tests)
 *  HELIX_REGISTRY_PATH, HELIX_SIDECAR_DIR — override default paths
 *  HELIX_PREFERRED_PORT — integer, override the 7373 default (tests use 0)
 */
function preferredPortFromEnv(): number | undefined {
  const raw = process.env.HELIX_PREFERRED_PORT;
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function viewDepsFromEnv(): Parameters<typeof runView>[0] extends infer P
  ? P extends { deps?: infer D }
    ? D
    : never
  : never {
  const deps: NonNullable<Parameters<typeof runView>[0]>['deps'] = {};
  if (process.env.HELIX_SKIP_OPEN === '1') {
    deps.open = async () => {};
  }
  const registryOverride = process.env.HELIX_REGISTRY_PATH;
  const sidecarOverride = process.env.HELIX_SIDECAR_DIR;
  if (registryOverride || sidecarOverride) {
    deps.paths = {};
    if (registryOverride) deps.paths.registry = registryOverride;
    if (sidecarOverride) deps.paths.sidecar = sidecarOverride;
  }
  return deps;
}

// Only run main() when this module is the entry point, not when imported by tests.
// realpathSync resolves symlinks so the comparison holds under `npm link` /
// `npm install -g`, where argv[1] is the bin symlink but import.meta.url is the target.
function isEntryPoint(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return import.meta.url === pathToFileURL(argv1).href;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
  });
}
