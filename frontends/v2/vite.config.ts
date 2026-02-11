import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  base: '/v2/',
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/files': 'http://127.0.0.1:8080',
      '/viewer': 'http://127.0.0.1:8080',
      '/images': 'http://127.0.0.1:8080',
      '/live2d': 'http://127.0.0.1:8080'
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts'
  }
});
