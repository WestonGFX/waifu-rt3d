import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * Girly frontend — waifu-rt3d port of AnimeGirly.
 *
 * All local-asset middleware (localAssetsPlugin) and PWA config removed.
 * The waifu-rt3d backend handles model serving via /files/models/ and
 * API endpoints like /api/chat/stream. Dev server proxies all /api, /files,
 * /shared, and /ws paths to the backend at localhost:8080.
 */
export default defineConfig({
  base: '/girly/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5178,
    proxy: {
      '/api': 'http://localhost:8080',
      '/files': 'http://localhost:8080',
      '/shared': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Tauri APIs are dynamically imported and guarded by isTauriEnvironment().
      // Externalize them so Rollup doesn't fail when @tauri-apps/api isn't installed.
      external: [/^@tauri-apps\//],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
