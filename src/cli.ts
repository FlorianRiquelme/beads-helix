#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { resolveSnapshotPath, refresh } from './snapshot.js';

function usage(): void {
  process.stderr.write(`Usage:
  helix snapshot path  [--repo <path>]           Print snapshot file path
  helix snapshot refresh [--repo <path>] [--force]  Generate/refresh snapshot
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

    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      usage();
  }
}

// Only run main() when this module is the entry point, not when imported by tests
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
  });
}
