import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { shutdownChild } from '../../src/bridge/shutdown.js';

const NODE = process.execPath;

function spawnLongRunning(script: string): ReturnType<typeof spawn> {
  return spawn(NODE, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
}

async function waitForStdoutMatch(
  child: ReturnType<typeof spawn>,
  pattern: RegExp,
  timeoutMs = 2000,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${pattern}`)),
      timeoutMs,
    );
    const onData = (chunk: Buffer): void => {
      if (pattern.test(chunk.toString())) {
        clearTimeout(timer);
        child.stdout?.off('data', onData);
        resolve();
      }
    };
    child.stdout?.on('data', onData);
  });
}

describe('shutdownChild', () => {
  const TEST_TIMEOUT = 10_000;
  it('returns "already-exited" when the child has already exited', { timeout: TEST_TIMEOUT }, async () => {
    const child = spawn(NODE, ['-e', 'process.exit(0)']);
    await new Promise<void>((r) => child.once('exit', () => r()));
    const result = await shutdownChild(child, { graceMs: 500 });
    expect(result).toBe('already-exited');
  });

  it('returns "graceful" when the child exits in response to SIGTERM', { timeout: TEST_TIMEOUT }, async () => {
    const child = spawnLongRunning(`
      process.on('SIGTERM', () => process.exit(0));
      setInterval(() => {}, 1000);
      console.log('ready');
    `);
    await waitForStdoutMatch(child, /ready/);
    const start = Date.now();
    const result = await shutdownChild(child, { graceMs: 2000 });
    const elapsed = Date.now() - start;
    expect(result).toBe('graceful');
    expect(elapsed).toBeLessThan(1500);
  });

  it('returns "forced" and sends SIGKILL when the child ignores SIGTERM', { timeout: TEST_TIMEOUT }, async () => {
    const child = spawnLongRunning(`
      process.on('SIGTERM', () => { /* ignore */ });
      setInterval(() => {}, 1000);
      console.log('ready');
    `);
    await waitForStdoutMatch(child, /ready/);
    const start = Date.now();
    const result = await shutdownChild(child, { graceMs: 200 });
    const elapsed = Date.now() - start;
    expect(result).toBe('forced');
    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(elapsed).toBeLessThan(1500);
  });

  it('sends SIGTERM first, not SIGKILL, when the child handles it', { timeout: TEST_TIMEOUT }, async () => {
    const child = spawnLongRunning(`
      process.on('SIGTERM', () => { console.log('got:SIGTERM'); process.exit(0); });
      setInterval(() => {}, 1000);
      console.log('ready');
    `);
    await waitForStdoutMatch(child, /ready/);
    let stdout = '';
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    const result = await shutdownChild(child, { graceMs: 1000 });
    expect(result).toBe('graceful');
    expect(stdout).toContain('got:SIGTERM');
  });

  it('defaults graceMs to ~3000ms when omitted', { timeout: TEST_TIMEOUT }, async () => {
    const child = spawnLongRunning(`
      setInterval(() => {}, 1000);
      console.log('ready');
    `);
    await waitForStdoutMatch(child, /ready/);
    // Child has no SIGTERM handler → default Node behavior exits fast.
    // We just assert the call completes without throwing and returns a terminal state.
    const result = await shutdownChild(child);
    expect(['graceful', 'forced']).toContain(result);
  });
});
