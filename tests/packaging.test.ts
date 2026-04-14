/**
 * Packaging contract — phase 6 done-def: dist/ui/ ships in the npm tarball.
 *
 * The downstream UI tickets (beads-helix-vm2, beads-helix-wso) build their
 * SPA into dist/ui/. This test creates a fake dist/ui/index.html and
 * verifies `npm pack --dry-run` would include it. If a future tweak to
 * package.json#files breaks the contract (e.g. someone replaces "dist" with
 * "dist/*.js"), this test catches it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

interface PackEntry {
  path: string;
  size: number;
}

interface PackManifest {
  files: PackEntry[];
}

function npmPackJson(): PackManifest {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(`npm pack failed: ${result.stderr}`);
  }
  const parsed = JSON.parse(result.stdout) as PackManifest[];
  return parsed[0];
}

const FAKE_UI_DIR = join(REPO_ROOT, 'dist', 'ui');

describe('packaging contract', () => {
  afterEach(() => {
    if (existsSync(FAKE_UI_DIR)) {
      rmSync(FAKE_UI_DIR, { recursive: true, force: true });
    }
  });

  it('includes dist/ui/index.html in the published tarball when present', () => {
    mkdirSync(FAKE_UI_DIR, { recursive: true });
    writeFileSync(join(FAKE_UI_DIR, 'index.html'), '<!doctype html><html></html>');
    writeFileSync(join(FAKE_UI_DIR, 'app.js'), 'console.log("ui");');

    const manifest = npmPackJson();
    const paths = manifest.files.map((f) => f.path);
    expect(paths).toContain('dist/ui/index.html');
    expect(paths).toContain('dist/ui/app.js');
  });

  it('includes the CLI bin entry in the published tarball', () => {
    const manifest = npmPackJson();
    const paths = manifest.files.map((f) => f.path);
    expect(paths).toContain('dist/cli.js');
  });

  it('includes the server bundle in the published tarball', () => {
    const manifest = npmPackJson();
    const paths = manifest.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('dist/server/'))).toBe(true);
    expect(paths.some((p) => p.startsWith('dist/bridge/'))).toBe(true);
  });

  it('does NOT include source typescript files', () => {
    const manifest = npmPackJson();
    const paths = manifest.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('src/'))).toBe(false);
    expect(paths.some((p) => p.endsWith('.ts') && !p.endsWith('.d.ts'))).toBe(false);
  });

  it('does NOT include test files or fixtures', () => {
    const manifest = npmPackJson();
    const paths = manifest.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('tests/'))).toBe(false);
    expect(paths.some((p) => p.includes('.test.'))).toBe(false);
  });
});
