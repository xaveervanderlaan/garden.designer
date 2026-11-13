/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pdfjsAssets } from './scripts/vite-plugin-pdfjs-assets.ts'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<user>.github.io/garden.designer/ on GitHub Pages.
  base: '/garden.designer/',
  plugins: [react(), pdfjsAssets()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
