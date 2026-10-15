import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    // three.js plus its post-processing addons is ~600 kB minified
    chunkSizeWarningLimit: 800,
  },
})
