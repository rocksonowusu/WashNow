/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: { port: 5173, strictPort: true },
  // `npm run preview` serves the production build, service worker included.
  // This is the one to use for testing offline.
  preview: { port: 4173, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version installs itself the next time the app is opened online.
      registerType: 'autoUpdate',
      includeAssets: ['brand/*.svg', 'brand/*.png', 'brand/favicon.ico'],
      manifest: {
        name: 'WashNow',
        short_name: 'WashNow',
        description: 'Sales record book for the washing bay. Works without internet.',
        lang: 'en',
        theme_color: '#155EA6',
        background_color: '#F4F6F7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/brand/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/brand/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/brand/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/brand/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The whole app shell, fonts included, is stored on the device at
        // install, so it opens with no internet. API calls are never cached:
        // offline data comes from the on-device database instead.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
