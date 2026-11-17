import { type Page, expect, test } from '@playwright/test'
import { FIT_PADDING, type Point, collectErrors, savedProject } from './helpers.ts'

/**
 * Measuring and layers (M10). The sample design has a 20 × 15 m plot (grid 0.5 m, snapping on)
 * with a bed at x 1–6, y 1–3 and a terrace at x 7–13, y 5–10; the measurement runs left of it.
 */
const SAMPLE = 'tests/e2e/fixtures/sample.garden.json'

type SavedObject = {
  id: string
  kind: string
  layer: string
  shape: { type: string; points: Point[] }
}

/** Waits two frames, so a re-fit after the plan area changed size has been drawn. */
async function settled(page: Page) {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
}

/** Screen position of a world point (metres) after "zoom to fit" of the 20 × 15 m plot. */
async function fitted(page: Page) {
  await settled(page)
  const box = (await page.getByTestId('plan-area').boundingBox())!
  const width = Math.floor(box.width)
  const height = Math.floor(box.height)
  const scale = Math.min((width - 2 * FIT_PADDING) / 20, (height - 2 * FIT_PADDING) / 15)
  return (x: number, y: number) => ({
    x: box.x + width / 2 + (x - 10) * scale,
    y: box.y + height / 2 + (y - 7.5) * scale,
  })
}

const savedObjects = async (page: Page) =>
  (await savedProject(page)).objects as unknown as SavedObject[]

type SavedLayers = Record<string, { visible: boolean; locked: boolean }>
const savedLayers = async (page: Page) => (await savedProject(page)).layers as SavedLayers

async function openSample(page: Page) {
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(SAMPLE)
  await page.getByRole('link', { name: 'Sample garden' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()
}

test('measures a distance and keeps it as a dimension', async ({ page }) => {
  const errors = collectErrors(page)
  await openSample(page)

  await page.getByRole('button', { name: 'Measure', exact: true }).click()
  const panel = page.getByTestId('drawing-panel')
  await expect(panel).toBeVisible()
  // The panel shrinks the plan and the fitted view re-fits; the first click ends the fit.
  const at = await fitted(page)
  for (const [x, y] of [
    [2, 5],
    [2, 12],
    [6, 12],
  ] as const) {
    const point = at(x, y)
    await page.mouse.click(point.x, point.y)
  }
  await expect(page.getByTestId('measure-total')).toHaveText(/^11[.,]00\sm$/)
  await panel.getByRole('button', { name: 'Keep as dimension' }).click()
  await expect(panel).toBeHidden()

  await expect
    .poll(async () => {
      const dimension = (await savedObjects(page)).find((o) => o.kind === 'dimension')
      return dimension && { layer: dimension.layer, points: dimension.shape.points }
    })
    .toEqual({
      layer: 'measurements',
      points: [
        { x: 2, y: 5 },
        { x: 2, y: 12 },
        { x: 6, y: 12 },
      ],
    })
  const length = page.getByTestId('object-length')
  await expect(length).toHaveText(/11\.00\sm/)

  // A locked measurements layer can't be selected; unlocked, it can again.
  await page.keyboard.press('Escape')
  await expect(length).toHaveCount(0)
  await page.getByRole('button', { name: 'Lock Measurements' }).click()
  const line = at(2, 8.5)
  await settled(page)
  await page.mouse.click(line.x, line.y)
  await settled(page)
  await expect(length).toHaveCount(0)
  await page.getByRole('button', { name: 'Unlock Measurements' }).click()
  await expect
    .poll(async () => {
      await page.mouse.click(line.x, line.y)
      return length.count()
    })
    .toBe(1)

  expect(errors).toEqual([])
})

test('hides and locks layers', async ({ page }) => {
  const errors = collectErrors(page)
  await openSample(page)

  const at = await fitted(page)
  const terrace = at(10, 7.5)
  const kind = page.getByTestId('item-kind')
  const clickTerrace = async () => {
    await page.mouse.click(terrace.x, terrace.y)
    return (await kind.count()) ? kind.inputValue() : null
  }
  await expect.poll(clickTerrace).toBe('terrace')
  await page.keyboard.press('Escape')
  await expect(kind).toHaveCount(0)

  // Locked: visible, but clicks pass through.
  await page.getByRole('button', { name: 'Lock Hardscape & structures' }).click()
  await settled(page)
  expect(await clickTerrace()).toBeNull()
  await expect.poll(async () => (await savedLayers(page)).hardscape?.locked).toBe(true)
  await page.getByRole('button', { name: 'Unlock Hardscape & structures' }).click()

  // Hidden: not drawn and not selectable.
  await page.getByRole('button', { name: 'Hide Hardscape & structures' }).click()
  await expect(page.getByRole('button', { name: 'Show Hardscape & structures' })).toBeVisible()
  await settled(page)
  expect(await clickTerrace()).toBeNull()
  await page.getByRole('button', { name: 'Show Hardscape & structures' }).click()
  await expect.poll(clickTerrace).toBe('terrace')

  // Area labels are a saved design setting.
  await page.getByTestId('area-labels-toggle').check()
  await expect
    .poll(async () => (await savedProject(page)).settings as { areaLabels?: boolean })
    .toMatchObject({ areaLabels: true })

  expect(errors).toEqual([])
})
