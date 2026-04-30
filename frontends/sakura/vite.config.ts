import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from './package.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Inject a per-build cache identifier into public/sw.js.
 *
 * The service worker (public/sw.js) hardcoded `CACHE_NAME = 'sakura-v1'` for
 * months, so every Sakura release after the first one risked serving stale
 * cached HTML/CSS/JS forever. This plugin replaces the literal
 * `'__SAKURA_BUILD_ID__'` with `'sakura-<version>-<timestamp>'` so each build
 * (and each dev session) gets a unique cache name. The SW's existing activate
 * handler purges any cache whose name doesn't match — so the new SW evicts the
 * old one automatically with no user-side clear.
 *
 * Dev mode: replacement happens via middleware on every /sw.js request, using
 * `Date.now()`. Each browser load gets a fresh cache + automatic eviction.
 *
 * Production: replacement happens in `writeBundle`, after Vite copies
 * public/sw.js to dist/sw.js.
 */
function injectSwBuildId(): Plugin {
  const swSourcePath = resolve(__dirname, 'public/sw.js');
  const placeholder = /'__SAKURA_BUILD_ID__'/g;

  return {
    name: 'inject-sw-build-id',
    configureServer(server) {
      server.middlewares.use('/sw.js', (_req, res, next) => {
        try {
          const content = readFileSync(swSourcePath, 'utf-8');
          if (!placeholder.test(content)) {
            return next();
          }
          const buildId = `sakura-${pkg.version}-dev-${Date.now()}`;
          const replaced = content.replace(placeholder, JSON.stringify(buildId));
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Cache-Control', 'no-store');
          res.end(replaced);
        } catch (err) {
          next(err as Error);
        }
      });
    },
    writeBundle(outputOptions) {
      const distDir = outputOptions.dir ?? resolve(__dirname, 'dist');
      const distSwPath = resolve(distDir, 'sw.js');
      try {
        const content = readFileSync(distSwPath, 'utf-8');
        if (!placeholder.test(content)) {
          return;
        }
        const buildId = `sakura-${pkg.version}-${Date.now()}`;
        const replaced = content.replace(placeholder, JSON.stringify(buildId));
        writeFileSync(distSwPath, replaced);
        console.info(`[inject-sw-build-id] dist/sw.js cache name → ${buildId}`);
      } catch (err) {
        console.warn('[inject-sw-build-id] writeBundle skipped:', err);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), injectSwBuildId()],
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
