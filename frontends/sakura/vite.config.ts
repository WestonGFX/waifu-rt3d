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
      '/frontends': 'http://127.0.0.1:8080',
      '/assets': 'http://127.0.0.1:8080',
      '/ws': {
        target: 'ws://127.0.0.1:8080',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        /**
         * Split large vendor libraries into parallel-loadable chunks.
         * Vite automatically injects <link rel="modulepreload"> for all chunks,
         * so the browser can download them concurrently with the main bundle.
         *
         * Rationale per chunk:
         * - vendor-framer: framer-motion is ~250 KB parsed and used by 37 components.
         *   Isolating it lets the browser load it in parallel, cutting the critical path.
         * - vendor-react: React + ReactDOM are stable between releases — isolating them
         *   gives long-lived cache hits even when app code changes frequently.
         * - vendor-state: Zustand is imported everywhere; isolating improves hash stability.
         * - vendor-icons: lucide-react icon tree-shaking varies per build; isolating
         *   prevents icon changes from busting the react or framer caches.
         */
        manualChunks(id: string) {
          if (id.includes('framer-motion')) return 'vendor-framer';
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'vendor-react';
          if (id.includes('node_modules/zustand')) return 'vendor-state';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['node_modules/**', 'dist/**', 'e2e/**']
  }
});
