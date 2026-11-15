// Renders the app icons (web app manifest, iOS home screen) to public/icons/ with Playwright's
// Chromium. Run with `npm run icons` after changing the design, and commit the PNGs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const OUT = join(import.meta.dirname, '../public/icons')

const GREEN = '#2f6b3a' // --color-primary
const LEAF_GREEN = '#a8d5a2'

/** The leaf of public/favicon.svg and the header logo, on the same 32 × 32 grid. */
const LEAF =
  `<path d="M8 24C8 14 14 8 25 7c-1 11-7 17-17 17Z" fill="${LEAF_GREEN}"/>` +
  `<path d="M8 24 19 13" stroke="${GREEN}" stroke-width="1.8" stroke-linecap="round"/>`
/** Midpoint between the leaf's two tips, which the icons centre. */
const LEAF_CENTRE = { x: 16.5, y: 15.5 }

type Icon = {
  file: string
  size: number
  /** Rounded corners with transparency, or a full square for platforms that apply their own mask. */
  rounded: boolean
  leafScale: number
}

const ICONS: Icon[] = [
  { file: 'icon-192.png', size: 192, rounded: true, leafScale: 1 },
  { file: 'icon-512.png', size: 512, rounded: true, leafScale: 1 },
  // Maskable: the leaf stays inside the safe zone, a circle of 80% of the icon's size.
  { file: 'maskable-512.png', size: 512, rounded: false, leafScale: 0.9 },
  // iOS rounds the corners itself and shows transparent pixels as black.
  { file: 'apple-touch-icon.png', size: 180, rounded: false, leafScale: 0.9 },
]

function svg({ size, rounded, leafScale }: Icon): string {
  const background = `<rect width="32" height="32"${rounded ? ' rx="7"' : ''} fill="${GREEN}"/>`
  const transform = `translate(16 16) scale(${leafScale}) translate(${-LEAF_CENTRE.x} ${-LEAF_CENTRE.y})`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">` +
    `${background}<g transform="${transform}">${LEAF}</g></svg>`
  )
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } })
    await page.setContent(
      `<style>html, body { margin: 0; background: transparent; }</style>${svg(icon)}`,
    )
    const png = await page.screenshot({ omitBackground: true })
    writeFileSync(join(OUT, icon.file), png)
    console.log(`public/icons/${icon.file} (${icon.size} × ${icon.size})`)
    await page.close()
  }
} finally {
  await browser.close()
}
