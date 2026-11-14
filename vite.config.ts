import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:phone` imposta HTTPS=1: serve per provare la geolocalizzazione
// dall'iPhone sulla rete locale (Safari la consente solo su HTTPS).
const useHttps = process.env.HTTPS === '1';

export default defineConfig({
  base: './',
  plugins: [
    ...(useHttps ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'maplibre/*.mjs'],
      manifest: {
        name: 'Benzinai',
        short_name: 'Benzinai',
        description: 'Prezzi dei carburanti vicino a te',
        lang: 'it',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f766e',
        theme_color: '#0f766e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            // Dati dei prezzi: mostra subito la cache e aggiorna in background.
            urlPattern: ({ url }) => url.pathname.includes('/data/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'prezzi' },
          },
          {
            // Tile e stili della mappa (e immagini satellitari).
            urlPattern: ({ url }) =>
              url.hostname === 'tiles.openfreemap.org' || url.hostname === 'server.arcgisonline.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'mappa',
              expiration: { maxEntries: 600, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
