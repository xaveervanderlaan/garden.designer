import { readFileSync } from 'node:fs'
import type { PluginOption } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * The PWA: a web app manifest and a Workbox service worker that precaches the whole built app, so
 * it installs and works offline. The worker is only built by `vite build`: nothing runs in dev or
 * in Vitest. The app registers it itself (`src/pwa/serviceWorker.ts`) and asks before updating.
 */

/** Every built file type the app may load. A file type missing here is not available offline. */
const PRECACHE_EXTENSIONS = [
  'html',
  'js',
  'mjs', // the pdf.js worker
  'css',
  'json',
  'webmanifest',
  'wasm', // pdf.js decoders
  'pfb', // pdf.js standard fonts
  'ttf',
  'otf',
  'woff2',
  'icc', // pdf.js colour profile
  'svg',
  'png',
  'ico',
]

/** Colours come from the design tokens in global.css, so the installed app matches the page. */
function cssToken(name: string): string {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8')
  const value = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})\\b`).exec(css)?.[1]
  if (!value) throw new Error(`Design token ${name} not found in src/styles/global.css`)
  return value
}

export function pwa(base: string): PluginOption {
  return VitePWA({
    disable: !!process.env.VITEST,
    strategies: 'generateSW',
    registerType: 'prompt', // a new version waits until the user chooses to reload
    injectRegister: false, // registered by src/pwa/serviceWorker.ts
    filename: 'sw.js',
    workbox: {
      globPatterns: [`**/*.{${PRECACHE_EXTENSIONS.join(',')}}`],
      // The largest file is the pdf.js worker (about 1.3 MB). A file over this limit fails the build.
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      navigateFallback: 'index.html', // hash routing: every page is index.html
      cleanupOutdatedCaches: true,
      clientsClaim: true, // control the page right after the first install
      skipWaiting: false, // updates wait for the user (SKIP_WAITING message)
      sourcemap: false,
    },
    manifest: {
      id: base,
      name: 'Garden Designer',
      short_name: 'Garden',
      description:
        'Design your garden: the plot, paving, beds and plants, with sun and shade. ' +
        'Works offline; your designs stay on your device.',
      lang: 'en',
      dir: 'ltr',
      start_url: base,
      scope: base,
      display: 'standalone',
      theme_color: cssToken('--color-primary'),
      background_color: cssToken('--color-bg'),
      categories: ['lifestyle', 'productivity'],
      // Rendered by scripts/render-icons.ts.
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
  })
}
