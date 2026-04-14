import type { ChildProcess } from 'node:child_process';

export type ShutdownResult = 'graceful' | 'forced' | 'already-exited';

export interface ShutdownOptions {
  /** Max time to wait after SIGTERM before escalating to SIGKILL. Default 3000ms. */
  graceMs?: number;
}

/**
 * Politely terminate a child process: SIGTERM → up to graceMs wait →
 * SIGKILL fallback. Resolves with the terminal state.
 *
 * Treats a child that has already exited as `already-exited` — no signals
 * are sent. This makes the function idempotent and safe to call from both
 * SIGINT handlers and child-exit handlers without risk of ESRCH on a
 * recycled PID.
 */
export async function shutdownChild(
  child: ChildProcess,
  opts: ShutdownOptions = {},
): Promise<ShutdownResult> {
  const graceMs = opts.graceMs ?? 3000;

  if (child.exitCode !== null || child.signalCode !== null) {
    return 'already-exited';
  }

  const exitPromise = new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
  });

  child.kill('SIGTERM');

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), graceMs);
  });

  const race = await Promise.race([
    exitPromise.then(() => 'exited' as const),
    timeoutPromise,
  ]);

  if (race === 'exited') {
    if (timer) clearTimeout(timer);
    return 'graceful';
  }

  // Grace window elapsed — escalate.
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
  await exitPromise;
  return 'forced';
}
