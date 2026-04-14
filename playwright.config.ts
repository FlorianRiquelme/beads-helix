import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 7374;
const SIDECAR_DIR = resolve(__dirname, 'e2e/.fixtures/sidecar');
const REGISTRY_PATH = resolve(__dirname, 'e2e/.fixtures/registry.json');

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node dist/cli.js serve',
    url: `http://localhost:${PORT}/_helix-id`,
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      HELIX_MODE: 'project',
      HELIX_PROJECT_ID: 'beads-helix-e2e',
      HELIX_PORT: String(PORT),
      HELIX_REGISTRY_PATH: REGISTRY_PATH,
      HELIX_SIDECAR_DIR: SIDECAR_DIR,
      HELIX_SHUTDOWN_TOKEN: 'e2e-token-not-secret',
      HELIX_UI_DIR: resolve(__dirname, 'dist/ui'),
    },
  },
});
