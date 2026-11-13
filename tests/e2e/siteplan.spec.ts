import { type Locator, type Page, expect, test } from '@playwright/test'

/** Must match fitBounds' default padding in the app. */
const FIT_PADDING = 48

type Point = { x: number; y: number }
type Bounds = { minX: number; minY: number; maxX: number; maxY: number }
type Background = {
  widthPx: number
  heightPx: number
  metresPerPixel: number
  offset: Point
  rotationDeg: number
}

/** The test site plan, 600 × 400 px: a plot of 500 × 300 px and a 200 px scale bar for 10 m. */
const IMAGE = { width: 600, height: 400 }
const PLOT_PX = { left: 50, top: 50, right: 550, bottom: 350 }
const BAR_PX = { from: { x: 50, y: 380 }, to: { x: 250, y: 380 } }

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

async function newDesign(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'New design' }).click()
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()
}

/** Draws the test site plan in the browser and returns it as PNG bytes. */
async function sitePlanPng(page: Page): Promise<Buffer> {
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

/**
 * A minimal PDF with one page per entry, each filled with a single colour (r g b, 0–1) and with a
 * line of text in Helvetica, a standard font that isn't embedded (pdf.js must find it locally).
 */
function colourPdf(pages: Array<{ width: number; height: number; rgb: string }>): Buffer {
  const objects: string[] = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  const kids = pages.map((page, i) => {
    const pageId = 4 + 2 * i
    const content =
      `${page.rgb} rg 0 0 ${page.width} ${page.height} re f ` +
      `1 1 1 rg BT /F1 12 Tf 8 8 Td (Kavel 12) Tj ET`
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`
    objects[pageId + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    return `${pageId} 0 R`
  })
  objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

/** The design as saved in IndexedDB (after the autosave). */
async function savedProject(
  page: Page,
): Promise<{ background?: Background & Record<string, unknown> }> {
  await expect(page.getByRole('status').filter({ hasText: /saved/ })).toHaveText(
    'All changes saved',
  )
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('garden-designer')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const request = db.transaction('projects').objectStore('projects').getAll()
          request.onsuccess = () => {
            db.close()
            resolve(request.result[0])
          }
          request.onerror = () => reject(request.error)
        }
      }),
  )
}

/** Image pixel → world metres (same maths as geometry/calibration.ts). */
function imageToWorld(bg: Background, p: Point): Point {
  const r = (bg.rotationDeg * Math.PI) / 180
  const x = p.x * bg.metresPerPixel
  const y = p.y * bg.metresPerPixel
  return {
    x: bg.offset.x + x * Math.cos(r) - y * Math.sin(r),
    y: bg.offset.y + x * Math.sin(r) + y * Math.cos(r),
  }
}

function imageBounds(bg: Background): Bounds {
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
 */
async function imageOnScreen(page: Page, bg: Background) {
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

/** RGBA of a layer canvas at a screen position. */
async function pixel(canvas: Locator, at: Point): Promise<number[]> {
  return canvas.evaluate((element, p) => {
    const el = element as HTMLCanvasElement
    const rect = el.getBoundingClientRect()
    const ratio = el.width / rect.width
    const x = Math.round((p.x - rect.left) * ratio)
    const y = Math.round((p.y - rect.top) * ratio)
    return Array.from(el.getContext('2d')!.getImageData(x, y, 1, 1).data)
  }, at)
}

const area = (page: Page) => page.getByTestId('plot-area')
const shownNumber = async (locator: Locator) =>
  Number((await locator.textContent())!.replace(/[^0-9.]/g, ''))

test('imports a site plan, calibrates it with a 10 m line and traces the plot', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await newDesign(page)
  const png = await sitePlanPng(page)

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('toolbar').getByRole('button', { name: 'Import site plan' }).click()
  await (await chooser).setFiles({ name: 'site-plan.png', mimeType: 'image/png', buffer: png })

  // Straight into calibrating; until then the image is 50 m wide.
  const panel = page.getByTestId('calibration-panel')
  await expect(panel.getByRole('status')).toContainText('click the start of a distance')
  let bg = (await savedProject(page)).background!
  expect(bg).toMatchObject({ widthPx: 600, heightPx: 400, fileName: 'site-plan.png' })
  expect(bg.metresPerPixel).toBeCloseTo(50 / 600)

  // Click both ends of the scale bar and type its length.
  let at = await imageOnScreen(page, bg)
  for (const end of [BAR_PX.from, BAR_PX.to]) {
    const p = at(end)
    await page.mouse.click(p.x, p.y)
  }
  await expect(panel.getByRole('status')).toHaveText('Type the real distance and press Enter.')
  await page.keyboard.type('10')
  await page.keyboard.press('Enter')
  await expect(panel).toBeHidden()
  await expect(page.getByTestId('site-plan-calibration')).toHaveText('10.00 m')

  // 200 px = 10 m: 5 cm per pixel (clicks land within about half a pixel).
  bg = (await savedProject(page)).background!
  expect(Math.abs(bg.metresPerPixel / 0.05 - 1)).toBeLessThan(0.01)
  await expect(page.getByTestId('site-plan-size')).toHaveText(/^30\.\d\sm × 20\.\d\sm$/)

  // Lock it, so tracing can't move it, and trace the plot by clicking its corners.
  await page.getByRole('button', { name: 'Lock in place' }).click()
  await page.keyboard.press('p')
  await expect(page.getByTestId('drawing-panel')).toBeVisible()
  at = await imageOnScreen(page, bg)
  const { left, top, right, bottom } = PLOT_PX
  for (const corner of [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top }, // closes the outline
  ]) {
    const p = at(corner)
    await page.mouse.click(p.x, p.y)
  }
  // 500 × 300 px at the calibrated scale: about 25 × 15 m.
  const expected = 500 * 300 * bg.metresPerPixel ** 2
  expect(Math.abs((await shownNumber(area(page))) / expected - 1)).toBeLessThan(0.005)

  // Saved with the design, image and all.
  await page.reload()
  await page.getByRole('button', { name: 'Edit site plan' }).click()
  await expect(page.getByTestId('site-plan-calibration')).toHaveText('10.00 m')
  expect(errors).toEqual([])
})

test('imports the chosen page of a PDF, rendered locally without outside requests', async ({
  page,
}) => {
  const errors = collectErrors(page)
  const outside: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (!/^(http:\/\/localhost:4173\/|data:|blob:)/.test(url)) outside.push(url)
  })
  await newDesign(page)

  await page.getByTestId('site-plan-input').setInputFiles({
    name: 'site-plan.pdf',
    mimeType: 'application/pdf',
    buffer: colourPdf([
      { width: 200, height: 100, rgb: '1 0 0' }, // red
      { width: 300, height: 150, rgb: '0 0 1' }, // blue
    ]),
  })
  const dialog = page.getByRole('dialog', { name: 'Choose a page' })
  await expect(dialog).toContainText('site-plan.pdf has 2 pages')
  await expect(dialog.getByRole('button', { name: /^Page \d$/ })).toHaveCount(2)
  await dialog.getByRole('button', { name: 'Page 2' }).click()
  await expect(dialog).toBeHidden()

  // Skip calibrating for now.
  await expect(page.getByTestId('calibration-panel')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('calibration-panel')).toBeHidden()

  // Page 2 (300 × 150 pt) rendered at 300 dpi.
  const bg = (await savedProject(page)).background!
  expect(bg).toMatchObject({ widthPx: 1250, heightPx: 625, page: 2, fileName: 'site-plan.pdf' })
  await page.getByRole('button', { name: 'Edit site plan' }).click()
  await expect(page.getByText('site-plan.pdf, page 2')).toBeVisible()

  // It shows the blue page: zoom to fit centres it, and its layer is the second canvas.
  await page.keyboard.press('0')
  const box = (await page.getByTestId('plan-area').boundingBox())!
  const sitePlanLayer = page.getByTestId('plan-area').locator('canvas').nth(1)
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await expect
    .poll(() => pixel(sitePlanLayer, centre))
    .toEqual([0, 0, 255, expect.any(Number)] as unknown as number[])

  expect(outside).toEqual([])
  expect(errors).toEqual([])
})

test('explains when a file cannot be used', async ({ page }) => {
  const errors = collectErrors(page)
  await newDesign(page)
  const input = page.getByTestId('site-plan-input')
  const dialog = page.getByRole('dialog', { name: 'Import site plan' })

  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
  await expect(dialog.getByRole('alert')).toContainText('can’t be used')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()

  await input.setInputFiles({
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('not a pdf'),
  })
  await expect(dialog.getByRole('alert')).toContainText('couldn’t be read')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('calibration-panel')).toBeHidden()
  expect(errors).toEqual([])
})
