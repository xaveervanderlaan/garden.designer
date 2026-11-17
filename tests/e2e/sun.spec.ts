import { type Page, expect, test } from '@playwright/test'
import { type Bounds, type Point, collectErrors, fitted, pixelAt, savedProject } from './helpers.ts'

/**
 * Sun and shadows at a moment (M11): the view bar's sun controls set a date and time, the shadow
 * layer draws the shadows on the plan, and the north arrow turns them. The sample garden has a
 * 1.8 m fence along its south edge (y = 15) and north is up, so at noon on 21 December (sun about
 * 14° high) its shadow reaches about 6.9 m into the garden, to y ≈ 8.1.
 */

const SAMPLE = 'tests/e2e/fixtures/sample.garden.json'
const PLOT: Bounds = { minX: 0, minY: 0, maxX: 20, maxY: 15 }

/** How much darker the plan is at `point` than at `reference` (sum of the RGB differences). */
async function darkerBy(page: Page, point: Point, reference: Point) {
  const a = await pixelAt(page, point)
  const b = await pixelAt(page, reference)
  return b.r + b.g + b.b - (a.r + a.g + a.b)
}

test('shows the shadows at a moment and turns them with the north arrow', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(SAMPLE)
  await page.getByRole('link', { name: 'Sample garden' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()

  // Noon on 21 December.
  await page.getByTestId('sun-toggle').click()
  await expect(page.getByTestId('sun-toggle')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '21 Dec' }).click()
  await page.getByRole('slider', { name: 'Time' }).fill('750')
  await expect(page.getByTestId('sun-time')).toHaveText('12:30')
  await expect(page.getByTestId('sun-position')).toContainText('14')

  // Two points on the bare plot (off the 0.5 m grid lines, away from the beds, the terrace and the
  // tree): one 2.7 m from the fence, in its shadow, and one 8.8 m away, in the sun.
  const view = await fitted(page, PLOT)
  const shaded = view.at(3.2, 12.3)
  const sunny = view.at(3.2, 6.2)
  await expect.poll(() => darkerBy(page, shaded, sunny)).toBeGreaterThan(40)

  // Turn north to point down: the sun is now in the north, and the shadow falls out of the plot.
  const arrow = page.getByRole('slider', { name: /north/i })
  await arrow.focus()
  for (let i = 0; i < 12; i++) await page.keyboard.press('Shift+ArrowRight')
  await expect(arrow).toHaveAttribute('aria-valuenow', '180')
  await expect.poll(async () => Math.abs(await darkerBy(page, shaded, sunny))).toBeLessThan(10)
  await expect
    .poll(async () => (await savedProject(page)).settings)
    .toMatchObject({ northAngleDeg: 180 })

  // Turning the arrow was one undo step: the shadow is back.
  await page.keyboard.press('Control+z')
  await expect(arrow).toHaveAttribute('aria-valuenow', '0')
  await expect.poll(() => darkerBy(page, shaded, sunny)).toBeGreaterThan(40)

  // Sun off: no shadows (the view bar may change height, so measure again).
  await page.getByTestId('sun-toggle').click()
  await expect(page.getByTestId('sun-toggle')).toHaveAttribute('aria-pressed', 'false')
  const after = await fitted(page, PLOT)
  await expect
    .poll(async () => Math.abs(await darkerBy(page, after.at(3.2, 12.3), after.at(3.2, 6.2))))
    .toBeLessThan(10)

  expect(errors).toEqual([])
})
