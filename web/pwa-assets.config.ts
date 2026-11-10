import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Run `npm run icons` after changing public/brand/washnow-icon.svg.
// Writes the PNG icons next to the SVG, on the DESIGN.md background colour.
const background = '#F4F6F7'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background },
    },
  },
  images: ['public/brand/washnow-icon.svg'],
})
