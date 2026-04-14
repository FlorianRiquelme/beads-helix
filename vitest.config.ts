import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'web/src/**/*.{ts,tsx}'],
      exclude: ['src/index.ts', 'src/cli.ts', 'web/src/main.tsx'],
      thresholds: {
        lines: 90,
        branches: 85,
      },
    },
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            '@shared': resolve(__dirname, 'src/shared'),
          },
        },
        test: {
          name: 'web',
          environment: 'jsdom',
          globals: true,
          include: ['web/src/**/*.test.{ts,tsx}'],
          setupFiles: ['./web/vitest.setup.ts'],
        },
      },
    ],
  },
});
