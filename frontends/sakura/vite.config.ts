import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/sakura/',
  server: {
    host: true,
    port: 5175,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/files': 'http://127.0.0.1:8080',
      '/shared': 'http://127.0.0.1:8080',
      '/images': 'http://127.0.0.1:8080',
      '/live2d': 'http://127.0.0.1:8080',
      '/assets': 'http://127.0.0.1:8080'
    }
  },
  build: {
    outDir: 'dist'
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['node_modules/**', 'dist/**']
  }
});
