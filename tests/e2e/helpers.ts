import { type Page, expect } from '@playwright/test'

/** Must match fitBounds' default padding in src/geometry/viewport.ts. */
export const FIT_PADDING = 48

export type Point = { x: number; y: number }
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }
export type Background = {
  widthPx: number
  heightPx: number
  metresPerPixel: number
  offset: Point
  rotationDeg: number
}
/** A design as stored in IndexedDB; only the fields the tests look at are typed. */
export type SavedProject = Record<string, unknown> & {
  id: string
  name: string
  background?: Background & Record<string, unknown>
}

/** The test site plan, 600 × 400 px: a plot of 500 × 300 px and a 200 px scale bar for 10 m. */
export const IMAGE = { width: 600, height: 400 }
export const PLOT_PX = { left: 50, top: 50, right: 550, bottom: 350 }
export const BAR_PX = { from: { x: 50, y: 380 }, to: { x: 250, y: 380 } }

/** Collects console errors and uncaught exceptions; tests end with `expect(errors).toEqual([])`. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

/** Draws the test site plan in the browser and returns it as PNG bytes. */
export async function sitePlanPng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ image, plot, bar }) => {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, image.width, image.height)
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 3
      ctx.strokeRect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top)
      ctx.beginPath()
      ctx.moveTo(bar.from.x, bar.from.y)
      ctx.lineTo(bar.to.x, bar.to.y)
      for (const end of [bar.from, bar.to]) {
        ctx.moveTo(end.x, end.y - 8)
        ctx.lineTo(end.x, end.y + 8)
      }
      ctx.stroke()
      ctx.fillStyle = '#000000'
      ctx.font = '16px sans-serif'
      ctx.fillText('10 m', 130, 372)
      return canvas.toDataURL('image/png')
    },
    { image: IMAGE, plot: PLOT_PX, bar: BAR_PX },
  )
  return Buffer.from(dataUrl.split(',')[1]!, 'base64')
}

/** All records of an IndexedDB object store of the app's database. */
async function storedRecords<T>(page: Page, store: 'projects' | 'assets'): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('garden-designer')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const request = db.transaction(name).objectStore(name).getAll()
          request.onsuccess = () => {
            db.close()
            resolve(request.result as T[])
          }
          request.onerror = () => reject(request.error)
        }
      }),
    store,
  )
}

/** Every design as saved in IndexedDB (no waiting: in the editor, use `savedProject`). */
export function savedProjects(page: Page): Promise<SavedProject[]> {
  return storedRecords<SavedProject>(page, 'projects')
}

/** The ids of every stored asset (site plan images). */
export async function savedAssetIds(page: Page): Promise<string[]> {
  return (await storedRecords<{ id: string }>(page, 'assets')).map((asset) => asset.id)
}

/** The open design as saved in IndexedDB, once the autosave is done (the only design). */
export async function savedProject(page: Page): Promise<SavedProject> {
  await expect(page.getByRole('status').filter({ hasText: /saved/ })).toHaveText(
    'All changes saved',
  )
  return (await savedProjects(page))[0]!
}

/** Image pixel → world metres (same maths as geometry/calibration.ts). */
export function imageToWorld(bg: Background, p: Point): Point {
  const r = (bg.rotationDeg * Math.PI) / 180
  const x = p.x * bg.metresPerPixel
  const y = p.y * bg.metresPerPixel
  return {
    x: bg.offset.x + x * Math.cos(r) - y * Math.sin(r),
    y: bg.offset.y + x * Math.sin(r) + y * Math.cos(r),
  }
}

export function imageBounds(bg: Background): Bounds {
  const corners = [
    { x: 0, y: 0 },
    { x: bg.widthPx, y: 0 },
    { x: bg.widthPx, y: bg.heightPx },
    { x: 0, y: bg.heightPx },
  ].map((p) => imageToWorld(bg, p))
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

/**
 * Screen position of an image pixel after the view was fitted to the whole image. A fitted view
 * re-fits when a panel below the plan opens or closes: call this once the panels are settled.
 * The plan area is measured like the app does (`elementSize`: the layout box, floored).
 */
export async function imageOnScreen(page: Page, bg: Background) {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
  const box = (await page.getByTestId('plan-area').boundingBox())!
  const width = Math.floor(box.width)
  const height = Math.floor(box.height)
  const b = imageBounds(bg)
  const scale = Math.min(
    (width - 2 * FIT_PADDING) / (b.maxX - b.minX),
    (height - 2 * FIT_PADDING) / (b.maxY - b.minY),
  )
  const centre = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  return (pixel: Point): Point => {
    const world = imageToWorld(bg, pixel)
    return {
      x: box.x + width / 2 + (world.x - centre.x) * scale,
      y: box.y + height / 2 + (world.y - centre.y) * scale,
    }
  }
}

/** Opens a plant's detail card from the library (search, first result). */
export async function openPlant(page: Page, search: string) {
  const back = page.getByRole('button', { name: 'Back to the list' })
  if (await back.isVisible()) await back.click()
  await page.getByRole('searchbox', { name: 'Search plants' }).fill(search)
  await page.getByRole('list', { name: 'Plants' }).getByRole('button').first().click()
}

/** Waits two frames, so a re-fit after the plan area changed size has been drawn. */
export async function settled(page: Page) {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
}

/** Screen mapping after "zoom to fit" of `bounds` (call it once the panels are as they will be). */
export async function fitted(page: Page, bounds: Bounds) {
  await settled(page)
  const box = (await page.getByTestId('plan-area').boundingBox())!
  const width = Math.floor(box.width)
  const height = Math.floor(box.height)
  const w = bounds.maxX - bounds.minX
  const h = bounds.maxY - bounds.minY
  const scale = Math.min((width - 2 * FIT_PADDING) / w, (height - 2 * FIT_PADDING) / h)
  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  /** Screen position of a world point (metres). */
  const at = (x: number, y: number) => ({
    x: box.x + width / 2 + (x - centre.x) * scale,
    y: box.y + height / 2 + (y - centre.y) * scale,
  })
  return { at, scale }
}

/** The colour on screen at a point of the plan: all canvas layers over a white background. */
export async function pixelAt(page: Page, point: Point) {
  return page.evaluate(({ x, y }) => {
    const layers = [
      ...document.querySelectorAll<HTMLCanvasElement>('[data-testid="plan-area"] canvas'),
    ]
    const rect = layers[0]!.getBoundingClientRect()
    const ratio = layers[0]!.width / rect.width
    const out = document.createElement('canvas')
    out.width = layers[0]!.width
    out.height = layers[0]!.height
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    for (const layer of layers) ctx.drawImage(layer, 0, 0)
    const px = Math.round((x - rect.left) * ratio)
    const py = Math.round((y - rect.top) * ratio)
    const [r = 0, g = 0, b = 0] = ctx.getImageData(px, py, 1, 1).data
    return { r, g, b }
  }, point)
}
