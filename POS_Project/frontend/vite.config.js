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
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      }
    },
  },
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.json',
      devOptions: { enabled: true },
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'POS System',
        short_name: 'POS',
        description: 'Point of Sale System',
        theme_color: '#EB0000',
        background_color: '#ffffff',
        display: 'fullscreen',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        id: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
      },
      workbox: { 
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
});
