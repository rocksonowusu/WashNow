/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // The API address is baked into the app at build time. Without it the app
  // would deploy fine and then fail on every phone, so the build stops instead.
  // Set VITE_API_URL in web/.env locally, and as a *build* variable on Cloudflare.
  const { VITE_API_URL } = loadEnv(mode, process.cwd(), 'VITE_')
  if (command === 'build' && !VITE_API_URL) {
    throw new Error(
      'VITE_API_URL is not set, so the app would not know where the API is. ' +
        'On Cloudflare: Settings → Build → Variables and secrets → add VITE_API_URL. ' +
        'Locally: copy web/.env.example to web/.env.',
    )
  }

  return {
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
      // Tests never talk to a real server; this only lets the API module load
      // on machines without web/.env (such as GitHub's test runner).
      env: { VITE_API_URL: VITE_API_URL || 'http://api.test' },
    },
  }
})
