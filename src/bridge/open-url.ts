import { spawn as realSpawn, type SpawnOptions } from 'node:child_process';

export interface OpenUrlOptions {
  /** Platform override (defaults to process.platform). */
  platform?: NodeJS.Platform;
  /** Injectable spawn for tests. */
  spawn?: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => unknown;
}

/**
 * Launch the system browser pointed at `url`. Refuses anything other than
 * http(s) — the CLI never has reason to open arbitrary schemes, and
 * accepting them turns this into an attacker-controlled command dispatcher
 * if a URL ever flows in from an untrusted source.
 *
 * The spawned process is detached with stdio ignored so the CLI can exit
 * without waiting for the browser.
 */
export async function openUrl(
  url: string,
  opts: OpenUrlOptions = {},
): Promise<void> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`openUrl: refusing URL with unsafe scheme: ${url}`);
  }
  const platform = opts.platform ?? process.platform;
  const spawnFn = opts.spawn ?? realSpawn;

  const { command, args } = commandFor(platform, url);
  const spawnOpts: SpawnOptions = { detached: true, stdio: 'ignore' };
  const handle = spawnFn(command, args, spawnOpts);
  // Real spawn returns a ChildProcess with .unref(); tests pass a plain fn.
  if (
    handle &&
    typeof handle === 'object' &&
    'unref' in handle &&
    typeof (handle as { unref?: () => void }).unref === 'function'
  ) {
    (handle as { unref: () => void }).unref();
  }
}

function commandFor(
  platform: NodeJS.Platform,
  url: string,
): { command: string; args: string[] } {
  switch (platform) {
    case 'darwin':
      return { command: 'open', args: [url] };
    case 'win32':
      // `start` treats the first quoted arg as the window title; passing an
      // empty title prevents a URL with spaces (rare but possible) from being
      // mis-parsed as the title.
      return { command: 'cmd', args: ['/c', 'start', '""', url] };
    default:
      return { command: 'xdg-open', args: [url] };
  }
}
