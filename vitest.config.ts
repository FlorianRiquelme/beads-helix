import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // cli.ts main() runs in spawned child processes (see cli.test.ts),
      // which v8 coverage cannot instrument. parseFlags is tested directly,
      // but its instrumentation is obscured. Mutation testing via Stryker
      // still covers cli.ts because it re-runs the child-process tests.
      exclude: ['src/index.ts', 'src/cli.ts'],
      thresholds: {
        lines: 90,
        branches: 85,
      },
    },
  },
});
