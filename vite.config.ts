/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pdfjsAssets } from './scripts/vite-plugin-pdfjs-assets.ts'
import { pwa } from './scripts/vite-pwa.ts'

// Served from https://<user>.github.io/garden.designer/ on GitHub Pages.
const BASE = '/garden.designer/'

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  plugins: [react(), pdfjsAssets(), pwa(BASE)],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
