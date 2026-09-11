import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5174,
    https: true,
    hmr: {
      host: 'localhost',
    },
    proxy: { 
      '/api': {
        target: 'https://pos-backend.bragill2012.workers.dev',
        changeOrigin: true,
        secure: false,
      }
    },
  },
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      // Manifest is served statically from public/manifest.json so it also
      // resolves in dev (avoids manifest 404/syntax errors) and stays in
      // one place for both dev and production builds.
      manifest: false,
      includeAssets: ['favicon.ico', 'icons/*.png'],
      workbox: { 
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Google Fonts stylesheets + font files: cache-first, rarely change
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Product/receipt images (R2 + any https image): stale-while-revalidate
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'app-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Backend API reads: network-first so data stays fresh, with
            // cache fallback when offline. POST/PUT/DELETE are never cached
            // (method filter) so mutations always hit the network.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'api-get',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
