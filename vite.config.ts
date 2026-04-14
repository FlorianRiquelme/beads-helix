import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Vite builds the SPA into dist/ui/, which the Hono server serves at runtime.
// Contract is verified by tests/packaging.test.ts.
export default defineConfig({
  root: resolve(__dirname, 'web'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/ui'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:7373',
      '/_helix-id': 'http://localhost:7373',
    },
  },
});
