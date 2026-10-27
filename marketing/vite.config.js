import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        // Landing page (prerendered for SEO).
        main: resolve(__dirname, 'index.html'),
        // License admin — a separate page, client-rendered, noindex.
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    port: 5180,
  },
})
