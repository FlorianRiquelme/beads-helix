import { describe, expect, it, vi } from 'vitest';
import { openUrl } from '../../src/bridge/open-url.js';

describe('openUrl', () => {
  it('uses "open" on darwin', async () => {
    const spawner = vi.fn();
    await openUrl('http://localhost:7373/', {
      platform: 'darwin',
      spawn: spawner,
    });
    expect(spawner).toHaveBeenCalledOnce();
    const [command, args] = spawner.mock.calls[0];
    expect(command).toBe('open');
    expect(args).toEqual(['http://localhost:7373/']);
  });

  it('uses "xdg-open" on linux', async () => {
    const spawner = vi.fn();
    await openUrl('http://x/', { platform: 'linux', spawn: spawner });
    const [command] = spawner.mock.calls[0];
    expect(command).toBe('xdg-open');
  });

  it('uses "cmd /c start" on win32', async () => {
    const spawner = vi.fn();
    await openUrl('http://x/', { platform: 'win32', spawn: spawner });
    const [command, args] = spawner.mock.calls[0];
    expect(command).toBe('cmd');
    // Uses an empty-title argument for `start` so URLs containing spaces don't become a title
    expect(args[0]).toBe('/c');
    expect(args[1]).toBe('start');
    expect(args).toContain('http://x/');
  });

  it('rejects URLs missing an http(s) scheme', async () => {
    const spawner = vi.fn();
    await expect(
      openUrl('javascript:alert(1)', {
        platform: 'darwin',
        spawn: spawner,
      }),
    ).rejects.toThrow(/scheme/i);
    expect(spawner).not.toHaveBeenCalled();
  });

  it('accepts https URLs', async () => {
    const spawner = vi.fn();
    await openUrl('https://example.com/', {
      platform: 'darwin',
      spawn: spawner,
    });
    expect(spawner).toHaveBeenCalledOnce();
  });

  it('detaches the spawned process so the CLI can exit independently', async () => {
    const spawner = vi.fn();
    await openUrl('http://localhost/', {
      platform: 'linux',
      spawn: spawner,
    });
    const [, , opts] = spawner.mock.calls[0] as [string, string[], { detached?: boolean; stdio?: string }];
    expect(opts.detached).toBe(true);
    expect(opts.stdio).toBe('ignore');
  });
});
