import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: { port: 5173, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    // Minimal manifest for now. PNG icons (192, 512, maskable 512) and the
    // offline caching strategy are added in Stage 4.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'WashNow',
        short_name: 'WashNow',
        description: 'Sales record book for the washing bay',
        theme_color: '#155EA6',
        background_color: '#F4F6F7',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/brand/washnow-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
})
