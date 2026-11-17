import { inflateSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import { type Page, expect, test } from '@playwright/test'
import { collectErrors, settled } from './helpers.ts'

/** Image and PDF export (M16): the files are checked byte by byte, no fixtures. */

const SAMPLE = 'tests/e2e/fixtures/sample.garden.json'

/** Opens the export dialog, exports with its current choices and returns the saved file. */
async function exportFile(page: Page): Promise<{ name: string; bytes: Buffer }> {
  await page.getByRole('button', { name: 'Export image or PDF' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export' })
  await dialog.getByRole('radio', { name: 'PNG image' }).check()
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const file = await download
  await expect(dialog).toBeHidden()
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) }
}

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (bytes: Buffer) => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
})

/** Decodes the PNG in the page and counts the pixels that aren't (nearly) white. */
function nonWhitePixels(page: Page, bytes: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([data], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
    let count = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i]! < 245 || pixels[i + 1]! < 245 || pixels[i + 2]! < 245) count++
    }
    return count
  }, bytes.toString('base64'))
}

test('exports a PNG of the whole plan that follows the visible layers', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(SAMPLE)
  await page.getByRole('link', { name: 'Sample garden' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()
  await settled(page)
  const box = (await page.getByTestId('plan-area').boundingBox())!

  // The default: the whole plan at 2× the plan area's size on screen.
  const png = await exportFile(page)
  expect(png.name).toBe('sample-garden-plan.png')
  expect([...png.bytes.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG')
  const size = pngSize(png.bytes)
  expect(Math.abs(size.width - Math.floor(box.width) * 2)).toBeLessThanOrEqual(1)
  expect(Math.abs(size.height - Math.floor(box.height) * 2)).toBeLessThanOrEqual(1)
  const withPlants = await nonWhitePixels(page, png.bytes)
  expect(withPlants).toBeGreaterThan(0)

  // Hiding the beds and plants takes them out of the image.
  await page.getByRole('button', { name: 'Hide Beds & plants' }).click()
  const withoutPlants = await nonWhitePixels(page, (await exportFile(page)).bytes)
  expect(withoutPlants).toBeLessThan(withPlants)

  expect(errors).toEqual([])
})

/** The decoded text of every compressed content stream in the PDF (for text checks). */
function pdfStreamsText(bytes: Buffer): string {
  const latin = bytes.toString('latin1')
  let out = ''
  for (const m of latin.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length
    const end = latin.indexOf('endstream', start)
    if (end < 0) continue
    try {
      out += inflateSync(bytes.subarray(start, end)).toString('latin1')
    } catch {
      // images (JPEG) and other streams that aren't Flate data
    }
  }
  return out
}

test('exports a two-page PDF at the suggested scale', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(SAMPLE)
  await page.getByRole('link', { name: 'Sample garden' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()
  await settled(page)

  await page.getByRole('button', { name: 'Export image or PDF' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export' })
  await expect(dialog.getByRole('radio', { name: 'PDF for printing' })).toBeChecked()
  await dialog.getByLabel('Paper').selectOption('A4')
  await dialog.getByLabel('Orientation').selectOption({ label: 'Landscape' })
  const suggested = await dialog.getByLabel('Scale').locator('option', { hasText: '(suggested)' })
  const scale = /1:(\d+)/.exec((await suggested.textContent()) ?? '')![1]!
  await expect(dialog.getByRole('alert')).toBeHidden()

  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const file = await download
  await expect(dialog).toBeHidden()
  expect(file.suggestedFilename()).toBe(`sample-garden-a4-1-${scale}.pdf`)
  const bytes = await readFile((await file.path())!)
  const raw = bytes.toString('latin1')

  expect(raw.startsWith('%PDF-')).toBe(true)
  expect([...raw.matchAll(/\/Type\s*\/Page\b(?!s)/g)].length).toBe(2)
  const boxes = [...raw.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((m) =>
    m[1]!.trim().split(/\s+/).map(Number),
  )
  // Page 1 is A4 landscape, the legend and list page A4 portrait (in points).
  expect(boxes[0]![2]).toBeCloseTo(841.89, 0)
  expect(boxes[0]![3]).toBeCloseTo(595.28, 0)
  const portrait = boxes.find((b) => b[2]! < b[3]!)!
  expect(portrait[2]).toBeCloseTo(595.28, 0)
  expect(portrait[3]).toBeCloseTo(841.89, 0)

  // The plan JPEG plus the legend swatches.
  const images = [...raw.matchAll(/\/Subtype\s*\/Image/g)].length
  expect(images).toBeGreaterThan(1)
  expect(raw).toContain('/DCTDecode')

  const text = pdfStreamsText(bytes)
  expect(text).toContain('Legend')
  expect(text).toContain('Planting list')

  // At 1:50 the plan no longer fits the page and the dialog warns.
  await page.getByRole('button', { name: 'Export image or PDF' }).click()
  await dialog.getByLabel('Scale').selectOption({ label: '1:50' })
  await expect(dialog.getByRole('alert')).toContainText('cut off')

  expect(errors).toEqual([])
})
